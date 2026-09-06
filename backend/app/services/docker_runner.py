import os
import sys
import json
import base64
import logging
import tempfile
import asyncio
import shutil
import subprocess
from typing import Dict, Any, Optional

from app.config import settings

logger = logging.getLogger("docker_runner")

async def execute_task_sandbox(
    task_id: int,
    repo_url: str,
    prompt: str,
    github_token: Optional[str] = None,
    default_branch: str = "main",
    project_rules: Optional[str] = None,
    gemini_api_key: Optional[str] = None,
    gemini_model: Optional[str] = None
) -> Dict[str, Any]:
    """
    Executes the task inside an isolated Docker sandbox container.
    Falls back gracefully to a subprocess runner if Docker is unavailable.
    """
    temp_dir = tempfile.mkdtemp(prefix=f"vibe_task_{task_id}_")
    result_file_path = os.path.join(temp_dir, "result.json")

    task_payload = {
        "task_id": str(task_id),
        "repo_url": repo_url,
        "github_token": github_token or settings.GITHUB_TOKEN or "",
        "default_branch": default_branch or "main",
        "prompt": prompt,
        "gemini_api_key": gemini_api_key or settings.GEMINI_API_KEY,
        "gemini_model": gemini_model or settings.GEMINI_MODEL,
        "project_rules": project_rules or "",
        "output_file": "/runner_workspace/result.json"
    }

    payload_json = json.dumps(task_payload)
    payload_b64 = base64.b64encode(payload_json.encode("utf-8")).decode("ascii")

    logs_accumulator = []
    parsed_result = None

    def append_log(line: str):
        cleaned = line.rstrip()
        logger.info(f"[Task #{task_id}] {cleaned}")
        logs_accumulator.append(cleaned)

    def process_output_lines(lines: list[str]):
        nonlocal parsed_result
        collecting = False
        captured = []
        for line in lines:
            if "===VIBE_RESULT_START===" in line:
                collecting = True
                captured = []
                continue
            if "===VIBE_RESULT_END===" in line:
                collecting = False
                try:
                    parsed_result = json.loads("\n".join(captured).strip())
                except Exception as e:
                    logger.warning(f"Error parseando resultado JSON delimitado: {e}")
                continue
            if collecting:
                captured.append(line)
            else:
                append_log(line)

    append_log(f"Iniciando sandbox para tarea #{task_id} en {repo_url}...")

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

    if use_docker:
        append_log("Docker daemon detectado. Ejecutando en contenedor aislado...")
        cmd = [
            "docker", "run", "--rm",
            "--network", "bridge",
            "--memory", "2g",
            "-e", f"TASK_PAYLOAD_B64={payload_b64}",
            docker_image
        ]
        
        append_log(f"Comando: docker run --rm --network bridge --memory 2g vibe-runner:latest")
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=settings.DOCKER_TIMEOUT_SECONDS
                )
                if stdout:
                    process_output_lines(stdout.decode("utf-8", errors="replace").splitlines())
                if stderr:
                    for l in stderr.decode("utf-8", errors="replace").splitlines():
                        append_log(l)
            except asyncio.TimeoutError:
                append_log("TIMEOUT: La ejecución del contenedor excedió el tiempo límite.")
                try:
                    proc.kill()
                except Exception:
                    pass
        except Exception as e:
            append_log(f"Fallo al ejecutar contenedor Docker: {str(e)}. Intentando modo local...")
            use_docker = False

    if not use_docker:
        append_log("Ejecutando en entorno local aislado...")
        # Check local runner script locations
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
            stdout, stderr = await proc.communicate()
            if stdout:
                process_output_lines(stdout.decode("utf-8", errors="replace").splitlines())
            if stderr:
                for l in stderr.decode("utf-8", errors="replace").splitlines():
                    append_log(l)
        except Exception as e:
            append_log(f"Error fatal ejecutando runner local: {str(e)}")

    # Assemble result
    result_data = parsed_result or {
        "success": False,
        "branch_name": None,
        "commit_message": None,
        "pr_url": None,
        "pr_number": None,
        "error": "No se generó resultado de ejecución."
    }

    if not parsed_result and os.path.exists(result_file_path):
        try:
            with open(result_file_path, "r", encoding="utf-8") as f:
                result_data = json.load(f)
        except Exception as e:
            result_data["error"] = f"Error leyendo resultado: {str(e)}"

    result_data["logs"] = "\n".join(logs_accumulator)

    # Cleanup temp_dir
    try:
        shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception:
        pass

    return result_data
