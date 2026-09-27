"""
The platform's seller directory, and verification of seller-signed carts
(system_design.md §3 step 3, §5; M4).

Two facts the gate relies on come from here, never from a cart or a seller's
page: the seller's registered public key, and which bank accounts are the
seller's own. An account counts only when the bank's name enquiry matches the
seller's registered legal name.
"""

import base64
import json
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.formatting import now
from app.models import Merchant, MerchantAccount
from app.services import marketplace, network
from app.services.account_numbers import is_valid_account_number

log = logging.getLogger("api.merchants")


def normalize_name(name: str) -> str:
    """Compare names the way a person would: case, punctuation and "Limited" vs "Ltd" don't matter."""
    text = re.sub(r"[^A-Z0-9 ]", " ", name.upper())
    text = re.sub(r"\bLIMITED\b", "LTD", text)
    return re.sub(r"\s+", " ", text).strip()


def names_match(a: str, b: str) -> bool:
    return normalize_name(a) == normalize_name(b)


def _bank_name(code: str) -> str:
    return next((b.name for b in network.banks() if b.code == code), code)


def check_account(account: MerchantAccount, legal_name: str) -> None:
    """Asks the bank who owns the account. Verified only if it's the seller's legal name."""
    result = network.name_enquiry(account.bank_code, account.account_number)
    account.name_on_account = result["accountName"]
    account.bank_name = result.get("bankName") or account.bank_name
    account.checked_at = now()
    if names_match(result["accountName"], legal_name):
        account.verified_at = account.verified_at or now()
    else:
        account.verified_at = None


def accounts_of(db: Session, merchant_id: str) -> list[MerchantAccount]:
    return list(db.scalars(select(MerchantAccount).where(MerchantAccount.merchant_id == merchant_id).order_by(MerchantAccount.id)))


def get(db: Session, merchant_id: str) -> Merchant:
    m = db.get(Merchant, merchant_id)
    if m is None:
        raise ApiError(404, "not_found", "No such seller.")
    return m


def owned_by(db: Session, username: str) -> Merchant:
    m = db.scalar(select(Merchant).where(Merchant.owner_username == username))
    if m is None:
        raise ApiError(404, "no_store", "No store is linked to this account.")
    return m


def sync_registry(db: Session) -> dict:
    """
    Copies the marketplace's registry into the directory. New sellers start at
    their sandbox tier; an existing seller keeps whatever tier an admin gave it.
    Keys and names are refreshed; every registered account is re-checked.
    """
    entries = marketplace.registry()
    accounts = verified = 0
    for e in entries:
        m = db.get(Merchant, e["id"])
        if m is None:
            m = Merchant(id=e["id"], tier=e["sandboxTier"])
            db.add(m)
        m.display_name, m.legal_name = e["displayName"], e["legalName"]
        m.category, m.city, m.catalog_kind = e["category"], e["city"], e["catalogKind"]
        m.public_key, m.key_id = e["publicKey"], e["keyId"]
        m.owner_username, m.adversarial = e.get("ownerUsername"), bool(e.get("adversarial"))
        m.joined_at = datetime.fromisoformat(e["joinedAt"].replace("Z", "+00:00"))
        db.flush()
        for a in e["settlementAccounts"]:
            acc = db.scalar(
                select(MerchantAccount).where(MerchantAccount.bank_code == a["bankCode"], MerchantAccount.account_number == a["accountNumber"])
            )
            if acc is None:
                acc = MerchantAccount(merchant_id=m.id, bank_code=a["bankCode"], bank_name=_bank_name(a["bankCode"]), account_number=a["accountNumber"])
                db.add(acc)
            check_account(acc, m.legal_name)
            accounts += 1
            verified += acc.verified_at is not None
    db.commit()
    return {"sellers": len(entries), "accounts": accounts, "verified": verified}


def register_account(db: Session, merchant: Merchant, bank_code: str, account_number: str) -> MerchantAccount:
    if not is_valid_account_number(account_number):
        raise ApiError(422, "invalid_account_number", "That account number isn't valid. Check the 10 digits.")
    existing = db.scalar(select(MerchantAccount).where(MerchantAccount.bank_code == bank_code, MerchantAccount.account_number == account_number))
    if existing is not None:
        raise ApiError(409, "already_registered", "That account is already registered to a seller.")
    acc = MerchantAccount(merchant_id=merchant.id, bank_code=bank_code, bank_name=_bank_name(bank_code), account_number=account_number)
    check_account(acc, merchant.legal_name)
    db.add(acc)
    db.commit()
    return acc


def remove_account(db: Session, merchant: Merchant, bank_code: str, account_number: str) -> None:
    """A seller can remove an account, but never its last verified one: it must always be payable."""
    accounts = accounts_of(db, merchant.id)
    target = next((a for a in accounts if a.bank_code == bank_code and a.account_number == account_number), None)
    if target is None:
        raise ApiError(404, "not_found", "That account isn't registered to your store.")
    if target.verified_at and sum(1 for a in accounts if a.verified_at) == 1:
        raise ApiError(409, "last_verified_account", "Add another verified account before removing this one.")
    db.delete(target)
    db.commit()


def set_tier(db: Session, merchant: Merchant, tier: str) -> Merchant:
    merchant.tier = tier
    db.commit()
    return merchant


# ---- Cart verification ------------------------------------------------------------------


@dataclass
class CartCheck:
    rule: str
    label: str
    result: str  # pass | fail
    detail: str


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def canonical_json(value: object) -> bytes:
    """Must match the marketplace's canonical form exactly (sorted keys, no spaces, UTF-8)."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _signature_ok(public_key: str, signature: str, cart: dict) -> bool:
    try:
        Ed25519PublicKey.from_public_bytes(_unb64(public_key)).verify(_unb64(signature), canonical_json(cart))
        return True
    except (InvalidSignature, ValueError):
        return False


def cart_signature_ok(merchant: Merchant, signed: dict) -> bool:
    """The cart was signed with this seller's registered key and hasn't changed since."""
    cart = signed.get("cart") or {}
    return cart.get("keyId") == merchant.key_id and _signature_ok(merchant.public_key, signed.get("signature", ""), cart)


def _money(minor: int) -> str:
    return f"₦{minor / 100:,.0f}" if minor % 100 == 0 else f"₦{minor / 100:,.2f}"


def verify_cart(db: Session, signed: dict, at: datetime | None = None) -> dict:
    """
    Everything about a cart that doesn't depend on the shopper's mandate:
    who signed it, whether it's intact and current, whether it adds up, and
    whether the money would go to the seller's own verified account.
    The gate (M7) adds the mandate checks on top.
    """
    at = at or datetime.now(UTC)
    cart, signature = signed.get("cart") or {}, signed.get("signature") or ""
    checks: list[CartCheck] = []

    def add(rule: str, label: str, ok: bool, passed: str, failed: str) -> None:
        checks.append(CartCheck(rule, label, "pass" if ok else "fail", passed if ok else failed))

    merchant = db.get(Merchant, cart.get("sellerId", ""))
    add("seller_known", "Seller is in the directory", merchant is not None and merchant.tier != "suspended",
        f"{merchant.legal_name if merchant else ''} ({merchant.tier if merchant else ''})",
        "Unknown seller" if merchant is None else f"{merchant.display_name} is suspended")
    if merchant is None:
        return {"valid": False, "sellerId": cart.get("sellerId"), "payeeName": None, "checks": [c.__dict__ for c in checks]}

    add("signature", "Signed with the seller's registered key",
        cart.get("keyId") == merchant.key_id and _signature_ok(merchant.public_key, signature, cart),
        f"Ed25519 signature verifies with key {merchant.key_id}",
        "The signature doesn't match the seller's registered key: the cart was changed or signed by someone else")

    expires = cart.get("expiresAt")
    fresh = bool(expires) and datetime.fromisoformat(str(expires).replace("Z", "+00:00")) > at
    add("not_expired", "Cart is still valid", fresh, f"Expires {expires}", "The cart has expired")

    lines = cart.get("lines") or []
    lines_ok = all(ln.get("lineTotalMinor") == ln.get("unitPriceMinor", 0) * ln.get("quantity", 0) for ln in lines)
    total = sum(ln.get("lineTotalMinor", 0) for ln in lines) + cart.get("deliveryFeeMinor", 0)
    add("arithmetic", "Prices add up", bool(lines) and lines_ok and total == cart.get("totalMinor") and cart.get("currency") == "NGN",
        f"Lines + delivery = {_money(total)}",
        f"Lines + delivery = {_money(total)}, but the cart says {_money(cart.get('totalMinor', 0))}")

    payee = cart.get("payee") or {}
    registered = next(
        (a for a in accounts_of(db, merchant.id) if a.bank_code == payee.get("bankCode") and a.account_number == payee.get("accountNumber")), None
    )
    add("payee_registered", "Paid into an account registered to the seller", registered is not None and registered.verified_at is not None,
        f"{registered.bank_name if registered else ''} ••••{payee.get('accountNumber', '')[-4:]} is the seller's verified account",
        f"Bank {payee.get('bankCode')} ••••{payee.get('accountNumber', '')[-4:]} isn't a verified account of {merchant.legal_name}")

    # Ask the bank now, not only at registration: accounts can change hands.
    payee_name = None
    try:
        enquiry = network.name_enquiry(payee.get("bankCode", ""), payee.get("accountNumber", ""))
        payee_name = enquiry["accountName"]
        add("payee_name", "Bank confirms the account is the seller's", names_match(payee_name, merchant.legal_name),
            f"{enquiry['bankName']} says the account belongs to {payee_name.upper()}",
            f"{enquiry['bankName']} says the account belongs to {payee_name.upper()}, not {merchant.legal_name}")
    except ApiError as exc:
        add("payee_name", "Bank confirms the account is the seller's", False, "", f"Name enquiry failed: {exc.message}")

    return {
        "valid": all(c.result == "pass" for c in checks),
        "sellerId": merchant.id,
        "payeeName": payee_name,
        "checks": [c.__dict__ for c in checks],
    }
