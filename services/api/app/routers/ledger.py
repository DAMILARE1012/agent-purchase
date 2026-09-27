from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import schemas
from app.db import get_db
from app.security import Viewer, require_role
from app.services import ledger_reports

router = APIRouter(prefix="/ledger", tags=["platform ledger"])

ops_only = require_role("ops")


@router.get("/summary", response_model=schemas.LedgerSummaryOut)
def summary(_: Viewer = Depends(ops_only), db: Session = Depends(get_db)) -> schemas.LedgerSummaryOut:
    """Trial balance and headline figures for the whole platform."""
    return ledger_reports.summary(db)


@router.get("/accounts", response_model=list[schemas.LedgerAccountOut])
def accounts(_: Viewer = Depends(ops_only), db: Session = Depends(get_db)) -> list[schemas.LedgerAccountOut]:
    return ledger_reports.accounts(db)


@router.get("/journal", response_model=schemas.JournalPageOut)
def journal(
    account: str | None = None,
    tx: str | None = None,
    before: str | None = None,
    limit: int = Query(default=25, ge=1, le=100),
    _: Viewer = Depends(ops_only),
    db: Session = Depends(get_db),
) -> schemas.JournalPageOut:
    return ledger_reports.journal(db, account_id=account, tx=tx, before=before, limit=limit)
