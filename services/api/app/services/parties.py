from sqlalchemy.orm import Session

from app import schemas
from app.config import get_settings
from app.models import Account, Transfer, User
from app.services import ledger
from app.services.users import handle


def mask_account(number: str | None) -> str:
    return f"••••{number[-4:]}" if number else ""


def external_party(t: Transfer) -> schemas.PartySummary:
    """The person at another bank on an inter-bank payment."""
    return schemas.PartySummary(
        user_id=f"ext:{t.counterparty_bank_code}:{t.counterparty_account_number}",
        display_name=t.counterparty_name or "Unknown",
        handle=f"{t.counterparty_bank_name} {mask_account(t.counterparty_account_number)}",
        account_number=t.counterparty_account_number,
        bank_code=t.counterparty_bank_code,
        bank_name=t.counterparty_bank_name,
    )


class Parties:
    """Resolves account IDs to people, caching within one request."""

    def __init__(self, db: Session):
        self.db = db
        self._cache: dict[str, tuple[Account, User | None]] = {}

    def owner(self, account_id: str) -> tuple[Account, User | None]:
        if account_id not in self._cache:
            account = self.db.get(Account, account_id)
            assert account is not None, account_id
            user = self.db.get(User, account.user_id) if account.user_id else None
            self._cache[account_id] = (account, user)
        return self._cache[account_id]

    def summary(self, account_id: str) -> schemas.PartySummary:
        account, user = self.owner(account_id)
        if user is None:
            return schemas.PartySummary(user_id=account.id, display_name=account.name, handle="")
        settings = get_settings()
        return schemas.PartySummary(
            user_id=user.id,
            display_name=user.display_name,
            handle=handle(user),
            account_number=account.account_number,
            bank_code=settings.platform_bank_code,
            bank_name=settings.platform_bank_name,
        )

    def side(self, t: Transfer, account_id: str) -> schemas.PartySummary:
        """One side of a transfer; the network side of an inter-bank payment is the external person."""
        if t.rail == "interbank" and account_id == ledger.NETWORK:
            return external_party(t)
        return self.summary(account_id)

    def name(self, account_id: str) -> str:
        return self.summary(account_id).display_name

    def side_name(self, t: Transfer, account_id: str) -> str:
        return self.side(t, account_id).display_name

    def user(self, account_id: str) -> User | None:
        return self.owner(account_id)[1]
