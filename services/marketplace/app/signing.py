"""
Seller cart signatures: Ed25519 over canonical JSON.

Canonical JSON = keys sorted, no insignificant whitespace, UTF-8. The platform
verifies with the public key the seller registered, never with anything the
cart itself says.
"""

import base64
import hashlib
import json
from functools import lru_cache

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.config import get_settings


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def canonical_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


@lru_cache
def private_key(seller_id: str) -> Ed25519PrivateKey:
    seed = hashlib.sha256(f"{get_settings().marketplace_key_seed}:{seller_id}".encode()).digest()
    return Ed25519PrivateKey.from_private_bytes(seed)


def public_key_b64(seller_id: str) -> str:
    raw = private_key(seller_id).public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return b64url(raw)


def key_id(seller_id: str) -> str:
    """Short, stable identifier of the seller's current key."""
    return f"{seller_id}:{public_key_b64(seller_id)[:8]}"


def sign(seller_id: str, payload: dict) -> str:
    return b64url(private_key(seller_id).sign(canonical_json(payload)))
