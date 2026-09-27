"""
Risk console cases, evidence bundles and the dispute copilot (system_design.md §5.3, §11.5).

The copilot here is template-based. The production one is an LLM with a JSON
schema; either way every cited evidence ID is checked and unresolved citations
are dropped before the analyst sees them.
"""

from sqlalchemy import case, select
from sqlalchemy.orm import Session

from app import schemas
from app.errors import ApiError
from app.formatting import date_time, hours_since, money, new_id, now
from app.models import Case, Scan, Transfer
from app.services.parties import Parties

DECISIONS: dict[str, list[str]] = {
    "held_transfer": ["release", "cancel"],
    "suspicious_scan": ["close"],
    "dispute": ["resolve_for_payee", "resolve_for_payer", "close"],
    "reversal_shortfall": ["close"],
}


def open_case(
    db: Session,
    *,
    kind: str,
    title: str,
    transfer_tx: str | None,
    risk_score: float | None,
    reasons: list[str],
    dedupe_key: str | None,
    scan_id: str | None = None,
) -> Case:
    if dedupe_key:
        existing = db.scalar(select(Case).where(Case.dedupe_key == dedupe_key, Case.status == "open"))
        if existing:
            return existing
    c = Case(
        id=new_id("case"),
        kind=kind,
        status="open",
        title=title,
        opened_at=now(),
        transfer_tx=transfer_tx,
        scan_id=scan_id,
        risk_score=risk_score,
        reasons=reasons,
        resolution=None,
        dedupe_key=dedupe_key,
    )
    db.add(c)
    db.flush()
    return c


def summary(db: Session, c: Case) -> schemas.CaseSummaryOut:
    t = db.get(Transfer, c.transfer_tx) if c.transfer_tx else None
    return schemas.CaseSummaryOut(
        id=c.id, kind=c.kind, status=c.status, title=c.title, opened_at=c.opened_at, transfer_tx=c.transfer_tx,
        amount_minor=t.amount_minor if t else None, risk_score=c.risk_score,
    )


def list_cases(db: Session) -> list[schemas.CaseSummaryOut]:
    open_first = case((Case.status == "open", 0), else_=1)
    return [summary(db, c) for c in db.scalars(select(Case).order_by(open_first, Case.opened_at.desc()))]


def find_case(db: Session, case_id: str) -> Case:
    c = db.get(Case, case_id)
    if c is None:
        raise ApiError(404, "not_found", "No case with that ID.")
    return c


def _evidence(db: Session, c: Case) -> list[schemas.EvidenceItem]:
    items: list[schemas.EvidenceItem] = []
    parties = Parties(db)
    t = db.get(Transfer, c.transfer_tx) if c.transfer_tx else None
    if t:
        items.append(schemas.EvidenceItem(
            id=f"transfer:{t.tx}",
            label="Payment",
            value=f"{money(t.amount_minor)} · {parties.side_name(t, t.payer_account_id)} → {parties.side_name(t, t.payee_account_id)} · {t.status} · {date_time(t.created_at)}",
        ))
        if t.note:
            items.append(schemas.EvidenceItem(id=f"note:{t.tx}", label="Payment note", value=f"“{t.note}”"))
        payer = parties.user(t.payer_account_id)
        if payer:
            days = max(1, round(hours_since(payer.created_at) / 24))
            items.append(schemas.EvidenceItem(
                id=f"account:{payer.username}",
                label="Payer account",
                value=f"{payer.display_name} · created {days} day{'s' if days != 1 else ''} ago{' · flagged' if payer.flagged else ''}",
            ))
            reversed_payments = db.scalars(
                select(Transfer).where(Transfer.payer_account_id == t.payer_account_id, Transfer.status == "reversed", Transfer.tx != t.tx)
            )
            for r in reversed_payments:
                items.append(schemas.EvidenceItem(
                    id=f"transfer:{r.tx}",
                    label="Related reversed payment",
                    value=f"{money(r.amount_minor)} to {parties.side_name(r, r.payee_account_id)}, reversed {date_time(r.reversed_at or r.created_at)}",
                ))
        items.append(schemas.EvidenceItem(id=f"risk:{t.tx}", label="Risk score", value=f"{t.risk_score:.2f} ({t.risk_band})"))
    scan = db.get(Scan, c.scan_id) if c.scan_id else None
    if scan:
        items.append(schemas.EvidenceItem(
            id=f"scan:{scan.id}",
            label="Scan",
            value=f"{scan.source} · {scan.verdict} · {', '.join(scan.reasons) or 'no reasons'} · {date_time(scan.created_at)}",
        ))
    for i, reason in enumerate(c.reasons):
        items.append(schemas.EvidenceItem(id=f"reason:{i}", label="Signal", value=reason))
    return items


def _copilot(db: Session, c: Case, evidence: list[schemas.EvidenceItem]) -> schemas.CopilotSummary:
    ids = {e.id for e in evidence}
    t = db.get(Transfer, c.transfer_tx) if c.transfer_tx else None
    payer = Parties(db).user(t.payer_account_id) if t else None
    sentences: list[schemas.CopilotSentence] = []
    outcome = "Review the evidence and close the case."
    reply = "Thanks for your patience. We've reviewed this case."

    def say(text: str, *cites: str) -> None:
        sentences.append(schemas.CopilotSentence(text=text, cites=list(cites)))

    if c.kind == "held_transfer" and t:
        say(f"The payment of {money(t.amount_minor)} is on hold with a risk score of {t.risk_score:.2f}.", f"transfer:{t.tx}", f"risk:{t.tx}")
        if payer:
            say("The payer's account is new and has been flagged." if payer.flagged else "The payer's account is in good standing.", f"account:{payer.username}")
        related = next((e for e in evidence if e.label == "Related reversed payment"), None)
        if related:
            say("The same payer had another payment reversed recently.", related.id)
        outcome = "Cancel the payment and return the funds to the payer." if related else "Ask the payer to verify, then release."
        reply = "We stopped this payment for a security check and returned the money to the sender. No action is needed from you."
    elif c.kind == "suspicious_scan":
        if c.scan_id:
            say("A receipt was presented that failed verification.", f"scan:{c.scan_id}")
        if c.reasons:
            say(c.reasons[0], "reason:0")
        if t:
            say(f"The real payment on record is {money(t.amount_minor)}.", f"transfer:{t.tx}")
        outcome = "Flag the presenting account and look for other scans of the same image."
        reply = "The receipt you were shown doesn't match the real payment. Please don't hand over goods or money based on it."
    elif c.kind == "dispute":
        say("A user opened a dispute about this payment.", *([f"transfer:{t.tx}"] if t else []))
        if c.reasons:
            say(f"Their reason: {c.reasons[0]}", "reason:0")
        outcome = "Compare the confirmation and scan history, then resolve."
    elif c.kind == "reversal_shortfall" and t:
        say("A refunded payment was reversed and the refund could not be fully recovered.", f"transfer:{t.tx}")
        outcome = "Freeze the refund recipient's account pending review."

    # Citation validation: drop unresolved citations and sentences left with none.
    validated = [
        schemas.CopilotSentence(text=s.text, cites=[cid for cid in s.cites if cid in ids])
        for s in sentences
    ]
    return schemas.CopilotSummary(
        model="template-copilot v1 (no model call)",
        sentences=[s for s in validated if s.cites],
        suggested_outcome=outcome,
        draft_reply=reply,
    )


def case_detail(db: Session, case_id: str) -> schemas.CaseDetailOut:
    c = find_case(db, case_id)
    evidence = _evidence(db, c)
    return schemas.CaseDetailOut(
        **summary(db, c).model_dump(),
        reasons=c.reasons,
        evidence=evidence,
        copilot=_copilot(db, c, evidence),
        allowed_decisions=DECISIONS[c.kind] if c.status == "open" else [],
        resolution=c.resolution,
    )
