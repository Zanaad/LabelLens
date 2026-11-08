# Validation labels are the answer key, so only experts build them: photo or pasted text, the
# correct fields and the expected verdict. Admins, who run validation, can read them. Photos are
# stored exactly as the model sees them, so validation can find their saved reading.

import hashlib
import uuid
from datetime import UTC, datetime
from pathlib import PurePath

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.api.scans import upload_limit
from app.api.schemas import (
    AnnotationIn,
    AnnotationListItem,
    AnnotationOut,
    LabelTextIn,
)
from app.config import get_settings
from app.db import get_db
from app.extraction.providers import ExtractionError, ExtractionProvider, get_extraction_provider
from app.extraction.schema import FIELD_KEYS, FieldStatus
from app.models import Annotation, AnnotationStatus, Role, User
from app.services.audit import audit
from app.services.images import ImageError, clean_upload
from app.services.storage import Storage, get_storage

router = APIRouter(prefix="/api/annotations", tags=["annotations"])

expert_only = require_roles(Role.expert)
reader = require_roles(Role.expert, Role.admin)


def _out(db: Session, a: Annotation, prefilled: bool = False) -> AnnotationOut:
    annotator = db.get(User, a.annotator_id) if a.annotator_id else None
    checker = db.get(User, a.checked_by_id) if a.checked_by_id else None
    expert = db.get(User, a.expected_verdict_by_id) if a.expected_verdict_by_id else None
    return AnnotationOut(
        id=a.id,
        title=a.title,
        fields={k: a.fields_json.get(k) for k in FIELD_KEYS},
        expected_verdict=a.expected_verdict,
        status=a.status,
        notes=a.notes,
        label_text=a.label_text,
        has_image=a.label_ref is not None,
        updated_at=a.updated_at,
        annotator=annotator.full_name if annotator else None,
        fields_checked=a.checked_at is not None,
        checked_by=checker.full_name if checker else None,
        checked_at=a.checked_at,
        expected_by=expert.full_name if expert else None,
        expected_at=a.expected_verdict_at,
        prefilled=prefilled,
    )


def _get(db: Session, annotation_id: uuid.UUID) -> Annotation:
    a = db.get(Annotation, annotation_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    return a


def _create(
    db: Session,
    storage: Storage,
    provider: ExtractionProvider,
    expert: User,
    *,
    image: bytes | None,
    text: str | None,
    fallback_title: str,
) -> AnnotationOut:
    data = image if image is not None else (text or "").encode()
    sha = hashlib.sha256(data).hexdigest()
    if db.scalar(select(Annotation.id).where(Annotation.image_sha256 == sha)):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="duplicate_label")
    fields: dict[str, str | None] = dict.fromkeys(FIELD_KEYS)
    title, prefilled = "", False
    try:  # start from the label reader's answers; the annotator corrects them
        read = provider.extract(image=image, text=text).fields
        for k in FIELD_KEYS:
            f = getattr(read, k)
            fields[k] = f.value if f.status == FieldStatus.stated else None
        title, prefilled = read.product_name or "", True
    except ExtractionError:
        pass  # not readable now (e.g. demo mode): the annotator types the fields in
    a = Annotation(
        id=uuid.uuid4(),
        title=(title or fallback_title)[:200],
        label_text=text,
        image_sha256=sha,
        fields_json=fields,
        status=AnnotationStatus.draft,
        annotator_id=expert.id,
    )
    if image is not None:
        a.label_ref = storage.save(f"labels/{a.id}.jpg", image)
    db.add(a)
    audit(db, "annotation.create", user_id=expert.id, entity_type="annotation", entity_id=a.id)
    db.commit()
    return _out(db, a, prefilled)


@router.get("", response_model=list[AnnotationListItem])
def list_annotations(
    db: Session = Depends(get_db), _: User = Depends(reader)
) -> list[AnnotationListItem]:
    rows = db.scalars(select(Annotation).order_by(Annotation.updated_at.desc()))
    return [
        AnnotationListItem(
            id=a.id,
            title=a.title,
            status=a.status,
            expected_verdict=a.expected_verdict,
            has_image=a.label_ref is not None,
            updated_at=a.updated_at,
        )
        for a in rows
    ]


@router.post("/image", response_model=AnnotationOut, status_code=201, dependencies=[upload_limit])
def create_from_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    provider: ExtractionProvider = Depends(get_extraction_provider),
    expert: User = Depends(expert_only),
) -> AnnotationOut:
    max_bytes = get_settings().max_upload_mb * 1024 * 1024
    try:
        image = clean_upload(file.file.read(max_bytes + 1), max_bytes)
    except ImageError as e:
        raise HTTPException(413 if e.code == "file_too_large" else 415, detail=e.code) from None
    title = PurePath(file.filename or "").stem
    return _create(
        db, storage, provider, expert, image=image.model_data, text=None, fallback_title=title
    )


@router.post("/text", response_model=AnnotationOut, status_code=201, dependencies=[upload_limit])
def create_from_text(
    body: LabelTextIn,
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    provider: ExtractionProvider = Depends(get_extraction_provider),
    expert: User = Depends(expert_only),
) -> AnnotationOut:
    text = body.text.strip()
    return _create(
        db, storage, provider, expert, image=None, text=text, fallback_title=text.splitlines()[0]
    )


@router.get("/{annotation_id}", response_model=AnnotationOut)
def get_annotation(
    annotation_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(reader)
) -> AnnotationOut:
    return _out(db, _get(db, annotation_id))


@router.get("/{annotation_id}/image")
def annotation_image(
    annotation_id: uuid.UUID,
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    _: User = Depends(reader),
) -> Response:
    a = _get(db, annotation_id)
    if a.label_ref is None or not storage.exists(a.label_ref):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    return Response(
        storage.read(a.label_ref),
        media_type="image/jpeg",
        headers={"Cache-Control": "private, no-store"},
    )


@router.put("/{annotation_id}", response_model=AnnotationOut)
def update_annotation(
    annotation_id: uuid.UUID,
    body: AnnotationIn,
    db: Session = Depends(get_db),
    expert: User = Depends(expert_only),
) -> AnnotationOut:
    a = _get(db, annotation_id)
    if set(body.fields) - set(FIELD_KEYS):
        raise HTTPException(422, detail="unknown_field")
    if body.status == AnnotationStatus.final and not body.fields_checked:
        raise HTTPException(422, detail="fields_check_required")
    new_fields = {k: (body.fields.get(k) or "").strip()[:500] or None for k in FIELD_KEYS}
    fields_changed = new_fields != {k: a.fields_json.get(k) for k in FIELD_KEYS}
    was_checked_final = a.status == AnnotationStatus.final and a.checked_at is not None
    a.title = body.title.strip()
    a.fields_json = new_fields
    a.status = body.status
    a.notes = (body.notes or "").strip() or None
    a.annotator_id = expert.id
    if a.expected_verdict != body.expected_verdict:
        a.expected_verdict = body.expected_verdict
        a.expected_verdict_by_id = expert.id if body.expected_verdict else None
        a.expected_verdict_at = datetime.now(UTC) if body.expected_verdict else None
    if body.status != AnnotationStatus.final:
        a.checked_by_id = None
        a.checked_at = None
    elif fields_changed or not was_checked_final:
        a.checked_by_id = expert.id
        a.checked_at = datetime.now(UTC)
    audit(db, "annotation.update", user_id=expert.id, entity_type="annotation", entity_id=a.id)
    db.commit()
    return _out(db, a)


@router.delete("/{annotation_id}", status_code=204)
def delete_annotation(
    annotation_id: uuid.UUID,
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    expert: User = Depends(expert_only),
) -> Response:
    a = _get(db, annotation_id)
    if a.label_ref:
        storage.delete(a.label_ref)
    db.delete(a)
    audit(db, "annotation.delete", user_id=expert.id, entity_type="annotation", entity_id=a.id)
    db.commit()
    return Response(status_code=204)
