from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from app.schemas.user import UserRead

class UserRegister(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=8, max_length=128, description="Contraseña de al menos 8 caracteres")
    invite_code: Optional[str] = None
    invite_token: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
