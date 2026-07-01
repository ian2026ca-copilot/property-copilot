import uuid
import enum

from sqlalchemy import String, Integer, Numeric, ForeignKey, Enum as SAEnum, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, new_uuid


class PropertyType(str, enum.Enum):
    RESIDENTIAL = "RESIDENTIAL"
    COMMERCIAL = "COMMERCIAL"
    MIXED_USE = "MIXED_USE"
    INDUSTRIAL = "INDUSTRIAL"


class UnitStatus(str, enum.Enum):
    OCCUPIED = "OCCUPIED"
    VACANT = "VACANT"
    MAINTENANCE = "MAINTENANCE"
    RESERVED = "RESERVED"
    NOTICE = "NOTICE"
    RENOVATION = "RENOVATION"


class Property(Base, TimestampMixin):
    __tablename__ = "properties"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(50), nullable=False)
    zip_code: Mapped[str] = mapped_column(String(20), nullable=False)
    property_type: Mapped[PropertyType] = mapped_column(SAEnum(PropertyType), nullable=False, default=PropertyType.RESIDENTIAL)
    year_built: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    cover_image_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("property_images.id", ondelete="SET NULL"), nullable=True
    )

    units: Mapped[list["Unit"]] = relationship(back_populates="property", cascade="all, delete-orphan")
    images: Mapped[list["PropertyImage"]] = relationship(back_populates="property", cascade="all, delete-orphan", order_by="PropertyImage.sort_order", foreign_keys="[PropertyImage.property_id]")  # noqa: F821
    cover_image: Mapped["PropertyImage | None"] = relationship(foreign_keys="[Property.cover_image_id]")  # noqa: F821
    organization: Mapped["Organization"] = relationship(back_populates="properties")  # noqa: F821


class Unit(Base, TimestampMixin):
    __tablename__ = "units"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    unit_number: Mapped[str] = mapped_column(String(50), nullable=False)
    bedrooms: Mapped[int] = mapped_column(Integer, default=1)
    bathrooms: Mapped[float] = mapped_column(Numeric(3, 1), default=1.0)
    square_feet: Mapped[int | None] = mapped_column(Integer, nullable=True)
    monthly_rent: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[UnitStatus] = mapped_column(SAEnum(UnitStatus), nullable=False, default=UnitStatus.VACANT)

    property: Mapped["Property"] = relationship(back_populates="units")
    images: Mapped[list["UnitImage"]] = relationship(back_populates="unit", cascade="all, delete-orphan", order_by="UnitImage.sort_order")  # noqa: F821
    leases: Mapped[list["Lease"]] = relationship(back_populates="unit")  # noqa: F821
    maintenance_requests: Mapped[list["MaintenanceRequest"]] = relationship(back_populates="unit")  # noqa: F821
