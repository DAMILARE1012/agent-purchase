"""Who is being paid: a wallet on this platform, or an account at another bank (name enquiry)."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.config import get_settings
from app.errors import ApiError
from app.models import Account, User
from app.services import network
from app.services.account_numbers import is_valid_account_number


@dataclass(frozen=True)
class Payee:
    bank_code: str
    bank_name: str
    account_number: str
    account_name: str
    account: Account | None  # Set when the payee is on this platform.

    @property
    def on_platform(self) -> bool:
        return self.account is not None


def lookup(db: Session, bank_code: str, account_number: str) -> Payee:
    """Name enquiry. Validates the check digit first, so typos never reach the network."""
    settings = get_settings()
    account_number = account_number.strip()
    if not is_valid_account_number(account_number):
        raise ApiError(422, "invalid_account_number", "That account number isn't valid. Check the 10 digits.")

    if bank_code == settings.platform_bank_code:
        row = db.execute(
            select(Account, User).join(User, User.id == Account.user_id).where(Account.account_number == account_number)
        ).first()
        if row is None:
            raise ApiError(404, "account_not_found", f"No account with that number at {settings.platform_bank_name}.")
        account, user = row
        return Payee(bank_code, settings.platform_bank_name, account_number, user.display_name, account)

    found = network.name_enquiry(bank_code, account_number)
    return Payee(bank_code, found["bankName"], account_number, found["accountName"], None)


def for_payment(db: Session, body: schemas.CreateTransferIn) -> Payee:
    if body.bank_code and body.account_number:
        return lookup(db, body.bank_code, body.account_number)
    if body.to_user_id:
        row = db.execute(select(Account, User).join(User, User.id == Account.user_id).where(User.id == body.to_user_id)).first()
        if row is None:
            raise ApiError(422, "unknown_payee", "Choose someone to pay.")
        account, user = row
        settings = get_settings()
        return Payee(settings.platform_bank_code, settings.platform_bank_name, account.account_number or "", user.display_name, account)
    raise ApiError(422, "missing_payee", "Enter the recipient's bank and account number.")


def to_out(p: Payee) -> schemas.NameEnquiryOut:
    return schemas.NameEnquiryOut(
        bank_code=p.bank_code, bank_name=p.bank_name, account_number=p.account_number, account_name=p.account_name, on_platform=p.on_platform
    )
