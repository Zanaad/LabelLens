"""Shared API dependencies: current user and role guard."""

from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Role, User
from app.services.security import decode_session_token


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(get_settings().cookie_name)
    claims = decode_session_token(token) if token else None
    user = db.get(User, claims[0]) if claims else None
    if claims is None or user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not_authenticated")
    # A password reset ends every session that started before it (whole seconds, so "<=").
    cut_off = user.sessions_valid_from
    if cut_off and claims[1] <= int(cut_off.timestamp()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not_authenticated")
    return user


def require_roles(*roles: Role) -> Callable[..., User]:
    """Dependency factory: allow only users whose role is in `roles`."""

    def guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        return user

    return guard
