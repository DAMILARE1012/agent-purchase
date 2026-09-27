"""
The sandbox provider's script (not a model). Used when no GROQ_API_KEY is set.

It shops the way a reasonable but gullible agent might, so the rest of the
system has something realistic to run: search, read up to two relevant photo
catalogs, then request a cart for the cheapest matching item from a seller the
mandate allows, unless a seller's text claims it is verified or official, in
which case the script is "fooled" and tries it anyway (the gate should catch
that). "Reading" a photo means looking up the marketplace's ground truth.
"""

import math
import re

from app.agent import tools


def _act(action: str, reason: str, **args) -> dict:
    out = {k: None for k in ("query", "seller_id", "sku", "image_url", "lines", "cart_id")}
    out.update(args)
    return {"action": action, "reason": reason, **out}


def _words(text: str | None) -> set[str]:
    return {w for w in "".join(c.lower() if c.isalnum() else " " for c in (text or "")).split() if len(w) > 2}


def _matches(L: dict, name: str, brand: str | None, model: str | None, category: str | None) -> bool:
    if L.get("brand") and (brand or "").upper() != L["brand"].upper():
        return False
    # Deliberately loose on model ("107A-compatible" passes): the gate checks it exactly.
    if L.get("model") and not (model or "").upper().startswith(L["model"].upper()):
        return False
    if L.get("category") and category and category.lower() != L["category"].lower():
        return False
    if not (L.get("brand") or L.get("model") or L.get("category")):
        return bool(_words(L.get("item")) & _words(name))
    return True


def _allowed(L: dict, seller_id: str, tier: str) -> bool:
    policy = L.get("sellerPolicy", "verified_only")
    if policy == "listed":
        return seller_id in (L.get("sellerIds") or [])
    return tier == "verified" or (policy == "verified_and_known" and tier == "known")


def _candidates(state: dict) -> list[dict]:
    L = state["mandate"]
    refused = set(state.get("refused") or [])
    out = []
    for i in state["items"]:
        out.append({"seller_id": i["sellerId"], "sku": i["sku"], "item_name": None, "name": i["name"], "brand": i["brand"], "model": i["model"],
                    "category": i["category"], "pack": i["packSize"], "price": i["unitPriceMinor"], "tier": i["tier"], "injection": i["injection"]})
    for items in state["images_read"].values():
        for i in items:
            if i.get("price_naira") is None:
                continue
            out.append({"seller_id": i["seller_id"], "sku": None, "item_name": i["name"], "name": i["name"], "brand": i["brand"], "model": i["model"],
                        "category": None, "pack": i.get("pack_size") or 1, "price": round(i["price_naira"] * 100), "tier": i["tier"],
                        "injection": i["injection"]})
    fooled = lambda c: c["injection"] >= 0.5  # noqa: E731 - a seller's claim got through
    usable = [c for c in out if c["seller_id"] not in refused and _matches(L, c["name"], c["brand"], c["model"], c["category"])
              and (_allowed(L, c["seller_id"], c["tier"]) or fooled(c))]
    qty = L.get("quantity", 1)
    return sorted(usable, key=lambda c: c["price"] * math.ceil(qty / max(1, c["pack"])))


def next_action(state: dict) -> dict:
    L = state["mandate"]
    if not state.get("searched"):
        return _act("search_catalog", "Start by searching the marketplace for the item.", query=L.get("item"))

    wanted = _words(L.get("item")) | _words(L.get("category"))
    unread = [c for c in state["image_catalogs"] if c["url"] not in state["images_read"] and (wanted & _words(" ".join(c.get("topics", []))))]
    if len(state["images_read"]) < 2 and unread:
        return _act("read_catalog_image", "Photo catalogs often have better prices; read one before deciding.", image_url=unread[0]["url"])

    if not state["carts"]:
        cands = _candidates(state)
        if not cands:
            return _act("give_up", "No listing from an allowed seller matches the mandate.")
        best = cands[0]
        qty = math.ceil(L.get("quantity", 1) / max(1, best["pack"]))
        return _act("request_cart", f"Cheapest matching item: {best['name']}.", seller_id=best["seller_id"],
                    lines=[{"sku": best["sku"], "item_name": best["item_name"], "quantity": qty}])

    cart = state["carts"][-1]
    if cart["total_minor"] <= L.get("maxTotalMinor", 0):
        return _act("propose_cart", "The cart is within the limit.", cart_id=cart["cart_id"])
    return _act("give_up", "The cheapest cart, with delivery, is over the maximum total.")


def read_image(state: dict) -> dict:
    url = state.get("image_url")
    page = next((p for p in tools.catalog_labels() if p["url"] == url), None)
    if page is None:
        return {"items": [], "instructions_seen": []}
    return {
        "items": [{"name": i["name"], "brand": i["brand"], "model": i["model"], "pack_size": i["packSize"],
                   "price_naira": i["unitPriceMinor"] / 100, "unreadable": []} for i in page["items"]],
        "instructions_seen": [page["hiddenText"]] if page.get("hiddenText") else [],
    }


def compile_intent(state: dict) -> dict:
    """
    Stand-in for intent.compile: the rule-based draft, in the model's output format.
    Each clause of the request is offered as evidence (then the whole request);
    grounding keeps the first quote that supports the value, as a model's short quote would.
    """
    L, request = state["rules"]["limits"], state["request"]
    naira = lambda minor: None if not minor else minor / 100  # noqa: E731
    out = {
        "item": L["item"], "brand": L["brand"], "model": L["model"], "category": L["category"], "quantity": L["quantity"],
        "max_total_naira": naira(L["maxTotalMinor"]), "max_per_item_naira": naira(L["maxPerItemMinor"]),
        "seller_rule": None if "sellerPolicy" in state["rules"]["defaulted"] else L["sellerPolicy"],
        "deliver_by_date": None, "delivery_city": None, "period": L["period"], "period_cap_naira": naira(L["periodCapMinor"]),
        "questions": [],
    }
    clauses = [c.strip() for c in re.split(r",(?!\d)| and ", request) if c.strip()] + [request]
    out["evidence"] = [{"field": f, "quote": c} for f, v in out.items() if f != "questions" and v is not None for c in clauses]
    return out
