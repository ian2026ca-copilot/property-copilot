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
from app.models.maintenance import Vendor
from app.models.marketing_site import MarketingSite, DEFAULT_MARKETING_SITES
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserOut, UserUpdate, ForgotPasswordRequest, ResetPasswordRequest
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    body.email = body.email.lower().strip()
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

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
        phone=body.phone,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.flush()

    role = UserRole(body.role) if body.role in UserRole._value2member_map_ else UserRole.OWNER
    member = OrganizationMember(
        organization_id=org.id,
        user_id=user.id,
        role=role,
    )
    db.add(member)

    if role == UserRole.VENDOR:
        vendor = Vendor(
            user_id=user.id,
            business_name=body.business_name or body.full_name,
            service_categories=body.service_categories,
        )
        db.add(vendor)

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
        role=member.role,
    )
