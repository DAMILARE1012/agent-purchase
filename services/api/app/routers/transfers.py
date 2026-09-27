from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app import schemas
from app.config import get_settings
from app.db import get_db
from app.errors import ApiError
from app.models import Receipt
from app.security import Viewer, require_viewer, require_wallet
from app.services import ledger, transfers
from app.services.parties import Parties, mask_account

router = APIRouter(tags=["wallet and transfers"])


def _require_idempotency_key(key: str | None) -> str:
    if not key or len(key) > 100:
        raise ApiError(400, "missing_idempotency_key", "Idempotency-Key header is required.")
    return key


@router.get("/wallet", response_model=schemas.WalletOut)
def wallet(viewer: Viewer = Depends(require_wallet), db: Session = Depends(get_db)) -> schemas.WalletOut:
    assert viewer.account is not None
    settings = get_settings()
    return schemas.WalletOut(
        account_id=viewer.account.id,
        account_number=viewer.account.account_number,
        bank_code=settings.platform_bank_code,
        bank_name=settings.platform_bank_name,
        balance_minor=ledger.balance_of(db, viewer.account.id),
        currency=viewer.account.currency,
        recent=transfers.list_for_account(db, viewer.account.id, limit=6),
    )


@router.get("/transfers", response_model=list[schemas.TransferOut])
def list_transfers(viewer: Viewer = Depends(require_wallet), db: Session = Depends(get_db)) -> list[schemas.TransferOut]:
    assert viewer.account is not None
    return transfers.list_for_account(db, viewer.account.id)


@router.post("/transfers", response_model=schemas.CreateTransferOut)
def create_transfer(
    body: schemas.CreateTransferIn,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    viewer: Viewer = Depends(require_wallet),
    db: Session = Depends(get_db),
) -> schemas.CreateTransferOut:
    result = transfers.create_payment(db, viewer, body, _require_idempotency_key(idempotency_key))
    db.commit()
    return result


@router.get("/transfers/{tx}", response_model=schemas.TransferDetailOut)
def get_transfer(tx: str, viewer: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> schemas.TransferDetailOut:
    return transfers.detail(db, viewer, tx)


@router.get("/transfers/{tx}/receipt", response_model=schemas.ReceiptOut)
def get_receipt(tx: str, viewer: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> schemas.ReceiptOut:
    t = transfers.get_visible(db, viewer, tx)
    receipt = db.get(Receipt, t.tx)
    if receipt is None:
        raise ApiError(404, "no_receipt", "This payment has no receipt yet.")
    parties = Parties(db)
    return schemas.ReceiptOut(
        tx=t.tx,
        token=receipt.token,
        url=f"{get_settings().public_web_url}/r#{receipt.token}",
        issued_at=receipt.issued_at,
        printed=schemas.PrintedReceipt(
            amount_minor=t.amount_minor,
            currency=t.currency,
            payer_masked=_mask(parties.side_name(t, t.payer_account_id)),
            payee_masked=_mask(parties.side_name(t, t.payee_account_id))
            + (f" · {t.counterparty_bank_name} {mask_account(t.counterparty_account_number)}" if t.rail == "interbank" and t.payee_account_id == ledger.NETWORK else ""),
            created_at=t.created_at,
        ),
    )


@router.post("/transfers/{tx}/step-up", response_model=schemas.TransferOut)
def step_up(tx: str, body: schemas.StepUpIn, viewer: Viewer = Depends(require_wallet), db: Session = Depends(get_db)) -> schemas.TransferOut:
    result = transfers.complete_step_up(db, viewer, tx, body.code)
    db.commit()
    return result


@router.post("/transfers/{tx}/confirm", response_model=schemas.TransferOut)
def confirm(tx: str, viewer: Viewer = Depends(require_wallet), db: Session = Depends(get_db)) -> schemas.TransferOut:
    result = transfers.confirm_received(db, viewer, tx)
    db.commit()
    return result


@router.post("/transfers/{tx}/refund", response_model=schemas.TransferOut)
def refund(
    tx: str,
    body: schemas.RefundIn,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    viewer: Viewer = Depends(require_wallet),
    db: Session = Depends(get_db),
) -> schemas.TransferOut:
    result = transfers.refund(db, viewer, tx, body.amount_minor, _require_idempotency_key(idempotency_key))
    db.commit()
    return result


def _mask(name: str) -> str:
    return " ".join(part if len(part) <= 2 else part[0] + "•" * min(len(part) - 1, 4) for part in name.split(" "))
