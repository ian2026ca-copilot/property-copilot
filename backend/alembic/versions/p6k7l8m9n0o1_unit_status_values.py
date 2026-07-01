"""add unit status values: reserved, notice, renovation

Revision ID: p6k7l8m9n0o1
Revises: o5j6k7l8m9n0
Create Date: 2026-06-30
"""
from alembic import op

revision = "p6k7l8m9n0o1"
down_revision = "o5j6k7l8m9n0"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE unitstatus ADD VALUE IF NOT EXISTS 'RESERVED'")
    op.execute("ALTER TYPE unitstatus ADD VALUE IF NOT EXISTS 'NOTICE'")
    op.execute("ALTER TYPE unitstatus ADD VALUE IF NOT EXISTS 'RENOVATION'")


def downgrade():
    pass
