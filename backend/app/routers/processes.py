import asyncio
import json
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db, AsyncSessionLocal
from app.models.prompt_task import PromptTask
from app.models.user import User
from app.services.task_streamer import task_stream_manager

logger = logging.getLogger("processes_router")

router = APIRouter(prefix="/processes", tags=["processes"])

@router.get("/active")
async def get_active_processes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns list of real-time running/pending processes and recent executions.
    """
    # Active in memory
    memory_tasks = task_stream_manager.get_active_tasks()
    active_ids = {t["task_id"] for t in memory_tasks}

    # Query DB for RUNNING, PENDING and recent 15 tasks
    result = await db.execute(
        select(PromptTask)
        .options(selectinload(PromptTask.project), selectinload(PromptTask.user))
        .order_by(PromptTask.updated_at.desc())
        .limit(20)
    )
    db_tasks = result.scalars().all()

    items = []
    # Index memory tasks by id
    mem_by_id = {t["task_id"]: t for t in memory_tasks}

    for t in db_tasks:
        mem_info = mem_by_id.get(t.id)
        items.append({
            "id": t.id,
            "project_id": t.project_id,
            "project_name": t.project.name if t.project else f"Proyecto #{t.project_id}",
            "user_id": t.user_id,
            "user_name": t.user.name if t.user else t.user.email,
            "original_prompt": t.original_prompt,
            "edited_prompt": t.edited_prompt,
            "status": t.status,
            "stage": mem_info.get("stage") if mem_info else (t.execution_stage or ("En ejecución..." if t.status == "RUNNING" else t.status)),
            "duration_seconds": mem_info.get("duration_seconds") if mem_info else 0,
            "error_message": t.error_message or (mem_info.get("error") if mem_info else None),
            "branch_name": t.branch_name,
            "pr_url": t.pr_url,
            "pr_number": t.pr_number,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat()
        })

    return {
        "running_count": sum(1 for item in items if item["status"] == "RUNNING"),
        "pending_count": sum(1 for item in items if item["status"] == "PENDING"),
        "processes": items
    }

@router.get("/{task_id}/details")
async def get_process_details(
    task_id: int,
    current_user: User = Depends(get_current_user),
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

@router.websocket("/{task_id}/console")
async def stream_task_console(websocket: WebSocket, task_id: int):
    """
    WebSocket endpoint for real-time console log streaming of a task.
    Sends existing logs upon connect, then streams new lines as they arrive.
    """
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
