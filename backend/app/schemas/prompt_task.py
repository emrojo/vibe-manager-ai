import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class PromptTaskCreate(BaseModel):
    project_id: int
    prompt: str

class PromptTaskEdit(BaseModel):
    edited_prompt: str

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
