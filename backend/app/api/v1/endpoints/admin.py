from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import stripe

from app.core.database import get_db
from app.core.config import settings
from app.core.security import verify_password, hash_password, create_access_token
from app.api.deps import get_current_admin
from app.core.billing_sync import sync_org_subscription
from app.core.ai_keys import get_platform_settings, apply_to_env, VALID_PROVIDERS
from app.models.user import User, OrganizationMember, UserRole
from app.models.organization import Organization
from app.models.property import Property, Unit
from app.models.payment import Payment, PaymentStatus
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.admin import (
    AdminUserOut, OwnerRowOut, CreateAdminIn, OwnerDetailOut, OwnerPropertyOut, OwnerTeamMemberOut,
    OwnerPaymentOut, ImpersonateOut, AISettingsOut, AISettingsIn,
)

stripe.api_key = settings.STRIPE_SECRET_KEY

router = APIRouter(prefix="/admin", tags=["admin"])


async def _get_org_or_404(org_id: str, db: AsyncSession) -> Organization:
    res = await db.execute(select(Organization).where(Organization.id == org_id))
    org = res.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.post("/login", response_model=TokenResponse)
async def admin_login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Separate from /auth/login, which hard-requires an org membership an
    admin doesn't have. Not linked from anywhere public — admin accounts are
    created via the promote_admin script."""
    email = body.email.lower().strip()
    result = await db.execute(select(User).where(func.lower(User.email) == email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password) or not user.is_platform_admin:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(user.id, extra={"is_admin": True})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=AdminUserOut)
async def admin_me(admin: User = Depends(get_current_admin)):
    return AdminUserOut(id=str(admin.id), email=admin.email, full_name=admin.full_name)


@router.get("/admins", response_model=list[AdminUserOut])
async def list_admins(admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.is_platform_admin.is_(True)).order_by(User.email))
    return [AdminUserOut(id=str(u.id), email=u.email, full_name=u.full_name) for u in result.scalars().all()]


@router.post("/admins", response_model=AdminUserOut, status_code=201)
async def create_admin(body: CreateAdminIn, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Any existing platform admin can create another one — this is the
    in-app path; the promote_admin script remains for bootstrapping the very
    first admin account."""
    email = body.email.lower().strip()
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A user with this email already exists")

    new_admin = User(
        email=email,
        full_name=body.full_name.strip(),
        hashed_password=hash_password(body.password),
        is_platform_admin=True,
    )
    db.add(new_admin)
    await db.commit()
    await db.refresh(new_admin)
    return AdminUserOut(id=str(new_admin.id), email=new_admin.email, full_name=new_admin.full_name)


@router.get("/owners", response_model=list[OwnerRowOut])
async def list_owners(admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    orgs_res = await db.execute(select(Organization))
    orgs = orgs_res.scalars().all()

    rows = []
    for org in orgs:
        owner_res = await db.execute(
            select(User)
            .join(OrganizationMember, OrganizationMember.user_id == User.id)
            .where(OrganizationMember.organization_id == org.id, OrganizationMember.role == UserRole.OWNER)
        )
        owner_user = owner_res.scalars().first()

        property_count = (await db.execute(
            select(func.count()).select_from(Property).where(Property.organization_id == org.id)
        )).scalar_one()

        tenant_count = (await db.execute(
            select(func.count()).select_from(OrganizationMember).where(
                OrganizationMember.organization_id == org.id, OrganizationMember.role == UserRole.TENANT
            )
        )).scalar_one()

        rows.append(OwnerRowOut(
            organization_id=str(org.id),
            organization_name=org.name,
            owner_email=owner_user.email if owner_user else None,
            owner_name=owner_user.display_name if owner_user else None,
            subscription_status=org.subscription_status,
            trial_ends_at=org.trial_ends_at.isoformat() if org.trial_ends_at else None,
            cancel_at_period_end=org.cancel_at_period_end,
            billing_exempt=org.billing_exempt,
            is_suspended=org.is_suspended,
            property_count=property_count,
            tenant_count=tenant_count,
        ))
    return rows


@router.get("/owners/{org_id}", response_model=OwnerDetailOut)
async def get_owner_detail(org_id: str, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    org = await _get_org_or_404(org_id, db)

    if org.stripe_subscription_id:
        try:
            await sync_org_subscription(org, db)
        except stripe.error.StripeError:
            pass  # fall back to whatever's already in the DB rather than breaking the drawer

    owner_res = await db.execute(
        select(User)
        .join(OrganizationMember, OrganizationMember.user_id == User.id)
        .where(OrganizationMember.organization_id == org.id, OrganizationMember.role == UserRole.OWNER)
    )
    owner_user = owner_res.scalars().first()

    property_count = (await db.execute(
        select(func.count()).select_from(Property).where(Property.organization_id == org.id)
    )).scalar_one()
    tenant_count = (await db.execute(
        select(func.count()).select_from(OrganizationMember).where(
            OrganizationMember.organization_id == org.id, OrganizationMember.role == UserRole.TENANT
        )
    )).scalar_one()
    vendor_count = (await db.execute(
        select(func.count()).select_from(OrganizationMember).where(
            OrganizationMember.organization_id == org.id, OrganizationMember.role == UserRole.VENDOR
        )
    )).scalar_one()

    props_res = await db.execute(select(Property).where(Property.organization_id == org.id).order_by(Property.name))
    properties = props_res.scalars().all()
    properties_out = []
    for p in properties:
        unit_count = (await db.execute(
            select(func.count()).select_from(Unit).where(Unit.property_id == p.id)
        )).scalar_one()
        properties_out.append(OwnerPropertyOut(
            id=str(p.id), name=p.name, address=p.address, city=p.city, state=p.state, unit_count=unit_count,
        ))

    team_res = await db.execute(
        select(User, OrganizationMember.role)
        .join(OrganizationMember, OrganizationMember.user_id == User.id)
        .where(OrganizationMember.organization_id == org.id)
        .order_by(OrganizationMember.role, User.email)
    )
    team_out = [
        OwnerTeamMemberOut(user_id=str(u.id), name=u.display_name, email=u.email, role=role.value)
        for u, role in team_res.all()
    ]

    payments_res = await db.execute(
        select(Payment, User)
        .outerjoin(User, User.id == Payment.tenant_user_id)
        .where(Payment.organization_id == org.id)
        .order_by(Payment.due_date.desc())
    )
    today = date.today()
    collected_total = 0.0
    overdue_total = 0.0
    pending_total = 0.0
    overdue_count = 0
    recent_payments = []
    for p, tenant in payments_res.all():
        amount = float(p.amount)
        if p.status == PaymentStatus.PAID:
            collected_total += amount
        elif p.status in (PaymentStatus.OVERDUE, PaymentStatus.LATE) or (
            p.status in (PaymentStatus.PENDING, PaymentStatus.DUE) and p.due_date < today
        ):
            overdue_total += amount
            overdue_count += 1
        elif p.status in (PaymentStatus.PENDING, PaymentStatus.DUE):
            pending_total += amount

        if len(recent_payments) < 10:
            recent_payments.append(OwnerPaymentOut(
                id=str(p.id),
                tenant_name=tenant.display_name if tenant else None,
                amount=amount,
                due_date=p.due_date.isoformat(),
                paid_date=p.paid_date.isoformat() if p.paid_date else None,
                status=p.status.value,
                payment_type=p.payment_type.value,
            ))

    return OwnerDetailOut(
        organization_id=str(org.id),
        organization_name=org.name,
        organization_slug=org.slug,
        created_at=org.created_at.isoformat(),
        owner_name=owner_user.display_name if owner_user else None,
        owner_email=owner_user.email if owner_user else None,
        owner_phone=owner_user.phone if owner_user else None,
        subscription_status=org.subscription_status,
        trial_ends_at=org.trial_ends_at.isoformat() if org.trial_ends_at else None,
        cancel_at_period_end=org.cancel_at_period_end,
        billing_exempt=org.billing_exempt,
        is_suspended=org.is_suspended,
        stripe_customer_id=org.stripe_customer_id,
        stripe_subscription_id=org.stripe_subscription_id,
        property_count=property_count,
        tenant_count=tenant_count,
        vendor_count=vendor_count,
        properties=properties_out,
        team=team_out,
        payments_collected_total=collected_total,
        payments_overdue_total=overdue_total,
        payments_pending_total=pending_total,
        payments_overdue_count=overdue_count,
        recent_payments=recent_payments,
    )


@router.post("/owners/{org_id}/impersonate", response_model=ImpersonateOut)
async def impersonate_owner(org_id: str, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Mints a normal owner-scoped session token so an admin can act as the
    org's owner — reuses every existing owner permission check rather than
    duplicating them. The extra `impersonated_by` claim marks the session as
    admin-initiated (surfaced to the frontend via /auth/me)."""
    org = await _get_org_or_404(org_id, db)
    if org.is_suspended:
        raise HTTPException(status_code=400, detail="This organization is suspended — reactivate it before logging in as the owner")

    owner_res = await db.execute(
        select(User, OrganizationMember)
        .join(OrganizationMember, OrganizationMember.user_id == User.id)
        .where(OrganizationMember.organization_id == org.id, OrganizationMember.role == UserRole.OWNER)
    )
    row = owner_res.first()
    if not row:
        raise HTTPException(status_code=400, detail="This organization has no owner to log in as")
    owner_user, member = row

    token = create_access_token(
        owner_user.id,
        extra={"org_id": str(org.id), "role": member.role.value, "impersonated_by": str(admin.id)},
    )
    return ImpersonateOut(access_token=token, owner_name=owner_user.display_name)


@router.post("/owners/{org_id}/suspend", status_code=204)
async def suspend_owner(org_id: str, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    org = await _get_org_or_404(org_id, db)
    org.is_suspended = True
    await db.commit()


@router.post("/owners/{org_id}/reactivate", status_code=204)
async def reactivate_owner(org_id: str, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    org = await _get_org_or_404(org_id, db)
    org.is_suspended = False
    await db.commit()


@router.post("/owners/{org_id}/comp", status_code=204)
async def comp_owner(org_id: str, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    org = await _get_org_or_404(org_id, db)
    org.billing_exempt = True
    await db.commit()


@router.post("/owners/{org_id}/uncomp", status_code=204)
async def uncomp_owner(org_id: str, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    org = await _get_org_or_404(org_id, db)
    org.billing_exempt = False
    await db.commit()


OVERRIDE_FIELDS = [
    "openai_base_url", "openai_model", "deepseek_base_url", "deepseek_model",
    "gemini_base_url", "gemini_model", "grok_base_url", "grok_model",
]


def _ai_settings_out(row) -> AISettingsOut:
    return AISettingsOut(
        openai_key_set=bool(row.openai_api_key),
        deepseek_key_set=bool(row.deepseek_api_key),
        gemini_key_set=bool(row.gemini_api_key),
        grok_key_set=bool(row.grok_api_key),
        active_provider=row.active_ai_provider,
        **{field: getattr(row, field) for field in OVERRIDE_FIELDS},
    )


@router.get("/ai-settings", response_model=AISettingsOut)
async def get_ai_settings(admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    row = await get_platform_settings(db)
    return _ai_settings_out(row)


@router.patch("/ai-settings", response_model=AISettingsOut)
async def update_ai_settings(
    body: AISettingsIn, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    """Only fields present in the request are changed; send an empty string
    to clear a key. Saved keys (and the active provider) are mirrored into
    the process env immediately so every AI call site picks them up without
    a restart."""
    row = await get_platform_settings(db)

    data = body.model_dump(exclude_unset=True)
    if "openai_api_key" in data:
        row.openai_api_key = data["openai_api_key"] or None
    if "deepseek_api_key" in data:
        row.deepseek_api_key = data["deepseek_api_key"] or None
    if "gemini_api_key" in data:
        row.gemini_api_key = data["gemini_api_key"] or None
    if "grok_api_key" in data:
        row.grok_api_key = data["grok_api_key"] or None
    if "active_provider" in data:
        provider = data["active_provider"]
        if provider not in VALID_PROVIDERS:
            raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
        row.active_ai_provider = provider
    for field in OVERRIDE_FIELDS:
        if field in data:
            setattr(row, field, data[field] or None)

    await db.commit()
    await db.refresh(row)
    apply_to_env(row)

    return _ai_settings_out(row)


@router.post("/owners/{org_id}/refund")
async def refund_latest_invoice(org_id: str, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    org = await _get_org_or_404(org_id, db)
    if not org.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No subscription on file for this org")

    try:
        invoices = stripe.Invoice.list(subscription=org.stripe_subscription_id, limit=1)
        if not invoices.data or not invoices.data[0].payment_intent:
            raise HTTPException(status_code=400, detail="No refundable invoice found")
        refund = stripe.Refund.create(payment_intent=invoices.data[0].payment_intent)
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe error: {e.user_message or str(e)}")
    return {"refunded": True, "refund_id": refund.id}
