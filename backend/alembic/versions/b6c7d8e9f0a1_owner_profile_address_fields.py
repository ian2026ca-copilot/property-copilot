"""add address fields to owner_profiles

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-07-23

"""
from alembic import op
import sqlalchemy as sa

revision = "b6c7d8e9f0a1"
down_revision = "a5b6c7d8e9f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("owner_profiles", sa.Column("street_address", sa.String(255), nullable=True))
    op.add_column("owner_profiles", sa.Column("city", sa.String(100), nullable=True))
    op.add_column("owner_profiles", sa.Column("province", sa.String(100), nullable=True))
    op.add_column("owner_profiles", sa.Column("postal_code", sa.String(20), nullable=True))
    op.add_column("owner_profiles", sa.Column("country", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("owner_profiles", "country")
    op.drop_column("owner_profiles", "postal_code")
    op.drop_column("owner_profiles", "province")
    op.drop_column("owner_profiles", "city")
    op.drop_column("owner_profiles", "street_address")
