import uuid

from sqlalchemy import String, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, new_uuid


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(Text)
    fb_page_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    fb_page_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    screening_criminal_record_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    screening_rental_history_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    docusign_integration_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    docusign_account_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    docusign_user_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    docusign_private_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    docusign_use_own_account: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    members: Mapped[list["OrganizationMember"]] = relationship(back_populates="organization")
    properties: Mapped[list["Property"]] = relationship(back_populates="organization")  # noqa: F821
