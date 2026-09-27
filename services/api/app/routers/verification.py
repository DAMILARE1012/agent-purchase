from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.db import get_db
from app.security import Viewer, get_viewer, require_viewer
from app.services import decisions, signing, verification

router = APIRouter(tags=["verification and disputes"])


@router.post("/scans", response_model=schemas.ScanResultOut)
def scan(body: schemas.ScanIn, viewer: Viewer | None = Depends(get_viewer), db: Session = Depends(get_db)) -> schemas.ScanResultOut:
    """Verify a receipt. Works signed out (public view) or signed in (party view)."""
    result = verification.scan_receipt(db, viewer, body)
    db.commit()
    return result


@router.post("/disputes", response_model=schemas.CaseSummaryOut)
def open_dispute(body: schemas.DisputeIn, viewer: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> schemas.CaseSummaryOut:
    result = decisions.open_dispute(db, viewer, body)
    db.commit()
    return result


wellknown = APIRouter(tags=["verification and disputes"])


@wellknown.get("/.well-known/receipt-keys.json")
def receipt_keys(db: Session = Depends(get_db)) -> dict:
    """Public receipt-signing keys (JWKS), so anyone can verify a receipt offline."""
    keys = signing.jwks(db)
    db.commit()
    return keys
