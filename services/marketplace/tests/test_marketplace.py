import base64
import json
from datetime import UTC, datetime

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi.testclient import TestClient

from app import carts, images
from app.main import app
from app.sellers import BY_ID, SELLERS

client = TestClient(app)
KEY = {"authorization": "Bearer dev-marketplace-api-key"}


def unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def verify(signed: dict, public_key: str) -> bool:
    body = json.dumps(signed["cart"], sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    try:
        Ed25519PublicKey.from_public_bytes(unb64(public_key)).verify(unb64(signed["signature"]), body)
        return True
    except InvalidSignature:
        return False


def registry() -> dict[str, dict]:
    return {s["id"]: s for s in client.get("/v1/sandbox/registry", headers=KEY).json()}


def test_catalog_size():
    honest = [s for s in SELLERS if not s.adversarial]
    assert len(honest) >= 20
    assert len({s.id for s in SELLERS}) == len(SELLERS)
    assert any(s.catalog_kind == "images" for s in honest) and any(s.catalog_kind == "structured" for s in honest)
    skus = [i.sku for s in SELLERS for i in s.items]
    assert len(skus) == len(set(skus)), "SKUs must be unique across the marketplace"


def test_cart_is_signed_and_adds_up():
    signed = client.post("/v1/sellers/s_ikeja_office/carts", json={"lines": [{"sku": "IOH-TNR-107A", "quantity": 1}], "deliverToCity": "Lagos"}).json()
    cart = signed["cart"]
    assert cart["totalMinor"] == 3_650_000 + 200_000
    assert cart["payee"] == {"bankCode": "101", "accountNumber": "1010000048"}
    assert verify(signed, registry()["s_ikeja_office"]["publicKey"])


def test_tampering_breaks_the_signature():
    signed = client.post("/v1/sellers/s_ikeja_office/carts", json={"lines": [{"sku": "IOH-TNR-107A", "quantity": 1}], "deliverToCity": "Lagos"}).json()
    signed["cart"]["totalMinor"] -= 100_000
    assert not verify(signed, registry()["s_ikeja_office"]["publicKey"])


def test_another_sellers_key_doesnt_verify():
    signed = client.post("/v1/sellers/s_toner_king/carts", json={"lines": [{"sku": "TK-TNR-107A", "quantity": 1}], "deliverToCity": "Lagos"}).json()
    assert not verify(signed, registry()["s_ikeja_office"]["publicKey"])


def test_payee_substitution_pays_an_unregistered_account():
    reg = registry()["s_toner_king"]
    signed = client.post("/v1/sellers/s_toner_king/carts", json={"lines": [{"sku": "TK-TNR-107A", "quantity": 1}], "deliverToCity": "Lagos"}).json()
    assert verify(signed, reg["publicKey"])  # Validly signed by the seller...
    assert signed["cart"]["payee"] not in reg["settlementAccounts"]  # ...but paying someone else.


def test_photo_only_items_are_not_listed_as_structured():
    catalog = client.get("/v1/sellers/s_ada_provisions/catalog").json()
    assert catalog["items"] == []
    assert len(catalog["images"]) == 1
    res = client.get(catalog["images"][0]["url"].replace("http://localhost:8200", ""))
    assert res.status_code == 200 and res.headers["content-type"] == "image/jpeg" and res.content[:2] == b"\xff\xd8"


def test_search_finds_listings_and_photo_catalogs():
    found = client.get("/v1/search", params={"q": "HP 107A toner"}).json()
    sellers = {i["sellerId"] for i in found["items"]}
    assert {"s_ikeja_office", "s_toner_king", "s_kaduna_office"} <= sellers
    assert {"s_printpoint", "s_ikeja_official"} <= {c["sellerId"] for c in found["imageCatalogs"]}


def test_delivery_other_city_costs_more_and_takes_longer():
    now = datetime(2026, 9, 27, 10, 0, tzinfo=UTC)
    same = carts.delivery_quote(BY_ID["s_ikeja_office"], "Lagos", now)
    other = carts.delivery_quote(BY_ID["s_ikeja_office"], "Abuja", now)
    assert other["deliveryFeeMinor"] > same["deliveryFeeMinor"] and other["deliveryBy"] > same["deliveryBy"]
    assert same["deliveryBy"] == "2026-09-29T17:00:00Z"  # 18:00 WAT, two days later
    assert carts.delivery_quote(BY_ID["s_quickdata"], "Kano", now)["deliveryFeeMinor"] == 0


def test_unknown_sku_and_sandbox_key():
    assert client.post("/v1/sellers/s_ikeja_office/carts", json={"lines": [{"sku": "NOPE", "quantity": 1}], "deliverToCity": "Lagos"}).status_code == 404
    assert client.get("/v1/sandbox/registry").status_code == 401


def test_images_render_deterministically():
    s = BY_ID["s_printpoint"]
    assert images.render(s, 0) == images.render(s, 0)
    labels = client.get("/v1/sandbox/catalog-labels", headers=KEY).json()
    assert sum(len(page["items"]) for page in labels) == sum(len(x.image_items) for x in SELLERS)
    assert any(page["hiddenText"] for page in labels)


def test_photo_catalog_items_can_be_ordered_by_name():
    signed = client.post("/v1/sellers/s_ada_provisions/carts", json={"lines": [{"itemName": "Vegetable oil, 5 litres", "quantity": 2}], "deliverToCity": "Lagos"}).json()
    assert signed["cart"]["lines"][0]["sku"] == "ADA-OIL-5L" and signed["cart"]["lines"][0]["quantity"] == 2
    partial = client.post("/v1/sellers/s_ada_provisions/carts", json={"lines": [{"itemName": "powdered milk", "quantity": 1}], "deliverToCity": "Lagos"}).json()
    assert partial["cart"]["lines"][0]["sku"] == "ADA-MILK"
    ambiguous = client.post("/v1/sellers/s_ada_provisions/carts", json={"lines": [{"itemName": "carton", "quantity": 1}], "deliverToCity": "Lagos"})
    assert ambiguous.status_code == 409
