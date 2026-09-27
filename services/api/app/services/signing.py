"""
Signed receipts (system_design.md §8).

Token: RCPT1.<base64url(canonical JSON payload)>.<base64url(Ed25519 signature)>
Purchase receipts (M7) use the same keys with the prefix MG1 and a payload that
binds the payment to the shopper's mandate, the seller's cart, the gate version
and the agent version.
Development keeps private keys in the database; production swaps this module's
key access for a KMS adapter so private keys never leave the KMS.
"""

import base64
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.formatting import now
from app.models import Receipt, SigningKey, Transfer

TOKEN_PREFIX = "RCPT1"
PURCHASE_PREFIX = "MG1"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def payee_hash(account_id: str) -> str:
    digest = hashlib.sha256((get_settings().payee_hash_salt + account_id).encode()).hexdigest()
    return "h:" + digest[:16]


def payee_ref(t: Transfer) -> str:
    """What the receipt binds the payee to: our account ID, or "<bank>:<account number>" at another bank."""
    if t.rail == "interbank" and t.counterparty_bank_code and t.payee_account_id == "acct_network":
        return f"{t.counterparty_bank_code}:{t.counterparty_account_number}"
    return t.payee_account_id


def canonical_payload(tx: str, amount_minor: int, currency: str, payee_reference: str, created_at: datetime, kid: str) -> bytes:
    payload = {
        "v": 1,
        "tx": tx,
        "amt": amount_minor,
        "ccy": currency,
        "to": payee_hash(payee_reference),
        "ts": created_at.isoformat(),
        "kid": kid,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def _canonical(payload: dict) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def purchase_payload(*, purchase_id: str, tx: str, amount_minor: int, currency: str, seller_id: str, payee_reference: str,
                     mandate_hash: str, cart_hash: str, gate_version: str, agent_version: str, created_at: datetime, kid: str) -> bytes:
    """What a purchase receipt signs. The payee is hashed, so a receipt doesn't reveal the seller's account number."""
    return _canonical({
        "v": 1, "p": purchase_id, "tx": tx, "amt": amount_minor, "ccy": currency, "seller": seller_id, "to": payee_hash(payee_reference),
        "m": mandate_hash, "c": cart_hash, "g": gate_version, "a": agent_version, "ts": created_at.isoformat(), "kid": kid,
    })


def sign_purchase(db: Session, **fields) -> tuple[str, str]:
    """Signs a purchase receipt with the active key. Returns (token, kid)."""
    key = active_key(db)
    return _sign(purchase_payload(**fields, kid=key.kid), key.private_key_pem or "", PURCHASE_PREFIX), key.kid


def _generate_key(kid: str) -> SigningKey:
    private = Ed25519PrivateKey.generate()
    return SigningKey(
        kid=kid,
        private_key_pem=private.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        ).decode(),
        public_key_pem=private.public_key()
        .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        .decode(),
        status="active",
    )


def active_key(db: Session) -> SigningKey:
    key = db.scalar(select(SigningKey).where(SigningKey.status == "active").order_by(SigningKey.created_at.desc()))
    if key is None:
        key = _generate_key(f"rk-{now():%Y-%m}")
        db.add(key)
        db.flush()
    return key


def _sign(payload: bytes, private_key_pem: str, prefix: str = TOKEN_PREFIX) -> str:
    private = serialization.load_pem_private_key(private_key_pem.encode(), password=None)
    assert isinstance(private, Ed25519PrivateKey)
    return f"{prefix}.{_b64(payload)}.{_b64(private.sign(payload))}"


def issue_receipt(db: Session, t: Transfer) -> Receipt:
    """Signs the receipt when the transfer is created (§5.2). Status is never in the token."""
    key = active_key(db)
    payload = canonical_payload(t.tx, t.amount_minor, t.currency, payee_ref(t), t.created_at, key.kid)
    receipt = Receipt(tx=t.tx, token=_sign(payload, key.private_key_pem or ""), kid=key.kid, issued_at=t.created_at)
    db.add(receipt)
    db.flush()
    return receipt


def forge_receipt(payload: bytes) -> str:
    """Sandbox only: sign with a throwaway key the platform never issued."""
    return _sign(payload, _generate_key("forged").private_key_pem or "")


@dataclass(frozen=True)
class ParsedToken:
    payload: dict
    payload_bytes: bytes
    signature: bytes


def parse_token(token: str, prefix: str = TOKEN_PREFIX) -> ParsedToken | None:
    parts = token.strip().split(".")
    if len(parts) != 3 or parts[0] != prefix:
        return None
    try:
        payload_bytes = _unb64(parts[1])
        payload = json.loads(payload_bytes)
        signature = _unb64(parts[2])
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict) or payload.get("v") != 1 or not isinstance(payload.get("tx"), str):
        return None
    return ParsedToken(payload=payload, payload_bytes=payload_bytes, signature=signature)


def verify_signature(db: Session, parsed: ParsedToken) -> str:
    """Returns 'pass', 'unknown_kid' (unknown or revoked key) or 'fail'."""
    key = db.get(SigningKey, str(parsed.payload.get("kid")))
    if key is None or key.status == "revoked":
        return "unknown_kid"
    public = serialization.load_pem_public_key(key.public_key_pem.encode())
    assert isinstance(public, Ed25519PublicKey)
    try:
        public.verify(parsed.signature, parsed.payload_bytes)
    except InvalidSignature:
        return "fail"
    return "pass"


def jwks(db: Session) -> dict:
    keys = []
    for key in db.scalars(select(SigningKey).where(SigningKey.status != "revoked")):
        public = serialization.load_pem_public_key(key.public_key_pem.encode())
        raw = public.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        keys.append({"kty": "OKP", "crv": "Ed25519", "x": _b64(raw), "kid": key.kid, "use": "sig", "alg": "EdDSA", "status": key.status})
    return {"keys": keys}
