from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models.prompt_task import PromptTask
from app.models.project import Project
from app.models.user import User
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

    return PromptTaskRead(
        id=task.id,
        project_id=task.project_id,
        project_name=task.project.name if task.project else None,
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
    # Verify project exists and is active
    proj_res = await db.execute(select(Project).where(Project.id == payload.project_id))
    project = proj_res.scalars().first()
    if not project or not project.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proyecto no encontrado o inactivo"
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
        status="PENDING"
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    
    # Reload with relations
    res = await db.execute(
        select(PromptTask)
        .options(selectinload(PromptTask.project), selectinload(PromptTask.user))
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
            selectinload(PromptTask.validator)
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
            selectinload(PromptTask.validator)
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
            selectinload(PromptTask.validator)
        )
        .where(PromptTask.id == prompt_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Prompt no encontrado")
        
    # Check permission
    if current_user.role not in ["admin", "validator"] and task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para ver este prompt")
        
    return map_prompt_task(task)
