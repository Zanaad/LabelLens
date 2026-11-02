"""API request/response schemas. Error `detail` values are stable codes the UI translates."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import Role


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
