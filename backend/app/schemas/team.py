import uuid
from typing import Literal
from pydantic import BaseModel, EmailStr
from app.models.user import UserRole


class TeamMemberOut(BaseModel):
    member_id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    email: str
    phone: str = ""
    role: UserRole

    model_config = {"from_attributes": True}


class TeamInvite(BaseModel):
    full_name: str
    email: EmailStr
    role: Literal["MANAGER", "AGENT"]


class RoleUpdate(BaseModel):
    role: Literal["MANAGER", "AGENT"]
