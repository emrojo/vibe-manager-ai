import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class PromptTask(Base):
    __tablename__ = "prompt_tasks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Prompt text
    original_prompt = Column(Text, nullable=False)
    edited_prompt = Column(Text, nullable=True)  # Modified by validator
    
    # Status: PENDING, APPROVED, REJECTED, RUNNING, COMPLETED, FAILED
    status = Column(String(50), default="PENDING", nullable=False, index=True)
    rejection_reason = Column(Text, nullable=True)
    
    # Validation info
    validated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    validated_at = Column(DateTime, nullable=True)

    # Repository Validator & Assignment
    repo_validator_id = Column(Integer, ForeignKey("repo_validators.id"), nullable=True)
    assigned_validator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Execution & GitHub info
    branch_name = Column(String(255), nullable=True)
    commit_message = Column(Text, nullable=True)
    pr_url = Column(String(512), nullable=True)
    pr_number = Column(Integer, nullable=True)
    execution_stage = Column(String(100), nullable=True)  # e.g. CLONING, GEMINI_AI, COMMITTING, CREATING_PR
    execution_logs = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    
    # Plan Validation info
    plan_content = Column(Text, nullable=True)
    plan_validated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    plan_validated_at = Column(DateTime, nullable=True)
    plan_rejection_reason = Column(Text, nullable=True)
    plan_feedback = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    project = relationship("Project", back_populates="prompts")
    user = relationship("User", foreign_keys=[user_id], back_populates="prompts")
    validator = relationship("User", foreign_keys=[validated_by_id])
    plan_validator = relationship("User", foreign_keys=[plan_validated_by_id])
    repo_validator = relationship("RepoValidator", back_populates="tasks")
    assigned_validator = relationship("User", foreign_keys=[assigned_validator_id])
