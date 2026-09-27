"""
Client for the inter-bank payment switch, and verification of the switch's signed webhooks.

Every call has a short timeout. A timeout on a transfer never means "failed":
the transfer stays pending and is settled later by webhook or status query.
"""

import hashlib
import hmac
import time
from dataclasses import dataclass
from functools import lru_cache

import httpx

from app.config import get_settings
from app.errors import ApiError

SIGNATURE_TOLERANCE_SECONDS = 300


class NetworkUnavailable(Exception):
    """The switch didn't answer. The outcome is unknown, not failed."""


@dataclass(frozen=True)
class Bank:
    code: str
    name: str


@lru_cache
def _client() -> httpx.Client:
    settings = get_settings()
    return httpx.Client(
        base_url=settings.switch_url,
        headers={"authorization": f"Bearer {settings.switch_api_key}"},
        timeout=httpx.Timeout(5.0, connect=2.0),
    )


def _call(method: str, path: str, **kwargs) -> dict | list:
    try:
        res = _client().request(method, path, **kwargs)
    except httpx.HTTPError as exc:
        raise NetworkUnavailable(str(exc)) from exc
    if res.status_code >= 500:
        raise NetworkUnavailable(f"{res.status_code}: {res.text[:200]}")
    body = res.json()
    if res.status_code >= 400:
        raise ApiError(res.status_code if res.status_code < 500 else 502, body.get("error", "network_error"), body.get("message", "The payment network rejected the request."))
    return body


@lru_cache
def _banks_cached(_minute: int) -> tuple[Bank, ...]:
    return tuple(Bank(b["code"], b["name"]) for b in _call("GET", "/v1/banks"))


def banks() -> list[Bank]:
    """Banks on the network. Cached for a minute."""
    try:
        return list(_banks_cached(int(time.time() // 60)))
    except NetworkUnavailable:
        settings = get_settings()
        return [Bank(settings.platform_bank_code, settings.platform_bank_name)]


def name_enquiry(bank_code: str, account_number: str) -> dict:
    try:
        return _call("POST", "/v1/name-enquiry", json={"bankCode": bank_code, "accountNumber": account_number})  # type: ignore[return-value]
    except NetworkUnavailable as exc:
        raise ApiError(503, "network_unavailable", "We can't reach other banks right now. Try again in a moment.") from exc


def submit_transfer(payload: dict) -> dict:
    return _call("POST", "/v1/transfers", json=payload)  # type: ignore[return-value]


def transfer_status(reference: str) -> dict | None:
    """Transaction status query. None if the switch has no record of it."""
    try:
        return _call("GET", f"/v1/transfers/{reference}")  # type: ignore[return-value]
    except ApiError as exc:
        if exc.status == 404:
            return None
        raise


def sandbox_directory() -> list[dict]:
    return _call("GET", "/v1/sandbox/directory")  # type: ignore[return-value]


def sandbox_inbound(payload: dict) -> dict:
    try:
        return _call("POST", "/v1/sandbox/inbound", json=payload)  # type: ignore[return-value]
    except NetworkUnavailable as exc:
        raise ApiError(503, "network_unavailable", "The payment network is unavailable.") from exc


def sandbox_reset() -> None:
    try:
        _call("POST", "/v1/sandbox/reset")
    except NetworkUnavailable:
        pass


def verify_webhook(body: bytes, header: str | None) -> None:
    """Checks the switch's HMAC signature: t=<unix>,v1=<hex sha256(secret, "<t>.<body>")>."""
    if not header:
        raise ApiError(401, "missing_signature", "Missing network signature.")
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    try:
        timestamp = int(parts["t"])
    except (KeyError, ValueError) as exc:
        raise ApiError(401, "bad_signature", "Malformed network signature.") from exc
    if abs(time.time() - timestamp) > SIGNATURE_TOLERANCE_SECONDS:
        raise ApiError(401, "stale_signature", "Network signature is too old.")
    expected = hmac.new(get_settings().switch_webhook_secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, parts.get("v1", "")):
        raise ApiError(401, "bad_signature", "Invalid network signature.")
