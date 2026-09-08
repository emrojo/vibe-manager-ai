import datetime
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.user_token_log import UserTokenLog
from app.schemas.token_quota import UserQuotaStatusRead, UserTokenLogRead
from app.services.context_cache_service import check_and_refresh_quota

router = APIRouter(prefix="/quotas", tags=["quotas"])

@router.get("/my-quota", response_model=UserQuotaStatusRead)
async def get_my_quota(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns the authenticated user's 5-hour quota status and recent request token costs."""
    is_exceeded, used, limit, seconds_left = check_and_refresh_quota(current_user)
    await db.commit()
    await db.refresh(current_user)

    window_hours = getattr(current_user, "quota_window_hours", 5) or 5
    window_start = current_user.quota_window_start or datetime.datetime.utcnow()
    reset_at = window_start + datetime.timedelta(hours=window_hours)
    remaining = max(0, limit - used)
    pct = round(min(100.0, (used / limit * 100.0) if limit > 0 else 0.0), 1)

    # Fetch last 10 token logs
    log_query = (
        select(UserTokenLog)
        .options(selectinload(UserTokenLog.context))
        .where(UserTokenLog.user_id == current_user.id)
        .order_by(UserTokenLog.created_at.desc())
        .limit(10)
    )
    logs_res = await db.execute(log_query)
    logs = logs_res.scalars().all()

    recent_logs = [
        UserTokenLogRead(
            id=l.id,
            user_id=l.user_id,
            task_id=l.task_id,
            context_id=l.context_id,
            context_name=l.context.name if l.context else None,
            tokens_prompt=l.tokens_prompt,
            tokens_completion=l.tokens_completion,
            tokens_total=l.tokens_total,
            tokens_cached=l.tokens_cached,
            created_at=l.created_at
        )
        for l in logs
    ]

    return UserQuotaStatusRead(
        token_quota_limit=limit,
        tokens_used_in_window=used,
        tokens_remaining=remaining,
        percentage_used=pct,
        quota_window_hours=window_hours,
        quota_window_start=window_start,
        quota_reset_at=reset_at,
        seconds_until_reset=seconds_left,
        is_exceeded=is_exceeded,
        recent_logs=recent_logs
    )
