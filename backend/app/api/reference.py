# Reference table: every signed-in user can read it; only experts add, edit, check and delete
# rows, since every value comes from a monograph. Each preparation change is kept in
# reference_history. Never invent monograph content: unchecked rows need TODO(expert).

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.api.schemas import (
    PlantNameIn,
    PlantNameOut,
    PreparationIn,
    PreparationOut,
    ReferenceChange,
    ReferenceOut,
)
from app.db import get_db
from app.models import (
    PlantName,
    ReferenceHistory,
    ReferencePreparation,
    Role,
    User,
)
from app.services.audit import audit

router = APIRouter(prefix="/api/reference", tags=["reference"])

expert_only = require_roles(Role.expert)
PREP_FIELDS = list(PreparationIn.model_fields)


def _prep(db: Session, prep_id: uuid.UUID) -> ReferencePreparation:
    prep = db.get(ReferencePreparation, prep_id)
    if prep is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    return prep


def _snapshot(prep: ReferencePreparation) -> dict[str, Any]:
    return {k: getattr(prep, k) for k in PREP_FIELDS}


def _record(
    db: Session, user: User, action: str, prep_id: uuid.UUID, before: Any, after: Any
) -> None:
    change = ReferenceHistory(reference_id=prep_id, user_id=user.id, action=action)
    change.before_json, change.after_json = before, after
    db.add(change)
    audit(db, f"reference.{action}", user_id=user.id, entity_type="reference", entity_id=prep_id)


@router.get("", response_model=ReferenceOut)
def get_reference(
    db: Session = Depends(get_db), _: User = Depends(get_current_user)
) -> ReferenceOut:
    preps = db.scalars(
        select(ReferencePreparation).order_by(
            ReferencePreparation.herb_latin, ReferencePreparation.preparation_type
        )
    )
    names = db.scalars(select(PlantName).order_by(PlantName.latin_name, PlantName.name))
    return ReferenceOut(
        preparations=[PreparationOut.model_validate(p) for p in preps],
        plant_names=[PlantNameOut.model_validate(n) for n in names],
    )


@router.post("/preparations", response_model=PreparationOut, status_code=201)
def create_preparation(
    body: PreparationIn, db: Session = Depends(get_db), expert: User = Depends(expert_only)
) -> ReferencePreparation:
    prep = ReferencePreparation(**body.model_dump(), updated_by_id=expert.id)
    db.add(prep)
    db.flush()
    _record(db, expert, "create", prep.id, None, body.model_dump())
    db.commit()
    return prep


@router.put("/preparations/{prep_id}", response_model=PreparationOut)
def update_preparation(
    prep_id: uuid.UUID,
    body: PreparationIn,
    db: Session = Depends(get_db),
    expert: User = Depends(expert_only),
) -> ReferencePreparation:
    prep = _prep(db, prep_id)
    before, after = _snapshot(prep), body.model_dump()
    if before == after:
        return prep
    # A change to the checked box alone is recorded as a check, so the history reads clearly.
    content_same = {k: v for k, v in before.items() if k != "verified"} == {
        k: v for k, v in after.items() if k != "verified"
    }
    action = ("check" if body.verified else "uncheck") if content_same else "update"
    for k, v in after.items():
        setattr(prep, k, v)
    prep.updated_by_id = expert.id
    _record(db, expert, action, prep.id, before, after)
    db.commit()
    return prep


@router.delete("/preparations/{prep_id}", status_code=204)
def delete_preparation(
    prep_id: uuid.UUID, db: Session = Depends(get_db), expert: User = Depends(expert_only)
) -> Response:
    prep = _prep(db, prep_id)
    _record(db, expert, "delete", prep.id, _snapshot(prep), None)
    db.delete(prep)  # the history row keeps the content; its link is set to null
    db.commit()
    return Response(status_code=204)


@router.get("/preparations/{prep_id}/history", response_model=list[ReferenceChange])
def preparation_history(
    prep_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(expert_only),
) -> list[ReferenceChange]:
    rows = db.execute(
        select(ReferenceHistory, User.full_name)
        .outerjoin(User, ReferenceHistory.user_id == User.id)
        .where(ReferenceHistory.reference_id == prep_id)
        .order_by(ReferenceHistory.created_at.desc())
    ).all()
    return [
        ReferenceChange(
            action=h.action, by=name, at=h.created_at, before=h.before_json, after=h.after_json
        )
        for h, name in rows
    ]


def _save_name(db: Session, name: PlantName, expert: User, action: str) -> PlantName:
    audit(
        db, f"plant_name.{action}", user_id=expert.id, entity_type="plant_name", entity_id=name.id
    )
    try:
        db.commit()
    except IntegrityError:  # same name, language and Latin name already listed
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="duplicate_name") from None
    return name


def _name(db: Session, name_id: uuid.UUID) -> PlantName:
    name = db.get(PlantName, name_id)
    if name is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    return name


@router.post("/plant-names", response_model=PlantNameOut, status_code=201)
def create_plant_name(
    body: PlantNameIn, db: Session = Depends(get_db), expert: User = Depends(expert_only)
) -> PlantName:
    name = PlantName(id=uuid.uuid4(), **body.model_dump())
    db.add(name)
    return _save_name(db, name, expert, "create")


@router.put("/plant-names/{name_id}", response_model=PlantNameOut)
def update_plant_name(
    name_id: uuid.UUID,
    body: PlantNameIn,
    db: Session = Depends(get_db),
    expert: User = Depends(expert_only),
) -> PlantName:
    name = _name(db, name_id)
    if all(getattr(name, k) == v for k, v in body.model_dump().items()):
        return name
    for k, v in body.model_dump().items():
        setattr(name, k, v)
    return _save_name(db, name, expert, "update")


@router.delete("/plant-names/{name_id}", status_code=204)
def delete_plant_name(
    name_id: uuid.UUID, db: Session = Depends(get_db), expert: User = Depends(expert_only)
) -> Response:
    name = _name(db, name_id)
    audit(db, "plant_name.delete", user_id=expert.id, entity_type="plant_name", entity_id=name.id)
    db.delete(name)
    db.commit()
    return Response(status_code=204)
