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
from app.schemas.user import UserRead, UserUpdate
from app.schemas.invitation import InvitationCreate, InvitationRead

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

