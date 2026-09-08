import asyncio
import datetime
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from app.config import settings
from app.database import engine, Base, AsyncSessionLocal
from app.auth import get_password_hash
import os
from app.models.user import User
from app.models.project import Project
from app.models.invitation import Invitation
from app.models.repo_validator import RepoValidator

from app.routers.auth import router as auth_router
from app.routers.admin import router as admin_router
from app.routers.projects import router as projects_router
from app.routers.prompts import router as prompts_router
from app.routers.validation import router as validation_router
from app.routers.repo_validators import router as repo_validators_router
from app.routers.chat import router as chat_router
from app.routers.processes import router as processes_router
from app.routers.contexts import router as contexts_router
from app.routers.quotas import router as quotas_router
from app.services.db_migrator import auto_migrate_sqlite_to_pg

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vibe_app")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Inicializando base de datos y esquemas...")

    # 1. Execute Alembic migrations if available
    try:
        alembic_ini_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../alembic.ini"))
        if os.path.exists(alembic_ini_path):
            import subprocess
            proc = await asyncio.create_subprocess_exec(
                "alembic", "upgrade", "head",
                cwd=os.path.dirname(alembic_ini_path),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode == 0:
                logger.info("Migraciones de Alembic ejecutadas y al día.")
            else:
                logger.warning(f"Aviso ejecutando Alembic: {stderr.decode()}")
    except Exception as e:
        logger.warning(f"Aviso ejecutando Alembic en arranque: {e}")

    # 2. Synchronize schemas & safety fallbacks
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS error_message TEXT;"))
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS execution_stage VARCHAR(100);"))
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS plan_content TEXT;"))
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS plan_validated_by_id INTEGER;"))
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS plan_validated_at TIMESTAMP;"))
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS plan_rejection_reason TEXT;"))
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS repo_validator_id INTEGER;"))
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS assigned_validator_id INTEGER;"))
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS plan_feedback TEXT;"))
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS context_id INTEGER;"))
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS token_quota_limit INTEGER DEFAULT 100000;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_used_in_window INTEGER DEFAULT 0;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_window_hours INTEGER DEFAULT 5;"))
        except Exception as e:
            logger.debug(f"Schema column check: {e}")

    # Check and migrate previous SQLite records if migrating to PostgreSQL
    try:
        await auto_migrate_sqlite_to_pg()
    except Exception as e:
        logger.warning(f"Error en auto-migrador: {e}")

    # Seed admin & sample data if empty
    async with AsyncSessionLocal() as db:
        # Check admin
        admin_res = await db.execute(select(User).where(User.role == "admin"))
        admin_user = admin_res.scalars().first()
        if not admin_user:
            logger.info(f"Creando usuario administrador por defecto: {settings.DEFAULT_ADMIN_EMAIL}")
            admin_user = User(
                email=settings.DEFAULT_ADMIN_EMAIL.lower(),
                name="Administrador Principal",
                hashed_password=get_password_hash(settings.DEFAULT_ADMIN_PASSWORD),
                role="admin",
                is_active=True,
                is_banned=False
            )
            db.add(admin_user)
            await db.commit()
            await db.refresh(admin_user)

        # Check default invitation code and demo project only if SEED_DEMO_DATA is enabled
        if settings.SEED_DEMO_DATA:
            inv_res = await db.execute(select(Invitation).where(Invitation.code == "VIBE-WELCOME"))
            if not inv_res.scalars().first():
                logger.info("Creando código de bienvenida inicial: VIBE-WELCOME")
                default_inv = Invitation(
                    code="VIBE-WELCOME",
                    token="welcome-token-2026",
                    created_by_id=admin_user.id,
                    max_uses=100,
                    used_count=0,
                    is_active=True,
                    expires_at=datetime.datetime.utcnow() + datetime.timedelta(days=365)
                )
                db.add(default_inv)
                await db.commit()

            # Check default demo project
            proj_res = await db.execute(select(Project))
            if not proj_res.scalars().first():
                logger.info("Creando proyecto de demostración inicial...")
                demo_proj = Project(
                    name="Portal Web Corporativo",
                    description="Aplicación web para gestión de clientes y servicios digitales.",
                    repo_url="https://github.com/vibe-demo/corporate-portal",
                    default_branch="main",
                    system_prompt_rules="Mantén una arquitectura modular, nombres claros de componentes y estilos coherentes con Tailwind CSS.",
                    is_active=True
                )
                db.add(demo_proj)
                await db.commit()
        else:
            logger.info("Modo producción: Sembrado automático de invitaciones y proyectos demo deshabilitado por seguridad.")

    logger.info("Vibe Manager AI backend inicializado correctamente.")
    yield
    logger.info("Cerrando backend...")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.DOCS_ENABLED else None,
    redoc_url="/redoc" if settings.DOCS_ENABLED else None,
    openapi_url="/openapi.json" if settings.DOCS_ENABLED else None
)

# Robust and secure CORS origin resolution
allowed_origins = [settings.FRONTEND_URL.rstrip("/")]
if settings.CORS_ORIGINS:
    for origin in settings.CORS_ORIGINS.split(","):
        stripped = origin.strip().rstrip("/")
        if stripped and stripped not in allowed_origins:
            allowed_origins.append(stripped)

# In dev, allow localhost ports if not in production
if settings.ENVIRONMENT != "production":
    for dev_origin in ["http://localhost:3010", "http://localhost:8000", "http://127.0.0.1:3010", "http://127.0.0.1:8000"]:
        if dev_origin not in allowed_origins:
            allowed_origins.append(dev_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(admin_router, prefix=settings.API_V1_STR)
app.include_router(projects_router, prefix=settings.API_V1_STR)
app.include_router(prompts_router, prefix=settings.API_V1_STR)
app.include_router(validation_router, prefix=settings.API_V1_STR)
app.include_router(repo_validators_router, prefix=settings.API_V1_STR)
app.include_router(chat_router, prefix=settings.API_V1_STR)
app.include_router(processes_router, prefix=settings.API_V1_STR)
app.include_router(contexts_router, prefix=settings.API_V1_STR)
app.include_router(quotas_router, prefix=settings.API_V1_STR)

@app.get("/")
def read_root():
    info = {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online"
    }
    if settings.DOCS_ENABLED:
        info["docs"] = "/docs"
    return info

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

@app.get("/api/system/config")
def get_system_config():
    """Retorna configuración pública segura para adaptar la interfaz (sin exponer secretos)."""
    return {
        "environment": settings.ENVIRONMENT,
        "show_demo_credentials": settings.ENVIRONMENT != "production" and settings.SEED_DEMO_DATA,
    }

