"""Enumerations stored as VARCHAR + CHECK constraint (easy to extend in migrations)."""

from enum import StrEnum

from sqlalchemy import Enum as SAEnum


class Role(StrEnum):
    pharmacist = "pharmacist"
    expert = "expert"
    admin = "admin"


class ScanStatus(StrEnum):
    uploaded = "uploaded"
    extracting = "extracting"
    extracted = "extracted"  # fields ready for review
    unreadable = "unreadable"
    out_of_scope = "out_of_scope"
    checked = "checked"  # verdict computed
    failed = "failed"


class VerdictCode(StrEnum):
    matches = "matches"
    partly_matches = "partly_matches"
    cannot_say = "cannot_say"
    not_covered = "not_covered"
    # Internal only: stated fields contradict every reference preparation.
    # TODO(expert): decide how (and whether) to show this to users.
    differs = "differs"


class Rating(StrEnum):
    agree = "agree"
    disagree = "disagree"
    unsure = "unsure"


class AnnotationStatus(StrEnum):
    draft = "draft"
    in_review = "in_review"
    final = "final"


def str_enum(enum_cls: type[StrEnum], name: str) -> SAEnum:
    return SAEnum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        values_callable=lambda e: [m.value for m in e],
        validate_strings=True,
    )
