"""add phone to users

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-12 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(30), nullable=True))
    op.execute("UPDATE users SET phone = '' WHERE phone IS NULL")
    op.alter_column("users", "phone", nullable=False)


def downgrade() -> None:
    op.drop_column("users", "phone")
