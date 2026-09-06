import os
import sys
import json
import shutil
import subprocess
import secrets
import re
from typing import Optional, Tuple, Dict, Any, List
import httpx

def log(msg: str):
    print(f"[VIBE-RUNNER] {msg}", flush=True)

def run_cmd(cmd: List[str], cwd: Optional[str] = None) -> Tuple[int, str, str]:
    log(f"Executing: {' '.join(cmd)}")
    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    stdout, stderr = proc.communicate()
    if stdout:
        log(f"stdout: {stdout.strip()}")
    if stderr:
        log(f"stderr: {stderr.strip()}")
    return proc.returncode, stdout, stderr

def extract_owner_repo(repo_url: str) -> Optional[Tuple[str, str]]:
    cleaned = repo_url.strip().rstrip("/")
    pattern = r"(?:https?://github\.com/|git@github\.com:)([^/]+)/([^/\.]+)(?:\.git)?"
    match = re.search(pattern, cleaned)
    if match:
        return match.group(1), match.group(2)
    parts = cleaned.split("/")
    if len(parts) == 2 and parts[0] and parts[1]:
        return parts[0], parts[1]
    return None

def call_gemini(
    prompt: str,
    project_name: str,
    api_key: str,
    model: str = "gemini-2.5-flash",
    file_tree: Optional[List[str]] = None,
    rules: Optional[str] = None
) -> Dict[str, Any]:
    if not api_key:
        log("No GEMINI_API_KEY provided. Using default automated modification template.")
        return {
            "commit_message": f"feat: apply prompt changes for {project_name}",
            "pr_title": f"Vibe Task: Actualización de código",
            "pr_body": f"## Modificaciones automáticas de Vibe Manager AI\n\n**Prompt:**\n> {prompt}",
            "changes": [
                {
                    "path": "VIBE_CHANGES.md",
                    "action": "CREATE",
                    "content": f"# Modificaciones aplicadas por Vibe Manager AI\n\nPrompt: {prompt}\n"
                }
            ]
        }

    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    system_instruction = (
        "Eres un ingeniero de software senior que aplica cambios a un proyecto de código. "
        "Devuelve EXCLUSIVAMENTE un JSON con: commit_message, pr_title, pr_body y "
        "changes (lista de {path, action: CREATE|MODIFY|DELETE, content})."
    )

    user_text = f"Proyecto: {project_name}\n"
    if rules:
        user_text += f"Reglas del proyecto:\n{rules}\n\n"
    if file_tree:
        user_text += f"Árbol de archivos:\n" + "\n".join(file_tree[:80]) + "\n\n"
    user_text += f"Prompt del usuario:\n\"\"\"\n{prompt}\n\"\"\"\nGenera los cambios requeridos."

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": system_instruction},
                    {"text": user_text}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json"
        }
    }

    with httpx.Client(timeout=90.0) as client:
        res = client.post(endpoint, json=payload)
        if res.status_code != 200:
            raise RuntimeError(f"Error llamando a Gemini ({res.status_code}): {res.text}")
        data = res.json()
        raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(raw_text)

def main():
    log("Iniciando runner de ejecución en sandbox...")
    
    # Check config from file or env
    task_file = os.getenv("TASK_FILE", "/runner_workspace/task.json")
    task_data = {}
    if os.path.exists(task_file):
        with open(task_file, "r", encoding="utf-8") as f:
            task_data = json.load(f)

    repo_url = task_data.get("repo_url") or os.getenv("REPO_URL", "")
    github_token = task_data.get("github_token") or os.getenv("GITHUB_TOKEN", "")
    default_branch = task_data.get("default_branch") or os.getenv("DEFAULT_BRANCH", "main")
    prompt = task_data.get("prompt") or os.getenv("PROMPT", "")
    task_id = task_data.get("task_id") or os.getenv("TASK_ID", secrets.token_hex(4))
    gemini_api_key = task_data.get("gemini_api_key") or os.getenv("GEMINI_API_KEY", "")
    gemini_model = task_data.get("gemini_model") or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    project_rules = task_data.get("project_rules") or os.getenv("PROJECT_RULES", "")
    output_file = task_data.get("output_file") or os.getenv("OUTPUT_FILE", "/runner_workspace/result.json")

    workspace_dir = os.getenv("WORKSPACE_DIR", "/runner_workspace/repo")

    result = {
        "success": False,
        "task_id": task_id,
        "branch_name": None,
        "commit_message": None,
        "pr_url": None,
        "pr_number": None,
        "error": None
    }

    try:
        if not repo_url:
            raise ValueError("Falta la URL del repositorio (repo_url)")
        if not prompt:
            raise ValueError("Falta el prompt a ejecutar")

        owner_repo = extract_owner_repo(repo_url)
        if not owner_repo:
            raise ValueError(f"URL de repositorio inválida: {repo_url}")
        owner, repo_name = owner_repo

        if os.path.exists(workspace_dir):
            shutil.rmtree(workspace_dir)
        os.makedirs(workspace_dir, exist_ok=True)

        # Configure git identity
        run_cmd(["git", "config", "--global", "user.name", "Vibe Manager AI Bot"])
        run_cmd(["git", "config", "--global", "user.email", "bot@vibemanager.ai"])

        # Clone repository
        if github_token:
            auth_url = f"https://x-access-token:{github_token}@github.com/{owner}/{repo_name}.git"
        else:
            auth_url = f"https://github.com/{owner}/{repo_name}.git"

        log(f"Clonando repositorio {owner}/{repo_name} (rama: {default_branch})...")
        code, out, err = run_cmd(["git", "clone", "--depth", "1", "-b", default_branch, auth_url, workspace_dir])
        if code != 0:
            raise RuntimeError(f"Error al clonar repositorio: {err}")

        # Create new feature branch
        branch_name = f"vibe/task-{task_id}-{secrets.token_hex(3)}"
        result["branch_name"] = branch_name
        log(f"Creando rama: {branch_name}")
        run_cmd(["git", "checkout", "-b", branch_name], cwd=workspace_dir)

        # Scan files
        file_tree = []
        for root, _, files in os.walk(workspace_dir):
            if ".git" in root:
                continue
            for f in files:
                rel = os.path.relpath(os.path.join(root, f), workspace_dir)
                file_tree.append(rel.replace("\\", "/"))

        # Generate changes with Gemini
        log("Invocando a Google Gemini para interpretar el prompt y generar cambios de código...")
        plan = call_gemini(
            prompt=prompt,
            project_name=repo_name,
            api_key=gemini_api_key,
            model=gemini_model,
            file_tree=file_tree,
            rules=project_rules
        )

        commit_msg = plan.get("commit_message") or f"feat: apply vibe prompt task #{task_id}"
        pr_title = plan.get("pr_title") or f"Vibe Task #{task_id}"
        pr_body = plan.get("pr_body") or f"Modificaciones automáticas para la tarea #{task_id}\n\nPrompt:\n{prompt}"
        changes = plan.get("changes", [])

        result["commit_message"] = commit_msg

        log(f"Aplicando {len(changes)} cambios en el código...")
        for ch in changes:
            rel_path = ch.get("path")
            action = ch.get("action", "MODIFY").upper()
            content = ch.get("content", "")
            if not rel_path:
                continue
            full_path = os.path.join(workspace_dir, rel_path)
            
            if action == "DELETE":
                if os.path.exists(full_path):
                    os.remove(full_path)
                    log(f"Eliminado: {rel_path}")
            else:
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                with open(full_path, "w", encoding="utf-8") as f:
                    f.write(content)
                log(f"{'Creado' if action == 'CREATE' else 'Modificado'}: {rel_path}")

        # Git add and commit
        run_cmd(["git", "add", "-A"], cwd=workspace_dir)
        code, out, err = run_cmd(["git", "commit", "-m", commit_msg], cwd=workspace_dir)
        if code != 0:
            log("Aviso: git commit no detectó cambios nuevos.")

        # Git push
        if github_token:
            log(f"Haciendo push de la rama {branch_name} a GitHub...")
            code, out, err = run_cmd(["git", "push", "-u", "origin", branch_name], cwd=workspace_dir)
            if code != 0:
                raise RuntimeError(f"Error al hacer push de la rama: {err}")

            # Create PR
            log("Creando Pull Request en GitHub...")
            api_url = f"https://api.github.com/repos/{owner}/{repo_name}/pulls"
            headers = {
                "Authorization": f"Bearer {github_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }
            pr_payload = {
                "title": pr_title,
                "body": pr_body,
                "head": branch_name,
                "base": default_branch
            }
            with httpx.Client(timeout=30.0) as client:
                pr_res = client.post(api_url, json=pr_payload, headers=headers)
                if pr_res.status_code in [200, 201]:
                    pr_json = pr_res.json()
                    result["pr_url"] = pr_json.get("html_url")
                    result["pr_number"] = pr_json.get("number")
                    log(f"Pull Request creado exitosamente: {result['pr_url']}")
                else:
                    raise RuntimeError(f"Error creando PR en GitHub ({pr_res.status_code}): {pr_res.text}")
        else:
            log("Aviso: No se proporcionó GITHUB_TOKEN; commit generado localmente en la rama sin push a GitHub.")

        result["success"] = True
        log("Ejecución completada con éxito.")

    except Exception as e:
        log(f"ERROR: {str(e)}")
        result["error"] = str(e)
        result["success"] = False

    # Save output result
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    sys.exit(0 if result["success"] else 1)

if __name__ == "__main__":
    main()
