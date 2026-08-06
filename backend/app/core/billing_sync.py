from datetime import datetime, timezone

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.organization import Organization

stripe.api_key = settings.STRIPE_SECRET_KEY


async def sync_org_subscription(org: Organization, db: AsyncSession) -> None:
    """Pulls the org's subscription straight from Stripe and corrects any drift
    in our own status columns. This is a safety net independent of the
    webhook — Stripe events only reach us while `stripe listen` (or a real
    deployed webhook endpoint) is actually running, so without this, any
    change made directly in Stripe (checkout, cancel, resume) silently goes
    stale in our database until someone notices."""
    if not org.stripe_subscription_id:
        return
    sub = stripe.Subscription.retrieve(org.stripe_subscription_id)
    org.subscription_status = sub.status
    org.cancel_at_period_end = bool(sub.cancel_at_period_end)
    org.trial_ends_at = datetime.fromtimestamp(sub.trial_end, tz=timezone.utc) if sub.trial_end else None
    await db.commit()


async def sync_all_subscriptions(session_factory) -> None:
    """Single sweep over every org with a Stripe subscription on file. Each
    org's failure (deleted subscription, transient Stripe/network error) is
    isolated so it can't stop the sweep or crash the background loop."""
    async with session_factory() as db:
        res = await db.execute(select(Organization.id).where(Organization.stripe_subscription_id.isnot(None)))
        org_ids = [row[0] for row in res.all()]

    for org_id in org_ids:
        async with session_factory() as db:
            try:
                org_res = await db.execute(select(Organization).where(Organization.id == org_id))
                org = org_res.scalar_one_or_none()
                if org:
                    await sync_org_subscription(org, db)
            except Exception as e:
                print(f"[billing_sync] org {org_id} sync failed: {e}", flush=True)
