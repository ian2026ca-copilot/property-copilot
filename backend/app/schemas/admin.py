from pydantic import BaseModel, EmailStr


class AdminUserOut(BaseModel):
    id: str
    email: str
    full_name: str


class CreateAdminIn(BaseModel):
    email: EmailStr
    full_name: str
    password: str


class OwnerRowOut(BaseModel):
    organization_id: str
    organization_name: str
    owner_email: str | None
    owner_name: str | None
    subscription_status: str | None
    trial_ends_at: str | None
    cancel_at_period_end: bool
    billing_exempt: bool
    is_suspended: bool
    property_count: int
    tenant_count: int


class OwnerPropertyOut(BaseModel):
    id: str
    name: str
    address: str
    city: str
    state: str
    unit_count: int


class OwnerTeamMemberOut(BaseModel):
    user_id: str
    name: str
    email: str
    role: str


class OwnerPaymentOut(BaseModel):
    id: str
    tenant_name: str | None
    amount: float
    due_date: str
    paid_date: str | None
    status: str
    payment_type: str


class OwnerDetailOut(BaseModel):
    organization_id: str
    organization_name: str
    organization_slug: str
    created_at: str
    owner_name: str | None
    owner_email: str | None
    owner_phone: str | None
    subscription_status: str | None
    trial_ends_at: str | None
    cancel_at_period_end: bool
    billing_exempt: bool
    is_suspended: bool
    stripe_customer_id: str | None
    stripe_subscription_id: str | None
    property_count: int
    tenant_count: int
    vendor_count: int
    properties: list[OwnerPropertyOut]
    team: list[OwnerTeamMemberOut]
    payments_collected_total: float
    payments_overdue_total: float
    payments_pending_total: float
    payments_overdue_count: int
    recent_payments: list[OwnerPaymentOut]


class ImpersonateOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    owner_name: str | None = None


class AISettingsOut(BaseModel):
    openai_key_set: bool
    deepseek_key_set: bool
    gemini_key_set: bool
    grok_key_set: bool
    active_provider: str


class AISettingsIn(BaseModel):
    openai_api_key: str | None = None
    deepseek_api_key: str | None = None
    gemini_api_key: str | None = None
    grok_api_key: str | None = None
    active_provider: str | None = None
