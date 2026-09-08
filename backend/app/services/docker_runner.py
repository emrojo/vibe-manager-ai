import os
import sys
import json
import base64
import logging
import tempfile
import asyncio
import shutil
import subprocess
from typing import Optional, Dict, Any, List

from app.config import settings
from app.services.task_streamer import task_stream_manager

logger = logging.getLogger("docker_runner")

def mask_secrets(text: Optional[str], secrets: list) -> str:
    if not text or not isinstance(text, str):
        return text or ""
    masked = text
    for s in secrets:
        if s and isinstance(s, str) and len(s) >= 4:
            masked = masked.replace(s, "***REDACTED***")
    return masked

async def execute_task_sandbox(
    task_id: int,
    repo_url: str,
    prompt: str,
    github_token: Optional[str] = None,
    default_branch: str = "main",
    project_rules: Optional[str] = None,
    gemini_api_key: Optional[str] = None,
    gemini_model: Optional[str] = None,
    mode: str = "EXECUTE",
    plan_content: Optional[str] = None,
    plan_feedback: Optional[str] = None
) -> Dict[str, Any]:
    """
    Executes the task inside an isolated Docker sandbox container.
    Mode can be 'PLAN' (only generate plan markdown) or 'EXECUTE' (apply changes and PR).
    Falls back gracefully to a subprocess runner if Docker is unavailable.
    Streams logs in real time to task_stream_manager.
    """
    temp_dir = tempfile.mkdtemp(prefix=f"vibe_task_{task_id}_")
    result_file_path = os.path.join(temp_dir, "result.json")

    resolved_github_token = github_token or settings.GITHUB_TOKEN or ""
    resolved_gemini_api_key = gemini_api_key or settings.GEMINI_API_KEY or ""

    active_tokens = [
        s for s in [resolved_github_token, resolved_gemini_api_key]
        if s and isinstance(s, str) and len(s) >= 4
    ]

    task_payload = {
        "task_id": str(task_id),
        "mode": mode,
        "plan_content": plan_content or "",
        "plan_feedback": plan_feedback or "",
        "repo_url": repo_url,
        "github_token": resolved_github_token,
        "default_branch": default_branch or "main",
        "prompt": prompt,
        "gemini_api_key": resolved_gemini_api_key,
        "gemini_model": gemini_model or settings.GEMINI_MODEL,
        "project_rules": project_rules or "",
        "output_file": "/runner_workspace/result.json"
    }

    payload_json = json.dumps(task_payload)
    payload_b64 = base64.b64encode(payload_json.encode("utf-8")).decode("ascii")

    logs_accumulator = []
    parsed_result = None
    collecting_result = False
    captured_result_lines = []
    error_candidate = None

    async def emit_log(line: str):
        nonlocal error_candidate, collecting_result, captured_result_lines, parsed_result
        cleaned = line.rstrip()
        if not cleaned:
            return

        # Check delimiter for JSON result
        if "===VIBE_RESULT_START===" in cleaned:
            collecting_result = True
            captured_result_lines = []
            return
        if "===VIBE_RESULT_END===" in cleaned:
            collecting_result = False
            try:
                parsed_result = json.loads("\n".join(captured_result_lines).strip())
                if parsed_result.get("error"):
                    error_candidate = parsed_result["error"]
            except Exception as e:
                logger.warning(f"Error parseando resultado JSON delimitado: {e}")
            return

        if collecting_result:
            captured_result_lines.append(cleaned)
            return

        # Normal log line with secret masking
        safe_line = mask_secrets(cleaned, active_tokens)
        logger.info(f"[Task #{task_id}] {safe_line}")
        logs_accumulator.append(safe_line)
        await task_stream_manager.publish_log(task_id, safe_line)

        # Detect error patterns
        lower = safe_line.lower()
        if "[vibe-runner] error:" in lower:
            error_candidate = safe_line.split("ERROR:", 1)[-1].strip()
        elif "fatal:" in lower:
            error_candidate = safe_line.split("fatal:", 1)[-1].strip()
        elif "runtimeerror:" in lower:
            error_candidate = safe_line.split("runtimeerror:", 1)[-1].strip()
        elif "valueerror:" in lower:
            error_candidate = safe_line.split("valueerror:", 1)[-1].strip()

    await emit_log(f"Iniciando sandbox para tarea #{task_id} en {repo_url}...")

    use_docker = False
    docker_image = settings.DOCKER_RUNNER_IMAGE

    # Check if docker is available
    try:
        check_docker = subprocess.run(
            ["docker", "info"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5
        )
        if check_docker.returncode == 0:
            use_docker = True
    except Exception:
        use_docker = False

    async def read_stream(stream):
        while True:
            line_bytes = await stream.readline()
            if not line_bytes:
                break
            line_str = line_bytes.decode("utf-8", errors="replace")
            await emit_log(line_str)

    container_name = f"vibe-sandbox-task-{task_id}"

    if use_docker:
        await emit_log("Docker daemon detectado. Ejecutando en contenedor aislado con sandbox estricto...")
        cmd = [
            "docker", "run", "--rm",
            "--name", container_name,
            "--read-only",
            "--tmpfs", "/runner_workspace:rw,size=1g,nosuid,uid=10001,gid=10001",
            "--tmpfs", "/tmp:rw,size=256m,nosuid",
            "--tmpfs", "/home/runner:rw,size=64m,nosuid,uid=10001,gid=10001",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--pids-limit", "150",
            "--cpus", "1.5",
            "--network", "bridge",
            "--memory", "2g",
            "-e", f"TASK_PAYLOAD_B64={payload_b64}",
            docker_image
        ]
        
        await emit_log(f"Comando: docker run --rm --name {container_name} --read-only --cap-drop=ALL --security-opt=no-new-privileges --pids-limit 150 --cpus 1.5 --tmpfs /runner_workspace ... {docker_image}")
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await task_stream_manager.register_process(task_id, proc, container_name=container_name)
            try:
                await asyncio.wait_for(
                    asyncio.gather(
                        read_stream(proc.stdout),
                        read_stream(proc.stderr)
                    ),
                    timeout=settings.DOCKER_TIMEOUT_SECONDS
                )
                await proc.wait()
                if proc.returncode != 0 and not error_candidate and not task_stream_manager.is_task_stopped(task_id):
                    error_candidate = f"El contenedor finalizó con código de salida {proc.returncode}"
            except asyncio.TimeoutError:
                await emit_log("TIMEOUT: La ejecución del contenedor excedió el tiempo límite permitido.")
                error_candidate = "La ejecución del sandbox excedió el tiempo límite (Timeout)."
                try:
                    proc.kill()
                except Exception:
                    pass
            finally:
                await task_stream_manager.unregister_process(task_id)
        except Exception as e:
            await emit_log(f"Fallo al ejecutar contenedor Docker: {str(e)}.")
            use_docker = False

    if not use_docker:
        if settings.REQUIRE_DOCKER_SANDBOX:
            err_msg = "ERROR DE SEGURIDAD: El contenedor sandbox Docker no está disponible y la ejecución directa en el host está bloqueada en modo producción."
            await emit_log(err_msg)
            error_candidate = err_msg
        else:
            await emit_log("Ejecutando en entorno local de desarrollo...")
            local_runner = os.path.join(os.path.dirname(__file__), "run_task.py")
            if not os.path.exists(local_runner):
                local_runner = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../runner/run_task.py"))

            env = os.environ.copy()
            env["TASK_PAYLOAD_B64"] = payload_b64
            env["WORKSPACE_DIR"] = os.path.join(temp_dir, "repo")

        env["OUTPUT_FILE"] = result_file_path
        
        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, local_runner,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
            await task_stream_manager.register_process(task_id, proc, container_name=None)
            try:
                await asyncio.gather(
                    read_stream(proc.stdout),
                    read_stream(proc.stderr)
                )
                await proc.wait()
                if proc.returncode != 0 and not error_candidate and not task_stream_manager.is_task_stopped(task_id):
                    error_candidate = f"El runner local finalizó con código de error {proc.returncode}"
            finally:
                await task_stream_manager.unregister_process(task_id)
        except Exception as e:
            await emit_log(f"Error fatal ejecutando runner local: {str(e)}")
            error_candidate = str(e)

    # Check if task was stopped
    is_stopped = task_stream_manager.is_task_stopped(task_id)

    # Assemble result
    if is_stopped:
        result_data = {
            "success": False,
            "stopped": True,
            "mode": mode,
            "summary": None,
            "affected_files": [],
            "plan_markdown": None,
            "branch_name": None,
            "commit_message": None,
            "pr_url": None,
            "pr_number": None,
            "error": "Proceso cancelado/detenido manualmente por el usuario."
        }
    else:
        result_data = parsed_result or {
            "success": False,
            "mode": mode,
            "summary": None,
            "affected_files": [],
            "plan_markdown": None,
            "branch_name": None,
            "commit_message": None,
            "pr_url": None,
            "pr_number": None,
            "error": error_candidate or "No se pudo obtener el resultado de ejecución del sandbox."
        }

        if not parsed_result and os.path.exists(result_file_path):
            try:
                with open(result_file_path, "r", encoding="utf-8") as f:
                    result_data = json.load(f)
            except Exception as e:
                result_data["error"] = f"Error leyendo resultado: {str(e)}"

        if not result_data.get("success") and not result_data.get("error"):
            result_data["error"] = error_candidate or "Fallo en la ejecución de la tarea"

    if result_data.get("error"):
        result_data["error"] = mask_secrets(result_data["error"], active_tokens)

    result_data["logs"] = "\n".join(logs_accumulator)

    # Cleanup temp_dir
    try:
        shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception:
        pass

    return result_data

