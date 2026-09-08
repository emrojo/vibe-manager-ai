import datetime
import re
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

def sanitize_identifier(v: str) -> str:
    cleaned = v.strip().lower()
    cleaned = re.sub(r"[^a-z0-9_-]", "-", cleaned)
    cleaned = re.sub(r"-+", "-", cleaned).strip("-")
    if len(cleaned) < 2:
        raise ValueError("El identificador debe contener al menos 2 caracteres alfanuméricos válidos.")
    if len(cleaned) > 100:
        raise ValueError("El identificador no puede exceder los 100 caracteres.")
    return cleaned

class UserContextCreate(BaseModel):
    identifier: str = Field(..., min_length=2, max_length=100)
    name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    context_text: str = Field(..., min_length=10, max_length=200000)
    repo_validator_id: Optional[int] = None

    @field_validator("identifier")
    @classmethod
    def validate_identifier(cls, v: str) -> str:
        return sanitize_identifier(v)

class UserContextUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    context_text: Optional[str] = Field(None, min_length=10, max_length=200000)
    repo_validator_id: Optional[int] = None

class UserContextRead(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    identifier: str
    name: str
    description: Optional[str] = None
    context_text: str
    character_count: int
    estimated_tokens: int

    # Workflow fields
    status: str
    version: int
    repo_validator_id: Optional[int] = None
    repo_name: Optional[str] = None
    assigned_validator_id: Optional[int] = None
    assigned_validator_name: Optional[str] = None
    edited_text: Optional[str] = None
    accepted_text: Optional[str] = None
    validated_by_id: Optional[int] = None
    validated_by_name: Optional[str] = None
    validated_at: Optional[datetime.datetime] = None
    plan_markdown: Optional[str] = None
    plan_feedback: Optional[str] = None
    plan_validated_by_id: Optional[int] = None
    plan_validator_name: Optional[str] = None
    plan_validated_at: Optional[datetime.datetime] = None
    rejection_reason: Optional[str] = None

    gemini_cache_name: Optional[str] = None
    gemini_cache_expire_time: Optional[datetime.datetime] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class ContextEdit(BaseModel):
    edited_text: str = Field(..., min_length=10, max_length=200000)

class ContextReject(BaseModel):
    reason: str = Field(..., min_length=2, max_length=1000)

class ContextPlanModify(BaseModel):
    plan_markdown: Optional[str] = Field(None, max_length=50000)
    feedback: Optional[str] = Field(None, max_length=2000)

class ContextEstimateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=10000)
    context_id: Optional[int] = None
    context_text: Optional[str] = None
    temporal_task_id: Optional[int] = None
    temporal_context_text: Optional[str] = None

class ContextEstimateResponse(BaseModel):
    prompt_chars: int
    prompt_tokens_estimated: int
    context_chars: int
    context_tokens_estimated: int
    temporal_chars: int = 0
    temporal_tokens_estimated: int = 0
    cached_tokens_estimated: int = 0
    total_chars: int
    total_tokens_estimated: int
    fits_in_quota: bool
    remaining_quota_tokens: int
