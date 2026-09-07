import datetime
import re
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

def clean_github_url(url: str) -> str:
    cleaned = url.strip()
    if not cleaned:
        raise ValueError("La URL del repositorio no puede estar vacía.")
    # Match github pattern
    pattern = r"(?:https?://github\.com/|git@github\.com:)([^/]+)/([^/\.]+)(?:\.git)?"
    m = re.search(pattern, cleaned)
    if m:
        return f"https://github.com/{m.group(1)}/{m.group(2)}"
    parts = cleaned.rstrip("/").split("/")
    if len(parts) == 2 and parts[0] and parts[1]:
        return f"https://github.com/{parts[0]}/{parts[1]}"
    raise ValueError("Formato de URL de GitHub inválido. Ejemplo: https://github.com/usuario/repositorio")

class RepoValidatorCreate(BaseModel):
    repo_url: str
    github_token: str = Field(..., min_length=10)
    default_branch: Optional[str] = "main"
    name: Optional[str] = None

    @field_validator("repo_url")
    @classmethod
    def validate_repo_url(cls, v: str) -> str:
        return clean_github_url(v)

    @field_validator("github_token")
    @classmethod
    def validate_token(cls, v: str) -> str:
        s = v.strip()
        if len(s) < 10:
            raise ValueError("El token de GitHub debe tener al menos 10 caracteres.")
        return s

    @field_validator("default_branch")
    @classmethod
    def validate_branch(cls, v: Optional[str]) -> str:
        branch = (v or "main").strip()
        if not re.match(r"^[a-zA-Z0-9_\-\./]+$", branch) or ".." in branch or branch.startswith("/"):
            raise ValueError("Nombre de rama inválido. Solo se permiten caracteres alfanuméricos, guiones y barras.")
        return branch


class RepoValidatorRead(BaseModel):
    id: int
    repo_url: str
    repo_name: str
    default_branch: str
    user_id: int
    validator_name: Optional[str] = None
    validator_email: Optional[str] = None
    project_id: Optional[int] = None
    is_active: bool
    has_github_token: bool = True
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class RepoTargetOption(BaseModel):
    id: int  # repo_validator_id
    project_id: int
    repo_url: str
    repo_name: str
    default_branch: str
    validator_id: int
    validator_name: str
    validator_email: str
    display_label: str

    model_config = ConfigDict(from_attributes=True)
