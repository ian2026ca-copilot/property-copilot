"""unit listing detail fields: contact methods/phones/emails, security deposit,
utilities, furnishing, lease term, availability date, smoking/pet policies, pet fee

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-07-30
"""
from alembic import op
import sqlalchemy as sa

revision = "a4b5c6d7e8f9"
down_revision = "f3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("units", sa.Column("contact_methods", sa.JSON, nullable=False, server_default="[]"))
    op.add_column("units", sa.Column("contact_phones", sa.JSON, nullable=False, server_default="[]"))
    op.add_column("units", sa.Column("contact_emails", sa.JSON, nullable=False, server_default="[]"))
    op.add_column("units", sa.Column("security_deposit", sa.String(50), nullable=True))
    op.add_column("units", sa.Column("utilities_included", sa.JSON, nullable=False, server_default="[]"))
    op.add_column("units", sa.Column("furnishing", sa.String(50), nullable=True))
    op.add_column("units", sa.Column("lease_term", sa.String(50), nullable=True))
    op.add_column("units", sa.Column("availability_date", sa.Date(), nullable=True))
    op.add_column("units", sa.Column("smoking_policy", sa.String(50), nullable=True))
    op.add_column("units", sa.Column("dogs_policy", sa.String(50), nullable=True))
    op.add_column("units", sa.Column("cats_policy", sa.String(50), nullable=True))
    op.add_column("units", sa.Column("pet_fee", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("units", "pet_fee")
    op.drop_column("units", "cats_policy")
    op.drop_column("units", "dogs_policy")
    op.drop_column("units", "smoking_policy")
    op.drop_column("units", "availability_date")
    op.drop_column("units", "lease_term")
    op.drop_column("units", "furnishing")
    op.drop_column("units", "utilities_included")
    op.drop_column("units", "security_deposit")
    op.drop_column("units", "contact_emails")
    op.drop_column("units", "contact_phones")
    op.drop_column("units", "contact_methods")
