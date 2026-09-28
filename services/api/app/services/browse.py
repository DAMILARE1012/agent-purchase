"""
The marketplace as a shopper browses it: every seller's public catalog, grouped so the
same product from different sellers can be compared, with the platform's trust tier
for each seller. It's for looking and starting a mandate; nothing is bought here, since
every purchase goes through a signed mandate and the gate.

Only what a shopper could see in public: structured listings, and photo catalogs as
photos (what a photo contains is only known by reading it, as the AI does).
"""

import re
import threading
import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import Merchant
from app.services import marketplace

CACHE_S = 60
_lock = threading.Lock()
_cache: dict = {"at": 0.0, "data": None}


def _fetch() -> dict:
    sellers, items, photos = {}, [], []
    for s in marketplace._get("/v1/sellers"):  # noqa: SLF001 (the marketplace client's own request helper)
        catalog = marketplace._get(f"/v1/sellers/{s['id']}/catalog")  # noqa: SLF001
        sellers[s["id"]] = s
        items += catalog["items"]
        photos += catalog["images"]
    return {"sellers": sellers, "items": items, "photos": photos}


def _snapshot() -> dict:
    with _lock:
        if _cache["data"] is None or time.monotonic() - _cache["at"] > CACHE_S:
            try:
                _cache["data"], _cache["at"] = _fetch(), time.monotonic()
            except marketplace.MarketplaceUnavailable as exc:
                if _cache["data"] is None:
                    raise ApiError(503, "marketplace_unavailable", "The marketplace isn't answering. Try again in a moment.") from exc
        return _cache["data"]


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def browse(db: Session) -> dict:
    snap = _snapshot()
    tiers = {m.id: m for m in db.scalars(select(Merchant))}
    sellers = {}
    for sid, s in snap["sellers"].items():
        m = tiers.get(sid)
        if m is None or m.tier == "suspended":  # Not in the directory, or can't be paid: not shown.
            continue
        sellers[sid] = {
            "id": sid, "name": s["displayName"], "tier": m.tier, "city": s["city"], "category": s["category"],
            "catalogKind": s["catalogKind"], "deliveryFeeMinor": s.get("deliveryFeeMinor"), "deliveryDays": s.get("deliveryDays"),
            "joinedAt": m.joined_at.isoformat().replace("+00:00", "Z") if m.joined_at else None,
        }

    photos = [
        {"sellerId": p["sellerId"], "page": p["page"], "caption": p["caption"], "topics": p["topics"],
         "src": f"marketplace/photos/{p['sellerId']}/{p['page']}"}
        for p in snap["photos"] if p["sellerId"] in sellers
    ]

    products: dict[str, dict] = {}
    for i in snap["items"]:
        if i["sellerId"] not in sellers:
            continue
        key = f"{i['brand']}|{i['model']}".lower() if i.get("brand") and i.get("model") else i["sku"]
        group = products.setdefault(key, {
            "id": key, "title": f"{i['brand']} {i['model']}" if i.get("brand") and i.get("model") else i["name"],
            "brand": i.get("brand"), "model": i.get("model"), "category": i["category"], "offers": [], "inPhotos": [],
        })
        group["offers"].append({k: i.get(k) for k in ("sellerId", "sku", "name", "packSize", "unitPriceMinor", "inStock", "description")})
    for group in products.values():
        group["offers"].sort(key=lambda o: o["unitPriceMinor"] / max(1, o["packSize"] or 1))
        if group["brand"] and group["model"]:  # Photo catalogs that say they show this product; only reading the photo can confirm.
            needle = _words(f"{group['brand']} {group['model']}")
            group["inPhotos"] = sorted({p["sellerId"] for p in photos if needle <= _words(p["caption"])})

    return {"sellers": sellers, "products": sorted(products.values(), key=lambda g: (g["category"], g["title"])), "photos": photos}


def photo(seller_id: str, page: int) -> bytes:
    """A catalog photo, served through the platform so the browser never talks to the marketplace directly."""
    try:
        res = marketplace._client().get(f"/v1/sellers/{seller_id}/catalog-images/{page}.jpg")  # noqa: SLF001
    except Exception as exc:  # noqa: BLE001 (any transport failure is the same to the shopper)
        raise ApiError(503, "marketplace_unavailable", "The marketplace isn't answering.") from exc
    if res.status_code != 200:
        raise ApiError(404, "not_found", "No such catalog photo.")
    return res.content
