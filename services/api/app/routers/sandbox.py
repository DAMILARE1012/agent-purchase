"""Sandbox-only endpoints. Disabled unless SANDBOX_MODE=true."""

from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.config import get_settings
from app.db import get_db
from app.errors import ApiError
from app.security import Viewer, require_role, require_viewer, require_wallet
from app.services import network, payments, runs, scenarios, seed, transfers


def sandbox_enabled() -> None:
    if not get_settings().sandbox_mode:
        raise ApiError(404, "not_found", "Not found.")


router = APIRouter(prefix="/sandbox", tags=["sandbox"], dependencies=[Depends(sandbox_enabled)])


@router.get("/scenarios", response_model=list[schemas.DemoScenarioOut])
def list_scenarios(db: Session = Depends(get_db)) -> list[schemas.DemoScenarioOut]:
    result = scenarios.demo_scenarios(db)
    db.commit()
    return result


@router.post("/transfers/{tx}/{action}", response_model=schemas.TransferDetailOut)
def simulate_rail(
    tx: str, action: Literal["settle", "reverse"], viewer: Viewer = Depends(require_viewer), db: Session = Depends(get_db)
) -> schemas.TransferDetailOut:
    """Simulates the payment rail settling or reversing a payment. Parties and ops only."""
    transfers.get_visible(db, viewer, tx)
    if action == "settle":
        transfers.settle_from_suspense(db, tx)
    else:
        transfers.reverse_payment(db, tx)
    db.commit()
    return transfers.detail(db, viewer, tx)


@router.post("/reset")
def reset(_: Viewer = Depends(require_role("ops")), db: Session = Depends(get_db)) -> dict:
    """Restores the demo data and clears the sandbox network. Ops only."""
    seed.reset(db)
    db.commit()
    network.sandbox_reset()
    return {"ok": True}


@router.get("/external-accounts", response_model=list[schemas.ExternalAccountOut])
def external_accounts(_: Viewer = Depends(require_viewer)) -> list[schemas.ExternalAccountOut]:
    """Test account holders at the sandbox network's other banks."""
    return [schemas.ExternalAccountOut.model_validate(a) for a in network.sandbox_directory()]


@router.post("/inbound")
def simulate_inbound(body: schemas.SimulateInboundIn, viewer: Viewer = Depends(require_wallet)) -> dict:
    """Someone at another bank pays you. The network delivers it to us by signed webhook."""
    assert viewer.account is not None
    if body.amount_minor <= 0:
        raise ApiError(422, "invalid_amount", "Enter an amount greater than zero.")
    result = network.sandbox_inbound({
        "fromBankCode": body.from_bank_code,
        "fromAccountNumber": body.from_account_number,
        "toAccountNumber": viewer.account.account_number,
        "amountMinor": body.amount_minor,
        "narration": body.narration,
    })
    return {"sessionId": result["sessionId"], "status": result["status"]}


class SandboxCartLine(schemas.Schema):
    quantity: int = 1
    sku: str | None = None
    item_name: str | None = None


class SandboxRunIn(schemas.Schema):
    mandate_id: str
    seller_id: str
    lines: list[SandboxCartLine]


@router.post("/runs")
def sandbox_run(body: SandboxRunIn, viewer: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> dict:
    """
    Test clients only: a seller-signed cart straight through the gate, without the AI, so
    concurrency and access tests can create many carts on one mandate without model calls.
    """
    if not (get_settings().allow_test_signatures and viewer.client_id == "scan-cli"):
        raise ApiError(403, "forbidden", "Only the sandbox test client can create test carts.")
    lines = [{"quantity": ln.quantity, **({"sku": ln.sku} if ln.sku else {"itemName": ln.item_name or ""})} for ln in body.lines]
    return runs.serialize(db, payments.sandbox_run(db, viewer, body.mandate_id, body.seller_id, lines))
