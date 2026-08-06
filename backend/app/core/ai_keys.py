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
    os.environ["ACTIVE_AI_PROVIDER"] = row.active_ai_provider or "gemini"


async def load_platform_settings_into_env(session_factory) -> None:
    async with session_factory() as db:
        row = await get_platform_settings(db)
        apply_to_env(row)
