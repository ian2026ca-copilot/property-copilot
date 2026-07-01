"""tenant profile and documents

Revision ID: h8c9d0e1f2g3
Revises: g7b8c9d0e1f2
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
import uuid

revision = "h8c9d0e1f2g3"
down_revision = "g7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add first_name, last_name, date_of_birth to users
    op.add_column("users", sa.Column("first_name", sa.String(150), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(150), nullable=True))
    op.add_column("users", sa.Column("date_of_birth", sa.Date(), nullable=True))

    # Migrate existing full_name: split on first space
    op.execute("""
        UPDATE users
        SET first_name = SPLIT_PART(full_name, ' ', 1),
            last_name  = NULLIF(TRIM(SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1)), '')
    """)

    # Create tenant_documents table
    op.create_table(
        "tenant_documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("doc_type", sa.String(50), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_name", sa.String(500), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("tenant_documents")
    op.drop_column("users", "date_of_birth")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
