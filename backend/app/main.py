import asyncio
import os
import pathlib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import router
from app.core.database import AsyncSessionLocal
from app.core.reference_email_checker import poll_all_orgs
from app.core.billing_sync import sync_all_subscriptions
from app.core.ai_keys import load_platform_settings_into_env

UPLOAD_DIR = pathlib.Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def _reference_email_poll_loop() -> None:
    interval = int(os.environ.get("REFERENCE_EMAIL_POLL_INTERVAL_SECONDS", "300"))
    while True:
        try:
            await poll_all_orgs(AsyncSessionLocal)
        except Exception as e:
            print(f"[reference_email_checker] sweep failed: {e}", flush=True)
        await asyncio.sleep(interval)


async def _billing_sync_loop() -> None:
    """Safety-net sync so subscription status stays correct even when the
    Stripe webhook isn't reachable (e.g. `stripe listen` isn't running in
    dev) — periodically pulls each org's real status straight from Stripe."""
    interval = int(os.environ.get("BILLING_SYNC_INTERVAL_SECONDS", "300"))
    while True:
        try:
            await sync_all_subscriptions(AsyncSessionLocal)
        except Exception as e:
            print(f"[billing_sync] sweep failed: {e}", flush=True)
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await load_platform_settings_into_env(AsyncSessionLocal)
    tasks = [
        asyncio.create_task(_reference_email_poll_loop()),
        asyncio.create_task(_billing_sync_loop()),
    ]
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(title="Property Copilot API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok"}
