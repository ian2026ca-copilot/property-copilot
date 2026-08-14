from fastapi import Cookie, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User, OrganizationMember, UserRole
from app.models.organization import Organization

bearer = HTTPBearer(auto_error=False)

ROLE_LEVEL = {
    UserRole.OWNER: 4,
    UserRole.TENANT: 1,
}

COOKIE_NAME = "token"
COOKIE_MAX_AGE = 60 * 60 * 48  # 48 hours


def _cookie_flags(secure: bool = False) -> dict:
    """Returns Set-Cookie attributes. Secure=True in production (HTTPS)."""
    return dict(
        key=COOKIE_NAME,
        httponly=True,
        samesite="strict",
        secure=secure,
        path="/",
        max_age=COOKIE_MAX_AGE,
    )


def _extract_token(
    credentials: Optional[HTTPAuthorizationCredentials],
    cookie_token: Optional[str],
) -> str | None:
    """Cookie takes precedence (HttpOnly, set by server). Bearer fallback for API clients."""
    if cookie_token:
        return cookie_token
    if credentials and credentials.credentials:
        return credentials.credentials
    return None


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> tuple[User, OrganizationMember]:
    raw = _extract_token(credentials, request.cookies.get(COOKIE_NAME))
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(raw)
        user_id: str = payload.get("sub")
        org_id: str = payload.get("org_id")
        token_version: int = payload.get("tv", 0)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Fix 2: token version check — logout increments this, instantly invalidating all sessions
    if user.token_version != token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please log in again")

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
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    raw = _extract_token(credentials, request.cookies.get(COOKIE_NAME))
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(raw)
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
    async def dep(current: tuple[User, OrganizationMember] = Depends(get_current_user)):
        _, member = current
        if ROLE_LEVEL.get(member.role, 0) < ROLE_LEVEL[min_role]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires {min_role.value} role or higher",
            )
        return current
    return dep
