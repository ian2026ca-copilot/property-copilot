from pydantic import BaseModel


class CheckoutSessionIn(BaseModel):
    plan: str = "monthly"  # "monthly" | "yearly"


class CheckoutSessionOut(BaseModel):
    url: str


class PortalSessionOut(BaseModel):
    url: str


class BillingStatusOut(BaseModel):
    status: str | None = None
    trial_ends_at: str | None = None
    billing_exempt: bool = False
    cancel_at_period_end: bool = False
