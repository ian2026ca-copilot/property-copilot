import uuid
from datetime import date
from pydantic import BaseModel, EmailStr
from app.models.lease import LeaseStatus, LeaseType


# ── Tenant (person) schemas ────────────────────────────────────────────────────

class TenantCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: str = ""
    date_of_birth: date | None = None
    street_address: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str | None = None


class TenantUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    date_of_birth: date | None = None
    street_address: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str | None = None


class TenantDocumentOut(BaseModel):
    id: uuid.UUID
    doc_type: str
    filename: str
    original_name: str
    url: str

    model_config = {"from_attributes": True}


class TenantOut(BaseModel):
    id: uuid.UUID
    first_name: str | None = None
    last_name: str | None = None
    full_name: str
    email: str
    phone: str = ""
    date_of_birth: date | None = None
    avatar_url: str | None = None
    street_address: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str | None = None
    documents: list[TenantDocumentOut] = []

    model_config = {"from_attributes": True}


# Legacy — kept for backward compat with existing create_tenant endpoint
class TenantInvite(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: str = ""
    date_of_birth: date | None = None
    unit_id: uuid.UUID
    start_date: date
    end_date: date
    monthly_rent: float
    security_deposit: float = 0.0
    lease_type: LeaseType = LeaseType.FIXED
    notes: str | None = None


# ── Lease schemas ──────────────────────────────────────────────────────────────

class LeaseCreate(BaseModel):
    unit_id: uuid.UUID
    tenant_user_id: uuid.UUID
    co_tenant_ids: list[uuid.UUID] = []
    start_date: date
    end_date: date
    monthly_rent: float
    security_deposit: float = 0.0
    lease_type: LeaseType = LeaseType.FIXED
    landlord_name: str | None = None
    notes: str | None = None


class LeaseUpdate(BaseModel):
    unit_id: uuid.UUID | None = None
    # tenant person fields (legacy combined endpoint still uses these)
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    date_of_birth: date | None = None
    # lease fields
    start_date: date | None = None
    end_date: date | None = None
    monthly_rent: float | None = None
    security_deposit: float | None = None
    lease_type: LeaseType | None = None
    status: LeaseStatus | None = None
    landlord_name: str | None = None
    notes: str | None = None


class LeaseRenew(BaseModel):
    start_date: date
    end_date: date
    unit_id: uuid.UUID | None = None
    tenant_user_id: uuid.UUID | None = None
    co_tenant_ids: list[uuid.UUID] | None = None
    monthly_rent: float | None = None
    security_deposit: float | None = None
    lease_type: LeaseType | None = None
    landlord_name: str | None = None
    notes: str | None = None


class UnitSummary(BaseModel):
    id: uuid.UUID
    unit_number: str
    property_name: str

    model_config = {"from_attributes": True}


class LeaseOut(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    tenant_user_id: uuid.UUID
    start_date: date
    end_date: date
    monthly_rent: float
    security_deposit: float
    status: LeaseStatus
    lease_type: LeaseType = LeaseType.FIXED
    document_url: str | None = None
    landlord_name: str | None = None
    notes: str | None
    tenant: TenantOut | None = None
    co_tenants: list[TenantOut] = []
    unit_number: str | None = None
    property_name: str | None = None

    model_config = {"from_attributes": True}
