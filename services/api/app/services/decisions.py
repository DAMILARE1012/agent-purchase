"""Analyst decisions and user disputes. Every decision is stored as a training label (§11.2)."""

from sqlalchemy.orm import Session

from app import schemas
from app.errors import ApiError
from app.formatting import date_time, now
from app.models import Label, Scan
from app.security import Viewer
from app.services import transfers
from app.services.cases import DECISIONS, case_detail, find_case, open_case, summary


def decide(db: Session, analyst: Viewer, case_id: str, decision: str) -> schemas.CaseDetailOut:
    c = find_case(db, case_id)
    if c.status != "open":
        raise ApiError(409, "already_resolved", "This case is already resolved.")
    if decision not in DECISIONS[c.kind]:
        raise ApiError(422, "invalid_decision", "That decision isn't available for this case.")

    if decision == "release" and c.transfer_tx:
        t = transfers.settle_from_suspense(db, c.transfer_tx)
        t.risk_band = "medium"
        t.risk_reasons = [*t.risk_reasons, "Released by an analyst"]
    elif decision == "cancel" and c.transfer_tx:
        transfers.cancel_held(db, c.transfer_tx)

    c.status = "resolved"
    c.resolution = f"{decision.replace('_', ' ').capitalize()} by {analyst.user.display_name} on {date_time(now())}"
    db.add(Label(subject=f"case:{c.id}", label=decision, source="analyst", labeled_by=analyst.user.id))
    db.flush()
    return case_detail(db, case_id)


def open_dispute(db: Session, viewer: Viewer, body: schemas.DisputeIn) -> schemas.CaseSummaryOut:
    reason = body.reason.strip()
    if not reason:
        raise ApiError(422, "missing_reason", "Tell us what went wrong.")
    if body.tx:
        transfers.get_visible(db, viewer, body.tx)  # Only parties can dispute a payment.
    scan_id = body.scan_id if body.scan_id and db.get(Scan, body.scan_id) else None
    c = open_case(
        db,
        kind="dispute",
        title=f"Dispute from {viewer.user.display_name}",
        transfer_tx=body.tx,
        scan_id=scan_id,
        risk_score=None,
        reasons=[reason[:500]],
        dedupe_key=None,
    )
    return summary(db, c)
