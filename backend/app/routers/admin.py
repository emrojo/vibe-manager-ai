import datetime
import secrets
import urllib.parse
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_roles
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.invitation import Invitation
from app.models.project import Project
from app.models.prompt_task import PromptTask
from app.models.user_context import UserContext
from app.models.user_token_log import UserTokenLog
from app.schemas.user import UserRead, UserUpdate
from app.schemas.invitation import InvitationCreate, InvitationRead
from app.schemas.user_context import UserContextRead
from app.schemas.token_quota import AdminUserQuotaRead, AdminUserQuotaUpdate
from app.services.context_cache_service import check_and_refresh_quota

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_roles(["admin"]))]
)

def build_invitation_response(inv: Invitation) -> InvitationRead:
    invite_url = f"{settings.FRONTEND_URL}/register?invite={inv.token}"
    whatsapp_text = f"¡Hola! Te invito a unirte a Vibe Manager AI. Regístrate usando este enlace o código ({inv.code}): {invite_url}"
    whatsapp_url = f"https://wa.me/?text={urllib.parse.quote(whatsapp_text)}"
    email_subject = "Invitación a Vibe Manager AI"
    email_body = f"Hola,\n\nHas recibido una invitación para acceder a Vibe Manager AI.\nTu código es: {inv.code}\nO puedes registrarte directamente haciendo clic en: {invite_url}"
    email_url = f"mailto:?subject={urllib.parse.quote(email_subject)}&body={urllib.parse.quote(email_body)}"

    return InvitationRead(
        id=inv.id,
        code=inv.code,
        token=inv.token,
        invite_url=invite_url,
        max_uses=inv.max_uses,
        used_count=inv.used_count,
        is_active=inv.is_active,
        expires_at=inv.expires_at,
        created_at=inv.created_at,
        whatsapp_share_url=whatsapp_url,
        email_share_url=email_url
    )

@router.get("/stats")
async def get_admin_stats(db: AsyncSession = Depends(get_db)):
    from app.models.repo_validator import RepoValidator
    users_total = (await db.execute(select(func.count(User.id)))).scalar() or 0
    users_banned = (await db.execute(select(func.count(User.id)).where(User.is_banned == True))).scalar() or 0
    project_validators = (await db.execute(select(func.count(func.distinct(RepoValidator.user_id))))).scalar() or 0
    active_repo_validators = (await db.execute(select(func.count(RepoValidator.id)).where(RepoValidator.is_active == True))).scalar() or 0
    
    prompts_total = (await db.execute(select(func.count(PromptTask.id)))).scalar() or 0
    prompts_pending = (await db.execute(select(func.count(PromptTask.id)).where(PromptTask.status == "PENDING"))).scalar() or 0
    prompts_running = (await db.execute(select(func.count(PromptTask.id)).where(PromptTask.status == "RUNNING"))).scalar() or 0
    prompts_completed = (await db.execute(select(func.count(PromptTask.id)).where(PromptTask.status == "COMPLETED"))).scalar() or 0
    
    projects_total = (await db.execute(select(func.count(Project.id)))).scalar() or 0

    return {
        "users": {
            "total": users_total,
            "banned": users_banned,
            "validators": project_validators,
            "repo_validators": active_repo_validators
        },
        "prompts": {
            "total": prompts_total,
            "pending": prompts_pending,
            "running": prompts_running,
            "completed_prs": prompts_completed
        },
        "projects_total": projects_total
    }

@router.get("/users", response_model=List[UserRead])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(skip).limit(limit)
    )
    return result.scalars().all()

@router.post("/users/{user_id}/ban", response_model=UserRead)
async def ban_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes auto-banearte")
        
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    user.is_banned = True
    await db.commit()
    await db.refresh(user)
    return user

@router.post("/users/{user_id}/unban", response_model=UserRead)
async def unban_user(
    user_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    user.is_banned = False
    await db.commit()
    await db.refresh(user)
    return user

@router.post("/users/{user_id}/role", response_model=UserRead)
async def update_user_role(
    user_id: int,
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if user_id == current_user.id and payload.role != "admin":
        raise HTTPException(status_code=400, detail="No puedes quitarte el rol de administrador")
        
    if payload.role not in ["admin", "validator", "user"]:
        raise HTTPException(status_code=400, detail="Rol inválido. Debe ser 'admin', 'validator' o 'user'")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    user.role = payload.role
    await db.commit()
    await db.refresh(user)
    return user

# Invitations
@router.post("/invitations", response_model=InvitationRead)
async def create_invitation(
    payload: InvitationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    code_suffix = secrets.token_hex(3).upper()
    code = f"VIBE-{code_suffix}"
    token = secrets.token_urlsafe(24)
    
    expires_at = None
    if payload.expires_in_days:
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=payload.expires_in_days)
        
    inv = Invitation(
        code=code,
        token=token,
        created_by_id=current_user.id,
        max_uses=payload.max_uses,
        used_count=0,
        is_active=True,
        expires_at=expires_at
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    
    return build_invitation_response(inv)

@router.get("/invitations", response_model=List[InvitationRead])
async def list_invitations(
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Invitation).order_by(Invitation.created_at.desc())
    )
    invitations = result.scalars().all()
    return [build_invitation_response(inv) for inv in invitations]

@router.delete("/invitations/{inv_id}")
async def revoke_invitation(
    inv_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Invitation).where(Invitation.id == inv_id))
    inv = result.scalars().first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitación no encontrada")
        
    inv.is_active = False
    await db.commit()
    return {"message": "Invitación revocada exitosamente"}

# Gemini Settings
class GeminiSettingsUpdate(BaseModel):
    api_key: str
    model: Optional[str] = None

@router.get("/settings/gemini")
async def get_gemini_settings():
    is_set = bool(settings.GEMINI_API_KEY)
    masked = ""
    if is_set:
        key = settings.GEMINI_API_KEY
        masked = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "****"
    return {
        "configured": is_set,
        "masked_key": masked,
        "model": settings.GEMINI_MODEL
    }

@router.post("/settings/gemini")
async def update_gemini_settings(payload: GeminiSettingsUpdate):
    if payload.api_key.strip():
        settings.GEMINI_API_KEY = payload.api_key.strip()
    if payload.model and payload.model.strip():
        settings.GEMINI_MODEL = payload.model.strip()
    return {
        "success": True,
        "configured": bool(settings.GEMINI_API_KEY),
        "model": settings.GEMINI_MODEL
    }

# --- Admin Quotas Management ---

@router.get("/quotas", response_model=List[AdminUserQuotaRead])
async def list_admin_user_quotas(db: AsyncSession = Depends(get_db)):
    """List all users with their 5-hour quota and consumption metrics."""
    res = await db.execute(select(User).order_by(User.id.asc()))
    users = res.scalars().all()

    result = []
    for u in users:
        is_exceeded, used, limit, seconds_left = check_and_refresh_quota(u)

        # Count contexts
        ctx_count_res = await db.execute(select(func.count(UserContext.id)).where(UserContext.user_id == u.id))
        contexts_count = ctx_count_res.scalar() or 0

        # Lifetime tokens
        lifetime_res = await db.execute(
            select(func.coalesce(func.sum(UserTokenLog.tokens_total), 0)).where(UserTokenLog.user_id == u.id)
        )
        total_lifetime = lifetime_res.scalar() or 0

        window_hours = getattr(u, "quota_window_hours", 5) or 5
        window_start = u.quota_window_start or datetime.datetime.utcnow()
        reset_at = window_start + datetime.timedelta(hours=window_hours)
        remaining = max(0, limit - used)
        pct = round(min(100.0, (used / limit * 100.0) if limit > 0 else 0.0), 1)

        result.append(
            AdminUserQuotaRead(
                user_id=u.id,
                email=u.email,
                name=u.name,
                role=u.role,
                is_active=u.is_active,
                is_banned=u.is_banned,
                token_quota_limit=limit,
                tokens_used_in_window=used,
                tokens_remaining=remaining,
                percentage_used=pct,
                quota_window_start=window_start,
                quota_reset_at=reset_at,
                seconds_until_reset=seconds_left,
                is_exceeded=is_exceeded,
                contexts_count=contexts_count,
                total_lifetime_tokens=total_lifetime
            )
        )

    await db.commit()
    return result

@router.put("/quotas/{user_id}", response_model=AdminUserQuotaRead)
async def update_user_quota(
    user_id: int,
    payload: AdminUserQuotaUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Adjust the 5-hour token quota limit for a specific user."""
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if payload.token_quota_limit is not None:
        user.token_quota_limit = payload.token_quota_limit
    if payload.quota_window_hours is not None:
        user.quota_window_hours = payload.quota_window_hours

    await db.commit()
    await db.refresh(user)

    is_exceeded, used, limit, seconds_left = check_and_refresh_quota(user)
    window_hours = getattr(user, "quota_window_hours", 5) or 5
    window_start = user.quota_window_start or datetime.datetime.utcnow()
    reset_at = window_start + datetime.timedelta(hours=window_hours)
    remaining = max(0, limit - used)
    pct = round(min(100.0, (used / limit * 100.0) if limit > 0 else 0.0), 1)

    return AdminUserQuotaRead(
        user_id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        is_active=user.is_active,
        is_banned=user.is_banned,
        token_quota_limit=limit,
        tokens_used_in_window=used,
        tokens_remaining=remaining,
        percentage_used=pct,
        quota_window_start=window_start,
        quota_reset_at=reset_at,
        seconds_until_reset=seconds_left,
        is_exceeded=is_exceeded,
        contexts_count=0,
        total_lifetime_tokens=0
    )

@router.post("/quotas/{user_id}/reset", response_model=AdminUserQuotaRead)
async def reset_user_quota_window(
    user_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Manually reset the 5-hour token window for a user."""
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    now = datetime.datetime.utcnow()
    user.tokens_used_in_window = 0
    user.quota_window_start = now
    await db.commit()
    await db.refresh(user)

    window_hours = getattr(user, "quota_window_hours", 5) or 5
    reset_at = now + datetime.timedelta(hours=window_hours)
    limit = getattr(user, "token_quota_limit", 100000) or 100000

    return AdminUserQuotaRead(
        user_id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        is_active=user.is_active,
        is_banned=user.is_banned,
        token_quota_limit=limit,
        tokens_used_in_window=0,
        tokens_remaining=limit,
        percentage_used=0.0,
        quota_window_start=now,
        quota_reset_at=reset_at,
        seconds_until_reset=window_hours * 3600,
        is_exceeded=False,
        contexts_count=0,
        total_lifetime_tokens=0
    )

# --- Admin Contexts Management ---

@router.get("/contexts", response_model=List[UserContextRead])
async def list_admin_all_contexts(db: AsyncSession = Depends(get_db)):
    """List all personal contexts across all users for admin review."""
    res = await db.execute(
        select(UserContext, User.name, User.email)
        .join(User, UserContext.user_id == User.id)
        .order_by(UserContext.created_at.desc())
    )
    rows = res.all()

    return [
        UserContextRead(
            id=c.id,
            user_id=c.user_id,
            user_name=u_name,
            user_email=u_email,
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
        for c, u_name, u_email in rows
    ]

@router.delete("/contexts/{context_id}")
async def admin_delete_context(
    context_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Admin endpoint to delete any user context."""
    res = await db.execute(select(UserContext).where(UserContext.id == context_id))
    ctx = res.scalars().first()
    if not ctx:
        raise HTTPException(status_code=404, detail="Contexto no encontrado")

    await db.delete(ctx)
    await db.commit()
    return {"message": f"Contexto #{context_id} ('{ctx.identifier}') eliminado por el administrador.", "id": context_id}


