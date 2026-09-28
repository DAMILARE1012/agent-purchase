"""payments approved with a one-time email code (the fallback when no passkey is at hand)

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-28 14:00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_purchases_approval_kind", "purchases", type_="check")
    op.create_check_constraint("ck_purchases_approval_kind", "purchases", "approval_kind in ('passkey', 'email_code', 'test')")


def downgrade() -> None:
    op.drop_constraint("ck_purchases_approval_kind", "purchases", type_="check")
    op.create_check_constraint("ck_purchases_approval_kind", "purchases", "approval_kind in ('passkey', 'test')")
