"""payment status change audit fields

Revision ID: c9d0e1f2a3b4
Revises: a1b2c3d4e5f7
Create Date: 2026-07-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "c9d0e1f2a3b4"
down_revision = "a1b2c3d4e5f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("status_updated_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("payments", sa.Column("status_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "status_updated_at")
    op.drop_column("payments", "status_updated_by_user_id")
