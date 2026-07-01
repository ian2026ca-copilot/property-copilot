"""tenant address fields

Revision ID: l2g3h4i5j6k7
Revises: k1f2g3h4i5j6
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "l2g3h4i5j6k7"
down_revision = "k1f2g3h4i5j6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("street_address", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("city", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("province", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("postal_code", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("country", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "country")
    op.drop_column("users", "postal_code")
    op.drop_column("users", "province")
    op.drop_column("users", "city")
    op.drop_column("users", "street_address")
