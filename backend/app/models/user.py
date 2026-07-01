import uuid
import enum
from datetime import date

from sqlalchemy import String, ForeignKey, Enum as SAEnum, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, new_uuid


class UserRole(str, enum.Enum):
    OWNER = "OWNER"
    MANAGER = "MANAGER"
    AGENT = "AGENT"
    TENANT = "TENANT"
    VENDOR = "VENDOR"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    avatar_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    street_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    province: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)

    memberships: Mapped[list["OrganizationMember"]] = relationship(back_populates="user")
    tenant_documents: Mapped[list["TenantDocument"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    @property
    def display_name(self) -> str:
        if self.first_name or self.last_name:
            return " ".join(filter(None, [self.first_name, self.last_name]))
        return self.full_name


class TenantDocument(Base, TimestampMixin):
    __tablename__ = "tenant_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "id_document" | "reference_letter"
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str] = mapped_column(String(500), nullable=False)

    user: Mapped["User"] = relationship(back_populates="tenant_documents")


class OrganizationMember(Base, TimestampMixin):
    __tablename__ = "organization_members"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), nullable=False)

    organization: Mapped["Organization"] = relationship(back_populates="members")  # noqa: F821
    user: Mapped["User"] = relationship(back_populates="memberships")
