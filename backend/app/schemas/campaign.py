import uuid
from datetime import datetime, date
from pydantic import BaseModel
from app.models.campaign import CampaignStatus


class CampaignCreate(BaseModel):
    title: str
    unit_id: uuid.UUID | None = None
    description: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    available_from: date | None = None
    monthly_rent: float | None = None


class CampaignUpdate(BaseModel):
    title: str | None = None
    unit_id: uuid.UUID | None = None
    description: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    available_from: date | None = None
    monthly_rent: float | None = None


class CampaignOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    unit_id: uuid.UUID | None
    title: str
    description: str | None
    contact_name: str | None
    contact_phone: str | None
    contact_email: str | None
    available_from: date | None
    monthly_rent: float | None
    status: CampaignStatus
    photos: list[str]
    fb_post_id: str | None
    fb_posted_at: datetime | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    # Denormalized from unit
    unit_number: str | None = None
    property_name: str | None = None
    property_address: str | None = None

    model_config = {"from_attributes": True}


class CampaignAIGenerateOut(BaseModel):
    title: str
    description: str
    suggested_rent: float | None = None


class OrgFbSettingsUpdate(BaseModel):
    fb_page_token: str | None = None
    fb_page_id: str | None = None


class OrgFbSettingsOut(BaseModel):
    fb_page_id: str | None
    fb_page_token_set: bool  # never expose the raw token to frontend


class MarketingSiteCreate(BaseModel):
    name: str
    url: str


class MarketingSiteOut(BaseModel):
    id: uuid.UUID
    name: str
    url: str

    model_config = {"from_attributes": True}
