"""merchant directory

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-27 13:20:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "merchants",
        sa.Column("id", sa.String(60), primary_key=True),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("legal_name", sa.String(160), nullable=False),
        sa.Column("tier", sa.String(12), nullable=False),
        sa.Column("category", sa.String(80), nullable=False),
        sa.Column("city", sa.String(80), nullable=False),
        sa.Column("catalog_kind", sa.String(12), nullable=False),
        sa.Column("public_key", sa.String(64), nullable=False),
        sa.Column("key_id", sa.String(100), nullable=False),
        sa.Column("owner_username", sa.String(100), nullable=True),
        sa.Column("adversarial", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("tier in ('verified', 'known', 'new', 'suspended')", name="ck_merchants_tier"),
    )
    op.create_index("ix_merchants_owner_username", "merchants", ["owner_username"])
    op.create_table(
        "merchant_accounts",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("merchant_id", sa.String(60), sa.ForeignKey("merchants.id", name="fk_merchant_accounts_merchant"), nullable=False),
        sa.Column("bank_code", sa.String(10), nullable=False),
        sa.Column("bank_name", sa.String(80), nullable=False),
        sa.Column("account_number", sa.String(10), nullable=False),
        sa.Column("name_on_account", sa.String(160), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_merchant_accounts_merchant_id", "merchant_accounts", ["merchant_id"])
    op.create_index("uq_merchant_accounts_bank_number", "merchant_accounts", ["bank_code", "account_number"], unique=True)


def downgrade() -> None:
    op.drop_table("merchant_accounts")
    op.drop_table("merchants")
