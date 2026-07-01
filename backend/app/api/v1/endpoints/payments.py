import os
from datetime import date, timedelta
from calendar import monthrange

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user, require_min_role
from app.models.user import User, OrganizationMember, UserRole
from app.models.payment import Payment, PaymentStatus, PaymentType
from app.models.lease import Lease
from app.models.property import Unit, Property
from app.schemas.payment import PaymentCreate, PaymentUpdate, PaymentOut

router = APIRouter(prefix="/payments", tags=["payments"])


def _uploads_url(filename: str) -> str:
    base = os.getenv("FRONTEND_URL", "http://localhost:3001").replace(":3001", ":8002").replace(":3000", ":8002")
    return f"{base}/uploads/{filename}"


def _compute_status(p: Payment) -> PaymentStatus:
    """Treat PENDING/DUE past due_date as OVERDUE."""
    if p.status in (PaymentStatus.PENDING, PaymentStatus.DUE) and p.due_date < date.today():
        return PaymentStatus.OVERDUE
    if p.status == PaymentStatus.DUE:
        return PaymentStatus.PENDING
    if p.status == PaymentStatus.LATE:
        return PaymentStatus.OVERDUE
    return p.status


def _to_out(payment: Payment, lease: Lease | None) -> PaymentOut:
    tenant = lease.tenant if lease else None
    unit = lease.unit if lease else None
    return PaymentOut(
        id=payment.id,
        lease_id=payment.lease_id,
        amount=float(payment.amount),
        due_date=payment.due_date,
        paid_date=payment.paid_date,
        status=_compute_status(payment),
        payment_type=payment.payment_type,
        description=payment.description,
        notes=payment.notes,
        tenant_name=tenant.display_name if tenant else None,
        tenant_avatar_url=_uploads_url(tenant.avatar_filename) if tenant and tenant.avatar_filename else None,
        unit_number=unit.unit_number if unit else None,
        property_name=unit.property.name if unit and unit.property else None,
    )


async def _load_lease(lease_id, db: AsyncSession) -> Lease | None:
    result = await db.execute(
        select(Lease).where(Lease.id == lease_id)
        .options(selectinload(Lease.tenant), selectinload(Lease.unit).selectinload(Unit.property))
    )
    return result.scalar_one_or_none()


def generate_monthly_payments(lease: Lease, org_id) -> list[Payment]:
    """Create one PENDING RENT payment per calendar month of the lease."""
    payments = []
    cur = date(lease.start_date.year, lease.start_date.month, 1)
    end = date(lease.end_date.year, lease.end_date.month, 1)
    while cur <= end:
        due = date(cur.year, cur.month, 1)
        payments.append(Payment(
            organization_id=org_id,
            lease_id=lease.id,
            tenant_user_id=lease.tenant_user_id,
            amount=float(lease.monthly_rent),
            due_date=due,
            status=PaymentStatus.PENDING,
            payment_type=PaymentType.RENT,
            description=f"Rent — {cur.strftime('%B %Y')}",
        ))
        # advance one month
        if cur.month == 12:
            cur = date(cur.year + 1, 1, 1)
        else:
            cur = date(cur.year, cur.month + 1, 1)
    return payments


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=list[PaymentOut])
async def list_payments(
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, member = current
    query = (
        select(Payment)
        .where(Payment.organization_id == member.organization_id)
        .options(selectinload(Payment.lease).selectinload(Lease.tenant),
                 selectinload(Payment.lease).selectinload(Lease.unit).selectinload(Unit.property))
        .order_by(Payment.due_date.desc())
    )
    # Tenants see only their own payments
    if member.role == UserRole.TENANT:
        query = query.where(Payment.tenant_user_id == user.id)

    result = await db.execute(query)
    rows = result.scalars().all()
    return [_to_out(p, p.lease) for p in rows]


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def create_payment(
    body: PaymentCreate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    lease = await _load_lease(body.lease_id, db)
    if not lease or str(lease.organization_id) != str(member.organization_id):
        raise HTTPException(status_code=404, detail="Lease not found")

    pay_status = PaymentStatus.PAID if body.paid_date else PaymentStatus.PENDING
    payment = Payment(
        organization_id=member.organization_id,
        lease_id=body.lease_id,
        tenant_user_id=lease.tenant_user_id,
        amount=body.amount,
        due_date=body.due_date,
        paid_date=body.paid_date,
        status=pay_status,
        payment_type=body.payment_type,
        description=body.description,
        notes=body.notes,
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)
    lease = await _load_lease(payment.lease_id, db)
    return _to_out(payment, lease)


@router.patch("/{payment_id}", response_model=PaymentOut)
async def update_payment(
    payment_id: str,
    body: PaymentUpdate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(Payment).where(Payment.id == payment_id, Payment.organization_id == member.organization_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    data = body.model_dump(exclude_none=True)
    # Auto-set status to PAID if paid_date is provided without explicit status
    if "paid_date" in data and "status" not in data:
        data["status"] = PaymentStatus.PAID
    for field, value in data.items():
        setattr(payment, field, value)
    await db.commit()
    await db.refresh(payment)
    lease = await _load_lease(payment.lease_id, db)
    return _to_out(payment, lease)


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def void_payment(
    payment_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(Payment).where(Payment.id == payment_id, Payment.organization_id == member.organization_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    payment.status = PaymentStatus.VOIDED
    await db.commit()
