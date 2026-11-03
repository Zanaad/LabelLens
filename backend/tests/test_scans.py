import json
import uuid
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.extraction.providers import (
    PROMPT_VERSION,
    CachedProvider,
    ExtractionError,
    cache_key,
    get_extraction_provider,
)
from app.extraction.schema import FIELD_KEYS
from app.models import Correction, Role, Scan
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


def test_only_pharmacists_can_scan(client: TestClient, db: Session, setup):
    client.post("/api/auth/logout")
    make_user(db, "besim@example.org", Role.expert)
    login(client, "besim@example.org")
    assert client.post("/api/scans/text", json={"text": LABEL}).status_code == 403
