import datetime
import re
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

def sanitize_prompt_text(v: str) -> str:
    if not isinstance(v, str):
        return v
    # Filter zero-width and invisible unicode characters
    cleaned = re.sub(r"[\u200B-\u200D\uFEFF\u00A0\u2060]", "", v)
    # Filter ASCII control characters (keep \t and \n, \r)
    cleaned = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", cleaned).strip()
    if len(cleaned) < 5:
        raise ValueError("El prompt debe contener al menos 5 caracteres válidos.")
    if len(cleaned) > 4000:
        raise ValueError("El prompt no puede exceder los 4000 caracteres.")
    return cleaned

class PromptTaskCreate(BaseModel):
    project_id: int
    prompt: str = Field(..., min_length=5, max_length=4000)

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        return sanitize_prompt_text(v)

class PromptTaskEdit(BaseModel):
    edited_prompt: str = Field(..., min_length=5, max_length=4000)

    @field_validator("edited_prompt")
    @classmethod
    def validate_edited_prompt(cls, v: str) -> str:
        return sanitize_prompt_text(v)

class PromptTaskReject(BaseModel):
    rejection_reason: str

class PlanReject(BaseModel):
    rejection_reason: str

class PromptTaskRead(BaseModel):
    id: int
    project_id: int
    project_name: Optional[str] = None
    user_id: int
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    original_prompt: str
    edited_prompt: Optional[str] = None
    status: str
    rejection_reason: Optional[str] = None
    validated_by_id: Optional[int] = None
    validator_name: Optional[str] = None
    branch_name: Optional[str] = None
    commit_message: Optional[str] = None
    pr_url: Optional[str] = None
    pr_number: Optional[int] = None
    execution_stage: Optional[str] = None
    execution_logs: Optional[str] = None
    error_message: Optional[str] = None
    plan_content: Optional[str] = None
    plan_validated_by_id: Optional[int] = None
    plan_validator_name: Optional[str] = None
    plan_validated_at: Optional[datetime.datetime] = None
    plan_rejection_reason: Optional[str] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)
