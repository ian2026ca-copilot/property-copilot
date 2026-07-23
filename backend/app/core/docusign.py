"""Minimal DocuSign JWT Grant + eSignature REST client.

Uses the already-installed python-jose (RS256 JWT signing) and httpx
(HTTP calls) instead of the full docusign-esign SDK.
"""
import time
import base64

import httpx
from jose import jwt as jose_jwt

from app.core.config import settings


def is_configured() -> bool:
    return bool(
        settings.DOCUSIGN_INTEGRATION_KEY
        and settings.DOCUSIGN_ACCOUNT_ID
        and settings.DOCUSIGN_USER_ID
        and settings.DOCUSIGN_PRIVATE_KEY
    )


def _private_key_pem() -> str:
    # .env files can't hold real newlines, so the key is stored with literal \n escapes
    return settings.DOCUSIGN_PRIVATE_KEY.replace("\\n", "\n")


def _extension_for(filename: str) -> str:
    return filename.rsplit(".", 1)[-1] if "." in filename else "pdf"


async def get_access_token() -> str:
    now = int(time.time())
    claims = {
        "iss": settings.DOCUSIGN_INTEGRATION_KEY,
        "sub": settings.DOCUSIGN_USER_ID,
        "aud": settings.DOCUSIGN_AUTH_SERVER,
        "iat": now,
        "exp": now + 3600,
        "scope": "signature impersonation",
    }
    assertion = jose_jwt.encode(claims, _private_key_pem(), algorithm="RS256")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://{settings.DOCUSIGN_AUTH_SERVER}/oauth/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            },
        )
    if resp.status_code != 200:
        raise RuntimeError(f"DocuSign auth failed: {resp.text[:300]}")
    return resp.json()["access_token"]


async def send_envelope(
    access_token: str,
    document_bytes: bytes,
    filename: str,
    landlord_name: str,
    landlord_email: str,
    tenant_name: str,
    tenant_email: str,
    subject: str,
) -> str:
    """Send a document for signature to the landlord and tenant. Returns the envelope id.

    Signature/date tabs are anchored to the "Landlord Signature:" / "Tenant
    Signature:" labels that AI-generated lease agreements always include
    (see the SIGNATURES section in generate_lease_document). Manually uploaded
    documents without that exact text won't get tabs placed for that signer.
    """
    doc_b64 = base64.b64encode(document_bytes).decode("utf-8")

    def _sign_tabs(sig_anchor: str, date_anchor: str) -> dict:
        return {
            "signHereTabs": [{
                "documentId": "1",
                "anchorString": sig_anchor,
                "anchorUnits": "pixels",
                "anchorXOffset": "110",
                "anchorYOffset": "-10",
                "anchorIgnoreIfNotPresent": "true",
            }],
            "dateSignedTabs": [{
                "documentId": "1",
                "anchorString": date_anchor,
                "anchorUnits": "pixels",
                "anchorXOffset": "90",
                "anchorYOffset": "-10",
                "anchorIgnoreIfNotPresent": "true",
            }],
        }

    envelope = {
        "emailSubject": subject,
        "documents": [
            {
                "documentBase64": doc_b64,
                "name": filename,
                "fileExtension": _extension_for(filename),
                "documentId": "1",
            }
        ],
        "recipients": {
            "signers": [
                {
                    "email": landlord_email,
                    "name": landlord_name,
                    "recipientId": "1",
                    "routingOrder": "1",
                    "tabs": _sign_tabs("Landlord Signature:", "Landlord Date:"),
                },
                {
                    "email": tenant_email,
                    "name": tenant_name,
                    "recipientId": "2",
                    "routingOrder": "1",
                    "tabs": _sign_tabs("Tenant Signature:", "Tenant Date:"),
                },
            ]
        },
        "status": "sent",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{settings.DOCUSIGN_BASE_PATH}/v2.1/accounts/{settings.DOCUSIGN_ACCOUNT_ID}/envelopes",
            json=envelope,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"DocuSign send failed: {resp.text[:300]}")
    return resp.json()["envelopeId"]


async def get_envelope_status(access_token: str, envelope_id: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.DOCUSIGN_BASE_PATH}/v2.1/accounts/{settings.DOCUSIGN_ACCOUNT_ID}/envelopes/{envelope_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"DocuSign status check failed: {resp.text[:300]}")
    return resp.json()["status"]


async def get_signer_statuses(access_token: str, envelope_id: str) -> list[dict]:
    """Per-recipient status (e.g. one signer 'completed' while the other is still 'sent'),
    used to distinguish "tenant signed, awaiting landlord" from the envelope's overall status."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.DOCUSIGN_BASE_PATH}/v2.1/accounts/{settings.DOCUSIGN_ACCOUNT_ID}/envelopes/{envelope_id}/recipients",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"DocuSign recipient status check failed: {resp.text[:300]}")
    return resp.json().get("signers", [])


async def get_combined_document(access_token: str, envelope_id: str) -> bytes:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.DOCUSIGN_BASE_PATH}/v2.1/accounts/{settings.DOCUSIGN_ACCOUNT_ID}/envelopes/{envelope_id}/documents/combined",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"DocuSign document fetch failed: {resp.status_code}")
    return resp.content
