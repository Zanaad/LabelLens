"""Email + password auth. Session = JWT in an httpOnly, SameSite=Lax cookie."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import (
    ForgotPasswordIn,
    LoginIn,
    PasswordChangeIn,
    PasswordResetIn,
    ProfileUpdate,
    RegisterIn,
    UserOut,
)
from app.config import get_settings
from app.db import get_db
from app.models import PasswordReset, Role, User
from app.services.audit import audit
from app.services.email import send_email
from app.services.rate_limit import rate_limit
from app.services.security import (
    create_session_token,
    hash_password,
    hash_token,
    new_opaque_token,
    verify_password,
)

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


def clear_session_cookie(response: Response) -> Response:
    s = get_settings()
    response.delete_cookie(
        s.cookie_name, path="/", httponly=True, secure=s.cookie_secure, samesite="lax"
    )
    response.status_code = 204
    return response


@router.post("/logout", status_code=204)
def logout(response: Response) -> Response:
    return clear_session_cookie(response)


RESET_SUBJECT = "Reset your LabelLens password"
RESET_BODY = """Hello {name},

Someone asked to reset the password for your LabelLens account.
To choose a new password, open this link within {minutes} minutes:

{link}

The link works once. If you did not ask for this, you can ignore this email; your password
stays the same.

LabelLens (research prototype)
"""


def start_password_reset(
    db: Session, user: User, background: BackgroundTasks, requested_by: User | None = None
) -> None:
    """Create a one-time link and email it after the response (caller commits)."""
    s = get_settings()
    token, token_hash = new_opaque_token()
    db.add(
        PasswordReset(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.now(UTC) + timedelta(minutes=s.password_reset_ttl_minutes),
        )
    )
    audit(
        db,
        "auth.password_reset_requested",
        user_id=(requested_by or user).id,
        entity_type="user",
        entity_id=user.id,
    )
    body = RESET_BODY.format(
        name=user.full_name,
        minutes=s.password_reset_ttl_minutes,
        link=f"{s.app_base_url.rstrip('/')}/reset-password#{token}",
    )
    background.add_task(send_email, user.email, RESET_SUBJECT, body)


@router.post("/forgot-password", status_code=202, dependencies=[auth_limit])
def forgot_password(
    body: ForgotPasswordIn, background: BackgroundTasks, db: Session = Depends(get_db)
) -> Response:
    user = db.scalar(select(User).where(User.email == normalise_email(body.email)))
    if user is not None and user.is_active:
        start_password_reset(db, user, background)
        db.commit()
    # Same answer either way, so the form cannot be used to find out who has an account.
    return Response(status_code=202)


@router.post("/reset-password", status_code=204, dependencies=[auth_limit])
def reset_password(body: PasswordResetIn, db: Session = Depends(get_db)) -> Response:
    now = datetime.now(UTC)
    reset = db.scalar(
        select(PasswordReset).where(PasswordReset.token_hash == hash_token(body.token))
    )
    user = db.get(User, reset.user_id) if reset else None
    if reset is None or reset.used_at or reset.expires_at <= now or not (user and user.is_active):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="reset_invalid")
    check_new_password(body.password)
    user.password_hash = hash_password(body.password)
    user.sessions_valid_from = now  # signs the account out everywhere
    pending = select(PasswordReset).where(
        PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None)
    )
    for r in db.scalars(pending):
        r.used_at = now
    audit(db, "auth.password_reset", user_id=user.id, entity_type="user", entity_id=user.id)
    db.commit()
    return Response(status_code=204)


@router.post("/change-password", status_code=204, dependencies=[auth_limit])
def change_password(
    body: PasswordChangeIn,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    if not verify_password(user.password_hash, body.current_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="wrong_password")
    check_new_password(body.new_password)
    user.password_hash = hash_password(body.new_password)
    # Signs the account out everywhere, this device too (cut-off is in whole seconds).
    user.sessions_valid_from = datetime.now(UTC)
    audit(db, "auth.password_changed", user_id=user.id, entity_type="user", entity_id=user.id)
    db.commit()
    return clear_session_cookie(response)


@router.post("/sign-out-everywhere", status_code=204)
def sign_out_everywhere(
    response: Response, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Response:
    user.sessions_valid_from = datetime.now(UTC)
    audit(db, "auth.sign_out_everywhere", user_id=user.id, entity_type="user", entity_id=user.id)
    db.commit()
    return clear_session_cookie(response)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    body: ProfileUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> User:
    if body.full_name is not None:
        if not body.full_name.strip():
            raise HTTPException(422, detail="name_required")
        user.full_name = body.full_name.strip()
    user.organisation = (body.organisation or "").strip() or None
    if body.onboarded and user.onboarded_at is None:
        user.onboarded_at = datetime.now(UTC)
    db.commit()
    return user
