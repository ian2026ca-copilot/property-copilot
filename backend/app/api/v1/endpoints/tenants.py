import os
import secrets
import uuid
import pathlib
from datetime import date, datetime, timedelta, timezone
from email.utils import make_msgid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload, joinedload

from app.core.database import get_db
from app.core.ai_client import generate_ai_text
from app.core.security import hash_password
from app.core.email import send_reference_letter_email, send_registration_link_email
from app.core.sms import send_sms
from app.api.deps import get_current_user, require_min_role
from app.models.user import User, OrganizationMember, UserRole, TenantDocument
from app.models.profiles import TenantProfile
from app.models.lease import Lease, LeaseStatus
from app.models.property import Unit, Property, UnitStatus
from app.models.organization import Organization
from app.models.reference_check import ReferenceCheckRequest
from app.models.password_reset import PasswordResetToken
from app.models.tenant_application import (
    TenantAddressHistory, TenantEmployment, TenantIncomeSource,
    TenantOccupant, TenantCosigner, TenantPet, TenantVehicle, TenantScreeningNote,
)
from app.schemas.lease import TenantCreate, TenantUpdate, TenantInvite, LeaseUpdate, LeaseOut, TenantOut, TenantDocumentOut
from app.schemas.property import UnitOut
from app.schemas.tenant_application import (
    TenantApplicationOut, AddressHistoryIn, EmploymentIn, IncomeSourceIn,
    OccupantIn, CosignerIn, PetIn, VehicleIn, TenantScreeningUpdate,
    TenantScreeningNoteIn, TenantScreeningNoteOut, EmployerReferenceContactIn, EmployerReferenceLetterOut,
    ReferenceEmailConfigIn, ReferenceEmailConfigOut,
    TenantRegistrationLinkIn, TenantRegistrationLinkOut,
    RENTAL_APP_PROFILE_FIELDS, RENTAL_APP_LIST_FIELDS,
)
from app.api.v1.endpoints.payments import generate_monthly_payments

router = APIRouter(prefix="/tenants", tags=["tenants"])

UPLOAD_DIR = pathlib.Path("/app/uploads")
MAX_SIZE_MB = 20


def _uploads_url(filename: str) -> str:
    base = os.getenv("FRONTEND_URL", "http://localhost:3001").replace(":3001", ":8002").replace(":3000", ":8002")
    return f"{base}/uploads/{filename}"


async def _save_file(upload: UploadFile) -> str:
    data = await upload.read()
    if len(data) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_SIZE_MB} MB limit")
    ext = pathlib.Path(upload.filename or "file").suffix or ".bin"
    filename = f"{uuid.uuid4()}{ext}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / filename).write_bytes(data)
    return filename


def _doc_to_out(doc: TenantDocument) -> TenantDocumentOut:
    return TenantDocumentOut(
        id=doc.id,
        doc_type=doc.doc_type,
        filename=doc.filename,
        original_name=doc.original_name,
        url=_uploads_url(doc.filename),
    )


PROFILE_FIELDS = ("date_of_birth", "street_address", "city", "province", "postal_code", "country")


async def _upsert_tenant_profile(db: AsyncSession, user_id, **fields) -> TenantProfile:
    """Create or update the given user's TenantProfile with any non-None fields provided."""
    result = await db.execute(select(TenantProfile).where(TenantProfile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = TenantProfile(user_id=user_id)
        db.add(profile)
    for field, value in fields.items():
        if value is not None:
            setattr(profile, field, value)
    return profile


def _tenant_to_out(user: User, docs: list[TenantDocument] | None = None) -> TenantOut:
    profile = user.tenant_profile
    return TenantOut(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        full_name=user.display_name,
        email=user.email,
        phone=user.phone or "",
        date_of_birth=profile.date_of_birth if profile else None,
        avatar_url=_uploads_url(user.avatar_filename) if user.avatar_filename else None,
        street_address=profile.street_address if profile else None,
        city=profile.city if profile else None,
        province=profile.province if profile else None,
        postal_code=profile.postal_code if profile else None,
        country=profile.country if profile else None,
        documents=[_doc_to_out(d) for d in (docs or [])],
        application_status=profile.application_status if profile else "NOT_STARTED",
        interested_unit_id=str(profile.interested_unit_id) if profile and profile.interested_unit_id else None,
        personal_income_annual=profile.personal_income_annual if profile else None,
        household_income_annual=profile.household_income_annual if profile else None,
    )


def _effective_status(lease: Lease) -> LeaseStatus:
    return lease.status


def _lease_to_out(lease: Lease) -> LeaseOut:
    docs = list(lease.tenant.tenant_documents) if lease.tenant and hasattr(lease.tenant, "tenant_documents") else []
    return LeaseOut(
        id=lease.id,
        unit_id=lease.unit_id,
        tenant_user_id=lease.tenant_user_id,
        start_date=lease.start_date,
        end_date=lease.end_date,
        monthly_rent=lease.monthly_rent,
        security_deposit=lease.security_deposit,
        status=_effective_status(lease),
        lease_type=lease.lease_type,
        notes=lease.notes,
        tenant=_tenant_to_out(lease.tenant, docs) if lease.tenant else None,
        unit_number=lease.unit.unit_number if lease.unit else None,
        property_name=lease.unit.property.name if lease.unit and lease.unit.property else None,
    )


@router.get("", response_model=list[LeaseOut])
async def list_tenants(
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(Lease)
        .where(
            Lease.organization_id == member.organization_id,
            Lease.status.in_([LeaseStatus.ACTIVE, LeaseStatus.PENDING]),
        )
        .options(
            selectinload(Lease.tenant).selectinload(User.tenant_documents),
            selectinload(Lease.tenant).selectinload(User.tenant_profile),
            selectinload(Lease.unit).selectinload(Unit.property),
        )
        .order_by(Lease.created_at.desc())
    )
    return [_lease_to_out(l) for l in result.scalars().all()]


@router.post("", response_model=LeaseOut, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    body: TenantInvite,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current

    result = await db.execute(select(User).where(User.email == body.email))
    tenant_user = result.scalar_one_or_none()
    if not tenant_user:
        full_name = f"{body.first_name} {body.last_name}".strip()
        tenant_user = User(
            email=body.email,
            full_name=full_name,
            first_name=body.first_name,
            last_name=body.last_name,
            phone=body.phone or "",
            hashed_password=hash_password(secrets.token_urlsafe(16)),
        )
        db.add(tenant_user)
        await db.flush()
    else:
        # Update profile fields on existing user
        tenant_user.first_name = body.first_name
        tenant_user.last_name = body.last_name
        tenant_user.full_name = f"{body.first_name} {body.last_name}".strip()
        if body.phone:
            tenant_user.phone = body.phone

    if body.date_of_birth:
        await _upsert_tenant_profile(db, tenant_user.id, date_of_birth=body.date_of_birth)

    mem_result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.user_id == tenant_user.id,
        )
    )
    if not mem_result.scalar_one_or_none():
        db.add(OrganizationMember(
            organization_id=member.organization_id,
            user_id=tenant_user.id,
            role=UserRole.TENANT,
        ))

    today = date.today()
    initial_status = LeaseStatus.PENDING if body.start_date > today else LeaseStatus.ACTIVE
    lease = Lease(
        organization_id=member.organization_id,
        unit_id=body.unit_id,
        tenant_user_id=tenant_user.id,
        start_date=body.start_date,
        end_date=body.end_date,
        monthly_rent=body.monthly_rent,
        security_deposit=body.security_deposit,
        notes=body.notes,
        status=initial_status,
    )
    db.add(lease)
    await db.flush()  # get lease.id before generating payments

    # Mark unit as occupied
    unit_result = await db.execute(select(Unit).where(Unit.id == body.unit_id))
    unit_obj = unit_result.scalar_one_or_none()
    if unit_obj:
        unit_obj.status = UnitStatus.OCCUPIED

    # Auto-generate monthly rent payments
    monthly_payments = generate_monthly_payments(lease, member.organization_id)
    for p in monthly_payments:
        db.add(p)

    await db.commit()

    result = await db.execute(
        select(Lease).where(Lease.id == lease.id)
        .options(
            selectinload(Lease.tenant).selectinload(User.tenant_documents),
            selectinload(Lease.tenant).selectinload(User.tenant_profile),
            selectinload(Lease.unit).selectinload(Unit.property),
        )
    )
    return _lease_to_out(result.scalar_one())


@router.put("/{lease_id}", response_model=LeaseOut)
async def update_tenant(
    lease_id: str,
    body: LeaseUpdate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(Lease).where(Lease.id == lease_id, Lease.organization_id == member.organization_id)
        .options(
            selectinload(Lease.tenant).selectinload(User.tenant_documents),
            selectinload(Lease.tenant).selectinload(User.tenant_profile),
            selectinload(Lease.unit).selectinload(Unit.property),
        )
    )
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")

    # Update tenant user profile fields
    tenant_fields = {"first_name", "last_name", "phone"}
    data = body.model_dump(exclude_none=True)
    date_of_birth = data.pop("date_of_birth", None)
    if lease.tenant:
        for field in tenant_fields:
            if field in data:
                setattr(lease.tenant, field, data.pop(field))
        if lease.tenant.first_name or lease.tenant.last_name:
            lease.tenant.full_name = " ".join(filter(None, [lease.tenant.first_name, lease.tenant.last_name]))
        if date_of_birth:
            await _upsert_tenant_profile(db, lease.tenant.id, date_of_birth=date_of_birth)
    else:
        for field in tenant_fields:
            data.pop(field, None)

    # Update lease fields
    for field, value in data.items():
        setattr(lease, field, value)

    await db.commit()

    result = await db.execute(
        select(Lease).where(Lease.id == lease.id)
        .options(
            selectinload(Lease.tenant).selectinload(User.tenant_documents),
            selectinload(Lease.tenant).selectinload(User.tenant_profile),
            selectinload(Lease.unit).selectinload(Unit.property),
        )
    )
    return _lease_to_out(result.scalar_one())


@router.delete("/{lease_id}", status_code=status.HTTP_204_NO_CONTENT)
async def terminate_tenant(
    lease_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(Lease).where(Lease.id == lease_id, Lease.organization_id == member.organization_id)
    )
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")
    lease.status = LeaseStatus.TERMINATED

    # Restore unit to vacant if no other active lease on it
    other_active = await db.execute(
        select(Lease).where(
            Lease.unit_id == lease.unit_id,
            Lease.id != lease.id,
            Lease.status.in_([LeaseStatus.ACTIVE, LeaseStatus.PENDING]),
        )
    )
    if not other_active.scalar_one_or_none():
        unit_result = await db.execute(select(Unit).where(Unit.id == lease.unit_id))
        unit_obj = unit_result.scalar_one_or_none()
        if unit_obj:
            unit_obj.status = UnitStatus.VACANT

    await db.commit()


# ── Person-only CRUD (new decoupled flow) ─────────────────────────────────────

async def _create_tenant_person(org_id, body: TenantCreate, db: AsyncSession) -> User:
    """Shared by POST /tenants/person and the AI copilot's execute step."""
    result = await db.execute(select(User).where(User.email == body.email))
    tenant_user = result.scalar_one_or_none()
    address_fields = ("street_address", "city", "province", "postal_code", "country")
    if not tenant_user:
        full_name = f"{body.first_name} {body.last_name}".strip()
        tenant_user = User(
            email=body.email,
            full_name=full_name,
            first_name=body.first_name,
            last_name=body.last_name,
            phone=body.phone or "",
            hashed_password=hash_password(secrets.token_urlsafe(16)),
        )
        db.add(tenant_user)
        await db.flush()
    else:
        tenant_user.first_name = body.first_name
        tenant_user.last_name = body.last_name
        tenant_user.full_name = f"{body.first_name} {body.last_name}".strip()
        tenant_user.is_active = True  # re-activate if previously deleted
        if body.phone:
            tenant_user.phone = body.phone

    # The "current" entry in address_history (if supplied) takes priority over the
    # legacy flat address fields for the tenant's profile address.
    current_addr = next((a for a in body.address_history if a.is_current), None) \
        or (body.address_history[0] if body.address_history else None)
    address_field_values = (
        {f: getattr(current_addr, f) for f in address_fields}
        if current_addr else {f: getattr(body, f) for f in address_fields}
    )

    await _upsert_tenant_profile(
        db, tenant_user.id,
        date_of_birth=body.date_of_birth,
        middle_name=body.middle_name,
        drivers_licence=body.drivers_licence,
        personal_income_annual=body.personal_income_annual,
        household_income_annual=body.household_income_annual,
        personal_message=body.personal_message,
        smoke_vape=body.smoke_vape,
        given_notice_to_landlord=body.given_notice_to_landlord,
        refused_rent=body.refused_rent,
        evicted=body.evicted,
        criminal_record=body.criminal_record,
        screening_notes=body.screening_notes,
        **address_field_values,
    )

    now = datetime.now(timezone.utc)
    for a in body.address_history:
        db.add(TenantAddressHistory(user_id=tenant_user.id, created_at=now, **a.model_dump()))
    for e in body.employment_history:
        db.add(TenantEmployment(user_id=tenant_user.id, created_at=now, **e.model_dump()))
    for i in body.income_sources:
        db.add(TenantIncomeSource(user_id=tenant_user.id, created_at=now, **i.model_dump()))
    for o in body.occupants:
        db.add(TenantOccupant(user_id=tenant_user.id, created_at=now, **o.model_dump()))
    for c in body.cosigners:
        db.add(TenantCosigner(user_id=tenant_user.id, created_at=now, **c.model_dump()))
    for p in body.pets:
        db.add(TenantPet(user_id=tenant_user.id, created_at=now, **p.model_dump()))
    for v in body.vehicles:
        db.add(TenantVehicle(user_id=tenant_user.id, created_at=now, **v.model_dump()))

    mem_result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == tenant_user.id,
        )
    )
    if not mem_result.scalar_one_or_none():
        db.add(OrganizationMember(
            organization_id=org_id,
            user_id=tenant_user.id,
            role=UserRole.TENANT,
        ))

    await db.commit()
    result = await db.execute(
        select(User).where(User.id == tenant_user.id)
        .options(selectinload(User.tenant_documents), selectinload(User.tenant_profile))
    )
    return result.scalar_one()


@router.post("/person", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
async def create_person(
    body: TenantCreate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    """Create a tenant person record without a lease."""
    _, member = current
    u = await _create_tenant_person(member.organization_id, body, db)
    return _tenant_to_out(u, u.tenant_documents)


@router.post("/ai-extract")
async def ai_extract_tenant(
    file: UploadFile = File(...),
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
):
    """Use AI vision to extract tenant info from an uploaded identity document."""
    import json

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB)")

    mime = file.content_type or "image/jpeg"

    # Gemini natively supports PDFs passed as-is; other providers expect image
    # formats only, so a PDF upload may fail there — a provider limitation,
    # not something worked around here.
    prompt = (
        "You are an expert at reading identity documents. "
        "Extract the following fields from this document image and return ONLY a JSON object with these exact keys "
        "(use null for any field you cannot find or are not confident about):\n"
        "first_name, last_name, date_of_birth (YYYY-MM-DD format), "
        "street_address, city, province, postal_code, country\n\n"
        "Rules:\n"
        "- Return ONLY the JSON object, no explanation.\n"
        "- For date_of_birth use YYYY-MM-DD format.\n"
        "- For province use the full name (e.g. 'Alberta', not 'AB').\n"
        "- If country is Canada or USA, fill province/state if visible.\n"
        "- Do not guess — use null if unsure."
    )

    try:
        raw = generate_ai_text(prompt, images=[{"mime_type": mime, "data": content}])
    except Exception as e:
        err_str = str(e)
        if "quota" in err_str.lower() or "429" in err_str:
            raise HTTPException(status_code=402, detail="AI provider quota exceeded — check your API key in admin Settings")
        raise HTTPException(status_code=502, detail=f"AI error: {err_str[:200]}")

    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        data = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=422, detail=f"Could not parse AI response: {raw[:200]}")

    return data


@router.get("/persons", response_model=list[TenantOut])
async def list_persons(
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all tenant persons in the organisation."""
    _, member = current
    result = await db.execute(
        select(User)
        .join(OrganizationMember, OrganizationMember.user_id == User.id)
        .where(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.role == UserRole.TENANT,
            User.is_active == True,
        )
        .options(selectinload(User.tenant_documents), selectinload(User.tenant_profile))
        .order_by(User.full_name)
    )
    users = result.scalars().all()
    return [_tenant_to_out(u, u.tenant_documents) for u in users]


@router.get("/person/{tenant_user_id}", response_model=TenantOut)
async def get_person(
    tenant_user_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .where(User.id == tenant_user_id)
        .options(selectinload(User.tenant_documents), selectinload(User.tenant_profile))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return _tenant_to_out(user, user.tenant_documents)


@router.post("/person/{tenant_user_id}/send-registration-link", response_model=TenantRegistrationLinkOut)
async def send_registration_link(
    tenant_user_id: str,
    body: TenantRegistrationLinkIn,
    background_tasks: BackgroundTasks,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    """Tenant records the owner creates directly (via +Add tenant or the AI
    copilot) start with an unusable random password, so this is how the
    tenant actually gets into their portal — reuses the exact same
    PasswordResetToken + /reset-password flow as /auth/forgot-password, just
    with a week-long expiry suited to an onboarding invite rather than an
    urgent reset."""
    _, member = current
    mem_res = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.user_id == tenant_user_id,
            OrganizationMember.role == UserRole.TENANT,
        )
    )
    if not mem_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tenant not found")

    tenant_res = await db.execute(select(User).where(User.id == tenant_user_id))
    tenant_user = tenant_res.scalar_one_or_none()
    if not tenant_user:
        raise HTTPException(status_code=404, detail="Tenant not found")

    org_res = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_res.scalar_one_or_none()
    org_name = org.name if org else "Property Copilot"

    token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    db.add(PasswordResetToken(user_id=tenant_user.id, token=token, expires_at=expires_at))
    await db.commit()

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    register_link = f"{frontend_url}/reset-password?token={token}"

    channels = set(body.channels)
    email_sent = False
    sms_sent = False
    skipped: list[str] = []

    if "email" in channels:
        if tenant_user.email:
            background_tasks.add_task(
                send_registration_link_email, tenant_user.email, register_link, tenant_user.full_name, org_name
            )
            email_sent = True
        else:
            skipped.append("email (no email on file)")

    if "sms" in channels:
        if tenant_user.phone:
            sms_body = f"{org_name} has set up your tenant portal account. Set your password: {register_link}"
            background_tasks.add_task(send_sms, tenant_user.phone, sms_body)
            sms_sent = True
        else:
            skipped.append("SMS (no phone on file)")

    if not email_sent and not sms_sent:
        raise HTTPException(status_code=400, detail="No valid channel to send to — tenant has no email/phone on file")

    return TenantRegistrationLinkOut(email_sent=email_sent, sms_sent=sms_sent, skipped_channels=skipped)


@router.get("/person/{tenant_user_id}/application", response_model=TenantApplicationOut)
async def get_tenant_application(
    tenant_user_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full rental-application detail for one tenant — used to pre-fill the Edit tenant form."""
    _, member = current
    mem_res = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.user_id == tenant_user_id,
            OrganizationMember.role == UserRole.TENANT,
        )
    )
    if not mem_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tenant not found")

    profile_res = await db.execute(select(TenantProfile).where(TenantProfile.user_id == tenant_user_id))
    profile = profile_res.scalar_one_or_none()

    async def _fetch(model):
        res = await db.execute(select(model).where(model.user_id == tenant_user_id))
        return res.scalars().all()

    return TenantApplicationOut(
        **{f: getattr(profile, f, None) for f in RENTAL_APP_PROFILE_FIELDS},
        application_status=profile.application_status if profile else "NOT_STARTED",
        interested_unit_id=str(profile.interested_unit_id) if profile and profile.interested_unit_id else None,
        address_history=[AddressHistoryIn.model_validate(a, from_attributes=True) for a in await _fetch(TenantAddressHistory)],
        employment_history=[EmploymentIn.model_validate(e, from_attributes=True) for e in await _fetch(TenantEmployment)],
        income_sources=[IncomeSourceIn.model_validate(i, from_attributes=True) for i in await _fetch(TenantIncomeSource)],
        occupants=[OccupantIn.model_validate(o, from_attributes=True) for o in await _fetch(TenantOccupant)],
        cosigners=[CosignerIn.model_validate(c, from_attributes=True) for c in await _fetch(TenantCosigner)],
        pets=[PetIn.model_validate(p, from_attributes=True) for p in await _fetch(TenantPet)],
        vehicles=[VehicleIn.model_validate(v, from_attributes=True) for v in await _fetch(TenantVehicle)],
    )


SCREENING_STATUS_LABELS = {
    "NOT_STARTED": "Not started",
    "IN_REVIEW": "In review",
    "MORE_INFO_REQUESTED": "More info requested",
    "APPROVED": "Approved",
    "DECLINED": "Declined",
}


@router.patch("/person/{tenant_user_id}/screening", response_model=TenantScreeningUpdate)
async def update_screening(
    tenant_user_id: str,
    body: TenantScreeningUpdate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    """Landlord-only screening decision: application status, interested unit, notes."""
    user, member = current
    mem_res = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.user_id == tenant_user_id,
            OrganizationMember.role == UserRole.TENANT,
        )
    )
    if not mem_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tenant not found")

    interested_unit_id = body.interested_unit_id
    if interested_unit_id:
        unit_check = await db.execute(
            select(Unit.id).join(Property, Property.id == Unit.property_id)
            .where(Unit.id == interested_unit_id, Property.organization_id == member.organization_id)
        )
        if not unit_check.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Unit not found in this organization")

    old_status = None
    if body.application_status is not None:
        profile_res = await db.execute(select(TenantProfile).where(TenantProfile.user_id == tenant_user_id))
        existing_profile = profile_res.scalar_one_or_none()
        old_status = existing_profile.application_status if existing_profile else "NOT_STARTED"

    await _upsert_tenant_profile(
        db, tenant_user_id,
        application_status=body.application_status,
        interested_unit_id=interested_unit_id,
        screening_notes=body.screening_notes,
    )

    if body.application_status is not None and body.application_status != old_status:
        old_label = SCREENING_STATUS_LABELS.get(old_status, old_status)
        new_label = SCREENING_STATUS_LABELS.get(body.application_status, body.application_status)
        db.add(TenantScreeningNote(
            user_id=tenant_user_id,
            organization_id=member.organization_id,
            author_user_id=user.id,
            author_name=user.display_name,
            note=f"Changed status from {old_label} to {new_label}",
            kind="STATUS_CHANGE",
        ))

    await db.commit()
    return body


@router.get("/person/{tenant_user_id}/notes", response_model=list[TenantScreeningNoteOut])
async def list_screening_notes(
    tenant_user_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(TenantScreeningNote)
        .where(
            TenantScreeningNote.user_id == tenant_user_id,
            TenantScreeningNote.organization_id == member.organization_id,
        )
        .order_by(TenantScreeningNote.created_at.desc())
    )
    return [
        TenantScreeningNoteOut(
            id=str(n.id), author_name=n.author_name, note=n.note, kind=n.kind,
            created_at=n.created_at.isoformat(),
        )
        for n in result.scalars().all()
    ]


@router.post("/person/{tenant_user_id}/notes", response_model=TenantScreeningNoteOut, status_code=status.HTTP_201_CREATED)
async def add_screening_note(
    tenant_user_id: str,
    body: TenantScreeningNoteIn,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    user, member = current
    mem_res = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.user_id == tenant_user_id,
            OrganizationMember.role == UserRole.TENANT,
        )
    )
    if not mem_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tenant not found")

    if not body.note.strip():
        raise HTTPException(status_code=400, detail="Note cannot be empty")

    note = TenantScreeningNote(
        user_id=tenant_user_id,
        organization_id=member.organization_id,
        author_user_id=user.id,
        author_name=user.display_name,
        note=body.note.strip(),
        kind="NOTE",
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return TenantScreeningNoteOut(
        id=str(note.id), author_name=note.author_name, note=note.note, kind=note.kind,
        created_at=note.created_at.isoformat(),
    )


@router.post(
    "/person/{tenant_user_id}/employment/{employment_id}/contact-reference",
    response_model=TenantScreeningNoteOut,
    status_code=status.HTTP_201_CREATED,
)
async def contact_employer_reference(
    tenant_user_id: str,
    employment_id: str,
    body: EmployerReferenceContactIn,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    """Send an email or SMS to an applicant's employer reference contact, and
    log it as a screening note so the outreach is visible in the activity feed."""
    user, member = current
    mem_res = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.user_id == tenant_user_id,
            OrganizationMember.role == UserRole.TENANT,
        )
    )
    if not mem_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tenant not found")

    emp_res = await db.execute(
        select(TenantEmployment).where(
            TenantEmployment.id == employment_id,
            TenantEmployment.user_id == tenant_user_id,
        )
    )
    employment = emp_res.scalar_one_or_none()
    if not employment:
        raise HTTPException(status_code=404, detail="Employment record not found")

    channel = body.channel.upper()
    reference_label = employment.employer_reference_name or "the employer reference"

    tenant_res = await db.execute(select(User).where(User.id == tenant_user_id))
    tenant_user = tenant_res.scalar_one_or_none()
    applicant_name = tenant_user.display_name if tenant_user else "the applicant"

    org_res = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_res.scalar_one_or_none()
    reply_to = (org.reference_reply_email if org else None) or user.email

    if channel == "EMAIL":
        if not employment.employer_reference_email:
            raise HTTPException(status_code=400, detail="No email on file for this reference")
        if body.subject and body.body:
            email_subject, email_body = body.subject, body.body
        else:
            org_name = org.name if org else "Property Copilot"
            greeting = f"Hi {employment.employer_reference_name}," if employment.employer_reference_name else "Hi,"
            email_subject = f"Reference check for {applicant_name}"
            email_body = (
                f"{greeting}\n\n{applicant_name} has listed you as an employer reference on a rental application "
                f"with {org_name}. When you have a moment, please reply to this email to confirm their employment details."
            )
        message_id = make_msgid()
        send_reference_letter_email(employment.employer_reference_email, email_subject, email_body, reply_to=reply_to, message_id=message_id)
        db.add(ReferenceCheckRequest(
            organization_id=member.organization_id,
            tenant_user_id=tenant_user_id,
            reference_type="EMPLOYER",
            contact_name=employment.employer_reference_name,
            contact_email=employment.employer_reference_email,
            sent_message_id=message_id,
        ))
        recipient = employment.employer_reference_email
        sent_content = f"Subject: {email_subject}\n\n{email_body}"
    elif channel == "SMS":
        if not employment.employer_reference_phone:
            raise HTTPException(status_code=400, detail="No phone number on file for this reference")
        if body.body:
            sms_body = body.body
        else:
            sms_body = (
                f"Hi {employment.employer_reference_name or ''}, {applicant_name} listed you as an "
                f"employer reference on a rental application. Please reply to confirm their employment."
            ).strip()
        send_sms(employment.employer_reference_phone, sms_body)
        recipient = employment.employer_reference_phone
        sent_content = sms_body
    else:
        raise HTTPException(status_code=400, detail="channel must be 'EMAIL' or 'SMS'")

    note = TenantScreeningNote(
        user_id=tenant_user_id,
        organization_id=member.organization_id,
        author_user_id=user.id,
        author_name=user.display_name,
        note=f"Sent {channel.lower()} to {reference_label} ({recipient}) (employer reference):\n{sent_content}",
        kind="NOTE",
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return TenantScreeningNoteOut(
        id=str(note.id), author_name=note.author_name, note=note.note, kind=note.kind,
        created_at=note.created_at.isoformat(),
    )


@router.post("/person/{tenant_user_id}/employment/{employment_id}/reference-letter", response_model=EmployerReferenceLetterOut)
async def generate_reference_letter(
    tenant_user_id: str,
    employment_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    """AI-draft a professional reference-request letter to an employer reference,
    for the landlord to review/edit before sending via the contact-reference endpoint."""
    _, member = current
    mem_res = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.user_id == tenant_user_id,
            OrganizationMember.role == UserRole.TENANT,
        )
    )
    if not mem_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tenant not found")

    emp_res = await db.execute(
        select(TenantEmployment).where(
            TenantEmployment.id == employment_id,
            TenantEmployment.user_id == tenant_user_id,
        )
    )
    employment = emp_res.scalar_one_or_none()
    if not employment:
        raise HTTPException(status_code=404, detail="Employment record not found")
    if not employment.employer_reference_email:
        raise HTTPException(status_code=400, detail="No email on file for this reference")

    tenant_res = await db.execute(select(User).where(User.id == tenant_user_id))
    tenant_user = tenant_res.scalar_one_or_none()
    applicant_name = tenant_user.display_name if tenant_user else "the applicant"

    org_res = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_res.scalar_one_or_none()
    org_name = org.name if org else "Property Copilot"

    reference_name = employment.employer_reference_name or "there"
    subject = f"Reference check for {applicant_name}"

    context_parts = [
        f"Applicant name: {applicant_name}",
        f"Employer reference name: {reference_name}",
        f"Company: {employment.company}" if employment.company else "",
        f"Applicant's position at the company: {employment.position}" if employment.position else "",
        f"Length of employment reported by applicant: {employment.employment_length}" if employment.employment_length else "",
        f"Landlord / property management organization: {org_name}",
    ]
    prompt = (
        "Write a short, professional email body (3-4 short paragraphs, no subject line) from a Canadian "
        "landlord to an applicant's employer reference, asking them to confirm the applicant's employment "
        "details (role, length of employment, and whether they are in good standing) as part of a rental "
        "application. Be polite and concise. Do not invent facts beyond what's given. Sign off as "
        f"\"{org_name}\". Use only the facts below.\n\n" + "\n".join(p for p in context_parts if p)
    )
    try:
        letter_body = generate_ai_text(prompt).strip()
    except Exception:
        letter_body = ""

    if not letter_body:
        letter_body = (
            f"Hi {reference_name},\n\n"
            f"{applicant_name} has listed you as an employer reference on a rental application with {org_name}. "
            "Could you please confirm their role, length of employment, and whether they are in good standing? "
            "Any details you can share would be greatly appreciated.\n\n"
            f"Thank you,\n{org_name}"
        )

    return EmployerReferenceLetterOut(subject=subject, body=letter_body)


@router.post(
    "/person/{tenant_user_id}/address/{address_id}/contact-reference",
    response_model=TenantScreeningNoteOut,
    status_code=status.HTTP_201_CREATED,
)
async def contact_landlord_reference(
    tenant_user_id: str,
    address_id: str,
    body: EmployerReferenceContactIn,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    """Send an email or SMS to an applicant's landlord reference contact, and
    log it as a screening note so the outreach is visible in the activity feed."""
    user, member = current
    mem_res = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.user_id == tenant_user_id,
            OrganizationMember.role == UserRole.TENANT,
        )
    )
    if not mem_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tenant not found")

    addr_res = await db.execute(
        select(TenantAddressHistory).where(
            TenantAddressHistory.id == address_id,
            TenantAddressHistory.user_id == tenant_user_id,
        )
    )
    address = addr_res.scalar_one_or_none()
    if not address:
        raise HTTPException(status_code=404, detail="Address record not found")

    channel = body.channel.upper()
    reference_label = address.landlord_name or "the landlord reference"

    tenant_res = await db.execute(select(User).where(User.id == tenant_user_id))
    tenant_user = tenant_res.scalar_one_or_none()
    applicant_name = tenant_user.display_name if tenant_user else "the applicant"

    org_res = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_res.scalar_one_or_none()
    reply_to = (org.reference_reply_email if org else None) or user.email

    if channel == "EMAIL":
        if not address.landlord_email:
            raise HTTPException(status_code=400, detail="No email on file for this reference")
        if body.subject and body.body:
            email_subject, email_body = body.subject, body.body
        else:
            org_name = org.name if org else "Property Copilot"
            greeting = f"Hi {address.landlord_name}," if address.landlord_name else "Hi,"
            email_subject = f"Reference check for {applicant_name}"
            email_body = (
                f"{greeting}\n\n{applicant_name} has listed you as a landlord reference on a rental application "
                f"with {org_name}. When you have a moment, please reply to this email to confirm their tenancy details."
            )
        message_id = make_msgid()
        send_reference_letter_email(address.landlord_email, email_subject, email_body, reply_to=reply_to, message_id=message_id)
        db.add(ReferenceCheckRequest(
            organization_id=member.organization_id,
            tenant_user_id=tenant_user_id,
            reference_type="LANDLORD",
            contact_name=address.landlord_name,
            contact_email=address.landlord_email,
            sent_message_id=message_id,
        ))
        recipient = address.landlord_email
        sent_content = f"Subject: {email_subject}\n\n{email_body}"
    elif channel == "SMS":
        if not address.landlord_phone:
            raise HTTPException(status_code=400, detail="No phone number on file for this reference")
        if body.body:
            sms_body = body.body
        else:
            sms_body = (
                f"Hi {address.landlord_name or ''}, {applicant_name} listed you as a "
                f"landlord reference on a rental application. Please reply to confirm their tenancy."
            ).strip()
        send_sms(address.landlord_phone, sms_body)
        recipient = address.landlord_phone
        sent_content = sms_body
    else:
        raise HTTPException(status_code=400, detail="channel must be 'EMAIL' or 'SMS'")

    note = TenantScreeningNote(
        user_id=tenant_user_id,
        organization_id=member.organization_id,
        author_user_id=user.id,
        author_name=user.display_name,
        note=f"Sent {channel.lower()} to {reference_label} ({recipient}) (landlord reference):\n{sent_content}",
        kind="NOTE",
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return TenantScreeningNoteOut(
        id=str(note.id), author_name=note.author_name, note=note.note, kind=note.kind,
        created_at=note.created_at.isoformat(),
    )


@router.post("/person/{tenant_user_id}/address/{address_id}/reference-letter", response_model=EmployerReferenceLetterOut)
async def generate_landlord_reference_letter(
    tenant_user_id: str,
    address_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    """AI-draft a professional reference-request letter to a landlord reference,
    for the landlord (org) to review/edit before sending via the contact-reference endpoint."""
    _, member = current
    mem_res = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.user_id == tenant_user_id,
            OrganizationMember.role == UserRole.TENANT,
        )
    )
    if not mem_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tenant not found")

    addr_res = await db.execute(
        select(TenantAddressHistory).where(
            TenantAddressHistory.id == address_id,
            TenantAddressHistory.user_id == tenant_user_id,
        )
    )
    address = addr_res.scalar_one_or_none()
    if not address:
        raise HTTPException(status_code=404, detail="Address record not found")
    if not address.landlord_email:
        raise HTTPException(status_code=400, detail="No email on file for this reference")

    tenant_res = await db.execute(select(User).where(User.id == tenant_user_id))
    tenant_user = tenant_res.scalar_one_or_none()
    applicant_name = tenant_user.display_name if tenant_user else "the applicant"

    org_res = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_res.scalar_one_or_none()
    org_name = org.name if org else "Property Copilot"

    reference_name = address.landlord_name or "there"
    subject = f"Reference check for {applicant_name}"

    context_parts = [
        f"Applicant name: {applicant_name}",
        f"Landlord reference name: {reference_name}",
        f"Address applicant rented: {address.street_address}, {address.city}" if address.street_address else "",
        f"Tenancy period: {address.move_in_date} to {address.move_out_date or 'present'}" if address.move_in_date else "",
        f"Monthly rent reported by applicant: ${address.monthly_rent:,.0f}" if address.monthly_rent else "",
        f"Property management organization requesting the check: {org_name}",
    ]
    prompt = (
        "Write a short, professional email body (3-4 short paragraphs, no subject line) from a Canadian "
        "landlord to an applicant's previous landlord reference, asking them to confirm the applicant's "
        "tenancy details (rent payment history, whether they were in good standing, and whether they'd rent "
        "to them again) as part of a rental application. Be polite and concise. Do not invent facts beyond "
        f"what's given. Sign off as \"{org_name}\". Use only the facts below.\n\n"
        + "\n".join(p for p in context_parts if p)
    )
    try:
        letter_body = generate_ai_text(prompt).strip()
    except Exception:
        letter_body = ""

    if not letter_body:
        letter_body = (
            f"Hi {reference_name},\n\n"
            f"{applicant_name} has listed you as a landlord reference on a rental application with {org_name}. "
            "Could you please confirm whether they paid rent on time, kept the unit in good condition, and whether "
            "you would rent to them again? Any details you can share would be greatly appreciated.\n\n"
            f"Thank you,\n{org_name}"
        )

    return EmployerReferenceLetterOut(subject=subject, body=letter_body)


@router.post("/person/{tenant_user_id}/ai-screen")
async def ai_screen_tenant(
    tenant_user_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    """Compute a deterministic screening score from real applicant data, plus an
    AI-written plain-language summary. The numeric score is never generated
    by the LLM — it's derived from concrete inputs so it stays explainable."""
    _, member = current
    mem_res = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.user_id == tenant_user_id,
            OrganizationMember.role == UserRole.TENANT,
        )
    )
    if not mem_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tenant not found")

    user_res = await db.execute(select(User).where(User.id == tenant_user_id))
    tenant_user = user_res.scalar_one_or_none()
    if not tenant_user:
        raise HTTPException(status_code=404, detail="Tenant not found")

    profile_res = await db.execute(select(TenantProfile).where(TenantProfile.user_id == tenant_user_id))
    profile = profile_res.scalar_one_or_none()

    employment_res = await db.execute(select(TenantEmployment).where(TenantEmployment.user_id == tenant_user_id))
    employment = employment_res.scalars().all()
    docs_res = await db.execute(select(TenantDocument).where(TenantDocument.user_id == tenant_user_id))
    documents = docs_res.scalars().all()

    unit_rent = None
    if profile and profile.interested_unit_id:
        unit_res = await db.execute(select(Unit).where(Unit.id == profile.interested_unit_id))
        unit = unit_res.scalar_one_or_none()
        if unit:
            unit_rent = float(unit.monthly_rent)

    annual_income = (profile.household_income_annual if profile else None) or (profile.personal_income_annual if profile else None)
    monthly_income = annual_income / 12 if annual_income else None
    income_ratio = (monthly_income / unit_rent) if (monthly_income and unit_rent) else None

    score = 50
    if income_ratio is not None:
        if income_ratio >= 3:
            score += 30
        elif income_ratio >= 2.5:
            score += 20
        elif income_ratio >= 2:
            score += 10
    if employment:
        score += 10
    if documents:
        score += 10
    disclosed_flags = [f for f in (profile.evicted if profile else None, profile.refused_rent if profile else None, profile.criminal_record if profile else None) if f]
    score -= 20 * len(disclosed_flags)
    score = max(0, min(100, score))

    context_parts = [
        f"Applicant: {tenant_user.display_name}",
        f"Annual income reported: ${annual_income:,.0f}" if annual_income else "No income reported.",
        f"Unit rent: ${unit_rent:,.0f}/mo, income-to-rent ratio: {income_ratio:.1f}x" if income_ratio else "No specific unit / rent to compare against.",
        f"Employment on file: {len(employment)} record(s)." if employment else "No employment history on file.",
        f"Supporting documents uploaded: {len(documents)}." if documents else "No supporting documents uploaded.",
        f"Self-disclosed flags: {', '.join(disclosed_flags) if disclosed_flags else 'none'}.",
        f"Applicant's message: {profile.personal_message}" if profile and profile.personal_message else "",
    ]
    prompt = (
        "You are helping a Canadian landlord review a rental applicant. Based ONLY on the facts below, "
        "write a short (2-3 sentence) plain-language assessment: mention income-to-rent ratio if available, "
        "document/reference completeness, and any disclosed flags. Do not invent facts. Do not suggest a "
        "numeric score. Do not comment on protected characteristics (race, family status, source of income, "
        "disability, etc.) — focus only on income, documentation, and disclosed rental history.\n\n"
        + "\n".join(p for p in context_parts if p)
    )
    try:
        verdict = generate_ai_text(prompt).strip()
    except Exception as e:
        verdict = f"AI summary unavailable: {str(e)[:200]}"

    return {"score": score, "verdict": verdict}


@router.get("/reference-email/config", response_model=ReferenceEmailConfigOut)
async def get_reference_email_config(
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    """Current org's IMAP settings for automatically checking the reference-reply
    inbox for replies. The app password is never echoed back — only whether one
    is on file."""
    _, member = current
    org_res = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_res.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return ReferenceEmailConfigOut(
        imap_host=org.reference_email_imap_host,
        imap_port=org.reference_email_imap_port,
        password_set=bool(org.reference_email_app_password),
        check_enabled=org.reference_email_check_enabled,
    )


@router.patch("/reference-email/config", response_model=ReferenceEmailConfigOut)
async def update_reference_email_config(
    body: ReferenceEmailConfigIn,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    """Save this org's IMAP host/port/app password and/or the check_enabled toggle.
    Only fields present in the request are changed; send an empty string to clear
    a credential field."""
    _, member = current
    org_res = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_res.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    data = body.model_dump(exclude_unset=True)
    if "imap_host" in data:
        org.reference_email_imap_host = data["imap_host"] or None
    if "imap_port" in data:
        org.reference_email_imap_port = data["imap_port"] or 993
    if "app_password" in data:
        org.reference_email_app_password = data["app_password"] or None
    if "check_enabled" in data:
        org.reference_email_check_enabled = bool(data["check_enabled"])

    await db.commit()
    await db.refresh(org)
    return ReferenceEmailConfigOut(
        imap_host=org.reference_email_imap_host,
        imap_port=org.reference_email_imap_port,
        password_set=bool(org.reference_email_app_password),
        check_enabled=org.reference_email_check_enabled,
    )


@router.put("/person/{tenant_user_id}", response_model=TenantOut)
async def update_person(
    tenant_user_id: str,
    body: TenantUpdate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    """Update tenant person info."""
    _, member = current
    result = await db.execute(select(User).where(User.id == tenant_user_id, User.is_active == True))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    data = body.model_dump(exclude_none=True)
    if "email" in data:
        new_email = data["email"].lower().strip()
        if new_email != tenant.email:
            existing = await db.execute(select(User).where(User.email == new_email, User.id != tenant.id))
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Email already in use")
        data["email"] = new_email
    list_data = {f: data.pop(f, []) for f in RENTAL_APP_LIST_FIELDS}
    profile_data = {f: data.pop(f, None) for f in PROFILE_FIELDS}
    rental_profile_data = {f: data.pop(f, None) for f in RENTAL_APP_PROFILE_FIELDS}
    for field, value in data.items():
        setattr(tenant, field, value)

    # The "current" entry in address_history (if the client sent one) takes priority
    # over the legacy flat address fields for the tenant's profile address.
    if "address_history" in body.model_fields_set and list_data["address_history"]:
        current_addr = next((a for a in list_data["address_history"] if a.get("is_current")), list_data["address_history"][0])
        for f in ("street_address", "city", "province", "postal_code", "country"):
            profile_data[f] = current_addr.get(f)

    combined_profile_data = {**profile_data, **rental_profile_data}
    if any(v is not None for v in combined_profile_data.values()):
        await _upsert_tenant_profile(db, tenant.id, **combined_profile_data)
    if tenant.first_name or tenant.last_name:
        tenant.full_name = " ".join(filter(None, [tenant.first_name, tenant.last_name]))

    if "address_history" in body.model_fields_set:
        await db.execute(delete(TenantAddressHistory).where(TenantAddressHistory.user_id == tenant.id))
        for a in list_data["address_history"]:
            db.add(TenantAddressHistory(user_id=tenant.id, created_at=datetime.now(timezone.utc), **a))
    if "employment_history" in body.model_fields_set:
        await db.execute(delete(TenantEmployment).where(TenantEmployment.user_id == tenant.id))
        for e in list_data["employment_history"]:
            db.add(TenantEmployment(user_id=tenant.id, created_at=datetime.now(timezone.utc), **e))
    if "income_sources" in body.model_fields_set:
        await db.execute(delete(TenantIncomeSource).where(TenantIncomeSource.user_id == tenant.id))
        for i in list_data["income_sources"]:
            db.add(TenantIncomeSource(user_id=tenant.id, created_at=datetime.now(timezone.utc), **i))
    if "occupants" in body.model_fields_set:
        await db.execute(delete(TenantOccupant).where(TenantOccupant.user_id == tenant.id))
        for o in list_data["occupants"]:
            db.add(TenantOccupant(user_id=tenant.id, created_at=datetime.now(timezone.utc), **o))
    if "cosigners" in body.model_fields_set:
        await db.execute(delete(TenantCosigner).where(TenantCosigner.user_id == tenant.id))
        for c in list_data["cosigners"]:
            db.add(TenantCosigner(user_id=tenant.id, created_at=datetime.now(timezone.utc), **c))
    if "pets" in body.model_fields_set:
        await db.execute(delete(TenantPet).where(TenantPet.user_id == tenant.id))
        for p in list_data["pets"]:
            db.add(TenantPet(user_id=tenant.id, created_at=datetime.now(timezone.utc), **p))
    if "vehicles" in body.model_fields_set:
        await db.execute(delete(TenantVehicle).where(TenantVehicle.user_id == tenant.id))
        for v in list_data["vehicles"]:
            db.add(TenantVehicle(user_id=tenant.id, created_at=datetime.now(timezone.utc), **v))

    await db.commit()
    result = await db.execute(
        select(User).where(User.id == tenant_user_id).options(selectinload(User.tenant_documents), selectinload(User.tenant_profile))
    )
    u = result.scalar_one()
    return _tenant_to_out(u, u.tenant_documents)


@router.delete("/person/{tenant_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_person(
    tenant_user_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    """Soft-deactivate a tenant person."""
    _, member = current
    result = await db.execute(select(User).where(User.id == tenant_user_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.is_active = False
    await db.commit()


# ── Avatar endpoints ───────────────────────────────────────────────────────────

AVATAR_ALLOWED = {"image/jpeg", "image/png", "image/webp"}
AVATAR_EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


async def _resolve_tenant(tenant_user_id: str, current: tuple[User, OrganizationMember], db: AsyncSession) -> User:
    user, member = current
    # Allow self-upload (tenant updating own avatar) or owner
    if str(user.id) != tenant_user_id and member.role != UserRole.OWNER:
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.execute(select(User).where(User.id == tenant_user_id, User.is_active == True))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.post("/{tenant_user_id}/avatar", response_model=TenantOut)
async def upload_avatar(
    tenant_user_id: str,
    file: UploadFile = File(...),
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _resolve_tenant(tenant_user_id, current, db)
    if file.content_type not in AVATAR_ALLOWED:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP images accepted")
    data = await file.read()
    if len(data) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_SIZE_MB} MB")
    # Delete old avatar file
    if tenant.avatar_filename:
        old = UPLOAD_DIR / tenant.avatar_filename
        try:
            old.unlink(missing_ok=True)
        except OSError:
            pass
    ext = AVATAR_EXTENSIONS.get(file.content_type, ".jpg")
    filename = f"avatar_{uuid.uuid4()}{ext}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / filename).write_bytes(data)
    tenant.avatar_filename = filename
    await db.commit()
    # Reload documents for response
    result = await db.execute(
        select(User).where(User.id == tenant_user_id)
        .options(selectinload(User.tenant_documents), selectinload(User.tenant_profile))
    )
    tenant = result.scalar_one()
    return _tenant_to_out(tenant, tenant.tenant_documents)


@router.delete("/{tenant_user_id}/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def delete_avatar(
    tenant_user_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _resolve_tenant(tenant_user_id, current, db)
    if tenant.avatar_filename:
        path = UPLOAD_DIR / tenant.avatar_filename
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        tenant.avatar_filename = None
        await db.commit()


# ── Document upload endpoints ──────────────────────────────────────────────────

@router.post("/me/documents", response_model=TenantDocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_my_document(
    doc_type: str = Query(..., pattern="^(id_document|paystub|bank_statement|other)$"),
    file: UploadFile = File(...),
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Self-service upload for a tenant's own supporting documents (rental application)."""
    user, member = current
    filename = await _save_file(file)
    doc = TenantDocument(
        user_id=user.id,
        organization_id=member.organization_id,
        doc_type=doc_type,
        filename=filename,
        original_name=file.filename or filename,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _doc_to_out(doc)


@router.post("/{tenant_user_id}/documents", response_model=TenantDocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_tenant_document(
    tenant_user_id: str,
    doc_type: str = Query(..., pattern="^(id_document|reference_letter)$"),
    file: UploadFile = File(...),
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(User).where(User.id == tenant_user_id, User.is_active == True)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    filename = await _save_file(file)
    doc = TenantDocument(
        user_id=tenant_user_id,
        organization_id=member.organization_id,
        doc_type=doc_type,
        filename=filename,
        original_name=file.filename or filename,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _doc_to_out(doc)


@router.get("/{tenant_user_id}/documents", response_model=list[TenantDocumentOut])
async def list_tenant_documents(
    tenant_user_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(TenantDocument)
        .where(
            TenantDocument.user_id == tenant_user_id,
            TenantDocument.organization_id == member.organization_id,
        )
        .order_by(TenantDocument.created_at)
    )
    return [_doc_to_out(d) for d in result.scalars().all()]


@router.delete("/{tenant_user_id}/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenant_document(
    tenant_user_id: str,
    doc_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(TenantDocument).where(
            TenantDocument.id == doc_id,
            TenantDocument.user_id == tenant_user_id,
            TenantDocument.organization_id == member.organization_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    path = UPLOAD_DIR / doc.filename
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass
    await db.delete(doc)
    await db.commit()


# ── Flat units list ────────────────────────────────────────────────────────────

@router.get("/units/available", response_model=list[UnitOut])
async def list_available_units(
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(Unit)
        .join(Property, Property.id == Unit.property_id)
        .where(Property.organization_id == member.organization_id, Property.is_active == True)
        .options(joinedload(Unit.property))
        .order_by(Property.name, Unit.unit_number)
    )
    units = result.scalars().all()
    return [
        UnitOut(
            id=u.id,
            property_id=u.property_id,
            unit_number=u.unit_number,
            bedrooms=u.bedrooms,
            bathrooms=u.bathrooms,
            square_feet=u.square_feet,
            monthly_rent=u.monthly_rent,
            status=u.status,
            property_name=u.property.name if u.property else None,
        )
        for u in units
    ]
