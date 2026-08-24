"""Sliding-window in-memory rate limiter for AI endpoints.

Keyed by user UUID. Two windows enforced:
  - per-minute burst limit  (default: 5 req/min)
  - per-day cost limit      (default: 50 req/day)

Both are configurable via environment variables:
  AI_RATE_PER_MINUTE   (int, default 5)
  AI_RATE_PER_DAY      (int, default 50)

Works with a single uvicorn worker. For multi-worker deployments a
shared store (Redis) would be needed, but this app runs one worker.
"""

import os
import time
from collections import defaultdict, deque
from uuid import UUID

from fastapi import Depends, HTTPException

from app.api.deps import get_current_user
from app.models.user import User, OrganizationMember

_PER_MINUTE: int = int(os.getenv("AI_RATE_PER_MINUTE", "5"))
_PER_DAY: int = int(os.getenv("AI_RATE_PER_DAY", "50"))

_MINUTE = 60.0
_DAY = 86_400.0

# user_id → deque of request timestamps (float, seconds since epoch)
_minute_windows: dict[str, deque] = defaultdict(deque)
_day_windows: dict[str, deque] = defaultdict(deque)


def _trim(dq: deque, window: float, now: float) -> None:
    cutoff = now - window
    while dq and dq[0] <= cutoff:
        dq.popleft()


def _record_and_check(user_id: str) -> None:
    """Slide the windows forward, check limits, then record the new request.

    Raises HTTPException 429 if either limit is exceeded.
    Raises before recording so a rejected request doesn't consume quota.
    """
    now = time.monotonic()

    minute_dq = _minute_windows[user_id]
    day_dq = _day_windows[user_id]

    _trim(minute_dq, _MINUTE, now)
    _trim(day_dq, _DAY, now)

    if len(minute_dq) >= _PER_MINUTE:
        retry_after = int(_MINUTE - (now - minute_dq[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"AI rate limit exceeded: max {_PER_MINUTE} requests per minute. "
                   f"Retry after {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    if len(day_dq) >= _PER_DAY:
        retry_after = int(_DAY - (now - day_dq[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"AI rate limit exceeded: max {_PER_DAY} requests per day. "
                   f"Retry after {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    minute_dq.append(now)
    day_dq.append(now)


async def check_ai_rate_limit(
    current: tuple[User, OrganizationMember] = Depends(get_current_user),
) -> None:
    """FastAPI dependency — add to any AI endpoint via Depends(check_ai_rate_limit)."""
    user, _ = current
    _record_and_check(str(user.id))
