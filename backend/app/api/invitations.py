# Invitation-only accounts (expert, admin). No email: the admin shares /accept-invite#<token>;
# the fragment keeps the token out of server logs.

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import (
    auth_limit,
    check_consent,
    check_new_password,
    email_exists,
    normalise_email,
    set_session_cookie,
)
from app.api.deps import require_roles
from app.api.schemas import (
    InvitationAcceptIn,
    InvitationCreate,
    InvitationCreated,
    InvitationOut,
    InvitationPreview,
    InvitationTokenIn,
    UserOut,
)
from app.config import get_settings
from app.db import get_db
from app.models import Invitation, Role, User
from app.services.audit import audit
from app.services.security import hash_password, hash_token, new_opaque_token

router = APIRouter(prefix="/api/invitations", tags=["invitations"])

admin_only = require_roles(Role.admin)


def _usable_invitation(db: Session, token: str) -> Invitation:
    inv = db.scalar(select(Invitation).where(Invitation.token_hash == hash_token(token)))
    now = datetime.now(UTC)
    if inv is None or inv.accepted_at or inv.revoked_at or inv.expires_at <= now:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="invitation_invalid")
    return inv


@router.post("", response_model=InvitationCreated, status_code=201)
def create_invitation(
    body: InvitationCreate, db: Session = Depends(get_db), admin: User = Depends(admin_only)
) -> InvitationCreated:
    email = normalise_email(body.email)
    if email_exists(db, email):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="email_taken")
    token, token_hash = new_opaque_token()
    inv = Invitation(
        email=email,
        role=body.role,
        token_hash=token_hash,
        invited_by_id=admin.id,
        expires_at=datetime.now(UTC) + timedelta(hours=get_settings().invitation_ttl_hours),
    )
    db.add(inv)
    db.flush()
    audit(
        db,
        "invitation.create",
        user_id=admin.id,
        entity_type="invitation",
        entity_id=inv.id,
        details={"role": body.role.value},
    )
    db.commit()
    return InvitationCreated(
        **InvitationOut.model_validate(inv).model_dump(),
        token=token,
        accept_path=f"/accept-invite#{token}",
    )


@router.get("", response_model=list[InvitationOut])
def list_invitations(
    db: Session = Depends(get_db), _: User = Depends(admin_only)
) -> list[Invitation]:
    return list(db.scalars(select(Invitation).order_by(Invitation.created_at.desc())))


@router.post("/{invitation_id}/revoke", response_model=InvitationOut)
def revoke_invitation(
    invitation_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(admin_only)
) -> Invitation:
    inv = db.get(Invitation, invitation_id)
    if inv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    if inv.accepted_at is None and inv.revoked_at is None:
        inv.revoked_at = datetime.now(UTC)
        audit(db, "invitation.revoke", user_id=admin.id, entity_type="invitation", entity_id=inv.id)
        db.commit()
    return inv


@router.post("/inspect", response_model=InvitationPreview, dependencies=[auth_limit])
def inspect_invitation(body: InvitationTokenIn, db: Session = Depends(get_db)) -> Invitation:
    """Public: show the invited email and role before the user sets a password."""
    return _usable_invitation(db, body.token)


@router.post("/accept", response_model=UserOut, status_code=201, dependencies=[auth_limit])
def accept_invitation(
    body: InvitationAcceptIn, response: Response, db: Session = Depends(get_db)
) -> User:
    inv = _usable_invitation(db, body.token)
    check_new_password(body.password)
    check_consent(body.accept_privacy, body.accept_terms)
    if email_exists(db, inv.email):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="email_taken")
    now = datetime.now(UTC)
    user = User(
        email=inv.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name.strip(),
        role=inv.role,
        consent_privacy_at=now,
        consent_terms_at=now,
        last_login_at=now,
    )
    db.add(user)
    db.flush()
    inv.accepted_at = now
    inv.accepted_user_id = user.id
    audit(db, "invitation.accept", user_id=user.id, entity_type="invitation", entity_id=inv.id)
    db.commit()
    set_session_cookie(response, user)
    return user
