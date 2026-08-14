"""auth security: token_version on users

Revision ID: d503b1f9cadb
Revises: a1b2c3d4e5f6, d2e3f4a5b6c7
Create Date: 2026-08-14
"""
from alembic import op
import sqlalchemy as sa

revision = "d503b1f9cadb"
down_revision = ("a1b2c3d4e5f6", "d2e3f4a5b6c7")
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))


def downgrade():
    op.drop_column("users", "token_version")
