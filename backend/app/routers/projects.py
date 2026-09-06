from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectRead

router = APIRouter(prefix="/projects", tags=["projects"])

def map_project_read(proj: Project) -> ProjectRead:
    return ProjectRead(
        id=proj.id,
        name=proj.name,
        description=proj.description,
        repo_url=proj.repo_url,
        default_branch=proj.default_branch,
        system_prompt_rules=proj.system_prompt_rules,
        is_active=proj.is_active,
        has_github_token=bool(proj.github_token),
        created_at=proj.created_at,
        updated_at=proj.updated_at
    )

@router.get("", response_model=List[ProjectRead])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Project)
    if current_user.role not in ["admin", "validator"]:
        query = query.where(Project.is_active == True)
    
    result = await db.execute(query.order_by(Project.name.asc()))
    projects = result.scalars().all()
    return [map_project_read(p) for p in projects]

@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    proj = result.scalars().first()
    if not proj:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return map_project_read(proj)

@router.post("", response_model=ProjectRead, dependencies=[Depends(require_roles(["admin"]))])
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db)
):
    new_proj = Project(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        repo_url=payload.repo_url.strip(),
        default_branch=payload.default_branch.strip() or "main",
        github_token=payload.github_token.strip() if payload.github_token else None,
        system_prompt_rules=payload.system_prompt_rules.strip() if payload.system_prompt_rules else None,
        is_active=payload.is_active
    )
    db.add(new_proj)
    await db.commit()
    await db.refresh(new_proj)
    return map_project_read(new_proj)

@router.put("/{project_id}", response_model=ProjectRead, dependencies=[Depends(require_roles(["admin"]))])
async def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    proj = result.scalars().first()
    if not proj:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
        
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "github_token" and value == "":
            setattr(proj, field, None)
        else:
            setattr(proj, field, value)
            
    await db.commit()
    await db.refresh(proj)
    return map_project_read(proj)

@router.delete("/{project_id}", dependencies=[Depends(require_roles(["admin"]))])
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    proj = result.scalars().first()
    if not proj:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
        
    await db.delete(proj)
    await db.commit()
    return {"message": "Proyecto eliminado exitosamente"}
