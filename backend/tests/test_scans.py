import json
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from http.client import RemoteDisconnected
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import ReferenceFile
from app.cli import import_reference
from app.extraction.providers import (
    PROMPT_VERSION,
    CachedProvider,
    ExtractionError,
    GroqProvider,
    cache_key,
    get_extraction_provider,
)
from app.extraction.schema import FIELD_KEYS
from app.models import Correction, Role, Scan, ShareLink
from app.services.images import ImageError, clean_upload
from app.services.storage import LocalStorage, get_storage
from tests.conftest import login, make_user

MODEL = "test-model"
LABEL = "HYPERIA 300. St John's wort herb extract 300 mg per capsule. LOT HP2409-17"


def extraction(readable: bool = True, herbal: bool = True) -> dict:
    missing = {"value": None, "status": "not_stated", "confidence": 1.0, "evidence": None}
    fields = {k: dict(missing) for k in FIELD_KEYS}
    fields["plant"] = {
        "value": "St John's wort",
        "status": "stated",
        "confidence": 0.95,
        "evidence": "St John's wort herb extract",
    }
    return {
        "label_readable": readable,
        "is_herbal_product": herbal,
        "product_name": "HYPERIA 300",
        **fields,
    }


def cache(cache_dir: Path, data: bytes, output: dict) -> None:
    cache_dir.mkdir(exist_ok=True)
    record = {"model": MODEL, "prompt_version": PROMPT_VERSION, "output": output}
    (cache_dir / f"{cache_key(data, MODEL)}.json").write_text(json.dumps(record))


def jpeg(exif: bool = False, size: tuple[int, int] = (40, 20)) -> bytes:
    img = Image.new("RGB", size, "white")
    out = BytesIO()
    if exif:
        meta = Image.Exif()
        meta[0x0112] = 6  # orientation: rotate 90 degrees
        meta[0x8825] = {1: "N", 2: (52.0, 31.0, 0.0)}  # GPS latitude
        img.save(out, "JPEG", exif=meta)
    else:
        img.save(out, "JPEG")
    return out.getvalue()


@pytest.fixture
def setup(client: TestClient, db: Session, tmp_path: Path):
    cache_dir = tmp_path / "cache"
    storage = LocalStorage(tmp_path / "storage")
    client.app.dependency_overrides[get_extraction_provider] = lambda: CachedProvider(  # type: ignore[attr-defined]
        MODEL, cache_dir
    )
    client.app.dependency_overrides[get_storage] = lambda: storage  # type: ignore[attr-defined]
    make_user(db, "arta@example.org", Role.pharmacist)
    login(client, "arta@example.org")
    return cache_dir, storage


def test_clean_upload_strips_exif_and_applies_rotation():
    cleaned = clean_upload(jpeg(exif=True), max_bytes=10_000_000)
    with Image.open(BytesIO(cleaned.data)) as img:
        assert not img.getexif()  # no orientation, GPS or other metadata left
        assert img.size == (20, 40)  # rotated upright before EXIF was dropped
    assert cleaned.media_type == "image/jpeg"


def test_clean_upload_rejects_bad_input():
    with pytest.raises(ImageError, match="file_too_large"):
        clean_upload(jpeg(), max_bytes=10)
    with pytest.raises(ImageError, match="invalid_image"):
        clean_upload(b"not an image at all", max_bytes=10_000)
    gif = BytesIO()
    Image.new("RGB", (4, 4)).save(gif, "GIF")
    with pytest.raises(ImageError, match="unsupported_type"):
        clean_upload(gif.getvalue(), max_bytes=10_000)


def test_cached_provider_replays_and_reports_misses(tmp_path: Path):
    cache(tmp_path, LABEL.encode(), extraction())
    provider = CachedProvider(MODEL, tmp_path)
    result = provider.extract(image=None, text=LABEL)
    assert result.fields.plant.value == "St John's wort"
    with pytest.raises(ExtractionError, match="not_in_cache"):
        provider.extract(image=None, text="a label that was never cached")


def test_groq_reads_text_and_photo_with_strict_schema(tmp_path: Path, monkeypatch):
    from app.extraction import providers

    calls = []
    output = extraction()

    def reply(request, timeout):
        calls.append((request, timeout))
        return BytesIO(
            json.dumps({"choices": [{"message": {"content": json.dumps(output)}}]}).encode()
        )

    monkeypatch.setattr(providers, "urlopen", reply)
    provider = GroqProvider("qwen/qwen3.8-27b", secrets.token_urlsafe(24), tmp_path)
    text_result = provider.extract(image=None, text=LABEL)
    photo_result = provider.extract(image=b"photo bytes", text=None)
    assert text_result.fields.plant.value == "St John's wort"
    assert text_result.provider == photo_result.provider == "groq"
    assert (tmp_path / f"{text_result.cache_key}.json").is_file()
    text_body = json.loads(calls[0][0].data)
    image_body = json.loads(calls[1][0].data)
    assert text_body["response_format"]["json_schema"]["strict"] is True
    assert text_body["response_format"]["json_schema"]["schema"]["required"] == list(output)
    assert text_body["messages"][0]["content"][1]["text"].startswith("<label_text>")
    assert image_body["messages"][0]["content"][1]["image_url"]["url"].startswith(
        "data:image/jpeg;base64,"
    )
    assert all(timeout == 120 for _, timeout in calls)


def test_groq_reuses_successful_reading(tmp_path: Path, monkeypatch):
    from app.extraction import providers

    image = jpeg()
    model = MODEL
    cache(tmp_path, image, extraction())
    monkeypatch.setattr(providers, "urlopen", lambda *_args, **_kwargs: pytest.fail("API called"))
    result = GroqProvider(model, secrets.token_urlsafe(24), tmp_path).extract(
        image=image, text=None
    )
    assert result.fields.plant.value == "St John's wort"
    assert result.latency_ms is None


def test_groq_reports_missing_key_quota_and_bad_output(tmp_path: Path, monkeypatch):
    from app.extraction import providers

    with pytest.raises(ExtractionError, match="provider_misconfigured"):
        GroqProvider("qwen/qwen3.8-27b", "", tmp_path).extract(image=None, text=LABEL)

    calls = []

    def rejected(request, timeout):
        calls.append(request)
        raise HTTPError(request.full_url, 429, "quota", {}, None)

    monkeypatch.setattr(providers, "urlopen", rejected)
    monkeypatch.setattr(providers.time, "sleep", lambda seconds: None)
    provider = GroqProvider("qwen/qwen3.8-27b", secrets.token_urlsafe(24), tmp_path)
    with pytest.raises(ExtractionError, match="provider_unavailable"):
        provider.extract(image=None, text=LABEL)
    assert len(calls) == 2  # one retry after the wait
    monkeypatch.setattr(providers, "urlopen", lambda request, timeout: BytesIO(b"{}"))
    with pytest.raises(ExtractionError, match="extraction_failed"):
        provider.extract(image=None, text=LABEL)


def test_groq_retries_schema_failure_with_json_object(tmp_path: Path, monkeypatch):
    from app.extraction import providers

    calls = []

    def reply(request, timeout):
        calls.append(json.loads(request.data))
        if len(calls) == 1:
            raise HTTPError(
                request.full_url,
                400,
                "bad output",
                {},
                BytesIO(b'{"error":{"code":"json_validate_failed"}}'),
            )
        return BytesIO(
            json.dumps({"choices": [{"message": {"content": json.dumps(extraction())}}]}).encode()
        )

    monkeypatch.setattr(providers, "urlopen", reply)
    result = GroqProvider("qwen/qwen3.8-27b", secrets.token_urlsafe(24), tmp_path).extract(
        image=jpeg(), text=None
    )
    assert result.fields.plant.value == "St John's wort"
    assert calls[0]["response_format"]["type"] == "json_schema"
    assert calls[1]["response_format"]["type"] == "json_object"


def test_groq_retries_disconnect_then_reports_unavailable(tmp_path: Path, monkeypatch):
    from app.extraction import providers

    calls = []

    def disconnected(request, timeout):
        calls.append(request)
        raise RemoteDisconnected("connection closed")

    monkeypatch.setattr(providers, "urlopen", disconnected)
    with pytest.raises(ExtractionError, match="provider_unavailable"):
        GroqProvider("qwen/qwen3.8-27b", secrets.token_urlsafe(24), tmp_path).extract(
            image=jpeg(), text=None
        )
    assert len(calls) == 2
    assert all(json.loads(call.data)["response_format"]["type"] == "json_schema" for call in calls)


def test_groq_drops_a_bad_field_but_keeps_the_reading(tmp_path: Path, monkeypatch):
    from app.extraction import providers

    output = extraction()
    output["plant"] = {"value": "none", "status": "stated", "confidence": 0.9, "evidence": "none"}
    output["solvent"] = {"value": None, "status": "unreadable", "confidence": 0.5, "evidence": "x"}
    output["plant_part"] = {
        "value": "herb",
        "status": "stated",
        "confidence": 0.9,
        "evidence": "herb extract",
    }
    output["dose"] = {  # read from the label but given the wrong status
        "value": "300 mg",
        "status": "not_stated",
        "confidence": 0.9,
        "evidence": "300 mg per capsule",
    }
    calls = []

    def reply(request, timeout):
        calls.append(request)
        return BytesIO(
            json.dumps({"choices": [{"message": {"content": json.dumps(output)}}]}).encode()
        )

    monkeypatch.setattr(providers, "urlopen", reply)
    fields = (
        GroqProvider("qwen/qwen3.8-27b", secrets.token_urlsafe(24), tmp_path)
        .extract(image=None, text=LABEL)
        .fields
    )
    assert len(calls) == 1
    assert fields.plant.status == "unreadable" and fields.plant.value is None  # placeholder dropped
    assert fields.solvent.status == "unreadable" and fields.solvent.evidence is None
    assert fields.plant_part.value == "herb"  # the good fields are kept
    assert fields.dose.status == "stated" and fields.dose.value == "300 mg"


def test_text_scan_flow_with_corrections(client: TestClient, db: Session, setup):
    cache_dir, _ = setup
    cache(cache_dir, LABEL.encode(), extraction())
    r = client.post("/api/scans/text", json={"text": LABEL})
    assert r.status_code == 201, r.text
    scan = r.json()
    assert scan["status"] == "extracted"
    assert scan["fields"]["extract_ratio"]["status"] == "not_stated"

    r = client.patch(f"/api/scans/{scan['id']}/fields", json={"fields": {"extract_ratio": "4-7:1"}})
    ratio = r.json()["fields"]["extract_ratio"]
    assert ratio["value"] == "4-7:1" and ratio["status"] == "stated" and ratio["edited"]
    assert db.scalars(select(Correction)).one().field == "extract_ratio"
    r = client.patch(f"/api/scans/{scan['id']}/fields", json={"fields": {"price": "1"}})
    assert r.status_code == 422


def test_unreadable_label_saves_nothing_and_non_herbal_is_out_of_scope(
    client: TestClient, db: Session, setup
):
    cache_dir, _ = setup
    cache(cache_dir, LABEL.encode(), extraction(readable=False))
    r = client.post("/api/scans/text", json={"text": LABEL})
    assert r.status_code == 422 and r.json()["detail"] == "label_unreadable"
    assert db.scalars(select(Scan)).all() == []

    other = "Ibuprofen 400 mg film-coated tablets"
    cache(cache_dir, other.encode(), extraction(herbal=False))
    assert client.post("/api/scans/text", json={"text": other}).json()["status"] == "out_of_scope"


def test_image_scan_is_owner_only_and_delete_removes_image(client: TestClient, db: Session, setup):
    cache_dir, storage = setup
    raw = jpeg(exif=True)
    cache(cache_dir, clean_upload(raw, 10_000_000).model_data, extraction())
    r = client.post("/api/scans/image", files={"file": ("../IMG_2041.jpg", raw, "image/jpeg")})
    assert r.status_code == 201, r.text
    scan = r.json()
    assert scan["has_image"] and scan["original_filename"] == "IMG_2041.jpg"
    image_path = db.get(Scan, uuid.UUID(scan["id"])).image_path  # type: ignore[union-attr]
    assert storage.exists(image_path)
    assert client.get(f"/api/scans/{scan['id']}/image").status_code == 200

    client.post("/api/auth/logout")
    make_user(db, "other@example.org", Role.pharmacist)
    login(client, "other@example.org")
    assert client.get(f"/api/scans/{scan['id']}").status_code == 404
    assert client.delete(f"/api/scans/{scan['id']}").status_code == 404

    client.post("/api/auth/logout")
    login(client, "arta@example.org")
    assert client.delete(f"/api/scans/{scan['id']}").status_code == 204
    assert not storage.exists(image_path)
    assert client.get(f"/api/scans/{scan['id']}").status_code == 404


def test_verdict_is_stored_owner_only_and_needs_a_herbal_product(
    client: TestClient, db: Session, setup
):
    cache_dir, _ = setup
    sample = Path(__file__).parents[2] / "data" / "reference" / "sample.json"
    import_reference(db, ReferenceFile.model_validate_json(sample.read_bytes()))
    cache(cache_dir, LABEL.encode(), extraction())
    scan = client.post("/api/scans/text", json={"text": LABEL}).json()
    assert client.get(f"/api/scans/{scan['id']}/verdict").status_code == 404

    r = client.post(f"/api/scans/{scan['id']}/verdict")
    assert r.status_code == 201, r.text
    verdict = r.json()
    assert verdict["verdict"] == "cannot_say"
    assert verdict["plant_latin"] == ["Hypericum perforatum L."]
    assert len(verdict["comparisons"]) == 3 and verdict["sources"][0]["verified"] is False
    assert client.get(f"/api/scans/{scan['id']}/verdict").json()["id"] == verdict["id"]
    assert client.get(f"/api/scans/{scan['id']}").json()["status"] == "checked"

    other = "Ibuprofen 400 mg film-coated tablets"
    cache(cache_dir, other.encode(), extraction(herbal=False))
    out = client.post("/api/scans/text", json={"text": other}).json()
    assert client.post(f"/api/scans/{out['id']}/verdict").status_code == 409

    client.post("/api/auth/logout")
    make_user(db, "other@example.org", Role.pharmacist)
    login(client, "other@example.org")
    assert client.post(f"/api/scans/{scan['id']}/verdict").status_code == 404


def test_recheck_uses_current_references_and_keeps_earlier_result(
    client: TestClient, db: Session, setup
):
    cache_dir, _ = setup
    cache(cache_dir, LABEL.encode(), extraction())
    scan = client.post("/api/scans/text", json={"text": LABEL}).json()
    first = client.post(f"/api/scans/{scan['id']}/verdict").json()
    assert first["verdict"] == "not_covered"

    sample = Path(__file__).parents[2] / "data" / "reference" / "sample.json"
    import_reference(db, ReferenceFile.model_validate_json(sample.read_bytes()))
    second = client.post(f"/api/scans/{scan['id']}/verdict").json()
    assert second["id"] != first["id"]
    assert second["verdict"] == "cannot_say"
    assert client.get(f"/api/scans/{scan['id']}/verdict").json()["id"] == second["id"]
    history = client.get(f"/api/scans/{scan['id']}/verdicts").json()
    assert {item["id"] for item in history} == {first["id"], second["id"]}

    client.post("/api/auth/logout")
    make_user(db, "other@example.org", Role.pharmacist)
    login(client, "other@example.org")
    assert client.get(f"/api/scans/{scan['id']}/verdicts").status_code == 404


def checked_scan(client: TestClient, db: Session, cache_dir: Path) -> dict:
    sample = Path(__file__).parents[2] / "data" / "reference" / "sample.json"
    import_reference(db, ReferenceFile.model_validate_json(sample.read_bytes()))
    cache(cache_dir, LABEL.encode(), extraction())
    scan = client.post("/api/scans/text", json={"text": LABEL}).json()
    client.patch(f"/api/scans/{scan['id']}/fields", json={"fields": {"batch": "X1"}})
    return scan


def test_patient_link_lifecycle(client: TestClient, db: Session, setup):
    cache_dir, _ = setup
    scan = checked_scan(client, db, cache_dir)
    shares = f"/api/scans/{scan['id']}/shares"
    assert client.post(shares, json={"days": 7}).status_code == 409  # not checked yet
    client.post(f"/api/scans/{scan['id']}/verdict")
    assert client.post(shares, json={"days": 3}).status_code == 422  # only 1, 7 or 30 days
    link = client.post(shares, json={"days": 7}).json()
    stored = db.get(ShareLink, uuid.UUID(link["id"]))
    assert stored is not None and stored.token_hash != link["token"]  # only the hash is kept

    client.post("/api/auth/logout")  # patients have no account
    view = client.post("/api/shared", json={"token": link["token"]})
    assert view.status_code == 200, view.text
    assert view.json()["verdict"] == "cannot_say" and view.json()["shared_by"] == "Arta"
    assert "fields" not in view.json()

    make_user(db, "other@example.org", Role.pharmacist)
    login(client, "other@example.org")
    assert client.delete(f"{shares}/{link['id']}").status_code == 404
    client.post("/api/auth/logout")
    login(client, "arta@example.org")
    assert client.delete(f"{shares}/{link['id']}").status_code == 204
    assert client.post("/api/shared", json={"token": link["token"]}).status_code == 404

    expired = client.post(shares, json={"days": 1}).json()
    db.expire_all()
    old = db.get(ShareLink, uuid.UUID(expired["id"]))
    assert old is not None
    old.expires_at = datetime.now(UTC) - timedelta(hours=1)
    db.commit()
    assert client.post("/api/shared", json={"token": expired["token"]}).status_code == 404


def test_scan_list_and_history_are_owner_only(client: TestClient, db: Session, setup):
    cache_dir, _ = setup
    scan = checked_scan(client, db, cache_dir)
    client.post(f"/api/scans/{scan['id']}/verdict")
    [row] = client.get("/api/scans").json()
    assert row["verdict"] == "cannot_say" and row["plant"] == "St John's wort"
    assert row["missing"] > 0
    history = client.get(f"/api/scans/{scan['id']}/history").json()
    assert history["corrections"][0]["new"] == "X1" and history["corrections"][0]["by"] == "Arta"
    actions = [a["action"] for a in history["activity"]]
    assert actions == ["scan.create", "scan.correct", "scan.check"]

    client.post("/api/auth/logout")
    make_user(db, "other@example.org", Role.pharmacist)
    login(client, "other@example.org")
    assert client.get("/api/scans").json() == []
    assert client.get(f"/api/scans/{scan['id']}/history").status_code == 404


def test_only_pharmacists_can_scan(client: TestClient, db: Session, setup):
    client.post("/api/auth/logout")
    make_user(db, "besim@example.org", Role.expert)
    login(client, "besim@example.org")
    assert client.post("/api/scans/text", json={"text": LABEL}).status_code == 403


def test_revoke_all_links_and_delete_history_touch_only_own_data(
    client: TestClient, db: Session, setup
):
    cache_dir, storage = setup
    scan = checked_scan(client, db, cache_dir)
    client.post(f"/api/scans/{scan['id']}/verdict")
    link = client.post(f"/api/scans/{scan['id']}/shares", json={"days": 7}).json()
    raw = jpeg()
    cache(cache_dir, clean_upload(raw, 10_000_000).model_data, extraction())
    photo = client.post("/api/scans/image", files={"file": ("a.jpg", raw, "image/jpeg")}).json()
    image_path = db.get(Scan, uuid.UUID(photo["id"])).image_path  # type: ignore[union-attr]

    client.post("/api/auth/logout")
    make_user(db, "other@example.org", Role.pharmacist)
    login(client, "other@example.org")
    assert client.post("/api/shares/revoke-all").json() == {"revoked": 0}
    assert client.delete("/api/scans").status_code == 204
    assert client.post("/api/shared", json={"token": link["token"]}).status_code == 200
    assert storage.exists(image_path)

    client.post("/api/auth/logout")
    login(client, "arta@example.org")
    assert client.post("/api/shares/revoke-all").json() == {"revoked": 1}
    assert client.post("/api/shared", json={"token": link["token"]}).status_code == 404
    assert client.delete("/api/scans").status_code == 204
    assert client.get("/api/scans").json() == []
    assert not storage.exists(image_path)
