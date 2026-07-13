"""add landlord_name to leases

Revision ID: s1t2u3v4w5x6
Revises: r8m9n0o1p2q3
Create Date: 2026-07-12

"""
from alembic import op
import sqlalchemy as sa

revision = "s1t2u3v4w5x6"
down_revision = "r8m9n0o1p2q3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("leases", sa.Column("landlord_name", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("leases", "landlord_name")
