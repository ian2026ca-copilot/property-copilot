import stripe

from app.core.config import settings
from app.models.organization import Organization

stripe.api_key = settings.STRIPE_SECRET_KEY


def create_checkout_session(org: Organization, user_email: str, success_url: str, cancel_url: str, price_id: str):
    """Stripe-hosted Checkout session for the selected plan (monthly or yearly
    price), with a 31-day trial. The org id travels in metadata/client_reference_id
    so the webhook (which has no auth context) can identify which org a
    completed session belongs to."""
    kwargs = {
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "subscription_data": {"trial_period_days": 31},
        "client_reference_id": str(org.id),
        "metadata": {"organization_id": str(org.id)},
    }
    if org.stripe_customer_id:
        kwargs["customer"] = org.stripe_customer_id
    else:
        kwargs["customer_email"] = user_email
    return stripe.checkout.Session.create(**kwargs)


def create_portal_session(org: Organization, return_url: str):
    """Stripe-hosted Billing Portal session so the owner can update their card,
    view invoices, or cancel without any custom UI on our side."""
    return stripe.billing_portal.Session.create(customer=org.stripe_customer_id, return_url=return_url)
