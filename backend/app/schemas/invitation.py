import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class InvitationCreate(BaseModel):
    max_uses: int = 1  # -1 for unlimited
    expires_in_days: Optional[int] = 30

class InvitationRead(BaseModel):
    id: int
    code: str
    token: str
    invite_url: str
    max_uses: int
    used_count: int
    is_active: bool
    expires_at: Optional[datetime.datetime]
    created_at: datetime.datetime
    whatsapp_share_url: str
    email_share_url: str

    model_config = ConfigDict(from_attributes=True)
