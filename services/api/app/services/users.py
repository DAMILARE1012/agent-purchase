"""Just-in-time provisioning: a Keycloak user gets a platform user (and wallet) on first request."""

import re
import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Account, User
from app.security import Principal, Viewer
from app.services import ledger

# Roles with a balance on the platform. Staff roles (analyst, ops, admin) have none.
WALLET_ROLES = {"shopper", "seller"}


def primary_role(roles: frozenset[str]) -> str:
    """A user with several Keycloak roles gets the most privileged one's workspace."""
    for role in ("admin", "ops", "analyst", "seller"):
        if role in roles:
            return role
    return "shopper"


def handle(user: User) -> str:
    return f"@{user.username}"


def _account_id_for(db: Session, username: str) -> str:
    base = "acct_" + (re.sub(r"[^a-z0-9_]", "", username.lower())[:24] or "user")
    return base if db.get(Account, base) is None else f"{base}_{secrets.token_hex(3)}"


def open_wallet(db: Session, user: User) -> Account:
    from app.services.account_numbers import new_platform_account_number

    account = Account(
        id=_account_id_for(db, user.username),
        user_id=user.id,
        account_number=new_platform_account_number(db),
        kind="user",
        name=user.display_name,
        currency="USD",
    )
    db.add(account)
    db.flush()
    settings = get_settings()
    if settings.sandbox_mode and settings.welcome_credit_minor > 0:
        ledger.ensure_system_accounts(db)
        ledger.post(db, "Sandbox welcome credit", ledger.transfer_lines(ledger.FUNDING, account.id, settings.welcome_credit_minor))
    return account


def _wallet_of(db: Session, user_id: str) -> Account | None:
    return db.scalar(select(Account).where(Account.user_id == user_id))


def provision(db: Session, principal: Principal) -> Viewer:
    role = primary_role(principal.roles)
    user = db.get(User, principal.sub)
    try:
        if user is None:
            user = User(
                id=principal.sub,
                username=principal.username,
                display_name=principal.name,
                email=principal.email,
                role=role,
                flagged=False,
            )
            db.add(user)
            db.flush()
        elif user.role != role:
            user.role = role  # Keycloak is the source of truth for roles.

        account = _wallet_of(db, user.id)
        if account is None and role in WALLET_ROLES:
            account = open_wallet(db, user)
        db.commit()
    except IntegrityError:
        # Two first requests raced; the other one created the rows.
        db.rollback()
        user = db.get(User, principal.sub)
        assert user is not None
        account = _wallet_of(db, user.id)
    return Viewer(user=user, account=account)
