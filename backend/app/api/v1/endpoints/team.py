import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import hash_password
from app.api.deps import get_current_user, require_min_role
from app.models.user import User, OrganizationMember, UserRole
from app.models.maintenance import Vendor, VendorOrganization
from app.schemas.team import TeamMemberOut, TeamInvite, TeamMemberUpdate

router = APIRouter(prefix="/team", tags=["team"])


def _to_out(member: OrganizationMember, user: User, vendor: Vendor | None = None) -> TeamMemberOut:
    return TeamMemberOut(
        member_id=member.id,
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        phone=user.phone,
        role=member.role,
        business_name=vendor.business_name if vendor else None,
        service_categories=vendor.service_categories if vendor else [],
        is_public=vendor.is_public if vendor else None,
        street_address=vendor.street_address if vendor else None,
        city=vendor.city if vendor else None,
        province=vendor.province if vendor else None,
        postal_code=vendor.postal_code if vendor else None,
        country=vendor.country if vendor else None,
    )


async def _get_vendor_for_user(user_id, db: AsyncSession) -> Vendor | None:
    res = await db.execute(select(Vendor).where(Vendor.user_id == user_id))
    return res.scalar_one_or_none()


@router.get("", response_model=list[TeamMemberOut])
async def list_team(
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(OrganizationMember)
        .where(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.role.in_([UserRole.OWNER, UserRole.VENDOR]),
        )
        .options(selectinload(OrganizationMember.user))
        .order_by(OrganizationMember.created_at)
    )
    members = [m for m in result.scalars().all() if m.user]

    vendor_user_ids = [m.user_id for m in members if m.role == UserRole.VENDOR]
    vendors_by_user = {}
    if vendor_user_ids:
        v_res = await db.execute(select(Vendor).where(Vendor.user_id.in_(vendor_user_ids)))
        vendors_by_user = {v.user_id: v for v in v_res.scalars().all()}

    return [_to_out(m, m.user, vendors_by_user.get(m.user_id)) for m in members]


@router.post("", response_model=TeamMemberOut, status_code=status.HTTP_201_CREATED)
async def invite_member(
    body: TeamInvite,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current

    # Find or create user
    result = await db.execute(select(User).where(User.email == body.email))
    new_user = result.scalar_one_or_none()
    if not new_user:
        new_user = User(
            email=body.email,
            full_name=body.full_name,
            hashed_password=hash_password(secrets.token_urlsafe(16)),
        )
        db.add(new_user)
        await db.flush()

    # Check not already a member
    existing = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.user_id == new_user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User is already a team member")

    new_member = OrganizationMember(
        organization_id=member.organization_id,
        user_id=new_user.id,
        role=UserRole(body.role),
    )
    db.add(new_member)

    if body.role == "VENDOR":
        # Registering a vendor from the Team page always creates them as
        # private — they only work for this organization unless the owner
        # later marks them public from the Vendors page.
        v_res = await db.execute(select(Vendor).where(Vendor.user_id == new_user.id))
        vendor = v_res.scalar_one_or_none()
        if not vendor:
            vendor = Vendor(user_id=new_user.id, business_name=body.full_name, is_public=False)
            db.add(vendor)
            await db.flush()
        elif not vendor.is_public:
            other_link_res = await db.execute(
                select(VendorOrganization).where(
                    VendorOrganization.vendor_id == vendor.id,
                    VendorOrganization.organization_id != member.organization_id,
                )
            )
            if other_link_res.scalar_one_or_none():
                raise HTTPException(status_code=403, detail="This vendor is private and cannot be added to another organization")

        link_res = await db.execute(
            select(VendorOrganization).where(
                VendorOrganization.vendor_id == vendor.id,
                VendorOrganization.organization_id == member.organization_id,
            )
        )
        if not link_res.scalar_one_or_none():
            db.add(VendorOrganization(vendor_id=vendor.id, organization_id=member.organization_id))

    await db.commit()
    await db.refresh(new_member)
    vendor = await _get_vendor_for_user(new_user.id, db) if new_member.role == UserRole.VENDOR else None
    return _to_out(new_member, new_user, vendor)


VENDOR_FIELDS = ("business_name", "service_categories", "is_public", "street_address", "city", "province", "postal_code", "country")


@router.patch("/{member_id}", response_model=TeamMemberOut)
async def update_member(
    member_id: str,
    body: TeamMemberUpdate,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(OrganizationMember)
        .where(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == member.organization_id,
        )
        .options(selectinload(OrganizationMember.user))
    )
    target = result.scalar_one_or_none()
    if not target or not target.user:
        raise HTTPException(status_code=404, detail="Member not found")

    updates = body.model_dump(exclude_none=True)
    for field in ("full_name", "phone"):
        if field in updates:
            setattr(target.user, field, updates[field])

    vendor = None
    if target.role == UserRole.VENDOR:
        vendor = await _get_vendor_for_user(target.user_id, db)
        if vendor:
            for field in VENDOR_FIELDS:
                if field in updates:
                    setattr(vendor, field, updates[field])

    await db.commit()
    await db.refresh(target)
    if vendor:
        await db.refresh(vendor)
    return _to_out(target, target.user, vendor)


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    member_id: str,
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    caller_user, caller_member = current
    result = await db.execute(
        select(OrganizationMember)
        .where(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == caller_member.organization_id,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.user_id == caller_user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    if target.role == UserRole.OWNER:
        owner_count = await db.execute(
            select(func.count()).select_from(OrganizationMember).where(
                OrganizationMember.organization_id == caller_member.organization_id,
                OrganizationMember.role == UserRole.OWNER,
            )
        )
        if owner_count.scalar_one() <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last owner")
    await db.delete(target)
    await db.commit()
