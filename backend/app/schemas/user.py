import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict

class UserBase(BaseModel):
    email: EmailStr
    name: str

class UserRead(UserBase):
    id: int
    role: str
    is_active: bool
    is_banned: bool
    is_admin: bool = False
    is_project_validator: bool = False
    validated_repos_count: int = 0
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_banned: Optional[bool] = None
    is_active: Optional[bool] = None
