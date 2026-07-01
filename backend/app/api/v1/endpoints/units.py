from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User, OrganizationMember
from app.models.property import Property, Unit
from app.models.lease import Lease, LeaseStatus
from pydantic import BaseModel
from typing import Optional
import uuid

router = APIRouter(prefix="/units", tags=["units"])


class UnitDetailOut(BaseModel):
    id: str
    unit_number: str
    property_id: str
    property_name: str
    property_address: str
    status: str
    monthly_rent: float
    bedrooms: int
    tenant_name: Optional[str] = None
    tenant_user_id: Optional[str] = None
    tenant_email: Optional[str] = None
    lease_id: Optional[str] = None


@router.get("", response_model=list[UnitDetailOut])
async def list_all_units(
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = current

    # Fetch all active properties + their units for this org
    props_result = await db.execute(
        select(Property)
        .where(
            Property.organization_id == member.organization_id,
            Property.is_active == True,
        )
        .options(selectinload(Property.units))
        .order_by(Property.name)
    )
    properties = props_result.scalars().all()

    # Fetch all active leases for this org to find current tenants
    leases_result = await db.execute(
        select(Lease)
        .where(
            Lease.organization_id == member.organization_id,
            Lease.status == LeaseStatus.ACTIVE,
        )
        .options(selectinload(Lease.tenant))
    )
    active_leases = leases_result.scalars().all()

    # Build lookup: unit_id -> active lease
    lease_by_unit: dict[uuid.UUID, Lease] = {}
    for lease in active_leases:
        lease_by_unit[lease.unit_id] = lease

    out: list[UnitDetailOut] = []
    for prop in properties:
        units_sorted = sorted(prop.units, key=lambda u: u.unit_number)
        for unit in units_sorted:
            lease = lease_by_unit.get(unit.id)
            tenant = lease.tenant if lease else None
            out.append(UnitDetailOut(
                id=str(unit.id),
                unit_number=unit.unit_number,
                property_id=str(prop.id),
                property_name=prop.name,
                property_address=f"{prop.address}, {prop.city}",
                status=unit.status.value,
                monthly_rent=float(unit.monthly_rent),
                bedrooms=unit.bedrooms,
                tenant_name=tenant.full_name if tenant else None,
                tenant_user_id=str(tenant.id) if tenant else None,
                tenant_email=tenant.email if tenant else None,
                lease_id=str(lease.id) if lease else None,
            ))

    return out
