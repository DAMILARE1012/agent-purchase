"""Account numbers: 9 digits plus a Luhn check digit, so most typos are caught locally."""


def luhn_check_digit(base: str) -> str:
    total = 0
    for i, ch in enumerate(reversed(base)):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return str((10 - total % 10) % 10)


def is_valid_account_number(number: str) -> bool:
    return len(number) == 10 and number.isdigit() and luhn_check_digit(number[:9]) == number[9]


def make_account_number(base9: str) -> str:
    return base9 + luhn_check_digit(base9)


def new_platform_account_number(db) -> str:
    """A random, unused, check-digited account number for a new wallet."""
    import secrets

    from sqlalchemy import select

    from app.models import Account

    while True:
        number = make_account_number("2" + "".join(secrets.choice("0123456789") for _ in range(8)))
        if db.scalar(select(Account.id).where(Account.account_number == number)) is None:
            return number
