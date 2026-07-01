import uuid
from datetime import datetime, date, time
from pydantic import BaseModel
from app.models.maintenance import MaintenancePriority, MaintenanceStatus


class AttachmentOut(BaseModel):
    id: uuid.UUID
    filename: str
    original_name: str
    url: str
    model_config = {"from_attributes": True}


class VendorSlotOut(BaseModel):
    id: uuid.UUID
    date: date
    start_time: time
    end_time: time
    model_config = {"from_attributes": True}


class VendorOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    business_name: str
    service_categories: list[str]
    full_name: str
    email: str
    phone: str
    avatar_url: str | None = None
    model_config = {"from_attributes": True}


class MaintenanceCreate(BaseModel):
    unit_id: uuid.UUID
    title: str
    description: str
    category: str
    priority: MaintenancePriority = MaintenancePriority.MEDIUM
    preferred_time_start: datetime | None = None
    preferred_time_end: datetime | None = None


class MaintenanceReview(BaseModel):
    est_hours_min: float | None = None
    est_hours_max: float | None = None
    est_cost_min: float | None = None
    est_cost_max: float | None = None
    status: MaintenanceStatus | None = None
    assignee_name: str | None = None


class MaintenanceSchedule(BaseModel):
    vendor_id: uuid.UUID
    scheduled_start: datetime
    scheduled_end: datetime
    availability_id: uuid.UUID | None = None


class MaintenanceUpdate(BaseModel):
    status: MaintenanceStatus | None = None
    assignee_name: str | None = None
    priority: MaintenancePriority | None = None
    resolution_notes: str | None = None


class MaintenanceOut(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    title: str
    description: str
    category: str
    priority: MaintenancePriority
    status: MaintenanceStatus
    assignee_name: str | None
    submitted_by_name: str | None = None
    submitted_by_user_id: uuid.UUID | None = None
    tenant_email: str | None = None
    tenant_phone: str | None = None
    unit_number: str | None = None
    property_name: str | None = None
    created_at: str | None = None
    preferred_time_start: datetime | None = None
    preferred_time_end: datetime | None = None
    est_hours_min: float | None = None
    est_hours_max: float | None = None
    est_cost_min: float | None = None
    est_cost_max: float | None = None
    vendor_id: uuid.UUID | None = None
    vendor_name: str | None = None
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    resolution_notes: str | None = None
    attachments: list[AttachmentOut] = []
    model_config = {"from_attributes": True}


# Vendor schemas
class VendorCreate(BaseModel):
    full_name: str
    email: str
    phone: str = ""
    business_name: str
    service_categories: list[str] = []


class VendorUpdate(BaseModel):
    business_name: str | None = None
    service_categories: list[str] | None = None
    phone: str | None = None


class VendorAvailabilityCreate(BaseModel):
    date: date
    start_time: time
    end_time: time


class VendorAvailabilityOut(BaseModel):
    id: uuid.UUID
    date: date
    start_time: time
    end_time: time
    model_config = {"from_attributes": True}
