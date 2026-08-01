import os
from collections import OrderedDict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user, require_min_role
from app.models.user import User, OrganizationMember, UserRole
from app.models.property import Property, Unit, UnitStatus
from app.models.image import PropertyImage
from app.models.lease import Lease, LeaseStatus
from app.models.payment import Payment, PaymentStatus
from app.models.user import User as UserModel
from app.schemas.property import PropertyCreate, PropertyOut, PropertyUpdate, UnitCreate, UnitUpdate, UnitOut, UnitTenantInfo

router = APIRouter(prefix="/properties", tags=["properties"])


def _uploads_url(filename: str) -> str:
    base = os.getenv("FRONTEND_URL", "http://localhost:3001").replace(":3001", ":8002").replace(":3000", ":8002")
    return f"{base}/uploads/{filename}"


async def _get_property(property_id: str, org_id, db: AsyncSession) -> Property:
    result = await db.execute(
        select(Property).where(
            Property.id == property_id,
            Property.organization_id == org_id,
            Property.is_active == True,
        ).options(selectinload(Property.units), selectinload(Property.cover_image))
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


def _to_out(p: Property) -> PropertyOut:
    occupied = sum(1 for u in p.units if u.status == UnitStatus.OCCUPIED)
    cover_url = _uploads_url(p.cover_image.filename) if p.cover_image else None
    return PropertyOut(
        id=p.id, name=p.name, address=p.address, city=p.city, state=p.state,
        zip_code=p.zip_code, property_type=p.property_type, year_built=p.year_built,
        unit_count=len(p.units), occupied_count=occupied, cover_url=cover_url,
    )


@router.get("", response_model=list[PropertyOut])
async def list_properties(
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(Property)
        .where(Property.organization_id == member.organization_id, Property.is_active == True)
        .options(selectinload(Property.units), selectinload(Property.cover_image))
        .order_by(Property.name)
    )
    return [_to_out(p) for p in result.scalars().all()]


@router.post("", response_model=PropertyOut, status_code=status.HTTP_201_CREATED)
async def create_property(
    body: PropertyCreate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    prop = Property(**body.model_dump(), organization_id=member.organization_id)
    db.add(prop)
    await db.commit()
    result = await db.execute(
        select(Property).where(Property.id == prop.id).options(selectinload(Property.units), selectinload(Property.cover_image))
    )
    return _to_out(result.scalar_one())


@router.get("/{property_id}", response_model=PropertyOut)
async def get_property(
    property_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    return _to_out(await _get_property(property_id, member.organization_id, db))


@router.put("/{property_id}", response_model=PropertyOut)
async def update_property(
    property_id: str,
    body: PropertyUpdate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    prop = await _get_property(property_id, member.organization_id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(prop, field, value)
    await db.commit()
    await db.refresh(prop)
    result = await db.execute(
        select(Property).where(Property.id == prop.id).options(selectinload(Property.units), selectinload(Property.cover_image))
    )
    return _to_out(result.scalar_one())


@router.patch("/{property_id}/cover", response_model=PropertyOut)
async def set_cover_image(
    property_id: str,
    body: dict,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    prop = await _get_property(property_id, member.organization_id, db)
    image_id = body.get("image_id")
    if image_id:
        img_result = await db.execute(
            select(PropertyImage).where(PropertyImage.id == image_id, PropertyImage.property_id == property_id)
        )
        if not img_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Image not found")
        prop.cover_image_id = image_id
    else:
        prop.cover_image_id = None
    await db.commit()
    result = await db.execute(
        select(Property).where(Property.id == prop.id).options(selectinload(Property.units), selectinload(Property.cover_image))
    )
    return _to_out(result.scalar_one())


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_property(
    property_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    prop = await _get_property(property_id, member.organization_id, db)
    prop.is_active = False   # soft delete
    await db.commit()


# ── Units ──────────────────────────────────────────────────────────────────

@router.get("/{property_id}/units", response_model=list[UnitOut])
async def list_units(
    property_id: str,
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    await _get_property(property_id, member.organization_id, db)   # auth check

    uploads_base = os.getenv("FRONTEND_URL", "http://localhost:3001").replace(":3001", ":8002").replace(":3000", ":8002")

    # Left-join all active/pending leases + tenants per unit
    result = await db.execute(
        select(Unit, Lease, UserModel)
        .outerjoin(
            Lease,
            (Lease.unit_id == Unit.id) &
            (Lease.status.in_([LeaseStatus.ACTIVE, LeaseStatus.PENDING])),
        )
        .outerjoin(UserModel, UserModel.id == Lease.tenant_user_id)
        .where(Unit.property_id == property_id)
        .order_by(Unit.unit_number, Lease.start_date)
    )
    all_rows = result.all()

    # Collect all lease IDs for outstanding balance subquery
    lease_ids = [row[1].id for row in all_rows if row[1]]
    balance_by_lease: dict = {}
    if lease_ids:
        bal_result = await db.execute(
            select(Payment.lease_id, func.sum(Payment.amount))
            .where(
                Payment.lease_id.in_(lease_ids),
                Payment.status.in_([PaymentStatus.PENDING, PaymentStatus.DUE, PaymentStatus.OVERDUE]),
            )
            .group_by(Payment.lease_id)
        )
        balance_by_lease = {str(row[0]): float(row[1]) for row in bal_result.all()}

    # Group rows by unit, collecting all tenants per unit
    units_map: OrderedDict = OrderedDict()
    for unit, lease, tenant in all_rows:
        uid = str(unit.id)
        if uid not in units_map:
            units_map[uid] = (unit, [])
        if lease and tenant:
            units_map[uid][1].append((lease, tenant))

    units_out = []
    for uid, (unit, lease_tenant_pairs) in units_map.items():
        has_lease = bool(lease_tenant_pairs)
        effective_status = UnitStatus.OCCUPIED if has_lease else (
            unit.status if unit.status != UnitStatus.OCCUPIED else UnitStatus.VACANT
        )
        # Primary tenant (first lease) for backwards-compatible fields
        first_lease, first_tenant = lease_tenant_pairs[0] if has_lease else (None, None)
        tenants_info = [
            UnitTenantInfo(
                tenant_user_id=str(t.id),
                tenant_name=t.display_name,
                tenant_avatar_url=(
                    f"{uploads_base}/uploads/{t.avatar_filename}"
                    if t.avatar_filename else None
                ),
                lease_id=str(l.id),
                lease_start=str(l.start_date),
                lease_end=str(l.end_date),
                outstanding_balance=balance_by_lease.get(str(l.id), 0.0),
            )
            for l, t in lease_tenant_pairs
        ]
        units_out.append(UnitOut(
            id=unit.id,
            property_id=unit.property_id,
            unit_number=unit.unit_number,
            bedrooms=unit.bedrooms,
            bathrooms=unit.bathrooms,
            square_feet=unit.square_feet,
            monthly_rent=unit.monthly_rent,
            status=effective_status,
            contact_methods=unit.contact_methods or [],
            contact_phones=unit.contact_phones or [],
            contact_emails=unit.contact_emails or [],
            security_deposit=unit.security_deposit,
            utilities_included=unit.utilities_included or [],
            furnishing=unit.furnishing,
            lease_term=unit.lease_term,
            availability_date=unit.availability_date,
            smoking_policy=unit.smoking_policy,
            dogs_policy=unit.dogs_policy,
            cats_policy=unit.cats_policy,
            pet_fee=unit.pet_fee,
            parking_available=unit.parking_available,
            property_heading=unit.property_heading,
            hidden_notes=unit.hidden_notes,
            description=unit.description,
            home_features=unit.home_features or [],
            neighborhood_features=unit.neighborhood_features or [],
            tenant_name=first_tenant.display_name if first_tenant else None,
            tenant_user_id=str(first_tenant.id) if first_tenant else None,
            tenant_avatar_url=(
                f"{uploads_base}/uploads/{first_tenant.avatar_filename}"
                if first_tenant and first_tenant.avatar_filename else None
            ),
            lease_id=str(first_lease.id) if first_lease else None,
            lease_start=str(first_lease.start_date) if first_lease else None,
            lease_end=str(first_lease.end_date) if first_lease else None,
            outstanding_balance=balance_by_lease.get(str(first_lease.id), 0.0) if first_lease else 0.0,
            tenants=tenants_info,
        ))
    return units_out


@router.post("/{property_id}/units", response_model=UnitOut, status_code=status.HTTP_201_CREATED)
async def create_unit(
    property_id: str,
    body: UnitCreate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    await _get_property(property_id, member.organization_id, db)
    unit = Unit(**body.model_dump(), property_id=property_id)
    db.add(unit)
    await db.commit()
    await db.refresh(unit)
    return unit


@router.put("/{property_id}/units/{unit_id}", response_model=UnitOut)
async def update_unit(
    property_id: str,
    unit_id: str,
    body: UnitUpdate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    await _get_property(property_id, member.organization_id, db)
    result = await db.execute(
        select(Unit).where(Unit.id == unit_id, Unit.property_id == property_id)
    )
    unit = result.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(unit, field, value)
    await db.commit()
    await db.refresh(unit)
    return unit


@router.delete("/{property_id}/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_unit(
    property_id: str,
    unit_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    await _get_property(property_id, member.organization_id, db)
    result = await db.execute(
        select(Unit).where(Unit.id == unit_id, Unit.property_id == property_id)
    )
    unit = result.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    await db.delete(unit)
    await db.commit()
