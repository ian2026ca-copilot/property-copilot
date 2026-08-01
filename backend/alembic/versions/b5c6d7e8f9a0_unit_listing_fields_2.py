"""unit listing detail fields part 2: parking available, property heading,
hidden notes, description, home/neighborhood features

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
Create Date: 2026-07-30
"""
from alembic import op
import sqlalchemy as sa

revision = "b5c6d7e8f9a0"
down_revision = "a4b5c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("units", sa.Column("parking_available", sa.Boolean(), nullable=True))
    op.add_column("units", sa.Column("property_heading", sa.String(80), nullable=True))
    op.add_column("units", sa.Column("hidden_notes", sa.Text(), nullable=True))
    op.add_column("units", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("units", sa.Column("home_features", sa.JSON, nullable=False, server_default="[]"))
    op.add_column("units", sa.Column("neighborhood_features", sa.JSON, nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("units", "neighborhood_features")
    op.drop_column("units", "home_features")
    op.drop_column("units", "description")
    op.drop_column("units", "hidden_notes")
    op.drop_column("units", "property_heading")
    op.drop_column("units", "parking_available")
