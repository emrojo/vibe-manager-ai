import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user, require_project_validator_or_admin
from app.database import get_db
from app.models.prompt_task import PromptTask
from app.models.user import User
from app.models.user_context import UserContext
from app.schemas.prompt_task import PromptTaskRead, PromptTaskEdit, PromptTaskReject, PlanReject, PlanModify
from app.schemas.user_context import UserContextRead, ContextEdit, ContextReject, ContextPlanModify
from app.routers.prompts import map_prompt_task
from app.routers.contexts import map_user_context, context_query_options
from app.services.queue_worker import enqueue_prompt_task, enqueue_context_plan
from app.services.context_cache_service import estimate_tokens

router = APIRouter(
    prefix="/validation",
    tags=["validation"],
    dependencies=[Depends(require_project_validator_or_admin)]
)

async def get_task_for_validation(task_id: int, current_user: User, db: AsyncSession) -> PromptTask:
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
        .where(PromptTask.id == task_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    if current_user.role != "admin" and task.assigned_validator_id and task.assigned_validator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para validar esta tarea. Solo el validador asignado al repositorio o un administrador pueden validarla."
        )
    return task

@router.get("/tasks", response_model=List[PromptTaskRead])
async def list_validation_tasks(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(PromptTask)
        .options(
            selectinload(PromptTask.project),
            selectinload(PromptTask.user),
            selectinload(PromptTask.validator),
            selectinload(PromptTask.assigned_validator),
            selectinload(PromptTask.plan_validator),
            selectinload(PromptTask.repo_validator)
        )
        .order_by(PromptTask.created_at.desc())
    )

    if current_user.role != "admin":
        query = query.where(
            or_(
                PromptTask.assigned_validator_id == current_user.id,
                PromptTask.assigned_validator_id.is_(None),
                PromptTask.validated_by_id == current_user.id,
                PromptTask.plan_validated_by_id == current_user.id
            )
        )

    if status_filter:
        query = query.where(PromptTask.status == status_filter.upper())

    result = await db.execute(query)
    tasks = result.scalars().all()
    return [map_prompt_task(t) for t in tasks]

@router.put("/tasks/{task_id}/edit", response_model=PromptTaskRead)
async def edit_task_prompt(
    task_id: int,
    payload: PromptTaskEdit,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    task = await get_task_for_validation(task_id, current_user, db)

    if task.status not in ["PENDING", "REJECTED"]:
        raise HTTPException(status_code=400, detail="Solo se pueden editar prompts pendientes o rechazados")

    task.edited_prompt = payload.edited_prompt.strip()
    await db.commit()
    await db.refresh(task)
    return map_prompt_task(task)

@router.post("/tasks/{task_id}/approve", response_model=PromptTaskRead)
async def approve_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    task = await get_task_for_validation(task_id, current_user, db)

    if task.status in ["RUNNING", "COMPLETED"]:
        raise HTTPException(status_code=400, detail="La tarea ya fue procesada o está en ejecución")

    task.status = "APPROVED"
    task.validated_by_id = current_user.id
    task.validated_at = datetime.datetime.utcnow()
    task.rejection_reason = None
    
    await db.commit()
    await db.refresh(task)

    # Trigger background worker inside Docker sandbox
    enqueue_prompt_task(task.id)

    return map_prompt_task(task)

@router.post("/tasks/{task_id}/reject", response_model=PromptTaskRead)
async def reject_task(
    task_id: int,
    payload: PromptTaskReject,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    task = await get_task_for_validation(task_id, current_user, db)

    task.status = "REJECTED"
    task.rejection_reason = payload.rejection_reason.strip()
    task.validated_by_id = current_user.id
    task.validated_at = datetime.datetime.utcnow()

    await db.commit()
    await db.refresh(task)
    return map_prompt_task(task)

@router.post("/tasks/{task_id}/approve-plan", response_model=PromptTaskRead)
async def approve_task_plan(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    task = await get_task_for_validation(task_id, current_user, db)

    if task.status != "PLAN_PENDING":
        raise HTTPException(status_code=400, detail="Solo se pueden aprobar tareas en estado 'PLAN_PENDING'")

    task.status = "PLAN_APPROVED"
    task.plan_validated_by_id = current_user.id
    task.plan_validated_at = datetime.datetime.utcnow()
    task.plan_rejection_reason = None
    task.execution_stage = "Plan aprobado - Encolando ejecución en sandbox..."

    # Evolution: Merge temporal context into fixed context if attached
    if task.context_id:
        ctx_res = await db.execute(
            select(UserContext).where(UserContext.id == task.context_id)
        )
        ctx = ctx_res.scalars().first()
        if ctx:
            prompt_str = task.edited_prompt or task.original_prompt
            evolution_entry = (
                f"\n\n## 🔄 Evolución Incorporada (Plan Aprobado - Tarea #{task.id})\n"
                f"- **Requerimiento / Prompt**: {prompt_str}\n"
                f"- **Directivas del Plan Aceptado**:\n{task.plan_content or 'Plan técnico ejecutado.'}\n"
            )
            base_text = ctx.accepted_text or ctx.edited_text or ctx.context_text
            new_text = base_text.strip() + evolution_entry
            ctx.context_text = new_text
            ctx.accepted_text = new_text
            ctx.character_count = len(new_text)
            ctx.estimated_tokens = estimate_tokens(new_text)
            ctx.version = (ctx.version or 1) + 1
            ctx.updated_at = datetime.datetime.utcnow()
            task.temporal_context_status = "MERGED"
    else:
        task.temporal_context_status = "MERGED"

    await db.commit()
    await db.refresh(task)

    enqueue_prompt_task(task.id)

    return map_prompt_task(task)

@router.post("/tasks/{task_id}/reject-plan", response_model=PromptTaskRead)
async def reject_task_plan(
    task_id: int,
    payload: PlanReject,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    task = await get_task_for_validation(task_id, current_user, db)

    if task.status != "PLAN_PENDING":
        raise HTTPException(status_code=400, detail="Solo se pueden rechazar tareas en estado 'PLAN_PENDING'")

    task.status = "REJECTED"
    task.temporal_context_status = "DISCARDED"
    task.plan_rejection_reason = payload.rejection_reason.strip()
    task.plan_validated_by_id = current_user.id
    task.plan_validated_at = datetime.datetime.utcnow()
    task.execution_stage = "Plan rechazado por el validador"

    await db.commit()
    await db.refresh(task)

    return map_prompt_task(task)

@router.post("/tasks/{task_id}/modify-plan", response_model=PromptTaskRead)
async def modify_task_plan(
    task_id: int,
    payload: PlanModify,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    task = await get_task_for_validation(task_id, current_user, db)

    if task.status != "PLAN_PENDING":
        raise HTTPException(status_code=400, detail="Solo se pueden modificar tareas en estado 'PLAN_PENDING'")

    # Save edited plan if provided
    if payload.edited_plan is not None and payload.edited_plan.strip():
        task.plan_content = payload.edited_plan.strip()

    # Save modification feedback/prompt for Gemini
    task.plan_feedback = payload.modification_prompt.strip()

    # Append to temporal context
    feedback_entry = (
        f"\n\n### Ajustes de Plan solicitados por Validador:\n"
        f"- **Instrucciones**: {payload.modification_prompt.strip()}\n"
        f"{f'- **Plan previo revisado**: {payload.edited_plan.strip()}' if payload.edited_plan else ''}"
    )
    task.temporal_context = (task.temporal_context or "") + feedback_entry

    # Reset validation status so it re-generates the plan
    task.status = "APPROVED"
    task.plan_validated_by_id = current_user.id
    task.plan_validated_at = None
    task.plan_rejection_reason = None
    task.error_message = None
    task.execution_stage = "Plan modificado - Encolando regeneración con Gemini..."

    await db.commit()
    await db.refresh(task)

    enqueue_prompt_task(task.id)

    return map_prompt_task(task)

@router.post("/tasks/{task_id}/retry", response_model=PromptTaskRead)
async def retry_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    task = await get_task_for_validation(task_id, current_user, db)

    if task.plan_content and task.plan_validated_at and not task.plan_rejection_reason:
        task.status = "PLAN_APPROVED"
        task.execution_stage = "Reintentando ejecución de cambios..."
    else:
        task.status = "APPROVED"
        task.validated_by_id = current_user.id
        task.validated_at = datetime.datetime.utcnow()
        task.execution_stage = "Reintentando generación de plan..."

    task.error_message = None
    task.execution_logs = "Reintentando ejecución..."
    await db.commit()
    await db.refresh(task)

    enqueue_prompt_task(task.id)
    return map_prompt_task(task)

# ---------------------------------------------------------------------------
# Context Validation Endpoints
# ---------------------------------------------------------------------------

async def get_context_for_validation(context_id: int, current_user: User, db: AsyncSession) -> UserContext:
    res = await db.execute(
        select(UserContext)
        .options(*context_query_options())
        .where(UserContext.id == context_id)
    )
    context = res.scalars().first()
    if not context:
        raise HTTPException(status_code=404, detail="Contexto no encontrado")

    if current_user.role != "admin" and context.assigned_validator_id and context.assigned_validator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para validar este contexto. Solo el validador asignado al repositorio o un administrador pueden validarlo."
        )
    return context

@router.get("/contexts", response_model=List[UserContextRead])
async def list_validation_contexts(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List contexts pending validation for the authenticated validator or admin."""
    query = (
        select(UserContext)
        .options(*context_query_options())
        .order_by(UserContext.updated_at.desc())
    )

    if current_user.role != "admin":
        query = query.where(
            or_(
                UserContext.assigned_validator_id == current_user.id,
                UserContext.assigned_validator_id.is_(None),
                UserContext.validated_by_id == current_user.id,
                UserContext.plan_validated_by_id == current_user.id
            )
        )

    if status_filter and status_filter.upper() != "ALL":
        query = query.where(UserContext.status == status_filter.upper())
    elif status_filter and status_filter.upper() == "ALL":
        pass  # Return all contexts without status restriction
    else:
        # Default: show active validation contexts
        query = query.where(UserContext.status.in_(["PENDING", "APPROVED", "PLAN_PENDING"]))

    res = await db.execute(query)
    contexts = res.scalars().all()
    return [map_user_context(c) for c in contexts]

@router.put("/contexts/{context_id}/edit", response_model=UserContextRead)
async def edit_context_text(
    context_id: int,
    payload: ContextEdit,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Validator edits raw context text before approving it."""
    context = await get_context_for_validation(context_id, current_user, db)
    if context.status != "PENDING":
        raise HTTPException(status_code=400, detail="Solo se pueden editar contextos en estado 'PENDING'")

    context.edited_text = payload.edited_text.strip()
    await db.commit()
    await db.refresh(context)
    return map_user_context(context)

@router.post("/contexts/{context_id}/approve", response_model=UserContextRead)
async def approve_context_raw(
    context_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Validator approves raw context text.
    Transitions status to APPROVED and triggers Gemini to generate the Context Plan (PLAN_PENDING).
    """
    context = await get_context_for_validation(context_id, current_user, db)
    if context.status != "PENDING":
        raise HTTPException(status_code=400, detail="Solo se pueden aprobar contextos en estado 'PENDING'")

    context.status = "APPROVED"
    context.validated_by_id = current_user.id
    context.validated_at = datetime.datetime.utcnow()
    context.rejection_reason = None

    await db.commit()
    await db.refresh(context)

    # Trigger async generation of Context Plan with Gemini
    enqueue_context_plan(context.id)

    return map_user_context(context)

@router.post("/contexts/{context_id}/reject", response_model=UserContextRead)
async def reject_context(
    context_id: int,
    payload: ContextReject,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Validator rejects context during raw review."""
    context = await get_context_for_validation(context_id, current_user, db)
    if context.status != "PENDING":
        raise HTTPException(status_code=400, detail="Solo se pueden rechazar contextos en estado 'PENDING'")

    context.status = "REJECTED"
    context.rejection_reason = payload.reason.strip()
    context.validated_by_id = current_user.id
    context.validated_at = datetime.datetime.utcnow()

    await db.commit()
    await db.refresh(context)
    return map_user_context(context)

@router.post("/contexts/{context_id}/approve-plan", response_model=UserContextRead)
async def approve_context_plan(
    context_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Validator approves the Gemini-generated Context Plan.
    Context becomes ACCEPTED and can now be selected in prompt tasks!
    """
    context = await get_context_for_validation(context_id, current_user, db)
    if context.status != "PLAN_PENDING":
        raise HTTPException(status_code=400, detail="Solo se puede aprobar el plan de contextos en estado 'PLAN_PENDING'")

    context.status = "ACCEPTED"
    context.accepted_text = context.edited_text or context.context_text
    context.plan_validated_by_id = current_user.id
    context.plan_validated_at = datetime.datetime.utcnow()
    context.rejection_reason = None

    await db.commit()
    await db.refresh(context)
    return map_user_context(context)

@router.post("/contexts/{context_id}/modify-plan", response_model=UserContextRead)
async def modify_context_plan(
    context_id: int,
    payload: ContextPlanModify,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Validator modifies the Context Plan or provides feedback/prompt for Gemini to regenerate it.
    """
    context = await get_context_for_validation(context_id, current_user, db)
    if context.status != "PLAN_PENDING":
        raise HTTPException(status_code=400, detail="Solo se pueden modificar contextos en estado 'PLAN_PENDING'")

    if payload.plan_markdown is not None and payload.plan_markdown.strip():
        context.plan_markdown = payload.plan_markdown.strip()

    if payload.feedback is not None and payload.feedback.strip():
        context.plan_feedback = payload.feedback.strip()
        context.status = "APPROVED"
        context.plan_validated_by_id = current_user.id
        context.plan_validated_at = None
        context.rejection_reason = None
        await db.commit()
        await db.refresh(context)
        # Re-trigger Gemini generation with feedback
        enqueue_context_plan(context.id, feedback=payload.feedback.strip())
        return map_user_context(context)

    await db.commit()
    await db.refresh(context)
    return map_user_context(context)

@router.post("/contexts/{context_id}/reject-plan", response_model=UserContextRead)
async def reject_context_plan(
    context_id: int,
    payload: ContextReject,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Validator rejects the Context Plan."""
    context = await get_context_for_validation(context_id, current_user, db)
    if context.status != "PLAN_PENDING":
        raise HTTPException(status_code=400, detail="Solo se pueden rechazar planes de contexto en estado 'PLAN_PENDING'")

    context.status = "REJECTED"
    context.rejection_reason = payload.reason.strip()
    context.plan_validated_by_id = current_user.id
    context.plan_validated_at = datetime.datetime.utcnow()

    await db.commit()
    await db.refresh(context)
    return map_user_context(context)

