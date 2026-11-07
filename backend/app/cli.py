# Admin commands: create-admin (password from ADMIN_PASSWORD or prompted), seed-admin (runs at
# container start), import-reference (upsert from JSON), run-validation (same as Validation -> Run)
# and fetch-readings (live API).

import argparse
import getpass
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import ReferenceFile
from app.config import get_settings
from app.db import get_engine
from app.extraction.providers import (
    PLAIN_PROMPT_VERSION,
    ExtractionError,
    GroqProvider,
    cache_key,
    read_cached,
)
from app.models import Annotation, PlantName, ReferenceHistory, ReferencePreparation, Role, User
from app.services.audit import audit
from app.services.security import hash_password
from app.services.storage import get_storage
from app.services.validation import run_validation, store_run

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


def seed_admin() -> int:
    """First start: creates the admin from ADMIN_EMAIL/ADMIN_PASSWORD if no admin exists yet."""
    email, password = os.environ.get("ADMIN_EMAIL"), os.environ.get("ADMIN_PASSWORD")
    if not email or not password:
        return 0
    with Session(get_engine()) as db:
        if db.scalar(select(User.id).where(User.role == Role.admin).limit(1)):
            return 0
    return create_admin(email, os.environ.get("ADMIN_NAME") or "Administrator", password)


def validate(include_drafts: bool, out: Path | None) -> int:
    s = get_settings()
    with Session(get_engine()) as db:
        metrics = run_validation(
            db,
            get_storage(),
            model=s.validation_model,
            cache_dir=s.extraction_cache_dir,
            include_drafts=include_drafts,
        )
        run = store_run(db, metrics, None)
        audit(db, "validation.run", entity_type="validation_run", entity_id=run.id)
        db.commit()
    if out:
        out.mkdir(parents=True, exist_ok=True)
        path = out / f"run-{datetime.now(UTC):%Y%m%d-%H%M%S}.json"
        path.write_text(json.dumps(metrics, indent=2, ensure_ascii=False))
        print(f"Wrote {path}")
    v = metrics["verdicts"]
    print(
        f"Run {run.id}: {metrics['dataset']['labels']} labels; verdict right "
        f"{v['end_to_end']['correct']}/{v['end_to_end']['total']} (with the label reader), "
        f"{v['rules_only']['correct']}/{v['rules_only']['total']} (with the correct fields)."
    )
    return 0


def fetch_readings() -> int:
    """Fetches unsaved readings and baselines with the configured live provider."""
    s = get_settings()
    if s.extraction_provider != "groq":
        print("Set EXTRACTION_PROVIDER to groq before fetching readings.")
        return 1
    provider = GroqProvider(s.groq_model, s.groq_api_key, s.extraction_cache_dir)
    storage = get_storage()
    fetched = 0
    with Session(get_engine()) as db:
        for a in db.scalars(select(Annotation)):
            image = storage.read(a.label_ref) if a.label_ref else None
            data = image if image is not None else (a.label_text or "").encode()
            try:
                if read_cached(s.extraction_cache_dir, cache_key(data, provider.model)) is None:
                    provider.extract(image=image, text=a.label_text)
                    fetched += 1
                plain_key = cache_key(data, provider.model, PLAIN_PROMPT_VERSION)
                if read_cached(s.extraction_cache_dir, plain_key) is None:
                    provider.extract_plain(image=image, text=a.label_text)
                    fetched += 1
            except ExtractionError as e:
                print(f"{a.title}: {e.code}")
    print(f"Fetched {fetched} readings into {s.extraction_cache_dir}.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("create-admin")
    p.add_argument("--email", required=True)
    p.add_argument("--name", required=True)
    sub.add_parser("import-reference").add_argument("path", type=Path)
    v = sub.add_parser("run-validation")
    v.add_argument("--include-drafts", action="store_true")
    v.add_argument("--out", type=Path, help="also write the metrics as JSON to this folder")
    sub.add_parser("fetch-readings")
    sub.add_parser("seed-admin")
    args = parser.parse_args(argv)
    if args.cmd == "run-validation":
        return validate(args.include_drafts, args.out)
    if args.cmd == "fetch-readings":
        return fetch_readings()
    if args.cmd == "seed-admin":
        return seed_admin()
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
