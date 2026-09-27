"""Unit tests for logic that needs no database. Run: python -m pytest"""

from datetime import UTC, datetime

import pytest
from cryptography.hazmat.primitives import serialization

from app.formatting import money
from app.services import ledger, signing
from app.services.users import primary_role


def test_money_formats_minor_units():
    assert money(25_000) == "$250.00"
    assert money(123_456_78) == "$123,456.78"
    assert money(-500) == "-$5.00"


def test_primary_role_prefers_most_privileged():
    assert primary_role(frozenset({"shopper", "ops"})) == "ops"
    assert primary_role(frozenset({"shopper", "analyst"})) == "analyst"
    assert primary_role(frozenset({"shopper", "seller"})) == "seller"
    assert primary_role(frozenset({"shopper", "admin", "ops"})) == "admin"
    assert primary_role(frozenset({"offline_access"})) == "shopper"


def test_ledger_rejects_unbalanced_entries_before_writing():
    with pytest.raises(ValueError, match="Unbalanced"):
        ledger.post(None, "bad", [ledger.Line("a", "DR", 100), ledger.Line("b", "CR", 90)])  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="positive"):
        ledger.post(None, "bad", [ledger.Line("a", "DR", 0), ledger.Line("b", "CR", 0)])  # type: ignore[arg-type]


def _payload() -> bytes:
    return signing.canonical_payload("tx_ABC", 25_000, "USD", "acct_rita", datetime(2026, 9, 26, 14, 2, tzinfo=UTC), "rk-test")


def test_token_round_trip_and_signature():
    key = signing._generate_key("rk-test")
    token = signing._sign(_payload(), key.private_key_pem or "")
    parsed = signing.parse_token(token)
    assert parsed is not None
    assert parsed.payload["amt"] == 25_000
    assert parsed.payload["to"] == signing.payee_hash("acct_rita")

    public = serialization.load_pem_public_key(key.public_key_pem.encode())
    public.verify(parsed.signature, parsed.payload_bytes)  # raises if invalid


def test_edited_payload_breaks_signature():
    key = signing._generate_key("rk-test")
    prefix, payload, sig = signing._sign(_payload(), key.private_key_pem or "").split(".")
    edited_payload = signing._b64(signing._unb64(payload).replace(b"25000", b"99999"))
    parsed = signing.parse_token(f"{prefix}.{edited_payload}.{sig}")
    assert parsed is not None
    public = serialization.load_pem_public_key(key.public_key_pem.encode())
    with pytest.raises(Exception):
        public.verify(parsed.signature, parsed.payload_bytes)


@pytest.mark.parametrize("bad", ["", "hello", "RCPT1.onlytwo", "XXXX1.a.b", "RCPT1.!!!.???"])
def test_parse_token_rejects_garbage(bad):
    assert signing.parse_token(bad) is None
