"""API request/response schemas. Error `detail` values are stable codes the UI translates."""

import uuid
from datetime import datetime
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.extraction.schema import FieldStatus
from app.models import AnnotationStatus, Rating, Role, ScanStatus, VerdictCode

# ValueError messages that are stable codes: main.py returns them as {"detail": code}.
VALUE_ERROR_CODES = {"todo_note_required", "ratio_range_invalid", "correct_verdict_required"}


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    organisation: str | None
    role: Role
    onboarded_at: datetime | None
    email_verified: bool


class TokenIn(BaseModel):
    token: str = Field(min_length=1, max_length=200)


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
    remember_me: bool = False


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
    full_name: str | None = Field(default=None, max_length=200)  # None leaves it unchanged
    organisation: str | None = Field(default=None, max_length=200)
    onboarded: bool = False


class RevokedOut(BaseModel):
    revoked: int


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


class ScanListItem(BaseModel):
    id: uuid.UUID
    created_at: datetime
    status: ScanStatus
    product_name: str | None
    plant: str | None
    verdict: VerdictCode | None  # latest check; None if not checked yet
    missing: int | None
    review: Rating | None = None  # most notable reviewer rating of the latest check


class CorrectionOut(BaseModel):
    field: str
    old: str | None
    new: str | None
    by: str | None
    at: datetime


class ActivityOut(BaseModel):
    action: str
    by: str | None
    at: datetime
    details: dict[str, Any] | None


class ShareCreate(BaseModel):
    days: Literal[1, 7, 30] = 7


class ShareOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    last_viewed_at: datetime | None


class ShareCreated(ShareOut):
    # Returned once; only the SHA-256 is stored. The UI builds /p#<token>.
    token: str


class ScanHistory(BaseModel):
    corrections: list[CorrectionOut]
    activity: list[ActivityOut]
    shares: list[ShareOut]


class SharedTokenIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class SharedView(BaseModel):
    # What a patient sees: no label photo, no fields, no personal data beyond the sharer.
    product_name: str | None
    plant: str | None
    verdict: VerdictCode
    shared_by: str
    organisation: str | None
    shared_at: datetime
    expires_at: datetime


class ReviewOpinion(BaseModel):
    """A reviewer's rating as the pharmacist sees it: no reviewer name or id."""

    rating: Rating
    correct_verdict: VerdictCode | None
    reason: str | None


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
    reviews: list[ReviewOpinion] = []  # only filled for the pharmacist who owns the scan
    review_requested_at: datetime | None = None
    review_question: str | None = None


class ReviewRequestIn(BaseModel):
    question: str | None = Field(default=None, max_length=1000)


# Password reset


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class PasswordResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(max_length=1024)


class PasswordChangeIn(BaseModel):
    current_password: str = Field(max_length=1024)
    new_password: str = Field(max_length=1024)


# Admin: users


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    organisation: str | None
    role: Role
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None


class AdminUserUpdate(BaseModel):
    is_active: bool


# Expert review


class ReviewItem(BaseModel):
    verdict_id: uuid.UUID
    scan_id: uuid.UUID
    product_name: str | None
    plant: str | None
    verdict: VerdictCode
    checked_at: datetime
    my_rating: Rating | None
    ratings: int  # by all reviewers
    requested: bool  # the pharmacist asked an expert to look at it


class RatingIn(BaseModel):
    rating: Rating
    correct_verdict: VerdictCode | None = None
    reason: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def disagree_needs_verdict(self) -> Self:
        if self.rating == Rating.disagree and self.correct_verdict is None:
            raise ValueError("correct_verdict_required")
        if self.rating != Rating.disagree:
            self.correct_verdict = None
        return self


class RatingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rating: Rating
    correct_verdict: VerdictCode | None
    reason: str | None
    created_at: datetime


class ReviewDetail(BaseModel):
    # No pharmacist name, email or file name: reviewers see the label and the result only.
    verdict: VerdictOut
    product_name: str | None
    label_text: str | None
    has_image: bool
    fields: dict[str, FieldOut]
    my_rating: RatingOut | None


# Reference table (also used by `python -m app.cli import-reference`)


class CuratedFields(BaseModel):
    verified: bool = False
    notes: str | None = Field(default=None, max_length=2000)


class PreparationFields(CuratedFields):
    herb_latin: str = Field(min_length=1, max_length=200)
    plant_part: str = Field(min_length=1, max_length=100)
    preparation_type: str = Field(min_length=1, max_length=100)
    extract_ratio_min: float | None = Field(default=None, gt=0)
    extract_ratio_max: float | None = Field(default=None, gt=0)
    solvent_type: str | None = Field(default=None, max_length=100)
    solvent_strength: str | None = Field(default=None, max_length=100)
    evidence_level: str | None = Field(default=None, max_length=64)
    source_doc: str | None = Field(default=None, max_length=300)
    source_section: str | None = Field(default=None, max_length=100)
    source_url: str | None = Field(default=None, max_length=500)


class PlantNameFields(CuratedFields):
    name: str = Field(min_length=1, max_length=200)
    language: str = Field(min_length=2, max_length=8)
    latin_name: str = Field(min_length=1, max_length=200)


def _check_todo(row: CuratedFields) -> None:
    if not row.verified and "TODO(expert)" not in (row.notes or ""):
        raise ValueError("todo_note_required")


# Input checks live only on the *In models, so stored rows can always be read back.
class PreparationIn(PreparationFields):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    @model_validator(mode="after")
    def check(self) -> Self:
        _check_todo(self)
        low, high = self.extract_ratio_min, self.extract_ratio_max
        if (low is None) != (high is None) or (low and high and low > high):
            raise ValueError("ratio_range_invalid")
        return self


class PlantNameIn(PlantNameFields):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    @model_validator(mode="after")
    def check(self) -> Self:
        _check_todo(self)
        return self


class ReferenceFile(BaseModel):
    preparations: list[PreparationIn] = []
    plant_names: list[PlantNameIn] = []


class PreparationOut(PreparationFields):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    updated_at: datetime


class PlantNameOut(PlantNameFields):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class ReferenceOut(BaseModel):
    preparations: list[PreparationOut]
    plant_names: list[PlantNameOut]


class CheckIn(BaseModel):
    verified: bool


class ReferenceChange(BaseModel):
    action: str
    by: str | None
    at: datetime
    before: dict[str, Any] | None
    after: dict[str, Any] | None


# Annotations (validation labels)


class AnnotationIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    fields: dict[str, str | None]  # field -> correct value, null when not on the label
    expected_verdict: VerdictCode | None = None
    status: AnnotationStatus = AnnotationStatus.draft
    notes: str | None = Field(default=None, max_length=2000)
    fields_checked: bool = False


class AnnotationListItem(BaseModel):
    id: uuid.UUID
    title: str
    status: AnnotationStatus
    expected_verdict: VerdictCode | None
    has_image: bool
    updated_at: datetime


class AnnotationOut(AnnotationIn):
    id: uuid.UUID
    label_text: str | None
    has_image: bool
    updated_at: datetime
    annotator: str | None
    checked_by: str | None
    checked_at: datetime | None
    prefilled: bool = False  # fields came from the label reader and still need checking


# Validation runs


class ValidationRunIn(BaseModel):
    include_drafts: bool = False


class ValidationRunSummary(BaseModel):
    id: uuid.UUID
    created_at: datetime
    rules_version: str
    prompt_version: str | None
    dataset_size: int
    include_drafts: bool
    end_to_end: float | None  # verdict accuracy with the label reader's fields
    rules_only: float | None  # verdict accuracy with the correct fields


class ValidationRunOut(ValidationRunSummary):
    started_by: str | None
    metrics: dict[str, Any]
