"""add maintenance_notes table, drop resolution_notes

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
Create Date: 2026-07-23

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "c7d8e9f0a1b2"
down_revision = "b6c7d8e9f0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "maintenance_notes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("request_id", UUID(as_uuid=True), sa.ForeignKey("maintenance_requests.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("author_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("note", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.drop_column("maintenance_requests", "resolution_notes")


def downgrade() -> None:
    op.add_column("maintenance_requests", sa.Column("resolution_notes", sa.Text, nullable=True))
    op.drop_table("maintenance_notes")
