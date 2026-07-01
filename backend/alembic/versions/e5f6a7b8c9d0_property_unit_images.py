"""add property_images and unit_images tables

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-12 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "property_images",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("property_id", UUID(as_uuid=True), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_name", sa.String(500), nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_table(
        "unit_images",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("unit_id", UUID(as_uuid=True), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_name", sa.String(500), nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("unit_images")
    op.drop_table("property_images")
