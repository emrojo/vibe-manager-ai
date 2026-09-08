import asyncio
import logging
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.config import settings
from app.database import AsyncSessionLocal
from app.models.prompt_task import PromptTask
from app.models.project import Project
from app.models.user import User
from app.models.user_context import UserContext
from app.models.user_token_log import UserTokenLog
from app.services.ai_gemini import generate_context_plan
from app.services.context_cache_service import check_and_refresh_quota, try_create_gemini_context_cache
from app.services.crypto import decrypt_token
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
    context_text = None
    gemini_cache_name = None
    
    async with AsyncSessionLocal() as db:
        # Mark as RUNNING
        res = await db.execute(
            select(PromptTask)
            .options(
                selectinload(PromptTask.project),
                selectinload(PromptTask.user),
                selectinload(PromptTask.repo_validator),
                selectinload(PromptTask.context)
            )
            .where(PromptTask.id == task_id)
        )
        task = res.scalars().first()
        if not task:
            logger.error(f"[Worker] Tarea #{task_id} no encontrada.")
            return
            
        initial_status = task.status
        plan_content_cached = task.plan_content
        plan_feedback_cached = task.plan_feedback
        mode = "EXECUTE" if initial_status == "PLAN_APPROVED" else "PLAN"

        if task.context:
            context_text = task.context.accepted_text or task.context.context_text
            gemini_cache_name = task.context.gemini_cache_name

        if task.temporal_context:
            if context_text:
                context_text = f"{context_text}\n\n{task.temporal_context}"
            else:
                context_text = task.temporal_context

        task.status = "RUNNING"
        if mode == "PLAN":
            if plan_feedback_cached:
                task.execution_stage = "Re-elaborando plan técnico con Gemini según indicaciones del validador..."
            else:
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
        repo_url = task.repo_validator.repo_url if task.repo_validator else project.repo_url
        raw_token = (
            (task.repo_validator.github_token if task.repo_validator and task.repo_validator.github_token else None)
            or project.github_token
            or settings.GITHUB_TOKEN
        )
        github_token = decrypt_token(raw_token) if raw_token else ""
        default_branch = (
            (task.repo_validator.default_branch if task.repo_validator and task.repo_validator.default_branch else None)
            or project.default_branch
            or "main"
        )
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
            plan_content=plan_content_cached,
            plan_feedback=plan_feedback_cached,
            context_text=context_text,
            cached_content_name=gemini_cache_name
        )
    except Exception as e:
        logger.exception(f"[Worker] Excepción no controlada ejecutando tarea #{task_id}: {e}")
        runner_result = {
            "success": False,
            "error": f"Fallo no controlado en worker: {str(e)}",
            "logs": f"Excepción fatal en worker: {str(e)}"
        }

    # Update task in DB and deduct tokens
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(PromptTask)
            .options(selectinload(PromptTask.user))
            .where(PromptTask.id == task_id)
        )
        task = res.scalars().first()
        if not task:
            return
            
        task.execution_logs = runner_result.get("logs") or runner_result.get("error")
        task.branch_name = runner_result.get("branch_name")
        task.commit_message = runner_result.get("commit_message")
        task.pr_url = runner_result.get("pr_url")
        task.pr_number = runner_result.get("pr_number")

        # Record token usage reported by Gemini runner
        usage_metadata = runner_result.get("usage_metadata") or {}
        prompt_tokens = usage_metadata.get("prompt_tokens", 0)
        completion_tokens = usage_metadata.get("completion_tokens", 0)
        total_tokens = usage_metadata.get("total_tokens") or runner_result.get("tokens_used", 0) or 0
        cached_tokens = usage_metadata.get("cached_tokens", 0)

        if total_tokens > 0:
            task.tokens_used = (task.tokens_used or 0) + total_tokens
            if task.user:
                check_and_refresh_quota(task.user)
                task.user.tokens_used_in_window = (task.user.tokens_used_in_window or 0) + total_tokens
                token_log = UserTokenLog(
                    user_id=task.user.id,
                    task_id=task.id,
                    context_id=task.context_id,
                    tokens_prompt=prompt_tokens,
                    tokens_fixed_context=task.tokens_fixed_context or 0,
                    tokens_temporal_context=task.tokens_temporal_context or 0,
                    tokens_completion=completion_tokens,
                    tokens_total=total_tokens,
                    tokens_cached=cached_tokens
                )
                db.add(token_log)
        
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
                if task.plan_content:
                    plan_snippet = f"\n\n### Plan Técnico Generado:\n{task.plan_content}"
                    task.temporal_context = (task.temporal_context or "") + plan_snippet
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

async def process_context_plan_generation(context_id: int, feedback: str = None):
    """
    Background worker that invokes Gemini to generate or refine a structured Context Plan
    once the raw context has been approved or modified by the validator.
    """
    logger.info(f"[Worker] Generando Plan de Contexto con Gemini para contexto #{context_id}...")
    try:
        async with AsyncSessionLocal() as db:
            res = await db.execute(select(UserContext).where(UserContext.id == context_id))
            context = res.scalars().first()
            if not context:
                logger.error(f"[Worker] Contexto #{context_id} no encontrado.")
                return

            text_to_process = context.edited_text or context.context_text
            current_plan = context.plan_markdown

            # Generate plan using Gemini
            plan_text = await generate_context_plan(
                context_text=text_to_process,
                feedback=feedback,
                current_plan=current_plan,
                api_key=settings.GEMINI_API_KEY,
                model=settings.GEMINI_MODEL
            )

            # Also attempt Gemini context cache
            cache_name, expire_dt = await try_create_gemini_context_cache(
                context_text=text_to_process,
                identifier=context.identifier,
                api_key=settings.GEMINI_API_KEY,
                model=settings.GEMINI_MODEL
            )

            context.plan_markdown = plan_text
            context.plan_feedback = feedback
            context.status = "PLAN_PENDING"
            if cache_name:
                context.gemini_cache_name = cache_name
                context.gemini_cache_expire_time = expire_dt

            await db.commit()
            logger.info(f"[Worker] Plan de Contexto generado exitosamente para contexto #{context_id}. Estado: PLAN_PENDING")
    except Exception as e:
        logger.exception(f"[Worker] Error generando Plan de Contexto para #{context_id}: {e}")

def enqueue_context_plan(context_id: int, feedback: str = None):
    """Schedules async background generation of context plan."""
    asyncio.create_task(process_context_plan_generation(context_id, feedback))


