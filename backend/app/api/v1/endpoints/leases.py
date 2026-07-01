import os
import uuid
import pathlib
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user, require_min_role
from app.models.user import User, OrganizationMember, UserRole, TenantDocument
from app.models.lease import Lease, LeaseStatus, LeaseType
from app.models.property import Unit, Property, UnitStatus
from app.schemas.lease import LeaseCreate, LeaseUpdate, LeaseRenew, LeaseOut, TenantOut, TenantDocumentOut
from app.api.v1.endpoints.payments import generate_monthly_payments

router = APIRouter(prefix="/leases", tags=["leases"])

UPLOAD_DIR = pathlib.Path("/app/uploads")
LEASE_DOC_DIR = UPLOAD_DIR / "leases"
MAX_SIZE_MB = 50
ALLOWED_DOC_TYPES = {"application/pdf", "image/jpeg", "image/png"}


def _uploads_url(filename: str) -> str:
    base = os.getenv("FRONTEND_URL", "http://localhost:3001").replace(":3001", ":8002").replace(":3000", ":8002")
    return f"{base}/uploads/{filename}"


def _doc_url(path: str) -> str:
    """Convert a stored document_path to a public URL."""
    base = os.getenv("FRONTEND_URL", "http://localhost:3001").replace(":3001", ":8002").replace(":3000", ":8002")
    return f"{base}/uploads/{path}"


def _compute_status_from_dates(start_date: date, end_date: date) -> LeaseStatus:
    today = date.today()
    if start_date > today:
        return LeaseStatus.PENDING
    if end_date < today:
        return LeaseStatus.EXPIRED
    return LeaseStatus.ACTIVE


def _effective_status(lease: Lease) -> LeaseStatus:
    """Return stored status directly — status is computed on create/date-update."""
    return lease.status


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
        documents=[
            TenantDocumentOut(
                id=d.id,
                doc_type=d.doc_type,
                filename=d.filename,
                original_name=d.original_name,
                url=_uploads_url(d.filename),
            )
            for d in (docs or [])
        ],
    )


def _lease_to_out(lease: Lease) -> LeaseOut:
    docs = list(lease.tenant.tenant_documents) if lease.tenant and hasattr(lease.tenant, "tenant_documents") else []
    doc_url = _doc_url(lease.document_path) if lease.document_path else None
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
        document_url=doc_url,
        notes=lease.notes,
        tenant=_tenant_to_out(lease.tenant, docs) if lease.tenant else None,
        unit_number=lease.unit.unit_number if lease.unit else None,
        property_name=lease.unit.property.name if lease.unit and lease.unit.property else None,
    )


async def _get_lease(lease_id: str, org_id: uuid.UUID, db: AsyncSession) -> Lease:
    result = await db.execute(
        select(Lease)
        .where(Lease.id == lease_id, Lease.organization_id == org_id)
        .options(
            selectinload(Lease.tenant).selectinload(User.tenant_documents),
            selectinload(Lease.unit).selectinload(Unit.property),
        )
    )
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")
    return lease


# ── List ───────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[LeaseOut])
async def list_leases(
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(Lease)
        .where(Lease.organization_id == member.organization_id)
        .options(
            selectinload(Lease.tenant).selectinload(User.tenant_documents),
            selectinload(Lease.unit).selectinload(Unit.property),
        )
        .order_by(Lease.created_at.desc())
    )
    return [_lease_to_out(l) for l in result.scalars().all()]


# ── Create ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=LeaseOut, status_code=status.HTTP_201_CREATED)
async def create_lease(
    body: LeaseCreate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current

    # Verify tenant exists
    tenant_result = await db.execute(select(User).where(User.id == body.tenant_user_id, User.is_active == True))
    if not tenant_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Verify unit belongs to org
    unit_result = await db.execute(
        select(Unit).join(Property).where(
            Unit.id == body.unit_id,
            Property.organization_id == member.organization_id,
            Property.is_active == True,
        )
    )
    unit = unit_result.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    lease = Lease(
        organization_id=member.organization_id,
        unit_id=body.unit_id,
        tenant_user_id=body.tenant_user_id,
        start_date=body.start_date,
        end_date=body.end_date,
        monthly_rent=body.monthly_rent,
        security_deposit=body.security_deposit,
        lease_type=body.lease_type,
        notes=body.notes,
        status=_compute_status_from_dates(body.start_date, body.end_date),
    )
    db.add(lease)
    await db.flush()

    # Mark unit occupied if lease is active
    if lease.status == LeaseStatus.ACTIVE:
        unit.status = UnitStatus.OCCUPIED

    # Generate monthly rent payments
    monthly_payments = generate_monthly_payments(lease, member.organization_id)
    for p in monthly_payments:
        db.add(p)

    await db.commit()
    return _lease_to_out(await _get_lease(str(lease.id), member.organization_id, db))


# ── Read one ───────────────────────────────────────────────────────────────────

@router.get("/{lease_id}", response_model=LeaseOut)
async def get_lease(
    lease_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    return _lease_to_out(await _get_lease(lease_id, member.organization_id, db))


# ── Update ─────────────────────────────────────────────────────────────────────

@router.put("/{lease_id}", response_model=LeaseOut)
async def update_lease(
    lease_id: str,
    body: LeaseUpdate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    lease = await _get_lease(lease_id, member.organization_id, db)

    data = body.model_dump(exclude_none=True)
    tenant_fields = {"first_name", "last_name", "phone", "date_of_birth"}

    if lease.tenant:
        for f in tenant_fields:
            if f in data:
                setattr(lease.tenant, f, data.pop(f))
        if lease.tenant.first_name or lease.tenant.last_name:
            lease.tenant.full_name = " ".join(filter(None, [lease.tenant.first_name, lease.tenant.last_name]))
    else:
        for f in tenant_fields:
            data.pop(f, None)

    # If no explicit status override, recompute from dates when dates change
    date_changed = "start_date" in data or "end_date" in data
    explicit_status = "status" in data

    for field, value in data.items():
        setattr(lease, field, value)

    if not explicit_status and date_changed and lease.status != LeaseStatus.TERMINATED:
        lease.status = _compute_status_from_dates(lease.start_date, lease.end_date)

    # Sync unit status based on effective lease status
    if lease.unit:
        if lease.status == LeaseStatus.ACTIVE:
            lease.unit.status = UnitStatus.OCCUPIED
        elif lease.status == LeaseStatus.TERMINATED:
            lease.unit.status = UnitStatus.VACANT

    await db.commit()
    return _lease_to_out(await _get_lease(lease_id, member.organization_id, db))


# ── Terminate ──────────────────────────────────────────────────────────────────

@router.delete("/{lease_id}", status_code=status.HTTP_204_NO_CONTENT)
async def terminate_lease(
    lease_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
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

    # Restore unit to vacant if no other active lease
    other = await db.execute(
        select(Lease).where(
            Lease.unit_id == lease.unit_id,
            Lease.id != lease.id,
            Lease.status.in_([LeaseStatus.ACTIVE, LeaseStatus.PENDING]),
        )
    )
    if not other.scalar_one_or_none():
        unit_res = await db.execute(select(Unit).where(Unit.id == lease.unit_id))
        unit = unit_res.scalar_one_or_none()
        if unit:
            unit.status = UnitStatus.VACANT

    await db.commit()


# ── Renew ──────────────────────────────────────────────────────────────────────

@router.post("/{lease_id}/renew", response_model=LeaseOut, status_code=status.HTTP_201_CREATED)
async def renew_lease(
    lease_id: str,
    body: LeaseRenew,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    old = await _get_lease(lease_id, member.organization_id, db)

    # Terminate old lease
    old.status = LeaseStatus.TERMINATED

    new_lease = Lease(
        organization_id=member.organization_id,
        unit_id=old.unit_id,
        tenant_user_id=old.tenant_user_id,
        start_date=body.start_date,
        end_date=body.end_date,
        monthly_rent=body.monthly_rent if body.monthly_rent is not None else old.monthly_rent,
        security_deposit=old.security_deposit,
        lease_type=body.lease_type if body.lease_type is not None else old.lease_type,
        notes=old.notes,
        status=_compute_status_from_dates(body.start_date, body.end_date),
    )
    db.add(new_lease)
    await db.flush()

    monthly_payments = generate_monthly_payments(new_lease, member.organization_id)
    for p in monthly_payments:
        db.add(p)

    await db.commit()
    return _lease_to_out(await _get_lease(str(new_lease.id), member.organization_id, db))


# ── Document upload / download ─────────────────────────────────────────────────

@router.post("/{lease_id}/document", response_model=LeaseOut)
async def upload_lease_document(
    lease_id: str,
    file: UploadFile = File(...),
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    lease = await _get_lease(lease_id, member.organization_id, db)

    if file.content_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail="Only PDF, JPEG, or PNG files accepted")

    data = await file.read()
    if len(data) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_SIZE_MB} MB limit")

    # Delete old document
    if lease.document_path:
        old_path = UPLOAD_DIR / lease.document_path
        try:
            old_path.unlink(missing_ok=True)
        except OSError:
            pass

    ext = pathlib.Path(file.filename or "file").suffix or ".pdf"
    filename = f"leases/lease_{lease.id}_{uuid.uuid4()}{ext}"
    LEASE_DOC_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / filename).write_bytes(data)
    lease.document_path = filename

    await db.commit()
    return _lease_to_out(await _get_lease(lease_id, member.organization_id, db))


@router.get("/{lease_id}/document")
async def download_lease_document(
    lease_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    lease = await _get_lease(lease_id, member.organization_id, db)
    if not lease.document_path:
        raise HTTPException(status_code=404, detail="No document uploaded for this lease")
    file_path = UPLOAD_DIR / lease.document_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Document file not found")
    return FileResponse(path=str(file_path), media_type="application/octet-stream", filename=file_path.name)
