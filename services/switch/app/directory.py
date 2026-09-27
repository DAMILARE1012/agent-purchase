"""Fictional banks and their account holders, for the sandbox network."""

from app.accounts import make_account_number

BANKS: dict[str, str] = {
    "101": "Aurora Bank",
    "102": "Harbor Trust Bank",
    "103": "Meridian Bank",
    "104": "Northwind Savings",
}

# New holders go at the end of a bank's list: numbers are derived from the position,
# so existing accounts keep their numbers. From the 4th entry on, these are the
# Mandate Gate sandbox sellers' settlement accounts (and one scammer's).
_HOLDERS: dict[str, list[str]] = {
    "101": ["Maya Chen", "Daniel Osei", "Lena Fischer", "Ikeja Office Hub Ltd", "Lekki Gadget Hub Ltd",
            "Surulere Pharmacy Ltd", "Ibadan Home Essentials Ltd", "Airtime Plus Nigeria Ltd", "Jos Solar and Power Ltd"],
    "102": ["Leo Martins", "Amara Obi", "Hannah Wright", "PrintPoint Enterprises", "IOH Official Stores",
            "Abuja Baby Store Ltd", "Yaba Book Hub Enterprises", "Kaduna Office World Ltd", "Aba Quality Shoes Enterprises"],
    "103": ["Priya Nair", "Tomás Rivera", "Grace Mensah", "Ada Okoro Enterprises", "Cheap Deals Warehouse",
            "Chioma Nwosu Foodstuff Enterprises", "Glow Beauty Stores Ltd", "Owerri Fresh Mart Ltd", "Toner King Ventures"],
    "104": ["Owen Brooks", "Sofia Rossi", "Kwame Asante", "QuickData Nigeria Ltd", "Adebayo Musa",
            "Kano Grains Depot Nig. Ltd", "PH Phone Accessories Ltd", "Benin Building Supplies Ltd", "VI Table Water Ltd"],
}

# (bank_code, account_number) -> holder name. Numbers are Luhn-valid and stable.
DIRECTORY: dict[tuple[str, str], str] = {
    (code, make_account_number(f"{code}{i + 1:06d}")): name
    for code, names in _HOLDERS.items()
    for i, name in enumerate(names)
}


def lookup(bank_code: str, account_number: str) -> str | None:
    return DIRECTORY.get((bank_code, account_number))
