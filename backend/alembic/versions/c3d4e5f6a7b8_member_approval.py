"""add approval fields to organization_members

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-12 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("organization_members", sa.Column("is_approved", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("organization_members", sa.Column("approval_token", sa.String(128), nullable=True, unique=True))
    op.create_index("ix_organization_members_approval_token", "organization_members", ["approval_token"])


def downgrade() -> None:
    op.drop_index("ix_organization_members_approval_token", "organization_members")
    op.drop_column("organization_members", "approval_token")
    op.drop_column("organization_members", "is_approved")
