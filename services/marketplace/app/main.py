"""
Sandbox marketplace: the sellers an AI shopper buys from (system_design.md §5, M4).

Public endpoints are what an agent uses: browse sellers, search listings, open
catalog images, get a delivery quote and request a cart signed with the seller's
Ed25519 key. Sandbox endpoints (API key) are for the platform: the seller
registry it syncs its directory from, and ground-truth labels for evaluation.

Three sellers are dishonest on purpose (payee substitution, look-alike, bait and
switch). Their behaviour lives in app/sellers.py.
"""

from datetime import UTC, datetime, timedelta

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app import carts, images
from app.config import get_settings
from app.sellers import BY_ID, SELLERS, Item, Seller
from app.signing import key_id, public_key_b64

app = FastAPI(
    title="Sandbox marketplace",
    version="0.1.0",
    description="Sellers, catalogs (structured and photo-only), delivery quotes and seller-signed carts for Mandate Gate.",
)


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class CartLineIn(Schema):
    """By SKU, or by the item's name as printed in a photo catalog (which has no SKUs)."""

    sku: str | None = None
    item_name: str | None = Field(default=None, max_length=200)
    quantity: int = Field(ge=1, le=100)


class CartIn(Schema):
    lines: list[CartLineIn]
    deliver_to_city: str = Field(min_length=2, max_length=60)


class QuoteIn(Schema):
    city: str = Field(min_length=2, max_length=60)


@app.exception_handler(carts.CartError)
async def cart_error(_req, exc: carts.CartError):
    return JSONResponse(status_code=exc.status, content={"error": exc.code, "message": exc.message})


def require_key(authorization: str | None = Header(default=None)) -> None:
    if authorization != f"Bearer {get_settings().marketplace_api_key}":
        raise HTTPException(status_code=401, detail="Sandbox endpoints need the marketplace API key.")


def seller_or_404(seller_id: str) -> Seller:
    seller = BY_ID.get(seller_id)
    if seller is None:
        raise HTTPException(status_code=404, detail="No such seller.")
    return seller


def image_url(seller: Seller, page: int) -> str:
    return f"{get_settings().marketplace_public_url}/v1/sellers/{seller.id}/catalog-images/{page}.jpg"


def item_out(seller: Seller, item: Item) -> dict:
    return {
        "sku": item.sku, "sellerId": seller.id, "sellerName": seller.display_name, "name": item.name, "brand": item.brand,
        "model": item.model, "category": item.category, "packSize": item.pack_size, "unitPriceMinor": item.unit_price_minor,
        "inStock": item.in_stock, "description": item.description,
    }


def seller_out(seller: Seller) -> dict:
    return {
        "id": seller.id, "displayName": seller.display_name, "category": seller.category, "city": seller.city,
        "catalogKind": seller.catalog_kind,
        # Published delivery terms (the signed cart has the exact fee and date).
        "deliveryFeeMinor": seller.delivery_fee_naira * 100, "deliveryDays": seller.delivery_days,
    }


def caption(items) -> str:
    """What a seller writes under a flyer post: the products it shows, briefly ("Rice, Vegetable oil, ...")."""
    return ", ".join(i.name.split(",")[0].split("(")[0].strip() for i in items)


def image_catalogs(seller: Seller) -> list[dict]:
    topics = sorted({i.category for i in seller.image_items})
    return [
        {"sellerId": seller.id, "sellerName": seller.display_name, "page": n, "url": image_url(seller, n), "topics": topics,
         "caption": caption(page_items)}
        for n, page_items in enumerate(images.pages(seller))
    ]


STOP_WORDS = {"of", "and", "the", "for", "with", "a", "an", "bag", "pack", "litres", "liters", "kg", "50kg", "carton", "box"}


def _words(text: str) -> set[str]:
    return {w for w in "".join(c.lower() if c.isalnum() else " " for c in text).split() if len(w) > 1}


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict:
    return {"ok": True}


# ---- Public: what an agent browses --------------------------------------------------


@app.get("/v1/sellers")
def list_sellers() -> list[dict]:
    return [seller_out(s) for s in SELLERS]


@app.get("/v1/sellers/{seller_id}")
def get_seller(seller_id: str) -> dict:
    return seller_out(seller_or_404(seller_id))


@app.get("/v1/sellers/{seller_id}/catalog")
def seller_catalog(seller_id: str) -> dict:
    """Structured listings, plus links to catalog images the agent has to read."""
    s = seller_or_404(seller_id)
    return {"seller": seller_out(s), "items": [item_out(s, i) for i in s.structured_items], "images": image_catalogs(s)}


@app.get("/v1/sellers/{seller_id}/products/{sku}")
def product(seller_id: str, sku: str) -> dict:
    s = seller_or_404(seller_id)
    item = next((i for i in s.structured_items if i.sku == sku), None)
    if item is None:
        raise HTTPException(status_code=404, detail="No such product in the structured catalog.")
    return item_out(s, item)


@app.get("/v1/search")
def search(q: str = Query(min_length=2, max_length=120), category: str | None = None) -> dict:
    """
    Listings whose name, brand, model or category share a word with the query,
    best matches first; and every photo catalog whose topics match, since what
    a photo contains can only be known by reading it.
    """
    wanted = _words(q) - STOP_WORDS
    items, catalogs = [], []
    for s in SELLERS:
        for i in s.structured_items:
            if category and i.category.lower() != category.lower():
                continue
            score = len(wanted & _words(" ".join(x for x in (i.name, i.brand, i.model, i.category) if x)))
            if score:
                items.append((score, item_out(s, i)))
        for page in image_catalogs(s):  # Matched on the seller's caption and topics: the photo itself must be read.
            page_words = _words(" ".join(page["topics"]) + " " + s.category + " " + page["caption"])
            if (wanted & page_words) and (not category or category.lower() in page_words):
                catalogs.append(page)
    items.sort(key=lambda pair: (-pair[0], pair[1]["unitPriceMinor"]))
    return {"query": q, "items": [i for _, i in items], "imageCatalogs": catalogs}


@app.get("/v1/sellers/{seller_id}/catalog-images/{page}.jpg")
def catalog_image(seller_id: str, page: int) -> Response:
    s = seller_or_404(seller_id)
    if page < 0 or page >= len(images.pages(s)):
        raise HTTPException(status_code=404, detail="No such catalog page.")
    return Response(images.render(s, page), media_type="image/jpeg", headers={"cache-control": "public, max-age=3600"})


@app.post("/v1/sellers/{seller_id}/delivery-quote")
def quote(seller_id: str, body: QuoteIn) -> dict:
    return carts.delivery_quote(seller_or_404(seller_id), body.city, datetime.now(UTC))


@app.post("/v1/sellers/{seller_id}/carts")
def create_cart(seller_id: str, body: CartIn) -> dict:
    """A binding offer, signed with the seller's key. The platform checks it against its own records."""
    s = seller_or_404(seller_id)
    return carts.create_cart(s, [line.model_dump() for line in body.lines], body.deliver_to_city)


@app.get("/v1/carts/{cart_id}")
def get_cart(cart_id: str) -> dict:
    signed = carts.get_cart(cart_id)
    if signed is None:
        raise HTTPException(status_code=404, detail="No such cart.")
    return signed


# ---- Sandbox: for the platform only ------------------------------------------------------


@app.get("/v1/sandbox/registry", dependencies=[Depends(require_key)])
def registry() -> list[dict]:
    """What each seller registers with the platform: legal name, public key, settlement account."""
    now = datetime.now(UTC)
    return [
        {
            **seller_out(s),
            "legalName": s.legal_name,
            "sandboxTier": s.sandbox_tier,
            "publicKey": public_key_b64(s.id),
            "keyId": key_id(s.id),
            "settlementAccounts": [{"bankCode": s.settlement.bank_code, "accountNumber": s.settlement.account_number}],
            "joinedAt": carts.iso(now - timedelta(days=s.joined_days_ago)),
            "adversarial": s.adversarial,
            "behaviour": s.behaviour,
            "ownerUsername": s.owner_username,
        }
        for s in SELLERS
    ]


@app.get("/v1/sandbox/sellers/{seller_id}/items", dependencies=[Depends(require_key)])
def all_items(seller_id: str) -> list[dict]:
    """Every item, including those only published in photos (ground truth)."""
    s = seller_or_404(seller_id)
    return [{**item_out(s, i), "source": i.source} for i in s.items]


@app.get("/v1/sandbox/catalog-labels", dependencies=[Depends(require_key)])
def catalog_labels() -> list[dict]:
    """Ground truth for each catalog image: exactly what it shows. For evaluating image reading."""
    out = []
    for s in SELLERS:
        for n, page_items in enumerate(images.pages(s)):
            out.append({
                "sellerId": s.id, "page": n, "url": image_url(s, n),
                "items": [{"name": i.name, "brand": i.brand, "model": i.model, "packSize": i.pack_size, "unitPriceMinor": i.unit_price_minor}
                          for i in page_items],
                "hiddenText": s.hidden_text,
            })
    return out
