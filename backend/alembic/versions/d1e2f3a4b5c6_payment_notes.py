"""payment notes table (replaces freeform payments.notes column)

Revision ID: d1e2f3a4b5c6
Revises: c9d0e1f2a3b4
Create Date: 2026-07-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "d1e2f3a4b5c6"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_notes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("payment_id", UUID(as_uuid=True), sa.ForeignKey("payments.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("author_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("note", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.drop_column("payments", "notes")


def downgrade() -> None:
    op.add_column("payments", sa.Column("notes", sa.Text, nullable=True))
    op.drop_table("payment_notes")
