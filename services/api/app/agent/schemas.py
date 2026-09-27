"""
JSON schemas for model outputs. Strict-mode compatible: every property is
required, optional values are nullable, no additional properties.
"""

ACTIONS = ["search_catalog", "get_product", "read_catalog_image", "request_cart", "propose_cart", "give_up"]

_nullable_str = {"type": ["string", "null"]}

CART_LINE = {
    "type": "object",
    "additionalProperties": False,
    "properties": {"sku": _nullable_str, "item_name": _nullable_str, "quantity": {"type": "integer"}},
    "required": ["sku", "item_name", "quantity"],
}

AGENT_ACTION = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "action": {"type": "string", "enum": ACTIONS},
        "reason": {"type": "string"},
        "query": _nullable_str,
        "seller_id": _nullable_str,
        "sku": _nullable_str,
        "image_url": _nullable_str,
        # request_cart: every item wanted from one seller, so delivery is charged once.
        "lines": {"type": ["array", "null"], "items": CART_LINE},
        "cart_id": _nullable_str,
    },
    "required": ["action", "reason", "query", "seller_id", "sku", "image_url", "lines", "cart_id"],
}

CATALOG_READING = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string"},
                    "brand": _nullable_str,
                    "model": _nullable_str,
                    "pack_size": {"type": ["integer", "null"]},
                    "price_naira": {"type": ["number", "null"]},
                    "unreadable": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name", "brand", "model", "pack_size", "price_naira", "unreadable"],
            },
        },
        "instructions_seen": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["items", "instructions_seen"],
}

# Arguments each action needs; the runtime rejects actions missing them.
REQUIRED_ARGS = {
    "search_catalog": ["query"],
    "get_product": ["seller_id", "sku"],
    "read_catalog_image": ["image_url"],
    "request_cart": ["seller_id", "lines"],
    "propose_cart": ["cart_id"],
    "give_up": [],
}

# ---- intent.compile: the shopper's sentence → draft mandate fields ----------------------------

INTENT_FIELDS = ["item", "brand", "model", "category", "quantity", "max_total_naira", "max_per_item_naira", "seller_rule",
                 "deliver_by_date", "delivery_city", "period", "period_cap_naira"]

INTENT = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "item": {"type": "string"},
        "brand": _nullable_str,
        "model": _nullable_str,
        "category": _nullable_str,
        "quantity": {"type": ["integer", "null"]},
        "max_total_naira": {"type": ["number", "null"]},
        "max_per_item_naira": {"type": ["number", "null"]},
        "seller_rule": {"type": ["string", "null"], "enum": ["verified_only", "verified_and_known", None]},
        "deliver_by_date": _nullable_str,
        "delivery_city": _nullable_str,
        "period": {"type": ["string", "null"], "enum": ["week", "month", None]},
        "period_cap_naira": {"type": ["number", "null"]},
        # One quote per field you filled, copied word for word from the request.
        "evidence": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {"field": {"type": "string", "enum": INTENT_FIELDS}, "quote": {"type": "string"}},
                "required": ["field", "quote"],
            },
        },
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {"field": {"type": "string", "enum": INTENT_FIELDS}, "question": {"type": "string"}},
                "required": ["field", "question"],
            },
        },
    },
    "required": ["item", "brand", "model", "category", "quantity", "max_total_naira", "max_per_item_naira", "seller_rule",
                 "deliver_by_date", "delivery_city", "period", "period_cap_naira", "evidence", "questions"],
}
