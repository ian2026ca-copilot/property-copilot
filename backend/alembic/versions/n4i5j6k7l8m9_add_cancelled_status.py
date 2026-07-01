"""add cancelled maintenance status

Revision ID: n4i5j6k7l8m9
Revises: m3h4i5j6k7l8
Create Date: 2026-06-18

"""
from alembic import op

revision = "n4i5j6k7l8m9"
down_revision = "m3h4i5j6k7l8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE maintenancestatus ADD VALUE IF NOT EXISTS 'CANCELLED'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing enum values; downgrade is a no-op
    pass
