from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.project import Project
from app.models.repo_validator import RepoValidator
from app.schemas.repo_validator import RepoValidatorCreate, RepoValidatorRead, RepoTargetOption

router = APIRouter(prefix="/repo-validators", tags=["repo-validators"])

def extract_owner_repo_name(repo_url: str) -> str:
    cleaned = repo_url.strip().rstrip("/").replace(".git", "")
    parts = cleaned.split("/")
    if len(parts) >= 2:
        return f"{parts[-2]}/{parts[-1]}"
    return cleaned

@router.post("", response_model=RepoValidatorRead)
async def register_repo_validator(
    payload: RepoValidatorCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repo_url = payload.repo_url
    repo_name = payload.name or extract_owner_repo_name(repo_url)
    default_branch = payload.default_branch or "main"

    # 1. Find or create underlying Project for this repository
    proj_res = await db.execute(select(Project).where(Project.repo_url == repo_url))
    project = proj_res.scalars().first()
    if not project:
        project = Project(
            name=repo_name,
            repo_url=repo_url,
            default_branch=default_branch,
            is_active=True
        )
        db.add(project)
        await db.commit()
        await db.refresh(project)

    # 2. Check if current user already registered as validator for this repo
    val_res = await db.execute(
        select(RepoValidator)
        .where(RepoValidator.user_id == current_user.id)
        .where(RepoValidator.repo_url == repo_url)
    )
    repo_val = val_res.scalars().first()

    if repo_val:
        # Update existing registration
        repo_val.github_token = payload.github_token
        repo_val.default_branch = default_branch
        repo_val.repo_name = repo_name
        repo_val.project_id = project.id
        repo_val.is_active = True
    else:
        # Create new RepoValidator
        repo_val = RepoValidator(
            repo_url=repo_url,
            repo_name=repo_name,
            default_branch=default_branch,
            github_token=payload.github_token,
            user_id=current_user.id,
            project_id=project.id,
            is_active=True
        )
        db.add(repo_val)

    await db.commit()
    await db.refresh(repo_val)

    return RepoValidatorRead(
        id=repo_val.id,
        repo_url=repo_val.repo_url,
        repo_name=repo_val.repo_name,
        default_branch=repo_val.default_branch,
        user_id=repo_val.user_id,
        validator_name=current_user.name,
        validator_email=current_user.email,
        project_id=repo_val.project_id,
        is_active=repo_val.is_active,
        has_github_token=True,
        created_at=repo_val.created_at,
        updated_at=repo_val.updated_at
    )

@router.get("/targets", response_model=List[RepoTargetOption])
async def list_repo_targets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns all selectable repository + validator targets for prompt submission.
    """
    res = await db.execute(
        select(RepoValidator)
        .options(selectinload(RepoValidator.validator), selectinload(RepoValidator.project))
        .where(RepoValidator.is_active == True)
        .order_by(RepoValidator.repo_url.asc())
    )
    validators = res.scalars().all()

    target_options: List[RepoTargetOption] = []
    seen_project_ids = set()

    for v in validators:
        val_name = v.validator.name if v.validator else "Validador"
        val_email = v.validator.email if v.validator else ""
        label = f"{v.repo_url} — Validador: {val_name}"
        if val_email:
            label += f" ({val_email})"

        target_options.append(
            RepoTargetOption(
                id=v.id,
                project_id=v.project_id or 0,
                repo_url=v.repo_url,
                repo_name=v.repo_name,
                default_branch=v.default_branch,
                validator_id=v.user_id,
                validator_name=val_name,
                validator_email=val_email,
                display_label=label
            )
        )
        if v.project_id:
            seen_project_ids.add(v.project_id)

    # Backward compatibility: include projects created by admin that don't have a RepoValidator yet
    proj_res = await db.execute(
        select(Project).where(Project.is_active == True)
    )
    for p in proj_res.scalars().all():
        if p.id not in seen_project_ids and p.github_token:
            target_options.append(
                RepoTargetOption(
                    id=0,  # Legacy indicator
                    project_id=p.id,
                    repo_url=p.repo_url,
                    repo_name=p.name,
                    default_branch=p.default_branch,
                    validator_id=0,
                    validator_name="Administración",
                    validator_email="admin@vibemanager.ai",
                    display_label=f"{p.repo_url} — Validador: Administración"
                )
            )

    return target_options

@router.get("/my", response_model=List[RepoValidatorRead])
async def list_my_validated_repos(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(RepoValidator)
        .options(selectinload(RepoValidator.validator))
        .where(RepoValidator.user_id == current_user.id)
        .order_by(RepoValidator.created_at.desc())
    )
    res = await db.execute(query)
    validators = res.scalars().all()

    return [
        RepoValidatorRead(
            id=v.id,
            repo_url=v.repo_url,
            repo_name=v.repo_name,
            default_branch=v.default_branch,
            user_id=v.user_id,
            validator_name=current_user.name,
            validator_email=current_user.email,
            project_id=v.project_id,
            is_active=v.is_active,
            has_github_token=bool(v.github_token),
            created_at=v.created_at,
            updated_at=v.updated_at
        )
        for v in validators
    ]

@router.delete("/{validator_id}")
async def delete_repo_validator(
    validator_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(RepoValidator).where(RepoValidator.id == validator_id))
    val = res.scalars().first()
    if not val:
        raise HTTPException(status_code=404, detail="Registro de validador no encontrado")

    if current_user.role != "admin" and val.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para eliminar este registro")

    await db.delete(val)
    await db.commit()
    return {"success": True, "message": "Registro de validador eliminado correctamente"}
