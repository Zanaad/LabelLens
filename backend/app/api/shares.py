# Patient share links: a read-only, expiring view of one verdict. The pharmacist shares
# /p#<token>; the fragment keeps the token out of server logs, and only its SHA-256 is stored.

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.scans import latest_verdict, own_scan, pharmacist_only
from app.api.schemas import ShareCreate, ShareCreated, SharedTokenIn, SharedView, ShareOut
from app.db import get_db
from app.models import Extraction, Scan, ShareLink, User, Verdict
from app.services.audit import audit
from app.services.rate_limit import rate_limit
from app.services.security import hash_token, new_opaque_token

router = APIRouter(tags=["shares"])

shared_limit = Depends(rate_limit("shared", "auth_rate_limit_per_minute"))


@router.post("/api/scans/{scan_id}/shares", response_model=ShareCreated, status_code=201)
def create_share(
    scan_id: uuid.UUID,
    body: ShareCreate,
    db: Session = Depends(get_db),
    user: User = Depends(pharmacist_only),
) -> ShareCreated:
    scan = own_scan(db, scan_id, user)
    verdict = latest_verdict(db, scan.id)
    if verdict is None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="not_checked")
    token, token_hash = new_opaque_token()
    link = ShareLink(
        verdict_id=verdict.id,
        created_by_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.now(UTC) + timedelta(days=body.days),
    )
    db.add(link)
    db.flush()
    audit(
        db,
        "scan.share",
        user_id=user.id,
        entity_type="scan",
        entity_id=scan.id,
        details={"days": body.days},
    )
    db.commit()
    return ShareCreated(**ShareOut.model_validate(link).model_dump(), token=token)


@router.delete("/api/scans/{scan_id}/shares/{share_id}", status_code=204)
def revoke_share(
    scan_id: uuid.UUID,
    share_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(pharmacist_only),
) -> Response:
    scan = own_scan(db, scan_id, user)
    link = db.scalar(
        select(ShareLink)
        .join(Verdict, ShareLink.verdict_id == Verdict.id)
        .where(ShareLink.id == share_id, Verdict.scan_id == scan.id)
    )
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    if link.revoked_at is None:
        link.revoked_at = datetime.now(UTC)
        audit(db, "scan.share_revoke", user_id=user.id, entity_type="scan", entity_id=scan.id)
        db.commit()
    return Response(status_code=204)


@router.post("/api/shared", response_model=SharedView, dependencies=[shared_limit])
def view_shared(body: SharedTokenIn, db: Session = Depends(get_db)) -> SharedView:
    row = db.execute(
        select(ShareLink, Verdict, User)
        .join(Verdict, ShareLink.verdict_id == Verdict.id)
        .join(Scan, Verdict.scan_id == Scan.id)
        .join(User, Scan.user_id == User.id)
        .where(ShareLink.token_hash == hash_token(body.token))
    ).first()
    now = datetime.now(UTC)
    if row is None or row[0].revoked_at or row[0].expires_at <= now:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="share_invalid")
    link, verdict, pharmacist = row
    extraction = db.get(Extraction, verdict.extraction_id) if verdict.extraction_id else None
    fields = extraction.fields_json if extraction else {}
    link.last_viewed_at = now
    db.commit()
    return SharedView(
        product_name=fields.get("product_name"),
        plant=(fields.get("plant") or {}).get("value"),
        verdict=verdict.verdict,
        shared_by=pharmacist.full_name,
        organisation=pharmacist.organisation,
        shared_at=link.created_at,
        expires_at=link.expires_at,
    )
