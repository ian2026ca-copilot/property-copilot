"""adds per-provider base_url/model overrides to platform_settings — lets
admins point a provider at a compatible alternate endpoint or pick a
different model without a code change

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-08-07
"""
from alembic import op
import sqlalchemy as sa

revision = "a3b4c5d6e7f8"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None

PROVIDERS = ["openai", "deepseek", "gemini", "grok"]


def upgrade() -> None:
    for provider in PROVIDERS:
        op.add_column("platform_settings", sa.Column(f"{provider}_base_url", sa.String(length=255), nullable=True))
        op.add_column("platform_settings", sa.Column(f"{provider}_model", sa.String(length=100), nullable=True))


def downgrade() -> None:
    for provider in PROVIDERS:
        op.drop_column("platform_settings", f"{provider}_model")
        op.drop_column("platform_settings", f"{provider}_base_url")
