from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User, OrganizationMember, UserRole
from app.models.organization import Organization

bearer = HTTPBearer()

ROLE_LEVEL = {
    UserRole.OWNER: 4,
    UserRole.TENANT: 1,
}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> tuple[User, OrganizationMember]:
    try:
        payload = decode_token(credentials.credentials)
        user_id: str = payload.get("sub")
        org_id: str = payload.get("org_id")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    member_result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.user_id == user_id,
            OrganizationMember.organization_id == org_id,
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this org")

    org_result = await db.execute(select(Organization.is_suspended).where(Organization.id == org_id))
    if org_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This organization has been suspended")

    return user, member


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Platform-admin-only auth: a separate JWT shape (no org_id, `is_admin: true`)
    minted by POST /admin/login, entirely independent of the org-scoped
    get_current_user above — an admin isn't a member of any organization."""
    try:
        payload = decode_token(credentials.credentials)
        if not payload.get("is_admin"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user_id: str = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active or not user.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not an admin")

    return user


def require_min_role(min_role: UserRole):
    """Dependency factory: raises 403 if caller's role is below min_role."""
    async def dep(current: tuple[User, OrganizationMember] = Depends(get_current_user)):
        _, member = current
        if ROLE_LEVEL.get(member.role, 0) < ROLE_LEVEL[min_role]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires {min_role.value} role or higher",
            )
        return current
    return dep
