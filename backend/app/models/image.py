import uuid

from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, new_uuid


class PropertyImage(Base, TimestampMixin):
    __tablename__ = "property_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str] = mapped_column(String(500), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    property: Mapped["Property"] = relationship(back_populates="images", foreign_keys="[PropertyImage.property_id]")  # noqa: F821


class UnitImage(Base, TimestampMixin):
    __tablename__ = "unit_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"), index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str] = mapped_column(String(500), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    unit: Mapped["Unit"] = relationship(back_populates="images")  # noqa: F821
