"""passkeys, and how each mandate was signed

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-27 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "passkeys",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("users.id", name="fk_passkeys_user"), nullable=False),
        sa.Column("credential_id", sa.String(400), nullable=False),
        sa.Column("public_key", sa.Text(), nullable=False),
        sa.Column("sign_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("transports", sa.JSON(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("credential_id", name="uq_passkeys_credential_id"),
    )
    op.create_index("ix_passkeys_user_id", "passkeys", ["user_id"])
    # Mandates signed before M6 used a placeholder; they're recorded as test signatures.
    op.add_column("mandates", sa.Column("signature_kind", sa.String(12), nullable=False, server_default="test"))
    op.add_column("mandates", sa.Column("passkey_id", sa.BigInteger(), sa.ForeignKey("passkeys.id", name="fk_mandates_passkey"), nullable=True))
    op.create_check_constraint("ck_mandates_signature_kind", "mandates", "signature_kind in ('passkey', 'test')")


def downgrade() -> None:
    op.drop_constraint("ck_mandates_signature_kind", "mandates")
    op.drop_column("mandates", "passkey_id")
    op.drop_column("mandates", "signature_kind")
    op.drop_table("passkeys")
