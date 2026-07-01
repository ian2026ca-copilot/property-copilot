"""add cover_image_id to properties

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-12 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = "g7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "properties",
        sa.Column(
            "cover_image_id",
            UUID(as_uuid=True),
            sa.ForeignKey("property_images.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("properties", "cover_image_id")
