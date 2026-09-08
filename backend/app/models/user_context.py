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

    # Gemini Context Caching integration
    gemini_cache_name = Column(String(255), nullable=True)
    gemini_cache_expire_time = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="contexts")
    tasks = relationship("PromptTask", back_populates="context")
    token_logs = relationship("UserTokenLog", back_populates="context")
