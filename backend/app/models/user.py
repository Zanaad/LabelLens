import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedMixin, IdMixin, TimestampMixin, UTCDateTime
from app.models.enums import Role, str_enum


class User(IdMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)  # stored lowercase
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(200))
    organisation: Mapped[str | None] = mapped_column(String(200))
    role: Mapped[Role] = mapped_column(str_enum(Role, "role"), default=Role.pharmacist)
    locale: Mapped[str] = mapped_column(String(8), default="en", server_default="en")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    consent_privacy_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    consent_terms_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    onboarded_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class Invitation(IdMixin, CreatedMixin, Base):
    """Invitation for expert reviewers and admins. Only the SHA-256 of the token is stored."""

    __tablename__ = "invitations"

    email: Mapped[str] = mapped_column(String(320), index=True)
    role: Mapped[Role] = mapped_column(str_enum(Role, "invitation_role"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    invited_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    accepted_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    accepted_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
