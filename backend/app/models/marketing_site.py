import uuid

from sqlalchemy import String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, new_uuid

# Seeded into every new organization's marketing_sites so the campaign "Post"
# dropdown always has these by default — rows are then editable/removable
# like any other marketing site.
DEFAULT_MARKETING_SITES = [
    ("Facebook", "https://www.facebook.com/login/"),
    ("RentFaster", "https://www.rentfaster.ca/landlords/"),
    ("Kijiji", "https://www.kijiji.ca/t-login.html"),
]


class MarketingSite(Base, TimestampMixin):
    __tablename__ = "marketing_sites"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
