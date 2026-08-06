"""org-level reply-to address for employer/landlord reference check emails,
so replies land somewhere a real person reads instead of the shared
platform SMTP inbox — defaults to the acting user's own profile email
when left unset

Revision ID: a1b2c3d4e5f6
Revises: f9a0b1c2d3e4
Create Date: 2026-08-03
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "f9a0b1c2d3e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("reference_reply_email", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "reference_reply_email")
