import os
import sys
import json
import logging
import tempfile
import asyncio
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
    task_file_path = os.path.join(temp_dir, "task.json")
    result_file_path = os.path.join(temp_dir, "result.json")

    task_payload = {
        "task_id": str(task_id),
        "repo_url": repo_url,
        "github_token": github_token or "",
        "default_branch": default_branch or "main",
        "prompt": prompt,
        "gemini_api_key": gemini_api_key or settings.GEMINI_API_KEY,
        "gemini_model": gemini_model or settings.GEMINI_MODEL,
        "project_rules": project_rules or "",
        "output_file": "/runner_workspace/result.json"
    }

    with open(task_file_path, "w", encoding="utf-8") as f:
        json.dump(task_payload, f, indent=2)

    logs_accumulator = []

    def append_log(line: str):
        cleaned = line.rstrip()
        logger.info(f"[Task #{task_id}] {cleaned}")
        logs_accumulator.append(cleaned)

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
        # Mount temp_dir into /runner_workspace
        # Windows docker volume syntax: use normalized absolute path
        abs_temp = os.path.abspath(temp_dir).replace("\\", "/")
        cmd = [
            "docker", "run", "--rm",
            "--network", "bridge",
            "--memory", "2g",
            "-v", f"{abs_temp}:/runner_workspace",
            "-e", "TASK_FILE=/runner_workspace/task.json",
            "-e", "WORKSPACE_DIR=/runner_workspace/repo",
            "-e", "OUTPUT_FILE=/runner_workspace/result.json",
            docker_image
        ]
        
        append_log(f"Comando: {' '.join(cmd)}")
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
                    for l in stdout.decode("utf-8", errors="replace").splitlines():
                        append_log(l)
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
        runner_script = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../runner/run_task.py"))
        task_payload["output_file"] = result_file_path
        with open(task_file_path, "w", encoding="utf-8") as f:
            json.dump(task_payload, f, indent=2)

        env = os.environ.copy()
        env["TASK_FILE"] = task_file_path
        env["WORKSPACE_DIR"] = os.path.join(temp_dir, "repo")
        env["OUTPUT_FILE"] = result_file_path
        
        proc = await asyncio.create_subprocess_exec(
            sys.executable, runner_script,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )
        stdout, stderr = await proc.communicate()
        if stdout:
            for l in stdout.decode("utf-8", errors="replace").splitlines():
                append_log(l)
        if stderr:
            for l in stderr.decode("utf-8", errors="replace").splitlines():
                append_log(l)

    # Read result
    result_data = {
        "success": False,
        "branch_name": None,
        "commit_message": None,
        "pr_url": None,
        "pr_number": None,
        "error": "No se generó archivo de resultados."
    }

    if os.path.exists(result_file_path):
        try:
            with open(result_file_path, "r", encoding="utf-8") as f:
                result_data = json.load(f)
        except Exception as e:
            result_data["error"] = f"Error leyendo resultado: {str(e)}"
    else:
        append_log("Aviso: El runner no produjo result.json")

    result_data["logs"] = "\n".join(logs_accumulator)
    return result_data
