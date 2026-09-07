import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_password_hash, verify_password, create_access_token, get_current_user
from app.database import get_db
from app.models.user import User
from app.models.invitation import Invitation
from app.schemas.auth import UserRegister, UserLogin, TokenResponse
from app.schemas.user import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])

@router.get("/verify-invite")
async def verify_invite(
    token: str = None,
    code: str = None,
    db: AsyncSession = Depends(get_db)
):
    if not token and not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes proporcionar un código o un token de invitación"
        )
        
    query = select(Invitation).where(Invitation.is_active == True)
    if token:
        query = query.where(Invitation.token == token)
    elif code:
        query = query.where(Invitation.code == code)
        
    result = await db.execute(query)
    invitation = result.scalars().first()
    
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Código o enlace de invitación inválido"
        )
        
    if invitation.expires_at and invitation.expires_at < datetime.datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La invitación ha expirado"
        )
        
    if invitation.max_uses != -1 and invitation.used_count >= invitation.max_uses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La invitación ha alcanzado el límite máximo de usos"
        )
        
    return {"valid": True, "code": invitation.code, "token": invitation.token}

@router.post("/register", response_model=TokenResponse)
async def register(
    payload: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    # Check if any admin exists. If no users exist, allow first user as admin without invite.
    users_count_res = await db.execute(select(User))
    first_user = users_count_res.scalars().first() is None

    invitation = None
    if not first_user:
        if not payload.invite_code and not payload.invite_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Se requiere un código o enlace de invitación para registrarse"
            )
        
        query = select(Invitation).where(Invitation.is_active == True)
        if payload.invite_token:
            query = query.where(Invitation.token == payload.invite_token)
        elif payload.invite_code:
            query = query.where(Invitation.code == payload.invite_code)
            
        result = await db.execute(query)
        invitation = result.scalars().first()
        
        if not invitation:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Código o enlace de invitación inválido"
            )
            
        if invitation.expires_at and invitation.expires_at < datetime.datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La invitación ha expirado"
            )
            
        if invitation.max_uses != -1 and invitation.used_count >= invitation.max_uses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La invitación ha alcanzado su límite de usos"
            )

    # Check email duplicate
    email_res = await db.execute(select(User).where(User.email == payload.email.lower()))
    if email_res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe una cuenta con este correo electrónico"
        )

    # Determine role
    role = "admin" if first_user else "user"

    new_user = User(
        email=payload.email.lower(),
        name=payload.name.strip(),
        hashed_password=get_password_hash(payload.password),
        role=role,
        is_active=True,
        is_banned=False,
        invited_by_id=invitation.created_by_id if invitation else None
    )
    db.add(new_user)
    
    if invitation:
        invitation.used_count += 1

    await db.commit()
    await db.refresh(new_user)

    token = create_access_token(data={"sub": str(new_user.id), "role": new_user.role})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserRead.model_validate(new_user)
    )

@router.post("/login", response_model=TokenResponse)
async def login(
    payload: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = result.scalars().first()
    
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos"
        )
        
    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta ha sido suspendida por el administrador."
        )
        
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta está inactiva."
        )

    token = create_access_token(data={"sub": str(user.id), "role": user.role})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserRead.model_validate(user)
    )

@router.get("/me", response_model=UserRead)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from app.models.repo_validator import RepoValidator
    from sqlalchemy import func

    count_res = await db.execute(
        select(func.count(RepoValidator.id))
        .where(RepoValidator.user_id == current_user.id)
        .where(RepoValidator.is_active == True)
    )
    val_count = count_res.scalar_one() or 0

    return UserRead(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        is_active=current_user.is_active,
        is_banned=current_user.is_banned,
        is_admin=(current_user.role == "admin"),
        is_project_validator=(val_count > 0),
        validated_repos_count=val_count,
        created_at=current_user.created_at
    )
