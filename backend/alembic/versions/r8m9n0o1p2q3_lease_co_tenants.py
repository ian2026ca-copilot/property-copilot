"""add lease_co_tenants table

Revision ID: r8m9n0o1p2q3
Revises: q7l8m9n0o1p2
Create Date: 2026-07-12
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "r8m9n0o1p2q3"
down_revision = "q7l8m9n0o1p2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "lease_co_tenants",
        sa.Column("lease_id", UUID(as_uuid=True), sa.ForeignKey("leases.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade():
    op.drop_table("lease_co_tenants")
