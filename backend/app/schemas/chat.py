import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

class ChatMessageCreate(BaseModel):
    recipient_id: int
    content: str = Field(..., min_length=1, max_length=4000)

class ChatMessageRead(BaseModel):
    id: int
    sender_id: int
    recipient_id: int
    sender_name: Optional[str] = None
    recipient_name: Optional[str] = None
    content: str
    is_read: bool
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class ChatThreadRead(BaseModel):
    other_user_id: int
    other_user_name: str
    other_user_email: str
    other_user_role: str
    unread_count: int
    last_message: Optional[str] = None
    last_message_at: Optional[datetime.datetime] = None
