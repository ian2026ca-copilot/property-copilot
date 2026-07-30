"""add property type values: house, townhouse, condo unit, duplex, triplex, fourplex, basement

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-07-30
"""
from alembic import op

revision = "f3a4b5c6d7e8"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE propertytype ADD VALUE IF NOT EXISTS 'HOUSE'")
    op.execute("ALTER TYPE propertytype ADD VALUE IF NOT EXISTS 'TOWNHOUSE'")
    op.execute("ALTER TYPE propertytype ADD VALUE IF NOT EXISTS 'CONDO_UNIT'")
    op.execute("ALTER TYPE propertytype ADD VALUE IF NOT EXISTS 'DUPLEX'")
    op.execute("ALTER TYPE propertytype ADD VALUE IF NOT EXISTS 'TRIPLEX'")
    op.execute("ALTER TYPE propertytype ADD VALUE IF NOT EXISTS 'FOURPLEX'")
    op.execute("ALTER TYPE propertytype ADD VALUE IF NOT EXISTS 'BASEMENT'")


def downgrade() -> None:
    pass
