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
from app.models.user_context import UserContext
from app.config import settings
from app.schemas.prompt_task import PromptTaskCreate, PromptTaskRead
from app.services.context_cache_service import (
    estimate_tokens,
    check_and_refresh_quota,
    try_create_gemini_context_cache
)

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
    context_name = getattr(task, "context", None).name if getattr(task, "context", None) else None

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
        plan_feedback=task.plan_feedback,
        plan_validated_by_id=task.plan_validated_by_id,
        plan_validator_name=getattr(task, "plan_validator", None).name if getattr(task, "plan_validator", None) else None,
        plan_validated_at=task.plan_validated_at,
        plan_rejection_reason=task.plan_rejection_reason,
        context_id=task.context_id,
        context_name=context_name,
        tokens_used=task.tokens_used or 0,
        tokens_fixed_context=task.tokens_fixed_context or 0,
        tokens_temporal_context=task.tokens_temporal_context or 0,
        temporal_context=task.temporal_context,
        temporal_context_status=task.temporal_context_status or "ACTIVE",
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

    # 1. Enforce 5-Hour Token Quota
    is_exceeded, used, limit, seconds_left = check_and_refresh_quota(current_user)
    if is_exceeded:
        minutes_left = max(1, seconds_left // 60)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Has agotado tu cuota de tokens ({used:,}/{limit:,}) para esta ventana de 5 horas. Se reiniciará en {minutes_left} minutos."
        )

    # 2. Check user active tasks quota (max 3 concurrent)
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

    # 3. Resolve Personal Context (Privacy and ACCEPTED status strictly enforced)
    selected_context = None
    if payload.context_id:
        ctx_res = await db.execute(
            select(UserContext).where(
                UserContext.id == payload.context_id,
                UserContext.user_id == current_user.id
            )
        )
        selected_context = ctx_res.scalars().first()
        if not selected_context:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El contexto seleccionado no existe o no tienes permiso para utilizarlo."
            )
        if selected_context.status != "ACCEPTED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El contexto seleccionado '{selected_context.name}' no está disponible (estado actual: {selected_context.status}). Solo se pueden utilizar contextos completamente aceptados por el validador."
            )

    # 4. Resolve optional Temporal Context from another active task
    temporal_context_content = None
    est_temp_tokens = 0
    if payload.temporal_task_id:
        t_res = await db.execute(
            select(PromptTask).where(
                PromptTask.id == payload.temporal_task_id,
                PromptTask.user_id == current_user.id
            )
        )
        temporal_source_task = t_res.scalars().first()
        if temporal_source_task:
            temporal_context_content = temporal_source_task.temporal_context or (
                f"### Contexto Temporal de Tarea #{temporal_source_task.id}\n"
                f"- **Prompt**: {temporal_source_task.edited_prompt or temporal_source_task.original_prompt}\n"
                f"{f'- **Plan en Curso**: {temporal_source_task.plan_content}' if temporal_source_task.plan_content else ''}"
            )
            est_temp_tokens = estimate_tokens(temporal_context_content)

    # 5. Check if estimated total tokens fit in remaining quota
    est_prompt_tokens = estimate_tokens(cleaned_prompt)
    est_ctx_tokens = selected_context.estimated_tokens if selected_context else 0
    total_estimated = est_prompt_tokens + est_ctx_tokens + est_temp_tokens
    if used + total_estimated > limit:
        minutes_left = max(1, seconds_left // 60)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Esta petición excede los tokens restantes de tu cuota de 5 horas. Disponibles: {limit - used:,}, Requeridos: ~{total_estimated:,} (Prompt: {est_prompt_tokens}, Fijo: {est_ctx_tokens}, Temporal: {est_temp_tokens}). Se reiniciará en {minutes_left} minutos."
        )

    # Initialize task's own temporal context
    initial_temporal_context = temporal_context_content if temporal_context_content else f"### Contexto Temporal Inicial\n- **Prompt**: {cleaned_prompt}"

    task = PromptTask(
        project_id=project.id,
        user_id=current_user.id,
        original_prompt=cleaned_prompt,
        status="PENDING",
        repo_validator_id=repo_validator.id if repo_validator else None,
        assigned_validator_id=repo_validator.user_id if repo_validator else None,
        context_id=selected_context.id if selected_context else None,
        tokens_fixed_context=est_ctx_tokens,
        tokens_temporal_context=est_temp_tokens,
        temporal_context=initial_temporal_context,
        temporal_context_status="ACTIVE"
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
            selectinload(PromptTask.repo_validator),
            selectinload(PromptTask.context)
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
            selectinload(PromptTask.repo_validator),
            selectinload(PromptTask.context)
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
        
    # Check permission: admin, author, assigned validator or repo validator owner
    is_owner = task.user_id == current_user.id
    is_assigned = task.assigned_validator_id == current_user.id
    is_repo_owner = bool(task.repo_validator and task.repo_validator.user_id == current_user.id)
    if current_user.role != "admin" and not is_owner and not is_assigned and not is_repo_owner:
        raise HTTPException(status_code=403, detail="No tienes permiso para ver este prompt")

        
    return map_prompt_task(task)

