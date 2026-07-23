"""add is_public visibility flag to vendors

Revision ID: y3z4a5b6c7d8
Revises: x2y3z4a5b6c7
Create Date: 2026-07-22

"""
from alembic import op
import sqlalchemy as sa

revision = "y3z4a5b6c7d8"
down_revision = "x2y3z4a5b6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vendors", sa.Column("is_public", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("vendors", "is_public")
