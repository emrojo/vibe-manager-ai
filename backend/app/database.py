from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base
from app.config import settings

import os
import re

db_url = settings.DATABASE_URL

engine_kwargs = {"echo": False}

if "sqlite" in db_url:
    # Ensure parent directory exists for SQLite
    # Format sqlite+aiosqlite:///path/to/db.sqlite
    match = re.search(r"sqlite(?:\+aiosqlite)?:///(.+)", db_url)
    if match:
        raw_path = match.group(1)
        dir_name = os.path.dirname(raw_path)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # PostgreSQL pool settings for robust async concurrency
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["pool_pre_ping"] = True

engine = create_async_engine(db_url, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
