"""
Generated tests for the gate (M7): Hypothesis builds thousands of carts and mandates.

1. An honest cart (every rule satisfied) is never refused.
2. Breaking any one rule, in any cart, is always refused, and the right rule fails.
3. Breaking several rules at once is refused, and every broken rule is reported.
4. Changing anything in a seller-signed cart after signing (price, quantity, the
   payee's account) breaks the seller's signature.
"""

import base64
import copy
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from hypothesis import given, settings
from hypothesis import strategies as st

from app.models import Mandate, Merchant
from app.services import gate, merchants

NOW = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)
NAIRA = 100
PRODUCTS = [
    ("HP", "107A", "Printer toner"),
    ("Canon", "PG-545", "Printer ink"),
    ("Golden Penny", None, "Groceries"),
    ("Oraimo", "FPB-11D", "Power banks"),
]


def iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


class FakeDb:
    def __init__(self, merchant: Merchant):
        self.merchant = merchant

    def get(self, _model, _id):
        return self.merchant


@dataclass
class Case:
    """Everything the gate reads: the mandate, the cart, the seller, what the bank said, what was already spent."""

    mandate: Mandate
    signed: dict
    merchant: Merchant
    verification: dict
    period_spent: int

    def decide(self) -> dict:
        return gate.decide(
            FakeDb(self.merchant), self.mandate, self.signed, period_spent_minor=self.period_spent, at=NOW, verification=self.verification
        )


def verification(**failing: bool) -> dict:
    rules = ["seller_known", "signature", "not_expired", "arithmetic", "payee_registered", "payee_name"]
    return {
        "valid": not any(failing.values()),
        "payeeName": "SELLER LTD",
        "checks": [{"rule": r, "label": r, "result": "fail" if failing.get(r) else "pass", "detail": r} for r in rules],
    }


@st.composite
def honest_cases(draw) -> Case:
    brand, model, category = draw(st.sampled_from(PRODUCTS))
    n_lines = draw(st.integers(1, 3))
    lines = []
    for i in range(n_lines):
        pack, qty, unit = draw(st.integers(1, 6)), draw(st.integers(1, 5)), draw(st.integers(1_000, 60_000)) * NAIRA
        lines.append(
            {
                "sku": f"SKU{i}",
                "name": f"{brand} item {i}",
                "brand": brand,
                "model": model,
                "category": category,
                "packSize": pack,
                "quantity": qty,
                "unitPriceMinor": unit,
                "lineTotalMinor": unit * qty,
            }
        )
    fee = draw(st.integers(0, 5_000)) * NAIRA
    total = sum(ln["lineTotalMinor"] for ln in lines) + fee
    units = sum(ln["packSize"] * ln["quantity"] for ln in lines)
    delivery = NOW + timedelta(hours=draw(st.integers(2, 240)))
    mode = draw(st.sampled_from(["present", "not_present"]))
    max_uses = draw(st.integers(1, 10))
    uses = draw(st.integers(0, max_uses - 1))
    period_spent = draw(st.integers(0, 200_000)) * NAIRA if mode == "not_present" else 0
    policy = draw(st.sampled_from(["verified_only", "verified_and_known", "listed"]))
    seller_id = draw(st.sampled_from(["s_ikeja_office", "s_ada", "s_printpoint"]))
    limits = {
        "item": f"{brand} {model or category}",
        "brand": brand,
        "model": model,
        "category": category,
        "quantity": draw(st.integers(1, units)),
        "maxTotalMinor": total + draw(st.integers(0, 50_000)) * NAIRA,
        "maxPerItemMinor": draw(
            st.one_of(st.none(), st.just(max(ln["lineTotalMinor"] for ln in lines) + draw(st.integers(0, 10_000)) * NAIRA))
        ),
        "sellerPolicy": policy,
        "sellerIds": [seller_id] if policy == "listed" else [],
        "deliverBy": draw(st.one_of(st.none(), st.just(iso(delivery + timedelta(hours=draw(st.integers(0, 240))))))),
        "deliveryCity": "Lagos",
        "expiresAt": iso(NOW + timedelta(hours=draw(st.integers(1, 24 * 30)))),
        "maxUses": max_uses,
        "periodCapMinor": period_spent + total + draw(st.integers(0, 50_000)) * NAIRA if mode == "not_present" else None,
        "period": draw(st.sampled_from(["week", "month"])) if mode == "not_present" else None,
    }
    cart = {
        "cartId": "cart_1",
        "sellerId": seller_id,
        "sellerName": "Seller",
        "currency": "NGN",
        "deliveryFeeMinor": fee,
        "totalMinor": total,
        "lines": lines,
        "deliveryBy": iso(delivery),
        "expiresAt": iso(NOW + timedelta(minutes=30)),
        "payee": {"bankCode": "101", "accountNumber": "1010000048"},
    }
    mandate = Mandate(id="m1", status="active", mode=mode, limits=limits, uses=uses)
    tier = "verified" if policy != "verified_and_known" else draw(st.sampled_from(["verified", "known"]))
    merchant = Merchant(id=seller_id, tier=tier, display_name="Seller", legal_name="Seller Ltd")
    return Case(mandate, {"cart": cart, "signature": "sig"}, merchant, verification(), period_spent)


# ---- Rule-breaking changes: each returns the rule that must fail -------------------------------------------------


def over_total(c: Case, _d) -> str:
    c.mandate.limits["maxTotalMinor"] = c.signed["cart"]["totalMinor"] - 1
    return "within_limits"


def over_per_item(c: Case, _d) -> str:
    c.mandate.limits["maxPerItemMinor"] = max(ln["lineTotalMinor"] for ln in c.signed["cart"]["lines"]) - 1
    return "within_limits"


def wrong_brand(c: Case, d) -> str:
    line = d(st.sampled_from(c.signed["cart"]["lines"]))
    line["brand"] = "Generic"
    return "item_matches"


def wrong_model(c: Case, d) -> str:
    c.mandate.limits["model"] = c.mandate.limits["model"] or "X1"
    line = d(st.sampled_from(c.signed["cart"]["lines"]))
    line["model"] = f"{c.mandate.limits['model']}-compatible"
    return "item_matches"


def too_few_units(c: Case, _d) -> str:
    c.mandate.limits["quantity"] = sum(ln["packSize"] * ln["quantity"] for ln in c.signed["cart"]["lines"]) + 1
    return "item_matches"


def late_delivery(c: Case, d) -> str:
    cart_delivery = datetime.fromisoformat(c.signed["cart"]["deliveryBy"].replace("Z", "+00:00"))
    c.mandate.limits["deliverBy"] = iso(cart_delivery - timedelta(minutes=d(st.integers(1, 3000))))
    return "delivery_date"


def expired_mandate(c: Case, d) -> str:
    c.mandate.limits["expiresAt"] = iso(NOW - timedelta(minutes=d(st.integers(0, 10_000))))
    return "mandate_valid"


def cancelled_mandate(c: Case, _d) -> str:
    c.mandate.status = "revoked"
    return "mandate_valid"


def no_uses_left(c: Case, _d) -> str:
    c.mandate.uses = c.mandate.limits["maxUses"]
    return "mandate_valid"


def seller_not_allowed(c: Case, d) -> str:
    policy = c.mandate.limits["sellerPolicy"]
    if policy == "listed":
        c.mandate.limits["sellerIds"] = ["s_someone_else"]
    else:
        c.merchant.tier = d(st.sampled_from(["new", "suspended"] + (["known"] if policy == "verified_only" else [])))
    return "seller_allowed"


def forged_signature(c: Case, _d) -> str:
    c.verification = verification(signature=True)
    return "cart_signed"


def expired_cart(c: Case, _d) -> str:
    c.verification = verification(not_expired=True)
    return "cart_signed"


def bad_arithmetic(c: Case, _d) -> str:
    c.verification = verification(arithmetic=True)
    return "arithmetic"


def unregistered_payee(c: Case, _d) -> str:
    c.verification = verification(payee_registered=True)
    return "payee_verified"


def payee_name_mismatch(c: Case, _d) -> str:
    c.verification = verification(payee_name=True)
    return "payee_verified"


def over_period_cap(c: Case, d) -> str:
    total = c.signed["cart"]["totalMinor"]
    c.mandate.mode = "not_present"
    c.mandate.limits["period"] = c.mandate.limits.get("period") or "week"
    # A cap of 0 means "no cap", so keep it at least 1 kobo.
    c.mandate.limits["periodCapMinor"] = c.period_spent + total - d(st.integers(1, total - 1))
    return "period_cap"


VIOLATIONS = [
    over_total,
    over_per_item,
    wrong_brand,
    wrong_model,
    too_few_units,
    late_delivery,
    expired_mandate,
    cancelled_mandate,
    no_uses_left,
    seller_not_allowed,
    forged_signature,
    expired_cart,
    bad_arithmetic,
    unregistered_payee,
    payee_name_mismatch,
    over_period_cap,
]
# Changes that replace the same piece of evidence (the bank's or seller's check result) can't be combined meaningfully.
EVIDENCE = {forged_signature, expired_cart, bad_arithmetic, unregistered_payee, payee_name_mismatch}


def failed(decision: dict) -> set[str]:
    return {c["rule"] for c in decision["checks"] if c["result"] == "fail"}


@settings(max_examples=400, deadline=None)
@given(honest_cases())
def test_honest_carts_are_never_refused(case: Case):
    decision = case.decide()
    assert decision["outcome"] != "deny", failed(decision)


@settings(max_examples=600, deadline=None)
@given(honest_cases(), st.sampled_from(VIOLATIONS), st.data())
def test_every_rule_breaking_cart_is_refused(case: Case, violation, data):
    expected = violation(case, data.draw)
    decision = case.decide()
    assert decision["outcome"] == "deny"
    assert expected in failed(decision), (violation.__name__, failed(decision))


@settings(max_examples=400, deadline=None)
@given(honest_cases(), st.lists(st.sampled_from(VIOLATIONS), min_size=2, max_size=5, unique=True), st.data())
def test_combined_violations_are_all_reported(case: Case, violations, data):
    evidence = [v for v in violations if v in EVIDENCE]
    violations = [v for v in violations if v not in EVIDENCE] + evidence[:1]
    expected = {v(case, data.draw) for v in violations}
    decision = case.decide()
    assert decision["outcome"] == "deny"
    assert expected <= failed(decision), ([v.__name__ for v in violations], failed(decision))


# ---- The seller's signature covers every field of the cart ----------------------------------------------------------


KEY = Ed25519PrivateKey.generate()
SELLER = Merchant(
    id="s_ikeja_office",
    key_id="k1",
    display_name="Ikeja Office Hub",
    legal_name="Ikeja Office Hub Ltd",
    public_key=base64.urlsafe_b64encode(KEY.public_key().public_bytes_raw()).rstrip(b"=").decode(),
)


def sign(cart: dict) -> dict:
    return {"cart": cart, "signature": base64.urlsafe_b64encode(KEY.sign(merchants.canonical_json(cart))).rstrip(b"=").decode()}


TAMPERS = {
    "unit price": lambda cart, n: cart["lines"][0].__setitem__("unitPriceMinor", cart["lines"][0]["unitPriceMinor"] - n),
    "quantity": lambda cart, n: cart["lines"][0].__setitem__("quantity", cart["lines"][0]["quantity"] + n),
    "total": lambda cart, n: cart.__setitem__("totalMinor", cart["totalMinor"] - n),
    "payee account": lambda cart, n: cart["payee"].__setitem__(
        "accountNumber", f"{(int(cart['payee']['accountNumber']) + n) % 10**10:010d}"
    ),
    "payee bank": lambda cart, n: cart["payee"].__setitem__("bankCode", "104"),
    "delivery date": lambda cart, n: cart.__setitem__("deliveryBy", iso(NOW + timedelta(days=n % 30 + 1))),
    "item name": lambda cart, n: cart["lines"][0].__setitem__("name", cart["lines"][0]["name"] + " (refurbished)"),
}


@settings(max_examples=300, deadline=None)
@given(honest_cases(), st.sampled_from(sorted(TAMPERS)), st.integers(1, 10_000))
def test_changing_a_signed_cart_breaks_the_seller_signature(case: Case, field: str, n: int):
    cart = {**case.signed["cart"], "keyId": "k1"}
    signed = sign(cart)
    assert merchants.cart_signature_ok(SELLER, signed)
    tampered = copy.deepcopy(signed)
    TAMPERS[field](tampered["cart"], n)
    if tampered["cart"] != signed["cart"]:
        assert not merchants.cart_signature_ok(SELLER, tampered), field
