"""reference name fields

Revision ID: 3201b1a6af86
Revises: d503b1f9cadb
Create Date: 2026-08-14

"""
from alembic import op
import sqlalchemy as sa

revision = "3201b1a6af86"
down_revision = "d503b1f9cadb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenant_address_history", sa.Column("landlord_first_name", sa.String(100), nullable=True))
    op.add_column("tenant_address_history", sa.Column("landlord_middle_name", sa.String(100), nullable=True))
    op.add_column("tenant_address_history", sa.Column("landlord_last_name", sa.String(100), nullable=True))
    op.add_column("tenant_employment", sa.Column("employer_reference_first_name", sa.String(100), nullable=True))
    op.add_column("tenant_employment", sa.Column("employer_reference_middle_name", sa.String(100), nullable=True))
    op.add_column("tenant_employment", sa.Column("employer_reference_last_name", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("tenant_address_history", "landlord_first_name")
    op.drop_column("tenant_address_history", "landlord_middle_name")
    op.drop_column("tenant_address_history", "landlord_last_name")
    op.drop_column("tenant_employment", "employer_reference_first_name")
    op.drop_column("tenant_employment", "employer_reference_middle_name")
    op.drop_column("tenant_employment", "employer_reference_last_name")
