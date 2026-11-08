# Admin commands: create-admin (password from ADMIN_PASSWORD or prompted), seed-admin (runs at
# container start), seed-reference (same, loads the reference file if the table is empty),
# seed-labels (same, adds validation labels whose image isn't in the database yet),
# import-reference (upsert from JSON), run-validation (same as Validation -> Run) and
# fetch-readings (live API).

import argparse
import getpass
import hashlib
import json
import os
import sys
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import LabelFile, ReferenceFile
from app.config import get_settings
from app.db import get_engine
from app.extraction.providers import (
    PLAIN_PROMPT_VERSION,
    ExtractionError,
    GroqProvider,
    cache_key,
    read_cached,
)
from app.extraction.schema import FIELD_KEYS
from app.models import (
    Annotation,
    AnnotationStatus,
    PlantName,
    ReferenceHistory,
    ReferencePreparation,
    Role,
    User,
)
from app.services.audit import audit
from app.services.images import ImageError, clean_upload
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
            email_verified_at=datetime.now(UTC),
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


def seed_reference(path: Path) -> int:
    """First start: loads the reference file only while the reference table is empty."""
    with Session(get_engine()) as db:
        if db.scalar(select(ReferencePreparation.id).limit(1)) is not None:
            return 0
        try:
            data = ReferenceFile.model_validate_json(path.read_bytes())
        except (OSError, ValidationError) as e:
            print(f"Could not seed the reference table from {path}:\n{e}")
            return 1
        print(f"Seeded the reference table: {import_reference(db, data)} rows.")
    return 0


def seed_labels(path: Path) -> int:
    """Start: adds labels whose image isn't stored yet, In review, so a person checks each one
    before it counts. Never changes a label that already exists."""
    try:
        data = LabelFile.model_validate_json(path.read_bytes())
    except FileNotFoundError:
        return 0  # no label set on this server
    except (OSError, ValidationError) as e:
        print(f"Could not seed validation labels from {path}:\n{e}")
        return 1
    storage, max_bytes = get_storage(), get_settings().max_upload_mb * 1024 * 1024
    added = 0
    with Session(get_engine()) as db:
        stored = set(db.scalars(select(Annotation.image_sha256)))
        for label in data.labels:
            if set(label.fields) - set(FIELD_KEYS):
                print(f"{label.file}: unknown field")
                continue
            try:
                image = clean_upload((path.parent / label.file).read_bytes(), max_bytes)
            except (OSError, ImageError):
                print(f"{label.file}: image missing or unreadable")
                continue
            sha = hashlib.sha256(image.model_data).hexdigest()  # same key as an upload in the app
            if sha in stored:
                continue
            a = Annotation(
                id=uuid.uuid4(),
                title=label.title,
                image_sha256=sha,
                fields_json={k: label.fields.get(k) for k in FIELD_KEYS},
                expected_verdict=label.expected_verdict,
                notes=label.notes,
                status=AnnotationStatus.in_review,
            )
            a.label_ref = storage.save(f"labels/{a.id}.jpg", image.model_data)
            db.add(a)
            audit(db, "annotation.seed", entity_type="annotation", entity_id=a.id)
            stored.add(sha)
            added += 1
        db.commit()
    if added:
        print(f"Seeded {added} validation labels (In review).")
    return 0


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


def fetch_readings(pause: float) -> int:
    """Fetches unsaved readings and baselines with the configured live provider."""
    s = get_settings()
    if s.extraction_provider != "groq":
        print("Set EXTRACTION_PROVIDER to groq before fetching readings.")
        return 1
    provider = GroqProvider(s.groq_model, s.groq_api_key, s.extraction_cache_dir)
    storage = get_storage()
    fetched = failed = 0
    with Session(get_engine()) as db:
        for a in db.scalars(select(Annotation)):
            image = storage.read(a.label_ref) if a.label_ref else None
            data = image if image is not None else (a.label_text or "").encode()
            calls = [
                (cache_key(data, provider.model), provider.extract),
                (cache_key(data, provider.model, PLAIN_PROMPT_VERSION), provider.extract_plain),
            ]
            for key, read in calls:
                if read_cached(s.extraction_cache_dir, key) is not None:
                    continue
                if fetched + failed:
                    time.sleep(pause)  # the free tier allows only a few image calls per minute
                try:
                    read(image=image, text=a.label_text)
                    fetched += 1
                except ExtractionError as e:
                    failed += 1
                    print(f"{a.title}: {e.code}")
    print(f"Fetched {fetched} readings into {s.extraction_cache_dir}; {failed} failed.")
    if failed:
        print("Run fetch-readings again to retry only the missing ones.")
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
    f = sub.add_parser("fetch-readings")
    f.add_argument("--pause", type=float, default=20, help="seconds between live API calls")
    sub.add_parser("seed-admin")
    sub.add_parser("seed-reference").add_argument("path", type=Path)
    sub.add_parser("seed-labels").add_argument("path", type=Path)
    args = parser.parse_args(argv)
    if args.cmd == "run-validation":
        return validate(args.include_drafts, args.out)
    if args.cmd == "fetch-readings":
        return fetch_readings(args.pause)
    if args.cmd == "seed-labels":
        return seed_labels(args.path)
    if args.cmd == "seed-admin":
        return seed_admin()
    if args.cmd == "seed-reference":
        return seed_reference(args.path)
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
