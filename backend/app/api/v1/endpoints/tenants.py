import os
import secrets
import uuid
import pathlib
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload, joinedload

from app.core.database import get_db
from app.core.security import hash_password
from app.api.deps import get_current_user, require_min_role
from app.models.user import User, OrganizationMember, UserRole, TenantDocument
from app.models.lease import Lease, LeaseStatus
from app.models.property import Unit, Property, UnitStatus
from app.schemas.lease import TenantCreate, TenantUpdate, TenantInvite, LeaseUpdate, LeaseOut, TenantOut, TenantDocumentOut
from app.schemas.property import UnitOut
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


def _tenant_to_out(user: User, docs: list[TenantDocument] | None = None) -> TenantOut:
    return TenantOut(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        full_name=user.display_name,
        email=user.email,
        phone=user.phone or "",
        date_of_birth=user.date_of_birth,
        avatar_url=_uploads_url(user.avatar_filename) if user.avatar_filename else None,
        street_address=user.street_address,
        city=user.city,
        province=user.province,
        postal_code=user.postal_code,
        country=user.country,
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
            selectinload(Lease.unit).selectinload(Unit.property),
        )
        .order_by(Lease.created_at.desc())
    )
    return [_lease_to_out(l) for l in result.scalars().all()]


@router.post("", response_model=LeaseOut, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    body: TenantInvite,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
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
            date_of_birth=body.date_of_birth,
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
            tenant_user.date_of_birth = body.date_of_birth

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
            selectinload(Lease.unit).selectinload(Unit.property),
        )
    )
    return _lease_to_out(result.scalar_one())


@router.put("/{lease_id}", response_model=LeaseOut)
async def update_tenant(
    lease_id: str,
    body: LeaseUpdate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(Lease).where(Lease.id == lease_id, Lease.organization_id == member.organization_id)
        .options(
            selectinload(Lease.tenant).selectinload(User.tenant_documents),
            selectinload(Lease.unit).selectinload(Unit.property),
        )
    )
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")

    # Update tenant user profile fields
    tenant_fields = {"first_name", "last_name", "phone", "date_of_birth"}
    data = body.model_dump(exclude_none=True)
    if lease.tenant:
        for field in tenant_fields:
            if field in data:
                setattr(lease.tenant, field, data.pop(field))
        if lease.tenant.first_name or lease.tenant.last_name:
            lease.tenant.full_name = " ".join(filter(None, [lease.tenant.first_name, lease.tenant.last_name]))
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
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
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
            date_of_birth=body.date_of_birth,
            hashed_password=hash_password(secrets.token_urlsafe(16)),
            **{f: getattr(body, f) for f in address_fields},
        )
        db.add(tenant_user)
        await db.flush()
    else:
        tenant_user.first_name = body.first_name
        tenant_user.last_name = body.last_name
        tenant_user.full_name = f"{body.first_name} {body.last_name}".strip()
        if body.phone:
            tenant_user.phone = body.phone
        if body.date_of_birth:
            tenant_user.date_of_birth = body.date_of_birth
        for f in address_fields:
            val = getattr(body, f)
            if val is not None:
                setattr(tenant_user, f, val)

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
        .options(selectinload(User.tenant_documents))
    )
    u = result.scalar_one()
    return _tenant_to_out(u, u.tenant_documents)


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
        .options(selectinload(User.tenant_documents))
        .order_by(User.full_name)
    )
    users = result.scalars().all()
    return [_tenant_to_out(u, u.tenant_documents) for u in users]


@router.put("/person/{tenant_user_id}", response_model=TenantOut)
async def update_person(
    tenant_user_id: str,
    body: TenantUpdate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    """Update tenant person info."""
    _, member = current
    result = await db.execute(select(User).where(User.id == tenant_user_id, User.is_active == True))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(tenant, field, value)
    if tenant.first_name or tenant.last_name:
        tenant.full_name = " ".join(filter(None, [tenant.first_name, tenant.last_name]))
    await db.commit()
    result = await db.execute(
        select(User).where(User.id == tenant_user_id).options(selectinload(User.tenant_documents))
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
    result = await db.execute(select(User).where(User.id == tenant_user_id, User.is_active == True))
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
    # Allow self-upload (tenant updating own avatar) or manager+
    if str(user.id) != tenant_user_id and member.role not in (UserRole.OWNER, UserRole.MANAGER, UserRole.AGENT):
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
        .options(selectinload(User.tenant_documents))
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

@router.post("/{tenant_user_id}/documents", response_model=TenantDocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_tenant_document(
    tenant_user_id: str,
    doc_type: str = Query(..., pattern="^(id_document|reference_letter)$"),
    file: UploadFile = File(...),
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
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
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
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
