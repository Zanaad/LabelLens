# In-memory SQLite by default; set TEST_DATABASE_URL to run on Postgres (as CI does).

import os
import secrets
from collections.abc import Iterator

os.environ.setdefault("APP_ENV", "test")
os.environ["EXTRACTION_PROVIDER"] = "cached"
os.environ["SMTP_HOST"] = ""  # tests must never send real email, even with a local .env
os.environ.setdefault("JWT_SECRET", secrets.token_urlsafe(32))
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite+pysqlite:///:memory:")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.db import get_db
from app.main import create_app
from app.models import Base, Role, User
from app.services.rate_limit import limiter
from app.services.security import hash_password

# Generated per run so no password literal is ever committed.
PASSWORD = secrets.token_urlsafe(16)


@pytest.fixture
def engine() -> Iterator[Engine]:
    url = os.environ["DATABASE_URL"]
    if url.startswith("sqlite"):
        eng = create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    else:
        eng = create_engine(url)
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with factory() as session:
        yield session


@pytest.fixture
def client(engine: Engine) -> Iterator[TestClient]:
    get_settings.cache_clear()
    limiter.reset()
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_db() -> Iterator[Session]:
        with factory() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as c:
        yield c


def make_user(db: Session, email: str, role: Role = Role.pharmacist, active: bool = True) -> User:
    user = User(
        email=email,
        password_hash=hash_password(PASSWORD),
        full_name=email.split("@")[0].title(),
        role=role,
        is_active=active,
    )
    db.add(user)
    db.commit()
    return user


def login(client: TestClient, email: str, password: str = PASSWORD) -> None:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
