import uuid
from typing import Literal
from pydantic import BaseModel, EmailStr
from app.models.user import UserRole


class TeamMemberOut(BaseModel):
    member_id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    email: str
    phone: str = ""
    role: UserRole
    # Vendor-only fields (present when role == VENDOR)
    business_name: str | None = None
    service_categories: list[str] = []
    is_public: bool | None = None
    street_address: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str | None = None

    model_config = {"from_attributes": True}


class TeamInvite(BaseModel):
    full_name: str
    email: EmailStr
    role: Literal["OWNER", "VENDOR"]


class TeamMemberUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    # Vendor-only fields — ignored unless the member's role is VENDOR
    business_name: str | None = None
    service_categories: list[str] | None = None
    is_public: bool | None = None
    street_address: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str | None = None
