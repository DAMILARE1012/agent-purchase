"""Unit tests for M7 logic that needs no database, Redis or network: receipts, approvals, caps."""

import json
from datetime import UTC, datetime

from app.models import SigningKey
from app.services import passkeys, payments, signing


class KeyDb:
    def __init__(self, key: SigningKey):
        self.key = key

    def get(self, _model, kid):
        return self.key if kid == self.key.kid else None


def receipt(key: SigningKey, **over) -> str:
    fields = {
        "purchase_id": "pur_1",
        "tx": "tx_1",
        "amount_minor": 3_850_000,
        "currency": "NGN",
        "seller_id": "s_ikeja_office",
        "payee_reference": "101:1010000048",
        "mandate_hash": "a" * 64,
        "cart_hash": "b" * 64,
        "gate_version": "gate-1.0.0",
        "agent_version": "shopper-2026.09.5",
        "created_at": datetime(2026, 9, 28, 12, tzinfo=UTC),
        "kid": key.kid,
        **over,
    }
    return signing._sign(signing.purchase_payload(**fields), key.private_key_pem, signing.PURCHASE_PREFIX)  # noqa: SLF001


def test_purchase_receipt_round_trip():
    key = signing._generate_key("rk-test")  # noqa: SLF001
    token = receipt(key)
    assert token.startswith("MG1.")
    parsed = signing.parse_token(token, signing.PURCHASE_PREFIX)
    assert parsed is not None
    assert parsed.payload["amt"] == 3_850_000 and parsed.payload["m"] == "a" * 64 and parsed.payload["c"] == "b" * 64
    assert "101:1010000048" not in token  # The payee is hashed, not printed.
    assert signing.verify_signature(KeyDb(key), parsed) == "pass"


def test_a_changed_receipt_amount_fails_verification():
    key = signing._generate_key("rk-test")  # noqa: SLF001
    prefix, body, sig = receipt(key).split(".")
    payload = json.loads(signing._unb64(body))  # noqa: SLF001
    payload["amt"] = 385_000_000
    forged = ".".join([prefix, signing._b64(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()), sig])  # noqa: SLF001
    parsed = signing.parse_token(forged, signing.PURCHASE_PREFIX)
    assert parsed is not None and signing.verify_signature(KeyDb(key), parsed) == "fail"


def test_receipts_from_another_key_are_unknown():
    key, other = signing._generate_key("rk-test"), signing._generate_key("rk-other")  # noqa: SLF001
    parsed = signing.parse_token(receipt(other), signing.PURCHASE_PREFIX)
    assert parsed is not None and signing.verify_signature(KeyDb(key), parsed) == "unknown_kid"


def test_old_transfer_receipts_are_not_purchase_receipts():
    key = signing._generate_key("rk-test")  # noqa: SLF001
    assert signing.parse_token(receipt(key), signing.TOKEN_PREFIX) is None


def test_a_mandate_signature_can_never_approve_a_payment():
    digest, nonce = "c" * 64, b"n" * 16
    assert passkeys.challenge_for(digest, nonce, "mandate") != passkeys.challenge_for(digest, nonce, "cart")


def test_cart_hash_ignores_key_order_but_not_values():
    a = {"cart": {"totalMinor": 100, "payee": {"bankCode": "101", "accountNumber": "1"}}}
    b = {"cart": {"payee": {"accountNumber": "1", "bankCode": "101"}, "totalMinor": 100}}
    c = {"cart": {"payee": {"accountNumber": "2", "bankCode": "101"}, "totalMinor": 100}}
    assert payments.cart_hash(a) == payments.cart_hash(b) != payments.cart_hash(c)


def test_periods_start_at_midnight_in_lagos():
    # Monday 28 Sep 2026, 00:30 in Lagos is Sunday 23:30 UTC: already the new week there.
    sunday_night_utc = datetime(2026, 9, 27, 23, 30, tzinfo=UTC)
    assert payments.period_start("week", sunday_night_utc) == datetime(2026, 9, 27, 23, 0, tzinfo=UTC)
    assert payments.period_start("week", datetime(2026, 9, 27, 22, 30, tzinfo=UTC)) == datetime(2026, 9, 20, 23, 0, tzinfo=UTC)
    assert payments.period_start("month", datetime(2026, 9, 30, 23, 30, tzinfo=UTC)) == datetime(2026, 9, 30, 23, 0, tzinfo=UTC)
    assert payments.period_start("month", datetime(2026, 9, 15, 10, 0, tzinfo=UTC)) == datetime(2026, 8, 31, 23, 0, tzinfo=UTC)
