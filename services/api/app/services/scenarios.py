"""Sandbox scenarios: ready-made receipts that exercise each branch of verification."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.formatting import now
from app.models import Receipt, Transfer
from app.services import signing
from app.services.seed import DEMO_USERS

_USERS = {u.username: u for u in DEMO_USERS}

# id, label, description, seeded payment note, viewer username ("" = not signed in), source, mock vision
_SCENARIOS = [
    ("genuine", "Genuine payment", "Sam paid Rita $250 for concert tickets.", "Concert tickets", "rita", "link", None),
    ("edited", "Edited amount", "Sam paid Ada's Bakery $25. The screenshot was edited to say $250.", "Cake order", "ada", "upload",
     schemas.MockVision(printed_amount_minor=25_000, tamper_score=0.93)),
    ("forged", "Forged receipt", "A $900 receipt for a payment that never happened, signed with a fake key.", None, "rita", "link", None),
    ("recycled-confirmed", "Recycled, confirmed before", "Rita confirmed this $40 lunch payment two weeks ago.", "Lunch", "rita", "link", None),
    ("recycled-checked", "Recycled, never confirmed", "Rita checked this $60 payment five days ago but never confirmed it.", "Taxi share",
     "rita", "link", None),
    ("reversed", "Reversed payment", "Jordan paid Rita $300, then the payment was reversed.", "Phone", "rita", "link", None),
    ("pending", "Pending payment", "Sam's $120 payment to Rita hasn't arrived yet.", "Rent share", "rita", "link", None),
    ("someone-else", "Someone else's receipt", "A receipt for Sam's payment to Ada's Bakery, checked by Rita.", "Cake order", "rita", "link", None),
    ("public", "Not signed in", "Someone without an account checks Sam's $250 payment to Rita.", "Concert tickets", "", "link", None),
]


def _token_for_note(db: Session, note: str) -> str | None:
    t = db.scalar(select(Transfer).where(Transfer.note == note, Transfer.kind == "payment").order_by(Transfer.created_at).limit(1))
    receipt = db.get(Receipt, t.tx) if t else None
    return receipt.token if receipt else None


def _forged_token(db: Session) -> str:
    key = signing.active_key(db)
    payload = signing.canonical_payload("tx_7F00D0000000", 90_000, "USD", "acct_rita", now() - timedelta(minutes=18), key.kid)
    return signing.forge_receipt(payload)


def demo_scenarios(db: Session) -> list[schemas.DemoScenarioOut]:
    out = []
    for sid, label, description, note, username, source, vision in _SCENARIOS:
        token = _forged_token(db) if sid == "forged" else _token_for_note(db, note or "")
        if token is None:
            continue
        viewer = _USERS.get(username)
        out.append(schemas.DemoScenarioOut(
            id=sid, label=label, description=description,
            viewer_user_id=viewer.id if viewer else "guest", viewer_username=username,
            request=schemas.ScanIn(token=token, source=source, mock_vision=vision),
        ))
    return out
