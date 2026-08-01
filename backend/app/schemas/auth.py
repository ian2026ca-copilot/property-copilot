import re
from datetime import date
from pydantic import BaseModel, EmailStr, field_validator
from app.schemas.tenant_application import RentalApplicationFields

E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")


def _validate_phone(v: str) -> str:
    v = v.strip()
    if not E164_RE.match(v):
        raise ValueError("Phone must be in E.164 format, e.g. +15550001234")
    return v


class RegisterRequest(RentalApplicationFields):
    email: EmailStr
    full_name: str
    first_name: str | None = None
    last_name: str | None = None
    password: str
    org_name: str | None = None
    org_slug: str | None = None
    role: str = "OWNER"
    phone: str
    business_name: str | None = None
    service_categories: list[str] = []
    street_address: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str | None = None

    # Tenant rental application field not shared with TenantCreate (owner already knows this from context there)
    date_of_birth: date | None = None
    unit_id: str | None = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return _validate_phone(v)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    phone: str
    org_id: str
    org_name: str
    org_slug: str
    role: str
    screening_criminal_record_enabled: bool = False
    screening_rental_history_enabled: bool = False

    class Config:
        from_attributes = True


class VacantUnitOut(BaseModel):
    id: str
    label: str
    monthly_rent: float


class OrganizationPublicOut(BaseModel):
    name: str
    slug: str
    screening_criminal_record_enabled: bool = False
    screening_rental_history_enabled: bool = False
    vacant_units: list[VacantUnitOut] = []


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _validate_phone(v)


class OrganizationUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    screening_criminal_record_enabled: bool | None = None
    screening_rental_history_enabled: bool | None = None
