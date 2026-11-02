import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedMixin, IdMixin, TimestampMixin, UTCDateTime
from app.models.enums import ScanStatus, VerdictCode, str_enum


class Scan(IdMixin, TimestampMixin, Base):
    __tablename__ = "scans"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # Null when the label was pasted as text instead of uploaded as a photo.
    image_path: Mapped[str | None] = mapped_column(String(500))
    image_sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    original_filename: Mapped[str | None] = mapped_column(String(255))
    mime_type: Mapped[str | None] = mapped_column(String(64))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    label_text: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ScanStatus] = mapped_column(
        str_enum(ScanStatus, "scan_status"), default=ScanStatus.uploaded
    )


class Extraction(IdMixin, CreatedMixin, Base):
    __tablename__ = "extractions"

    scan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("scans.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(128))
    prompt_version: Mapped[str] = mapped_column(String(32))
    cache_key: Mapped[str | None] = mapped_column(String(64), index=True)
    raw_json: Mapped[dict[str, Any]]  # model output exactly as returned
    fields_json: Mapped[dict[str, Any]]  # validated fields incl. user corrections
    latency_ms: Mapped[int | None] = mapped_column(Integer)


class Correction(IdMixin, CreatedMixin, Base):
    __tablename__ = "corrections"

    extraction_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("extractions.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    field: Mapped[str] = mapped_column(String(64))
    old_value: Mapped[dict[str, Any] | None] = mapped_column()
    new_value: Mapped[dict[str, Any] | None] = mapped_column()


class Verdict(IdMixin, CreatedMixin, Base):
    __tablename__ = "verdicts"

    scan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("scans.id", ondelete="CASCADE"), index=True
    )
    extraction_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("extractions.id", ondelete="SET NULL")
    )
    rules_version: Mapped[str] = mapped_column(String(32))
    verdict: Mapped[VerdictCode] = mapped_column(str_enum(VerdictCode, "verdict_code"))
    reasoning_json: Mapped[dict[str, Any]]
    comparison_json: Mapped[dict[str, Any]]
    missing_json: Mapped[dict[str, Any]]
    sources_json: Mapped[dict[str, Any]]


class ShareLink(IdMixin, CreatedMixin, Base):
    """Read-only patient link to one verdict. Only the SHA-256 of the token is stored."""

    __tablename__ = "share_links"

    verdict_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("verdicts.id", ondelete="CASCADE"), index=True
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    last_viewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
