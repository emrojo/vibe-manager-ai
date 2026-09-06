import asyncio
import logging
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.prompt_task import PromptTask
from app.models.project import Project
from app.services.docker_runner import execute_task_sandbox

logger = logging.getLogger("queue_worker")

async def process_prompt_task(task_id: int):
    """
    Background worker processing an approved prompt task inside sandbox.
    """
    logger.info(f"[Worker] Iniciando procesamiento de tarea #{task_id}...")
    
    async with AsyncSessionLocal() as db:
        # Mark as RUNNING
        res = await db.execute(select(PromptTask).where(PromptTask.id == task_id))
        task = res.scalars().first()
        if not task:
            logger.error(f"[Worker] Tarea #{task_id} no encontrada.")
            return
            
        task.status = "RUNNING"
        await db.commit()
        
        # Get project
        proj_res = await db.execute(select(Project).where(Project.id == task.project_id))
        project = proj_res.scalars().first()
        if not project:
            task.status = "FAILED"
            task.execution_logs = "Proyecto no encontrado en base de datos."
            await db.commit()
            return
            
        prompt_text = task.edited_prompt if task.edited_prompt else task.original_prompt
        repo_url = project.repo_url
        github_token = project.github_token or settings.GITHUB_TOKEN
        default_branch = project.default_branch or "main"
        project_rules = project.system_prompt_rules

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
            gemini_model=settings.GEMINI_MODEL
        )
    except Exception as e:
        runner_result = {
            "success": False,
            "error": str(e),
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
        
        if runner_result.get("success"):
            task.status = "COMPLETED"
        else:
            task.status = "FAILED"
            
        await db.commit()
        logger.info(f"[Worker] Tarea #{task_id} finalizada con estado: {task.status}")

def enqueue_prompt_task(task_id: int):
    """Schedules async background execution without blocking request."""
    asyncio.create_task(process_prompt_task(task_id))
