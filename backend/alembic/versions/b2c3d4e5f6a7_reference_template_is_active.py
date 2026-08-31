"""reference_template is_active

Revision ID: b2c3d4e5f6a7
Revises: 1bd1b39fe97a
Create Date: 2026-08-28

"""
from alembic import op
import sqlalchemy as sa

revision = "aa1bb2cc3dd4"
down_revision = "1bd1b39fe97a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect
    conn = op.get_bind()
    cols = [c["name"] for c in inspect(conn).get_columns("reference_templates")]
    if "is_active" not in cols:
        op.add_column("reference_templates", sa.Column("is_active", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("reference_templates", "is_active")

