from typing import Optional
from pydantic import BaseModel, EmailStr
from app.schemas.user import UserRead

class UserRegister(BaseModel):
    email: EmailStr
    name: str
    password: str
    invite_code: Optional[str] = None
    invite_token: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
