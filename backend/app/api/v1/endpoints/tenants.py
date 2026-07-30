import os
import secrets
import uuid
import pathlib
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload, joinedload

from app.core.database import get_db
from app.core.security import hash_password
from app.api.deps import get_current_user, require_min_role
from app.models.user import User, OrganizationMember, UserRole, TenantDocument
from app.models.profiles import TenantProfile
from app.models.lease import Lease, LeaseStatus
from app.models.property import Unit, Property, UnitStatus
from app.models.tenant_application import (
    TenantAddressHistory, TenantEmployment, TenantIncomeSource,
    TenantOccupant, TenantCosigner, TenantPet, TenantVehicle,
)
from app.schemas.lease import TenantCreate, TenantUpdate, TenantInvite, LeaseUpdate, LeaseOut, TenantOut, TenantDocumentOut
from app.schemas.property import UnitOut
from app.schemas.tenant_application import (
    TenantApplicationOut, AddressHistoryIn, EmploymentIn, IncomeSourceIn,
    OccupantIn, CosignerIn, PetIn, VehicleIn,
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

@router.post("/person", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
async def create_person(
    body: TenantCreate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    """Create a tenant person record without a lease."""
    _, member = current
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
        ssn_sin=body.ssn_sin,
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

    await db.commit()
    result = await db.execute(
        select(User).where(User.id == tenant_user.id)
        .options(selectinload(User.tenant_documents), selectinload(User.tenant_profile))
    )
    u = result.scalar_one()
    return _tenant_to_out(u, u.tenant_documents)


@router.post("/ai-extract")
async def ai_extract_tenant(
    file: UploadFile = File(...),
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
):
    """Use Gemini vision to extract tenant info from an uploaded identity document."""
    import json
    import google.generativeai as genai

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="Gemini API key not configured")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB)")

    mime = file.content_type or "image/jpeg"

    # Gemini natively supports PDFs — pass through as-is
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
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")
        image_part = {"mime_type": mime, "data": content}
        response = model.generate_content([prompt, image_part])
        raw = response.text or ""
    except Exception as e:
        err_str = str(e)
        if "quota" in err_str.lower() or "429" in err_str:
            raise HTTPException(status_code=402, detail="Gemini quota exceeded — check your API key at aistudio.google.com")
        raise HTTPException(status_code=502, detail=f"Gemini error: {err_str[:200]}")

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
        address_history=[AddressHistoryIn.model_validate(a, from_attributes=True) for a in await _fetch(TenantAddressHistory)],
        employment_history=[EmploymentIn.model_validate(e, from_attributes=True) for e in await _fetch(TenantEmployment)],
        income_sources=[IncomeSourceIn.model_validate(i, from_attributes=True) for i in await _fetch(TenantIncomeSource)],
        occupants=[OccupantIn.model_validate(o, from_attributes=True) for o in await _fetch(TenantOccupant)],
        cosigners=[CosignerIn.model_validate(c, from_attributes=True) for c in await _fetch(TenantCosigner)],
        pets=[PetIn.model_validate(p, from_attributes=True) for p in await _fetch(TenantPet)],
        vehicles=[VehicleIn.model_validate(v, from_attributes=True) for v in await _fetch(TenantVehicle)],
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
