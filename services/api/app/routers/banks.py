from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.config import get_settings
from app.db import get_db
from app.security import Viewer, require_viewer
from app.services import network, payees

router = APIRouter(tags=["banks"])


@router.get("/banks", response_model=list[schemas.BankOut])
def banks(_: Viewer = Depends(require_viewer)) -> list[schemas.BankOut]:
    """Banks you can pay, this platform first."""
    platform = get_settings().platform_bank_code
    listed = sorted(network.banks(), key=lambda b: (b.code != platform, b.name))
    return [schemas.BankOut(code=b.code, name=b.name, is_platform=b.code == platform) for b in listed]


@router.post("/name-enquiry", response_model=schemas.NameEnquiryOut)
def name_enquiry(body: schemas.NameEnquiryIn, _: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> schemas.NameEnquiryOut:
    """Who owns this account? Shown to the payer before they send, to catch wrong-account payments."""
    return payees.to_out(payees.lookup(db, body.bank_code, body.account_number))
