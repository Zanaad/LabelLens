# Expert review queue: results a pharmacist asked about, plus a stable random sample of the rest,
# so experts are not sent every scan. Reviewers never see who scanned the product (onboarding
# promises pharmacists this).

import hashlib
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.api.scans import verdict_out
from app.api.schemas import FieldOut, RatingIn, RatingOut, ReviewDetail, ReviewItem
from app.config import get_settings
from app.db import get_db
from app.extraction.schema import FIELD_KEYS
from app.models import ExpertRating, Extraction, Role, Scan, User, Verdict
from app.services.audit import audit
from app.services.storage import Storage, get_storage

router = APIRouter(prefix="/api/reviews", tags=["reviews"])

reviewer = require_roles(Role.expert)  # admins run the system; only experts judge verdicts


def _verdict(db: Session, verdict_id: uuid.UUID) -> Verdict:
    verdict = db.get(Verdict, verdict_id)
    if verdict is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    return verdict


def in_sample(verdict_id: uuid.UUID, percent: int) -> bool:
    """Same answer every time for a verdict, so the sample does not change between visits."""
    return int(hashlib.sha256(verdict_id.bytes).hexdigest()[:8], 16) % 100 < percent


def _my_rating(db: Session, verdict_id: uuid.UUID, user: User) -> ExpertRating | None:
    query = select(ExpertRating).where(
        ExpertRating.verdict_id == verdict_id, ExpertRating.reviewer_id == user.id
    )
    return db.scalar(query)


@router.get("", response_model=list[ReviewItem])
def review_queue(db: Session = Depends(get_db), user: User = Depends(reviewer)) -> list[ReviewItem]:
    latest = (
        select(Verdict.scan_id, func.max(Verdict.created_at).label("at"))
        .group_by(Verdict.scan_id)
        .subquery()
    )
    counts = (
        select(ExpertRating.verdict_id, func.count().label("n"))
        .group_by(ExpertRating.verdict_id)
        .subquery()
    )
    mine = select(ExpertRating).where(ExpertRating.reviewer_id == user.id).subquery()
    rows = db.execute(
        select(Verdict, Extraction.fields_json, mine.c.rating, counts.c.n)
        .join(latest, and_(Verdict.scan_id == latest.c.scan_id, Verdict.created_at == latest.c.at))
        .outerjoin(Extraction, Verdict.extraction_id == Extraction.id)
        .outerjoin(mine, mine.c.verdict_id == Verdict.id)
        .outerjoin(counts, counts.c.verdict_id == Verdict.id)
        # Results a pharmacist asked about, not yet rated by this expert, come first.
        .order_by(
            case(
                (and_(Verdict.review_requested_at.is_not(None), mine.c.rating.is_(None)), 0),
                else_=1,
            ),
            Verdict.created_at.desc(),
        )
        .limit(500)
    ).all()
    percent = get_settings().review_sample_percent
    return [
        ReviewItem(
            verdict_id=v.id,
            scan_id=v.scan_id,
            product_name=(fields or {}).get("product_name"),
            plant=((fields or {}).get("plant") or {}).get("value"),
            verdict=v.verdict,
            checked_at=v.created_at,
            my_rating=rating,
            ratings=n or 0,
            requested=v.review_requested_at is not None,
        )
        for v, fields, rating, n in rows
        # Asked about, already rated by this expert, or in the random sample.
        if v.review_requested_at or rating or in_sample(v.id, percent)
    ]


@router.get("/{verdict_id}", response_model=ReviewDetail)
def review_detail(
    verdict_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(reviewer)
) -> ReviewDetail:
    verdict = _verdict(db, verdict_id)
    scan = db.get(Scan, verdict.scan_id)
    extraction = db.get(Extraction, verdict.extraction_id) if verdict.extraction_id else None
    fields = extraction.fields_json if extraction else {}
    rating = _my_rating(db, verdict.id, user)
    return ReviewDetail(
        verdict=verdict_out(verdict),
        product_name=fields.get("product_name"),
        label_text=scan.label_text if scan else None,
        has_image=bool(scan and scan.image_path),
        fields={k: FieldOut(**fields[k]) for k in FIELD_KEYS if k in fields},
        my_rating=RatingOut.model_validate(rating) if rating else None,
    )


@router.get("/{verdict_id}/image")
def review_image(
    verdict_id: uuid.UUID,
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    _: User = Depends(reviewer),
) -> Response:
    scan = db.get(Scan, _verdict(db, verdict_id).scan_id)
    if scan is None or scan.image_path is None or not storage.exists(scan.image_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    return Response(
        storage.read(scan.image_path),
        media_type=scan.mime_type,
        headers={"Cache-Control": "private, no-store"},
    )


@router.put("/{verdict_id}", response_model=RatingOut)
def rate_verdict(
    verdict_id: uuid.UUID,
    body: RatingIn,
    db: Session = Depends(get_db),
    user: User = Depends(reviewer),
) -> ExpertRating:
    verdict = _verdict(db, verdict_id)
    if body.correct_verdict == verdict.verdict:
        raise HTTPException(422, detail="correct_verdict_same")
    rating = _my_rating(db, verdict.id, user)
    if rating is None:
        rating = ExpertRating(verdict_id=verdict.id, reviewer_id=user.id)
        db.add(rating)
    rating.rating = body.rating
    rating.correct_verdict = body.correct_verdict
    rating.reason = (body.reason or "").strip() or None
    # Logged on the scan, so the pharmacist's activity log shows the review.
    audit(
        db,
        "scan.review",
        user_id=user.id,
        entity_type="scan",
        entity_id=verdict.scan_id,
        details={"rating": body.rating.value},
    )
    db.commit()
    return rating
