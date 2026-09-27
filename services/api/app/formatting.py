"""Human-readable money and dates for user-facing messages."""

import secrets
from datetime import UTC, datetime


def now() -> datetime:
    return datetime.now(UTC)


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6).upper()}"


def money(amount_minor: int, currency: str = "USD") -> str:
    symbol = "$" if currency == "USD" else f"{currency} "
    sign = "-" if amount_minor < 0 else ""
    return f"{sign}{symbol}{abs(amount_minor) / 100:,.2f}"


def date_time(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%d %b, %H:%M UTC").lstrip("0")


def date_only(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%d %b %Y").lstrip("0")


def hours_since(value: datetime) -> float:
    return (now() - value).total_seconds() / 3600
