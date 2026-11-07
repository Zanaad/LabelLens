import secrets

import pytest
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app import cli
from app.models import Role, User


@pytest.fixture
def admin_env(monkeypatch: pytest.MonkeyPatch, engine: Engine) -> None:
    monkeypatch.setattr(cli, "get_engine", lambda: engine)
    monkeypatch.setenv("ADMIN_EMAIL", "first@example.org")
    monkeypatch.setenv("ADMIN_PASSWORD", secrets.token_urlsafe(16))


def admins(db: Session) -> int:
    return db.scalar(select(func.count()).where(User.role == Role.admin)) or 0


def test_seed_admin_creates_one_admin_only_once(admin_env: None, db: Session):
    assert cli.seed_admin() == 0
    assert admins(db) == 1
    assert cli.seed_admin() == 0
    assert admins(db) == 1


def test_seed_admin_does_nothing_without_credentials(
    admin_env: None, db: Session, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.delenv("ADMIN_PASSWORD")
    assert cli.seed_admin() == 0
    assert admins(db) == 0
