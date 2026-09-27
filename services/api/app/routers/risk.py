from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.db import get_db
from app.security import Viewer, require_role
from app.services import cases, decisions

router = APIRouter(prefix="/cases", tags=["risk console"])

analyst_only = require_role("analyst")


@router.get("", response_model=list[schemas.CaseSummaryOut])
def list_cases(_: Viewer = Depends(analyst_only), db: Session = Depends(get_db)) -> list[schemas.CaseSummaryOut]:
    return cases.list_cases(db)


@router.get("/{case_id}", response_model=schemas.CaseDetailOut)
def get_case(case_id: str, _: Viewer = Depends(analyst_only), db: Session = Depends(get_db)) -> schemas.CaseDetailOut:
    return cases.case_detail(db, case_id)


@router.post("/{case_id}/decision", response_model=schemas.CaseDetailOut)
def decide(
    case_id: str, body: schemas.DecisionIn, analyst: Viewer = Depends(analyst_only), db: Session = Depends(get_db)
) -> schemas.CaseDetailOut:
    result = decisions.decide(db, analyst, case_id, body.decision)
    db.commit()
    return result
