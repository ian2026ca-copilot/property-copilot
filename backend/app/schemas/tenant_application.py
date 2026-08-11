import uuid
from datetime import date
from pydantic import BaseModel


class AddressHistoryIn(BaseModel):
    id: uuid.UUID | None = None
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
    id: uuid.UUID | None = None
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


class RentalApplicationFields(BaseModel):
    """Shared optional rental-application fields, mixed into both the public
    self-registration RegisterRequest and the owner-driven TenantCreate/TenantUpdate."""
    middle_name: str | None = None
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


# Flat TenantProfile columns carried by RentalApplicationFields (everything except the 7 lists)
RENTAL_APP_PROFILE_FIELDS = (
    "middle_name", "drivers_licence", "personal_income_annual",
    "household_income_annual", "personal_message", "smoke_vape",
    "given_notice_to_landlord", "refused_rent", "evicted", "criminal_record", "screening_notes",
)
# The 7 repeatable-list fields, replaced wholesale on update
RENTAL_APP_LIST_FIELDS = (
    "address_history", "employment_history", "income_sources",
    "occupants", "cosigners", "pets", "vehicles",
)


class TenantApplicationOut(RentalApplicationFields):
    """Full rental-application detail for one tenant, used to pre-fill the Edit tenant form."""
    application_status: str = "NOT_STARTED"
    interested_unit_id: str | None = None
    model_config = {"from_attributes": True}


class TenantScreeningUpdate(BaseModel):
    """Landlord-only screening decision update."""
    application_status: str | None = None
    interested_unit_id: str | None = None
    screening_notes: str | None = None


class TenantScreeningNoteIn(BaseModel):
    note: str


class TenantScreeningNoteOut(BaseModel):
    id: str
    author_name: str
    note: str
    kind: str
    created_at: str

    model_config = {"from_attributes": True}


class ReferenceEmailConfigIn(BaseModel):
    """All fields optional — only the ones provided are updated. Send an empty
    string to clear a previously-saved value."""
    imap_host: str | None = None
    imap_port: int | None = None
    app_password: str | None = None
    check_enabled: bool | None = None


class ReferenceEmailConfigOut(BaseModel):
    """Never echoes the app password back — only whether one is on file."""
    imap_host: str | None = None
    imap_port: int | None = None
    password_set: bool = False
    check_enabled: bool = False


class EmployerReferenceContactIn(BaseModel):
    channel: str  # "EMAIL" | "SMS"
    subject: str | None = None  # optional AI-drafted (or edited) letter override, EMAIL only
    body: str | None = None


class EmployerReferenceLetterOut(BaseModel):
    subject: str
    body: str


class TenantInviteDraftIn(BaseModel):
    template_id: str | None = None  # a saved InviteTemplate to use instead of AI drafting


class TenantInviteDraftOut(BaseModel):
    message: str
    register_link: str


class TenantRegistrationLinkIn(BaseModel):
    channels: list[str]  # any of "email", "sms"
    message: str | None = None  # owner-reviewed/edited draft; regenerated via AI if omitted
    register_link: str | None = None  # the link the draft's token points to; regenerated if omitted
    template_id: str | None = None  # used only if message is omitted (fallback re-draft)


class InviteTemplateCreate(BaseModel):
    name: str
    body: str


class InviteTemplateUpdate(BaseModel):
    name: str
    body: str


class InviteTemplateOut(BaseModel):
    id: str
    name: str
    body: str
    created_at: str


class TenantRegistrationLinkOut(BaseModel):
    email_sent: bool
    sms_sent: bool
    skipped_channels: list[str] = []
