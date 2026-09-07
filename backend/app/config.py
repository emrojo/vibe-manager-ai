import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Vibe Manager AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
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
