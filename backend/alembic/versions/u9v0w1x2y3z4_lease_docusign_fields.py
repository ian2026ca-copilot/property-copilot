"""add docusign fields to leases

Revision ID: u9v0w1x2y3z4
Revises: s1t2u3v4w5x6
Create Date: 2026-07-15

"""
from alembic import op
import sqlalchemy as sa

revision = "u9v0w1x2y3z4"
down_revision = "s1t2u3v4w5x6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("leases", sa.Column("landlord_email", sa.String(255), nullable=True))
    op.add_column("leases", sa.Column("docusign_envelope_id", sa.String(100), nullable=True))
    op.add_column("leases", sa.Column("signature_status", sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column("leases", "signature_status")
    op.drop_column("leases", "docusign_envelope_id")
    op.drop_column("leases", "landlord_email")
