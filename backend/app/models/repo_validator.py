import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class RepoValidator(Base):
    __tablename__ = "repo_validators"

    id = Column(Integer, primary_key=True, index=True)
    repo_url = Column(String(512), nullable=False, index=True)
    repo_name = Column(String(255), nullable=False)
    default_branch = Column(String(100), default="main", nullable=False)
    github_token = Column(String(512), nullable=False)
    
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    validator = relationship("User", foreign_keys=[user_id], back_populates="validator_repos")
    project = relationship("Project")
    tasks = relationship("PromptTask", back_populates="repo_validator")
