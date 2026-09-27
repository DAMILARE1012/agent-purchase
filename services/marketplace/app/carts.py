"""Delivery quotes and signed carts."""

import secrets
from datetime import UTC, datetime, time, timedelta

from app.config import get_settings
from app.sellers import Seller
from app.signing import key_id, sign

WAT = timedelta(hours=1)  # West Africa Time, UTC+1, no daylight saving.


class CartError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def delivery_quote(seller: Seller, city: str, now: datetime) -> dict:
    """Same-city delivery at the seller's fee; other cities cost more and take a day longer. Deliveries land at 18:00 WAT."""
    same_city = city.strip().lower() == seller.city.lower()
    fee = seller.delivery_fee_naira
    if not same_city and fee:  # Digital goods (fee 0) cost nothing to deliver anywhere.
        fee = fee * 2 + 1_000
    days = seller.delivery_days + (0 if same_city else 1)
    local_day = (now + WAT).date() + timedelta(days=days)
    deliver_by = datetime.combine(local_day, time(18, 0), tzinfo=UTC) - WAT
    return {"sellerId": seller.id, "city": city, "deliveryFeeMinor": fee * 100, "deliveryBy": iso(deliver_by)}


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


# Carts the marketplace has issued, so they can be fetched again. In memory: the sandbox restarts clean.
_CARTS: dict[str, dict] = {}


def _norm(text: str) -> str:
    return " ".join("".join(c.lower() if c.isalnum() else " " for c in text).split())


def find_item(seller: Seller, sku: str | None, item_name: str | None):
    """
    Finds the item a line asks for. Photo catalogs have no SKUs, so a line can name
    the item the way a buyer would in a chat: the name as printed, or enough of it
    to pick out exactly one item.
    """
    if sku:
        item = next((i for i in seller.items if i.sku == sku), None)
        if item is None:
            raise CartError(404, "unknown_sku", f"{seller.display_name} doesn't sell {sku}.")
        return item
    if not item_name:
        raise CartError(422, "no_item", "Each line needs a SKU or an item name.")
    wanted = _norm(item_name)
    exact = [i for i in seller.items if _norm(i.name) == wanted]
    if len(exact) == 1:
        return exact[0]
    partial = [i for i in seller.items if wanted and (wanted in _norm(i.name) or _norm(i.name) in wanted)]
    if len(partial) == 1:
        return partial[0]
    if not partial:
        raise CartError(404, "unknown_item", f"{seller.display_name} doesn't sell “{item_name}”.")
    raise CartError(409, "ambiguous_item", f"“{item_name}” matches {len(partial)} items at {seller.display_name}. Use the full name.")


def create_cart(seller: Seller, lines: list[dict], city: str, now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    if not lines:
        raise CartError(422, "empty_cart", "A cart needs at least one line.")
    cart_lines = []
    for line in lines:
        item = find_item(seller, line.get("sku"), line.get("item_name"))
        if not item.in_stock:
            raise CartError(409, "out_of_stock", f"{item.name} is out of stock.")
        qty = int(line["quantity"])
        if qty < 1 or qty > 100:
            raise CartError(422, "bad_quantity", "Quantity must be between 1 and 100.")
        cart_lines.append({
            "sku": item.sku, "name": item.name, "brand": item.brand, "model": item.model, "category": item.category,
            "packSize": item.pack_size, "quantity": qty, "unitPriceMinor": item.unit_price_minor,
            "lineTotalMinor": item.unit_price_minor * qty,
        })

    quote = delivery_quote(seller, city, now)
    payee = seller.cart_payee or seller.settlement
    payload = {
        "cartId": f"cart_{secrets.token_hex(8)}",
        "sellerId": seller.id,
        "sellerName": seller.display_name,
        "lines": cart_lines,
        "deliveryFeeMinor": quote["deliveryFeeMinor"],
        "totalMinor": sum(line["lineTotalMinor"] for line in cart_lines) + quote["deliveryFeeMinor"],
        "currency": "NGN",
        "deliverTo": {"city": city},
        "deliveryBy": quote["deliveryBy"],
        "payee": {"bankCode": payee.bank_code, "accountNumber": payee.account_number},
        "issuedAt": iso(now),
        "expiresAt": iso(now + timedelta(minutes=get_settings().cart_ttl_minutes)),
        "keyId": key_id(seller.id),
    }
    signed = {"cart": payload, "signature": sign(seller.id, payload), "algorithm": "Ed25519"}
    _CARTS[payload["cartId"]] = signed
    return signed


def get_cart(cart_id: str) -> dict | None:
    return _CARTS.get(cart_id)
