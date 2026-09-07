import asyncio
import logging
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.config import settings
from app.database import AsyncSessionLocal
from app.models.prompt_task import PromptTask
from app.models.project import Project
from app.models.user import User
from app.services.docker_runner import execute_task_sandbox
from app.services.task_streamer import task_stream_manager

logger = logging.getLogger("queue_worker")

async def process_prompt_task(task_id: int):
    """
    Background worker processing an approved prompt task inside sandbox.
    """
    logger.info(f"[Worker] Iniciando procesamiento de tarea #{task_id}...")
    
    project_name = "Proyecto"
    user_name = "Usuario"
    
    async with AsyncSessionLocal() as db:
        # Mark as RUNNING
        res = await db.execute(
            select(PromptTask)
            .options(selectinload(PromptTask.project), selectinload(PromptTask.user))
            .where(PromptTask.id == task_id)
        )
        task = res.scalars().first()
        if not task:
            logger.error(f"[Worker] Tarea #{task_id} no encontrada.")
            return
            
        initial_status = task.status
        plan_content_cached = task.plan_content
        mode = "EXECUTE" if initial_status == "PLAN_APPROVED" else "PLAN"

        task.status = "RUNNING"
        if mode == "PLAN":
            task.execution_stage = "Elaborando plan técnico en sandbox..."
        else:
            task.execution_stage = "Aplicando cambios y creando Pull Request en sandbox..."
        task.error_message = None
        await db.commit()
        
        project = task.project
        if not project:
            task.status = "FAILED"
            task.execution_stage = "FAILED"
            task.error_message = "Proyecto no encontrado en la base de datos."
            task.execution_logs = "Error: El proyecto asociado a la tarea no existe."
            await db.commit()
            await task_stream_manager.finish_task(task_id, "FAILED", error=task.error_message)
            return
            
        project_name = project.name
        user_name = task.user.name if task.user else "Usuario"
        prompt_text = task.edited_prompt if task.edited_prompt else task.original_prompt
        repo_url = project.repo_url
        github_token = project.github_token or settings.GITHUB_TOKEN
        default_branch = project.default_branch or "main"
        project_rules = project.system_prompt_rules

    # Start task tracking in stream manager
    await task_stream_manager.start_task(
        task_id=task_id,
        project_name=project_name,
        user_name=user_name
    )

    # Execute sandbox
    try:
        runner_result = await execute_task_sandbox(
            task_id=task_id,
            repo_url=repo_url,
            prompt=prompt_text,
            github_token=github_token,
            default_branch=default_branch,
            project_rules=project_rules,
            gemini_api_key=settings.GEMINI_API_KEY,
            gemini_model=settings.GEMINI_MODEL,
            mode=mode,
            plan_content=plan_content_cached
        )
    except Exception as e:
        logger.exception(f"[Worker] Excepción no controlada ejecutando tarea #{task_id}: {e}")
        runner_result = {
            "success": False,
            "error": f"Fallo no controlado en worker: {str(e)}",
            "logs": f"Excepción fatal en worker: {str(e)}"
        }

    # Update task in DB
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(PromptTask).where(PromptTask.id == task_id))
        task = res.scalars().first()
        if not task:
            return
            
        task.execution_logs = runner_result.get("logs") or runner_result.get("error")
        task.branch_name = runner_result.get("branch_name")
        task.commit_message = runner_result.get("commit_message")
        task.pr_url = runner_result.get("pr_url")
        task.pr_number = runner_result.get("pr_number")
        
        if runner_result.get("stopped") or task.status == "STOPPED":
            task.status = "STOPPED"
            task.execution_stage = "Detenido por el usuario"
            task.error_message = runner_result.get("error") or "Proceso cancelado/detenido manualmente."
        elif runner_result.get("success"):
            if mode == "PLAN":
                task.status = "PLAN_PENDING"
                task.execution_stage = "Plan generado - Pendiente de validación"
                task.plan_content = runner_result.get("plan_markdown")
                task.error_message = None
            else:
                task.status = "COMPLETED"
                task.execution_stage = "COMPLETED"
                task.error_message = None
        else:
            task.status = "FAILED"
            task.execution_stage = "FAILED"
            task.error_message = runner_result.get("error") or "Error en la ejecución del runner"
            
        await db.commit()
        logger.info(f"[Worker] Tarea #{task_id} finalizada con estado: {task.status}")

    # Notify finish in streamer
    await task_stream_manager.finish_task(
        task_id=task_id,
        status=task.status,
        error=task.error_message,
        result=runner_result
    )

def enqueue_prompt_task(task_id: int):
    """Schedules async background execution without blocking request."""
    asyncio.create_task(process_prompt_task(task_id))

