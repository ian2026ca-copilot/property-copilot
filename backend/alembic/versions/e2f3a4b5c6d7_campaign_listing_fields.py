"""campaign listing detail fields

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-07-30
"""
from alembic import op
import sqlalchemy as sa

revision = "e2f3a4b5c6d7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("campaigns", sa.Column("security_deposit", sa.Float(), nullable=True))
    op.add_column("campaigns", sa.Column("lease_term", sa.String(50), nullable=True))
    op.add_column("campaigns", sa.Column("furnishing", sa.String(50), nullable=True))
    op.add_column("campaigns", sa.Column("smoking_policy", sa.String(50), nullable=True))
    op.add_column("campaigns", sa.Column("pets_policy", sa.String(100), nullable=True))
    op.add_column("campaigns", sa.Column("utilities_included", sa.JSON, nullable=False, server_default="[]"))
    op.add_column("campaigns", sa.Column("parking_available", sa.Boolean(), nullable=True))
    op.add_column("campaigns", sa.Column("parking_details", sa.JSON, nullable=True))
    op.add_column("campaigns", sa.Column("home_features", sa.JSON, nullable=False, server_default="[]"))
    op.add_column("campaigns", sa.Column("neighborhood_features", sa.JSON, nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("campaigns", "neighborhood_features")
    op.drop_column("campaigns", "home_features")
    op.drop_column("campaigns", "parking_details")
    op.drop_column("campaigns", "parking_available")
    op.drop_column("campaigns", "utilities_included")
    op.drop_column("campaigns", "pets_policy")
    op.drop_column("campaigns", "smoking_policy")
    op.drop_column("campaigns", "furnishing")
    op.drop_column("campaigns", "lease_term")
    op.drop_column("campaigns", "security_deposit")
