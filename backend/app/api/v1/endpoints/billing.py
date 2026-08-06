import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import stripe

from app.core.database import get_db
from app.core.config import settings
from app.core.stripe_client import create_checkout_session, create_portal_session
from app.core.billing_sync import sync_org_subscription
from app.api.deps import require_min_role
from app.models.user import User, OrganizationMember, UserRole
from app.models.organization import Organization
from app.schemas.billing import CheckoutSessionIn, CheckoutSessionOut, PortalSessionOut, BillingStatusOut

router = APIRouter(prefix="/billing", tags=["billing"])


def _frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:3000")


@router.post("/checkout-session", response_model=CheckoutSessionOut)
async def create_checkout(
    body: CheckoutSessionIn,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    user, member = current
    org_res = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_res.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    price_id = settings.STRIPE_PRICE_ID_YEARLY if body.plan == "yearly" else settings.STRIPE_PRICE_ID
    if not price_id:
        raise HTTPException(status_code=400, detail=f"No price configured for the '{body.plan}' plan")

    base = _frontend_url()
    try:
        session = create_checkout_session(
            org, user.email,
            success_url=f"{base}/settings?tab=billing&checkout=success",
            cancel_url=f"{base}/settings?tab=billing&checkout=cancel",
            price_id=price_id,
        )
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe error: {e.user_message or str(e)}")
    return CheckoutSessionOut(url=session.url)


@router.get("/status", response_model=BillingStatusOut)
async def billing_status(
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    org_res = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_res.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if org.stripe_subscription_id:
        try:
            # Pull the live truth from Stripe before answering, rather than waiting on the
            # webhook (only fires while reachable) or the next periodic sync sweep — this way
            # the owner sees the right status immediately after Checkout or the Billing Portal.
            await sync_org_subscription(org, db)
        except stripe.error.StripeError:
            pass  # fall back to whatever's already in the DB rather than breaking the page

    return BillingStatusOut(
        status=org.subscription_status,
        trial_ends_at=org.trial_ends_at.isoformat() if org.trial_ends_at else None,
        billing_exempt=org.billing_exempt,
        cancel_at_period_end=org.cancel_at_period_end,
    )


@router.post("/portal-session", response_model=PortalSessionOut)
async def create_portal(
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    org_res = await db.execute(select(Organization).where(Organization.id == member.organization_id))
    org = org_res.scalar_one_or_none()
    if not org or not org.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account on file yet")

    try:
        session = create_portal_session(org, return_url=f"{_frontend_url()}/settings?tab=billing")
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe error: {e.user_message or str(e)}")
    return PortalSessionOut(url=session.url)


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Public endpoint (no auth) — Stripe calls this directly. Signature
    verification is what stands in for authentication here."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    data = event["data"]["object"]
    event_type = event["type"]

    async def _org_from_metadata() -> Organization | None:
        org_id = (data.get("metadata") or {}).get("organization_id") or data.get("client_reference_id")
        if not org_id:
            return None
        res = await db.execute(select(Organization).where(Organization.id == org_id))
        return res.scalar_one_or_none()

    async def _org_from_customer() -> Organization | None:
        customer_id = data.get("customer")
        if not customer_id:
            return None
        res = await db.execute(select(Organization).where(Organization.stripe_customer_id == customer_id))
        return res.scalar_one_or_none()

    if event_type == "checkout.session.completed":
        org = await _org_from_metadata()
        if org:
            org.stripe_customer_id = data.get("customer")
            org.stripe_subscription_id = data.get("subscription")
            org.cancel_at_period_end = False
            await db.commit()

    elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
        org = await _org_from_customer()
        if org:
            org.subscription_status = data.get("status")
            org.cancel_at_period_end = bool(data.get("cancel_at_period_end"))
            trial_end = data.get("trial_end")
            org.trial_ends_at = datetime.fromtimestamp(trial_end, tz=timezone.utc) if trial_end else None
            await db.commit()

    elif event_type == "customer.subscription.deleted":
        org = await _org_from_customer()
        if org:
            org.subscription_status = "canceled"
            org.cancel_at_period_end = False
            await db.commit()

    elif event_type == "invoice.payment_failed":
        org = await _org_from_customer()
        if org:
            org.subscription_status = "past_due"
            await db.commit()

    return {"received": True}
