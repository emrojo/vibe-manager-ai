import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    repo_url: str
    default_branch: str = "main"
    system_prompt_rules: Optional[str] = None
    is_active: bool = True

class ProjectCreate(ProjectBase):
    github_token: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    repo_url: Optional[str] = None
    default_branch: Optional[str] = None
    github_token: Optional[str] = None
    system_prompt_rules: Optional[str] = None
    is_active: Optional[bool] = None

class ProjectRead(ProjectBase):
    id: int
    has_github_token: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)
