"""add price field to maintenance_requests

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-07-25

"""
from alembic import op
import sqlalchemy as sa

revision = "d8e9f0a1b2c3"
down_revision = "c7d8e9f0a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("maintenance_requests", sa.Column("price", sa.Float, nullable=True))


def downgrade() -> None:
    op.drop_column("maintenance_requests", "price")
