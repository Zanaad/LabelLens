import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.config import Settings, get_settings
from app.models import Role, User
from app.services.security import create_session_token, decode_session_token
from app.services.storage import LocalStorage
from tests.conftest import login, make_user


def test_session_token_rejects_expired_and_forged():
    uid = uuid.uuid4()
    claims = decode_session_token(create_session_token(uid))
    assert claims is not None and claims[0] == uid
    s = get_settings()
    expired = jwt.encode(
        {"sub": str(uid), "typ": "session", "exp": datetime.now(UTC) - timedelta(seconds=1)},
        s.jwt_secret,
        algorithm=s.jwt_algorithm,
    )
    assert decode_session_token(expired) is None
    forged = jwt.encode(
        {"sub": str(uid), "typ": "session", "exp": datetime.now(UTC) + timedelta(hours=1)},
        secrets.token_urlsafe(32),
        algorithm="HS256",
    )
    assert decode_session_token(forged) is None


def test_settings_refuse_insecure_values():
    key = secrets.token_urlsafe(32)
    with pytest.raises(ValidationError):
        Settings(jwt_secret=key[:10])
    with pytest.raises(ValidationError):
        Settings(app_env="production", jwt_secret=key, cookie_secure=False)
    with pytest.raises(ValidationError):
        Settings(jwt_secret=key, cors_origins="*")
    Settings(app_env="production", jwt_secret=key, cookie_secure=True)


def test_role_guard(client: TestClient, db: Session):
    app: FastAPI = client.app  # type: ignore[assignment]

    @app.get("/api/_test/admin-or-expert")
    def _guarded(user: User = Depends(require_roles(Role.admin, Role.expert))) -> dict:
        return {"role": user.role}

    for email, role, expected in [
        ("p@example.org", Role.pharmacist, 403),
        ("e@example.org", Role.expert, 200),
        ("a@example.org", Role.admin, 200),
    ]:
        make_user(db, email, role)
        login(client, email)
        assert client.get("/api/_test/admin-or-expert").status_code == expected
        client.post("/api/auth/logout")
    assert client.get("/api/_test/admin-or-expert").status_code == 401


def test_local_storage_blocks_path_traversal(tmp_path):
    with pytest.raises(ValueError):
        LocalStorage(tmp_path).save("../escape.txt", b"x")
