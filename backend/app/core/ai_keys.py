import os

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform_settings import PlatformSettings

PROVIDER_ENV_VARS = {
    "openai_api_key": "OPENAI_API_KEY",
    "deepseek_api_key": "DEEPSEEK_API_KEY",
    "gemini_api_key": "GEMINI_API_KEY",
    "grok_api_key": "GROK_API_KEY",
}

# base_url/model overrides — unlike the keys, these have no .env-provided
# default to fall back to; an unset DB value just mirrors as "", and
# ai_client.py's own hardcoded defaults take over from there.
PROVIDER_OVERRIDE_ENV_VARS = {
    "openai_base_url": "OPENAI_BASE_URL",
    "openai_model": "OPENAI_MODEL",
    "deepseek_base_url": "DEEPSEEK_BASE_URL",
    "deepseek_model": "DEEPSEEK_MODEL",
    "gemini_base_url": "GEMINI_BASE_URL",
    "gemini_model": "GEMINI_MODEL",
    "grok_base_url": "GROK_BASE_URL",
    "grok_model": "GROK_MODEL",
}

VALID_PROVIDERS = {"openai", "deepseek", "gemini", "grok"}

# Snapshot of whatever the container's own .env provided at process start,
# so removing a DB-stored key falls back to that instead of leaving the
# last-saved value stuck in the process env forever.
_ENV_DEFAULTS = {env_var: os.environ.get(env_var, "") for env_var in PROVIDER_ENV_VARS.values()}


async def get_platform_settings(db: AsyncSession) -> PlatformSettings:
    result = await db.execute(select(PlatformSettings).limit(1))
    row = result.scalar_one_or_none()
    if not row:
        row = PlatformSettings()
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def apply_to_env(row: PlatformSettings) -> None:
    """Mirrors DB-stored keys into process env vars, which is what every AI
    call site already reads (`os.environ.get("GEMINI_API_KEY", "")` etc.) —
    keeps those ~12 call sites unchanged while making admin-saved keys take
    effect immediately, no redeploy needed. A DB value of None falls back to
    whatever the container's own .env provided at startup, so removing a
    saved key doesn't leave the process stuck on the last value."""
    for field, env_var in PROVIDER_ENV_VARS.items():
        value = getattr(row, field)
        os.environ[env_var] = value or _ENV_DEFAULTS[env_var]
    for field, env_var in PROVIDER_OVERRIDE_ENV_VARS.items():
        os.environ[env_var] = getattr(row, field) or ""
    os.environ["ACTIVE_AI_PROVIDER"] = row.active_ai_provider or "gemini"


async def load_platform_settings_into_env(session_factory) -> None:
    async with session_factory() as db:
        row = await get_platform_settings(db)
        apply_to_env(row)
