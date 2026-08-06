"""tracks whether a subscription is scheduled to cancel at the end of its
current period/trial (set via the Stripe Billing Portal) — Stripe's own
`status` field stays "trialing"/"active" right up until the period actually
ends, so without this the Billing tab looks like nothing happened when an
owner cancels

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa

revision = "d9e0f1a2b3c4"
down_revision = "c8d9e0f1a2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("organizations", "cancel_at_period_end")
