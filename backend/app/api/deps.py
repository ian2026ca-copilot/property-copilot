from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User, OrganizationMember, UserRole

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

    return user, member


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
