"""Fictional banks and their account holders, for the sandbox network."""

from app.accounts import make_account_number

BANKS: dict[str, str] = {
    "101": "Aurora Bank",
    "102": "Harbor Trust Bank",
    "103": "Meridian Bank",
    "104": "Northwind Savings",
}

_HOLDERS: dict[str, list[str]] = {
    "101": ["Maya Chen", "Daniel Osei", "Lena Fischer"],
    "102": ["Leo Martins", "Amara Obi", "Hannah Wright"],
    "103": ["Priya Nair", "Tomás Rivera", "Grace Mensah"],
    "104": ["Owen Brooks", "Sofia Rossi", "Kwame Asante"],
}

# (bank_code, account_number) -> holder name. Numbers are Luhn-valid and stable.
DIRECTORY: dict[tuple[str, str], str] = {
    (code, make_account_number(f"{code}{i + 1:06d}")): name
    for code, names in _HOLDERS.items()
    for i, name in enumerate(names)
}


def lookup(bank_code: str, account_number: str) -> str | None:
    return DIRECTORY.get((bank_code, account_number))
