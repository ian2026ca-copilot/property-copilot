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
from app.schemas.team import TeamMemberOut, TeamInvite

router = APIRouter(prefix="/team", tags=["team"])


def _to_out(member: OrganizationMember, user: User) -> TeamMemberOut:
    return TeamMemberOut(
        member_id=member.id,
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        phone=user.phone,
        role=member.role,
    )


@router.get("", response_model=list[TeamMemberOut])
async def list_team(
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    _, member = current
    result = await db.execute(
        select(OrganizationMember)
        .where(OrganizationMember.organization_id == member.organization_id)
        .options(selectinload(OrganizationMember.user))
        .order_by(OrganizationMember.created_at)
    )
    members = result.scalars().all()
    return [_to_out(m, m.user) for m in members if m.user]


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
    return _to_out(new_member, new_user)


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
