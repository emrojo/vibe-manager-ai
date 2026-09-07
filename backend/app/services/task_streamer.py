import asyncio
import datetime
import json
import logging
from typing import Dict, List, Set, Optional, Any

logger = logging.getLogger("task_streamer")

class TaskStreamManager:
    """
    Manages live logging buffers, status stages, and subscriber connections
    for sandboxed runner tasks executing in the system.
    """
    def __init__(self):
        self._active_tasks: Dict[int, Dict[str, Any]] = {}
        self._task_logs: Dict[int, List[str]] = {}
        self._subscribers: Dict[int, Set[asyncio.Queue]] = {}
        self._running_processes: Dict[int, Any] = {}
        self._running_containers: Dict[int, str] = {}
        self._stopped_tasks: Set[int] = set()
        self._lock = asyncio.Lock()

    async def start_task(
        self,
        task_id: int,
        project_name: str = "Proyecto",
        user_name: str = "Usuario"
    ):
        async with self._lock:
            self._active_tasks[task_id] = {
                "task_id": task_id,
                "project_name": project_name,
                "user_name": user_name,
                "status": "RUNNING",
                "stage": "Inicializando entorno sandbox...",
                "started_at": datetime.datetime.utcnow().isoformat(),
                "error": None
            }
            self._task_logs[task_id] = []
            if task_id not in self._subscribers:
                self._subscribers[task_id] = set()

        await self.publish_log(task_id, f"--- [Vibe Manager] Tarea #{task_id} iniciada para {project_name} ---")

    async def publish_log(self, task_id: int, line: str):
        cleaned = line.rstrip()
        if not cleaned:
            return

        async with self._lock:
            if task_id not in self._task_logs:
                self._task_logs[task_id] = []
            self._task_logs[task_id].append(cleaned)
            # Memory leak mitigation: keep max 1000 lines per task in memory
            if len(self._task_logs[task_id]) > 1000:
                self._task_logs[task_id] = self._task_logs[task_id][-1000:]

            # Periodic prune of finished tasks older than 2 hours if too many tasks in memory
            if len(self._active_tasks) > 50:
                cutoff = (datetime.datetime.utcnow() - datetime.timedelta(hours=2)).isoformat()
                stale_ids = [
                    tid for tid, t in self._active_tasks.items()
                    if t.get("status") in ("COMPLETED", "FAILED", "STOPPED") and t.get("started_at", "") < cutoff
                ]
                for old_id in stale_ids:
                    self._active_tasks.pop(old_id, None)
                    self._task_logs.pop(old_id, None)
                    self._subscribers.pop(old_id, None)
                    self._stopped_tasks.discard(old_id)

            # Auto-detect stage from log patterns
            if task_id in self._active_tasks:
                lower = cleaned.lower()
                if "clonando repositorio" in lower or "git clone" in lower:
                    self._active_tasks[task_id]["stage"] = "Clonando repositorio GitHub..."
                elif "invocando a google gemini" in lower or "call_gemini" in lower:
                    self._active_tasks[task_id]["stage"] = "Google Gemini AI analizando y generando cambios..."
                elif "aplicando" in lower and "cambios" in lower:
                    self._active_tasks[task_id]["stage"] = "Aplicando modificaciones en el código..."
                elif "haciendo push" in lower or "git push" in lower:
                    self._active_tasks[task_id]["stage"] = "Subiendo rama a GitHub..."
                elif "creando pull request" in lower or "pull request" in lower:
                    self._active_tasks[task_id]["stage"] = "Creando Pull Request en GitHub..."

            subscribers_to_notify = list(self._subscribers.get(task_id, []))

        msg = {
            "type": "log",
            "task_id": task_id,
            "line": cleaned,
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        for q in subscribers_to_notify:
            try:
                q.put_nowait(msg)
            except Exception:
                pass

    async def update_stage(self, task_id: int, stage: str):
        async with self._lock:
            if task_id in self._active_tasks:
                self._active_tasks[task_id]["stage"] = stage
            subscribers_to_notify = list(self._subscribers.get(task_id, []))

        msg = {
            "type": "stage",
            "task_id": task_id,
            "stage": stage,
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        for q in subscribers_to_notify:
            try:
                q.put_nowait(msg)
            except Exception:
                pass

    async def finish_task(
        self,
        task_id: int,
        status: str,
        error: Optional[str] = None,
        result: Optional[Dict[str, Any]] = None
    ):
        async with self._lock:
            if task_id in self._active_tasks:
                self._active_tasks[task_id]["status"] = status
                self._active_tasks[task_id]["error"] = error
                self._active_tasks[task_id]["stage"] = "Finalizado" if status == "COMPLETED" else f"Fallido: {error or 'Error en runner'}"
            
            subscribers_to_notify = list(self._subscribers.get(task_id, []))

        msg = {
            "type": "finish",
            "task_id": task_id,
            "status": status,
            "error": error,
            "result": result,
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        for q in subscribers_to_notify:
            try:
                q.put_nowait(msg)
            except Exception:
                pass

    async def register_process(self, task_id: int, proc: Any, container_name: Optional[str] = None):
        async with self._lock:
            self._running_processes[task_id] = proc
            if container_name:
                self._running_containers[task_id] = container_name

    async def unregister_process(self, task_id: int):
        async with self._lock:
            self._running_processes.pop(task_id, None)
            self._running_containers.pop(task_id, None)

    def is_task_stopped(self, task_id: int) -> bool:
        return task_id in self._stopped_tasks

    async def stop_task(self, task_id: int) -> bool:
        async with self._lock:
            self._stopped_tasks.add(task_id)
            proc = self._running_processes.get(task_id)
            container_name = self._running_containers.get(task_id)

        await self.publish_log(task_id, "⛔ [Vibe Manager] Detención solicitada: Abortando sandbox y liberando recursos...")

        # 1. Kill Docker container if running
        if container_name:
            try:
                kill_proc = await asyncio.create_subprocess_exec(
                    "docker", "kill", container_name,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL
                )
                await asyncio.wait_for(kill_proc.wait(), timeout=3.0)
            except Exception as e:
                logger.warning(f"Error matando contenedor {container_name}: {e}")

        # 2. Terminate / kill local or docker-exec subprocess
        if proc:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            except Exception as e:
                logger.warning(f"Error matando subproceso para tarea #{task_id}: {e}")

        # 3. Mark finished with STOPPED
        await self.finish_task(
            task_id=task_id,
            status="STOPPED",
            error="Proceso detenido manualmente por el usuario."
        )
        return True

    def get_active_tasks(self) -> List[Dict[str, Any]]:
        tasks = []
        now = datetime.datetime.utcnow()
        for tid, t in self._active_tasks.items():
            started = datetime.datetime.fromisoformat(t["started_at"])
            duration = int((now - started).total_seconds())
            tasks.append({
                **t,
                "duration_seconds": duration,
                "lines_count": len(self._task_logs.get(tid, []))
            })
        return sorted(tasks, key=lambda x: x["task_id"], reverse=True)

    def get_task_logs(self, task_id: int) -> List[str]:
        return list(self._task_logs.get(task_id, []))

    async def subscribe(self, task_id: int) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            if task_id not in self._subscribers:
                self._subscribers[task_id] = set()
            self._subscribers[task_id].add(q)
        return q

    async def unsubscribe(self, task_id: int, q: asyncio.Queue):
        async with self._lock:
            if task_id in self._subscribers:
                self._subscribers[task_id].discard(q)

task_stream_manager = TaskStreamManager()
