import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import relationship
from app.database import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    repo_url = Column(String(512), nullable=False)  # e.g. "https://github.com/org/repo"
    default_branch = Column(String(100), default="main", nullable=False)
    github_token = Column(String(512), nullable=True)  # Repo specific PAT if needed
    system_prompt_rules = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    prompts = relationship("PromptTask", back_populates="project", cascade="all, delete-orphan")
