import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import hash_password
from app.api.deps import get_current_user, require_min_role
from app.models.user import User, OrganizationMember, UserRole
from app.schemas.team import TeamMemberOut, TeamInvite, RoleUpdate

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
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
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
    current: tuple[User, OrganizationMember] = Depends(require_min_role(UserRole.MANAGER)),
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
    await db.commit()
    await db.refresh(new_member)
    return _to_out(new_member, new_user)


@router.put("/{member_id}", response_model=TeamMemberOut)
async def update_member_role(
    member_id: str,
    body: RoleUpdate,
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
        .options(selectinload(OrganizationMember.user))
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.role == UserRole.OWNER:
        raise HTTPException(status_code=400, detail="Cannot change the owner's role")
    target.role = UserRole(body.role)
    await db.commit()
    await db.refresh(target)
    return _to_out(target, target.user)


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
        raise HTTPException(status_code=400, detail="Cannot remove the owner")
    await db.delete(target)
    await db.commit()
