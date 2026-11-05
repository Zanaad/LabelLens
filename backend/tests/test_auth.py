import secrets

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AuditLog, PasswordReset, Role, User
from tests.conftest import PASSWORD, login, make_user

WRONG = secrets.token_urlsafe(16)
REG = {
    "full_name": "Arta Krasniqi",
    "email": "Arta.Krasniqi@Example.org",
    "password": PASSWORD,
    "organisation": "Farmacia Qendra",
    "accept_privacy": True,
    "accept_terms": True,
}


def test_register_creates_pharmacist_and_sets_httponly_cookie(client: TestClient, db: Session):
    r = client.post("/api/auth/register", json=REG)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["role"] == "pharmacist"
    assert body["email"] == "arta.krasniqi@example.org"  # normalised
    assert "password_hash" not in body

    set_cookie = r.headers["set-cookie"]
    assert get_settings().cookie_name in set_cookie
    assert "HttpOnly" in set_cookie
    assert "samesite=lax" in set_cookie.lower()

    user = db.scalar(select(User).where(User.email == "arta.krasniqi@example.org"))
    assert user is not None
    assert user.password_hash != PASSWORD and user.password_hash.startswith("$argon2")
    assert user.consent_privacy_at is not None and user.consent_terms_at is not None

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["full_name"] == "Arta Krasniqi"


def test_register_cannot_choose_role(client: TestClient):
    r = client.post("/api/auth/register", json={**REG, "role": "admin"})
    assert r.status_code == 201
    assert r.json()["role"] == "pharmacist"


def test_register_duplicate_email_is_rejected(client: TestClient):
    assert client.post("/api/auth/register", json=REG).status_code == 201
    r = client.post("/api/auth/register", json={**REG, "email": "ARTA.krasniqi@example.org"})
    assert r.status_code == 409
    assert r.json()["detail"] == "email_taken"


def test_register_requires_long_password_and_both_consents(client: TestClient):
    r = client.post("/api/auth/register", json={**REG, "password": PASSWORD[:5]})
    assert r.json()["detail"] == "password_too_short"
    for key in ("accept_privacy", "accept_terms"):
        r = client.post("/api/auth/register", json={**REG, key: False})
        assert r.json()["detail"] == "consent_required"


def test_login_logout_flow(client: TestClient, db: Session):
    make_user(db, "besim@example.org", Role.expert)
    assert client.get("/api/auth/me").status_code == 401

    login(client, "BESIM@example.org")
    me = client.get("/api/auth/me")
    assert me.status_code == 200 and me.json()["role"] == "expert"

    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_login_wrong_password_and_unknown_email_look_the_same(client: TestClient, db: Session):
    make_user(db, "arta@example.org")
    wrong = client.post("/api/auth/login", json={"email": "arta@example.org", "password": WRONG})
    unknown = client.post("/api/auth/login", json={"email": "no@example.org", "password": WRONG})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "invalid_credentials"}
    assert db.scalars(select(AuditLog).where(AuditLog.action == "auth.login_failed")).all()


def test_inactive_user_cannot_log_in(client: TestClient, db: Session):
    make_user(db, "gone@example.org", active=False)
    r = client.post("/api/auth/login", json={"email": "gone@example.org", "password": PASSWORD})
    assert r.status_code == 401


def test_tampered_cookie_is_rejected(client: TestClient):
    client.cookies.set(get_settings().cookie_name, "not-a-jwt")
    assert client.get("/api/auth/me").status_code == 401


def test_password_reset_by_email(client: TestClient, db: Session, monkeypatch):
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr("app.api.auth.send_email", lambda to, _s, body: sent.append((to, body)))
    make_user(db, "arta@example.org")
    login(client, "arta@example.org")  # an open session that the reset must end

    # Same answer for unknown emails, so the form does not reveal who has an account.
    forgot = "/api/auth/forgot-password"
    assert client.post(forgot, json={"email": "nobody@example.org"}).status_code == 202
    assert client.post(forgot, json={"email": "Arta@Example.org"}).status_code == 202
    assert len(sent) == 1 and sent[0][0] == "arta@example.org"
    token = sent[0][1].split("/reset-password#")[1].split()[0]
    stored = db.scalar(select(PasswordReset))
    assert stored is not None and stored.token_hash != token  # only the hash is kept

    new_password = secrets.token_urlsafe(16)
    reset = "/api/auth/reset-password"
    short = client.post(reset, json={"token": token, "password": new_password[:5]})
    assert short.json()["detail"] == "password_too_short"
    assert client.post(reset, json={"token": token, "password": new_password}).status_code == 204
    assert client.get("/api/auth/me").status_code == 401  # old session ended
    reused = client.post(reset, json={"token": token, "password": new_password})
    assert reused.json()["detail"] == "reset_invalid"  # one use only
    old = client.post("/api/auth/login", json={"email": "arta@example.org", "password": PASSWORD})
    assert old.status_code == 401
    login(client, "arta@example.org", new_password)


def test_auth_endpoints_are_rate_limited(client: TestClient):
    limit = get_settings().auth_rate_limit_per_minute
    body = {"email": "a@example.org", "password": WRONG}
    codes = [client.post("/api/auth/login", json=body).status_code for _ in range(limit + 1)]
    assert codes[:limit] == [401] * limit
    assert codes[-1] == 429
