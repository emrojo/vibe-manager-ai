import datetime
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from app.config import settings
from app.database import engine, Base, AsyncSessionLocal
from app.auth import get_password_hash
from app.models.user import User
from app.models.project import Project
from app.models.invitation import Invitation

from app.routers.auth import router as auth_router
from app.routers.admin import router as admin_router
from app.routers.projects import router as projects_router
from app.routers.prompts import router as prompts_router
from app.routers.validation import router as validation_router
from app.routers.chat import router as chat_router
from app.routers.processes import router as processes_router
from app.services.db_migrator import auto_migrate_sqlite_to_pg

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vibe_app")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Inicializando base de datos y esquemas...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS error_message TEXT;"))
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS execution_stage VARCHAR(100);"))
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS plan_content TEXT;"))
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS plan_validated_by_id INTEGER;"))
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS plan_validated_at TIMESTAMP;"))
            await conn.execute(text("ALTER TABLE prompt_tasks ADD COLUMN IF NOT EXISTS plan_rejection_reason TEXT;"))
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

        # Check default invitation code
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

        # Check default project
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

    logger.info("Vibe Manager AI backend inicializado correctamente.")
    yield
    logger.info("Cerrando backend...")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev convenience
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
app.include_router(chat_router, prefix=settings.API_V1_STR)
app.include_router(processes_router, prefix=settings.API_V1_STR)

@app.get("/")
def read_root():
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "docs": "/docs"
    }

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}
