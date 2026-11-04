"""Expert review, ground-truth annotations, validation runs and the audit log."""

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedMixin, IdMixin, TimestampMixin
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
    """Ground-truth fields for one label image in data/labels/."""

    __tablename__ = "annotations"

    label_ref: Mapped[str] = mapped_column(String(300), unique=True)  # path under data/labels/
    image_sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    fields_json: Mapped[dict[str, Any]]
    expected_verdict: Mapped[VerdictCode | None] = mapped_column(
        str_enum(VerdictCode, "expected_verdict_code")
    )
    status: Mapped[AnnotationStatus] = mapped_column(
        str_enum(AnnotationStatus, "annotation_status"), default=AnnotationStatus.draft
    )
    annotator_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )


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
