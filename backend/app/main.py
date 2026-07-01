import pathlib

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import router

UPLOAD_DIR = pathlib.Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Property Copilot API", version="0.1.0")

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
