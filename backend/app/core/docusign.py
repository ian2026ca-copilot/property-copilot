"""Minimal DocuSign JWT Grant + eSignature REST client.

Uses the already-installed python-jose (RS256 JWT signing) and httpx
(HTTP calls) instead of the full docusign-esign SDK.

Credentials can come from two places: an organization's own developer
account (set via Settings > DocuSign) takes priority, falling back to the
platform-wide env-configured integration when an org hasn't connected its
own account. resolve_credentials() merges those two sources into a single
dict that every other function in this module takes as its first argument.
"""
import time
import base64

import httpx
from jose import jwt as jose_jwt

from app.core.config import settings


def resolve_credentials(org) -> dict:
    """The platform env config is used unless the org has explicitly opted in to
    its own developer account (docusign_use_own_account) — even if it has saved
    credentials, they're only used when that toggle is on. Any org field left
    blank still falls back to the platform value field-by-field."""
    if not getattr(org, "docusign_use_own_account", False):
        return {
            "integration_key": settings.DOCUSIGN_INTEGRATION_KEY,
            "account_id": settings.DOCUSIGN_ACCOUNT_ID,
            "user_id": settings.DOCUSIGN_USER_ID,
            "private_key": settings.DOCUSIGN_PRIVATE_KEY,
            "base_path": settings.DOCUSIGN_BASE_PATH,
            "auth_server": settings.DOCUSIGN_AUTH_SERVER,
        }
    return {
        "integration_key": org.docusign_integration_key or settings.DOCUSIGN_INTEGRATION_KEY,
        "account_id": org.docusign_account_id or settings.DOCUSIGN_ACCOUNT_ID,
        "user_id": org.docusign_user_id or settings.DOCUSIGN_USER_ID,
        "private_key": org.docusign_private_key or settings.DOCUSIGN_PRIVATE_KEY,
        "base_path": settings.DOCUSIGN_BASE_PATH,
        "auth_server": settings.DOCUSIGN_AUTH_SERVER,
    }


def is_configured(creds: dict) -> bool:
    return bool(creds["integration_key"] and creds["account_id"] and creds["user_id"] and creds["private_key"])


def _private_key_pem(creds: dict) -> str:
    # .env files (and copy-pasted textareas) can't always hold real newlines,
    # so the key may be stored with literal \n escapes.
    return creds["private_key"].replace("\\n", "\n")


def _extension_for(filename: str) -> str:
    return filename.rsplit(".", 1)[-1] if "." in filename else "pdf"


async def get_access_token(creds: dict) -> str:
    now = int(time.time())
    claims = {
        "iss": creds["integration_key"],
        "sub": creds["user_id"],
        "aud": creds["auth_server"],
        "iat": now,
        "exp": now + 3600,
        "scope": "signature impersonation",
    }
    assertion = jose_jwt.encode(claims, _private_key_pem(creds), algorithm="RS256")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://{creds['auth_server']}/oauth/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            },
        )
    if resp.status_code != 200:
        raise RuntimeError(f"DocuSign auth failed: {resp.text[:300]}")
    return resp.json()["access_token"]


async def get_user_info(creds: dict, access_token: str) -> dict:
    """The DocuSign account(s) this access token resolves to — real account name,
    email, and account ID, as opposed to the raw integration-key/account-id
    fields we store ourselves. Used to show "which DocuSign account is this?"
    in the Settings page."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"https://{creds['auth_server']}/oauth/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"DocuSign userinfo failed: {resp.text[:300]}")
    data = resp.json()
    accounts = data.get("accounts", [])
    account = next((a for a in accounts if a.get("account_id") == creds["account_id"]), None) \
        or next((a for a in accounts if a.get("is_default")), None) \
        or (accounts[0] if accounts else None)
    return {
        "name": data.get("name"),
        "email": data.get("email"),
        "account_id": account.get("account_id") if account else None,
        "account_name": account.get("account_name") if account else None,
        "is_sandbox": "demo" in creds["base_path"] or "-d." in creds["auth_server"],
    }


async def send_envelope(
    creds: dict,
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
            f"{creds['base_path']}/v2.1/accounts/{creds['account_id']}/envelopes",
            json=envelope,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"DocuSign send failed: {resp.text[:300]}")
    return resp.json()["envelopeId"]


async def get_envelope_status(creds: dict, access_token: str, envelope_id: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{creds['base_path']}/v2.1/accounts/{creds['account_id']}/envelopes/{envelope_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"DocuSign status check failed: {resp.text[:300]}")
    return resp.json()["status"]


async def get_signer_statuses(creds: dict, access_token: str, envelope_id: str) -> list[dict]:
    """Per-recipient status (e.g. one signer 'completed' while the other is still 'sent'),
    used to distinguish "tenant signed, awaiting landlord" from the envelope's overall status."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{creds['base_path']}/v2.1/accounts/{creds['account_id']}/envelopes/{envelope_id}/recipients",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"DocuSign recipient status check failed: {resp.text[:300]}")
    return resp.json().get("signers", [])


async def get_combined_document(creds: dict, access_token: str, envelope_id: str) -> bytes:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{creds['base_path']}/v2.1/accounts/{creds['account_id']}/envelopes/{envelope_id}/documents/combined",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"DocuSign document fetch failed: {resp.status_code}")
    return resp.content
