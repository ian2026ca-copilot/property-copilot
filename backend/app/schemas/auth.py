import re
from datetime import date
from pydantic import BaseModel, EmailStr, field_validator

E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")


def _validate_phone(v: str) -> str:
    v = v.strip()
    if not E164_RE.match(v):
        raise ValueError("Phone must be in E.164 format, e.g. +15550001234")
    return v


class AddressHistoryIn(BaseModel):
    is_current: bool = True
    residential_status: str | None = None
    street_address: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str | None = None
    move_in_date: date | None = None
    move_out_date: date | None = None
    monthly_rent: float | None = None
    reason_for_moving: str | None = None
    landlord_name: str | None = None
    landlord_phone: str | None = None
    landlord_email: str | None = None


class EmploymentIn(BaseModel):
    is_current: bool = True
    employment_type: str | None = None
    company: str | None = None
    position: str | None = None
    employment_length: str | None = None
    company_website: str | None = None
    company_linkedin_url: str | None = None
    additional_notes: str | None = None
    employer_reference_name: str | None = None
    employer_reference_phone: str | None = None
    employer_reference_email: str | None = None


class IncomeSourceIn(BaseModel):
    source_name: str
    amount_annual: float


class OccupantIn(BaseModel):
    name: str
    relationship_label: str | None = None
    email: str | None = None
    phone: str | None = None
    share_of_rent: float | None = None
    is_dependent: bool = False


class CosignerIn(BaseModel):
    name: str
    relationship_label: str | None = None
    email: str | None = None
    phone: str | None = None


class PetIn(BaseModel):
    animal_type: str
    breed: str | None = None
    weight_lbs: float | None = None
    sex: str | None = None
    age: int | None = None
    is_fixed: bool | None = None


class VehicleIn(BaseModel):
    make: str
    model: str
    year: int | None = None
    license_plate: str | None = None


class RegisterRequest(BaseModel):
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

    # Tenant rental application fields (used when role == TENANT)
    middle_name: str | None = None
    date_of_birth: date | None = None
    ssn_sin: str | None = None
    drivers_licence: str | None = None
    personal_income_annual: float | None = None
    household_income_annual: float | None = None
    personal_message: str | None = None
    smoke_vape: bool | None = None
    given_notice_to_landlord: bool | None = None
    refused_rent: bool | None = None
    evicted: bool | None = None
    criminal_record: bool | None = None
    screening_notes: str | None = None
    address_history: list[AddressHistoryIn] = []
    employment_history: list[EmploymentIn] = []
    income_sources: list[IncomeSourceIn] = []
    occupants: list[OccupantIn] = []
    cosigners: list[CosignerIn] = []
    pets: list[PetIn] = []
    vehicles: list[VehicleIn] = []

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

    class Config:
        from_attributes = True


class OrganizationPublicOut(BaseModel):
    name: str
    slug: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _validate_phone(v)
