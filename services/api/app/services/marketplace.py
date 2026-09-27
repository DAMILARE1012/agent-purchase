"""
Client for the sandbox marketplace's platform endpoints.

In the sandbox, sellers "register" with the platform by appearing in the
marketplace's registry; `merchants.sync_registry` copies it into the directory.
A real launch replaces this with seller onboarding (KYC, key upload, account
verification) in the platform itself.
"""

from functools import lru_cache

import httpx

from app.config import get_settings
from app.errors import ApiError


class MarketplaceUnavailable(Exception):
    pass


@lru_cache
def _client() -> httpx.Client:
    settings = get_settings()
    return httpx.Client(
        base_url=settings.marketplace_url,
        headers={"authorization": f"Bearer {settings.marketplace_api_key}"},
        timeout=httpx.Timeout(5.0, connect=2.0),
    )


def _get(path: str) -> list | dict:
    try:
        res = _client().get(path)
    except httpx.HTTPError as exc:
        raise MarketplaceUnavailable(str(exc)) from exc
    if res.status_code == 404:
        raise ApiError(404, "not_found", "The marketplace has no such record.")
    if res.status_code >= 400:
        raise MarketplaceUnavailable(f"{res.status_code}: {res.text[:200]}")
    return res.json()


def registry() -> list[dict]:
    return _get("/v1/sandbox/registry")  # type: ignore[return-value]


def seller_items(seller_id: str) -> list[dict]:
    """Every item a seller sells, including those only published as photos."""
    try:
        return _get(f"/v1/sandbox/sellers/{seller_id}/items")  # type: ignore[return-value]
    except MarketplaceUnavailable as exc:
        raise ApiError(503, "marketplace_unavailable", "The marketplace isn't answering. Try again in a moment.") from exc
