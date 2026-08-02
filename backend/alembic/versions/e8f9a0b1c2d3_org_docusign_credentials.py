"""org-level DocuSign developer account credentials, so each organization
can connect its own DocuSign sandbox/production account instead of relying
solely on the platform-wide env-configured integration

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
Create Date: 2026-08-02
"""
from alembic import op
import sqlalchemy as sa

revision = "e8f9a0b1c2d3"
down_revision = "d7e8f9a0b1c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("docusign_integration_key", sa.String(255), nullable=True))
    op.add_column("organizations", sa.Column("docusign_account_id", sa.String(255), nullable=True))
    op.add_column("organizations", sa.Column("docusign_user_id", sa.String(255), nullable=True))
    op.add_column("organizations", sa.Column("docusign_private_key", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "docusign_private_key")
    op.drop_column("organizations", "docusign_user_id")
    op.drop_column("organizations", "docusign_account_id")
    op.drop_column("organizations", "docusign_integration_key")
