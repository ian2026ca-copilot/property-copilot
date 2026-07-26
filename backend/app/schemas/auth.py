import re
from pydantic import BaseModel, EmailStr, field_validator

E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")


def _validate_phone(v: str) -> str:
    v = v.strip()
    if not E164_RE.match(v):
        raise ValueError("Phone must be in E.164 format, e.g. +15550001234")
    return v


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    org_name: str
    role: str = "OWNER"
    phone: str
    business_name: str | None = None
    service_categories: list[str] = []
    street_address: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str | None = None

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
    role: str

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _validate_phone(v)
