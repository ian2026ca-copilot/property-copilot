import re
import os
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.core.email import send_reset_email, send_welcome_email
from app.models.organization import Organization
from app.models.user import User, OrganizationMember, UserRole
from app.models.password_reset import PasswordResetToken
from app.models.maintenance import Vendor, VendorOrganization
from app.models.profiles import OwnerProfile, TenantProfile
from app.models.tenant_application import (
    TenantAddressHistory, TenantEmployment, TenantIncomeSource,
    TenantOccupant, TenantCosigner, TenantPet, TenantVehicle,
)
from app.models.marketing_site import MarketingSite, DEFAULT_MARKETING_SITES
from app.schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse, UserOut, UserUpdate,
    ForgotPasswordRequest, ResetPasswordRequest, OrganizationPublicOut, OrganizationUpdate,
)
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


@router.get("/org-by-slug/{slug}", response_model=OrganizationPublicOut)
async def get_org_by_slug(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Organization).where(Organization.slug == slug))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Sign-up link not found")
    return OrganizationPublicOut(name=org.name, slug=org.slug)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    body.email = body.email.lower().strip()
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    role = UserRole(body.role) if body.role in UserRole._value2member_map_ else UserRole.OWNER
    joining_existing_org = bool(body.org_slug)

    if joining_existing_org:
        if role == UserRole.OWNER:
            raise HTTPException(status_code=400, detail="Owners must create their own organization")
        org_res = await db.execute(select(Organization).where(Organization.slug == body.org_slug))
        org = org_res.scalar_one_or_none()
        if not org:
            raise HTTPException(status_code=404, detail="Sign-up link not found")
    else:
        if not body.org_name:
            raise HTTPException(status_code=400, detail="Organization name is required")
        base_slug = slugify(body.org_name)
        slug = base_slug
        counter = 1
        while True:
            taken = await db.execute(select(Organization).where(Organization.slug == slug))
            if not taken.scalar_one_or_none():
                break
            slug = f"{base_slug}-{counter}"
            counter += 1

        org = Organization(name=body.org_name, slug=slug)
        db.add(org)
        await db.flush()

        for site_name, site_url in DEFAULT_MARKETING_SITES:
            db.add(MarketingSite(organization_id=org.id, name=site_name, url=site_url))

    user = User(
        email=body.email,
        full_name=body.full_name,
        first_name=body.first_name,
        last_name=body.last_name,
        phone=body.phone,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.flush()

    member = OrganizationMember(
        organization_id=org.id,
        user_id=user.id,
        role=role,
    )
    db.add(member)

    address_fields = {
        "street_address": body.street_address,
        "city": body.city,
        "province": body.province,
        "postal_code": body.postal_code,
        "country": body.country,
    }

    if role == UserRole.VENDOR:
        vendor = Vendor(
            user_id=user.id,
            business_name=body.business_name or body.full_name,
            service_categories=body.service_categories,
            **address_fields,
        )
        db.add(vendor)
        if joining_existing_org:
            await db.flush()
            db.add(VendorOrganization(vendor_id=vendor.id, organization_id=org.id))
    elif role == UserRole.TENANT:
        # The "current" entry in address_history (if the rental application supplied one)
        # takes priority over the legacy flat address fields for the tenant's profile address.
        current_addr = next((a for a in body.address_history if a.is_current), None) \
            or (body.address_history[0] if body.address_history else None)
        if current_addr:
            address_fields = {
                "street_address": current_addr.street_address,
                "city": current_addr.city,
                "province": current_addr.province,
                "postal_code": current_addr.postal_code,
                "country": current_addr.country,
            }
        db.add(TenantProfile(
            user_id=user.id,
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
            **address_fields,
        ))

        now = datetime.now(timezone.utc)
        for a in body.address_history:
            db.add(TenantAddressHistory(user_id=user.id, created_at=now, **a.model_dump()))
        for e in body.employment_history:
            db.add(TenantEmployment(user_id=user.id, created_at=now, **e.model_dump()))
        for i in body.income_sources:
            db.add(TenantIncomeSource(user_id=user.id, created_at=now, **i.model_dump()))
        for o in body.occupants:
            db.add(TenantOccupant(user_id=user.id, created_at=now, **o.model_dump()))
        for c in body.cosigners:
            db.add(TenantCosigner(user_id=user.id, created_at=now, **c.model_dump()))
        for p in body.pets:
            db.add(TenantPet(user_id=user.id, created_at=now, **p.model_dump()))
        for v in body.vehicles:
            db.add(TenantVehicle(user_id=user.id, created_at=now, **v.model_dump()))
    else:
        db.add(OwnerProfile(user_id=user.id, **address_fields))

    await db.commit()

    token = create_access_token(user.id, extra={"org_id": str(org.id), "role": role})
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3001")
    background_tasks.add_task(
        send_welcome_email,
        user.email,
        user.full_name,
        org.name,
        role.value,
        f"{frontend_url}/dashboard",
    )

    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    email = body.email.lower().strip()
    result = await db.execute(select(User).where(func.lower(User.email) == email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    member_result = await db.execute(
        select(OrganizationMember).where(OrganizationMember.user_id == user.id)
    )
    member = member_result.scalars().first()
    if not member:
        raise HTTPException(status_code=403, detail="No organization found")

    token = create_access_token(user.id, extra={"org_id": str(member.organization_id), "role": member.role})
    return TokenResponse(access_token=token)


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(func.lower(User.email) == body.email.lower().strip()))
    user = result.scalar_one_or_none()
    if user:
        token = secrets.token_urlsafe(48)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        db.add(PasswordResetToken(user_id=user.id, token=token, expires_at=expires_at))
        await db.commit()
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3001")
        reset_link = f"{frontend_url}/reset-password?token={token}"
        background_tasks.add_task(send_reset_email, user.email, reset_link, user.full_name)
    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == body.token)
    )
    reset = result.scalar_one_or_none()
    if not reset or reset.used or reset.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user_result = await db.execute(select(User).where(User.id == reset.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    user.hashed_password = hash_password(body.new_password)
    reset.used = True
    await db.commit()
    return {"message": "Password updated successfully"}


@router.get("/me", response_model=UserOut)
async def me(
    current=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, member = current
    org_result = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_result.scalar_one()
    return UserOut(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        org_id=str(org.id),
        org_name=org.name,
        org_slug=org.slug,
        role=member.role,
    )


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: UserUpdate,
    current=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, member = current
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.phone is not None:
        user.phone = body.phone
    await db.commit()
    await db.refresh(user)
    org_result = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_result.scalar_one()
    return UserOut(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        org_id=str(org.id),
        org_name=org.name,
        org_slug=org.slug,
        role=member.role,
    )


@router.patch("/org", response_model=UserOut)
async def update_organization(
    body: OrganizationUpdate,
    current=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, member = current
    if member.role != UserRole.OWNER:
        raise HTTPException(status_code=403, detail="Only the owner can update organization details")

    org_result = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_result.scalar_one()

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Company name is required")
        org.name = name

    if body.slug is not None:
        slug = body.slug.strip().lower()
        if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", slug):
            raise HTTPException(status_code=400, detail="URL can only contain lowercase letters, numbers, and hyphens")
        if slug != org.slug:
            taken = await db.execute(select(Organization).where(Organization.slug == slug, Organization.id != org.id))
            if taken.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="This URL is already taken")
            org.slug = slug

    await db.commit()
    return UserOut(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        org_id=str(org.id),
        org_name=org.name,
        org_slug=org.slug,
        role=member.role,
    )
