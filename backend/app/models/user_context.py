import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class UserContext(Base):
    __tablename__ = "user_contexts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    identifier = Column(String(100), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    context_text = Column(Text, nullable=False)
    character_count = Column(Integer, default=0, nullable=False)
    estimated_tokens = Column(Integer, default=0, nullable=False)

    # Workflow status: PENDING, APPROVED (generating plan), PLAN_PENDING, ACCEPTED, REJECTED
    status = Column(String(50), default="PENDING", nullable=False, index=True)
    version = Column(Integer, default=1, nullable=False)

    # Assigned Validator
    repo_validator_id = Column(Integer, ForeignKey("repo_validators.id", ondelete="SET NULL"), nullable=True)
    assigned_validator_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Raw Text Validation
    edited_text = Column(Text, nullable=True)
    accepted_text = Column(Text, nullable=True)
    validated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    validated_at = Column(DateTime, nullable=True)

    # Gemini Context Plan & Plan Validation
    plan_markdown = Column(Text, nullable=True)
    plan_feedback = Column(Text, nullable=True)
    plan_validated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    plan_validated_at = Column(DateTime, nullable=True)

    # Rejection Reason
    rejection_reason = Column(Text, nullable=True)

    # Gemini Context Caching integration
    gemini_cache_name = Column(String(255), nullable=True)
    gemini_cache_expire_time = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="contexts", foreign_keys=[user_id])
    repo_validator = relationship("RepoValidator")
    assigned_validator = relationship("User", foreign_keys=[assigned_validator_id])
    validator = relationship("User", foreign_keys=[validated_by_id])
    plan_validator = relationship("User", foreign_keys=[plan_validated_by_id])

    tasks = relationship("PromptTask", back_populates="context")
    token_logs = relationship("UserTokenLog", back_populates="context")
