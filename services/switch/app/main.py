"""
SandboxSwitch: a mock inter-bank payment network.

It plays the role a national instant-payment switch plays for real banks:
name enquiry, transfers with a session ID, transaction status queries,
delayed outcomes and reversals pushed to participants by signed webhook,
and a settlement report.

Test amounts (by the cents part):
  .13  times out, then succeeds after PENDING_SECONDS
  .14  times out, then fails after PENDING_SECONDS
  .66  succeeds, then the recipient bank reverses it after REVERSAL_SECONDS
  any other amount succeeds immediately
"""

import asyncio
import logging
import secrets
import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app import participant, store
from app.accounts import is_valid_account_number
from app.config import get_settings
from app.directory import BANKS, DIRECTORY, lookup

log = logging.getLogger("switch")


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class NameEnquiryIn(Schema):
    bank_code: str
    account_number: str


class TransferIn(Schema):
    reference: str
    from_bank_code: str
    from_account_number: str
    from_name: str
    to_bank_code: str
    to_account_number: str
    amount_minor: int
    narration: str | None = None


class InboundIn(Schema):
    from_bank_code: str
    from_account_number: str
    to_account_number: str
    amount_minor: int
    narration: str | None = None


def require_key(authorization: str | None = Header(default=None)) -> None:
    if authorization != f"Bearer {get_settings().switch_api_key}":
        raise HTTPException(401, {"error": "unauthorized", "message": "Invalid switch API key."})


def fail(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, {"error": code, "message": message})


def bank_name(code: str) -> str | None:
    settings = get_settings()
    return settings.platform_bank_name if code == settings.platform_bank_code else BANKS.get(code)


def resolve_name(bank_code: str, account_number: str) -> str:
    if bank_name(bank_code) is None:
        raise fail(404, "unknown_bank", "That bank isn't on the network.")
    if not is_valid_account_number(account_number):
        raise fail(422, "invalid_account_number", "That account number isn't valid. Check the 10 digits.")
    if bank_code == get_settings().platform_bank_code:
        try:
            name = participant.name_enquiry(account_number)
        except httpx.HTTPError as exc:
            raise fail(504, "bank_unavailable", "The recipient's bank didn't respond. Try again.") from exc
    else:
        name = lookup(bank_code, account_number)
    if name is None:
        raise fail(404, "account_not_found", "No account with that number at this bank.")
    return name


def row_out(row) -> dict:
    return {
        "sessionId": row["session_id"],
        "reference": row["reference"],
        "direction": row["direction"],
        "status": row["status"],
        "amountMinor": row["amount_minor"],
        "fromBankCode": row["from_bank"],
        "fromAccountNumber": row["from_account"],
        "fromName": row["from_name"],
        "toBankCode": row["to_bank"],
        "toAccountNumber": row["to_account"],
        "toName": row["to_name"],
        "narration": row["narration"],
        "createdAt": datetime.fromtimestamp(row["created_at"], UTC).isoformat(),
        "updatedAt": datetime.fromtimestamp(row["updated_at"], UTC).isoformat(),
    }


def new_session_id() -> str:
    return datetime.now(UTC).strftime("%y%m%d%H%M%S") + secrets.token_hex(5).upper()


# ---- Background: resolve delayed outcomes and deliver webhooks ------------------------


def tick() -> None:
    now = time.time()
    with store.tx() as db:
        for row in db.execute("SELECT * FROM transfers WHERE status = 'pending' AND resolve_at <= ?", (now,)).fetchall():
            db.execute(
                "UPDATE transfers SET status = final_status, notify_pending = 1, updated_at = ? WHERE session_id = ?",
                (now, row["session_id"]),
            )
        for row in db.execute("SELECT * FROM transfers WHERE status = 'successful' AND reverse_at <= ?", (now,)).fetchall():
            db.execute(
                "UPDATE transfers SET status = 'reversed', notify_pending = 1, updated_at = ? WHERE session_id = ?",
                (now, row["session_id"]),
            )
        due = db.execute("SELECT * FROM transfers WHERE notify_pending = 1 AND direction = 'outbound'").fetchall()
    for row in due:
        event = "transfer.reversed" if row["status"] == "reversed" else "transfer.status"
        if participant.send_event(event, row_out(row)):
            with store.tx() as db:
                db.execute("UPDATE transfers SET notify_pending = 0 WHERE session_id = ?", (row["session_id"],))


async def ticker() -> None:
    while True:
        await asyncio.sleep(2)
        try:
            await asyncio.to_thread(tick)
        except Exception:
            log.exception("Switch tick failed")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(ticker())
    yield
    task.cancel()


app = FastAPI(title="SandboxSwitch", version="0.1.0", description=__doc__, lifespan=lifespan)


@app.exception_handler(HTTPException)
async def http_error(_request, exc: HTTPException):
    from fastapi.responses import JSONResponse

    detail = exc.detail if isinstance(exc.detail, dict) else {"error": "error", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content=detail)


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict:
    return {"ok": True}


@app.get("/v1/banks", dependencies=[Depends(require_key)])
def banks() -> list[dict]:
    settings = get_settings()
    listed = [{"code": settings.platform_bank_code, "name": settings.platform_bank_name}]
    return listed + [{"code": code, "name": name} for code, name in BANKS.items()]


@app.post("/v1/name-enquiry", dependencies=[Depends(require_key)])
def name_enquiry(body: NameEnquiryIn) -> dict:
    name = resolve_name(body.bank_code, body.account_number)
    return {"bankCode": body.bank_code, "bankName": bank_name(body.bank_code), "accountNumber": body.account_number, "accountName": name}


@app.post("/v1/transfers", dependencies=[Depends(require_key)])
def create_transfer(body: TransferIn) -> dict:
    settings = get_settings()
    if body.to_bank_code == settings.platform_bank_code:
        raise fail(422, "same_bank", "Payments inside the platform don't go through the switch.")
    if body.amount_minor <= 0:
        raise fail(422, "invalid_amount", "Amount must be positive.")

    with store.tx() as db:
        existing = db.execute("SELECT * FROM transfers WHERE reference = ?", (body.reference,)).fetchone()
        if existing:  # Idempotent by the sender's reference.
            return row_out(existing)

    to_name = resolve_name(body.to_bank_code, body.to_account_number)
    now = time.time()
    cents = body.amount_minor % 100
    status, final, resolve_at, reverse_at = "successful", None, None, None
    if cents == 13:
        status, final, resolve_at = "pending", "successful", now + settings.pending_seconds
    elif cents == 14:
        status, final, resolve_at = "pending", "failed", now + settings.pending_seconds
    elif cents == 66:
        reverse_at = now + settings.reversal_seconds

    with store.tx() as db:
        db.execute(
            """INSERT INTO transfers (session_id, reference, direction, from_bank, from_account, from_name, to_bank, to_account,
               to_name, amount_minor, narration, status, final_status, resolve_at, reverse_at, created_at, updated_at)
               VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (new_session_id(), body.reference, body.from_bank_code, body.from_account_number, body.from_name, body.to_bank_code,
             body.to_account_number, to_name, body.amount_minor, body.narration, status, final, resolve_at, reverse_at, now, now),
        )
        row = db.execute("SELECT * FROM transfers WHERE reference = ?", (body.reference,)).fetchone()
    return row_out(row)


@app.get("/v1/transfers/{reference}", dependencies=[Depends(require_key)])
def transaction_status(reference: str) -> dict:
    """Transaction status query (TSQ), by the sender's reference."""
    tick()
    with store.tx() as db:
        row = db.execute("SELECT * FROM transfers WHERE reference = ?", (reference,)).fetchone()
    if row is None:
        raise fail(404, "not_found", "No transfer with that reference.")
    return row_out(row)


@app.get("/v1/settlement", dependencies=[Depends(require_key)])
def settlement(date: str) -> dict:
    """Settlement report for one UTC day: every transfer that ended successful or reversed."""
    start = datetime.fromisoformat(date).replace(tzinfo=UTC).timestamp()
    with store.tx() as db:
        rows = db.execute(
            "SELECT * FROM transfers WHERE created_at >= ? AND created_at < ? AND status IN ('successful', 'reversed') ORDER BY created_at",
            (start, start + 86_400),
        ).fetchall()
    items = [row_out(r) for r in rows]
    platform = get_settings().platform_bank_code
    net = sum(
        (r["amountMinor"] if r["direction"] == "inbound" else -r["amountMinor"]) for r in items if r["status"] == "successful"
    )
    return {"date": date, "participant": platform, "netPositionMinor": net, "transfers": items}


# ---- Sandbox helpers --------------------------------------------------------------------


@app.get("/v1/sandbox/directory", dependencies=[Depends(require_key)])
def directory() -> list[dict]:
    return [
        {"bankCode": code, "bankName": BANKS[code], "accountNumber": number, "accountName": name}
        for (code, number), name in DIRECTORY.items()
    ]


@app.post("/v1/sandbox/inbound", dependencies=[Depends(require_key)])
def simulate_inbound(body: InboundIn) -> dict:
    """An account holder at another bank sends money to a platform account."""
    settings = get_settings()
    from_name = resolve_name(body.from_bank_code, body.from_account_number)
    to_name = resolve_name(settings.platform_bank_code, body.to_account_number)
    now = time.time()
    session_id = new_session_id()
    with store.tx() as db:
        db.execute(
            """INSERT INTO transfers (session_id, reference, direction, from_bank, from_account, from_name, to_bank, to_account,
               to_name, amount_minor, narration, status, created_at, updated_at)
               VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, 'successful', ?, ?)""",
            (session_id, f"in-{session_id}", body.from_bank_code, body.from_account_number, from_name, settings.platform_bank_code,
             body.to_account_number, to_name, body.amount_minor, body.narration, now, now),
        )
        row = db.execute("SELECT * FROM transfers WHERE session_id = ?", (session_id,)).fetchone()
    # Credit notification: synchronous, like a real instant-payment credit request.
    if not participant.send_event("inbound.credit", row_out(row)):
        with store.tx() as db:
            db.execute("UPDATE transfers SET status = 'failed', updated_at = ? WHERE session_id = ?", (time.time(), session_id))
        raise fail(502, "credit_failed", "The receiving bank didn't accept the credit.")
    return row_out(row)


@app.post("/v1/sandbox/reset", dependencies=[Depends(require_key)])
def reset() -> dict:
    store.reset()
    return {"ok": True}
