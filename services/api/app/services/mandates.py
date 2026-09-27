"""
Mandates: the limits a shopper signs (system_design.md §3 step 1).

M5 stores and serves mandates so AI runs can use them. Drafting still uses the
rule-based compiler below; M6 replaces it with Qwen (intent.compile) and
verifies the passkey assertion over `mandate_hash`.
"""

import hashlib
import json
import re
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.formatting import now
from app.models import AgentRun, Mandate
from app.security import Viewer

HOUR = timedelta(hours=1)
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
BRANDS = ["HP", "Canon", "Epson", "MTN", "Airtel", "Glo", "9mobile", "Oraimo", "Samsung", "Tecno", "Infinix", "Indomie", "Peak", "Pampers", "Dangote"]
CATEGORIES: list[tuple[str, str]] = [
    (r"toner", "Printer toner"),
    (r"\bink\b|cartridge", "Printer ink"),
    (r"\bdata\b|bundle|\bgb\b", "Data"),
    (r"airtime", "Airtime"),
    (r"paper|ream", "Paper"),
    (r"charger", "Chargers"),
    (r"power ?bank", "Power banks"),
    (r"diaper", "Diapers"),
    (r"cement", "Cement"),
]
WAT = timedelta(hours=1)


def canonical_hash(mode: str, limits: dict) -> str:
    """SHA-256 of canonical JSON (sorted keys, no spaces). Matches the web app's mandateHash()."""
    body = json.dumps({"mode": mode, "limits": limits}, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def _at_six_pm_wat(day_offset: int, now: datetime | None = None) -> str:
    local = (now or datetime.now(UTC)) + WAT
    target = (local + timedelta(days=day_offset)).replace(hour=18, minute=0, second=0, microsecond=0) - WAT
    return target.isoformat().replace("+00:00", "Z")


def _deadline(text: str, now: datetime | None = None) -> str | None:
    t = text.lower()
    if re.search(r"\b(by|before)\s+tomorrow\b", t):
        return _at_six_pm_wat(1, now)
    for i, day in enumerate(WEEKDAYS):
        if re.search(rf"\b(by|before|on)\s+{day}\b", t):
            today = ((now or datetime.now(UTC)) + WAT).weekday()
            return _at_six_pm_wat((i - today) % 7 or 7, now)
    return None


def _amount(text: str) -> int | None:
    m = re.search(r"(?:under|below|max(?:imum)?|at most|not more than|less than|within|up to)\s*(?:₦|n|ngn)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\b", text, re.I) \
        or re.search(r"₦\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\b", text, re.I)
    if not m:
        return None
    return _minor(m)


def _minor(m: re.Match) -> int | None:
    n = float(m.group(1).replace(",", "")) * {"k": 1_000, "m": 1_000_000}.get((m.group(2) or "").lower(), 1)
    return round(n * 100) if n > 0 else None


_NUMBER = r"(?:₦|\bn|ngn)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\s*(?:naira\s*)?"


def _amount_per(text: str, per: str) -> int | None:
    """An amount followed by what it's per: "₦5,000 each time", "₦10,000 a month"."""
    m = re.search(_NUMBER + per, text, re.I)
    return _minor(m) if m else None


def _standing_amounts(text: str, amount: int | None) -> tuple[int | None, int | None]:
    """
    Repeat purchases can state two limits: per purchase ("₦5,000 each time") and per period
    ("at most ₦10,000 a month"). Found by evaluation (intent_fidelity, airtime case): using the
    period cap as the per-purchase limit too let one purchase spend the whole month's cap.
    """
    per_purchase = _amount_per(text, r"(?:each time|per purchase|per order|a time|per top[- ]?up|each)\b")
    per_period = _amount_per(text, r"(?:a|per|each|every)\s+(?:week|month)\b")
    return per_purchase or per_period or amount, per_period or amount


def draft(request: str, mode: str, city: str = "Lagos", now: datetime | None = None) -> dict:
    """
    The rule-based draft that intent.compile (Qwen) tightens or completes. Anything it
    can't find is set to the strictest value and becomes a question. `now` is fixed in
    evaluations, so dates like "by Friday" are reproducible.
    """
    now = now or datetime.now(UTC)
    text = request.strip()
    if not text:
        raise ApiError(422, "empty_request", "Say what you want to buy.")
    defaulted: list[str] = []
    questions: list[dict] = []

    item = re.split(r"[,.;]| under | below | at most | from | delivered | by ", text, flags=re.I)[0]
    item = re.sub(r"^(please\s+)?(buy|get|order|find)( me)?\s+", "", item, flags=re.I).strip() or text
    bm = re.search(rf"\b({'|'.join(BRANDS)})\b\s*([A-Za-z0-9-]*\d[A-Za-z0-9-]*)?", text, re.I)
    brand = next((b for b in BRANDS if bm and b.lower() == bm.group(1).lower()), None)
    model = bm.group(2).upper() if bm and bm.group(2) and not re.fullmatch(r"\d+\s*gb", bm.group(2), re.I) else None
    category = next((c for pattern, c in CATEGORIES if re.search(pattern, text, re.I)), None)
    qm = re.match(r"^\s*(?:buy |get )?(\d{1,3})\s+(?!gb\b|kg\b|l\b|litres?\b|w\b)", text, re.I)
    quantity = int(qm.group(1)) if qm else 1

    amount = _amount(text)
    if amount is None:
        defaulted.append("maxTotalMinor")
        questions.append({"field": "maxTotalMinor", "question": "What's the most you want to spend, including delivery? Until you say, nothing can be paid."})

    policy = "verified_only"
    if re.search(r"known|any seller|trusted", text, re.I) and not re.search(r"verified only|only verified", text, re.I):
        policy = "verified_and_known"
    elif not re.search(r"verified", text, re.I):
        defaulted.append("sellerPolicy")

    deliver_by = _deadline(text, now)
    if not deliver_by and mode == "present":
        defaulted.append("deliverBy")
        questions.append({"field": "deliverBy", "question": "When do you need it by? Without a date, any delivery date is accepted."})

    standing = mode == "not_present"
    per_purchase, cap = _standing_amounts(text, amount) if standing else (amount, None)
    if not standing:
        defaulted += ["expiresAt", "maxUses"]
    period = ("week" if re.search(r"week", text, re.I) else "month") if standing else None
    if standing and not re.search(r"week|month", text, re.I):
        defaulted.append("period")
        questions.append({"field": "period", "question": "Is the limit per week or per month?"})

    limits = {
        "item": item, "brand": brand, "model": model, "category": category, "quantity": quantity,
        "maxTotalMinor": per_purchase or 0, "maxPerItemMinor": None, "sellerPolicy": policy, "sellerIds": [],
        "deliverBy": deliver_by, "deliveryCity": city,
        "expiresAt": (now + (30 * 24 if standing else 24) * HOUR).isoformat().replace("+00:00", "Z"),
        "maxUses": 10 if standing else 1, "periodCapMinor": cap if standing else None, "period": period,
        "shareDelivery": {"name": True, "phone": True, "address": not re.search(r"data|airtime", text, re.I)},
    }
    return {"request": text, "mode": mode, "limits": limits, "defaulted": defaulted, "questions": questions,
            "compiledBy": "rules-2026.09 (Qwen drafting arrives in M6)"}


def validate_limits(limits: dict, mode: str) -> None:
    def fail(msg: str):
        raise ApiError(422, "invalid_limits", msg)

    if not str(limits.get("item", "")).strip():
        fail("Say what the AI should buy.")
    if not isinstance(limits.get("maxTotalMinor"), int) or limits["maxTotalMinor"] <= 0:
        fail("Set a maximum total before signing.")
    if not isinstance(limits.get("quantity"), int) or limits["quantity"] < 1:
        fail("Quantity must be at least 1.")
    if not isinstance(limits.get("maxUses"), int) or not 1 <= limits["maxUses"] <= 50:
        fail("Number of purchases must be between 1 and 50.")
    if limits.get("sellerPolicy") not in ("verified_only", "verified_and_known", "listed"):
        fail("Unknown seller rule.")
    if not str(limits.get("deliveryCity", "")).strip():
        fail("Say which city to deliver to.")
    try:
        expires = datetime.fromisoformat(str(limits["expiresAt"]).replace("Z", "+00:00"))
    except (KeyError, ValueError):
        fail("The expiry date isn't valid.")
    if expires <= datetime.now(UTC):
        fail("The mandate must expire in the future.")
    if mode == "not_present" and not (limits.get("periodCapMinor") and limits.get("period") in ("week", "month")):
        fail("Standing mandates need a spending cap per week or month.")


def mode_of(draft_in: dict) -> str:
    mode = draft_in.get("mode", "present")
    if mode not in ("present", "not_present"):
        raise ApiError(422, "invalid_mode", "Unknown mode.")
    return mode


def create(db: Session, viewer: Viewer, draft_in: dict, limits: dict, *, assertion: str, signature_kind: str, passkey_id: int | None) -> Mandate:
    """Stores a mandate whose signature the caller has already verified over canonical_hash(mode, limits)."""
    mode = mode_of(draft_in)
    validate_limits(limits, mode)
    m = Mandate(
        id="m_" + secrets.token_hex(8), user_id=viewer.user.id, status="active", mode=mode, request=str(draft_in.get("request", ""))[:500],
        limits=limits, mandate_hash=canonical_hash(mode, limits), assertion=assertion, signature_kind=signature_kind, passkey_id=passkey_id,
        compiled_by=str(draft_in.get("compiledBy") or "")[:120] or None, uses=0, spent_minor=0, signed_at=now(),
    )
    db.add(m)
    db.commit()
    return m


def refresh_status(m: Mandate) -> Mandate:
    """Expiry is checked on read, so a mandate is never active past its limit."""
    if m.status == "active" and datetime.fromisoformat(str(m.limits["expiresAt"]).replace("Z", "+00:00")) <= datetime.now(UTC):
        m.status = "expired"
    return m


def get_own(db: Session, viewer: Viewer, mandate_id: str) -> Mandate:
    m = db.get(Mandate, mandate_id)
    if m is None or (m.user_id != viewer.user.id and viewer.role not in ("analyst", "ops")):
        raise ApiError(404, "not_found", "Mandate not found.")
    return refresh_status(m)


def list_own(db: Session, viewer: Viewer) -> list[Mandate]:
    rows = db.scalars(select(Mandate).where(Mandate.user_id == viewer.user.id).order_by(Mandate.created_at.desc())).all()
    return [refresh_status(m) for m in rows]


def revoke(db: Session, viewer: Viewer, mandate_id: str) -> Mandate:
    m = get_own(db, viewer, mandate_id)
    if m.user_id != viewer.user.id:
        raise ApiError(403, "forbidden", "Only the shopper can cancel their mandate.")
    # Lock and re-read the row, so a payment approval and a cancellation can't interleave:
    # whichever takes the lock first wins, and the other sees its result.
    m = db.scalars(select(Mandate).where(Mandate.id == m.id).with_for_update().execution_options(populate_existing=True)).one()
    refresh_status(m)
    if m.status in ("active", "used_up"):
        m.status, m.revoked_at = "revoked", now()
    for run in db.scalars(select(AgentRun).where(AgentRun.mandate_id == m.id, AgentRun.status.in_(["queued", "running", "awaiting_approval"]))):
        run.status, run.ended_at, run.outcome_note = "declined", now(), "The mandate was cancelled. Nothing was paid."
    db.commit()
    return m


def run_ids(db: Session, mandate_id: str) -> list[str]:
    return list(db.scalars(select(AgentRun.id).where(AgentRun.mandate_id == mandate_id).order_by(AgentRun.created_at.desc())))
