"""mandates, agent releases, runs, run steps and the inference log

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-27 14:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _created() -> sa.Column:
    return sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def upgrade() -> None:
    op.create_table(
        "mandates",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("users.id", name="fk_mandates_user"), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("mode", sa.String(12), nullable=False),
        sa.Column("request", sa.Text(), nullable=False),
        sa.Column("limits", sa.JSON(), nullable=False),
        sa.Column("mandate_hash", sa.String(64), nullable=False),
        sa.Column("assertion", sa.Text(), nullable=False),
        sa.Column("compiled_by", sa.String(120), nullable=True),
        sa.Column("uses", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("spent_minor", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        _created(),
        sa.CheckConstraint("status in ('active', 'used_up', 'expired', 'revoked')", name="ck_mandates_status"),
        sa.CheckConstraint("mode in ('present', 'not_present')", name="ck_mandates_mode"),
        sa.CheckConstraint("uses >= 0 and spent_minor >= 0", name="ck_mandates_counts"),
    )
    op.create_index("ix_mandates_user_id", "mandates", ["user_id"])

    op.create_table(
        "agent_releases",
        sa.Column("id", sa.String(60), primary_key=True),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("model", sa.String(80), nullable=False),
        sa.Column("fallback_model", sa.String(80), nullable=False),
        sa.Column("prompts", sa.JSON(), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("changelog", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "agent_runs",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("mandate_id", sa.String(40), sa.ForeignKey("mandates.id", name="fk_agent_runs_mandate"), nullable=False),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("users.id", name="fk_agent_runs_user"), nullable=False),
        sa.Column("release_id", sa.String(60), sa.ForeignKey("agent_releases.id", name="fk_agent_runs_release"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("priority", sa.String(12), nullable=False),
        sa.Column("began_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("signed_cart", sa.JSON(), nullable=True),
        sa.Column("cart_view", sa.JSON(), nullable=True),
        sa.Column("decision", sa.JSON(), nullable=True),
        sa.Column("outcome_note", sa.Text(), nullable=True),
        sa.Column("purchase_id", sa.String(40), nullable=True),
        sa.Column("tokens", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("cost_micro_usd", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        _created(),
    )
    op.create_index("ix_agent_runs_mandate_id", "agent_runs", ["mandate_id"])
    op.create_index("ix_agent_runs_user_id", "agent_runs", ["user_id"])
    op.create_index("ix_agent_runs_status", "agent_runs", ["status"])
    # Single-use mandates: at most one run in flight (design §5, "Many users at once").
    op.execute(
        "CREATE UNIQUE INDEX uq_agent_runs_one_active_per_mandate ON agent_runs (mandate_id) "
        "WHERE status IN ('queued', 'running', 'awaiting_approval')"
    )

    op.create_table(
        "run_steps",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("run_id", sa.String(40), sa.ForeignKey("agent_runs.id", name="fk_run_steps_run"), nullable=False),
        sa.Column("seq", sa.BigInteger(), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("seller_id", sa.String(60), nullable=True),
        sa.Column("untrusted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("injection_score", sa.Float(), nullable=True),
        sa.Column("model", sa.String(80), nullable=True),
        sa.Column("tokens_in", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("tokens_out", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("cost_micro_usd", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_run_steps_run_id", "run_steps", ["run_id"])

    op.create_table(
        "inference_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("run_id", sa.String(40), nullable=True),
        sa.Column("user_id", sa.String(64), nullable=True),
        sa.Column("task", sa.String(40), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("model", sa.String(80), nullable=False),
        sa.Column("prompt_version", sa.String(20), nullable=False),
        sa.Column("input_hash", sa.String(64), nullable=False),
        sa.Column("output", sa.JSON(), nullable=True),
        sa.Column("tokens_in", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("tokens_out", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("queue_ms", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("cost_micro_usd", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("outcome", sa.String(20), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        _created(),
    )
    op.create_index("ix_inference_log_run_id", "inference_log", ["run_id"])
    op.create_index("ix_inference_log_created_at", "inference_log", ["created_at"])


def downgrade() -> None:
    for table in ("inference_log", "run_steps", "agent_runs", "agent_releases", "mandates"):
        op.drop_table(table)
