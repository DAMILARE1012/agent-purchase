"""account numbers and interbank transfers

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-26 19:04:18.889061
"""

import secrets
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0002'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Demo users keep the same numbers the seed gives them (see app/services/seed.py).
DEMO_ORDER = ["sam", "rita", "ada", "jordan", "morgan", "olivia"]


def _check_digit(base: str) -> str:
    total = 0
    for i, ch in enumerate(reversed(base)):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return str((10 - total % 10) % 10)


def _number(base9: str) -> str:
    return base9 + _check_digit(base9)


def upgrade() -> None:
    op.add_column('accounts', sa.Column('account_number', sa.String(length=10), nullable=True))
    op.add_column('transfers', sa.Column('rail', sa.String(length=10), server_default='internal', nullable=False))
    op.add_column('transfers', sa.Column('counterparty_bank_code', sa.String(length=10), nullable=True))
    op.add_column('transfers', sa.Column('counterparty_bank_name', sa.String(length=80), nullable=True))
    op.add_column('transfers', sa.Column('counterparty_account_number', sa.String(length=10), nullable=True))
    op.add_column('transfers', sa.Column('counterparty_name', sa.String(length=120), nullable=True))
    op.add_column('transfers', sa.Column('network_session_id', sa.String(length=40), nullable=True))
    op.add_column('transfers', sa.Column('network_status', sa.String(length=12), nullable=True))

    # Backfill: every existing wallet gets an account number.
    conn = op.get_bind()
    used: set[str] = set()
    rows = conn.execute(sa.text(
        "SELECT a.id, u.username FROM accounts a JOIN users u ON u.id = a.user_id WHERE a.kind = 'user' ORDER BY a.created_at"
    )).all()
    for account_id, username in rows:
        if username in DEMO_ORDER:
            number = _number(f"2000000{DEMO_ORDER.index(username) + 1:02d}")
        else:
            number = _number("2" + "".join(secrets.choice("0123456789") for _ in range(8)))
            while number in used:
                number = _number("2" + "".join(secrets.choice("0123456789") for _ in range(8)))
        used.add(number)
        conn.execute(sa.text("UPDATE accounts SET account_number = :n WHERE id = :id"), {"n": number, "id": account_id})

    op.create_unique_constraint('uq_accounts_account_number', 'accounts', ['account_number'])
    op.create_unique_constraint('uq_transfers_network_session_id', 'transfers', ['network_session_id'])


def downgrade() -> None:
    op.drop_constraint('uq_transfers_network_session_id', 'transfers', type_='unique')
    op.drop_column('transfers', 'network_status')
    op.drop_column('transfers', 'network_session_id')
    op.drop_column('transfers', 'counterparty_name')
    op.drop_column('transfers', 'counterparty_account_number')
    op.drop_column('transfers', 'counterparty_bank_name')
    op.drop_column('transfers', 'counterparty_bank_code')
    op.drop_column('transfers', 'rail')
    op.drop_constraint('uq_accounts_account_number', 'accounts', type_='unique')
    op.drop_column('accounts', 'account_number')
