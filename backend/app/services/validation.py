# Validation: how often LabelLens is right on labels with known answers (built by experts).
# Uses saved readings only (never calls the API), so a run costs nothing and can be repeated.
# Every number in the pitch must come from a stored run.

import dataclasses
import math
from collections import Counter
from collections.abc import Mapping
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.extraction.providers import PLAIN_PROMPT_VERSION, PROMPT_VERSION, cache_key, read_cached
from app.extraction.schema import FIELD_KEYS, FieldStatus, LabelExtraction
from app.models import (
    Annotation,
    AnnotationStatus,
    ExpertRating,
    PlantName,
    Rating,
    ReferencePreparation,
    User,
    ValidationRun,
    Verdict,
    VerdictCode,
)
from app.rules import engine
from app.services.storage import Storage

Fields = Mapping[str, str | None]
REF_FIELDS = [f.name for f in dataclasses.fields(engine.Reference) if f.name != "id"]
VERDICTS = [v.value for v in VerdictCode]


def wilson(correct: int, total: int, z: float = 1.96) -> list[float] | None:
    """95% confidence interval for a proportion; honest for small samples."""
    if total == 0:
        return None
    p = correct / total
    centre = (p + z * z / (2 * total)) / (1 + z * z / total)
    half = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / (1 + z * z / total)
    return [round(max(0.0, centre - half), 4), round(min(1.0, centre + half), 4)]


def rate(correct: int, total: int) -> dict[str, Any]:
    accuracy = round(correct / total, 4) if total else None
    return {"correct": correct, "total": total, "accuracy": accuracy, "ci": wilson(correct, total)}


def _norm(value: str | None) -> str | None:
    if not value:
        return None
    value = value.casefold().replace("–", "-").replace("—", "-").replace("’", "'")
    return " ".join(value.split()) or None


def field_outcome(truth: str | None, read: str | None) -> str:
    """correct, wrong, missed (on the label but not read) or invented (read but not on it)."""
    t, r = _norm(truth), _norm(read)
    if t is None:
        return "correct" if r is None else "invented"
    if r is None:
        return "missed"
    return "correct" if t == r else "wrong"


def keyword_verdict(
    plant: str | None, refs: list[engine.Reference], names: list[tuple[str, str]]
) -> str:
    # Baseline: what a naive checker says. "The label names a studied herb, so it applies."
    if not plant:
        return VerdictCode.cannot_say.value
    latin = {n.lower() for n in engine.resolve_plant(plant, names)}
    covered = any(r.herb_latin.lower() in latin for r in refs)
    return (VerdictCode.matches if covered else VerdictCode.not_covered).value


def _stated(output: dict[str, Any]) -> dict[str, str | None]:
    parsed = LabelExtraction.model_validate(output)
    return {
        k: f.value if (f := getattr(parsed, k)).status == FieldStatus.stated else None
        for k in FIELD_KEYS
    }


def _confusion(pairs: list[tuple[str, str]]) -> dict[str, dict[str, int]]:
    counts = Counter(pairs)
    return {e: {p: counts[(e, p)] for p in VERDICTS} for e in VERDICTS}


def _verdict_block(pairs: list[tuple[str, str]]) -> dict[str, Any]:
    block = rate(sum(e == p for e, p in pairs), len(pairs))
    return {**block, "confusion": _confusion(pairs)}


def _field_block(rows: list[tuple[Fields, Fields]]) -> dict[str, Any]:
    out = {}
    for k in FIELD_KEYS:
        outcomes = Counter(field_outcome(truth.get(k), read.get(k)) for truth, read in rows)
        out[k] = rate(outcomes["correct"], len(rows)) | {
            o: outcomes[o] for o in ("wrong", "missed", "invented")
        }
    return out


def _expert_ratings(db: Session) -> dict[str, Any]:
    rows = db.execute(
        select(Verdict.verdict, ExpertRating.rating, ExpertRating.correct_verdict).join(
            Verdict, ExpertRating.verdict_id == Verdict.id
        )
    ).all()
    counts = Counter(r.rating for r in rows)
    pairs = [
        (app.value, (expert or app).value)
        for app, rating, expert in rows
        if rating != Rating.unsure  # unsure says nothing about right or wrong
    ]
    agree, disagree = counts[Rating.agree], counts[Rating.disagree]
    return {
        "agree": agree,
        "disagree": disagree,
        "unsure": counts[Rating.unsure],
        **rate(agree, agree + disagree),
        "confusion": _confusion(pairs),  # app verdict -> expert's verdict
    }


def run_validation(
    db: Session, storage: Storage, *, model: str, cache_dir: str, include_drafts: bool
) -> dict[str, Any]:
    query = select(Annotation)
    if not include_drafts:
        query = query.where(
            Annotation.status == AnnotationStatus.final, Annotation.checked_at.is_not(None)
        )
    labels = db.scalars(query.order_by(Annotation.created_at)).all()
    names = [(n, latin) for n, latin in db.execute(select(PlantName.name, PlantName.latin_name))]
    refs = [
        engine.Reference(id=str(r.id), **{k: getattr(r, k) for k in REF_FIELDS})
        for r in db.scalars(select(ReferencePreparation))
    ]

    def verdict(fields: Fields) -> str:
        return engine.evaluate(fields, refs, names).verdict.value

    read_rows: list[tuple[Fields, Fields]] = []
    plain_rows: list[tuple[Fields, Fields]] = []
    rules, end_to_end, plain, keyword = [], [], [], []
    failures, not_read, snapshot = [], [], []
    for a in labels:
        truth = {k: a.fields_json.get(k) for k in FIELD_KEYS}
        data = storage.read(a.label_ref) if a.label_ref else (a.label_text or "").encode()
        reading = read_cached(cache_dir, cache_key(data, model))
        plain_output = read_cached(cache_dir, cache_key(data, model, PLAIN_PROMPT_VERSION))
        read = _stated(reading) if reading else None
        plain_read = {k: plain_output.get(k) for k in FIELD_KEYS} if plain_output else None
        if read:
            read_rows.append((truth, read))
        else:
            not_read.append(a.title)
        if plain_read:
            plain_rows.append((truth, plain_read))

        expected = a.expected_verdict.value if a.expected_verdict else None
        rules_v = verdict(truth)
        e2e_v = verdict(read) if read else None
        predicted = {"rules_only": rules_v, "end_to_end": e2e_v}
        if expected:
            rules.append((expected, rules_v))
            keyword.append((expected, keyword_verdict(truth["plant"], refs, names)))
            if e2e_v:
                end_to_end.append((expected, e2e_v))
            if plain_read:
                plain.append((expected, verdict(plain_read)))
        field_errors = [
            {"field": k, "correct": truth[k], "read": read[k]}
            for k in FIELD_KEYS
            if read and field_outcome(truth[k], read[k]) != "correct"
        ]
        wrong_verdict = bool(expected) and any(p and p != expected for p in predicted.values())
        if field_errors or wrong_verdict:
            failures.append(
                {
                    "id": str(a.id),
                    "title": a.title,
                    "expected": expected,
                    **predicted,
                    "field_errors": field_errors,
                }
            )
        snapshot.append(
            {
                "id": str(a.id),
                "title": a.title,
                "status": a.status.value,
                "checked_by_id": str(a.checked_by_id) if a.checked_by_id else None,
                "checked_at": a.checked_at.isoformat() if a.checked_at else None,
                "label_sha256": a.image_sha256,
                "expected_verdict": expected,
                "fields": truth,
            }
        )

    return {
        "versions": {
            "rules": engine.RULES_VERSION,
            "prompt": PROMPT_VERSION,
            "plain_prompt": PLAIN_PROMPT_VERSION,
            "model": model,
        },
        "dataset": {
            "labels": len(labels),
            "with_expected_verdict": len(rules),
            "read": len(read_rows),
            "not_read": not_read,  # no saved reading for the current prompt and model
            "include_drafts": include_drafts,
            "by_status": dict(Counter(a.status.value for a in labels)),
        },
        "fields": _field_block(read_rows),
        "verdicts": {"rules_only": _verdict_block(rules), "end_to_end": _verdict_block(end_to_end)},
        "baselines": {
            "keyword": _verdict_block(keyword),
            "plain_model": {**_verdict_block(plain), "fields": _field_block(plain_rows)},
        },
        "expert_ratings": _expert_ratings(db),
        "failures": failures,
        "snapshot": snapshot,  # the exact answers this run was scored against
    }


def store_run(db: Session, metrics: dict[str, Any], user: User | None) -> ValidationRun:
    run = ValidationRun(
        rules_version=metrics["versions"]["rules"],
        prompt_version=metrics["versions"]["prompt"],
        dataset_size=metrics["dataset"]["labels"],
        metrics_json=metrics,
        started_by_id=user.id if user else None,
    )
    db.add(run)
    db.flush()
    return run
