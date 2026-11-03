# Admin commands. create-admin: the first admin (password from ADMIN_PASSWORD or prompted).
# import-reference: load studied preparations and plant names from a JSON file (upsert).

import argparse
import getpass
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_engine
from app.models import PlantName, ReferenceHistory, ReferencePreparation, Role, User
from app.services.audit import audit
from app.services.security import hash_password


class Curated(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    verified: bool = False
    notes: str | None = None

    @model_validator(mode="after")
    def unverified_needs_todo(self) -> Self:
        if not self.verified and "TODO(expert)" not in (self.notes or ""):
            raise ValueError("unverified rows need a TODO(expert) note")
        return self


class PreparationIn(Curated):
    herb_latin: str = Field(min_length=1, max_length=200)
    plant_part: str = Field(min_length=1, max_length=100)
    preparation_type: str = Field(min_length=1, max_length=100)
    extract_ratio_min: float | None = Field(default=None, gt=0)
    extract_ratio_max: float | None = Field(default=None, gt=0)
    solvent_type: str | None = Field(default=None, max_length=100)
    solvent_strength: str | None = Field(default=None, max_length=100)
    evidence_level: str | None = Field(default=None, max_length=64)
    source_doc: str | None = Field(default=None, max_length=300)
    source_section: str | None = Field(default=None, max_length=100)
    source_url: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def ratio_range(self) -> Self:
        low, high = self.extract_ratio_min, self.extract_ratio_max
        if (low is None) != (high is None) or (low and high and low > high):
            raise ValueError("set both extract_ratio_min and extract_ratio_max, min <= max")
        return self


class PlantNameIn(Curated):
    name: str = Field(min_length=1, max_length=200)
    language: str = Field(min_length=2, max_length=8)
    latin_name: str = Field(min_length=1, max_length=200)


class ReferenceFile(BaseModel):
    preparations: list[PreparationIn] = []
    plant_names: list[PlantNameIn] = []


PREP_KEY = (
    "herb_latin",
    "plant_part",
    "preparation_type",
    "extract_ratio_min",
    "extract_ratio_max",
    "solvent_type",
    "solvent_strength",
)


def import_reference(db: Session, data: ReferenceFile) -> int:
    """Insert new rows and update changed ones; returns how many rows changed."""
    changed = 0
    preps = {
        tuple(getattr(r, k) for k in PREP_KEY): r for r in db.scalars(select(ReferencePreparation))
    }
    for row in data.preparations:
        values = row.model_dump()
        ref = preps.get(tuple(values[k] for k in PREP_KEY))
        before = {k: getattr(ref, k) for k in values} if ref else None
        if before == values:
            continue
        if ref is None:
            ref = ReferencePreparation(**values)
            db.add(ref)
        else:
            for k, v in values.items():
                setattr(ref, k, v)
        db.flush()
        db.add(
            ReferenceHistory(
                reference_id=ref.id, action="import", before_json=before, after_json=values
            )
        )
        changed += 1

    names = {(p.name, p.language, p.latin_name): p for p in db.scalars(select(PlantName))}
    for name in data.plant_names:
        existing = names.get((name.name, name.language, name.latin_name))
        if existing is None:
            db.add(PlantName(**name.model_dump()))
        elif (existing.verified, existing.notes) != (name.verified, name.notes):
            existing.verified, existing.notes = name.verified, name.notes
        else:
            continue
        changed += 1
    audit(db, "reference.import", entity_type="reference", details={"changed": changed})
    db.commit()
    return changed


def create_admin(email: str, name: str, password: str) -> int:
    if len(password) < get_settings().password_min_length:
        print(f"Password must be at least {get_settings().password_min_length} characters.")
        return 1
    email = email.strip().lower()
    with Session(get_engine()) as db:
        if db.scalar(select(User).where(User.email == email)):
            print(f"A user with email {email} already exists.")
            return 1
        user = User(
            email=email,
            password_hash=hash_password(password),
            full_name=name,
            role=Role.admin,
            consent_privacy_at=datetime.now(UTC),
            consent_terms_at=datetime.now(UTC),
        )
        db.add(user)
        db.flush()
        audit(db, "user.create_admin_cli", user_id=user.id, entity_type="user", entity_id=user.id)
        db.commit()
    print(f"Admin {email} created.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("create-admin")
    p.add_argument("--email", required=True)
    p.add_argument("--name", required=True)
    sub.add_parser("import-reference").add_argument("path", type=Path)
    args = parser.parse_args(argv)
    if args.cmd == "create-admin":
        password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Password: ")
        return create_admin(args.email, args.name, password)
    if args.cmd == "import-reference":
        try:
            data = ReferenceFile.model_validate_json(args.path.read_bytes())
        except (OSError, ValidationError) as e:
            print(f"Could not import {args.path}:\n{e}")
            return 1
        with Session(get_engine()) as db:
            print(f"Imported {args.path}: {import_reference(db, data)} rows added or changed.")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
