import uuid

from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, new_uuid


class PlatformSettings(Base, TimestampMixin):
    """Singleton row (there is only ever one) holding platform-wide config
    editable from the admin panel, starting with AI provider API keys."""

    __tablename__ = "platform_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    openai_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    deepseek_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    gemini_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    grok_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    active_ai_provider: Mapped[str] = mapped_column(String(20), nullable=False, default="gemini", server_default="gemini")
