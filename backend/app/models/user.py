import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="user", nullable=False)  # "admin", "validator", "user"
    is_active = Column(Boolean, default=True, nullable=False)
    is_banned = Column(Boolean, default=False, nullable=False)
    invited_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # 5-Hour Token Quota
    token_quota_limit = Column(Integer, default=100000, nullable=False)
    tokens_used_in_window = Column(Integer, default=0, nullable=False)
    quota_window_start = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    quota_window_hours = Column(Integer, default=5, nullable=False)

    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    prompts = relationship("PromptTask", back_populates="user", foreign_keys="PromptTask.user_id")
    sent_messages = relationship("ChatMessage", back_populates="sender", foreign_keys="ChatMessage.sender_id")
    received_messages = relationship("ChatMessage", back_populates="recipient", foreign_keys="ChatMessage.recipient_id")
    validator_repos = relationship("RepoValidator", back_populates="validator", cascade="all, delete-orphan")
    contexts = relationship("UserContext", back_populates="user", cascade="all, delete-orphan")
    token_logs = relationship("UserTokenLog", back_populates="user", cascade="all, delete-orphan")
