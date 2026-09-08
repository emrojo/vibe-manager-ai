import asyncio
import json
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from jose import JWTError, jwt

from app.auth import get_current_user, require_roles
from app.config import settings
from app.database import get_db, AsyncSessionLocal
from app.models.prompt_task import PromptTask
from app.models.user_context import UserContext
from app.models.user import User
from app.services.task_streamer import task_stream_manager

logger = logging.getLogger("processes_router")

router = APIRouter(prefix="/processes", tags=["processes"])

@router.get("/active")
async def get_active_processes(
    current_user: User = Depends(require_roles(["admin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns list of real-time running/pending processes and recent executions,
    including both Docker container sandbox tasks and Gemini Context Plan generation tasks.
    """
    # Active in memory
    memory_tasks = task_stream_manager.get_active_tasks()
    active_ids = {t["task_id"] for t in memory_tasks}

    # Query DB for RUNNING, PENDING and recent tasks
    result = await db.execute(
        select(PromptTask)
        .options(selectinload(PromptTask.project), selectinload(PromptTask.user))
        .order_by(PromptTask.updated_at.desc())
        .limit(20)
    )
    db_tasks = result.scalars().all()

    # Query DB for recent / active UserContext items
    ctx_result = await db.execute(
        select(UserContext)
        .options(selectinload(UserContext.user), selectinload(UserContext.repo_validator))
        .order_by(UserContext.updated_at.desc())
        .limit(15)
    )
    db_contexts = ctx_result.scalars().all()

    items = []
    # Index memory tasks by id
    mem_by_id = {t["task_id"]: t for t in memory_tasks}

    for t in db_tasks:
        mem_info = mem_by_id.get(t.id)
        items.append({
            "id": t.id,
            "process_type": "prompt",
            "project_id": t.project_id,
            "project_name": t.project.name if t.project else f"Proyecto #{t.project_id}",
            "user_id": t.user_id,
            "user_name": t.user.name if t.user else t.user.email,
            "original_prompt": t.original_prompt,
            "edited_prompt": t.edited_prompt,
            "status": t.status,
            "stage": mem_info.get("stage") if mem_info else (t.execution_stage or ("En ejecución..." if t.status == "RUNNING" else t.status)),
            "duration_seconds": mem_info.get("duration_seconds") if mem_info else 0,
            "error_message": t.error_message or (mem_info.get("error") if mem_info else None) or (t.execution_logs.strip().splitlines()[0] if t.status in ("FAILED", "STOPPED") and t.execution_logs else None),
            "branch_name": t.branch_name,
            "pr_url": t.pr_url,
            "pr_number": t.pr_number,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat()
        })

    for c in db_contexts:
        is_running = c.status == "APPROVED"  # Gemini actively generating plan
        is_pending = c.status in ("PENDING", "PLAN_PENDING")
        items.append({
            "id": c.id,
            "process_type": "context",
            "project_id": c.repo_validator_id or 0,
            "project_name": f"Contexto: {c.name} (@{c.identifier})",
            "repo_name": c.repo_validator.repo_name if c.repo_validator else None,
            "user_id": c.user_id,
            "user_name": c.user.name if c.user else c.user.email,
            "original_prompt": c.context_text[:300] + ("..." if len(c.context_text) > 300 else ""),
            "edited_prompt": (c.edited_text[:300] + "...") if c.edited_text else None,
            "status": "RUNNING" if is_running else ("PENDING" if is_pending else ("COMPLETED" if c.status == "ACCEPTED" else "FAILED" if c.status == "REJECTED" else c.status)),
            "raw_status": c.status,
            "stage": (
                "Generando Plan Técnico con Gemini..." if c.status == "APPROVED" else
                ("Plan Técnico Generado — Esperando Aprobación" if c.status == "PLAN_PENDING" else
                ("Contexto Aceptado y Activo para Prompts" if c.status == "ACCEPTED" else
                ("En Revisión Inicial de Directivas" if c.status == "PENDING" else f"Contexto {c.status}")))
            ),
            "duration_seconds": 0,
            "error_message": c.rejection_reason if c.status == "REJECTED" else None,
            "branch_name": None,
            "pr_url": None,
            "pr_number": None,
            "estimated_tokens": c.estimated_tokens,
            "gemini_cache_name": c.gemini_cache_name,
            "created_at": c.created_at.isoformat(),
            "updated_at": c.updated_at.isoformat()
        })

    # Sort combined items by updated_at descending
    items.sort(key=lambda x: x["updated_at"], reverse=True)

    return {
        "running_count": sum(1 for item in items if item["status"] == "RUNNING"),
        "pending_count": sum(1 for item in items if item["status"] in ("PENDING", "APPROVED")),
        "stopped_count": sum(1 for item in items if item["status"] == "STOPPED"),
        "context_count": sum(1 for item in items if item.get("process_type") == "context"),
        "prompt_count": sum(1 for item in items if item.get("process_type") == "prompt"),
        "processes": items
    }

@router.get("/{task_id}/details")
async def get_process_details(
    task_id: int,
    current_user: User = Depends(require_roles(["admin"])),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PromptTask)
        .options(selectinload(PromptTask.project), selectinload(PromptTask.user))
        .where(PromptTask.id == task_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    mem_logs = task_stream_manager.get_task_logs(task_id)
    all_logs = "\n".join(mem_logs) if mem_logs else (task.execution_logs or "")

    return {
        "id": task.id,
        "project_name": task.project.name if task.project else f"Proyecto #{task.project_id}",
        "user_name": task.user.name if task.user else task.user.email,
        "status": task.status,
        "execution_stage": task.execution_stage,
        "error_message": task.error_message,
        "branch_name": task.branch_name,
        "commit_message": task.commit_message,
        "pr_url": task.pr_url,
        "pr_number": task.pr_number,
        "logs": all_logs,
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat()
    }

@router.get("/context/{context_id}/details")
async def get_context_process_details(
    context_id: int,
    current_user: User = Depends(require_roles(["admin"])),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(UserContext)
        .options(selectinload(UserContext.repo_validator), selectinload(UserContext.user))
        .where(UserContext.id == context_id)
    )
    context = result.scalars().first()
    if not context:
        raise HTTPException(status_code=404, detail="Contexto no encontrado")

    logs = []
    logs.append(f"Contexto: {context.name} (@{context.identifier})")
    logs.append(f"Estado: {context.status} (Versión {context.version})")
    logs.append(f"Tokens estimados: {context.estimated_tokens} ({context.character_count} caracteres)")
    if context.repo_validator:
        logs.append(f"Repositorio objetivo: {context.repo_validator.repo_name}")
    if context.gemini_cache_name:
        logs.append(f"Caché Gemini Activo: {context.gemini_cache_name}")
    if context.plan_markdown:
        logs.append("\n--- PLAN TÉCNICO DE CONTEXTO GENERADO CON GEMINI ---\n")
        logs.append(context.plan_markdown)
    if context.rejection_reason:
        logs.append(f"\nMotivo de rechazo: {context.rejection_reason}")

    return {
        "id": context.id,
        "process_type": "context",
        "project_name": f"Contexto: {context.name} (@{context.identifier})",
        "user_name": context.user.name if context.user else context.user.email,
        "status": context.status,
        "execution_stage": "Plan Técnico Gemini" if context.status in ("APPROVED", "PLAN_PENDING") else context.status,
        "error_message": context.rejection_reason,
        "branch_name": None,
        "commit_message": None,
        "pr_url": None,
        "pr_number": None,
        "logs": "\n".join(logs),
        "created_at": context.created_at.isoformat(),
        "updated_at": context.updated_at.isoformat()
    }

@router.post("/{task_id}/stop")
async def stop_process(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Stops/cancels a running or queued task immediately.
    Kills the running Docker container or subprocess, and updates database to STOPPED.
    """
    result = await db.execute(
        select(PromptTask)
        .options(selectinload(PromptTask.project), selectinload(PromptTask.user))
        .where(PromptTask.id == task_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    # Permissions: admin, validator, or task author
    if current_user.role not in ("admin", "validator") and task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permisos para detener esta tarea")

    if task.status in ("COMPLETED", "FAILED", "STOPPED", "REJECTED"):
        raise HTTPException(status_code=400, detail=f"La tarea ya está finalizada con estado {task.status}")

    # Case 1: Task in queue (PENDING or APPROVED)
    if task.status in ("PENDING", "APPROVED"):
        task.status = "STOPPED"
        task.execution_stage = "Cancelado antes de ejecución"
        task.error_message = "Tarea cancelada manualmente por el usuario antes de iniciar el sandbox."
        task.execution_logs = (task.execution_logs or "") + "\n[Vibe Manager] Tarea cancelada por el usuario antes de ejecutarse."
        await db.commit()
        await db.refresh(task)
        await task_stream_manager.finish_task(task_id, "STOPPED", error=task.error_message)
        return {
            "success": True,
            "message": f"Tarea #{task_id} cancelada correctamente antes de ejecución.",
            "task_id": task_id,
            "status": "STOPPED"
        }

    # Case 2: Task is RUNNING
    if task.status == "RUNNING":
        await task_stream_manager.stop_task(task_id)
        task.status = "STOPPED"
        task.execution_stage = "Detenido por el usuario"
        task.error_message = "Proceso cancelado/detenido manualmente por el usuario."
        task.execution_logs = (task.execution_logs or "") + "\n⛔ [Vibe Manager] Proceso detenido manualmente por el usuario."
        await db.commit()
        await db.refresh(task)
        return {
            "success": True,
            "message": f"Proceso #{task_id} detenido y sandbox abortado correctamente.",
            "task_id": task_id,
            "status": "STOPPED"
        }

    return {"success": False, "message": "Estado no gestionable"}

@router.websocket("/{task_id}/console")
async def stream_task_console(
    websocket: WebSocket,
    task_id: int,
    token: Optional[str] = None
):
    """
    WebSocket endpoint for real-time console log streaming of a task.
    Requires valid token from admin or validator.
    """
    is_authorized = False
    if token:
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            user_id = int(payload.get("sub"))
            async with AsyncSessionLocal() as db:
                res = await db.execute(select(User).where(User.id == user_id))
                u = res.scalars().first()
                if u and not u.is_banned and u.is_active and u.role == "admin":
                    is_authorized = True
        except Exception:
            is_authorized = False

    if not is_authorized:
        await websocket.accept()
        await websocket.send_json({
            "type": "error",
            "message": "Acceso denegado. Solo los administradores pueden acceder a la consola de ejecución en vivo."
        })
        await websocket.close(code=4003)
        return


    await websocket.accept()

    # Verify task existence and current status
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(PromptTask)
            .options(selectinload(PromptTask.project))
            .where(PromptTask.id == task_id)
        )
        task = res.scalars().first()

    if not task:
        await websocket.send_json({
            "type": "error",
            "message": f"Tarea #{task_id} no encontrada."
        })
        await websocket.close()
        return

    # Send initial status & accumulated logs
    mem_logs = task_stream_manager.get_task_logs(task_id)
    initial_logs = mem_logs if mem_logs else (task.execution_logs.splitlines() if task.execution_logs else [])

    await websocket.send_json({
        "type": "init",
        "task_id": task_id,
        "status": task.status,
        "stage": task.execution_stage or ("En ejecución..." if task.status == "RUNNING" else task.status),
        "error_message": task.error_message,
        "pr_url": task.pr_url,
        "history": initial_logs
    })

    # If task is already completed or failed, we are done
    if task.status in ["COMPLETED", "FAILED", "REJECTED"]:
        await websocket.send_json({
            "type": "finish",
            "task_id": task_id,
            "status": task.status,
            "error": task.error_message,
            "is_terminal": True
        })
        # Keep connection open briefly or wait for client
        try:
            while True:
                data = await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        return

    # If task is still RUNNING, subscribe to live streamer
    q = await task_stream_manager.subscribe(task_id)
    try:
        while True:
            # Wait for next event from streamer
            msg = await q.get()
            await websocket.send_json(msg)
            if msg.get("type") == "finish":
                break
    except WebSocketDisconnect:
        logger.info(f"[WebSocket Console] Cliente desconectado de tarea #{task_id}")
    except Exception as e:
        logger.warning(f"[WebSocket Console] Error en streaming tarea #{task_id}: {e}")
    finally:
        await task_stream_manager.unsubscribe(task_id, q)
