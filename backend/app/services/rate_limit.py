# In-memory sliding-window limiter; only valid for a single backend process.

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import HTTPException, Request, status

from app.config import get_settings


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window_s: float = 60.0) -> bool:
        """Record a hit; return False if the limit is exceeded."""
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window_s:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def rate_limit(group: str, limit_setting: str) -> Callable[[Request], None]:
    """FastAPI dependency factory: limit requests per client IP for a route group."""

    def dependency(request: Request) -> None:
        s = get_settings()
        if not s.rate_limit_enabled:
            return
        limit = int(getattr(s, limit_setting))
        ip = request.client.host if request.client else "unknown"
        if not limiter.hit(f"{group}:{ip}", limit):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="too_many_requests",
                headers={"Retry-After": "60"},
            )

    return dependency
