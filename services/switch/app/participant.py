"""Messages from the switch to the platform, signed so the platform can trust them."""

import hashlib
import hmac
import json
import time

import httpx

from app.config import get_settings


def sign(body: bytes, secret: str, timestamp: int | None = None) -> str:
    t = timestamp or int(time.time())
    digest = hmac.new(secret.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={t},v1={digest}"


def _post(path: str, payload: dict) -> httpx.Response:
    settings = get_settings()
    body = json.dumps(payload, separators=(",", ":")).encode()
    return httpx.post(
        f"{settings.platform_events_url}{path}",
        content=body,
        headers={"content-type": "application/json", "x-switch-signature": sign(body, settings.switch_webhook_secret)},
        timeout=5,
    )


def name_enquiry(account_number: str) -> str | None:
    """Asks the platform who owns one of its accounts."""
    res = _post("/name-enquiry", {"accountNumber": account_number})
    if res.status_code == 404:
        return None
    res.raise_for_status()
    return res.json()["accountName"]


def send_event(event_type: str, data: dict) -> bool:
    """Delivers an event; False means try again later."""
    try:
        res = _post("/events", {"type": event_type, "data": data})
        return res.status_code < 300
    except httpx.HTTPError:
        return False
