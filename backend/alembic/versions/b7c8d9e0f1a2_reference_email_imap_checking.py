"""automatic reference-reply checking: org-level IMAP config for the
reference_reply_email inbox, plus a tracking table correlating each
outbound reference-check email to its (eventual) reply via Message-ID,
so replies can be matched, AI-analyzed, and logged as a screening note
without a human re-keying anything

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-08-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "b7c8d9e0f1a2"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("reference_email_imap_host", sa.String(255), nullable=True))
    op.add_column("organizations", sa.Column("reference_email_imap_port", sa.Integer(), nullable=True, server_default="993"))
    op.add_column("organizations", sa.Column("reference_email_app_password", sa.Text(), nullable=True))
    op.add_column(
        "organizations",
        sa.Column("reference_email_check_enabled", sa.Boolean(), nullable=False, server_default="false"),
    )

    op.create_table(
        "reference_check_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "tenant_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("reference_type", sa.String(20), nullable=False),
        sa.Column("contact_name", sa.String(255), nullable=True),
        sa.Column("contact_email", sa.String(255), nullable=False),
        sa.Column("sent_message_id", sa.String(255), nullable=False, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="SENT"),
        sa.Column("ai_structured", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("analyzed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("reference_check_requests")
    op.drop_column("organizations", "reference_email_check_enabled")
    op.drop_column("organizations", "reference_email_app_password")
    op.drop_column("organizations", "reference_email_imap_port")
    op.drop_column("organizations", "reference_email_imap_host")
