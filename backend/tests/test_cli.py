import json
import secrets
from pathlib import Path

import pytest
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app import cli
from app.api.schemas import LabelFile
from app.models import Annotation, AnnotationStatus, ReferencePreparation, Role, User
from app.services.storage import LocalStorage

REFERENCE_FILE = Path(__file__).parents[2] / "data" / "reference" / "ema-draft.json"
LABELS_FILE = Path(__file__).parents[2] / "data" / "labels" / "validation-labels.json"


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


def test_seed_reference_loads_an_empty_table_only(
    db: Session, engine: Engine, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(cli, "get_engine", lambda: engine)
    assert cli.seed_reference(REFERENCE_FILE) == 0
    count = db.scalar(select(func.count()).select_from(ReferencePreparation))
    assert count
    db.delete(db.scalars(select(ReferencePreparation)).first())
    db.commit()
    assert cli.seed_reference(REFERENCE_FILE) == 0
    assert db.scalar(select(func.count()).select_from(ReferencePreparation)) == count - 1


def test_seed_labels_adds_new_images_in_review_once(
    db: Session, engine: Engine, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
):
    LabelFile.model_validate_json(LABELS_FILE.read_bytes())  # the shipped label set is valid
    monkeypatch.setattr(cli, "get_engine", lambda: engine)
    monkeypatch.setattr(cli, "get_storage", lambda: LocalStorage(tmp_path / "storage"))
    Image.new("RGB", (40, 20), "white").save(tmp_path / "label.png")
    label = {"file": "label.png", "title": "Tea", "fields": {"plant": "Chamomile"}}
    path = tmp_path / "labels.json"
    path.write_text(json.dumps({"labels": [label]}))
    assert cli.seed_labels(path) == 0
    [a] = db.scalars(select(Annotation)).all()
    assert a.status == AnnotationStatus.in_review  # a person checks it before it counts
    assert a.fields_json["plant"] == "Chamomile" and a.fields_json["dose"] is None
    assert cli.seed_labels(path) == 0  # the same image is never added twice
    assert db.scalar(select(func.count()).select_from(Annotation)) == 1
