import os
import uuid
import pathlib

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import get_db
from app.api.deps import get_current_user, require_min_role
from app.models.user import User, OrganizationMember, UserRole
from app.models.property import Property, Unit
from app.models.image import PropertyImage, UnitImage

router = APIRouter(tags=["images"])

UPLOAD_DIR = pathlib.Path("/app/uploads")
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE_MB = 10
EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}


class ImageOut(BaseModel):
    id: uuid.UUID
    filename: str
    original_name: str
    url: str
    sort_order: int

    model_config = {"from_attributes": True}


def _uploads_base_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:3001").replace(":3001", ":8002").replace(":3000", ":8002")


def _image_url(filename: str) -> str:
    return f"{_uploads_base_url()}/uploads/{filename}"


async def _save_file(upload: UploadFile) -> str:
    if upload.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, and GIF are accepted")
    data = await upload.read()
    if len(data) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_SIZE_MB} MB limit")
    ext = EXTENSIONS[upload.content_type]
    filename = f"{uuid.uuid4()}{ext}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / filename).write_bytes(data)
    return filename


# ── Property images ────────────────────────────────────────────────────────────

@router.get("/properties/{property_id}/images", response_model=list[ImageOut])
async def list_property_images(
    property_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    await _assert_property(property_id, member.organization_id, db)
    result = await db.execute(
        select(PropertyImage)
        .where(PropertyImage.property_id == property_id)
        .order_by(PropertyImage.sort_order, PropertyImage.created_at)
    )
    images = result.scalars().all()
    return [ImageOut(id=img.id, filename=img.filename, original_name=img.original_name,
                     url=_image_url(img.filename), sort_order=img.sort_order) for img in images]


@router.post("/properties/{property_id}/images", response_model=ImageOut, status_code=status.HTTP_201_CREATED)
async def upload_property_image(
    property_id: str,
    file: UploadFile = File(...),
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    await _assert_property(property_id, member.organization_id, db)
    filename = await _save_file(file)
    img = PropertyImage(
        property_id=property_id,
        filename=filename,
        original_name=file.filename or filename,
    )
    db.add(img)
    await db.commit()
    await db.refresh(img)
    return ImageOut(id=img.id, filename=img.filename, original_name=img.original_name,
                    url=_image_url(img.filename), sort_order=img.sort_order)


@router.delete("/properties/{property_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_property_image(
    property_id: str,
    image_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    await _assert_property(property_id, member.organization_id, db)
    result = await db.execute(
        select(PropertyImage).where(PropertyImage.id == image_id, PropertyImage.property_id == property_id)
    )
    img = result.scalar_one_or_none()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    _delete_file(img.filename)
    await db.delete(img)
    await db.commit()


# ── Unit images ────────────────────────────────────────────────────────────────

@router.get("/properties/{property_id}/units/{unit_id}/images", response_model=list[ImageOut])
async def list_unit_images(
    property_id: str,
    unit_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    await _assert_unit(property_id, unit_id, member.organization_id, db)
    result = await db.execute(
        select(UnitImage)
        .where(UnitImage.unit_id == unit_id)
        .order_by(UnitImage.sort_order, UnitImage.created_at)
    )
    images = result.scalars().all()
    return [ImageOut(id=img.id, filename=img.filename, original_name=img.original_name,
                     url=_image_url(img.filename), sort_order=img.sort_order) for img in images]


@router.post("/properties/{property_id}/units/{unit_id}/images", response_model=ImageOut, status_code=status.HTTP_201_CREATED)
async def upload_unit_image(
    property_id: str,
    unit_id: str,
    file: UploadFile = File(...),
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    await _assert_unit(property_id, unit_id, member.organization_id, db)
    filename = await _save_file(file)
    img = UnitImage(
        unit_id=unit_id,
        filename=filename,
        original_name=file.filename or filename,
    )
    db.add(img)
    await db.commit()
    await db.refresh(img)
    return ImageOut(id=img.id, filename=img.filename, original_name=img.original_name,
                    url=_image_url(img.filename), sort_order=img.sort_order)


@router.delete("/properties/{property_id}/units/{unit_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_unit_image(
    property_id: str,
    unit_id: str,
    image_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    await _assert_unit(property_id, unit_id, member.organization_id, db)
    result = await db.execute(
        select(UnitImage).where(UnitImage.id == image_id, UnitImage.unit_id == unit_id)
    )
    img = result.scalar_one_or_none()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    _delete_file(img.filename)
    await db.delete(img)
    await db.commit()


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _assert_property(property_id: str, org_id, db: AsyncSession) -> None:
    result = await db.execute(
        select(Property).where(Property.id == property_id, Property.organization_id == org_id, Property.is_active == True)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Property not found")


async def _assert_unit(property_id: str, unit_id: str, org_id, db: AsyncSession) -> None:
    result = await db.execute(
        select(Unit).join(Property).where(
            Unit.id == unit_id,
            Unit.property_id == property_id,
            Property.organization_id == org_id,
            Property.is_active == True,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Unit not found")


def _delete_file(filename: str) -> None:
    path = UPLOAD_DIR / filename
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass
