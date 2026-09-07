import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models.prompt_task import PromptTask
from app.models.user import User
from app.schemas.prompt_task import PromptTaskRead, PromptTaskEdit, PromptTaskReject, PlanReject
from app.routers.prompts import map_prompt_task
from app.services.queue_worker import enqueue_prompt_task

router = APIRouter(
    prefix="/validation",
    tags=["validation"],
    dependencies=[Depends(require_roles(["validator", "admin"]))]
)

@router.get("/tasks", response_model=List[PromptTaskRead])
async def list_validation_tasks(
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(PromptTask)
        .options(
            selectinload(PromptTask.project),
            selectinload(PromptTask.user),
            selectinload(PromptTask.validator),
            selectinload(PromptTask.plan_validator)
        )
        .order_by(PromptTask.created_at.desc())
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
    result = await db.execute(
        select(PromptTask)
        .options(selectinload(PromptTask.project), selectinload(PromptTask.user), selectinload(PromptTask.validator))
        .where(PromptTask.id == task_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

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
    result = await db.execute(
        select(PromptTask)
        .options(selectinload(PromptTask.project), selectinload(PromptTask.user), selectinload(PromptTask.validator))
        .where(PromptTask.id == task_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

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
    result = await db.execute(
        select(PromptTask)
        .options(selectinload(PromptTask.project), selectinload(PromptTask.user), selectinload(PromptTask.validator))
        .where(PromptTask.id == task_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

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
    result = await db.execute(
        select(PromptTask)
        .options(
            selectinload(PromptTask.project),
            selectinload(PromptTask.user),
            selectinload(PromptTask.validator),
            selectinload(PromptTask.plan_validator)
        )
        .where(PromptTask.id == task_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    if task.status != "PLAN_PENDING":
        raise HTTPException(status_code=400, detail="Solo se pueden aprobar tareas en estado 'PLAN_PENDING'")

    task.status = "PLAN_APPROVED"
    task.plan_validated_by_id = current_user.id
    task.plan_validated_at = datetime.datetime.utcnow()
    task.plan_rejection_reason = None
    task.execution_stage = "Plan aprobado - Encolando ejecución en sandbox..."

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
    result = await db.execute(
        select(PromptTask)
        .options(
            selectinload(PromptTask.project),
            selectinload(PromptTask.user),
            selectinload(PromptTask.validator),
            selectinload(PromptTask.plan_validator)
        )
        .where(PromptTask.id == task_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    if task.status != "PLAN_PENDING":
        raise HTTPException(status_code=400, detail="Solo se pueden rechazar tareas en estado 'PLAN_PENDING'")

    task.status = "REJECTED"
    task.plan_rejection_reason = payload.rejection_reason.strip()
    task.plan_validated_by_id = current_user.id
    task.plan_validated_at = datetime.datetime.utcnow()
    task.execution_stage = "Plan rechazado por el validador"

    await db.commit()
    await db.refresh(task)

    return map_prompt_task(task)

@router.post("/tasks/{task_id}/retry", response_model=PromptTaskRead)
async def retry_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PromptTask)
        .options(
            selectinload(PromptTask.project),
            selectinload(PromptTask.user),
            selectinload(PromptTask.validator),
            selectinload(PromptTask.plan_validator)
        )
        .where(PromptTask.id == task_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

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
