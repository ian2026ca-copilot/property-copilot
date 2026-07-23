import uuid
import enum
from datetime import datetime, date, time

from sqlalchemy import String, ForeignKey, Enum as SAEnum, Text, Float, DateTime, Date, Time, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, new_uuid


class MaintenancePriority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    EMERGENCY = "EMERGENCY"


class MaintenanceStatus(str, enum.Enum):
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    SCHEDULED = "SCHEDULED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


class MaintenanceRequest(Base, TimestampMixin):
    __tablename__ = "maintenance_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    unit_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"), index=True)
    submitted_by_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    priority: Mapped[MaintenancePriority] = mapped_column(SAEnum(MaintenancePriority), nullable=False, default=MaintenancePriority.MEDIUM)
    status: Mapped[MaintenanceStatus] = mapped_column(SAEnum(MaintenanceStatus), nullable=False, default=MaintenanceStatus.SUBMITTED)
    assignee_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Tenant preferred time window
    preferred_time_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    preferred_time_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Manager estimate
    est_hours_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    est_hours_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    est_cost_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    est_cost_max: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Scheduling
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    scheduled_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scheduled_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    unit: Mapped["Unit"] = relationship(back_populates="maintenance_requests")  # noqa: F821
    submitted_by: Mapped["User"] = relationship(foreign_keys=[submitted_by_user_id])  # noqa: F821
    vendor: Mapped["User | None"] = relationship(foreign_keys=[vendor_id])  # noqa: F821
    attachments: Mapped[list["MaintenanceAttachment"]] = relationship(back_populates="request", cascade="all, delete-orphan")


class MaintenanceAttachment(Base):
    __tablename__ = "maintenance_attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("maintenance_requests.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    request: Mapped["MaintenanceRequest"] = relationship(back_populates="attachments")


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    business_name: Mapped[str] = mapped_column(String(255), nullable=False)
    service_categories: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # Private (default): only the organization that added this vendor can use them.
    # Public: other organizations may also add/link this same vendor by email.
    is_public: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship()  # noqa: F821
    availability: Mapped[list["VendorAvailability"]] = relationship(back_populates="vendor", cascade="all, delete-orphan")
    org_links: Mapped[list["VendorOrganization"]] = relationship(back_populates="vendor", cascade="all, delete-orphan")


class VendorOrganization(Base):
    __tablename__ = "vendor_organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="CASCADE"), index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True)

    vendor: Mapped["Vendor"] = relationship(back_populates="org_links")


class VendorAvailability(Base):
    __tablename__ = "vendor_availability"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    vendor: Mapped["Vendor"] = relationship(back_populates="availability")
