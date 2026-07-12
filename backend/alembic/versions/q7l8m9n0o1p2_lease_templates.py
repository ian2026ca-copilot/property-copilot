"""add lease_templates table

Revision ID: q7l8m9n0o1p2
Revises: p6k7l8m9n0o1
Create Date: 2026-07-11
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "q7l8m9n0o1p2"
down_revision = "p6k7l8m9n0o1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "lease_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("original_name", sa.String(512), nullable=False),
        sa.Column("file_path", sa.String(512), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("lease_templates")
