import asyncio
import imaplib
import email as email_module
import json
import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai_client import generate_ai_text
from app.models.organization import Organization
from app.models.reference_check import ReferenceCheckRequest
from app.models.tenant_application import TenantScreeningNote

_QUOTE_MARKERS = re.compile(r"^\s*(On .* wrote:|-{2,}\s*Original Message\s*-{2,})\s*$", re.IGNORECASE | re.MULTILINE)
_MESSAGE_ID_RE = re.compile(r"<[^<>]+>")


def _extract_plain_text(msg: "email_module.message.Message") -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and not part.get_filename():
                charset = part.get_content_charset() or "utf-8"
                payload = part.get_payload(decode=True)
                return (payload or b"").decode(charset, errors="replace")
        return ""
    charset = msg.get_content_charset() or "utf-8"
    payload = msg.get_payload(decode=True)
    return (payload or b"").decode(charset, errors="replace")


def _strip_quoted_reply(text: str) -> str:
    match = _QUOTE_MARKERS.search(text)
    return (text[: match.start()] if match else text).strip()


def _extract_message_ids(header_value: str | None) -> list[str]:
    return _MESSAGE_ID_RE.findall(header_value) if header_value else []


def _analyze_reference_reply(reference_type: str, reply_text: str) -> dict:
    fallback = {"confirmed": None, "would_rerent_or_good_standing": None, "red_flags": [], "summary": reply_text[:500]}
    if not reply_text.strip():
        return fallback

    kind_label = "employer" if reference_type == "EMPLOYER" else "landlord"
    prompt = (
        f"A Canadian landlord asked a former {kind_label} of a rental applicant to confirm the applicant's "
        f"{'employment' if reference_type == 'EMPLOYER' else 'tenancy'} details. Below is the reference's reply. "
        "Respond with STRICT JSON only, no markdown fences, matching exactly this shape:\n"
        '{"confirmed": true|false|null, "would_rerent_or_good_standing": true|false|null, '
        '"red_flags": ["short phrase", ...], "summary": "2-3 sentence plain-language summary"}\n'
        "Use null when the reply doesn't clearly say. Do not invent facts beyond what's in the reply. "
        "Do not comment on protected characteristics (race, family status, source of income, disability, etc).\n\n"
        f"Reply text:\n{reply_text[:3000]}"
    )
    try:
        raw_response = generate_ai_text(prompt)
        raw = re.sub(r"^```(json)?|```$", "", raw_response.strip(), flags=re.MULTILINE).strip()
        parsed = json.loads(raw)
        return {
            "confirmed": parsed.get("confirmed"),
            "would_rerent_or_good_standing": parsed.get("would_rerent_or_good_standing"),
            "red_flags": parsed.get("red_flags") or [],
            "summary": parsed.get("summary") or reply_text[:500],
        }
    except Exception as e:
        fallback["summary"] = f"{reply_text[:400]}\n\n(AI analysis unavailable: {str(e)[:150]})"
        return fallback


def _format_note(reference_type: str, contact_name: str | None, analysis: dict) -> str:
    label = "employer" if reference_type == "EMPLOYER" else "landlord"
    who = contact_name or f"the {label} reference"

    def _tri(value: bool | None) -> str:
        return "Yes" if value is True else "No" if value is False else "Unclear"

    red_flags = analysis.get("red_flags") or []
    return (
        f"Reference reply received from {who} ({label} reference):\n"
        f"{analysis.get('summary', '')}\n\n"
        f"Confirmed: {_tri(analysis.get('confirmed'))} · "
        f"Good standing / would rent again: {_tri(analysis.get('would_rerent_or_good_standing'))} · "
        f"Red flags: {', '.join(red_flags) if red_flags else 'None'}"
    )


def _fetch_unseen(host: str, port: int, username: str, password: str) -> list[bytes]:
    conn = imaplib.IMAP4_SSL(host, port)
    try:
        conn.login(username, password)
        conn.select("INBOX")
        result, data = conn.search(None, "UNSEEN")
        if result != "OK":
            return []
        raw_messages = []
        for uid in data[0].split():
            result, msg_data = conn.fetch(uid, "(RFC822)")
            if result == "OK" and msg_data and msg_data[0]:
                raw_messages.append(msg_data[0][1])
                conn.store(uid, "+FLAGS", "\\Seen")
        return raw_messages
    finally:
        try:
            conn.logout()
        except Exception:
            pass


async def check_org_inbox(org: Organization, db: AsyncSession) -> None:
    """Poll one org's configured inbox via IMAP for replies to outstanding
    reference-check requests, analyze matches with Gemini, and log a screening note."""
    raw_messages = await asyncio.to_thread(
        _fetch_unseen,
        org.reference_email_imap_host,
        org.reference_email_imap_port or 993,
        org.reference_reply_email,
        org.reference_email_app_password,
    )

    for raw in raw_messages:
        msg = email_module.message_from_bytes(raw)
        candidate_ids = _extract_message_ids(msg.get("In-Reply-To")) + _extract_message_ids(msg.get("References"))
        if not candidate_ids:
            continue

        req_res = await db.execute(
            select(ReferenceCheckRequest).where(
                ReferenceCheckRequest.organization_id == org.id,
                ReferenceCheckRequest.status == "SENT",
                ReferenceCheckRequest.sent_message_id.in_(candidate_ids),
            )
        )
        tracking = req_res.scalar_one_or_none()
        if not tracking:
            continue

        reply_text = _strip_quoted_reply(_extract_plain_text(msg))
        analysis = _analyze_reference_reply(tracking.reference_type, reply_text)

        db.add(TenantScreeningNote(
            user_id=tracking.tenant_user_id,
            organization_id=org.id,
            author_user_id=None,
            author_name="AI reference check",
            note=_format_note(tracking.reference_type, tracking.contact_name, analysis),
            kind="NOTE",
        ))
        tracking.status = "ANALYZED"
        tracking.ai_structured = analysis
        tracking.analyzed_at = datetime.now(timezone.utc)
        await db.commit()


async def poll_all_orgs(session_factory) -> None:
    """Single sweep over every org with automatic reference-reply checking enabled.
    Each org's failure (bad password, network blip) is isolated so it can't stop
    the sweep or crash the background loop."""
    async with session_factory() as db:
        org_res = await db.execute(
            select(Organization).where(
                Organization.reference_email_check_enabled.is_(True),
                Organization.reference_email_imap_host.isnot(None),
                Organization.reference_email_app_password.isnot(None),
            )
        )
        orgs = org_res.scalars().all()

    for org in orgs:
        async with session_factory() as db:
            try:
                await check_org_inbox(org, db)
            except Exception as e:
                print(f"[reference_email_checker] org {org.id} check failed: {e}", flush=True)
