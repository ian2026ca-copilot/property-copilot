import uuid
from datetime import date
from pydantic import BaseModel
from app.models.payment import PaymentStatus, PaymentType


class PaymentCreate(BaseModel):
    lease_id: uuid.UUID
    amount: float
    due_date: date
    paid_date: date | None = None
    payment_type: PaymentType = PaymentType.RENT
    description: str | None = None
    notes: str | None = None


class PaymentUpdate(BaseModel):
    amount: float | None = None
    due_date: date | None = None
    paid_date: date | None = None
    status: PaymentStatus | None = None
    payment_type: PaymentType | None = None
    description: str | None = None
    notes: str | None = None


class PaymentOut(BaseModel):
    id: uuid.UUID
    lease_id: uuid.UUID
    amount: float
    due_date: date
    paid_date: date | None
    status: PaymentStatus
    payment_type: PaymentType
    description: str | None
    notes: str | None = None
    tenant_name: str | None = None
    tenant_avatar_url: str | None = None
    unit_number: str | None = None
    property_name: str | None = None

    model_config = {"from_attributes": True}
