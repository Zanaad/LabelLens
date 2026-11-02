"""Email + password auth. Session = JWT in an httpOnly, SameSite=Lax cookie."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import LoginIn, RegisterIn, UserOut
from app.config import get_settings
from app.db import get_db
from app.models import Role, User
from app.services.audit import audit
from app.services.rate_limit import rate_limit
from app.services.security import create_session_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

auth_limit = Depends(rate_limit("auth", "auth_rate_limit_per_minute"))


def normalise_email(email: str) -> str:
    return email.strip().lower()


def check_new_password(password: str) -> None:
    if len(password) < get_settings().password_min_length:
        raise HTTPException(422, detail="password_too_short")


def check_consent(accept_privacy: bool, accept_terms: bool) -> None:
    if not (accept_privacy and accept_terms):
        raise HTTPException(422, detail="consent_required")


def set_session_cookie(response: Response, user: User) -> None:
    s = get_settings()
    response.set_cookie(
        key=s.cookie_name,
        value=create_session_token(user.id),
        max_age=s.jwt_ttl_minutes * 60,
        httponly=True,
        secure=s.cookie_secure,
        samesite="lax",
        path="/",
    )


def email_exists(db: Session, email: str) -> bool:
    return db.scalar(select(User.id).where(User.email == email)) is not None


@router.post("/register", response_model=UserOut, status_code=201, dependencies=[auth_limit])
def register(body: RegisterIn, response: Response, db: Session = Depends(get_db)) -> User:
    """Self-registration always creates a Pharmacist account."""
    check_new_password(body.password)
    check_consent(body.accept_privacy, body.accept_terms)
    email = normalise_email(body.email)
    if email_exists(db, email):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="email_taken")
    now = datetime.now(UTC)
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        full_name=body.full_name.strip(),
        organisation=(body.organisation or "").strip() or None,
        role=Role.pharmacist,
        consent_privacy_at=now,
        consent_terms_at=now,
        last_login_at=now,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:  # concurrent registration with the same email
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="email_taken") from None
    audit(db, "auth.register", user_id=user.id, entity_type="user", entity_id=user.id)
    db.commit()
    set_session_cookie(response, user)
    return user


@router.post("/login", response_model=UserOut, dependencies=[auth_limit])
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)) -> User:
    user = db.scalar(select(User).where(User.email == normalise_email(body.email)))
    ok = verify_password(user.password_hash if user else None, body.password)
    if not ok or user is None or not user.is_active:
        audit(db, "auth.login_failed", details={"reason": "invalid_credentials"})
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    user.last_login_at = datetime.now(UTC)
    audit(db, "auth.login", user_id=user.id)
    db.commit()
    set_session_cookie(response, user)
    return user


@router.post("/logout", status_code=204)
def logout(response: Response) -> Response:
    s = get_settings()
    response.delete_cookie(
        s.cookie_name, path="/", httponly=True, secure=s.cookie_secure, samesite="lax"
    )
    response.status_code = 204
    return response


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
