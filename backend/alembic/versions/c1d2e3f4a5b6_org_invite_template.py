"""adds invite_message_template to organizations — lets an owner define a
custom tenant-invite message the draft endpoint uses instead of asking AI
to write one fresh each time

Revision ID: c1d2e3f4a5b6
Revises: a3b4c5d6e7f8
Create Date: 2026-08-10
"""
from alembic import op
import sqlalchemy as sa

revision = "c1d2e3f4a5b6"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("invite_message_template", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "invite_message_template")
