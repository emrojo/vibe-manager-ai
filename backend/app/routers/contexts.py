import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.repo_validator import RepoValidator
from app.models.user_context import UserContext
from app.models.prompt_task import PromptTask
from app.schemas.user_context import (
    UserContextCreate,
    UserContextUpdate,
    UserContextRead,
    ContextEstimateRequest,
    ContextEstimateResponse
)
from app.services.context_cache_service import (
    estimate_tokens,
    check_and_refresh_quota,
    try_create_gemini_context_cache
)

router = APIRouter(prefix="/contexts", tags=["contexts"])

def map_user_context(c: UserContext) -> UserContextRead:
    return UserContextRead(
        id=c.id,
        user_id=c.user_id,
        user_name=c.user.name if c.user else None,
        user_email=c.user.email if c.user else None,
        identifier=c.identifier,
        name=c.name,
        description=c.description,
        context_text=c.context_text,
        character_count=c.character_count,
        estimated_tokens=c.estimated_tokens,
        status=c.status,
        version=c.version,
        repo_validator_id=c.repo_validator_id,
        repo_name=c.repo_validator.repo_name if c.repo_validator else None,
        assigned_validator_id=c.assigned_validator_id,
        assigned_validator_name=c.assigned_validator.name if c.assigned_validator else None,
        edited_text=c.edited_text,
        accepted_text=c.accepted_text,
        validated_by_id=c.validated_by_id,
        validated_by_name=c.validator.name if c.validator else None,
        validated_at=c.validated_at,
        plan_markdown=c.plan_markdown,
        plan_feedback=c.plan_feedback,
        plan_validated_by_id=c.plan_validated_by_id,
        plan_validator_name=c.plan_validator.name if c.plan_validator else None,
        plan_validated_at=c.plan_validated_at,
        rejection_reason=c.rejection_reason,
        gemini_cache_name=c.gemini_cache_name,
        gemini_cache_expire_time=c.gemini_cache_expire_time,
        created_at=c.created_at,
        updated_at=c.updated_at
    )

def context_query_options():
    return [
        selectinload(UserContext.user),
        selectinload(UserContext.repo_validator),
        selectinload(UserContext.assigned_validator),
        selectinload(UserContext.validator),
        selectinload(UserContext.plan_validator)
    ]

@router.get("", response_model=List[UserContextRead])
async def list_my_contexts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all personal contexts belonging to the authenticated user."""
    res = await db.execute(
        select(UserContext)
        .options(*context_query_options())
        .where(UserContext.user_id == current_user.id)
        .order_by(UserContext.created_at.desc())
    )
    contexts = res.scalars().all()
    return [map_user_context(c) for c in contexts]

@router.get("/accepted", response_model=List[UserContextRead])
async def list_my_accepted_contexts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List only personal contexts that have been fully ACCEPTED by the validator and ready for prompts."""
    res = await db.execute(
        select(UserContext)
        .options(*context_query_options())
        .where(
            UserContext.user_id == current_user.id,
            UserContext.status == "ACCEPTED"
        )
        .order_by(UserContext.updated_at.desc())
    )
    contexts = res.scalars().all()
    return [map_user_context(c) for c in contexts]

@router.post("", response_model=UserContextRead)
async def create_context(
    payload: UserContextCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new personal context with initial status PENDING for validator review."""
    # Check if identifier already exists for this user
    existing = await db.execute(
        select(UserContext).where(
            UserContext.user_id == current_user.id,
            UserContext.identifier == payload.identifier
        )
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya tienes un contexto con el identificador '{payload.identifier}'. Usa otro nombre o edita el existente."
        )

    assigned_validator_id = None
    if payload.repo_validator_id:
        rv_res = await db.execute(
            select(RepoValidator).where(
                RepoValidator.id == payload.repo_validator_id,
                RepoValidator.is_active == True
            )
        )
        repo_validator = rv_res.scalars().first()
        if not repo_validator:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El validador de repositorio seleccionado no existe o está inactivo."
            )
        assigned_validator_id = repo_validator.user_id

    char_count = len(payload.context_text)
    token_count = estimate_tokens(payload.context_text)

    new_context = UserContext(
        user_id=current_user.id,
        identifier=payload.identifier,
        name=payload.name,
        description=payload.description,
        context_text=payload.context_text,
        character_count=char_count,
        estimated_tokens=token_count,
        status="PENDING",
        version=1,
        repo_validator_id=payload.repo_validator_id,
        assigned_validator_id=assigned_validator_id
    )

    db.add(new_context)
    await db.commit()

    # Reload with relationships
    res = await db.execute(
        select(UserContext)
        .options(*context_query_options())
        .where(UserContext.id == new_context.id)
    )
    loaded_context = res.scalars().first()
    return map_user_context(loaded_context)

@router.get("/{context_id}", response_model=UserContextRead)
async def get_context(
    context_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve a personal context ensuring privacy."""
    res = await db.execute(
        select(UserContext)
        .options(*context_query_options())
        .where(
            UserContext.id == context_id,
            UserContext.user_id == current_user.id
        )
    )
    context = res.scalars().first()
    if not context:
        raise HTTPException(status_code=404, detail="Contexto no encontrado o no autorizado")

    return map_user_context(context)

@router.put("/{context_id}", response_model=UserContextRead)
async def update_context(
    context_id: int,
    payload: UserContextUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update or iterate on a personal context.
    If context_text or repo validator is modified, the version increments and re-enters PENDING validation.
    """
    res = await db.execute(
        select(UserContext)
        .options(*context_query_options())
        .where(
            UserContext.id == context_id,
            UserContext.user_id == current_user.id
        )
    )
    context = res.scalars().first()
    if not context:
        raise HTTPException(status_code=404, detail="Contexto no encontrado o no autorizado")

    if payload.name is not None:
        context.name = payload.name.strip()
    if payload.description is not None:
        context.description = payload.description.strip()

    is_text_changed = payload.context_text is not None and payload.context_text.strip() != context.context_text.strip()
    is_validator_changed = payload.repo_validator_id is not None and payload.repo_validator_id != context.repo_validator_id

    if is_validator_changed:
        context.repo_validator_id = payload.repo_validator_id
        rv_res = await db.execute(
            select(RepoValidator).where(
                RepoValidator.id == payload.repo_validator_id,
                RepoValidator.is_active == True
            )
        )
        rv = rv_res.scalars().first()
        context.assigned_validator_id = rv.user_id if rv else None

    if is_text_changed or is_validator_changed:
        # Re-iterate context through validation workflow
        if payload.context_text is not None:
            context.context_text = payload.context_text
            context.character_count = len(context.context_text)
            context.estimated_tokens = estimate_tokens(context.context_text)

        context.version = (context.version or 1) + 1
        context.status = "PENDING"
        context.edited_text = None
        context.accepted_text = None
        context.plan_markdown = None
        context.plan_feedback = None
        context.rejection_reason = None
        context.validated_by_id = None
        context.validated_at = None
        context.plan_validated_by_id = None
        context.plan_validated_at = None

    await db.commit()

    # Reload with relationships
    res = await db.execute(
        select(UserContext)
        .options(*context_query_options())
        .where(UserContext.id == context.id)
    )
    loaded_context = res.scalars().first()
    return map_user_context(loaded_context)

@router.delete("/{context_id}")
async def delete_context(
    context_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a personal context."""
    res = await db.execute(
        select(UserContext).where(
            UserContext.id == context_id,
            UserContext.user_id == current_user.id
        )
    )
    context = res.scalars().first()
    if not context:
        raise HTTPException(status_code=404, detail="Contexto no encontrado o no autorizado")

    await db.delete(context)
    await db.commit()
    return {"message": "Contexto eliminado exitosamente", "id": context_id}

@router.get("/temporal/active")
async def list_active_temporal_tasks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List user's active tasks that carry a temporal context available to be chained."""
    active_statuses = ["PENDING", "APPROVED", "PLAN_PENDING", "PLAN_APPROVED", "RUNNING"]
    res = await db.execute(
        select(PromptTask)
        .where(
            PromptTask.user_id == current_user.id,
            PromptTask.status.in_(active_statuses),
            PromptTask.temporal_context.isnot(None)
        )
        .order_by(PromptTask.created_at.desc())
    )
    tasks = res.scalars().all()
    return [
        {
            "id": t.id,
            "original_prompt": t.original_prompt,
            "status": t.status,
            "context_id": t.context_id,
            "tokens_estimated": estimate_tokens(t.temporal_context or t.original_prompt),
            "character_count": len(t.temporal_context or t.original_prompt),
            "created_at": t.created_at
        }
        for t in tasks
    ]

@router.post("/estimate", response_model=ContextEstimateResponse)
async def estimate_context_and_prompt(
    payload: ContextEstimateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Estimates the granular token cost for prompt + fixed context + temporal context against the user's remaining 5h quota."""
    prompt_chars = len(payload.prompt)
    prompt_tokens = estimate_tokens(payload.prompt)

    context_chars = 0
    context_tokens = 0
    cached_tokens = 0

    if payload.context_id:
        res = await db.execute(
            select(UserContext).where(
                UserContext.id == payload.context_id,
                UserContext.user_id == current_user.id
            )
        )
        ctx = res.scalars().first()
        if ctx:
            context_chars = ctx.character_count
            context_tokens = ctx.estimated_tokens
            if ctx.gemini_cache_name:
                cached_tokens = context_tokens
    elif payload.context_text:
        context_chars = len(payload.context_text)
        context_tokens = estimate_tokens(payload.context_text)

    temporal_chars = 0
    temporal_tokens = 0

    if payload.temporal_task_id:
        t_res = await db.execute(
            select(PromptTask).where(
                PromptTask.id == payload.temporal_task_id,
                PromptTask.user_id == current_user.id
            )
        )
        t_task = t_res.scalars().first()
        if t_task and t_task.temporal_context:
            temporal_chars = len(t_task.temporal_context)
            temporal_tokens = estimate_tokens(t_task.temporal_context)
    elif payload.temporal_context_text:
        temporal_chars = len(payload.temporal_context_text)
        temporal_tokens = estimate_tokens(payload.temporal_context_text)

    total_chars = prompt_chars + context_chars + temporal_chars
    total_tokens = prompt_tokens + context_tokens + temporal_tokens

    # Check remaining quota
    _, used, limit, _ = check_and_refresh_quota(current_user)
    remaining = max(0, limit - used)

    return ContextEstimateResponse(
        prompt_chars=prompt_chars,
        prompt_tokens_estimated=prompt_tokens,
        context_chars=context_chars,
        context_tokens_estimated=context_tokens,
        temporal_chars=temporal_chars,
        temporal_tokens_estimated=temporal_tokens,
        cached_tokens_estimated=cached_tokens,
        total_chars=total_chars,
        total_tokens_estimated=total_tokens,
        fits_in_quota=(total_tokens <= remaining),
        remaining_quota_tokens=remaining
    )
