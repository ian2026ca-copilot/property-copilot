import uuid
from datetime import date

from sqlalchemy import String, ForeignKey, Date, Float, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, new_uuid


class TenantProfile(Base, TimestampMixin):
    """Tenant-specific fields, split out of the shared users table."""
    __tablename__ = "tenant_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    street_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    province: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Rental application fields
    middle_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    drivers_licence: Mapped[str | None] = mapped_column(String(50), nullable=True)
    personal_income_annual: Mapped[float | None] = mapped_column(Float, nullable=True)
    household_income_annual: Mapped[float | None] = mapped_column(Float, nullable=True)
    personal_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    smoke_vape: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    given_notice_to_landlord: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    refused_rent: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    evicted: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    criminal_record: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    screening_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Screening / application tracking
    application_status: Mapped[str] = mapped_column(String(30), nullable=False, default="NOT_STARTED", server_default="NOT_STARTED")
    interested_unit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="SET NULL"), nullable=True
    )

    user: Mapped["User"] = relationship(back_populates="tenant_profile")  # noqa: F821


class OwnerProfile(Base, TimestampMixin):
    """Owner-specific fields, split out of the shared users table."""
    __tablename__ = "owner_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    street_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    province: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)

    user: Mapped["User"] = relationship(back_populates="owner_profile")  # noqa: F821
