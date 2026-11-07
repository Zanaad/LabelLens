import secrets

from fastapi.testclient import TestClient
from httpx import Response
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


def test_remember_me_sets_a_longer_session(client: TestClient, db: Session):
    make_user(db, "besim@example.org", Role.expert)
    s = get_settings()
    body = {"email": "besim@example.org", "password": PASSWORD}

    normal = client.post("/api/auth/login", json=body).headers["set-cookie"]
    assert f"Max-Age={s.jwt_ttl_minutes * 60}" in normal

    remembered = client.post("/api/auth/login", json={**body, "remember_me": True})
    assert f"Max-Age={s.remember_me_days * 86400}" in remembered.headers["set-cookie"]
    assert client.get("/api/auth/me").status_code == 200


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


def test_registration_needs_a_confirmed_email_when_email_is_set_up(
    client: TestClient, db: Session, monkeypatch
):
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr("app.api.auth.send_email", lambda to, _s, body: sent.append((to, body)))
    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    get_settings.cache_clear()
    try:
        r = client.post("/api/auth/register", json=REG)
        assert r.status_code == 201 and r.json()["email_verified"] is False
        assert "set-cookie" not in r.headers  # not signed in yet
        creds = {"email": REG["email"], "password": PASSWORD}
        blocked = client.post("/api/auth/login", json=creds)
        assert blocked.status_code == 403 and blocked.json()["detail"] == "email_not_verified"
        wrong = client.post("/api/auth/login", json={**creds, "password": WRONG})
        assert wrong.json()["detail"] == "invalid_credentials"  # status only after the password

        resend = "/api/auth/resend-verification"
        assert client.post(resend, json={"email": "nobody@example.org"}).status_code == 202
        assert client.post(resend, json={"email": REG["email"]}).status_code == 202
        assert len(sent) == 2 and all(to == "arta.krasniqi@example.org" for to, _ in sent)

        token = sent[0][1].split("/verify-email#")[1].split()[0]
        verified = client.post("/api/auth/verify-email", json={"token": token})
        assert verified.status_code == 200 and verified.json()["email_verified"] is True
        assert client.get("/api/auth/me").status_code == 200  # signed in by the link
        again = sent[1][1].split("/verify-email#")[1].split()[0]
        reused = client.post("/api/auth/verify-email", json={"token": again})
        assert reused.json()["detail"] == "verification_invalid"  # all links used up
        assert client.post("/api/auth/login", json=creds).status_code == 200
    finally:
        monkeypatch.delenv("SMTP_HOST")
        get_settings.cache_clear()


def test_change_password(client: TestClient, db: Session):
    user = make_user(db, "arta@example.org")
    new_password = secrets.token_urlsafe(16)

    def change(current: str, new: str) -> Response:
        body = {"current_password": current, "new_password": new}
        return client.post("/api/auth/change-password", json=body)

    assert change(PASSWORD, new_password).status_code == 401  # must be signed in
    login(client, "arta@example.org")
    assert change(WRONG, new_password).json()["detail"] == "wrong_password"
    assert change(PASSWORD, new_password[:5]).json()["detail"] == "password_too_short"
    assert client.get("/api/auth/me").status_code == 200  # failed attempts keep the session

    assert change(PASSWORD, new_password).status_code == 204
    assert client.get("/api/auth/me").status_code == 401  # signed out everywhere
    old = client.post("/api/auth/login", json={"email": "arta@example.org", "password": PASSWORD})
    assert old.status_code == 401
    login(client, "arta@example.org", new_password)
    actions = db.scalars(select(AuditLog.action).where(AuditLog.user_id == user.id)).all()
    assert "auth.password_changed" in actions


def test_profile_name_and_sign_out_everywhere(client: TestClient, db: Session):
    make_user(db, "arta@example.org")
    login(client, "arta@example.org")
    r = client.patch("/api/auth/me", json={"full_name": "  Arta K.  ", "organisation": None})
    assert r.json()["full_name"] == "Arta K."
    assert (
        client.patch("/api/auth/me", json={"full_name": "  "}).json()["detail"] == "name_required"
    )
    assert client.patch("/api/auth/me", json={}).json()["full_name"] == "Arta K."  # unchanged

    assert client.post("/api/auth/sign-out-everywhere").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    login(client, "arta@example.org")  # the password still works


def test_auth_endpoints_are_rate_limited(client: TestClient):
    limit = get_settings().auth_rate_limit_per_minute
    body = {"email": "a@example.org", "password": WRONG}
    codes = [client.post("/api/auth/login", json=body).status_code for _ in range(limit + 1)]
    assert codes[:limit] == [401] * limit
    assert codes[-1] == 429
