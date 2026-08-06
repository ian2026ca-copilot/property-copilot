"""singleton platform_settings table holding admin-configurable AI provider
API keys (OpenAI, DeepSeek, Gemini, Grok) — previously only Gemini existed,
hardcoded to a GEMINI_API_KEY env var with no in-app way to change it

Revision ID: e1f2a3b4c5d6
Revises: d9e0f1a2b3c4
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e1f2a3b4c5d6"
down_revision = "d9e0f1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("openai_api_key", sa.Text(), nullable=True),
        sa.Column("deepseek_api_key", sa.Text(), nullable=True),
        sa.Column("gemini_api_key", sa.Text(), nullable=True),
        sa.Column("grok_api_key", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("platform_settings")
