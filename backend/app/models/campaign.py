import uuid
import enum
from datetime import datetime, date

from sqlalchemy import String, Text, Float, Date, DateTime, Boolean, Enum as SAEnum, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, new_uuid


class CampaignStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class Campaign(Base, TimestampMixin):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    unit_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("units.id", ondelete="SET NULL"), nullable=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    available_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    monthly_rent: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[CampaignStatus] = mapped_column(SAEnum(CampaignStatus), nullable=False, default=CampaignStatus.DRAFT)
    photos: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    fb_post_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fb_posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    security_deposit: Mapped[float | None] = mapped_column(Float, nullable=True)
    lease_term: Mapped[str | None] = mapped_column(String(50), nullable=True)
    furnishing: Mapped[str | None] = mapped_column(String(50), nullable=True)
    smoking_policy: Mapped[str | None] = mapped_column(String(50), nullable=True)
    pets_policy: Mapped[str | None] = mapped_column(String(100), nullable=True)
    utilities_included: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    parking_available: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    parking_details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    home_features: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    neighborhood_features: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    unit: Mapped["Unit | None"] = relationship()  # noqa: F821
