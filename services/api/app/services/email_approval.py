"""
Approving a payment with a one-time code sent to the shopper's email: the fallback
when a passkey isn't available on this device.

It's weaker than a passkey (anyone who controls the email account can approve, and
the proof is the platform's word rather than the shopper's own signature), so:
  - it only covers carts up to EMAIL_APPROVAL_MAX_MINOR (₦50,000 by default); larger
    payments and signing mandates always need a passkey;
  - codes go only to the address Keycloak has verified for the user;
  - a code is bound to one exact cart (its hash and total), and the email says what
    it approves: the amount, who is paid, and the seller;
  - it expires after 5 minutes, allows 5 attempts, and is used once;
  - new codes are rate-limited (one a minute per cart, ten an hour per user);
  - only a salted hash of the code is stored, never the code itself;
  - the receipt records "approved by email code" and marks that check as weaker.
"""

import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime

from app.config import get_settings
from app.errors import ApiError
from app.redis_client import get_redis
from app.security import Viewer
from app.services import mailer

MAX_ATTEMPTS = 5
RESEND_COOLDOWN_S = 60
MAX_PER_HOUR = 10


def _money(minor: int) -> str:
    return f"₦{minor / 100:,.0f}" if minor % 100 == 0 else f"₦{minor / 100:,.2f}"


def mask(email: str) -> str:
    """s••@example.com: enough to recognise the address, not enough to harvest it."""
    local, _, domain = email.partition("@")
    return f"{local[:1]}{'•' * max(2, min(6, len(local) - 1))}@{domain}"


def digest(salt: str, code: str) -> str:
    return hashlib.sha256(f"{salt}:{code.strip()}".encode()).hexdigest()


def _keys(user_id: str, cart_id: str) -> tuple[str, str, str]:
    base = f"approval:email:{user_id}:{cart_id}"
    return base, f"{base}:tries", f"{base}:cooldown"


def availability(viewer: Viewer, total_minor: int) -> dict:
    """Whether this shopper may approve this cart by email code, and if not, why."""
    s = get_settings()
    reason = None
    if not mailer.configured():
        reason = "Email isn't set up on this platform."
    elif not viewer.user.email:
        reason = "Your account has no email address."
    elif not viewer.email_verified and not s.sandbox_mode:
        reason = "Your email address isn't verified yet."
    elif total_minor > s.email_approval_max_minor:
        reason = f"Payments over {_money(s.email_approval_max_minor)} need your passkey."
    return {"available": reason is None, "reason": reason, "limitMinor": s.email_approval_max_minor,
            "sentTo": mask(viewer.user.email) if viewer.user.email else None}


def send_code(viewer: Viewer, cart_id: str, cart_hash: str, total_minor: int, payee_name: str, payee_account: str, seller: str,
              summary: str) -> dict:
    ok = availability(viewer, total_minor)
    if not ok["available"]:
        raise ApiError(409, "email_code_unavailable", ok["reason"])
    r = get_redis()
    key, tries_key, cooldown_key = _keys(viewer.user.id, cart_id)
    if not r.set(cooldown_key, "1", nx=True, ex=RESEND_COOLDOWN_S):
        raise ApiError(429, "email_code_too_soon", "A code was sent less than a minute ago. Check your email, or wait a moment for a new one.")
    hour_key = f"approval:email:hour:{viewer.user.id}"
    if r.incr(hour_key) > MAX_PER_HOUR:
        raise ApiError(429, "email_code_limit", "Too many codes this hour. Use your passkey, or try again later.")
    r.expire(hour_key, 3600, nx=True)

    code = f"{secrets.randbelow(1_000_000):06d}"
    salt = secrets.token_hex(8)
    ttl = get_settings().email_code_ttl_seconds
    record = {"salt": salt, "digest": digest(salt, code), "cartHash": cart_hash, "totalMinor": total_minor,
              "sentTo": mask(viewer.user.email), "sentAt": datetime.now(UTC).isoformat().replace("+00:00", "Z")}
    r.set(key, json.dumps(record), ex=ttl)
    r.delete(tries_key)

    amount = _money(total_minor)
    minutes = ttl // 60
    text = (f"Your code to approve {amount} to {payee_name} ({payee_account}), from {seller}:\n\n    {code}\n\n"
            f"What you're paying for: {summary}\n\nThe code works for this payment only and expires in {minutes} minutes.\n"
            "If you didn't ask for it, don't share it with anyone: nothing is paid without it.\n\nMandate Gate")
    html = f"""<div style="font-family:Arial,sans-serif;max-width:520px;color:#0b1220">
  <p style="margin:0 0 8px">Your code to approve <b>{amount}</b> to <b>{payee_name}</b> ({payee_account}), from {seller}:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:16px 0">{code}</p>
  <p style="margin:0 0 8px;color:#3b4455">What you're paying for: {summary}</p>
  <p style="margin:0 0 8px;color:#3b4455">The code works for this payment only and expires in {minutes} minutes.</p>
  <p style="margin:16px 0 0;color:#667085;font-size:13px">If you didn't ask for it, don't share it with anyone: nothing is paid without it.</p>
</div>"""
    mailer.send(viewer.user.email, f"Your code to approve {amount} to {payee_name}", text, html)
    return {"sentTo": record["sentTo"], "expiresInSeconds": ttl}


def check_code(viewer: Viewer, cart_id: str, cart_hash: str, total_minor: int, code: str | None) -> str:
    """Checks the code for this exact cart. Returns the evidence to store with the purchase (never the code)."""
    if total_minor > get_settings().email_approval_max_minor:
        raise ApiError(403, "passkey_required", f"Payments over {_money(get_settings().email_approval_max_minor)} need your passkey.")
    r = get_redis()
    key, tries_key, _ = _keys(viewer.user.id, cart_id)
    raw = r.get(key)
    if raw is None:
        raise ApiError(400, "email_code_expired", "That code has expired or was already used. Send a new one.")
    record = json.loads(raw)
    if record["cartHash"] != cart_hash or record["totalMinor"] != total_minor:
        r.delete(key)
        raise ApiError(409, "cart_changed", "The cart changed after the code was sent. Send a new code.")
    tries = r.incr(tries_key)
    r.expire(tries_key, get_settings().email_code_ttl_seconds)
    if tries > MAX_ATTEMPTS:
        r.delete(key)
        raise ApiError(429, "email_code_locked", "Too many wrong codes. Send a new one, or use your passkey.")
    if not code or not hmac.compare_digest(digest(record["salt"], code), record["digest"]):
        left = MAX_ATTEMPTS - tries
        raise ApiError(400, "email_code_wrong", f"That code isn't right. {left} {'try' if left == 1 else 'tries'} left." if left else
                       "That code isn't right. Send a new one, or use your passkey.")
    r.delete(key, tries_key)  # Used once.
    return json.dumps({
        "kind": "email_code", "purpose": "cart", "cartHash": cart_hash, "sentTo": record["sentTo"],
        "emailSha256": hashlib.sha256(viewer.user.email.strip().lower().encode()).hexdigest(), "sentAt": record["sentAt"],
        "verifiedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "note": "A one-time code sent to the shopper's verified email. Weaker than a passkey signature: the platform attests to it.",
    })
