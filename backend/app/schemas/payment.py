import uuid
from datetime import date, datetime
from pydantic import BaseModel
from app.models.payment import PaymentStatus, PaymentType


class PaymentCreate(BaseModel):
    lease_id: uuid.UUID
    amount: float
    due_date: date
    paid_date: date | None = None
    payment_type: PaymentType = PaymentType.RENT
    description: str | None = None


class PaymentUpdate(BaseModel):
    amount: float | None = None
    due_date: date | None = None
    paid_date: date | None = None
    status: PaymentStatus | None = None
    payment_type: PaymentType | None = None
    description: str | None = None


class PaymentNoteOut(BaseModel):
    id: uuid.UUID
    note: str
    author_name: str
    author_user_id: uuid.UUID
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class PaymentNoteCreate(BaseModel):
    note: str


class PaymentOut(BaseModel):
    id: uuid.UUID
    lease_id: uuid.UUID
    amount: float
    due_date: date
    paid_date: date | None
    status: PaymentStatus
    payment_type: PaymentType
    description: str | None
    notes: list[PaymentNoteOut] = []
    tenant_name: str | None = None
    tenant_avatar_url: str | None = None
    tenant_email: str | None = None
    tenant_phone: str | None = None
    unit_number: str | None = None
    property_name: str | None = None
    status_updated_by_name: str | None = None
    status_updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class PaymentNoticeAIGenerateIn(BaseModel):
    extra_instructions: str | None = None


class PaymentNoticeAIGenerateOut(BaseModel):
    subject: str
    message: str


class PaymentNoticeSend(BaseModel):
    subject: str
    message: str
    channels: list[str]


class PaymentNoticeSendOut(BaseModel):
    email_sent: bool
    sms_sent: bool
    skipped_channels: list[str] = []
    payment: PaymentOut
