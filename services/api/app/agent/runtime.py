"""
The agent runtime: runs one AI shopping run (system_design.md §3 step 2, M5).

The model chooses one action at a time as strict JSON; this runtime executes it
through pinned tools and feeds the result back. Seller content is wrapped in
<seller_content> and marked untrusted; facts from the platform (seller tiers,
refused sellers) come in <platform> blocks. The model can never pay: a proposed
cart goes to the gate, and the run ends there.

Every step is written to run_steps as it happens, and published so the shopper
sees it live.
"""

import json
import logging
import math
import time
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent import injection, releases, tools
from app.agent.releases import Release
from app.agent.schemas import AGENT_ACTION, CATALOG_READING, REQUIRED_ARGS
from app.config import get_settings
from app.db import SessionLocal
from app.formatting import now
from app.llm import gateway
from app.llm.gateway import BudgetExceeded, LlmRequest, LlmResult, LlmUnavailable
from app.models import AgentRun, Mandate, Merchant, RunStep
from app.services import gate, mandates, network, runqueue
from app.services.merchants import accounts_of

log = logging.getLogger("api.agent")


def _naira(minor: int | None) -> float | None:
    return None if minor is None else minor / 100


def _money(minor: int) -> str:
    return f"₦{minor / 100:,.0f}" if minor % 100 == 0 else f"₦{minor / 100:,.2f}"


@dataclass
class Ctx:
    db: Session
    run: AgentRun
    mandate: Mandate
    release: Release
    deadline: float
    messages: list[dict] = field(default_factory=list)
    seq: int = 0
    tiers: dict[str, str] = field(default_factory=dict)
    names: dict[str, str] = field(default_factory=dict)
    image_urls: dict[str, str] = field(default_factory=dict)  # url -> seller_id (the allowlist)
    carts: dict[str, dict] = field(default_factory=dict)  # cart_id -> signed cart
    # What the sandbox provider's script needs; real models only see the messages.
    state: dict = field(default_factory=dict)
    # Evaluations turn the answer cache off, so every step's cost and latency are real.
    cacheable: bool = True


# ---- Entry point ----------------------------------------------------------------------------------------


def execute(run_id: str, *, cacheable: bool = True, timeout_s: int | None = None) -> None:
    with SessionLocal() as db:
        run = db.get(AgentRun, run_id)
        if run is None or run.status != "queued":
            return
        mandate = mandates.refresh_status(db.get(Mandate, run.mandate_id))
        if mandate.status != "active":
            _finish(db, run, "declined", "The mandate can't be used any more. Nothing was paid.")
            return
        run.status, run.began_at = "running", now()
        db.commit()
        runqueue.publish(run.id)
        settings = get_settings()
        ctx = Ctx(db=db, run=run, mandate=mandate, release=releases.get(run.release_id),
                  deadline=time.monotonic() + (timeout_s or settings.agent_run_timeout_seconds), cacheable=cacheable)
        try:
            _loop(ctx)
        except BudgetExceeded as exc:
            _finish(db, run, "failed", str(exc))
        except LlmUnavailable as exc:
            log.warning("Run %s: model unavailable: %s", run.id, exc)
            _finish(db, run, "failed", "The AI model isn't available right now. Nothing was paid. Try again in a few minutes.", error=str(exc))
        except Exception as exc:
            log.exception("Run %s failed", run.id)
            db.rollback()
            _finish(db, db.get(AgentRun, run_id), "failed", "Something went wrong while shopping. Nothing was paid.", error=repr(exc))


def _finish(db: Session, run: AgentRun, status: str, note: str | None, error: str | None = None) -> None:
    run.status, run.outcome_note, run.ended_at = status, note, now()
    if error:
        run.error = error[:4000]
    db.commit()
    runqueue.publish(run.id)


def _cancelled(ctx: Ctx) -> bool:
    ctx.db.refresh(ctx.run, attribute_names=["status"])
    return ctx.run.status != "running"


# ---- The loop ------------------------------------------------------------------------------------------------


def _mandate_block(ctx: Ctx) -> str:
    L = ctx.mandate.limits
    refused = sorted({r.signed_cart["cart"]["sellerId"] for r in ctx.db.scalars(
        select(AgentRun).where(AgentRun.mandate_id == ctx.mandate.id, AgentRun.status == "blocked")) if r.signed_cart})
    ctx.state["refused"] = refused
    data = {
        "item": L.get("item"), "brand": L.get("brand"), "model": L.get("model"), "category": L.get("category"),
        "quantity": L.get("quantity", 1), "max_total_naira_including_delivery": _naira(L.get("maxTotalMinor")),
        "max_per_item_naira": _naira(L.get("maxPerItemMinor")), "seller_rule": L.get("sellerPolicy"),
        "allowed_seller_ids": L.get("sellerIds") or None, "deliver_by": L.get("deliverBy"), "delivery_city": L.get("deliveryCity", "Lagos"),
        "sellers_refused_by_the_gate": refused,
    }
    return f"<mandate>\n{json.dumps(data, ensure_ascii=False)}\n</mandate>"


def _loop(ctx: Ctx) -> None:
    settings = get_settings()
    system = releases.prompt("agent.step", ctx.release.prompts["agent.step"]) + "\n\n" + _mandate_block(ctx)
    ctx.messages = [{"role": "system", "content": system}, {"role": "user", "content": "Start shopping. Reply with your first action."}]
    ctx.state.update({"mandate": ctx.mandate.limits, "searched": False, "items": [], "image_catalogs": [], "images_read": {}, "carts": []})

    for _ in range(settings.agent_max_steps):
        if _cancelled(ctx):
            return
        if ctx.run.tokens >= settings.agent_max_tokens_per_run:
            _finish(ctx.db, ctx.run, "gave_up", "Stopped at the token budget for one run. Nothing was paid.")
            return
        decision = gateway.complete(LlmRequest(
            task="agent.step", prompt_version=ctx.release.prompts["agent.step"], messages=ctx.messages, schema=AGENT_ACTION,
            schema_name="agent_action", models=ctx.release.route("agent.step"), params=ctx.release.params["agent.step"],
            user_id=ctx.run.user_id, run_id=ctx.run.id, priority=ctx.run.priority, sandbox_state=ctx.state, deadline=ctx.deadline,
            cacheable=ctx.cacheable,
        ))
        action = decision.output
        ctx.messages.append({"role": "assistant", "content": json.dumps(action, ensure_ascii=False)})
        done, observation = _dispatch(ctx, action, decision)
        if done:
            return
        ctx.messages.append({"role": "user", "content": observation})
    _finish(ctx.db, ctx.run, "gave_up", "Stopped at the step limit without a cart. Nothing was paid.")


def _record(ctx: Ctx, kind: str, summary: str, calls: list[LlmResult], *, seller_id: str | None = None, untrusted: bool = False,
            injection_score: float | None = None, detail: dict | None = None, tool_ms: int = 0) -> None:
    ctx.seq += 1
    tokens_in = sum(c.tokens_in for c in calls)
    tokens_out = sum(c.tokens_out for c in calls)
    latency = sum(c.latency_ms for c in calls) + tool_ms
    cost = sum(c.cost_micro_usd for c in calls)
    models = sorted({c.model for c in calls})
    if calls and all(c.cached for c in calls):
        detail = {**(detail or {}), "cached": True}
    ctx.db.add(RunStep(
        run_id=ctx.run.id, seq=ctx.seq, kind=kind, summary=summary[:1000], seller_id=seller_id, untrusted=untrusted,
        injection_score=injection_score, model=", ".join(models) if models else None, tokens_in=tokens_in, tokens_out=tokens_out,
        latency_ms=latency, cost_micro_usd=cost, detail=detail,
    ))
    ctx.run.tokens += tokens_in + tokens_out
    ctx.run.cost_micro_usd += cost
    ctx.run.latency_ms += latency
    ctx.db.commit()
    runqueue.publish(ctx.run.id)


def _tool_result(name: str, *, platform: dict | None = None, seller: dict | None = None, seller_id: str | None = None, error: str | None = None) -> str:
    parts = [f'<tool_result action="{name}">']
    if error:
        parts.append(f"<error>{error}</error>")
    if platform is not None:
        parts.append(f"<platform>{json.dumps(platform, ensure_ascii=False)}</platform>")
    if seller is not None:
        attr = f' seller="{seller_id}"' if seller_id else ""
        parts.append(f"<seller_content{attr}>{json.dumps(seller, ensure_ascii=False)}</seller_content>")
    parts.append("</tool_result>")
    return "\n".join(parts)


def _tier(ctx: Ctx, seller_id: str) -> str:
    if seller_id not in ctx.tiers:
        m = ctx.db.get(Merchant, seller_id)
        ctx.tiers[seller_id] = m.tier if m else "unknown"
        ctx.names[seller_id] = m.display_name if m else seller_id
    return ctx.tiers[seller_id]


def _dispatch(ctx: Ctx, a: dict, decision: LlmResult) -> tuple[bool, str]:
    kind = a["action"]
    missing = [k for k in REQUIRED_ARGS[kind] if a.get(k) in (None, "")]
    if kind == "request_cart" and a.get("lines") and not all(ln.get("sku") or ln.get("item_name") for ln in a["lines"]):
        missing.append("sku or item_name on every line")
    if missing:
        _record(ctx, kind, f"Invalid action: {kind} without {', '.join(missing)}", [decision])
        return False, _tool_result(kind, error=f"{kind} needs {', '.join(missing)}.")
    started = time.monotonic()
    try:
        return {
            "search_catalog": _search, "get_product": _product, "read_catalog_image": _read_image,
            "request_cart": _request_cart, "propose_cart": _propose, "give_up": _give_up,
        }[kind](ctx, a, decision, started)
    except tools.ToolError as exc:
        _record(ctx, kind, f"{kind.replace('_', ' ').capitalize()} failed: {exc}", [decision], seller_id=a.get("seller_id"),
                tool_ms=int((time.monotonic() - started) * 1000))
        return False, _tool_result(kind, error=str(exc))


def _ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)


def _search(ctx: Ctx, a: dict, decision: LlmResult, started: float) -> tuple[bool, str]:
    found = tools.search(a["query"])
    items = found["items"][:15]
    catalogs = found["imageCatalogs"][:8]
    listings, scores = [], [0.0]
    for i in items:
        tier = _tier(ctx, i["sellerId"])
        score = injection.score(i["name"], i.get("description"))
        scores.append(score)
        listings.append({"seller_id": i["sellerId"], "sku": i["sku"], "name": i["name"], "brand": i["brand"], "model": i["model"],
                         "category": i["category"], "pack_size": i["packSize"], "price_naira": _naira(i["unitPriceMinor"]),
                         "description": i.get("description") or None})
        ctx.state["items"].append({**i, "tier": tier, "injection": score, "source": "structured"})
    photos = []
    for c in catalogs:
        tier = _tier(ctx, c["sellerId"])
        ctx.image_urls[c["url"]] = c["sellerId"]
        photos.append({"seller_id": c["sellerId"], "image_url": c["url"], "topics": c["topics"]})
        ctx.state["image_catalogs"].append({**c, "tier": tier})
    ctx.state["searched"] = True
    sellers = {sid: {"name": ctx.names[sid], "platform_tier": ctx.tiers[sid]} for sid in {x["seller_id"] for x in listings + photos}}
    _record(ctx, "search_catalog", f"Searched for “{a['query']}”: {len(items)} listings, {len(photos)} photo catalogs", [decision],
            untrusted=True, injection_score=max(scores), detail={"query": a["query"]}, tool_ms=_ms(started))
    return False, _tool_result("search_catalog", platform={"sellers": sellers}, seller={"listings": listings, "photo_catalogs": photos})


def _product(ctx: Ctx, a: dict, decision: LlmResult, started: float) -> tuple[bool, str]:
    p = tools.product(a["seller_id"], a["sku"])
    tier = _tier(ctx, p["sellerId"])
    score = injection.score(p["name"], p.get("description"))
    _record(ctx, "get_product", f"Opened “{p['name']}” at {ctx.names[p['sellerId']]}", [decision], seller_id=p["sellerId"],
            untrusted=True, injection_score=score, tool_ms=_ms(started))
    seller_view = {k: p.get(k) for k in ("sku", "name", "brand", "model", "category", "description")}
    seller_view.update({"pack_size": p["packSize"], "price_naira": _naira(p["unitPriceMinor"]), "in_stock": p["inStock"]})
    return False, _tool_result("get_product", platform={"seller": {"id": p["sellerId"], "name": ctx.names[p["sellerId"]], "platform_tier": tier}},
                               seller=seller_view, seller_id=p["sellerId"])


def _read_image(ctx: Ctx, a: dict, decision: LlmResult, started: float) -> tuple[bool, str]:
    url = a["image_url"]
    seller_id = ctx.image_urls.get(url)
    if seller_id is None:
        raise tools.ToolError("Only photo catalogs from search results can be read. Search first, then use one of their image_url values.")
    ctx.state["image_url"] = url
    reading = read_catalog_image(ctx.release, url, user_id=ctx.run.user_id, run_id=ctx.run.id, priority=ctx.run.priority,
                                 deadline=ctx.deadline, cacheable=ctx.cacheable)
    items = reading.output["items"]
    seen = reading.output["instructions_seen"]
    score = injection.score(" ".join(seen), *[i["name"] for i in items])
    ctx.state["images_read"][url] = [{**i, "seller_id": seller_id, "tier": _tier(ctx, seller_id), "injection": score} for i in items]
    warning = "; it contains text addressed to AI assistants" if seen else ""
    _record(ctx, "read_catalog_image", f"Read a photo catalog from {ctx.names[seller_id]}: {len(items)} items{warning}", [decision, reading],
            seller_id=seller_id, untrusted=True, injection_score=score, detail={"image_url": url, "instructions_seen": seen}, tool_ms=_ms(started))
    return False, _tool_result(
        "read_catalog_image",
        platform={"seller": {"id": seller_id, "name": ctx.names[seller_id], "platform_tier": ctx.tiers[seller_id]},
                  "note": "Order photo-catalog items with item_name, as printed."},
        seller={"items": items, "text_addressed_to_ai_in_image": seen}, seller_id=seller_id,
    )


def _request_cart(ctx: Ctx, a: dict, decision: LlmResult, started: float) -> tuple[bool, str]:
    lines = [
        {"quantity": max(1, min(100, int(ln["quantity"]))), **({"sku": ln["sku"]} if ln.get("sku") else {"itemName": ln["item_name"]})}
        for ln in a["lines"][:10]
    ]
    signed = tools.create_cart(a["seller_id"], lines, ctx.mandate.limits.get("deliveryCity", "Lagos"))
    cart = signed["cart"]
    ctx.carts[cart["cartId"]] = signed
    ctx.state["carts"].append({"cart_id": cart["cartId"], "seller_id": cart["sellerId"], "total_minor": cart["totalMinor"]})
    tier = _tier(ctx, cart["sellerId"])
    what = ", ".join(f"{ln['quantity']} × {ln['name']}" for ln in cart["lines"])
    _record(ctx, "request_cart", f"Asked {ctx.names[cart['sellerId']]} for a cart: {what}: {_money(cart['totalMinor'])}",
            [decision], seller_id=cart["sellerId"], untrusted=True, injection_score=injection.score(*[ln["name"] for ln in cart["lines"]]),
            detail={"cartId": cart["cartId"]}, tool_ms=_ms(started))
    view = {
        "cart_id": cart["cartId"], "delivery_by": cart["deliveryBy"], "delivery_fee_naira": _naira(cart["deliveryFeeMinor"]),
        "total_naira": _naira(cart["totalMinor"]), "payee": {"bank_code": cart["payee"]["bankCode"], "account_last4": cart["payee"]["accountNumber"][-4:]},
        "lines": [{"name": ln["name"], "brand": ln["brand"], "model": ln["model"], "pack_size": ln["packSize"], "quantity": ln["quantity"],
                   "unit_price_naira": _naira(ln["unitPriceMinor"]), "line_total_naira": _naira(ln["lineTotalMinor"])} for ln in cart["lines"]],
    }
    return False, _tool_result("request_cart", platform={"seller": {"id": cart["sellerId"], "platform_tier": tier},
                                                        "note": "The gate verifies the signature and payee when you propose."},
                               seller=view, seller_id=cart["sellerId"])


def _propose(ctx: Ctx, a: dict, decision: LlmResult, started: float) -> tuple[bool, str]:
    signed = ctx.carts.get(a["cart_id"])
    if signed is None:
        raise tools.ToolError("That cart_id isn't one you requested in this run.")
    cart = signed["cart"]
    _record(ctx, "propose_cart", f"Proposed the cart: {_money(cart['totalMinor'])}. {a.get('reason') or ''}".strip(), [decision],
            seller_id=cart["sellerId"], tool_ms=_ms(started))
    t0 = time.monotonic()
    verdict = gate.decide(ctx.db, ctx.mandate, signed)
    failed = [c["label"].lower() for c in verdict["checks"] if c["result"] == "fail"]
    summary = {"deny": f"Gate refused the cart: {'; '.join(failed)}", "allow": "Gate allowed the cart: every check passed",
               "needs_approval": "Gate allowed the cart, with warnings for you to review"}[verdict["outcome"]]
    _record(ctx, "gate", summary, [], seller_id=cart["sellerId"], tool_ms=_ms(t0), detail={"gateVersion": verdict["gateVersion"]})

    ctx.run.signed_cart, ctx.run.cart_id = signed, cart["cartId"]
    ctx.run.cart_view = cart_view(ctx.db, signed, verdict)
    ctx.run.decision = decision_view(verdict)
    if verdict["outcome"] == "deny":
        details = [c["detail"] for c in verdict["checks"] if c["result"] == "fail"]
        _finish(ctx.db, ctx.run, "blocked", ". ".join(d.rstrip(".") for d in details) + ".")
    else:
        ctx.run.status = "awaiting_approval"
        ctx.db.commit()
        runqueue.publish(ctx.run.id)
    return True, ""


def _give_up(ctx: Ctx, a: dict, decision: LlmResult, started: float) -> tuple[bool, str]:
    reason = (a.get("reason") or "No suitable cart.").strip()
    _record(ctx, "give_up", f"Stopped: {reason}", [decision])
    _finish(ctx.db, ctx.run, "gave_up", f"{reason.rstrip('.')}. Nothing was paid.")
    return True, ""


def read_catalog_image(release: Release, url: str, *, user_id: str | None, run_id: str | None, priority: str,
                       deadline: float | None = None, cacheable: bool = True) -> LlmResult:
    """One photo catalog through catalog.read_image. Shared by the shopper and the catalog-reading evaluation."""
    version = release.prompts["catalog.read_image"]
    return gateway.complete(LlmRequest(
        task="catalog.read_image", prompt_version=version,
        messages=[
            {"role": "system", "content": releases.prompt("catalog.read_image", version)},
            {"role": "user", "content": [{"type": "text", "text": "Read this catalog image."},
                                         {"type": "image_url", "image_url": {"url": tools.image_data_url(url)}}]},
        ],
        schema=CATALOG_READING, schema_name="catalog_reading", models=release.route("catalog.read_image"),
        params=release.params["catalog.read_image"], user_id=user_id, run_id=run_id, priority=priority,
        sandbox_state={"image_url": url}, deadline=deadline, cacheable=cacheable,
    ))


def cart_view(db: Session, signed: dict, verdict: dict) -> dict:
    """The Cart shape the web app shows (web/src/types/domain.ts): the seller-signed cart, the payee as the bank named it."""
    cart = signed["cart"]
    checks = {c["rule"]: c for c in verdict["checks"]}
    merchant = db.get(Merchant, cart["sellerId"])
    account = next((acc for acc in accounts_of(db, cart["sellerId"])
                    if acc.bank_code == cart["payee"]["bankCode"] and acc.account_number == cart["payee"]["accountNumber"]), None)
    bank_name = next((b.name for b in network.banks() if b.code == cart["payee"]["bankCode"]), cart["payee"]["bankCode"])
    return {
        "id": cart["cartId"], "sellerId": cart["sellerId"], "sellerName": merchant.display_name if merchant else cart.get("sellerName"),
        "lines": [{k: ln[k] for k in ("sku", "name", "brand", "model", "packSize", "quantity", "unitPriceMinor", "lineTotalMinor")} for ln in cart["lines"]],
        "deliveryFeeMinor": cart["deliveryFeeMinor"], "totalMinor": cart["totalMinor"], "deliveryBy": cart["deliveryBy"],
        "payee": {"bankCode": cart["payee"]["bankCode"], "bankName": bank_name, "accountNumberMasked": f"•••• {cart['payee']['accountNumber'][-4:]}",
                  "nameOnAccount": (verdict.get("payeeName") or "").upper(),
                  "verifiedAt": runs_iso(account.verified_at) if account and account.verified_at else None},
        "expiresAt": cart["expiresAt"], "sellerSignatureValid": checks.get("cart_signed", {}).get("result") == "pass",
    }


def decision_view(verdict: dict) -> dict:
    return {k: verdict[k] for k in ("outcome", "gateVersion", "checks", "decidedAt")}


def runs_iso(dt) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def packs_needed(quantity: int, pack_size: int | None) -> int:
    return max(1, math.ceil(quantity / max(1, pack_size or 1)))
