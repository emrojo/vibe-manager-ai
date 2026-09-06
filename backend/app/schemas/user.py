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
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_banned: Optional[bool] = None
    is_active: Optional[bool] = None
