"""API request/response schemas. Error `detail` values are stable codes the UI translates."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.extraction.schema import FieldStatus
from app.models import Role, ScanStatus, VerdictCode


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    organisation: str | None
    role: Role
    onboarded_at: datetime | None


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(max_length=1024)
    organisation: str | None = Field(default=None, max_length=200)
    accept_privacy: bool
    accept_terms: bool


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=1024)


class InvitationCreate(BaseModel):
    email: EmailStr
    role: Literal[Role.expert, Role.admin]


class InvitationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    role: Role
    expires_at: datetime
    accepted_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class InvitationCreated(InvitationOut):
    # Returned once. The UI shows the link to the admin; we never store the raw token.
    token: str
    accept_path: str


class InvitationTokenIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class InvitationPreview(BaseModel):
    email: str
    role: Role
    expires_at: datetime


class InvitationAcceptIn(InvitationTokenIn):
    full_name: str = Field(min_length=1, max_length=200)
    password: str = Field(max_length=1024)
    accept_privacy: bool
    accept_terms: bool


class ProfileUpdate(BaseModel):
    organisation: str | None = Field(default=None, max_length=200)
    onboarded: bool = False


class LabelTextIn(BaseModel):
    text: str = Field(min_length=10, max_length=5000)


class FieldOut(BaseModel):
    value: str | None
    status: FieldStatus
    confidence: float
    evidence: str | None
    edited: bool = False


class ScanOut(BaseModel):
    id: uuid.UUID
    status: ScanStatus
    created_at: datetime
    original_filename: str | None
    has_image: bool
    label_text: str | None
    product_name: str | None
    fields: dict[str, FieldOut]


class FieldsUpdate(BaseModel):
    # Field key -> corrected value; null marks the field as not stated on the label.
    fields: dict[str, str | None]


class VerdictOut(BaseModel):
    # Shapes come from app.rules.engine (Item, Comparison, Reference); the UI words them.
    id: uuid.UUID
    created_at: datetime
    rules_version: str
    verdict: VerdictCode
    plant_latin: list[str]
    reasons: list[dict[str, Any]]
    comparisons: list[dict[str, Any]]
    missing: list[dict[str, Any]]
    sources: list[dict[str, Any]]
