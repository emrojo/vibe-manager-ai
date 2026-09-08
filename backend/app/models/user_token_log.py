import datetime
from sqlalchemy import Column, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class UserTokenLog(Base):
    __tablename__ = "user_token_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = Column(Integer, ForeignKey("prompt_tasks.id", ondelete="SET NULL"), nullable=True, index=True)
    context_id = Column(Integer, ForeignKey("user_contexts.id", ondelete="SET NULL"), nullable=True, index=True)

    tokens_prompt = Column(Integer, default=0, nullable=False)
    tokens_fixed_context = Column(Integer, default=0, nullable=False)
    tokens_temporal_context = Column(Integer, default=0, nullable=False)
    tokens_completion = Column(Integer, default=0, nullable=False)
    tokens_total = Column(Integer, default=0, nullable=False)
    tokens_cached = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)

    user = relationship("User", back_populates="token_logs")
    task = relationship("PromptTask")
    context = relationship("UserContext", back_populates="token_logs")
