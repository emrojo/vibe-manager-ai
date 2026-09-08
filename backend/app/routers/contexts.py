import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.user_context import UserContext
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

@router.get("", response_model=List[UserContextRead])
async def list_my_contexts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all personal contexts belonging to the authenticated user."""
    res = await db.execute(
        select(UserContext)
        .where(UserContext.user_id == current_user.id)
        .order_by(UserContext.created_at.desc())
    )
    contexts = res.scalars().all()
    return [
        UserContextRead(
            id=c.id,
            user_id=c.user_id,
            user_name=current_user.name,
            user_email=current_user.email,
            identifier=c.identifier,
            name=c.name,
            description=c.description,
            context_text=c.context_text,
            character_count=c.character_count,
            estimated_tokens=c.estimated_tokens,
            gemini_cache_name=c.gemini_cache_name,
            gemini_cache_expire_time=c.gemini_cache_expire_time,
            created_at=c.created_at,
            updated_at=c.updated_at
        )
        for c in contexts
    ]

@router.post("", response_model=UserContextRead)
async def create_context(
    payload: UserContextCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new personal context with automatic token estimation and Gemini Context Caching."""
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

    char_count = len(payload.context_text)
    token_count = estimate_tokens(payload.context_text)

    # Attempt Gemini context cache creation
    cache_name, expire_dt = await try_create_gemini_context_cache(
        context_text=payload.context_text,
        identifier=payload.identifier,
        api_key=settings.GEMINI_API_KEY,
        model=settings.GEMINI_MODEL
    )

    new_context = UserContext(
        user_id=current_user.id,
        identifier=payload.identifier,
        name=payload.name,
        description=payload.description,
        context_text=payload.context_text,
        character_count=char_count,
        estimated_tokens=token_count,
        gemini_cache_name=cache_name,
        gemini_cache_expire_time=expire_dt
    )

    db.add(new_context)
    await db.commit()
    await db.refresh(new_context)

    return UserContextRead(
        id=new_context.id,
        user_id=new_context.user_id,
        user_name=current_user.name,
        user_email=current_user.email,
        identifier=new_context.identifier,
        name=new_context.name,
        description=new_context.description,
        context_text=new_context.context_text,
        character_count=new_context.character_count,
        estimated_tokens=new_context.estimated_tokens,
        gemini_cache_name=new_context.gemini_cache_name,
        gemini_cache_expire_time=new_context.gemini_cache_expire_time,
        created_at=new_context.created_at,
        updated_at=new_context.updated_at
    )

@router.get("/{context_id}", response_model=UserContextRead)
async def get_context(
    context_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve a personal context ensuring privacy."""
    res = await db.execute(
        select(UserContext).where(
            UserContext.id == context_id,
            UserContext.user_id == current_user.id
        )
    )
    context = res.scalars().first()
    if not context:
        raise HTTPException(status_code=404, detail="Contexto no encontrado o no autorizado")

    return UserContextRead(
        id=context.id,
        user_id=context.user_id,
        user_name=current_user.name,
        user_email=current_user.email,
        identifier=context.identifier,
        name=context.name,
        description=context.description,
        context_text=context.context_text,
        character_count=context.character_count,
        estimated_tokens=context.estimated_tokens,
        gemini_cache_name=context.gemini_cache_name,
        gemini_cache_expire_time=context.gemini_cache_expire_time,
        created_at=context.created_at,
        updated_at=context.updated_at
    )

@router.put("/{context_id}", response_model=UserContextRead)
async def update_context(
    context_id: int,
    payload: UserContextUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a personal context."""
    res = await db.execute(
        select(UserContext).where(
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
    if payload.context_text is not None:
        context.context_text = payload.context_text
        context.character_count = len(context.context_text)
        context.estimated_tokens = estimate_tokens(context.context_text)

        # Refresh Gemini cache
        cache_name, expire_dt = await try_create_gemini_context_cache(
            context_text=context.context_text,
            identifier=context.identifier,
            api_key=settings.GEMINI_API_KEY,
            model=settings.GEMINI_MODEL
        )
        context.gemini_cache_name = cache_name
        context.gemini_cache_expire_time = expire_dt

    await db.commit()
    await db.refresh(context)

    return UserContextRead(
        id=context.id,
        user_id=context.user_id,
        user_name=current_user.name,
        user_email=current_user.email,
        identifier=context.identifier,
        name=context.name,
        description=context.description,
        context_text=context.context_text,
        character_count=context.character_count,
        estimated_tokens=context.estimated_tokens,
        gemini_cache_name=context.gemini_cache_name,
        gemini_cache_expire_time=context.gemini_cache_expire_time,
        created_at=context.created_at,
        updated_at=context.updated_at
    )

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

@router.post("/estimate", response_model=ContextEstimateResponse)
async def estimate_context_and_prompt(
    payload: ContextEstimateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Estimates the combined token cost for a prompt + context against the user's remaining 5h quota."""
    prompt_chars = len(payload.prompt)
    prompt_tokens = estimate_tokens(payload.prompt)

    context_chars = 0
    context_tokens = 0

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
    elif payload.context_text:
        context_chars = len(payload.context_text)
        context_tokens = estimate_tokens(payload.context_text)

    total_chars = prompt_chars + context_chars
    total_tokens = prompt_tokens + context_tokens

    # Check remaining quota
    _, used, limit, _ = check_and_refresh_quota(current_user)
    remaining = max(0, limit - used)

    return ContextEstimateResponse(
        prompt_chars=prompt_chars,
        prompt_tokens_estimated=prompt_tokens,
        context_chars=context_chars,
        context_tokens_estimated=context_tokens,
        total_chars=total_chars,
        total_tokens_estimated=total_tokens,
        fits_in_quota=(total_tokens <= remaining),
        remaining_quota_tokens=remaining
    )
