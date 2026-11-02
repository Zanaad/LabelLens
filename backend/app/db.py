"""Database engine and session handling."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    global _engine, _SessionLocal
    if _engine is None:
        _engine = create_engine(get_settings().database_url, pool_pre_ping=True)
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
    return _engine


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    get_engine()
    if _SessionLocal is None:  # pragma: no cover
        raise RuntimeError("Database session factory not initialised")
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()
