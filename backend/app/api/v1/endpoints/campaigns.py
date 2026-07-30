import os
import uuid
import pathlib
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user, require_min_role
from app.models.user import User, OrganizationMember, UserRole
from app.models.campaign import Campaign, CampaignStatus
from app.models.organization import Organization
from app.models.property import Unit, Property
from app.models.image import UnitImage
from app.models.marketing_site import MarketingSite, DEFAULT_MARKETING_SITES
from app.schemas.campaign import (
    CampaignCreate, CampaignUpdate, CampaignOut,
    CampaignAIGenerateOut,
    OrgFbSettingsUpdate, OrgFbSettingsOut,
    MarketingSiteCreate, MarketingSiteOut,
)

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

UPLOAD_DIR = pathlib.Path("/app/uploads/campaigns")
ROOT_UPLOAD_DIR = UPLOAD_DIR.parent  # where property/unit images are stored
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
        security_deposit=c.security_deposit,
        lease_term=c.lease_term,
        furnishing=c.furnishing,
        smoking_policy=c.smoking_policy,
        pets_policy=c.pets_policy,
        utilities_included=c.utilities_included or [],
        parking_available=c.parking_available,
        parking_details=c.parking_details,
        home_features=c.home_features or [],
        neighborhood_features=c.neighborhood_features or [],
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
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
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
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current

    # Auto-add the unit's own photos as the campaign's starting photo set.
    # Unit images live at the shared uploads root (/app/uploads/{filename}), so
    # each one is copied into the campaigns subfolder under a fresh filename —
    # campaign photos are independently deletable without touching the unit's.
    photos: list[str] = []
    if body.unit_id:
        img_result = await db.execute(
            select(UnitImage).where(UnitImage.unit_id == body.unit_id)
            .order_by(UnitImage.sort_order, UnitImage.created_at)
        )
        for img in img_result.scalars().all():
            src = ROOT_UPLOAD_DIR / img.filename
            if not src.exists():
                continue
            new_filename = f"{uuid.uuid4()}{src.suffix}"
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            (UPLOAD_DIR / new_filename).write_bytes(src.read_bytes())
            photos.append(new_filename)

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
        photos=photos,
        security_deposit=body.security_deposit,
        lease_term=body.lease_term,
        furnishing=body.furnishing,
        smoking_policy=body.smoking_policy,
        pets_policy=body.pets_policy,
        utilities_included=body.utilities_included,
        parking_available=body.parking_available,
        parking_details=body.parking_details,
        home_features=body.home_features,
        neighborhood_features=body.neighborhood_features,
    )
    db.add(c)
    await db.commit()
    return _to_out(await _get_campaign(str(c.id), member.organization_id, db))


# ── AI generate ────────────────────────────────────────────────────────────────

MAX_AI_PHOTOS = 6


@router.post("/ai-generate", response_model=CampaignAIGenerateOut)
async def ai_generate_campaign(
    unit_id: str | None = Form(None),
    extra_instructions: str | None = Form(None),
    monthly_rent: str | None = Form(None),
    available_from: str | None = Form(None),
    contact_name: str | None = Form(None),
    contact_phone: str | None = Form(None),
    contact_email: str | None = Form(None),
    existing_photo_filenames: str | None = Form(None),
    files: list[UploadFile] = File(default=[]),
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    """Use Gemini (with vision) to draft a campaign title, description, and suggested asking rent."""
    import json
    import google.generativeai as genai

    _, member = current

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="Gemini API key not configured")

    unit_details = ""
    if unit_id:
        result = await db.execute(
            select(Unit).join(Property).where(
                Unit.id == unit_id,
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
            + (f"Square Feet: {unit.square_feet}\n" if unit.square_feet else "")
            + f"Current Monthly Rent: ${unit.monthly_rent:,.2f}\n"
            + (
                f"Property Name: {prop.name}\n"
                f"Address: {prop.address}, {prop.city}, {prop.state} {prop.zip_code}\n"
                f"Property Type: {prop.property_type.value if hasattr(prop.property_type, 'value') else prop.property_type}\n"
                if prop else ""
            )
        )

    form_details = ""
    if monthly_rent:
        try:
            form_details += f"Asking Monthly Rent: ${float(monthly_rent):,.2f}\n"
        except ValueError:
            pass
    if available_from:
        form_details += f"Available From: {available_from}\n"
    if contact_name or contact_phone or contact_email:
        form_details += "Contact for inquiries: " + ", ".join(
            v for v in [contact_name, contact_phone, contact_email] if v
        ) + "\n"

    # Gather photo bytes for vision input: newly-staged uploads (create mode) +
    # already-uploaded campaign photos (edit mode), capped to keep the prompt light.
    image_parts: list[dict] = []
    for fname in [f.strip() for f in (existing_photo_filenames or "").split(",") if f.strip()]:
        if len(image_parts) >= MAX_AI_PHOTOS:
            break
        path = UPLOAD_DIR / fname
        if path.is_file():
            ext = path.suffix.lower()
            mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}.get(ext, "image/jpeg")
            image_parts.append({"mime_type": mime, "data": path.read_bytes()})
    for upload in files:
        if len(image_parts) >= MAX_AI_PHOTOS:
            break
        content = await upload.read()
        if content:
            image_parts.append({"mime_type": upload.content_type or "image/jpeg", "data": content})

    if not unit_details and not extra_instructions and not form_details and not image_parts:
        raise HTTPException(status_code=400, detail="Select a unit or add some instructions first")

    prompt = (
        "You are a rental property marketing copywriter. Draft a rental listing based on the details below.\n\n"
        + (unit_details or "No specific unit was selected — write generic but compelling rental listing copy.\n")
        + (f"\nCURRENT CAMPAIGN FORM VALUES (use these as the source of truth — they may override the unit's defaults above; weave availability and contact info naturally into the description where relevant):\n{form_details}" if form_details else "")
        + (f"\nADDITIONAL INSTRUCTIONS FROM THE LANDLORD:\n{extra_instructions}\n" if extra_instructions else "")
        + (
            f"\n{len(image_parts)} PHOTO(S) OF THE UNIT ARE ATTACHED — look at them and weave in specific, "
            "accurate visual details (finishes, layout, natural light, staging, condition) that you can actually "
            "see. Do not invent or assume anything not visible in the photos or stated in the details above.\n"
            if image_parts else ""
        )
        + "\nReturn ONLY a JSON object with these exact keys:\n"
        "title (a short, catchy listing headline, under 80 characters),\n"
        "description (2-3 short paragraphs of engaging rental marketing copy, plain text, no markdown),\n"
        "suggested_rent (a realistic competitive monthly rent as a plain number reasoned from the unit details "
        "provided; use null if an asking rent was already given in the current campaign form values above, "
        "or if no unit details were given and there isn't enough information to estimate).\n"
        "No explanation, no markdown fences, just the JSON object."
    )

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content([prompt, *image_parts] if image_parts else prompt)
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

    return CampaignAIGenerateOut(
        title=data.get("title") or "",
        description=data.get("description") or "",
        suggested_rent=data.get("suggested_rent"),
    )


# ── Update ─────────────────────────────────────────────────────────────────────

@router.put("/{campaign_id}", response_model=CampaignOut)
async def update_campaign(
    campaign_id: str,
    body: CampaignUpdate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
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
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
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
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
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
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
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
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
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
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
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
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
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
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
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


# ── Marketing sites (org-level, custom posting websites) ───────────────────────

@router.get("/marketing-sites", response_model=list[MarketingSiteOut])
async def list_marketing_sites(
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(MarketingSite)
        .where(MarketingSite.organization_id == member.organization_id)
        .order_by(MarketingSite.created_at)
    )
    existing = result.scalars().all()
    if not existing:
        # Orgs created before this feature shipped never got the default
        # sites seeded at registration — bootstrap them lazily, once.
        for site_name, site_url in DEFAULT_MARKETING_SITES:
            db.add(MarketingSite(organization_id=member.organization_id, name=site_name, url=site_url))
        await db.commit()
        result = await db.execute(
            select(MarketingSite)
            .where(MarketingSite.organization_id == member.organization_id)
            .order_by(MarketingSite.created_at)
        )
        existing = result.scalars().all()
    return existing


@router.post("/marketing-sites", response_model=MarketingSiteOut, status_code=status.HTTP_201_CREATED)
async def create_marketing_site(
    body: MarketingSiteCreate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    name = body.name.strip()
    url = body.url.strip()
    if not name or not url:
        raise HTTPException(status_code=400, detail="Name and URL are required")
    if not url.startswith("http://") and not url.startswith("https://"):
        url = f"https://{url}"
    site = MarketingSite(organization_id=member.organization_id, name=name, url=url)
    db.add(site)
    await db.commit()
    await db.refresh(site)
    return site


@router.put("/marketing-sites/{site_id}", response_model=MarketingSiteOut)
async def update_marketing_site(
    site_id: str,
    body: MarketingSiteCreate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(MarketingSite).where(MarketingSite.id == site_id, MarketingSite.organization_id == member.organization_id)
    )
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Marketing site not found")
    name = body.name.strip()
    url = body.url.strip()
    if not name or not url:
        raise HTTPException(status_code=400, detail="Name and URL are required")
    if not url.startswith("http://") and not url.startswith("https://"):
        url = f"https://{url}"
    site.name = name
    site.url = url
    await db.commit()
    await db.refresh(site)
    return site


@router.delete("/marketing-sites/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_marketing_site(
    site_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(MarketingSite).where(MarketingSite.id == site_id, MarketingSite.organization_id == member.organization_id)
    )
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Marketing site not found")
    await db.delete(site)
    await db.commit()
