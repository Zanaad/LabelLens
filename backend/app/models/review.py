"""Expert review, ground-truth annotations, validation runs and the audit log."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedMixin, IdMixin, TimestampMixin, UTCDateTime
from app.models.enums import AnnotationStatus, Rating, VerdictCode, str_enum


class ExpertRating(IdMixin, CreatedMixin, Base):
    __tablename__ = "expert_ratings"
    __table_args__ = (
        UniqueConstraint("verdict_id", "reviewer_id", name="uq_expert_ratings_verdict_reviewer"),
    )

    verdict_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("verdicts.id", ondelete="CASCADE"), index=True
    )
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    rating: Mapped[Rating] = mapped_column(str_enum(Rating, "rating"))
    correct_verdict: Mapped[VerdictCode | None] = mapped_column(
        str_enum(VerdictCode, "correct_verdict_code")
    )
    reason: Mapped[str | None] = mapped_column(Text)


class Annotation(IdMixin, TimestampMixin, Base):
    """A validation label: its photo or text, the correct fields and the expected verdict."""

    __tablename__ = "annotations"

    title: Mapped[str] = mapped_column(String(200))
    # Storage key of the photo exactly as the model sees it (so its cached reading can be found).
    label_ref: Mapped[str | None] = mapped_column(String(300), unique=True)
    label_text: Mapped[str | None] = mapped_column(Text)
    image_sha256: Mapped[str] = mapped_column(String(64), unique=True)  # of the photo or text
    fields_json: Mapped[dict[str, Any]]  # field -> correct value, null when not on the label
    notes: Mapped[str | None] = mapped_column(Text)
    expected_verdict: Mapped[VerdictCode | None] = mapped_column(
        str_enum(VerdictCode, "expected_verdict_code")
    )
    status: Mapped[AnnotationStatus] = mapped_column(
        str_enum(AnnotationStatus, "annotation_status"), default=AnnotationStatus.draft
    )
    annotator_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    checked_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    checked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class ValidationRun(IdMixin, CreatedMixin, Base):
    __tablename__ = "validation_runs"

    rules_version: Mapped[str] = mapped_column(String(32))
    prompt_version: Mapped[str | None] = mapped_column(String(32))
    dataset_size: Mapped[int] = mapped_column(Integer)
    metrics_json: Mapped[dict[str, Any]]
    git_commit: Mapped[str | None] = mapped_column(String(40))
    started_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )


class AuditLog(IdMixin, CreatedMixin, Base):
    __tablename__ = "audit_log"
    # Scan detail reads one entity's activity.
    __table_args__ = (Index("ix_audit_log_entity", "entity_type", "entity_id"),)

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(String(64), index=True)  # e.g. auth.login
    entity_type: Mapped[str | None] = mapped_column(String(64))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    details_json: Mapped[dict[str, Any] | None] = mapped_column()
