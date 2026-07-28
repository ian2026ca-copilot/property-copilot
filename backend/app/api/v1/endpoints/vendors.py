import os
import secrets
import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import hash_password
from app.api.deps import get_current_user, require_min_role
from app.models.user import User, OrganizationMember, UserRole
from app.models.maintenance import Vendor, VendorOrganization, VendorAvailability
from app.schemas.maintenance import (
    VendorCreate, VendorUpdate, VendorOut,
    VendorAvailabilityCreate, VendorAvailabilityOut,
    VendorAvailabilityAIGenerateIn, VendorAvailabilityAIGenerateOut, VendorAvailabilitySlotSuggestion,
)

router = APIRouter(prefix="/vendors", tags=["vendors"])


def _vendor_to_out(vendor: Vendor) -> VendorOut:
    import os
    base = os.getenv("FRONTEND_URL", "http://localhost:3001").replace(":3001", ":8002").replace(":3000", ":8002")
    avatar = f"{base}/uploads/{vendor.user.avatar_filename}" if vendor.user.avatar_filename else None
    return VendorOut(
        id=vendor.id,
        user_id=vendor.user_id,
        business_name=vendor.business_name,
        service_categories=vendor.service_categories or [],
        is_public=vendor.is_public,
        street_address=vendor.street_address,
        city=vendor.city,
        province=vendor.province,
        postal_code=vendor.postal_code,
        country=vendor.country,
        full_name=vendor.user.full_name,
        email=vendor.user.email,
        phone=vendor.user.phone or "",
        avatar_url=avatar,
    )


async def _get_vendor(vendor_id: str, db: AsyncSession) -> Vendor:
    res = await db.execute(
        select(Vendor).where(Vendor.id == vendor_id).options(selectinload(Vendor.user))
    )
    v = res.scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return v


# ── List vendors for org ────────────────────────────────────────────────────────

@router.get("", response_model=list[VendorOut])
async def list_vendors(
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    res = await db.execute(
        select(Vendor)
        .join(VendorOrganization, VendorOrganization.vendor_id == Vendor.id)
        .where(VendorOrganization.organization_id == member.organization_id)
        .options(selectinload(Vendor.user))
        .order_by(Vendor.business_name)
    )
    return [_vendor_to_out(v) for v in res.scalars().all()]


# ── Invite / create vendor ─────────────────────────────────────────────────────

@router.post("", response_model=VendorOut, status_code=status.HTTP_201_CREATED)
async def create_vendor(
    body: VendorCreate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current

    # Upsert user
    res = await db.execute(select(User).where(User.email == body.email))
    user = res.scalar_one_or_none()
    if not user:
        user = User(
            email=body.email,
            full_name=body.full_name,
            first_name=body.full_name.split()[0] if body.full_name else "",
            last_name=" ".join(body.full_name.split()[1:]) if body.full_name else "",
            phone=body.phone,
            hashed_password=hash_password(secrets.token_urlsafe(16)),
        )
        db.add(user)
        await db.flush()

    # Add VENDOR org membership
    mem_res = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.user_id == user.id,
        )
    )
    if not mem_res.scalar_one_or_none():
        db.add(OrganizationMember(
            organization_id=member.organization_id,
            user_id=user.id,
            role=UserRole.VENDOR,
        ))

    # Upsert vendor profile
    address_fields = ("street_address", "city", "province", "postal_code", "country")
    v_res = await db.execute(select(Vendor).where(Vendor.user_id == user.id))
    vendor = v_res.scalar_one_or_none()
    if not vendor:
        vendor = Vendor(
            user_id=user.id,
            business_name=body.business_name,
            service_categories=body.service_categories,
            is_public=body.is_public,
            **{f: getattr(body, f) for f in address_fields},
        )
        db.add(vendor)
        await db.flush()
    else:
        # A private vendor only works for the organization that added them —
        # block any other organization from linking to this same vendor record.
        if not vendor.is_public:
            other_link_res = await db.execute(
                select(VendorOrganization).where(
                    VendorOrganization.vendor_id == vendor.id,
                    VendorOrganization.organization_id != member.organization_id,
                )
            )
            if other_link_res.scalar_one_or_none():
                raise HTTPException(status_code=403, detail="This vendor is private and cannot be added to another organization")
        vendor.business_name = body.business_name
        vendor.service_categories = body.service_categories
        for f in address_fields:
            val = getattr(body, f)
            if val is not None:
                setattr(vendor, f, val)

    # Link vendor to org
    link_res = await db.execute(
        select(VendorOrganization).where(
            VendorOrganization.vendor_id == vendor.id,
            VendorOrganization.organization_id == member.organization_id,
        )
    )
    if not link_res.scalar_one_or_none():
        db.add(VendorOrganization(
            vendor_id=vendor.id,
            organization_id=member.organization_id,
        ))

    await db.commit()
    return _vendor_to_out(await _get_vendor(str(vendor.id), db))


# ── Update vendor ──────────────────────────────────────────────────────────────

@router.put("/{vendor_id}", response_model=VendorOut)
async def update_vendor(
    vendor_id: str,
    body: VendorUpdate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    vendor = await _get_vendor(vendor_id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        if field == "phone":
            vendor.user.phone = value
        else:
            setattr(vendor, field, value)
    await db.commit()
    return _vendor_to_out(await _get_vendor(vendor_id, db))


# ── Remove vendor from org ─────────────────────────────────────────────────────

@router.delete("/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_vendor(
    vendor_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    vendor = await _get_vendor(vendor_id, db)
    res = await db.execute(
        select(VendorOrganization).where(
            VendorOrganization.vendor_id == vendor.id,
            VendorOrganization.organization_id == member.organization_id,
        )
    )
    link = res.scalar_one_or_none()
    if link:
        await db.delete(link)
        await db.commit()


# ── Vendor availability ────────────────────────────────────────────────────────

@router.get("/{vendor_id}/availability", response_model=list[VendorAvailabilityOut])
async def list_availability(
    vendor_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    vendor = await _get_vendor(vendor_id, db)
    res = await db.execute(
        select(VendorAvailability)
        .where(VendorAvailability.vendor_id == vendor.id)
        .order_by(VendorAvailability.date, VendorAvailability.start_time)
    )
    return res.scalars().all()


@router.post("/{vendor_id}/availability/ai-generate", response_model=VendorAvailabilityAIGenerateOut)
async def ai_generate_availability(
    vendor_id: str,
    body: VendorAvailabilityAIGenerateIn,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Use Gemini to turn a free-text availability description into proposed slots for review."""
    import json
    import google.generativeai as genai

    user, member = current
    vendor = await _get_vendor(vendor_id, db)
    if member.role == UserRole.VENDOR and str(vendor.user_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    if not body.description or not body.description.strip():
        raise HTTPException(status_code=400, detail="Describe your availability first")

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="Gemini API key not configured")

    today = date.today()
    start = body.start_date or today
    end = body.end_date or (start + timedelta(days=13))

    prompt = (
        "You are a scheduling assistant helping a maintenance vendor set their availability calendar.\n"
        f"Today's date is {today.isoformat()} ({today.strftime('%A')}).\n"
        f"Generate availability slots between {start.isoformat()} and {end.isoformat()} (inclusive) based on "
        f"this description from the vendor:\n\"{body.description.strip()}\"\n\n"
        "Return ONLY a JSON object with this exact shape:\n"
        "{\"slots\": [{\"date\": \"YYYY-MM-DD\", \"start_time\": \"HH:MM\", \"end_time\": \"HH:MM\"}, ...]}\n"
        "Rules:\n"
        "- Only include dates within the given range.\n"
        "- Use 24-hour HH:MM time format.\n"
        "- If the description mentions specific days of the week (e.g. weekdays, Mondays, weekends), only "
        "generate slots on matching dates.\n"
        "- If the description excludes a specific date or day, do not create a slot for it.\n"
        "- Keep slot times reasonable (between 06:00 and 20:00) unless the description says otherwise.\n"
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

    slots: list[VendorAvailabilitySlotSuggestion] = []
    for s in data.get("slots", []):
        try:
            slots.append(VendorAvailabilitySlotSuggestion(date=s["date"], start_time=s["start_time"], end_time=s["end_time"]))
        except Exception:
            continue

    return VendorAvailabilityAIGenerateOut(slots=slots)


@router.post("/{vendor_id}/availability", response_model=VendorAvailabilityOut, status_code=status.HTTP_201_CREATED)
async def add_availability(
    vendor_id: str,
    body: VendorAvailabilityCreate,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, member = current
    vendor = await _get_vendor(vendor_id, db)

    # Vendor can only edit own availability; managers can edit any
    if member.role == UserRole.VENDOR and str(vendor.user_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    slot = VendorAvailability(
        vendor_id=vendor.id,
        date=body.date,
        start_time=body.start_time,
        end_time=body.end_time,
    )
    db.add(slot)
    await db.commit()
    await db.refresh(slot)
    return slot


@router.patch("/{vendor_id}/availability/{slot_id}", response_model=VendorAvailabilityOut)
async def update_availability(
    vendor_id: str,
    slot_id: str,
    body: VendorAvailabilityCreate,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, member = current
    vendor = await _get_vendor(vendor_id, db)

    if member.role == UserRole.VENDOR and str(vendor.user_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    res = await db.execute(
        select(VendorAvailability).where(
            VendorAvailability.id == slot_id,
            VendorAvailability.vendor_id == vendor.id,
        )
    )
    slot = res.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="Availability slot not found")

    slot.date = body.date
    slot.start_time = body.start_time
    slot.end_time = body.end_time
    await db.commit()
    await db.refresh(slot)
    return slot


@router.delete("/{vendor_id}/availability/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_availability(
    vendor_id: str,
    slot_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, member = current
    vendor = await _get_vendor(vendor_id, db)

    if member.role == UserRole.VENDOR and str(vendor.user_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    res = await db.execute(
        select(VendorAvailability).where(
            VendorAvailability.id == slot_id,
            VendorAvailability.vendor_id == vendor.id,
        )
    )
    slot = res.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    await db.delete(slot)
    await db.commit()


# ── Vendor self-profile (for vendor portal) ────────────────────────────────────

@router.get("/me/profile", response_model=VendorOut)
async def vendor_me(
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, _ = current
    res = await db.execute(
        select(Vendor).where(Vendor.user_id == user.id).options(selectinload(Vendor.user))
    )
    vendor = res.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor profile not found")
    return _vendor_to_out(vendor)
