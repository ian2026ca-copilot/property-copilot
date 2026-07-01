import uuid
import enum
from datetime import date

from sqlalchemy import Date, Numeric, ForeignKey, Enum as SAEnum, Text, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, new_uuid


class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    OVERDUE = "OVERDUE"
    VOIDED = "VOIDED"
    DUE = "DUE"      # legacy alias
    LATE = "LATE"    # legacy alias
    WAIVED = "WAIVED"


class PaymentType(str, enum.Enum):
    RENT = "RENT"
    SECURITY_DEPOSIT = "SECURITY_DEPOSIT"
    LATE_FEE = "LATE_FEE"
    MAINTENANCE_CHARGE = "MAINTENANCE_CHARGE"
    DEPOSIT = "DEPOSIT"   # legacy alias
    OTHER = "OTHER"


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    lease_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leases.id", ondelete="CASCADE"), index=True
    )
    tenant_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[PaymentStatus] = mapped_column(SAEnum(PaymentStatus, create_constraint=False), nullable=False, default=PaymentStatus.PENDING)
    payment_type: Mapped[PaymentType] = mapped_column(SAEnum(PaymentType, create_constraint=False), nullable=False, default=PaymentType.RENT)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    lease: Mapped["Lease"] = relationship(back_populates="payments", lazy="select")  # noqa: F821
