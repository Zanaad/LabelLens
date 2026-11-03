# Real rows come only from EU herbal monographs, checked by a mentor. Never invent content.

import uuid
from typing import Any

from sqlalchemy import Boolean, Float, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedMixin, IdMixin, TimestampMixin


class ReferencePreparation(IdMixin, TimestampMixin, Base):
    __tablename__ = "reference_preparations"

    herb_latin: Mapped[str] = mapped_column(String(200), index=True)
    plant_part: Mapped[str] = mapped_column(String(100))
    preparation_type: Mapped[str] = mapped_column(String(100))
    # Drug-extract ratio (DER), e.g. 4-7:1 -> min 4, max 7. Null for non-extracts.
    extract_ratio_min: Mapped[float | None] = mapped_column(Float)
    extract_ratio_max: Mapped[float | None] = mapped_column(Float)
    solvent_type: Mapped[str | None] = mapped_column(String(100))
    solvent_strength: Mapped[str | None] = mapped_column(String(100))  # e.g. "60% V/V"
    evidence_level: Mapped[str | None] = mapped_column(String(64))  # well-established/traditional
    source_doc: Mapped[str | None] = mapped_column(String(300))
    source_section: Mapped[str | None] = mapped_column(String(100))
    source_url: Mapped[str | None] = mapped_column(String(500))
    verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    notes: Mapped[str | None] = mapped_column(Text)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )


class ReferenceHistory(IdMixin, CreatedMixin, Base):
    __tablename__ = "reference_history"

    reference_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("reference_preparations.id", ondelete="SET NULL"), index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(32))  # create | update | delete | import
    before_json: Mapped[dict[str, Any] | None] = mapped_column()
    after_json: Mapped[dict[str, Any] | None] = mapped_column()


class PlantName(IdMixin, TimestampMixin, Base):
    __tablename__ = "plant_names"
    # One common name can mean several species ("chamomile"), so the Latin name is in the key.
    __table_args__ = (
        UniqueConstraint(
            "name", "language", "latin_name", name="uq_plant_names_name_language_latin"
        ),
    )

    name: Mapped[str] = mapped_column(String(200))
    language: Mapped[str] = mapped_column(String(8))  # ISO 639-1: en, sq, la, ...
    latin_name: Mapped[str] = mapped_column(String(200), index=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    notes: Mapped[str | None] = mapped_column(Text)
