"""
Passkeys (WebAuthn) for signing mandates (M6) and approving payments (M7).

Keycloak signs people in; it can't sign arbitrary data. So shoppers register a
passkey with the platform, and signing is a WebAuthn assertion whose challenge
commits to exactly what is approved:

    mandate:  challenge = SHA-256("mandate-gate/mandate/v1" ‖ mandate_hash ‖ nonce)
    cart:     challenge = SHA-256("mandate-gate/cart/v1"    ‖ cart_hash    ‖ nonce)

mandate_hash is the SHA-256 of the canonical {mode, limits}; cart_hash is the
SHA-256 of the seller-signed cart; nonce is random per signing. The different
prefixes mean a mandate signature can never be replayed as a payment approval.
The raw assertion is stored, so anyone can later recompute the hash and check
the signature with the stored public key.
"""

import base64
import hashlib
import json
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.exceptions import InvalidAuthenticationResponse, InvalidRegistrationResponse
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.config import get_settings
from app.errors import ApiError
from app.formatting import now
from app.models import Passkey
from app.redis_client import get_redis
from app.security import Viewer

CHALLENGE_TTL_S = 300
DOMAINS = {"mandate": b"mandate-gate/mandate/v1", "cart": b"mandate-gate/cart/v1"}
CHANGED = {
    "mandate": ("mandate_changed", "The limits changed after you started signing. Review them and sign again."),
    "cart": ("cart_changed", "The cart changed after you started approving. Review it and approve again."),
}


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def unb64url(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _origin() -> str:
    return get_settings().public_web_url.rstrip("/")


def list_for(db: Session, user_id: str) -> list[Passkey]:
    return list(db.scalars(select(Passkey).where(Passkey.user_id == user_id).order_by(Passkey.created_at)))


# ---- Registration ---------------------------------------------------------------------------------------


def registration_options(db: Session, viewer: Viewer) -> dict:
    s = get_settings()
    options = generate_registration_options(
        rp_id=s.webauthn_rp_id, rp_name=s.webauthn_rp_name,
        user_id=viewer.user.id.encode(), user_name=viewer.user.username, user_display_name=viewer.user.display_name,
        authenticator_selection=AuthenticatorSelectionCriteria(resident_key=ResidentKeyRequirement.PREFERRED,
                                                               user_verification=UserVerificationRequirement.REQUIRED),
        exclude_credentials=[PublicKeyCredentialDescriptor(id=unb64url(p.credential_id)) for p in list_for(db, viewer.user.id)],
    )
    challenge_id = secrets.token_urlsafe(16)
    get_redis().set(f"webauthn:reg:{challenge_id}", json.dumps({"user": viewer.user.id, "challenge": b64url(options.challenge)}), ex=CHALLENGE_TTL_S)
    return {"challengeId": challenge_id, "publicKey": json.loads(options_to_json(options))}


def register(db: Session, viewer: Viewer, challenge_id: str, credential: dict, name: str) -> Passkey:
    stored = get_redis().getdel(f"webauthn:reg:{challenge_id}")
    if not stored or json.loads(stored)["user"] != viewer.user.id:
        raise ApiError(400, "challenge_expired", "That passkey request expired. Try again.")
    try:
        verified = verify_registration_response(
            credential=credential, expected_challenge=unb64url(json.loads(stored)["challenge"]),
            expected_rp_id=get_settings().webauthn_rp_id, expected_origin=_origin(), require_user_verification=True,
        )
    except InvalidRegistrationResponse as exc:
        raise ApiError(400, "passkey_invalid", f"The passkey couldn't be verified: {exc}") from exc
    passkey = Passkey(
        user_id=viewer.user.id, credential_id=b64url(verified.credential_id), public_key=b64url(verified.credential_public_key),
        sign_count=verified.sign_count, name=(name or "Passkey").strip()[:80], transports=credential.get("response", {}).get("transports"),
    )
    db.add(passkey)
    db.commit()
    return passkey


def remove(db: Session, viewer: Viewer, passkey_id: int) -> None:
    p = db.get(Passkey, passkey_id)
    if p is None or p.user_id != viewer.user.id:
        raise ApiError(404, "not_found", "Passkey not found.")
    from app.models import Mandate  # Local import to keep this module's imports about WebAuthn.

    from app.models import Purchase

    if db.scalar(select(Mandate.id).where(Mandate.passkey_id == p.id).limit(1)) or db.scalar(select(Purchase.id).where(Purchase.passkey_id == p.id).limit(1)):
        raise ApiError(409, "passkey_in_use", "This passkey signed mandates or approved payments, which must stay verifiable. It can't be removed.")
    db.delete(p)
    db.commit()


# ---- Signing a mandate or approving a cart --------------------------------------------------------------


def challenge_for(digest: str, nonce: bytes, purpose: str = "mandate") -> bytes:
    return hashlib.sha256(DOMAINS[purpose] + bytes.fromhex(digest) + nonce).digest()


def signing_options(db: Session, viewer: Viewer, digest: str, purpose: str = "mandate") -> dict:
    """Options for navigator.credentials.get(), with a challenge that commits to this exact mandate or cart."""
    keys = list_for(db, viewer.user.id)
    if not keys:
        raise ApiError(409, "no_passkey", "Create a passkey first.")
    nonce = secrets.token_bytes(16)
    options = generate_authentication_options(
        rp_id=get_settings().webauthn_rp_id, challenge=challenge_for(digest, nonce, purpose),
        allow_credentials=[PublicKeyCredentialDescriptor(id=unb64url(p.credential_id)) for p in keys],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    challenge_id = secrets.token_urlsafe(16)
    record = {"user": viewer.user.id, "purpose": purpose, "hash": digest, "nonce": b64url(nonce)}
    get_redis().set(f"webauthn:sign:{challenge_id}", json.dumps(record), ex=CHALLENGE_TTL_S)
    return {"challengeId": challenge_id, f"{purpose}Hash": digest, "publicKey": json.loads(options_to_json(options))}


def verify_signature(db: Session, viewer: Viewer, challenge_id: str, credential: dict, digest: str,
                     purpose: str = "mandate") -> tuple[Passkey, dict]:
    """Checks the assertion signs this exact mandate or cart. Returns the passkey and the evidence to store."""
    stored = get_redis().getdel(f"webauthn:sign:{challenge_id}")
    if not stored:
        raise ApiError(400, "challenge_expired", "The approval expired. Sign again.")
    record = json.loads(stored)
    if record["user"] != viewer.user.id:
        raise ApiError(403, "forbidden", "That approval belongs to someone else.")
    if record.get("purpose", "mandate") != purpose or record["hash"] != digest:
        raise ApiError(409, *CHANGED[purpose])
    passkey = db.scalar(select(Passkey).where(Passkey.credential_id == credential.get("id"), Passkey.user_id == viewer.user.id))
    if passkey is None:
        raise ApiError(400, "unknown_passkey", "That passkey isn't registered to your account.")
    nonce = unb64url(record["nonce"])
    try:
        verified = verify_authentication_response(
            credential=credential, expected_challenge=challenge_for(digest, nonce, purpose), expected_rp_id=get_settings().webauthn_rp_id,
            expected_origin=_origin(), credential_public_key=unb64url(passkey.public_key),
            credential_current_sign_count=passkey.sign_count, require_user_verification=True,
        )
    except InvalidAuthenticationResponse as exc:
        raise ApiError(400, "signature_invalid", f"The passkey signature didn't verify: {exc}") from exc
    passkey.sign_count, passkey.last_used_at = verified.new_sign_count, now()
    evidence = {"kind": "passkey", "purpose": purpose, "credentialId": passkey.credential_id, "nonce": record["nonce"], "rpId": get_settings().webauthn_rp_id,
                "origin": _origin(), "credential": credential}
    return passkey, evidence


def reverify(assertion_json: str, digest: str, public_key_b64: str, purpose: str = "mandate") -> bool:
    """Re-checks a stored mandate signature or payment approval from scratch (audit, disputes, receipts)."""
    try:
        evidence = json.loads(assertion_json)
        if evidence.get("kind") != "passkey" or evidence.get("purpose", "mandate") != purpose:
            return False
        verify_authentication_response(
            credential=evidence["credential"], expected_challenge=challenge_for(digest, unb64url(evidence["nonce"]), purpose),
            expected_rp_id=evidence["rpId"], expected_origin=evidence["origin"], credential_public_key=unb64url(public_key_b64),
            credential_current_sign_count=0, require_user_verification=True,
        )
        return True
    except (ValueError, KeyError, InvalidAuthenticationResponse):
        return False
