"""add address fields to vendors

Revision ID: a5b6c7d8e9f0
Revises: z4a5b6c7d8e9
Create Date: 2026-07-23

"""
from alembic import op
import sqlalchemy as sa

revision = "a5b6c7d8e9f0"
down_revision = "z4a5b6c7d8e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vendors", sa.Column("street_address", sa.String(255), nullable=True))
    op.add_column("vendors", sa.Column("city", sa.String(100), nullable=True))
    op.add_column("vendors", sa.Column("province", sa.String(100), nullable=True))
    op.add_column("vendors", sa.Column("postal_code", sa.String(20), nullable=True))
    op.add_column("vendors", sa.Column("country", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("vendors", "country")
    op.drop_column("vendors", "postal_code")
    op.drop_column("vendors", "province")
    op.drop_column("vendors", "city")
    op.drop_column("vendors", "street_address")
