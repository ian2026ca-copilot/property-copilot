"""tenant avatar filename on users

Revision ID: i9d0e1f2g3h4
Revises: h8c9d0e1f2g3
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa

revision = "i9d0e1f2g3h4"
down_revision = "h8c9d0e1f2g3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_filename", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_filename")
