"""One-off script to create (or promote) a platform admin account. There is
no public signup path for admins — run this yourself once, interactively:

    docker compose exec backend python -m app.scripts.promote_admin
"""
import asyncio
import getpass

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import User


async def main() -> None:
    email = input("Admin email: ").strip().lower()
    full_name = input("Full name: ").strip()
    password = getpass.getpass("Password: ")
    if not email or not password:
        print("Email and password are required.")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            user.is_platform_admin = True
            user.hashed_password = hash_password(password)
            if full_name:
                user.full_name = full_name
            print(f"Promoted existing user {email} to platform admin.")
        else:
            user = User(
                email=email,
                full_name=full_name or email,
                hashed_password=hash_password(password),
                is_platform_admin=True,
            )
            db.add(user)
            print(f"Created new platform admin {email}.")
        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())
