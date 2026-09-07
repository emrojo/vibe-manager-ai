from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models.prompt_task import PromptTask
from app.models.project import Project
from app.models.user import User
from app.models.repo_validator import RepoValidator
from app.schemas.prompt_task import PromptTaskCreate, PromptTaskRead

router = APIRouter(prefix="/prompts", tags=["prompts"])

def map_prompt_task(task: PromptTask) -> PromptTaskRead:
    error_msg = task.error_message
    if not error_msg and task.status in ("FAILED", "STOPPED") and task.execution_logs:
        cleaned_logs = task.execution_logs.strip()
        if cleaned_logs:
            error_msg = cleaned_logs.splitlines()[0]
        else:
            error_msg = "Proceso cancelado o fallido"

    assigned_name = getattr(task, "assigned_validator", None).name if getattr(task, "assigned_validator", None) else None
    assigned_email = getattr(task, "assigned_validator", None).email if getattr(task, "assigned_validator", None) else None
    repo_url = task.repo_validator.repo_url if task.repo_validator else (task.project.repo_url if task.project else None)

    return PromptTaskRead(
        id=task.id,
        project_id=task.project_id,
        project_name=task.project.name if task.project else None,
        repo_url=repo_url,
        repo_validator_id=task.repo_validator_id,
        assigned_validator_id=task.assigned_validator_id,
        assigned_validator_name=assigned_name,
        assigned_validator_email=assigned_email,
        user_id=task.user_id,
        user_name=task.user.name if task.user else None,
        user_email=task.user.email if task.user else None,
        original_prompt=task.original_prompt,
        edited_prompt=task.edited_prompt,
        status=task.status,
        rejection_reason=task.rejection_reason,
        validated_by_id=task.validated_by_id,
        validator_name=task.validator.name if task.validator else None,
        branch_name=task.branch_name,
        commit_message=task.commit_message,
        pr_url=task.pr_url,
        pr_number=task.pr_number,
        execution_stage=task.execution_stage,
        execution_logs=task.execution_logs,
        error_message=error_msg,
        plan_content=task.plan_content,
        plan_validated_by_id=task.plan_validated_by_id,
        plan_validator_name=getattr(task, "plan_validator", None).name if getattr(task, "plan_validator", None) else None,
        plan_validated_at=task.plan_validated_at,
        plan_rejection_reason=task.plan_rejection_reason,
        created_at=task.created_at,
        updated_at=task.updated_at
    )

@router.post("", response_model=PromptTaskRead)
async def submit_prompt(
    payload: PromptTaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repo_validator = None
    project = None

    if payload.repo_validator_id:
        val_res = await db.execute(
            select(RepoValidator)
            .options(selectinload(RepoValidator.project))
            .where(RepoValidator.id == payload.repo_validator_id)
            .where(RepoValidator.is_active == True)
        )
        repo_validator = val_res.scalars().first()
        if not repo_validator:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El validador de repositorio seleccionado no existe o está inactivo."
            )
        project = repo_validator.project
    elif payload.project_id:
        proj_res = await db.execute(select(Project).where(Project.id == payload.project_id))
        project = proj_res.scalars().first()
        if not project or not project.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Proyecto no encontrado o inactivo"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes especificar un proyecto o un validador de repositorio."
        )

    # Check user active tasks quota (max 3 concurrent)
    active_statuses = ["PENDING", "APPROVED", "RUNNING", "PLAN_GENERATED", "PLAN_APPROVED"]
    active_res = await db.execute(
        select(func.count(PromptTask.id))
        .where(PromptTask.user_id == current_user.id)
        .where(PromptTask.status.in_(active_statuses))
    )
    active_count = active_res.scalar_one() or 0
    if active_count >= 3:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Límite alcanzado: Tienes 3 o más tareas activas en cola o ejecución. Espera a que finalicen antes de enviar una nueva."
        )

    cleaned_prompt = payload.prompt.strip()
    if not cleaned_prompt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El prompt no puede estar vacío"
        )

    task = PromptTask(
        project_id=project.id,
        user_id=current_user.id,
        original_prompt=cleaned_prompt,
        status="PENDING",
        repo_validator_id=repo_validator.id if repo_validator else None,
        assigned_validator_id=repo_validator.user_id if repo_validator else None
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    
    # Reload with relations
    res = await db.execute(
        select(PromptTask)
        .options(
            selectinload(PromptTask.project),
            selectinload(PromptTask.user),
            selectinload(PromptTask.validator),
            selectinload(PromptTask.assigned_validator),
            selectinload(PromptTask.plan_validator),
            selectinload(PromptTask.repo_validator)
        )
        .where(PromptTask.id == task.id)
    )
    task_loaded = res.scalars().first()
    return map_prompt_task(task_loaded)

@router.get("/my", response_model=List[PromptTaskRead])
async def list_my_prompts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PromptTask)
        .options(
            selectinload(PromptTask.project),
            selectinload(PromptTask.user),
            selectinload(PromptTask.validator),
            selectinload(PromptTask.assigned_validator),
            selectinload(PromptTask.plan_validator),
            selectinload(PromptTask.repo_validator)
        )
        .where(PromptTask.user_id == current_user.id)
        .order_by(PromptTask.created_at.desc())
    )
    tasks = result.scalars().all()
    return [map_prompt_task(t) for t in tasks]

@router.get("/prs", response_model=List[PromptTaskRead])
async def list_user_pull_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns all Pull Requests generated from prompts submitted by the current user.
    """
    result = await db.execute(
        select(PromptTask)
        .options(
            selectinload(PromptTask.project),
            selectinload(PromptTask.user),
            selectinload(PromptTask.validator),
            selectinload(PromptTask.assigned_validator),
            selectinload(PromptTask.plan_validator),
            selectinload(PromptTask.repo_validator)
        )
        .where(
            PromptTask.user_id == current_user.id,
            PromptTask.pr_url.isnot(None)
        )
        .order_by(PromptTask.created_at.desc())
    )
    tasks = result.scalars().all()
    return [map_prompt_task(t) for t in tasks]

@router.get("/{prompt_id}", response_model=PromptTaskRead)
async def get_prompt_detail(
    prompt_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PromptTask)
        .options(
            selectinload(PromptTask.project),
            selectinload(PromptTask.user),
            selectinload(PromptTask.validator),
            selectinload(PromptTask.assigned_validator),
            selectinload(PromptTask.plan_validator),
            selectinload(PromptTask.repo_validator)
        )
        .where(PromptTask.id == prompt_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Prompt no encontrado")
        
    # Check permission: admin, assigned validator, or author
    if current_user.role != "admin" and task.assigned_validator_id != current_user.id and task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para ver este prompt")
        
    return map_prompt_task(task)

