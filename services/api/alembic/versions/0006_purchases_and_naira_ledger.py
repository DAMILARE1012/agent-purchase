"""purchases, cart IDs on runs, the ledger in naira, and database-level mandate limits

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-28 09:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "purchases",
        sa.Column("id", sa.String(40), primary_key=True),
        # One payment per cart: a run holds exactly one cart, and each is unique here.
        sa.Column("run_id", sa.String(40), sa.ForeignKey("agent_runs.id", name="fk_purchases_run"), nullable=False),
        sa.Column("cart_id", sa.String(80), nullable=False),
        sa.Column("mandate_id", sa.String(40), sa.ForeignKey("mandates.id", name="fk_purchases_mandate"), nullable=False),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("users.id", name="fk_purchases_user"), nullable=False),
        sa.Column("merchant_id", sa.String(60), sa.ForeignKey("merchants.id", name="fk_purchases_merchant"), nullable=False),
        sa.Column("transfer_tx", sa.String(40), sa.ForeignKey("transfers.tx", name="fk_purchases_transfer"), nullable=False),
        sa.Column("total_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("summary", sa.String(300), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("payee_bank_code", sa.String(10), nullable=False),
        sa.Column("payee_account_number", sa.String(10), nullable=False),
        sa.Column("payee_name", sa.String(160), nullable=False),
        sa.Column("mandate_hash", sa.String(64), nullable=False),
        sa.Column("cart_hash", sa.String(64), nullable=False),
        sa.Column("gate_version", sa.String(40), nullable=False),
        sa.Column("agent_version", sa.String(60), nullable=False),
        sa.Column("decision", sa.JSON(), nullable=False),
        sa.Column("approval_kind", sa.String(12), nullable=False),
        sa.Column("approval", sa.Text(), nullable=False),
        sa.Column("passkey_id", sa.BigInteger(), sa.ForeignKey("passkeys.id", name="fk_purchases_passkey"), nullable=True),
        sa.Column("receipt_token", sa.Text(), nullable=False),
        sa.Column("receipt_kid", sa.String(40), sa.ForeignKey("signing_keys.kid", name="fk_purchases_receipt_key"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("run_id", name="uq_purchases_run"),
        sa.UniqueConstraint("cart_id", name="uq_purchases_cart"),
        sa.UniqueConstraint("transfer_tx", name="uq_purchases_transfer"),
        sa.CheckConstraint("status in ('paying', 'paid', 'failed', 'reversed', 'refunded')", name="ck_purchases_status"),
        sa.CheckConstraint("approval_kind in ('passkey', 'test')", name="ck_purchases_approval_kind"),
        sa.CheckConstraint("total_minor > 0", name="ck_purchases_total"),
    )
    op.create_index("ix_purchases_user_id", "purchases", ["user_id"])
    op.create_index("ix_purchases_mandate_id", "purchases", ["mandate_id"])
    op.create_index("ix_purchases_merchant_id", "purchases", ["merchant_id"])

    # Carts are found by ID when the shopper approves or declines; keep it in a column, not only in the JSON.
    op.add_column("agent_runs", sa.Column("cart_id", sa.String(80), nullable=True))
    op.execute("UPDATE agent_runs SET cart_id = (signed_cart::jsonb -> 'cart' ->> 'cartId') WHERE signed_cart IS NOT NULL")
    op.create_index("ix_agent_runs_cart_id", "agent_runs", ["cart_id"])
    # Paying is now what keeps a mandate within its uses (the gate under a row lock, a conditional
    # update, unique purchases). One AI run shopping at a time per mandate stays, to limit model
    # spend; carts waiting for approval may pile up (a mandate allowing several purchases).
    op.execute("DROP INDEX uq_agent_runs_one_active_per_mandate")
    op.execute(
        "CREATE UNIQUE INDEX uq_agent_runs_one_shopping_per_mandate ON agent_runs (mandate_id) WHERE status IN ('queued', 'running')"
    )

    # The last line of defence: the database itself refuses a mandate used past its signed limits,
    # whatever the application code does.
    op.create_check_constraint("ck_mandates_uses_within_limit", "mandates", "uses <= (limits ->> 'maxUses')::int")
    op.create_check_constraint(
        "ck_mandates_spend_within_limit", "mandates", "spent_minor <= (limits ->> 'maxTotalMinor')::bigint * (limits ->> 'maxUses')::int"
    )

    # Shopping is in naira, so the ledger is too. Sandbox balances are topped up in naira at start-up (app/services/seed.py).
    op.execute("UPDATE accounts SET currency = 'NGN'")
    op.execute("UPDATE transfers SET currency = 'NGN'")
    op.alter_column("accounts", "currency", server_default="NGN")


def downgrade() -> None:
    op.drop_constraint("ck_mandates_spend_within_limit", "mandates", type_="check")
    op.drop_constraint("ck_mandates_uses_within_limit", "mandates", type_="check")
    op.execute("DROP INDEX uq_agent_runs_one_shopping_per_mandate")
    op.execute(
        "CREATE UNIQUE INDEX uq_agent_runs_one_active_per_mandate ON agent_runs (mandate_id) "
        "WHERE status IN ('queued', 'running', 'awaiting_approval')"
    )
    op.drop_index("ix_agent_runs_cart_id", table_name="agent_runs")
    op.drop_column("agent_runs", "cart_id")
    op.drop_table("purchases")
    op.execute("UPDATE accounts SET currency = 'USD'")
    op.execute("UPDATE transfers SET currency = 'USD'")
