import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Vibe Manager AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # Environment & Production Hardening
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DOCS_ENABLED: bool = os.getenv("DOCS_ENABLED", "true" if os.getenv("ENVIRONMENT", "development") != "production" else "false").lower() in ("true", "1", "yes")
    REQUIRE_DOCKER_SANDBOX: bool = os.getenv("REQUIRE_DOCKER_SANDBOX", "true" if os.getenv("ENVIRONMENT", "development") == "production" else "false").lower() in ("true", "1", "yes")
    SEED_DEMO_DATA: bool = os.getenv("SEED_DEMO_DATA", "false" if os.getenv("ENVIRONMENT", "development") == "production" else "true").lower() in ("true", "1", "yes")
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "")

    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super-secret-key-vibe-manager-ai-change-in-prod-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./vibe_manager.db")
    
    # Default Admin Credentials
    DEFAULT_ADMIN_EMAIL: str = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@vibemanager.ai")
    DEFAULT_ADMIN_PASSWORD: str = os.getenv("DEFAULT_ADMIN_PASSWORD", "Admin1234!")
    
    # Gemini AI
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    
    # GitHub PAT
    GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")
    
    # Docker Runner
    DOCKER_RUNNER_IMAGE: str = os.getenv("DOCKER_RUNNER_IMAGE", "vibe-runner:latest")
    DOCKER_TIMEOUT_SECONDS: int = int(os.getenv("DOCKER_TIMEOUT_SECONDS", "300"))
    
    # Frontend URL (for invitation links and CORS)
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3010")

    model_config = {"env_file": ".env", "extra": "allow"}

settings = Settings()

# Validate production security at startup
if settings.ENVIRONMENT == "production":
    insecure_defaults = [
        "super-secret-key-vibe-manager-ai-change-in-prod-2026",
        "vibe-secret-super-key-2026-production"
    ]
    if settings.SECRET_KEY in insecure_defaults or len(settings.SECRET_KEY) < 32:
        raise RuntimeError(
            "CRITICAL SECURITY ERROR: In production, SECRET_KEY must be a cryptographically strong "
            "random key (minimum 32 characters) and cannot be the default development key. "
            "Please generate one with `openssl rand -hex 32` and set it in your .env file."
        )

