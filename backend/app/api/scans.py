import hashlib
import uuid
from pathlib import PurePath
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.api.schemas import FieldOut, FieldsUpdate, LabelTextIn, ScanOut
from app.config import get_settings
from app.db import get_db
from app.extraction.providers import (
    PROMPT_VERSION,
    ExtractionError,
    ExtractionProvider,
    get_extraction_provider,
)
from app.extraction.schema import FIELD_KEYS, FieldStatus
from app.models import Correction, Extraction, Role, Scan, ScanStatus, User
from app.services.audit import audit
from app.services.images import CleanImage, ImageError, clean_upload
from app.services.rate_limit import rate_limit
from app.services.storage import Storage, get_storage

router = APIRouter(prefix="/api/scans", tags=["scans"])

pharmacist_only = require_roles(Role.pharmacist)
upload_limit = Depends(rate_limit("upload", "upload_rate_limit_per_minute"))

EXTRACTION_ERROR_STATUS = {
    "not_in_cache": 422,
    "extraction_failed": 502,
    "provider_unavailable": 503,
    "provider_misconfigured": 503,
}


def _latest_extraction(db: Session, scan_id: uuid.UUID) -> Extraction | None:
    query = (
        select(Extraction)
        .where(Extraction.scan_id == scan_id)
        .order_by(Extraction.created_at.desc())
        .limit(1)
    )
    return db.scalar(query)


def _scan_out(scan: Scan, extraction: Extraction | None) -> ScanOut:
    fields_json: dict[str, Any] = extraction.fields_json if extraction else {}
    return ScanOut(
        id=scan.id,
        status=scan.status,
        created_at=scan.created_at,
        original_filename=scan.original_filename,
        has_image=scan.image_path is not None,
        label_text=scan.label_text,
        product_name=fields_json.get("product_name"),
        fields={k: FieldOut(**fields_json[k]) for k in FIELD_KEYS if k in fields_json},
    )


def _own_scan(db: Session, scan_id: uuid.UUID, user: User) -> Scan:
    scan = db.get(Scan, scan_id)
    # 404 rather than 403, so other users' scan ids are not confirmed.
    if scan is None or scan.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    return scan


def _create_scan(
    db: Session,
    storage: Storage,
    provider: ExtractionProvider,
    user: User,
    *,
    image: CleanImage | None = None,
    filename: str | None = None,
    text: str | None = None,
) -> ScanOut:
    try:
        result = provider.extract(image=image.model_data if image else None, text=text)
    except ExtractionError as e:
        raise HTTPException(EXTRACTION_ERROR_STATUS[e.code], detail=e.code) from None
    # Nothing is saved for an unreadable label (design: "nothing was extracted, nothing saved").
    if not result.fields.label_readable:
        raise HTTPException(422, detail="label_unreadable")

    scan = Scan(
        user_id=user.id,
        label_text=text,
        status=ScanStatus.extracted if result.fields.is_herbal_product else ScanStatus.out_of_scope,
    )
    if image:
        scan.id = uuid.uuid4()
        scan.image_path = storage.save(f"scans/{scan.id}.{image.extension}", image.data)
        scan.image_sha256 = hashlib.sha256(image.data).hexdigest()
        scan.original_filename = PurePath(filename or "").name[:255] or None
        scan.mime_type = image.media_type
        scan.size_bytes = len(image.data)
    db.add(scan)
    db.flush()
    extraction = Extraction(
        scan_id=scan.id,
        provider=result.provider,
        model=result.model,
        prompt_version=PROMPT_VERSION,
        cache_key=result.cache_key,
        raw_json=result.raw,
        fields_json=result.raw,
        latency_ms=result.latency_ms,
    )
    db.add(extraction)
    audit(db, "scan.create", user_id=user.id, entity_type="scan", entity_id=scan.id)
    db.commit()
    return _scan_out(scan, extraction)


@router.post("/image", response_model=ScanOut, status_code=201, dependencies=[upload_limit])
def scan_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    provider: ExtractionProvider = Depends(get_extraction_provider),
    user: User = Depends(pharmacist_only),
) -> ScanOut:
    max_bytes = get_settings().max_upload_mb * 1024 * 1024
    raw = file.file.read(max_bytes + 1)  # read one extra byte to detect oversize files
    try:
        image = clean_upload(raw, max_bytes)
    except ImageError as e:
        code = 413 if e.code == "file_too_large" else 415
        raise HTTPException(code, detail=e.code) from None
    return _create_scan(db, storage, provider, user, image=image, filename=file.filename)


@router.post("/text", response_model=ScanOut, status_code=201, dependencies=[upload_limit])
def scan_text(
    body: LabelTextIn,
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    provider: ExtractionProvider = Depends(get_extraction_provider),
    user: User = Depends(pharmacist_only),
) -> ScanOut:
    return _create_scan(db, storage, provider, user, text=body.text.strip())


@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(
    scan_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(pharmacist_only)
) -> ScanOut:
    scan = _own_scan(db, scan_id, user)
    return _scan_out(scan, _latest_extraction(db, scan.id))


@router.get("/{scan_id}/image")
def get_scan_image(
    scan_id: uuid.UUID,
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    user: User = Depends(pharmacist_only),
) -> Response:
    scan = _own_scan(db, scan_id, user)
    if scan.image_path is None or not storage.exists(scan.image_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    return Response(
        storage.read(scan.image_path),
        media_type=scan.mime_type,
        headers={"Cache-Control": "private, no-store"},
    )


@router.patch("/{scan_id}/fields", response_model=ScanOut)
def update_fields(
    scan_id: uuid.UUID,
    body: FieldsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(pharmacist_only),
) -> ScanOut:
    scan = _own_scan(db, scan_id, user)
    extraction = _latest_extraction(db, scan.id)
    if extraction is None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="no_extraction")
    unknown = set(body.fields) - set(FIELD_KEYS)
    if unknown:
        raise HTTPException(422, detail="unknown_field")

    fields = dict(extraction.fields_json)
    for key, new_value in body.fields.items():
        value = (new_value or "").strip()[:500] or None
        old = fields[key]
        if old.get("value") == value:
            continue
        status_ = FieldStatus.stated if value else FieldStatus.not_stated
        fields[key] = {**old, "value": value, "status": status_.value, "edited": True}
        db.add(
            Correction(
                extraction_id=extraction.id,
                user_id=user.id,
                field=key,
                old_value=old,
                new_value=fields[key],
            )
        )
    extraction.fields_json = fields  # reassign so SQLAlchemy detects the JSON change
    audit(db, "scan.correct", user_id=user.id, entity_type="scan", entity_id=scan.id)
    db.commit()
    return _scan_out(scan, extraction)


@router.delete("/{scan_id}", status_code=204)
def delete_scan(
    scan_id: uuid.UUID,
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    user: User = Depends(pharmacist_only),
) -> Response:
    scan = _own_scan(db, scan_id, user)
    if scan.image_path:
        storage.delete(scan.image_path)
    db.delete(scan)  # extractions, corrections and verdicts cascade in the database
    audit(db, "scan.delete", user_id=user.id, entity_type="scan", entity_id=scan_id)
    db.commit()
    return Response(status_code=204)
