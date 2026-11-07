from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Invitation, Role
from app.services.security import hash_token
from tests.conftest import PASSWORD, login, make_user


def _invite(client: TestClient, db: Session, email: str = "besim@example.org", role="expert"):
    make_user(db, "elira@example.org", Role.admin)
    login(client, "elira@example.org")
    r = client.post("/api/invitations", json={"email": email, "role": role})
    assert r.status_code == 201, r.text
    client.post("/api/auth/logout")
    return r.json()


def _accept(client: TestClient, token: str, **overrides):
    body = {
        "token": token,
        "full_name": "Besim Hoxha",
        "password": PASSWORD,
        "accept_privacy": True,
        "accept_terms": True,
        **overrides,
    }
    return client.post("/api/invitations/accept", json=body)


def test_admin_creates_invitation_and_only_hash_is_stored(client: TestClient, db: Session):
    inv = _invite(client, db)
    assert inv["accept_path"] == f"/accept-invite#{inv['token']}"
    row = db.scalar(select(Invitation).where(Invitation.email == "besim@example.org"))
    assert row is not None
    assert row.token_hash == hash_token(inv["token"])
    assert inv["token"] not in row.token_hash
    assert row.expires_at > datetime.now(UTC)


def test_invitation_is_emailed_with_the_one_time_link(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
):
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "app.api.invitations.send_email", lambda to, _s, body: sent.append((to, body))
    )
    inv = _invite(client, db)
    [(to, body)] = sent
    assert to == "besim@example.org"
    assert f"/accept-invite#{inv['token']}" in body


def test_invitation_accept_creates_user_with_invited_role(client: TestClient, db: Session):
    inv = _invite(client, db, role="admin")
    preview = client.post("/api/invitations/inspect", json={"token": inv["token"]})
    assert preview.status_code == 200
    assert preview.json()["email"] == "besim@example.org" and preview.json()["role"] == "admin"

    r = _accept(client, inv["token"])
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "admin"
    assert client.get("/api/auth/me").json()["email"] == "besim@example.org"

    # One-time use
    client.post("/api/auth/logout")
    assert _accept(client, inv["token"]).status_code == 404


def test_expired_or_revoked_invitations_are_rejected(client: TestClient, db: Session):
    inv = _invite(client, db)
    row = db.scalar(select(Invitation))
    assert row is not None
    row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db.commit()
    r = _accept(client, inv["token"])
    assert r.status_code == 404 and r.json()["detail"] == "invitation_invalid"

    row.expires_at = datetime.now(UTC) + timedelta(days=1)
    row.revoked_at = datetime.now(UTC)
    db.commit()
    assert _accept(client, inv["token"]).status_code == 404


def test_only_admins_can_invite(client: TestClient, db: Session):
    make_user(db, "arta@example.org", Role.pharmacist)
    body = {"email": "x@example.org", "role": "expert"}
    assert client.post("/api/invitations", json=body).status_code == 401
    login(client, "arta@example.org")
    assert client.post("/api/invitations", json=body).status_code == 403
    assert client.get("/api/invitations").status_code == 403


def test_cannot_invite_pharmacist_role_or_existing_email(client: TestClient, db: Session):
    make_user(db, "elira@example.org", Role.admin)
    login(client, "elira@example.org")
    r = client.post("/api/invitations", json={"email": "p@example.org", "role": "pharmacist"})
    assert r.status_code == 422
    r = client.post("/api/invitations", json={"email": "elira@example.org", "role": "expert"})
    assert r.status_code == 409


def test_admin_can_list_and_revoke(client: TestClient, db: Session):
    make_user(db, "elira@example.org", Role.admin)
    login(client, "elira@example.org")
    created = client.post("/api/invitations", json={"email": "b@example.org", "role": "expert"})
    inv_id = created.json()["id"]
    listed = client.get("/api/invitations").json()
    assert [i["id"] for i in listed] == [inv_id]
    assert "token" not in listed[0]
    revoked = client.post(f"/api/invitations/{inv_id}/revoke")
    assert revoked.status_code == 200 and revoked.json()["revoked_at"] is not None
