import uuid
import enum
from datetime import date

from sqlalchemy import String, Date, Numeric, ForeignKey, Enum as SAEnum, Text, Table, Column
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, new_uuid

lease_co_tenants = Table(
    "lease_co_tenants",
    Base.metadata,
    Column("lease_id", UUID(as_uuid=True), ForeignKey("leases.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


class LeaseStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    TERMINATED = "TERMINATED"
    PENDING = "PENDING"


class LeaseType(str, enum.Enum):
    FIXED = "FIXED"
    MONTH_TO_MONTH = "MONTH_TO_MONTH"


class Lease(Base, TimestampMixin):
    __tablename__ = "leases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"), index=True
    )
    tenant_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    monthly_rent: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    security_deposit: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[LeaseStatus] = mapped_column(SAEnum(LeaseStatus), nullable=False, default=LeaseStatus.ACTIVE)
    lease_type: Mapped[LeaseType] = mapped_column(SAEnum(LeaseType, name="leasetype"), nullable=False, default=LeaseType.FIXED)
    document_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    landlord_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    landlord_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    docusign_envelope_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    signature_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    unit: Mapped["Unit"] = relationship(back_populates="leases")  # noqa: F821
    payments: Mapped[list["Payment"]] = relationship(back_populates="lease")  # noqa: F821
    tenant: Mapped["User"] = relationship(foreign_keys="[Lease.tenant_user_id]")  # noqa: F821
    co_tenants: Mapped[list["User"]] = relationship(secondary="lease_co_tenants")  # noqa: F821
