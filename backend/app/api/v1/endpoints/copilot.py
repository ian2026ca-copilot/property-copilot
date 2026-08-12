import json
import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.ai_client import generate_ai_text
from app.api.deps import require_min_role
from app.models.user import User, OrganizationMember, UserRole
from app.schemas.copilot import CopilotChatIn, CopilotChatOut, CopilotExecuteIn, CopilotExecuteOut, CopilotMessage
from app.schemas.property import PropertyCreate, UnitCreate
from app.schemas.lease import TenantCreate, LeaseCreate
from app.api.v1.endpoints.properties import _create_property_and_unit
from app.api.v1.endpoints.tenants import _create_tenant_person, _send_registration_link
from app.api.v1.endpoints.leases import _create_lease_record

router = APIRouter(prefix="/copilot", tags=["copilot"])

SYSTEM_PROMPT = """You are the AI Property Assistant inside Property Copilot, a property
management app. Your job in this conversation is to help the landlord create three things,
gathering the required information ONE QUESTION AT A TIME — never ask for more than one
missing field per turn, and never invent values the user hasn't given you.

The three possible actions, and the fields required for each:

1. create_property — a property with its first unit.
   Required: name, address, city, state, zip_code, unit_number, monthly_rent.
   Optional (ask only if it comes up naturally, otherwise omit): property_type (one of
   RESIDENTIAL, COMMERCIAL, MIXED_USE, INDUSTRIAL, HOUSE, TOWNHOUSE, CONDO_UNIT, DUPLEX,
   TRIPLEX, FOURPLEX, BASEMENT — default HOUSE if not specified), bedrooms (default 1),
   bathrooms (default 1).

2. create_tenant — a tenant person record.
   Required: first_name, last_name, email.
   Optional: phone.

3. create_lease — links a unit and a tenant that must already have been created earlier in
   THIS conversation (you never ask the user for a unit ID or tenant ID — those come from
   context automatically). Only propose this once a property/unit AND a tenant both already
   exist in this conversation.
   Required: start_date (YYYY-MM-DD), end_date (YYYY-MM-DD), monthly_rent.
   Optional: security_deposit (default 0), lease_type (FIXED or MONTH_TO_MONTH, default FIXED).

4. send_tenant_invite — emails and/or texts a tenant (already created earlier in THIS
   conversation) a link to set up their tenant portal account. Only propose this once a
   tenant already exists in this conversation. Ask the user which channel(s) to send it on
   (email, SMS, or both) — you never invent this, always ask, unless the tenant only has
   one type of contact info in context in which case use that one without asking.
   Required: channels (a list containing "email" and/or "sms").

Once — and only once — you have every required field for ONE of these actions, respond with
ONLY a fenced JSON block in exactly this shape, nothing else:

```json
{"action": "create_property", "summary": "one short human-readable line describing what will be created", "payload": {...the fields...}}
```

Until then, respond with a short, plain conversational message (no JSON, no code fences)
asking for the next missing piece of information, or answering the user's question. Suggest
a sensible order if the user seems unsure: property first, then tenant, then lease, then the
invite — but follow the user's lead if they want to do things in a different order."""


def _build_prompt(messages: list[CopilotMessage], created_context: dict) -> str:
    context_lines = []
    if created_context.get("property_id"):
        context_lines.append(
            f"- Property already created: {created_context.get('property_summary', created_context['property_id'])} "
            f"(unit_id={created_context.get('unit_id')})"
        )
    if created_context.get("tenant_user_id"):
        context_lines.append(
            f"- Tenant already created: {created_context.get('tenant_summary', created_context['tenant_user_id'])}"
        )
    if created_context.get("lease_id"):
        context_lines.append(f"- Lease already created: {created_context.get('lease_summary', created_context['lease_id'])}")
    if created_context.get("invite_sent"):
        context_lines.append(f"- Tenant invite already sent via {created_context['invite_sent']}")
    context_block = "\n".join(context_lines) or "- Nothing created yet this conversation."

    transcript = "\n".join(f"{'User' if m.role == 'user' else 'Assistant'}: {m.text}" for m in messages)

    return f"{SYSTEM_PROMPT}\n\nAlready created this conversation:\n{context_block}\n\nConversation so far:\n{transcript}\nAssistant:"


def _extract_json_action(text: str) -> dict | None:
    match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict) or parsed.get("action") not in (
        "create_property", "create_tenant", "create_lease", "send_tenant_invite",
    ):
        return None
    if "payload" not in parsed or not isinstance(parsed["payload"], dict):
        return None
    parsed.setdefault("summary", "Create this record?")
    return parsed


@router.post("/chat", response_model=CopilotChatOut)
async def copilot_chat(
    body: CopilotChatIn,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
):
    prompt = _build_prompt(body.messages, body.created_context)
    try:
        raw = generate_ai_text(prompt).strip()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI assistant unavailable: {str(e)[:200]}")

    action = _extract_json_action(raw)
    if action:
        reply_text = raw.split("```json")[0].strip() or "Here's what I'll create — take a look and confirm:"
        return CopilotChatOut(reply=reply_text, pending_action=action, created_context=body.created_context)

    return CopilotChatOut(reply=raw, pending_action=None, created_context=body.created_context)


@router.post("/execute", response_model=CopilotExecuteOut)
async def copilot_execute(
    body: CopilotExecuteIn,
    background_tasks: BackgroundTasks,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    org_id = member.organization_id
    payload = body.payload
    context = dict(body.created_context)

    if body.action == "create_property":
        try:
            property_data = PropertyCreate(
                name=payload["name"], address=payload["address"], city=payload["city"],
                state=payload["state"], zip_code=payload["zip_code"],
                property_type=payload.get("property_type", "HOUSE"),
            )
            unit_data = UnitCreate(
                unit_number=payload.get("unit_number", "1"),
                bedrooms=payload.get("bedrooms", 1),
                bathrooms=payload.get("bathrooms", 1.0),
                monthly_rent=payload["monthly_rent"],
            )
        except (KeyError, ValueError) as e:
            raise HTTPException(status_code=400, detail=f"Missing or invalid property field: {e}")

        prop, unit = await _create_property_and_unit(org_id, property_data, unit_data, db)
        context["property_id"] = str(prop.id)
        context["unit_id"] = str(unit.id)
        context["property_summary"] = f"{prop.name} ({prop.address}, {prop.city}) — Unit {unit.unit_number}"
        summary = f"Created property '{prop.name}' with Unit {unit.unit_number} at ${unit.monthly_rent:,.0f}/mo"
        return CopilotExecuteOut(summary=summary, created_context=context)

    if body.action == "create_tenant":
        try:
            tenant_data = TenantCreate(
                first_name=payload["first_name"], last_name=payload["last_name"],
                email=payload["email"], phone=payload.get("phone", ""),
            )
        except (KeyError, ValueError) as e:
            raise HTTPException(status_code=400, detail=f"Missing or invalid tenant field: {e}")

        tenant_user = await _create_tenant_person(org_id, tenant_data, db)
        context["tenant_user_id"] = str(tenant_user.id)
        context["tenant_summary"] = f"{tenant_user.display_name} ({tenant_user.email})"
        summary = f"Created tenant {tenant_user.display_name} ({tenant_user.email})"
        return CopilotExecuteOut(summary=summary, created_context=context)

    if body.action == "create_lease":
        if not context.get("unit_id") or not context.get("tenant_user_id"):
            raise HTTPException(status_code=400, detail="A property/unit and a tenant must be created first in this conversation")
        try:
            lease_data = LeaseCreate(
                unit_id=context["unit_id"], tenant_user_id=context["tenant_user_id"],
                start_date=payload["start_date"], end_date=payload["end_date"],
                monthly_rent=payload["monthly_rent"],
                security_deposit=payload.get("security_deposit", 0.0),
                lease_type=payload.get("lease_type", "FIXED"),
            )
        except (KeyError, ValueError) as e:
            raise HTTPException(status_code=400, detail=f"Missing or invalid lease field: {e}")

        lease = await _create_lease_record(org_id, lease_data, db)
        context["lease_id"] = str(lease.id)
        context["lease_summary"] = f"${lease.monthly_rent:,.0f}/mo, {lease.start_date} to {lease.end_date}"
        summary = f"Created lease: {context['tenant_summary']} in {context['property_summary']}, ${lease.monthly_rent:,.0f}/mo starting {lease.start_date}"
        return CopilotExecuteOut(summary=summary, created_context=context)

    if body.action == "send_tenant_invite":
        if not context.get("tenant_user_id"):
            raise HTTPException(status_code=400, detail="A tenant must be created first in this conversation")
        channels = payload.get("channels")
        if not isinstance(channels, list) or not channels:
            raise HTTPException(status_code=400, detail="channels is required (email and/or sms)")

        out = await _send_registration_link(
            member, context["tenant_user_id"], channels, None, None, None, background_tasks, db,
        )
        sent_via = [c for c, ok in (("email", out.email_sent), ("SMS", out.sms_sent)) if ok]
        context["invite_sent"] = " and ".join(sent_via)
        summary = f"Sent tenant portal invite to {context.get('tenant_summary', 'the tenant')} via {' and '.join(sent_via)}"
        if out.skipped_channels:
            summary += f" (skipped: {', '.join(out.skipped_channels)})"
        return CopilotExecuteOut(summary=summary, created_context=context)

    raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")
