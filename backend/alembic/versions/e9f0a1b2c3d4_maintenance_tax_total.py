"""add tax and total fields to maintenance_requests

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
Create Date: 2026-07-25

"""
from alembic import op
import sqlalchemy as sa

revision = "e9f0a1b2c3d4"
down_revision = "d8e9f0a1b2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("maintenance_requests", sa.Column("tax", sa.Float, nullable=True))
    op.add_column("maintenance_requests", sa.Column("total", sa.Float, nullable=True))


def downgrade() -> None:
    op.drop_column("maintenance_requests", "total")
    op.drop_column("maintenance_requests", "tax")
