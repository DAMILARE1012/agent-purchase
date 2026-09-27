"""
The mandate gate (system_design.md §3 step 3): the only thing that can allow a
payment. Plain, deterministic code. It reads the shopper's signed mandate, the
seller-signed cart, the platform's seller directory and the bank's name
enquiry; nothing the AI or a seller writes can change its decision.

It runs twice: when the AI proposes a cart, and again inside the payment
transaction (app/services/payments.py), with the mandate row locked, so what is
paid is what the gate allows at that moment. tests/test_gate_properties.py
generates carts that break each rule and checks every one is refused.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import Mandate, Merchant
from app.services import merchants

GATE_VERSION = "gate-1.0.0"
TIGHT_DELIVERY = timedelta(hours=6)

POLICY_TEXT = {"verified_only": "verified sellers only", "verified_and_known": "verified and known sellers", "listed": "the sellers you listed"}


def _dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def _money(minor: int) -> str:
    return f"₦{minor / 100:,.0f}" if minor % 100 == 0 else f"₦{minor / 100:,.2f}"


def _same(a: str | None, b: str | None) -> bool:
    return (a or "").strip().upper() == (b or "").strip().upper()


def seller_allowed(limits: dict, merchant: Merchant | None) -> bool:
    if merchant is None or merchant.tier == "suspended":
        return False
    policy = limits.get("sellerPolicy", "verified_only")
    if policy == "listed":
        return merchant.id in (limits.get("sellerIds") or [])
    if policy == "verified_and_known":
        return merchant.tier in ("verified", "known")
    return merchant.tier == "verified"


def decide(db: Session, mandate: Mandate, signed_cart: dict, *, period_spent_minor: int = 0, at: datetime | None = None,
           verification: dict | None = None) -> dict:
    """
    `verification` is merchants.verify_cart's result when the caller already has it: the payment
    path asks the bank for the account name before taking row locks, not while holding them.
    """
    at = at or datetime.now(UTC)
    L = mandate.limits
    cart = signed_cart.get("cart") or {}
    merchant = db.get(Merchant, cart.get("sellerId", ""))
    verification = verification or merchants.verify_cart(db, signed_cart, at)
    v = {c["rule"]: c for c in verification["checks"]}
    checks: list[dict] = []

    def add(rule: str, label: str, ok: bool, passed: str, failed: str, soft: bool = False) -> None:
        checks.append({"rule": rule, "label": label, "result": "pass" if ok else ("warn" if soft else "fail"), "detail": passed if ok else failed})

    # 1. Mandate
    expires = _dt(L.get("expiresAt"))
    problem = (
        "The mandate was cancelled" if mandate.status == "revoked"
        else "The mandate has expired" if mandate.status == "expired" or (expires and expires <= at)
        else "The mandate has no uses left" if mandate.uses >= L.get("maxUses", 1)
        else None
    )
    add("mandate_valid", "Mandate is signed and still valid", problem is None, "Signed, not expired, uses left", problem or "")

    # 2. Cart signed by the seller's registered key, and still current
    sig, fresh = v.get("signature"), v.get("not_expired")
    add("cart_signed", "Cart is signed by the seller", bool(sig and fresh and sig["result"] == "pass" and fresh["result"] == "pass"),
        f"{sig['detail'] if sig else ''}; cart not expired",
        (sig["detail"] if sig and sig["result"] == "fail" else fresh["detail"] if fresh else "The seller isn't in the directory"))

    # 3. Seller allowed by the mandate's seller rule (tiers come from the platform directory)
    tier = merchant.tier if merchant else "unknown"
    name = merchant.display_name if merchant else cart.get("sellerName", "Unknown seller")
    policy_text = POLICY_TEXT.get(L.get("sellerPolicy", "verified_only"), "")
    add("seller_allowed", "Seller is allowed by the mandate", seller_allowed(L, merchant),
        f"{name} is {tier}; the mandate allows {policy_text}", f"{name} is {tier}; the mandate allows {policy_text}")

    # 4. Arithmetic
    arith = v.get("arithmetic")
    add("arithmetic", "Prices add up", bool(arith and arith["result"] == "pass"), arith["detail"] if arith else "", arith["detail"] if arith else "No cart lines")

    # 5. Limits
    total = int(cart.get("totalMinor") or 0)
    per_item = L.get("maxPerItemMinor")
    over_item = next((ln for ln in cart.get("lines", []) if per_item is not None and ln.get("lineTotalMinor", 0) > per_item), None)
    add("within_limits", "Within your spending limits", total <= L.get("maxTotalMinor", 0) and over_item is None,
        f"{_money(total)} of {_money(L.get('maxTotalMinor', 0))} allowed",
        f"{over_item['name']} costs more than the {_money(per_item)} per-item limit" if over_item
        else f"{_money(total)} is over the {_money(L.get('maxTotalMinor', 0))} limit")

    # 6. The item, as the seller signed it
    lines = cart.get("lines") or []
    wrong = next((ln for ln in lines if (L.get("brand") and not _same(ln.get("brand"), L["brand"])) or (L.get("model") and not _same(ln.get("model"), L["model"]))
                  or (L.get("category") and not _same(ln.get("category"), L["category"]))), None)
    units = sum(int(ln.get("quantity", 0)) * int(ln.get("packSize", 1)) for ln in lines)
    wanted = int(L.get("quantity", 1))
    item_ok = bool(lines) and wrong is None and units >= wanted
    expected = " ".join(x for x in (L.get("brand"), L.get("model")) if x) or L.get("category") or L.get("item")
    add("item_matches", "It's the item you asked for", item_ok,
        f"{expected}, as signed by the seller" + (f" ({units} units)" if wanted > 1 else ""),
        (f"The cart has “{wrong['name']}” ({' '.join(x for x in (wrong.get('brand'), wrong.get('model')) if x) or wrong.get('category')}), not {expected}"
         if wrong else f"The cart has {units} units; you asked for {wanted}"))

    # 7. Delivery
    deliver_by, cart_delivery = _dt(L.get("deliverBy")), _dt(cart.get("deliveryBy"))
    add("delivery_date", "Arrives before your deadline", deliver_by is None or (cart_delivery is not None and cart_delivery <= deliver_by),
        "Delivery date is before the deadline" if deliver_by else "No deadline set", "Delivery would be after your deadline")

    # 8. Payee: registered, verified, and confirmed by the bank now
    reg, pname = v.get("payee_registered"), v.get("payee_name")
    payee_ok = bool(reg and pname and reg["result"] == "pass" and pname["result"] == "pass")
    add("payee_verified", "Money goes to the seller's own account", payee_ok,
        pname["detail"] if pname else "", (pname["detail"] if pname and pname["result"] == "fail" else reg["detail"] if reg else "Payee not checked"))

    # 9. Period cap (standing mandates)
    if L.get("periodCapMinor") and L.get("period"):
        cap, spent = int(L["periodCapMinor"]), period_spent_minor
        add("period_cap", f"Within the {L['period']}ly cap", spent + total <= cap,
            f"{_money(spent + total)} of {_money(cap)} this {L['period']}",
            f"This would make {_money(spent + total)}, over the {_money(cap)} {L['period']}ly cap")

    # Soft rules: the shopper is asked even when every hard rule passes.
    add("soft_new_seller", "Seller has a track record", merchant is None or merchant.tier != "new", "Established seller", f"{name} joined recently", soft=True)
    if deliver_by and cart_delivery:
        add("soft_tight_delivery", "Delivery has some slack", deliver_by - cart_delivery >= TIGHT_DELIVERY,
            "Arrives with time to spare", "Arrives within 6 hours of your deadline", soft=True)

    outcome = "deny" if any(c["result"] == "fail" for c in checks) else "needs_approval" if any(c["result"] == "warn" for c in checks) else "allow"
    return {
        "outcome": outcome, "gateVersion": GATE_VERSION, "checks": checks,
        "decidedAt": at.isoformat().replace("+00:00", "Z"), "payeeName": verification.get("payeeName"),
    }
