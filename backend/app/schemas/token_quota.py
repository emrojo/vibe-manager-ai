import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

class UserTokenLogRead(BaseModel):
    id: int
    user_id: int
    task_id: Optional[int] = None
    context_id: Optional[int] = None
    context_name: Optional[str] = None
    tokens_prompt: int
    tokens_completion: int
    tokens_total: int
    tokens_cached: int
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class UserQuotaStatusRead(BaseModel):
    token_quota_limit: int
    tokens_used_in_window: int
    tokens_remaining: int
    percentage_used: float
    quota_window_hours: int
    quota_window_start: datetime.datetime
    quota_reset_at: datetime.datetime
    seconds_until_reset: int
    is_exceeded: bool = False
    recent_logs: List[UserTokenLogRead] = []

class AdminUserQuotaUpdate(BaseModel):
    token_quota_limit: Optional[int] = Field(None, ge=10, le=10000000)
    quota_window_hours: Optional[int] = Field(None, ge=1, le=72)

class AdminUserQuotaRead(BaseModel):
    user_id: int
    email: str
    name: str
    role: str
    is_active: bool
    is_banned: bool
    token_quota_limit: int
    tokens_used_in_window: int
    tokens_remaining: int
    percentage_used: float
    quota_window_start: datetime.datetime
    quota_reset_at: datetime.datetime
    seconds_until_reset: int
    is_exceeded: bool = False
    contexts_count: int = 0
    total_lifetime_tokens: int = 0
