import os
import uuid
import pathlib
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user, require_min_role
from app.models.user import User, OrganizationMember, UserRole
from app.models.campaign import Campaign, CampaignStatus
from app.models.organization import Organization
from app.models.property import Unit  # noqa: F401
from app.schemas.campaign import CampaignCreate, CampaignUpdate, CampaignOut, OrgFbSettingsUpdate, OrgFbSettingsOut

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

UPLOAD_DIR = pathlib.Path("/app/uploads/campaigns")
MAX_SIZE_MB = 20
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _photo_url(filename: str) -> str:
    base = os.getenv("FRONTEND_URL", "http://localhost:3001").replace(":3001", ":8002").replace(":3000", ":8002")
    return f"{base}/uploads/campaigns/{filename}"


def _to_out(c: Campaign) -> CampaignOut:
    unit_number = c.unit.unit_number if c.unit else None
    property_name = c.unit.property.name if c.unit and c.unit.property else None
    property_address = c.unit.property.address if c.unit and c.unit.property else None
    return CampaignOut(
        id=c.id,
        organization_id=c.organization_id,
        unit_id=c.unit_id,
        title=c.title,
        description=c.description,
        contact_name=c.contact_name,
        contact_phone=c.contact_phone,
        contact_email=c.contact_email,
        available_from=c.available_from,
        monthly_rent=c.monthly_rent,
        status=c.status,
        photos=[_photo_url(f) for f in (c.photos or [])],
        fb_post_id=c.fb_post_id,
        fb_posted_at=c.fb_posted_at,
        created_at=c.created_at,
        updated_at=c.updated_at,
        unit_number=unit_number,
        property_name=property_name,
        property_address=property_address,
    )


async def _get_campaign(campaign_id: str, org_id: uuid.UUID, db: AsyncSession) -> Campaign:
    res = await db.execute(
        select(Campaign)
        .where(Campaign.id == uuid.UUID(campaign_id), Campaign.organization_id == org_id)
        .options(selectinload(Campaign.unit).selectinload(Unit.property))
    )
    c = res.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return c


# ── List ───────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[CampaignOut])
async def list_campaigns(
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.AGENT)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    res = await db.execute(
        select(Campaign)
        .where(Campaign.organization_id == member.organization_id)
        .options(selectinload(Campaign.unit).selectinload(Unit.property))
        .order_by(Campaign.created_at.desc())
    )
    return [_to_out(c) for c in res.scalars().all()]


# ── Create ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=CampaignOut, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    body: CampaignCreate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    c = Campaign(
        organization_id=member.organization_id,
        unit_id=body.unit_id,
        title=body.title,
        description=body.description,
        contact_name=body.contact_name,
        contact_phone=body.contact_phone,
        contact_email=body.contact_email,
        available_from=body.available_from,
        monthly_rent=body.monthly_rent,
        photos=[],
    )
    db.add(c)
    await db.commit()
    return _to_out(await _get_campaign(str(c.id), member.organization_id, db))


# ── Update ─────────────────────────────────────────────────────────────────────

@router.put("/{campaign_id}", response_model=CampaignOut)
async def update_campaign(
    campaign_id: str,
    body: CampaignUpdate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    c = await _get_campaign(campaign_id, member.organization_id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(c, field, value)
    await db.commit()
    return _to_out(await _get_campaign(campaign_id, member.organization_id, db))


# ── Delete ─────────────────────────────────────────────────────────────────────

@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    campaign_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    c = await _get_campaign(campaign_id, member.organization_id, db)
    if c.status == CampaignStatus.PUBLISHED:
        raise HTTPException(status_code=400, detail="Cannot delete a published campaign. Archive it first.")
    # Remove photo files
    for filename in (c.photos or []):
        try:
            (UPLOAD_DIR / filename).unlink(missing_ok=True)
        except OSError:
            pass
    await db.delete(c)
    await db.commit()


# ── Photo upload ───────────────────────────────────────────────────────────────

@router.post("/{campaign_id}/photos", response_model=CampaignOut)
async def upload_photo(
    campaign_id: str,
    file: UploadFile = File(...),
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    c = await _get_campaign(campaign_id, member.organization_id, db)
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP images accepted")
    data = await file.read()
    if len(data) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_SIZE_MB} MB")
    ext = pathlib.Path(file.filename or "photo").suffix or ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / filename).write_bytes(data)
    c.photos = list(c.photos or []) + [filename]
    await db.commit()
    return _to_out(await _get_campaign(campaign_id, member.organization_id, db))


# ── Photo delete ───────────────────────────────────────────────────────────────

@router.delete("/{campaign_id}/photos/{filename}", response_model=CampaignOut)
async def delete_photo(
    campaign_id: str,
    filename: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    c = await _get_campaign(campaign_id, member.organization_id, db)
    # Extract filename from URL if full URL passed
    bare = filename.split("/")[-1]
    c.photos = [f for f in (c.photos or []) if f != bare]
    await db.commit()
    try:
        (UPLOAD_DIR / bare).unlink(missing_ok=True)
    except OSError:
        pass
    return _to_out(await _get_campaign(campaign_id, member.organization_id, db))


# ── Publish to Facebook ────────────────────────────────────────────────────────

@router.post("/{campaign_id}/publish", response_model=CampaignOut)
async def publish_campaign(
    campaign_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    c = await _get_campaign(campaign_id, member.organization_id, db)

    if c.status == CampaignStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="Cannot publish an archived campaign.")

    # Load org FB credentials
    org_res = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_res.scalar_one_or_none()

    if not org or not org.fb_page_token or not org.fb_page_id:
        raise HTTPException(status_code=400, detail="Facebook Page ID and Page Access Token not configured. Go to Settings → Marketing.")

    # Build caption
    lines = [f"🏠 {c.title}"]
    if c.property_name or c.unit_number:
        loc = " ".join(filter(None, [c.property_name, f"— Unit {c.unit_number}" if c.unit_number else None]))
        lines.append(f"📍 {loc}")
    details = []
    if c.monthly_rent:
        details.append(f"💰 ${c.monthly_rent:,.0f}/mo")
    if c.available_from:
        details.append(f"📅 Available {c.available_from.strftime('%b %d, %Y')}")
    if details:
        lines.append("  ".join(details))
    if c.description:
        lines.append(f"\n{c.description}")
    contact_parts = []
    if c.contact_name:
        contact_parts.append(c.contact_name)
    if c.contact_phone:
        contact_parts.append(c.contact_phone)
    if c.contact_email:
        contact_parts.append(c.contact_email)
    if contact_parts:
        lines.append(f"\n📞 {' | '.join(contact_parts)}")
    message = "\n".join(lines)

    # Post to Facebook Graph API
    async with httpx.AsyncClient(timeout=15) as client:
        photos = list(c.photos or [])

        if photos:
            # Upload photos first as unpublished, collect media IDs
            media_ids = []
            for filename in photos[:4]:
                photo_url = _photo_url(filename)
                resp = await client.post(
                    f"https://graph.facebook.com/v19.0/{org.fb_page_id}/photos",
                    params={"access_token": org.fb_page_token},
                    json={"url": photo_url, "published": False},
                )
                if resp.status_code == 200:
                    media_ids.append({"media_fbid": resp.json()["id"]})

            payload: dict = {
                "message": message,
                "access_token": org.fb_page_token,
            }
            if media_ids:
                payload["attached_media"] = media_ids

            resp = await client.post(
                f"https://graph.facebook.com/v19.0/{org.fb_page_id}/feed",
                params={"access_token": org.fb_page_token},
                json={k: v for k, v in payload.items() if k != "access_token"},
                headers={"Authorization": f"Bearer {org.fb_page_token}"},
            )
        else:
            resp = await client.post(
                f"https://graph.facebook.com/v19.0/{org.fb_page_id}/feed",
                json={"message": message},
                headers={"Authorization": f"Bearer {org.fb_page_token}"},
            )

        if resp.status_code != 200:
            detail = resp.json().get("error", {}).get("message", "Facebook API error")
            raise HTTPException(status_code=502, detail=f"Facebook error: {detail}")

        fb_post_id = resp.json().get("id")

    c.status = CampaignStatus.PUBLISHED
    c.fb_post_id = fb_post_id
    c.fb_posted_at = datetime.now(timezone.utc)
    await db.commit()
    return _to_out(await _get_campaign(campaign_id, member.organization_id, db))


# ── Archive ────────────────────────────────────────────────────────────────────

@router.post("/{campaign_id}/archive", response_model=CampaignOut)
async def archive_campaign(
    campaign_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    c = await _get_campaign(campaign_id, member.organization_id, db)
    c.status = CampaignStatus.ARCHIVED
    await db.commit()
    return _to_out(await _get_campaign(campaign_id, member.organization_id, db))


# ── FB Settings (org-level) ────────────────────────────────────────────────────

@router.get("/fb-settings", response_model=OrgFbSettingsOut)
async def get_fb_settings(
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    org_res = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_res.scalar_one_or_none()
    return OrgFbSettingsOut(
        fb_page_id=org.fb_page_id if org else None,
        fb_page_token_set=bool(org and org.fb_page_token),
    )


@router.put("/fb-settings", response_model=OrgFbSettingsOut)
async def update_fb_settings(
    body: OrgFbSettingsUpdate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    org_res = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_res.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if body.fb_page_token is not None:
        org.fb_page_token = body.fb_page_token or None
    if body.fb_page_id is not None:
        org.fb_page_id = body.fb_page_id or None
    await db.commit()
    return OrgFbSettingsOut(fb_page_id=org.fb_page_id, fb_page_token_set=bool(org.fb_page_token))
