# Admin: user accounts. Invitations live in invitations.py.

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import start_password_reset
from app.api.deps import require_roles
from app.api.schemas import AdminUserOut, AdminUserUpdate
from app.db import get_db
from app.models import Role, User
from app.services.audit import audit

router = APIRouter(prefix="/api/admin", tags=["admin"])

admin_only = require_roles(Role.admin)


def _other_user(db: Session, user_id: uuid.UUID, admin: User) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    if user.id == admin.id:  # an admin cannot lock themselves out
        raise HTTPException(status.HTTP_409_CONFLICT, detail="cannot_change_self")
    return user


@router.get("/users", response_model=list[AdminUserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(admin_only)) -> list[User]:
    return list(db.scalars(select(User).order_by(User.created_at.desc())))


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: uuid.UUID,
    body: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(admin_only),
) -> User:
    user = _other_user(db, user_id, admin)
    if user.is_active != body.is_active:
        user.is_active = body.is_active
        action = "user.activate" if body.is_active else "user.deactivate"
        audit(db, action, user_id=admin.id, entity_type="user", entity_id=user.id)
        db.commit()
    return user


@router.post("/users/{user_id}/password-reset", status_code=202)
def send_password_reset(
    user_id: uuid.UUID,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(admin_only),
) -> Response:
    user = _other_user(db, user_id, admin)
    if not user.is_active:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="user_inactive")
    start_password_reset(db, user, background, requested_by=admin)
    db.commit()
    return Response(status_code=202)
