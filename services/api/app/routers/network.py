"""
Callbacks from the payment switch. Not for browsers: every request must carry the
switch's HMAC signature, and the web app's proxy refuses to forward this path.
"""

import json
import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ApiError
from app.models import Account, Transfer, User
from app.services import interbank, network

router = APIRouter(prefix="/network", tags=["payment network callbacks"], include_in_schema=True)
log = logging.getLogger("network")


async def signed_body(request: Request) -> dict:
    body = await request.body()
    network.verify_webhook(body, request.headers.get("x-switch-signature"))
    return json.loads(body)


@router.post("/name-enquiry")
def name_enquiry(payload: dict = Depends(signed_body), db: Session = Depends(get_db)) -> dict:
    """Another bank asks who owns one of our accounts."""
    row = db.execute(
        select(User.display_name).join(Account, Account.user_id == User.id).where(Account.account_number == payload.get("accountNumber"))
    ).first()
    if row is None:
        raise ApiError(404, "account_not_found", "No account with that number.")
    return {"accountName": row[0]}


@router.post("/events")
def events(payload: dict = Depends(signed_body), db: Session = Depends(get_db)) -> dict:
    """Status changes on our outbound payments, and credits from other banks."""
    kind, data = payload.get("type"), payload.get("data") or {}
    if kind in ("transfer.status", "transfer.reversed"):
        t = db.get(Transfer, data.get("reference"))
        if t is None or t.rail != "interbank":
            raise ApiError(404, "not_found", "Unknown transfer reference.")
        interbank.apply_update(db, t, data)
    elif kind == "inbound.credit":
        interbank.credit_inbound(db, data)
    else:
        raise ApiError(422, "unknown_event", f"Unknown event type {kind!r}.")
    db.commit()
    log.info("Applied network event %s for %s", kind, data.get("reference") or data.get("sessionId"))
    return {"ok": True}
