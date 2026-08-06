"""platform admin role + owner subscription billing: adds a global
is_platform_admin flag on users (separate from any org membership), and
Stripe subscription tracking plus a manual suspend/comp lever on
organizations

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa

revision = "c8d9e0f1a2b3"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_platform_admin", sa.Boolean(), nullable=False, server_default="false"))

    op.add_column("organizations", sa.Column("stripe_customer_id", sa.String(255), nullable=True))
    op.add_column("organizations", sa.Column("stripe_subscription_id", sa.String(255), nullable=True))
    op.add_column("organizations", sa.Column("subscription_status", sa.String(30), nullable=True))
    op.add_column("organizations", sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("organizations", sa.Column("billing_exempt", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("organizations", sa.Column("is_suspended", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("organizations", "is_suspended")
    op.drop_column("organizations", "billing_exempt")
    op.drop_column("organizations", "trial_ends_at")
    op.drop_column("organizations", "subscription_status")
    op.drop_column("organizations", "stripe_subscription_id")
    op.drop_column("organizations", "stripe_customer_id")

    op.drop_column("users", "is_platform_admin")
