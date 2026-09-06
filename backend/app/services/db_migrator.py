import os
import sqlite3
import logging
from sqlalchemy import select
from app.config import settings
from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.project import Project
from app.models.invitation import Invitation
from app.models.prompt_task import PromptTask

logger = logging.getLogger("db_migrator")

async def auto_migrate_sqlite_to_pg():
    """
    Detects candidate SQLite databases and migrates records
    into the active PostgreSQL database if PostgreSQL is fresh.
    """
    if "sqlite" in settings.DATABASE_URL:
        return

    candidate_paths = [
        "/app/vibe_manager.db",
        "/app/data/vibe_manager.db",
        "./vibe_manager.db",
        "./data/vibe_manager.db"
    ]
    sqlite_path = None
    for p in candidate_paths:
        if os.path.exists(p) and os.path.getsize(p) > 0:
            sqlite_path = p
            break

    if not sqlite_path:
        return

    logger.info(f"[DB-MIGRATOR] Detectada base de datos previa SQLite en: {sqlite_path}")

    try:
        conn = sqlite3.connect(sqlite_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='projects';")
        if not cur.fetchone():
            conn.close()
            return

        async with AsyncSessionLocal() as db:
            res = await db.execute(select(Project))
            existing_projects = res.scalars().all()
            if existing_projects:
                conn.close()
                return

            logger.info("[DB-MIGRATOR] Iniciando migración de proyectos desde SQLite a PostgreSQL...")
            cur.execute("SELECT * FROM projects")
            projects = cur.fetchall()
            for p in projects:
                row_dict = dict(p)
                proj = Project(
                    name=row_dict["name"],
                    description=row_dict.get("description"),
                    repo_url=row_dict["repo_url"],
                    github_token=row_dict.get("github_token"),
                    default_branch=row_dict.get("default_branch", "main"),
                    system_prompt_rules=row_dict.get("system_prompt_rules"),
                    is_active=bool(row_dict.get("is_active", 1))
                )
                db.add(proj)

            await db.commit()
            logger.info(f"[DB-MIGRATOR] Migrados {len(projects)} proyectos a PostgreSQL 16.")

        conn.close()
    except Exception as e:
        logger.warning(f"[DB-MIGRATOR] Advertencia durante migración: {e}")
