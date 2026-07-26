import os
import uuid
import pathlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user, require_min_role
from app.models.user import User, OrganizationMember, UserRole
from app.models.maintenance import (
    MaintenanceRequest, MaintenanceAttachment, MaintenanceNote, MaintenanceStatus, MaintenancePaymentStatus, Vendor, VendorAvailability
)
from app.models.property import Unit, Property
from app.schemas.maintenance import (
    MaintenanceCreate, MaintenanceReview, MaintenanceSchedule, MaintenanceUpdate,
    MaintenanceOut, AttachmentOut, MaintenanceNoteOut, MaintenanceNoteCreate,
    MaintenanceAIGenerateIn, MaintenanceAIGenerateOut,
)

router = APIRouter(prefix="/maintenance", tags=["maintenance"])

UPLOAD_DIR = pathlib.Path("/app/uploads/maintenance")
MAX_SIZE_MB = 20
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}


def _uploads_url(filename: str) -> str:
    base = os.getenv("FRONTEND_URL", "http://localhost:3001").replace(":3001", ":8002").replace(":3000", ":8002")
    return f"{base}/uploads/maintenance/{filename}"


def _att_to_out(a: MaintenanceAttachment) -> AttachmentOut:
    return AttachmentOut(id=a.id, filename=a.filename, original_name=a.original_name, url=_uploads_url(a.filename))


STATUS_LABEL = {
    MaintenanceStatus.SUBMITTED: "Submitted",
    MaintenanceStatus.UNDER_REVIEW: "Under Review",
    MaintenanceStatus.SCHEDULED: "Scheduled",
    MaintenanceStatus.IN_PROGRESS: "In Progress",
    MaintenanceStatus.COMPLETED: "Completed",
    MaintenanceStatus.CLOSED: "Closed",
    MaintenanceStatus.CANCELLED: "Cancelled",
}


def _note_to_out(n: MaintenanceNote) -> MaintenanceNoteOut:
    return MaintenanceNoteOut(
        id=n.id,
        note=n.note,
        author_name=n.author.full_name if n.author else "Unknown",
        author_user_id=n.author_user_id,
        created_at=n.created_at,
    )


def _avatar_url(user: User) -> str | None:
    if not user.avatar_filename:
        return None
    base = os.getenv("FRONTEND_URL", "http://localhost:3001").replace(":3001", ":8002").replace(":3000", ":8002")
    return f"{base}/uploads/{user.avatar_filename}"


def _to_out(req: MaintenanceRequest) -> MaintenanceOut:
    return MaintenanceOut(
        id=req.id,
        unit_id=req.unit_id,
        title=req.title,
        description=req.description,
        category=req.category,
        priority=req.priority,
        status=req.status,
        assignee_name=req.assignee_name,
        price=req.price,
        tax=req.tax,
        total=req.total,
        payment_status=req.payment_status,
        submitted_by_name=req.submitted_by.full_name if req.submitted_by else None,
        submitted_by_user_id=req.submitted_by_user_id,
        tenant_email=req.submitted_by.email if req.submitted_by else None,
        tenant_phone=getattr(req.submitted_by, "phone", None) if req.submitted_by else None,
        unit_number=req.unit.unit_number if req.unit else None,
        property_name=req.unit.property.name if req.unit and req.unit.property else None,
        created_at=req.created_at.isoformat() if req.created_at else None,
        preferred_time_start=req.preferred_time_start,
        preferred_time_end=req.preferred_time_end,
        est_hours_min=req.est_hours_min,
        est_hours_max=req.est_hours_max,
        est_cost_min=req.est_cost_min,
        est_cost_max=req.est_cost_max,
        vendor_id=req.vendor_id,
        vendor_name=req.vendor.full_name if req.vendor else None,
        scheduled_start=req.scheduled_start,
        scheduled_end=req.scheduled_end,
        attachments=[_att_to_out(a) for a in (req.attachments or [])],
        notes=[_note_to_out(n) for n in (req.notes or [])],
    )


async def _get_req(request_id: str, org_id: uuid.UUID, db: AsyncSession) -> MaintenanceRequest:
    # populate_existing forces relationships to be re-fetched even if this request/org
    # was already loaded earlier in the same session (e.g. re-fetched after a write) —
    # without it, already-loaded collections like notes/attachments go stale.
    result = await db.execute(
        select(MaintenanceRequest)
        .where(MaintenanceRequest.id == request_id, MaintenanceRequest.organization_id == org_id)
        .options(
            selectinload(MaintenanceRequest.submitted_by),
            selectinload(MaintenanceRequest.vendor),
            selectinload(MaintenanceRequest.unit).selectinload(Unit.property),
            selectinload(MaintenanceRequest.attachments),
            selectinload(MaintenanceRequest.notes).selectinload(MaintenanceNote.author),
        )
        .execution_options(populate_existing=True)
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return req


# ── List ───────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[MaintenanceOut])
async def list_requests(
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, member = current
    q = select(MaintenanceRequest).where(MaintenanceRequest.organization_id == member.organization_id)
    # Tenants only see their own
    if member.role == UserRole.TENANT:
        q = q.where(MaintenanceRequest.submitted_by_user_id == user.id)
    result = await db.execute(
        q.options(
            selectinload(MaintenanceRequest.submitted_by),
            selectinload(MaintenanceRequest.vendor),
            selectinload(MaintenanceRequest.unit).selectinload(Unit.property),
            selectinload(MaintenanceRequest.attachments),
            selectinload(MaintenanceRequest.notes).selectinload(MaintenanceNote.author),
        ).order_by(MaintenanceRequest.created_at.desc())
    )
    return [_to_out(r) for r in result.scalars().all()]


# ── Create (tenant or manager) ─────────────────────────────────────────────────

@router.post("", response_model=MaintenanceOut, status_code=status.HTTP_201_CREATED)
async def create_request(
    body: MaintenanceCreate,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, member = current

    # Verify unit belongs to org
    unit_res = await db.execute(
        select(Unit).join(Property).where(
            Unit.id == body.unit_id,
            Property.organization_id == member.organization_id,
            Property.is_active == True,
        )
    )
    if not unit_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Unit not found")

    req = MaintenanceRequest(
        organization_id=member.organization_id,
        submitted_by_user_id=user.id,
        unit_id=body.unit_id,
        title=body.title,
        description=body.description,
        category=body.category,
        priority=body.priority,
        status=MaintenanceStatus.SUBMITTED,
        price=body.price,
        tax=body.tax,
        total=body.total,
        payment_status=body.payment_status,
        preferred_time_start=body.preferred_time_start,
        preferred_time_end=body.preferred_time_end,
    )
    db.add(req)
    await db.commit()
    return _to_out(await _get_req(str(req.id), member.organization_id, db))


# ── AI generate ────────────────────────────────────────────────────────────────

@router.post("/ai-generate", response_model=MaintenanceAIGenerateOut)
async def ai_generate_request(
    body: MaintenanceAIGenerateIn,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Use Gemini to draft a maintenance request title and description."""
    import json
    import google.generativeai as genai

    _, member = current

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="Gemini API key not configured")

    unit_details = ""
    if body.unit_id:
        result = await db.execute(
            select(Unit).join(Property).where(
                Unit.id == body.unit_id,
                Property.organization_id == member.organization_id,
            )
            .options(selectinload(Unit.property))
        )
        unit = result.scalar_one_or_none()
        if not unit:
            raise HTTPException(status_code=404, detail="Unit not found")
        prop = unit.property
        unit_details = (
            f"UNIT DETAILS:\n"
            f"Unit Number: {unit.unit_number}\n"
            f"Bedrooms: {unit.bedrooms}\n"
            f"Bathrooms: {unit.bathrooms}\n"
            + (
                f"Property Name: {prop.name}\n"
                f"Address: {prop.address}, {prop.city}, {prop.state} {prop.zip_code}\n"
                if prop else ""
            )
        )

    if not unit_details and not body.category and not body.priority and not body.extra_instructions:
        raise HTTPException(status_code=400, detail="Select a unit or category first")

    prompt = (
        "You are drafting a maintenance request for a rental property management system.\n\n"
        + (unit_details or "No specific unit was selected.\n")
        + (f"Category: {body.category}\n" if body.category else "")
        + (f"Priority: {body.priority.value if hasattr(body.priority, 'value') else body.priority}\n" if body.priority else "")
        + (f"\nADDITIONAL INSTRUCTIONS FROM THE REQUESTER:\n{body.extra_instructions}\n" if body.extra_instructions else "")
        + "\nReturn ONLY a JSON object with these exact keys:\n"
        "title (a short, specific maintenance request title, under 80 characters),\n"
        "description (1-2 short paragraphs describing the likely issue and what a vendor should check/bring, "
        "plain text, no markdown).\n"
        "Since no photos or firsthand details were provided, write a plausible, generic-but-useful description "
        "for this category/priority — do not invent specific brand names or overly specific claims.\n"
        "No explanation, no markdown fences, just the JSON object."
    )

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(prompt)
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

    return MaintenanceAIGenerateOut(
        title=data.get("title") or "",
        description=data.get("description") or "",
    )


# ── Get one ────────────────────────────────────────────────────────────────────

@router.get("/{request_id}", response_model=MaintenanceOut)
async def get_request(
    request_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    return _to_out(await _get_req(request_id, member.organization_id, db))


# ── General update (status, priority, notes) ───────────────────────────────────

@router.patch("/{request_id}", response_model=MaintenanceOut)
async def update_request(
    request_id: str,
    body: MaintenanceUpdate,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, member = current
    req = await _get_req(request_id, member.organization_id, db)

    updates = body.model_dump(exclude_none=True)
    if "unit_id" in updates:
        unit_res = await db.execute(
            select(Unit).join(Property).where(
                Unit.id == updates["unit_id"],
                Property.organization_id == member.organization_id,
                Property.is_active == True,
            )
        )
        if not unit_res.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Unit not found")

    if "vendor_id" in updates and updates["vendor_id"] != req.vendor_id:
        vendor_res = await db.execute(
            select(Vendor).options(selectinload(Vendor.user)).where(Vendor.user_id == updates["vendor_id"])
        )
        vendor = vendor_res.scalar_one_or_none()
        if not vendor:
            raise HTTPException(status_code=404, detail="Vendor not found")
        old_vendor_name = req.vendor.full_name if req.vendor else None
        note_text = (
            f"Vendor changed from {old_vendor_name} to {vendor.user.full_name}" if old_vendor_name
            else f"Assigned vendor: {vendor.user.full_name}"
        )
        db.add(MaintenanceNote(
            request_id=req.id,
            author_user_id=user.id,
            note=note_text,
            created_at=datetime.now(timezone.utc),
        ))

    if "status" in updates and updates["status"] != req.status:
        old_label = STATUS_LABEL.get(req.status, req.status.value)
        new_label = STATUS_LABEL.get(updates["status"], updates["status"].value)
        db.add(MaintenanceNote(
            request_id=req.id,
            author_user_id=user.id,
            note=f"Status changed from {old_label} to {new_label}",
            created_at=datetime.now(timezone.utc),
        ))

    for field, value in updates.items():
        setattr(req, field, value)
    await db.commit()
    return _to_out(await _get_req(request_id, member.organization_id, db))


# ── Delete ─────────────────────────────────────────────────────────────────────

@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_request(
    request_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    req = await _get_req(request_id, member.organization_id, db)
    await db.delete(req)
    await db.commit()


# ── Review / estimate (manager+) ───────────────────────────────────────────────

@router.put("/{request_id}/review", response_model=MaintenanceOut)
async def review_request(
    request_id: str,
    body: MaintenanceReview,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    req = await _get_req(request_id, member.organization_id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(req, field, value)
    if req.status == MaintenanceStatus.SUBMITTED:
        req.status = MaintenanceStatus.UNDER_REVIEW
    await db.commit()
    return _to_out(await _get_req(request_id, member.organization_id, db))


# ── Schedule with vendor (manager+) ───────────────────────────────────────────

@router.put("/{request_id}/schedule", response_model=MaintenanceOut)
async def schedule_request(
    request_id: str,
    body: MaintenanceSchedule,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    req = await _get_req(request_id, member.organization_id, db)

    # Verify vendor is linked to this org
    vendor_res = await db.execute(
        select(Vendor).where(Vendor.user_id == body.vendor_id)
    )
    vendor = vendor_res.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    req.vendor_id = body.vendor_id
    req.scheduled_start = body.scheduled_start
    req.scheduled_end = body.scheduled_end
    # Only advance to SCHEDULED; never downgrade from a later status (e.g. IN_PROGRESS)
    _STATUS_ORDER = [s.value for s in MaintenanceStatus]
    if _STATUS_ORDER.index(req.status.value) < _STATUS_ORDER.index(MaintenanceStatus.SCHEDULED.value):
        req.status = MaintenanceStatus.SCHEDULED

    # Remove booked availability slot if provided
    if body.availability_id:
        slot_res = await db.execute(
            select(VendorAvailability).where(VendorAvailability.id == body.availability_id)
        )
        slot = slot_res.scalar_one_or_none()
        if slot:
            await db.delete(slot)

    await db.commit()
    # Placeholder notification
    print(f"[NOTIFY] Vendor {body.vendor_id} scheduled for request {request_id} at {body.scheduled_start}")
    return _to_out(await _get_req(request_id, member.organization_id, db))


# ── Photo upload ───────────────────────────────────────────────────────────────

@router.post("/{request_id}/attachments", response_model=MaintenanceOut, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    request_id: str,
    file: UploadFile = File(...),
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    req = await _get_req(request_id, member.organization_id, db)

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, PDF accepted")
    data = await file.read()
    if len(data) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_SIZE_MB} MB")

    ext = pathlib.Path(file.filename or "file").suffix or ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / filename).write_bytes(data)

    att = MaintenanceAttachment(
        request_id=req.id,
        filename=filename,
        original_name=file.filename or filename,
    )
    db.add(att)
    await db.commit()
    return _to_out(await _get_req(request_id, member.organization_id, db))


# ── Vendor: list own assigned jobs ────────────────────────────────────────────

@router.get("/assigned/me", response_model=list[MaintenanceOut])
async def list_assigned_to_me(
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, member = current
    result = await db.execute(
        select(MaintenanceRequest)
        .where(
            MaintenanceRequest.organization_id == member.organization_id,
            MaintenanceRequest.vendor_id == user.id,
        )
        .options(
            selectinload(MaintenanceRequest.submitted_by),
            selectinload(MaintenanceRequest.vendor),
            selectinload(MaintenanceRequest.unit).selectinload(Unit.property),
            selectinload(MaintenanceRequest.attachments),
            selectinload(MaintenanceRequest.notes).selectinload(MaintenanceNote.author),
        )
        .order_by(MaintenanceRequest.scheduled_start)
    )
    return [_to_out(r) for r in result.scalars().all()]


@router.delete("/{request_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    request_id: str,
    attachment_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    await _get_req(request_id, member.organization_id, db)
    res = await db.execute(
        select(MaintenanceAttachment).where(
            MaintenanceAttachment.id == attachment_id,
            MaintenanceAttachment.request_id == request_id,
        )
    )
    att = res.scalar_one_or_none()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    try:
        (UPLOAD_DIR / att.filename).unlink(missing_ok=True)
    except OSError:
        pass
    await db.delete(att)
    await db.commit()


# ── Notes ──────────────────────────────────────────────────────────────────────

@router.post("/{request_id}/notes", response_model=MaintenanceOut, status_code=status.HTTP_201_CREATED)
async def add_note(
    request_id: str,
    body: MaintenanceNoteCreate,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, member = current
    req = await _get_req(request_id, member.organization_id, db)
    db.add(MaintenanceNote(request_id=req.id, author_user_id=user.id, note=body.note, created_at=datetime.now(timezone.utc)))
    await db.commit()
    return _to_out(await _get_req(request_id, member.organization_id, db))


@router.delete("/{request_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    request_id: str,
    note_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, member = current
    req = await _get_req(request_id, member.organization_id, db)
    note = next((n for n in req.notes if str(n.id) == note_id), None)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.author_user_id != user.id and member.role != UserRole.OWNER:
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.delete(note)
    await db.commit()
