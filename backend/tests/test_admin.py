import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import ReferenceFile
from app.cli import import_reference
from app.config import get_settings
from app.extraction.providers import PLAIN_PROMPT_VERSION, PROMPT_VERSION, cache_key
from app.extraction.schema import FIELD_KEYS
from app.models import ReferenceHistory, Role
from app.services.storage import LocalStorage, get_storage
from app.services.validation import field_outcome, wilson
from tests.conftest import PASSWORD, login, make_user

SAMPLE = Path(__file__).parents[2] / "data" / "reference" / "sample.json"
LABEL = "MEADOW CUP. Chamomile tea. 100% chamomile flowers. Best before 08/2027"


def as_user(client: TestClient, db: Session, email: str, role: Role) -> None:
    client.post("/api/auth/logout")
    make_user(db, email, role)
    login(client, email)


def reading(**stated: str) -> dict:
    blank = {"value": None, "status": "not_stated", "confidence": 1.0, "evidence": None}
    fields = {k: dict(blank) for k in FIELD_KEYS}
    for k, v in stated.items():
        fields[k] = {"value": v, "status": "stated", "confidence": 0.9, "evidence": v}
    head = {"label_readable": True, "is_herbal_product": True, "product_name": "MEADOW CUP"}
    return head | fields


def save_reading(cache_dir: Path, output: dict, prompt_version: str = PROMPT_VERSION) -> None:
    model = get_settings().validation_model
    record = {"model": model, "prompt_version": prompt_version, "output": output}
    key = cache_key(LABEL.encode(), model, prompt_version)
    (cache_dir / f"{key}.json").write_text(json.dumps(record))


@pytest.fixture
def cache_dir(tmp_path: Path, monkeypatch) -> Path:
    path = tmp_path / "cache"
    path.mkdir()
    monkeypatch.setenv("EXTRACTION_CACHE_DIR", str(path))
    get_settings.cache_clear()
    return path


@pytest.fixture
def reference(db: Session) -> None:
    import_reference(db, ReferenceFile.model_validate_json(SAMPLE.read_bytes()))


def test_admin_user_management(client: TestClient, db: Session):
    as_user(client, db, "p@example.org", Role.pharmacist)
    assert client.get("/api/admin/users").status_code == 403
    as_user(client, db, "admin@example.org", Role.admin)
    users = {u["email"]: u["id"] for u in client.get("/api/admin/users").json()}
    me = client.patch(f"/api/admin/users/{users['admin@example.org']}", json={"is_active": False})
    assert me.json()["detail"] == "cannot_change_self"
    other = client.patch(f"/api/admin/users/{users['p@example.org']}", json={"is_active": False})
    assert other.json()["is_active"] is False
    r = client.post("/api/auth/login", json={"email": "p@example.org", "password": PASSWORD})
    assert r.status_code == 401  # locked out even with the right password


def test_expert_review(client: TestClient, db: Session, cache_dir: Path, reference: None):
    save_reading(cache_dir, reading(plant="chamomile"))
    as_user(client, db, "arta@example.org", Role.pharmacist)
    scan = client.post("/api/scans/text", json={"text": LABEL}).json()
    client.post(f"/api/scans/{scan['id']}/verdict")
    assert client.get("/api/reviews").status_code == 403

    as_user(client, db, "besim@example.org", Role.expert)
    [item] = client.get("/api/reviews").json()
    assert item["my_rating"] is None and item["plant"] == "chamomile"
    url = f"/api/reviews/{item['verdict_id']}"
    assert "arta" not in json.dumps(client.get(url).json()).lower()  # no pharmacist name or email
    no_verdict = client.put(url, json={"rating": "disagree"})
    assert no_verdict.json()["detail"] == "correct_verdict_required"
    same = client.put(url, json={"rating": "disagree", "correct_verdict": item["verdict"]})
    assert same.json()["detail"] == "correct_verdict_same"
    disagree = {"rating": "disagree", "correct_verdict": "matches", "reason": "Species is clear"}
    assert client.put(url, json=disagree).status_code == 200
    agree = client.put(url, json={"rating": "agree", "correct_verdict": "matches"})
    assert agree.json()["correct_verdict"] is None
    assert client.get("/api/reviews").json()[0]["my_rating"] == "agree"  # updated, not duplicated

    client.post("/api/auth/logout")
    login(client, "arta@example.org")
    log = client.get(f"/api/scans/{scan['id']}/history").json()["activity"]
    review = [a for a in log if a["action"] == "scan.review"][-1]  # one entry per rating change
    assert review["by"] is None  # the expert stays anonymous
    assert review["details"] == {"rating": "agree"}
    [opinion] = client.get(f"/api/scans/{scan['id']}/verdict").json()["reviews"]
    assert opinion["rating"] == "agree"
    assert set(opinion) == {"rating", "correct_verdict", "reason"}  # nothing about who
    assert client.get("/api/scans").json()[0]["review"] == "agree"


def test_reference_editing(client: TestClient, db: Session):
    row = {"herb_latin": "Valeriana officinalis", "plant_part": "Root", "preparation_type": "Tea"}
    todo = {**row, "notes": "TODO(expert): check"}
    as_user(client, db, "e@example.org", Role.expert)
    assert client.get("/api/reference").status_code == 200
    assert client.post("/api/reference/preparations", json=todo).status_code == 403

    as_user(client, db, "admin@example.org", Role.admin)
    r = client.post("/api/reference/preparations", json=row)
    assert r.status_code == 422 and r.json()["detail"] == "todo_note_required"
    bad = client.post(
        "/api/reference/preparations", json={**todo, "extract_ratio_min": 7, "extract_ratio_max": 3}
    )
    assert bad.json()["detail"] == "ratio_range_invalid"
    created = client.post("/api/reference/preparations", json=todo).json()
    url = f"/api/reference/preparations/{created['id']}"
    client.put(url, json={**row, "verified": True})
    history = client.get(f"{url}/history").json()
    assert [h["action"] for h in history] == ["update", "create"]
    assert history[0]["before"]["verified"] is False and history[0]["after"]["verified"] is True
    client.delete(url)
    assert len(db.scalars(select(ReferenceHistory)).all()) == 3  # history outlives the row


def test_validation_run(
    client: TestClient, db: Session, cache_dir: Path, tmp_path: Path, reference: None
):
    storage = LocalStorage(tmp_path / "storage")
    client.app.dependency_overrides[get_storage] = lambda: storage  # type: ignore[attr-defined]
    as_user(client, db, "admin@example.org", Role.admin)
    created = client.post("/api/annotations/text", json={"text": LABEL}).json()
    assert created["prefilled"] is False  # no saved reading yet
    again = client.post("/api/annotations/text", json={"text": LABEL})
    assert again.json()["detail"] == "duplicate_label"

    truth = {"plant": "chamomile", "plant_part": "flowers", "preparation_type": "tea"}
    body = {"title": "Meadow Cup", "fields": truth, "status": "final"}
    url = f"/api/annotations/{created['id']}"
    assert client.put(url, json=body).json()["detail"] == "fields_check_required"
    saved = client.put(
        url,
        json=body | {"expected_verdict": "partly_matches", "fields_checked": True},
    ).json()
    assert saved["fields_checked"] is True and saved["checked_by"] == "Admin"
    checked_at = saved["checked_at"]
    as_user(client, db, "admin2@example.org", Role.admin)
    notes_only = client.put(
        url,
        json=body
        | {"expected_verdict": "partly_matches", "fields_checked": True, "notes": "Reviewed"},
    ).json()
    assert notes_only["checked_at"] == checked_at
    assert notes_only["checked_by"] == "Admin"

    # The reader got the plant part wrong and invented a batch number.
    wrong = reading(plant="Chamomile", plant_part="leaves", preparation_type="tea", batch="X1")
    save_reading(cache_dir, wrong)
    save_reading(cache_dir, dict.fromkeys(FIELD_KEYS) | truth, PLAIN_PROMPT_VERSION)

    as_user(client, db, "e@example.org", Role.expert)
    assert client.post("/api/validation/runs", json={}).status_code == 403
    client.post("/api/auth/logout")
    login(client, "admin2@example.org")
    m = client.post("/api/validation/runs", json={}).json()["metrics"]
    assert m["dataset"]["labels"] == 1 and m["dataset"]["read"] == 1
    assert m["fields"]["plant"]["correct"] == 1  # case does not matter
    assert m["fields"]["plant_part"]["wrong"] == 1 and m["fields"]["batch"]["invented"] == 1
    assert m["verdicts"]["rules_only"]["correct"] == 1  # correct fields -> partly matches
    assert m["verdicts"]["end_to_end"]["correct"] == 0  # "leaves" contradicts the flower tea
    assert m["baselines"]["keyword"]["correct"] == 0  # naive "matches"
    assert m["baselines"]["plain_model"]["correct"] == 1
    assert m["snapshot"][0]["expected_verdict"] == "partly_matches"
    assert m["snapshot"][0]["checked_at"] is not None
    assert client.get("/api/validation/runs").json()[0]["rules_only"] == 1.0


def test_field_only_validation_requires_human_check(
    client: TestClient, db: Session, cache_dir: Path, tmp_path: Path, monkeypatch
):
    client.app.dependency_overrides[get_storage] = lambda: LocalStorage(  # type: ignore[attr-defined]
        tmp_path / "storage"
    )
    as_user(client, db, "admin@example.org", Role.admin)
    created = client.post("/api/annotations/text", json={"text": LABEL}).json()
    url = f"/api/annotations/{created['id']}"
    monkeypatch.setenv("EXTRACTION_PROVIDER", "groq")
    get_settings.cache_clear()
    save_reading(cache_dir, reading(plant="chamomile"))

    draft = client.post("/api/validation/runs", json={}).json()["metrics"]
    assert draft["dataset"]["labels"] == 0

    body = {
        "title": "Meadow Cup",
        "fields": {"plant": "chamomile"},
        "status": "final",
        "fields_checked": True,
    }
    assert client.put(url, json=body).status_code == 200
    metrics = client.post("/api/validation/runs", json={}).json()["metrics"]
    assert metrics["dataset"]["labels"] == 1
    assert metrics["fields"]["plant"]["correct"] == 1
    assert metrics["versions"]["model"] == get_settings().groq_model
    assert metrics["verdicts"]["end_to_end"]["total"] == 0
    unchecked = client.put(url, json={**body, "fields_checked": False})
    assert unchecked.json()["detail"] == "fields_check_required"


def test_field_outcomes_and_confidence_interval():
    assert field_outcome("4–7:1", " 4-7:1 ") == "correct"
    assert field_outcome(None, "X1") == "invented" and field_outcome("X1", None) == "missed"
    assert field_outcome(None, None) == "correct"
    assert wilson(0, 0) is None
    low, high = wilson(8, 10) or [0, 0]
    assert 0.49 < low < 0.5 and 0.94 < high < 0.95
