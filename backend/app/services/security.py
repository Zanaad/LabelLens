"""Password hashing (argon2id), session JWTs and opaque one-time tokens."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.config import get_settings

_hasher = PasswordHasher()

# Used to equalise timing when the email does not exist.
_DUMMY_HASH = _hasher.hash("labellens-timing-equaliser")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def create_session_token(user_id: uuid.UUID, ttl: timedelta | None = None) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + (ttl or timedelta(minutes=s.jwt_ttl_minutes)),
        "typ": "session",
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_session_token(token: str) -> tuple[uuid.UUID, int] | None:
    """Return (user id, issued-at in epoch seconds) for a valid session token."""
    s = get_settings()
    try:
        payload = jwt.decode(
            token,
            s.jwt_secret,
            algorithms=[s.jwt_algorithm],
            options={"require": ["exp", "sub", "iat"]},
        )
        if payload.get("typ") != "session":
            return None
        return uuid.UUID(payload["sub"]), int(payload["iat"])
    except (jwt.PyJWTError, ValueError):
        return None


def new_opaque_token() -> tuple[str, str]:
    """Return (token, sha256 hex). 32 random bytes; store only the hash."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
