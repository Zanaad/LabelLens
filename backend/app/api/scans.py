import dataclasses
import hashlib
import uuid
from pathlib import PurePath
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.api.schemas import (
    ActivityOut,
    CorrectionOut,
    FieldOut,
    FieldsUpdate,
    LabelTextIn,
    ReviewOpinion,
    ScanHistory,
    ScanListItem,
    ScanOut,
    ShareOut,
    VerdictOut,
)
from app.config import get_settings
from app.db import get_db
from app.extraction.providers import (
    PROMPT_VERSION,
    ExtractionError,
    ExtractionProvider,
    get_extraction_provider,
)
from app.extraction.schema import FIELD_KEYS, FieldStatus
from app.models import (
    AuditLog,
    Correction,
    ExpertRating,
    Extraction,
    PlantName,
    Rating,
    ReferencePreparation,
    Role,
    Scan,
    ScanStatus,
    ShareLink,
    User,
    Verdict,
    VerdictCode,
)
from app.rules import engine
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


def own_scan(db: Session, scan_id: uuid.UUID, user: User) -> Scan:
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
    scan = own_scan(db, scan_id, user)
    return _scan_out(scan, _latest_extraction(db, scan.id))


@router.get("/{scan_id}/image")
def get_scan_image(
    scan_id: uuid.UUID,
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    user: User = Depends(pharmacist_only),
) -> Response:
    scan = own_scan(db, scan_id, user)
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
    scan = own_scan(db, scan_id, user)
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


REFERENCE_FIELDS = [f.name for f in dataclasses.fields(engine.Reference) if f.name != "id"]


def _opinions(db: Session, verdict_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[ReviewOpinion]]:
    """Reviewer ratings per verdict, in one query and without who gave them."""
    out: dict[uuid.UUID, list[ReviewOpinion]] = {}
    if verdict_ids:
        rows = select(ExpertRating).where(ExpertRating.verdict_id.in_(verdict_ids))
        for r in db.scalars(rows.order_by(ExpertRating.created_at)):
            out.setdefault(r.verdict_id, []).append(
                ReviewOpinion.model_validate(r, from_attributes=True)
            )
    return out


# A disagreement matters most to the pharmacist, then uncertainty.
REVIEW_PRIORITY = (Rating.disagree, Rating.unsure, Rating.agree)


def verdict_out(v: Verdict, reviews: list[ReviewOpinion] | None = None) -> VerdictOut:
    return VerdictOut(
        reviews=reviews or [],
        id=v.id,
        created_at=v.created_at,
        rules_version=v.rules_version,
        verdict=v.verdict,
        plant_latin=v.reasoning_json["plant_latin"],
        reasons=v.reasoning_json["reasons"],
        comparisons=v.comparison_json["comparisons"],
        missing=v.missing_json["items"],
        sources=v.sources_json["sources"],
    )


@router.post("/{scan_id}/verdict", response_model=VerdictOut, status_code=201)
def check_scan(
    scan_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(pharmacist_only)
) -> VerdictOut:
    scan = own_scan(db, scan_id, user)
    extraction = _latest_extraction(db, scan.id)
    if extraction is None or scan.status == ScanStatus.out_of_scope:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="not_checkable")

    # Only values printed on the label (or added by the pharmacist) take part.
    stated = {
        k: f.get("value") if f.get("status") == FieldStatus.stated else None
        for k in FIELD_KEYS
        if (f := extraction.fields_json.get(k))
    }
    names = [(n, latin) for n, latin in db.execute(select(PlantName.name, PlantName.latin_name))]
    latin = engine.resolve_plant(stated.get("plant") or "", names)
    query = select(ReferencePreparation).where(
        func.lower(ReferencePreparation.herb_latin).in_([n.lower() for n in latin])
    )
    rows: list[ReferencePreparation] = list(db.scalars(query)) if latin else []
    refs = [
        engine.Reference(id=str(r.id), **{k: getattr(r, k) for k in REFERENCE_FIELDS}) for r in rows
    ]
    result = engine.evaluate(stated, refs, names).to_json()

    verdict = Verdict(
        scan_id=scan.id,
        extraction_id=extraction.id,
        rules_version=result["rules_version"],
        verdict=VerdictCode(result["verdict"]),
        reasoning_json={"reasons": result["reasons"], "plant_latin": result["plant_latin"]},
        comparison_json={"comparisons": result["comparisons"]},
        missing_json={"items": result["missing"]},
        sources_json={"sources": result["sources"]},
    )
    db.add(verdict)
    scan.status = ScanStatus.checked
    audit(
        db,
        "scan.check",
        user_id=user.id,
        entity_type="scan",
        entity_id=scan.id,
        details={"verdict": verdict.verdict.value},
    )
    db.commit()
    return verdict_out(verdict)


def latest_verdict(db: Session, scan_id: uuid.UUID) -> Verdict | None:
    query = (
        select(Verdict)
        .where(Verdict.scan_id == scan_id)
        .order_by(Verdict.created_at.desc())
        .limit(1)
    )
    return db.scalar(query)


@router.get("/{scan_id}/verdict", response_model=VerdictOut)
def get_verdict(
    scan_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(pharmacist_only)
) -> VerdictOut:
    verdict = latest_verdict(db, own_scan(db, scan_id, user).id)
    if verdict is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="no_verdict")
    return verdict_out(verdict, _opinions(db, [verdict.id]).get(verdict.id))


@router.get("/{scan_id}/verdicts", response_model=list[VerdictOut])
def list_verdicts(
    scan_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(pharmacist_only)
) -> list[VerdictOut]:
    scan = own_scan(db, scan_id, user)
    verdicts = db.scalars(
        select(Verdict)
        .where(Verdict.scan_id == scan.id)
        .order_by(Verdict.created_at.desc(), Verdict.id.desc())
    ).all()
    opinions = _opinions(db, [v.id for v in verdicts])
    return [verdict_out(v, opinions.get(v.id)) for v in verdicts]


def _missing_count(missing_json: dict[str, Any]) -> int:
    # "Ask for the leaflet" is a follow-up, not a missing label detail.
    return sum(1 for item in missing_json["items"] if item["code"] != "leaflet")


@router.get("", response_model=list[ScanListItem])
def list_scans(
    db: Session = Depends(get_db), user: User = Depends(pharmacist_only)
) -> list[ScanListItem]:
    query = select(Scan).where(Scan.user_id == user.id).order_by(Scan.created_at.desc())
    scans = db.scalars(query.limit(1000)).all()
    ids = [s.id for s in scans]
    # One query each for the latest fields and verdicts (ordered, so the newest wins).
    fields: dict[uuid.UUID, dict[str, Any]] = {}
    verdicts: dict[uuid.UUID, tuple[uuid.UUID, VerdictCode, dict[str, Any]]] = {}
    reviews: dict[uuid.UUID, list[ReviewOpinion]] = {}
    if ids:
        extraction_rows = select(Extraction.scan_id, Extraction.fields_json).where(
            Extraction.scan_id.in_(ids)
        )
        for scan_id, fields_json in db.execute(extraction_rows.order_by(Extraction.created_at)):
            fields[scan_id] = fields_json
        verdict_rows = select(
            Verdict.scan_id, Verdict.id, Verdict.verdict, Verdict.missing_json
        ).where(Verdict.scan_id.in_(ids))
        for scan_id, vid, code, missing in db.execute(verdict_rows.order_by(Verdict.created_at)):
            verdicts[scan_id] = (vid, code, missing)
        reviews = _opinions(db, [v[0] for v in verdicts.values()])
    items = []
    for s in scans:
        f = fields.get(s.id, {})
        v = verdicts.get(s.id)
        given = {o.rating for o in reviews.get(v[0], [])} if v else set()
        items.append(
            ScanListItem(
                id=s.id,
                created_at=s.created_at,
                status=s.status,
                product_name=f.get("product_name"),
                plant=(f.get("plant") or {}).get("value"),
                verdict=v[1] if v else None,
                missing=_missing_count(v[2]) if v else None,
                review=next((r for r in REVIEW_PRIORITY if r in given), None),
            )
        )
    return items


@router.get("/{scan_id}/history", response_model=ScanHistory)
def scan_history(
    scan_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(pharmacist_only)
) -> ScanHistory:
    scan = own_scan(db, scan_id, user)
    corrections = db.execute(
        select(Correction, User.full_name)
        .join(Extraction, Correction.extraction_id == Extraction.id)
        .outerjoin(User, Correction.user_id == User.id)
        .where(Extraction.scan_id == scan.id)
        .order_by(Correction.created_at)
    ).all()
    activity = db.execute(
        select(AuditLog, User.full_name)
        .outerjoin(User, AuditLog.user_id == User.id)
        .where(AuditLog.entity_type == "scan", AuditLog.entity_id == str(scan.id))
        .order_by(AuditLog.created_at)
    ).all()
    shares = db.scalars(
        select(ShareLink)
        .join(Verdict, ShareLink.verdict_id == Verdict.id)
        .where(Verdict.scan_id == scan.id)
        .order_by(ShareLink.created_at.desc())
    ).all()
    return ScanHistory(
        corrections=[
            CorrectionOut(
                field=c.field,
                old=(c.old_value or {}).get("value"),
                new=(c.new_value or {}).get("value"),
                by=name,
                at=c.created_at,
            )
            for c, name in corrections
        ],
        activity=[
            # Expert reviews stay anonymous for the pharmacist.
            ActivityOut(
                action=a.action,
                by=None if a.action == "scan.review" else name,
                at=a.created_at,
                details=a.details_json,
            )
            for a, name in activity
        ],
        shares=[ShareOut.model_validate(s) for s in shares],
    )


@router.delete("", status_code=204)
def delete_all_scans(
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    user: User = Depends(pharmacist_only),
) -> Response:
    scans = db.scalars(select(Scan).where(Scan.user_id == user.id)).all()
    for scan in scans:
        if scan.image_path:
            storage.delete(scan.image_path)
        db.delete(scan)  # extractions, corrections, verdicts and links cascade in the database
    audit(db, "scan.delete_all", user_id=user.id, details={"count": len(scans)})
    db.commit()
    return Response(status_code=204)


@router.delete("/{scan_id}", status_code=204)
def delete_scan(
    scan_id: uuid.UUID,
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    user: User = Depends(pharmacist_only),
) -> Response:
    scan = own_scan(db, scan_id, user)
    if scan.image_path:
        storage.delete(scan.image_path)
    db.delete(scan)  # extractions, corrections and verdicts cascade in the database
    audit(db, "scan.delete", user_id=user.id, entity_type="scan", entity_id=scan_id)
    db.commit()
    return Response(status_code=204)
