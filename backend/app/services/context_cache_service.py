import datetime
import logging
from typing import Optional, Tuple
import httpx

from app.models.user import User
from app.models.user_context import UserContext

logger = logging.getLogger("context_cache_service")

def estimate_tokens(text: Optional[str]) -> int:
    """
    Estimates token count for Gemini (approximated at ~3.8 characters per token for mixed Spanish/English code).
    """
    if not text:
        return 0
    cleaned = text.strip()
    if not cleaned:
        return 0
    # Minimum 1 token, approximately len / 3.8
    return max(1, int(len(cleaned) / 3.8))

def check_and_refresh_quota(user: User) -> Tuple[bool, int, int, int]:
    """
    Checks if the user's 5-hour quota window has elapsed. If so, resets it.
    Returns: (is_exceeded, tokens_used, quota_limit, seconds_until_reset)
    """
    now = datetime.datetime.utcnow()
    window_hours = getattr(user, "quota_window_hours", 5) or 5
    window_seconds = window_hours * 3600

    window_start = getattr(user, "quota_window_start", None)
    if not window_start:
        user.quota_window_start = now
        user.tokens_used_in_window = 0
        window_start = now

    elapsed_seconds = (now - window_start).total_seconds()

    if elapsed_seconds >= window_seconds:
        # Window expired - reset quota
        user.tokens_used_in_window = 0
        user.quota_window_start = now
        elapsed_seconds = 0

    seconds_until_reset = max(0, int(window_seconds - elapsed_seconds))
    limit = getattr(user, "token_quota_limit", 100000) or 100000
    used = getattr(user, "tokens_used_in_window", 0) or 0
    is_exceeded = used >= limit

    return is_exceeded, used, limit, seconds_until_reset

async def try_create_gemini_context_cache(
    context_text: str,
    identifier: str,
    api_key: str,
    model: str = "gemini-1.5-flash-001"
) -> Tuple[Optional[str], Optional[datetime.datetime]]:
    """
    Attempts to register a server-side Context Cache with Google Gemini API (cachedContents).
    If the context is below Gemini's minimum token threshold (~32k) or API rejects, returns (None, None) gracefully.
    """
    if not api_key or not context_text:
        return None, None

    endpoint = f"https://generativelanguage.googleapis.com/v1beta/cachedContents?key={api_key}"
    ttl_seconds = 18000  # 5 hours matching the quota window

    # Gemini model name format requirement: "models/{model_name}"
    clean_model = model if model.startswith("models/") else f"models/{model}"

    payload = {
        "model": clean_model,
        "contents": [
            {
                "role": "user",
                "parts": [{"text": context_text}]
            }
        ],
        "displayName": f"vibe_ctx_{identifier}"[:128],
        "ttl": f"{ttl_seconds}s"
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(endpoint, json=payload)
            if res.status_code in (200, 201):
                data = res.json()
                cache_name = data.get("name")
                expire_time_str = data.get("expireTime")
                expire_dt = None
                if expire_time_str:
                    try:
                        # ISO 8601 parsing
                        expire_dt = datetime.datetime.fromisoformat(expire_time_str.replace("Z", "+00:00")).replace(tzinfo=None)
                    except Exception:
                        expire_dt = datetime.datetime.utcnow() + datetime.timedelta(seconds=ttl_seconds)
                logger.info(f"Gemini Context Cache creado exitosamente: {cache_name}")
                return cache_name, expire_dt
            else:
                logger.debug(f"Gemini Context Cache no creado (status {res.status_code}): {res.text}")
                return None, None
    except Exception as e:
        logger.warning(f"Aviso creando Gemini Context Cache: {e}")
        return None, None
