"""AI shopping runs: creating, listing, serialising, declining. The work is app/agent/runtime.py; paying is app/services/payments.py."""

import secrets
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.agent import releases
from app.errors import ApiError
from app.formatting import now
from app.models import AgentRun, Mandate, Passkey, RunStep, User
from app.security import Viewer
from app.services import mandates, payments, runqueue

ACTIVE = ("queued", "running", "awaiting_approval", "paying")
# Evaluation runs (app/evals) belong to this system user; they stay out of support's queue and the daily figures.
EVAL_USER_ID = "eval-runner"
TERMINAL = ("paid", "blocked", "declined", "gave_up", "failed")
STAFF = ("analyst", "ops", "admin")


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat().replace("+00:00", "Z") if dt else None


def create(db: Session, viewer: Viewer, mandate_id: str) -> AgentRun:
    m = mandates.get_own(db, viewer, mandate_id)
    if m.user_id != viewer.user.id:
        raise ApiError(403, "forbidden", "Only the shopper can start shopping with their mandate.")
    if m.status != "active":
        raise ApiError(409, "mandate_inactive", "This mandate can't be used any more.")
    busy = db.scalar(select(func.count()).select_from(AgentRun).where(AgentRun.mandate_id == m.id, AgentRun.status.in_(ACTIVE)))
    if busy and m.limits.get("maxUses", 1) - m.uses <= 1:
        raise ApiError(409, "run_in_progress", "A run for this mandate is already in progress.")
    run = AgentRun(
        id="r_" + secrets.token_hex(8), mandate_id=m.id, user_id=viewer.user.id, release_id=releases.live().id, status="queued",
        priority="interactive" if m.mode == "present" else "background", tokens=0, cost_micro_usd=0, latency_ms=0,
    )
    db.add(run)
    try:
        db.commit()
    except IntegrityError as exc:  # The unique index: another request started a run for this mandate first.
        db.rollback()
        raise ApiError(409, "run_in_progress", "A run for this mandate is already in progress.") from exc
    runqueue.enqueue(run.id, run.priority)
    return run


def get_visible(db: Session, viewer: Viewer, run_id: str) -> AgentRun:
    run = db.get(AgentRun, run_id)
    if run is None or (run.user_id != viewer.user.id and viewer.role not in STAFF):
        raise ApiError(404, "not_found", "Run not found.")
    return run


def list_own(db: Session, viewer: Viewer, mandate_id: str | None) -> list[AgentRun]:
    q = select(AgentRun).where(AgentRun.user_id == viewer.user.id)
    if mandate_id:
        q = q.where(AgentRun.mandate_id == mandate_id)
    return list(db.scalars(q.order_by(AgentRun.created_at.desc()).limit(200)))


def list_all(db: Session, limit: int = 100) -> list[AgentRun]:
    return list(db.scalars(select(AgentRun).order_by(AgentRun.created_at.desc()).limit(limit)))


def decline(db: Session, viewer: Viewer, cart_id: str) -> AgentRun:
    run = _by_cart(db, viewer, cart_id)
    # Lock and re-read: an approval of the same cart may be committing right now.
    run = db.scalars(select(AgentRun).where(AgentRun.id == run.id).with_for_update().execution_options(populate_existing=True)).one()
    if run.status == "awaiting_approval":
        run.status, run.ended_at, run.outcome_note = "declined", now(), "You declined the cart. Nothing was paid."
        db.commit()
        runqueue.publish(run.id)
    return run


def _by_cart(db: Session, viewer: Viewer, cart_id: str) -> AgentRun:
    run = db.scalar(select(AgentRun).where(AgentRun.cart_id == cart_id))
    if run is None or run.user_id != viewer.user.id:
        raise ApiError(404, "not_found", "Cart not found.")
    return run


def serialize(db: Session, run: AgentRun, *, shopper_names: dict[str, str] | None = None) -> dict:
    """The AgentRun shape the web app uses (web/src/types/domain.ts)."""
    steps = db.scalars(select(RunStep).where(RunStep.run_id == run.id).order_by(RunStep.seq)).all()
    name = (shopper_names or {}).get(run.user_id) or (db.get(User, run.user_id).display_name if db.get(User, run.user_id) else "Shopper")
    return {
        "id": run.id,
        "mandateId": run.mandate_id,
        "shopperName": name,
        "status": run.status,
        "agentVersion": run.release_id,
        "startedAt": iso(run.created_at),
        "endedAt": iso(run.ended_at),
        "queuePosition": runqueue.position(run.id, run.priority) if run.status == "queued" else None,
        "steps": [
            {
                "id": f"st_{s.id}", "at": iso(s.at), "kind": s.kind, "summary": s.summary, "sellerId": s.seller_id, "untrusted": s.untrusted,
                "injectionScore": s.injection_score, "model": s.model, "tokensIn": s.tokens_in, "tokensOut": s.tokens_out,
                "latencyMs": s.latency_ms, "costMicroUsd": s.cost_micro_usd, "cached": bool((s.detail or {}).get("cached")),
            }
            for s in steps
        ],
        "cart": run.cart_view,
        "decision": run.decision,
        "purchaseId": run.purchase_id,
        "totals": {"steps": len(steps), "tokens": run.tokens, "costMicroUsd": run.cost_micro_usd, "latencyMs": run.latency_ms},
        "outcomeNote": run.outcome_note,
    }


def names_for(db: Session, runs: list[AgentRun]) -> dict[str, str]:
    ids = {r.user_id for r in runs}
    return {u.id: u.display_name for u in db.scalars(select(User).where(User.id.in_(ids)))} if ids else {}


def blocked(db: Session) -> list[dict]:
    """Carts the gate refused, for the support queue (web BlockedCart shape)."""
    from app.models import Merchant

    rows = [r for r in db.scalars(select(AgentRun).where(AgentRun.status == "blocked", AgentRun.user_id != EVAL_USER_ID)
                                  .order_by(AgentRun.ended_at.desc()).limit(300)) if r.cart_view]
    names = names_for(db, rows)
    out = []
    for r in rows:
        seller = db.get(Merchant, r.cart_view["sellerId"])
        out.append({
            "runId": r.id, "shopperName": names.get(r.user_id, "Shopper"), "sellerId": r.cart_view["sellerId"], "sellerName": r.cart_view["sellerName"],
            "totalMinor": r.cart_view["totalMinor"], "failedRules": [c["rule"] for c in (r.decision or {}).get("checks", []) if c["result"] == "fail"],
            "decidedAt": (r.decision or {}).get("decidedAt") or iso(r.ended_at), "sellerAdversarial": bool(seller and seller.adversarial),
        })
    return out


def mandate_out(db: Session, m: Mandate) -> dict:
    """The Mandate shape the web app uses."""
    return {
        "id": m.id, "status": m.status, "mode": m.mode, "request": m.request, "limits": m.limits, "uses": m.uses,
        "spentMinor": m.spent_minor, "periodSpentMinor": payments.period_spent_minor(db, m) if m.limits.get("period") else None,
        "mandateHash": m.mandate_hash,
        "signedAt": iso(m.signed_at), "revokedAt": iso(m.revoked_at), "createdAt": iso(m.created_at), "runIds": mandates.run_ids(db, m.id),
        "signatureKind": m.signature_kind, "compiledBy": m.compiled_by,
        "signedWith": (db.get(Passkey, m.passkey_id).name if m.passkey_id and db.get(Passkey, m.passkey_id) else None),
    }
