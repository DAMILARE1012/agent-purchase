"""Mandates, AI shopping runs (with live events), paying for carts, purchases and receipts, and the ops endpoints for the agent."""

import asyncio
import json
import time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import SessionLocal, get_db
from app.formatting import now
from app.llm import providers, ratelimit
from app.config import get_settings
from app.errors import ApiError
from app.models import AgentRelease, AgentRun, InferenceLog, Passkey
from app.redis_client import get_async_redis
from app.schemas import Schema
from app.security import Viewer, require_role, require_viewer
from app.agent import releases
from app.evals import gate as evals_gate
from app.evals import report as evals_report
from app.services import browse, intent, mandates, passkeys, payments, runqueue, runs

router = APIRouter(tags=["agent"])
shopper = require_role("shopper")
staff = require_role("analyst", "ops", "admin")
ops_only = require_role("ops")
seller_only = require_role("seller")


class DraftIn(Schema):
    request: str = Field(max_length=500)
    mode: str = "present"


class SignatureIn(Schema):
    """kind "passkey": a WebAuthn assertion for the challenge from /mandates/sign-options. kind "test": sandbox scripts only."""

    kind: str
    challenge_id: str | None = None
    credential: dict | None = None
    code: str | None = Field(default=None, max_length=12)  # kind "email_code": the one-time code from the email


class MandateIn(Schema):
    draft: dict
    limits: dict
    signature: SignatureIn


class SignOptionsIn(Schema):
    draft: dict
    limits: dict


class PasskeyIn(Schema):
    challenge_id: str
    credential: dict
    name: str = Field(default="Passkey", max_length=80)


class ApproveIn(Schema):
    signature: SignatureIn


class StartRunIn(Schema):
    mandate_id: str


class LimitsIn(Schema):
    requests_per_minute: int | None = Field(default=None, ge=1, le=100_000)
    tokens_per_minute: int | None = Field(default=None, ge=100, le=100_000_000)
    interactive_reserve: float | None = Field(default=None, ge=0, le=0.9)


# ---- Mandates -------------------------------------------------------------------------------------------


@router.get("/mandates")
def list_mandates(viewer: Viewer = Depends(shopper), db: Session = Depends(get_db)) -> list[dict]:
    rows = mandates.list_own(db, viewer)
    db.commit()  # Persist lazily-detected expiry.
    return [runs.mandate_out(db, m) for m in rows]


@router.get("/mandates/{mandate_id}")
def get_mandate(mandate_id: str, viewer: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> dict:
    m = mandates.get_own(db, viewer, mandate_id)
    db.commit()
    return runs.mandate_out(db, m)


@router.post("/mandates/draft")
def draft_mandate(body: DraftIn, viewer: Viewer = Depends(shopper)) -> dict:
    """Sentence → draft limits: Qwen (intent.compile), grounded in the shopper's words, merged with the rules; the stricter value wins."""
    return intent.compile_draft(viewer, body.request, "not_present" if body.mode == "not_present" else "present")


@router.post("/mandates/sign-options")
def mandate_sign_options(body: SignOptionsIn, viewer: Viewer = Depends(shopper), db: Session = Depends(get_db)) -> dict:
    """The WebAuthn challenge for signing exactly these limits (it commits to their SHA-256)."""
    mode = mandates.mode_of(body.draft)
    mandates.validate_limits(body.limits, mode)
    return passkeys.signing_options(db, viewer, mandates.canonical_hash(mode, body.limits))


@router.post("/mandates")
def create_mandate(body: MandateIn, viewer: Viewer = Depends(shopper), db: Session = Depends(get_db)) -> dict:
    """Stores a mandate only with a valid signature over its exact limits."""
    mode = mandates.mode_of(body.draft)
    mandates.validate_limits(body.limits, mode)
    mandate_hash = mandates.canonical_hash(mode, body.limits)
    sig = body.signature
    if sig.kind == "passkey":
        if not (sig.challenge_id and sig.credential):
            raise ApiError(422, "unsigned", "Approve the mandate with your passkey first.")
        passkey, evidence = passkeys.verify_signature(db, viewer, sig.challenge_id, sig.credential, mandate_hash)
        m = mandates.create(db, viewer, body.draft, body.limits, assertion=json.dumps(evidence), signature_kind="passkey", passkey_id=passkey.id)
    elif sig.kind == "test":
        if not (get_settings().allow_test_signatures and viewer.client_id == "scan-cli"):
            raise ApiError(403, "passkey_required", "Mandates must be signed with a passkey.")
        evidence = {"kind": "test", "client": viewer.client_id, "note": "Sandbox test signature from the scan-cli test client; not a passkey."}
        m = mandates.create(db, viewer, body.draft, body.limits, assertion=json.dumps(evidence), signature_kind="test", passkey_id=None)
    else:
        raise ApiError(422, "unsigned", "Approve the mandate with your passkey first.")
    return runs.mandate_out(db, m)


@router.get("/mandates/{mandate_id}/signature")
def mandate_signature(mandate_id: str, viewer: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> dict:
    """Re-verifies the stored signature from scratch: recompute the hash from the stored limits, check the passkey's signature."""
    m = mandates.get_own(db, viewer, mandate_id)
    recomputed = mandates.canonical_hash(m.mode, m.limits)
    key = db.get(Passkey, m.passkey_id) if m.passkey_id else None
    valid = m.signature_kind == "passkey" and key is not None and recomputed == m.mandate_hash and passkeys.reverify(m.assertion, recomputed, key.public_key)
    return {"kind": m.signature_kind, "valid": valid, "mandateHash": recomputed, "hashMatches": recomputed == m.mandate_hash,
            "passkeyName": key.name if key else None, "signedAt": runs.iso(m.signed_at)}


# ---- Passkeys ------------------------------------------------------------------------------------------


def passkey_out(p: Passkey) -> dict:
    return {"id": p.id, "name": p.name, "createdAt": runs.iso(p.created_at), "lastUsedAt": runs.iso(p.last_used_at)}


@router.get("/passkeys")
def list_passkeys(viewer: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> list[dict]:
    return [passkey_out(p) for p in passkeys.list_for(db, viewer.user.id)]


@router.post("/passkeys/registration-options")
def passkey_registration_options(viewer: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> dict:
    return passkeys.registration_options(db, viewer)


@router.post("/passkeys")
def register_passkey(body: PasskeyIn, viewer: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> dict:
    return passkey_out(passkeys.register(db, viewer, body.challenge_id, body.credential, body.name))


@router.delete("/passkeys/{passkey_id}")
def remove_passkey(passkey_id: int, viewer: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> dict:
    passkeys.remove(db, viewer, passkey_id)
    return {}


@router.post("/mandates/{mandate_id}/revoke")
def revoke_mandate(mandate_id: str, viewer: Viewer = Depends(shopper), db: Session = Depends(get_db)) -> dict:
    m = mandates.revoke(db, viewer, mandate_id)
    for run_id in mandates.run_ids(db, m.id):
        runqueue.publish(run_id)
    return runs.mandate_out(db, m)


# ---- Runs -------------------------------------------------------------------------------------------------


@router.get("/runs")
def list_runs(mandateId: str | None = None, viewer: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> list[dict]:  # noqa: N803
    rows = runs.list_own(db, viewer, mandateId)
    names = runs.names_for(db, rows)
    return [runs.serialize(db, r, shopper_names=names) for r in rows]


@router.post("/runs")
def start_run(body: StartRunIn, viewer: Viewer = Depends(shopper), db: Session = Depends(get_db)) -> dict:
    return runs.serialize(db, runs.create(db, viewer, body.mandate_id))


@router.get("/runs/{run_id}")
def get_run(run_id: str, viewer: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> dict:
    return runs.serialize(db, runs.get_visible(db, viewer, run_id))


@router.get("/runs/{run_id}/events")
async def run_events(run_id: str, request: Request, viewer: Viewer = Depends(require_viewer)) -> StreamingResponse:
    """Server-sent events: the whole run, each time it changes, until it stops running."""

    def snapshot() -> dict:
        with SessionLocal() as db:
            return runs.serialize(db, runs.get_visible(db, viewer, run_id))

    await asyncio.to_thread(snapshot)  # Raises 404 before the stream starts if the viewer can't see the run.

    async def stream():
        r = get_async_redis()
        pubsub = r.pubsub()
        await pubsub.subscribe(runqueue.channel(run_id))
        try:
            data = await asyncio.to_thread(snapshot)
            yield f"event: run\ndata: {json.dumps(data)}\n\n"
            last = time.monotonic()
            while data["status"] in ("queued", "running", "paying"):
                if await request.is_disconnected():
                    break
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=5.0)
                if msg is not None or data["status"] == "queued":  # Queue position changes without events.
                    data = await asyncio.to_thread(snapshot)
                    yield f"event: run\ndata: {json.dumps(data)}\n\n"
                    last = time.monotonic()
                elif time.monotonic() - last > 15:
                    yield ": keep-alive\n\n"
                    last = time.monotonic()
        finally:
            await pubsub.unsubscribe()
            await pubsub.aclose()
            await r.aclose()

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"cache-control": "no-cache", "x-accel-buffering": "no"})


@router.get("/carts/{cart_id}/approval-methods")
def cart_approval_methods(cart_id: str, viewer: Viewer = Depends(shopper), db: Session = Depends(get_db)) -> dict:
    """A passkey always; an email code too for carts up to EMAIL_APPROVAL_MAX_MINOR, with the reason when not."""
    return payments.approval_methods(db, viewer, cart_id)


@router.post("/carts/{cart_id}/email-code")
def send_cart_email_code(cart_id: str, viewer: Viewer = Depends(shopper), db: Session = Depends(get_db)) -> dict:
    """Emails a one-time code bound to exactly this cart. Approve with signature {kind: "email_code", code}."""
    return payments.send_email_code(db, viewer, cart_id)


@router.post("/carts/{cart_id}/approval-options")
def cart_approval_options(cart_id: str, viewer: Viewer = Depends(shopper), db: Session = Depends(get_db)) -> dict:
    """The WebAuthn challenge for approving exactly this cart (it commits to the SHA-256 of the seller-signed cart)."""
    return payments.approval_options(db, viewer, cart_id)


@router.post("/carts/{cart_id}/approve")
def approve_cart(cart_id: str, body: ApproveIn, viewer: Viewer = Depends(shopper), db: Session = Depends(get_db)) -> dict:
    """Pays for the cart: the gate runs again, then hold, transfer and a signed receipt. Repeating it returns the same purchase."""
    purchase = payments.approve(db, viewer, cart_id, body.signature.model_dump(by_alias=True))
    return payments.purchase_out(db, purchase)


@router.post("/carts/{cart_id}/decline")
def decline_cart(cart_id: str, viewer: Viewer = Depends(shopper), db: Session = Depends(get_db)) -> dict:
    return runs.serialize(db, runs.decline(db, viewer, cart_id))


# ---- Marketplace (browsing) ---------------------------------------------------------------------------


@router.get("/marketplace")
def marketplace_browse(_: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> dict:
    """Every seller's public catalog, grouped by product, with the platform's trust tier. For looking; buying goes through a mandate."""
    return browse.browse(db)


@router.get("/marketplace/photos/{seller_id}/{page}")
def marketplace_photo(seller_id: str, page: int, _: Viewer = Depends(require_viewer)) -> Response:
    return Response(browse.photo(seller_id, page), media_type="image/jpeg", headers={"cache-control": "private, max-age=300"})


# ---- Purchases, receipts and orders ---------------------------------------------------------------------


@router.get("/purchases")
def list_purchases(viewer: Viewer = Depends(shopper), db: Session = Depends(get_db)) -> list[dict]:
    return [payments.purchase_out(db, p) for p in payments.list_own(db, viewer)]


@router.get("/purchases/{purchase_id}")
def get_purchase(purchase_id: str, viewer: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> dict:
    return payments.purchase_out(db, payments.get_visible(db, viewer, purchase_id))


@router.get("/receipts/verify")
def verify_receipt(token: str, db: Session = Depends(get_db)) -> dict:
    """Public: anyone holding a purchase receipt can check it. No sign-in needed."""
    return payments.verify_receipt(db, token[:4000])


@router.get("/seller/orders")
def seller_orders(viewer: Viewer = Depends(seller_only), db: Session = Depends(get_db)) -> list[dict]:
    return payments.seller_orders(db, viewer)


@router.post("/seller/orders/{order_id}/refund")
def refund_order(order_id: str, _viewer: Viewer = Depends(seller_only)) -> dict:
    raise ApiError(409, "refunds_not_enabled", "Refunds arrive with disputes in milestone M12. Nothing was refunded.")


# ---- Support and ops ------------------------------------------------------------------------------------


@router.get("/support/blocked")
def blocked_carts(_: Viewer = Depends(staff), db: Session = Depends(get_db)) -> list[dict]:
    return runs.blocked(db)


@router.get("/ops/runs")
def all_runs(limit: int = 100, _: Viewer = Depends(staff), db: Session = Depends(get_db)) -> list[dict]:
    """The latest runs across all shoppers, newest first (at most 500)."""
    rows = runs.list_all(db, max(1, min(limit, 500)))
    names = runs.names_for(db, rows)
    return [runs.serialize(db, r, shopper_names=names) for r in rows]


@router.get("/ops/agent-versions")
def agent_versions(_: Viewer = Depends(staff), db: Session = Depends(get_db)) -> list[dict]:
    order = {"candidate": 0, "live": 1, "retired": 2}
    rows = sorted(db.scalars(select(AgentRelease).where(AgentRelease.status != "variant")), key=lambda r: (order.get(r.status, 3), r.id))
    return [
        {
            "id": r.id, "status": r.status, "model": r.model, "fallbackModel": r.fallback_model,
            "prompts": [{"task": t, "version": v} for t, v in r.prompts.items()],
            "params": {"temperature": r.params.get("agent.step", {}).get("temperature", 0),
                       "reasoningEffort": r.params.get("agent.step", {}).get("reasoning_effort", "default")},
            "createdAt": runs.iso(r.created_at), "changelog": r.changelog,
        }
        for r in rows
    ]


@router.get("/ops/overview")
def ops_overview(_: Viewer = Depends(staff), db: Session = Depends(get_db)) -> dict:
    since = now() - timedelta(hours=24)
    recent = list(db.scalars(select(AgentRun).where(AgentRun.created_at >= since, AgentRun.user_id != runs.EVAL_USER_ID)))
    carts = [r for r in recent if r.cart_view]
    durations = sorted((r.ended_at - r.began_at).total_seconds() for r in recent if r.began_at and r.ended_at)
    calls = db.execute(
        select(InferenceLog.outcome, func.count()).where(InferenceLog.created_at >= since, InferenceLog.outcome.in_(["ok", "fallback"])).group_by(InferenceLog.outcome)
    ).all()
    counts = dict(calls)
    answered = sum(counts.values())
    limits = ratelimit.current_limits()
    return {
        "runsToday": len(recent),
        "purchasesToday": payments.count_since(db, since),
        "blockedToday": sum(1 for r in recent if r.status == "blocked"),
        "violations": payments.violations_since(db, since),
        "p95RunSeconds": durations[min(len(durations) - 1, int(len(durations) * 0.95))] if durations else 0,
        "costPerPurchaseMicroUsd": round(sum(r.cost_micro_usd for r in carts) / len(carts)) if carts else 0,
        "queueDepth": runqueue.depth(),
        "fallbackRate": counts.get("fallback", 0) / answered if answered else 0,
        "liveVersion": next((r.id for r in db.scalars(select(AgentRelease).where(AgentRelease.status == "live"))), ""),
        "modelProvider": providers.provider_name(),
        "rateLimits": {"requestsPerMinute": limits.requests_per_minute, "tokensPerMinute": limits.tokens_per_minute,
                       "interactiveReserve": limits.interactive_reserve},
    }


# ---- Evaluation (M8) ---------------------------------------------------------------------------------------


@router.get("/ops/evals")
def eval_results(versionId: str | None = None, _: Viewer = Depends(staff)) -> list[dict]:  # noqa: N803
    """Every suite result in evals/reports, marked stale when the release has changed since it was measured."""
    out = []
    for rid, rep in evals_report.load_all().items():
        if versionId and rid != versionId:
            continue
        try:
            release = releases.get(rid)
        except KeyError:
            release = None
        for suite, r in rep["suites"].items():
            current = evals_report.fingerprint(suite, release) if release and evals_report.applies(suite, release) else None
            out.append({
                "versionId": rid, "suite": suite, "cases": r["cases"], "metrics": r["metrics"], "runAt": r["runAt"], "model": r["model"],
                "provider": r["provider"], "reusedFrom": r.get("reusedFrom"), "partial": bool(r.get("partial")), "stale": current != r["fingerprint"],
                "tokens": r["tokens"], "costMicroUsd": r["costMicroUsd"], "wallMs": r["wallMs"],
            })
    return out


@router.get("/ops/evals/gate")
def eval_gate(candidate: str, baseline: str | None = None, _: Viewer = Depends(staff)) -> dict:
    """The release gate's verdict, the same code CI runs."""
    try:
        return evals_gate.verdict(baseline or releases.live().id, candidate)
    except KeyError as exc:
        raise ApiError(404, "not_found", f"Unknown release {exc}.") from exc


@router.get("/ops/evals/{version_id}/{suite}")
def eval_cases(version_id: str, suite: str, _: Viewer = Depends(staff)) -> list[dict]:
    """Each case's result, for finding what went wrong."""
    rep = evals_report.load(version_id)
    if not rep or suite not in rep["suites"]:
        raise ApiError(404, "not_found", "No such evaluation result.")
    return rep["suites"][suite]["caseResults"]


@router.post("/ops/llm/limits")
def set_llm_limits(body: LimitsIn, _: Viewer = Depends(ops_only)) -> dict:
    """Changes the shared model rate limits for every worker, at runtime. DELETE restores the .env values."""
    lim = ratelimit.set_limits(body.requests_per_minute, body.tokens_per_minute, body.interactive_reserve)
    return {"requestsPerMinute": lim.requests_per_minute, "tokensPerMinute": lim.tokens_per_minute, "interactiveReserve": lim.interactive_reserve}


@router.delete("/ops/llm/limits")
def reset_llm_limits(_: Viewer = Depends(ops_only)) -> dict:
    lim = ratelimit.reset_limits()
    return {"requestsPerMinute": lim.requests_per_minute, "tokensPerMinute": lim.tokens_per_minute, "interactiveReserve": lim.interactive_reserve}


@router.get("/ops/llm/usage")
def llm_usage(minutes: int = 60, since: str | None = None, _: Viewer = Depends(staff), db: Session = Depends(get_db)) -> dict:
    """
    Model calls since a time (ISO) or in the last N minutes: the busiest 60-second window, and per-user calls
    and time spent waiting for capacity. Calls are placed at their admission time (when the limiter let them
    go and the provider received them), not when they were logged, since that's what rate limits count.
    """
    start = datetime.fromisoformat(since.replace("Z", "+00:00")) if since else now() - timedelta(minutes=max(1, min(minutes, 24 * 60)))
    rows = db.execute(
        select(InferenceLog.user_id, InferenceLog.created_at, InferenceLog.latency_ms, InferenceLog.queue_ms)
        .where(InferenceLog.created_at >= start, InferenceLog.outcome.in_(["ok", "fallback"]))
    ).all()
    times = sorted(r.created_at.timestamp() - r.latency_ms / 1000 for r in rows)
    times = [t for t in times if t >= start.timestamp()]
    busiest, j = 0, 0
    for i, t in enumerate(times):  # Sliding 60-second window over admission times.
        while times[j] <= t - 60:
            j += 1
        busiest = max(busiest, i - j + 1)
    per_user: dict[str, list[int]] = {}
    for r in rows:
        per_user.setdefault(r.user_id or "system", []).append(r.queue_ms)
    users = []
    for uid, waits in per_user.items():
        waits.sort()
        users.append({"userId": uid, "calls": len(waits), "avgQueueMs": round(sum(waits) / len(waits)),
                      "p95QueueMs": waits[min(len(waits) - 1, int(len(waits) * 0.95))]})
    limits = ratelimit.current_limits()
    return {"calls": len(rows), "busiestMinuteCalls": busiest, "requestsPerMinute": limits.requests_per_minute,
            "users": sorted(users, key=lambda u: -u["calls"])}
