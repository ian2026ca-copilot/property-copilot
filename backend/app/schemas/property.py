import uuid
from pydantic import BaseModel
from app.models.property import PropertyType, UnitStatus


class PropertyCreate(BaseModel):
    name: str
    address: str
    city: str
    state: str
    zip_code: str
    property_type: PropertyType = PropertyType.HOUSE
    year_built: int | None = None


class PropertyUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    property_type: PropertyType | None = None
    year_built: int | None = None


class PropertyOut(BaseModel):
    id: uuid.UUID
    name: str
    address: str
    city: str
    state: str
    zip_code: str
    property_type: PropertyType
    year_built: int | None
    unit_count: int = 0
    occupied_count: int = 0
    cover_url: str | None = None

    model_config = {"from_attributes": True}


class UnitCreate(BaseModel):
    unit_number: str
    bedrooms: int = 1
    bathrooms: float = 1.0
    square_feet: int | None = None
    monthly_rent: float
    status: UnitStatus = UnitStatus.VACANT


class UnitUpdate(BaseModel):
    unit_number: str | None = None
    bedrooms: int | None = None
    bathrooms: float | None = None
    square_feet: int | None = None
    monthly_rent: float | None = None
    status: UnitStatus | None = None


class UnitTenantInfo(BaseModel):
    tenant_user_id: str
    tenant_name: str | None = None
    tenant_avatar_url: str | None = None
    lease_id: str
    lease_start: str | None = None
    lease_end: str | None = None
    outstanding_balance: float = 0.0


class UnitOut(BaseModel):
    id: uuid.UUID
    property_id: uuid.UUID
    unit_number: str
    bedrooms: int
    bathrooms: float
    square_feet: int | None
    monthly_rent: float
    status: UnitStatus
    property_name: str | None = None
    tenant_name: str | None = None
    tenant_user_id: str | None = None
    tenant_avatar_url: str | None = None
    lease_id: str | None = None
    lease_start: str | None = None
    lease_end: str | None = None
    outstanding_balance: float = 0.0
    tenants: list[UnitTenantInfo] = []

    model_config = {"from_attributes": True}
