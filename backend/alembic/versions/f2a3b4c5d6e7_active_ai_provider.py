"""adds active_ai_provider to platform_settings — which of the four
configured AI providers (openai/deepseek/gemini/grok) every AI call site in
the app should actually use, selectable from the admin AI settings page

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa

revision = "f2a3b4c5d6e7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "platform_settings",
        sa.Column("active_ai_provider", sa.String(length=20), nullable=False, server_default="gemini"),
    )


def downgrade() -> None:
    op.drop_column("platform_settings", "active_ai_provider")
