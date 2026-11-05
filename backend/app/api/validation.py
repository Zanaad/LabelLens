# Validation runs: every signed-in user can see them; admins start new ones.

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.api.schemas import ValidationRunIn, ValidationRunOut, ValidationRunSummary
from app.config import get_settings
from app.db import get_db
from app.models import Role, User, ValidationRun
from app.services.audit import audit
from app.services.storage import Storage, get_storage
from app.services.validation import run_validation, store_run

router = APIRouter(prefix="/api/validation", tags=["validation"])


def _summary(run: ValidationRun) -> dict[str, Any]:
    m = run.metrics_json
    return {
        "id": run.id,
        "created_at": run.created_at,
        "rules_version": run.rules_version,
        "prompt_version": run.prompt_version,
        "dataset_size": run.dataset_size,
        "include_drafts": m["dataset"]["include_drafts"],
        "end_to_end": m["verdicts"]["end_to_end"]["accuracy"],
        "rules_only": m["verdicts"]["rules_only"]["accuracy"],
    }


def _out(db: Session, run: ValidationRun) -> ValidationRunOut:
    by = db.get(User, run.started_by_id) if run.started_by_id else None
    return ValidationRunOut(
        **_summary(run), started_by=by.full_name if by else None, metrics=run.metrics_json
    )


@router.get("/runs", response_model=list[ValidationRunSummary])
def list_runs(
    db: Session = Depends(get_db), _: User = Depends(get_current_user)
) -> list[dict[str, Any]]:
    runs = db.scalars(select(ValidationRun).order_by(ValidationRun.created_at.desc()).limit(50))
    return [_summary(r) for r in runs]


@router.get("/runs/{run_id}", response_model=ValidationRunOut)
def get_run(
    run_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(get_current_user)
) -> ValidationRunOut:
    run = db.get(ValidationRun, run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    return _out(db, run)


@router.post("/runs", response_model=ValidationRunOut, status_code=201)
def start_run(
    body: ValidationRunIn,
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    admin: User = Depends(require_roles(Role.admin)),
) -> ValidationRunOut:
    s = get_settings()
    metrics = run_validation(
        db,
        storage,
        model=s.extraction_model,
        cache_dir=s.extraction_cache_dir,
        include_drafts=body.include_drafts,
    )
    run = store_run(db, metrics, admin)
    audit(db, "validation.run", user_id=admin.id, entity_type="validation_run", entity_id=run.id)
    db.commit()
    return _out(db, run)
