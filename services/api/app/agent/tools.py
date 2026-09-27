"""
The agent's tools: the marketplace's public interface, called by the runtime
(never by the model directly). Tools are pinned to the marketplace host: an
image URL the model supplies is only fetched if it points there.
"""

import base64
from functools import lru_cache

import httpx

from app.config import get_settings


class ToolError(Exception):
    """A tool call failed in a way the agent should hear about and can recover from."""


@lru_cache
def _client() -> httpx.Client:
    return httpx.Client(base_url=get_settings().marketplace_url, timeout=httpx.Timeout(10.0, connect=3.0))


def _json(res: httpx.Response) -> dict | list:
    if res.status_code >= 400:
        try:
            body = res.json()
            message = body.get("message") or body.get("detail") or res.text
        except ValueError:
            message = res.text
        raise ToolError(f"{res.status_code}: {str(message)[:300]}")
    return res.json()


def search(query: str) -> dict:
    return _json(_client().get("/v1/search", params={"q": query[:120]}))  # type: ignore[return-value]


def product(seller_id: str, sku: str) -> dict:
    return _json(_client().get(f"/v1/sellers/{seller_id}/products/{sku}"))  # type: ignore[return-value]


def internal_image_path(url: str) -> str:
    """Only catalog images on the marketplace itself, addressed by its public or internal URL."""
    s = get_settings()
    for base in (s.marketplace_public_url.rstrip("/"), s.marketplace_url.rstrip("/")):
        if url.startswith(base + "/v1/sellers/") and "/catalog-images/" in url:
            return url[len(base):]
    raise ToolError("That image isn't a catalog image on the marketplace. Use an image_url from a search result.")


def image_data_url(url: str) -> str:
    """The image as a data URL, so the model gets the bytes without reaching the marketplace itself."""
    res = _client().get(internal_image_path(url))
    if res.status_code >= 400:
        raise ToolError(f"{res.status_code}: couldn't load the image")
    return f"data:{res.headers.get('content-type', 'image/jpeg')};base64,{base64.b64encode(res.content).decode()}"


def create_cart(seller_id: str, lines: list[dict], city: str) -> dict:
    return _json(_client().post(f"/v1/sellers/{seller_id}/carts", json={"lines": lines, "deliverToCity": city}))  # type: ignore[return-value]


@lru_cache(maxsize=1)
def _labels_cached(_bucket: int) -> tuple:
    s = get_settings()
    res = _client().get("/v1/sandbox/catalog-labels", headers={"authorization": f"Bearer {s.marketplace_api_key}"})
    return tuple(_json(res))  # type: ignore[arg-type]


def catalog_labels() -> tuple:
    """Ground truth for catalog images. Only the sandbox provider uses this (it can't see images)."""
    import time

    return _labels_cached(int(time.time() // 300))
