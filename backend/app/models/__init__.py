"""All ORM models, imported here so Alembic autogenerate sees them."""

from app.models.base import Base
from app.models.enums import AnnotationStatus, Rating, Role, ScanStatus, VerdictCode
from app.models.reference import PlantName, ReferenceHistory, ReferencePreparation
from app.models.review import Annotation, AuditLog, ExpertRating, ValidationRun
from app.models.scan import Correction, Extraction, Scan, ShareLink, Verdict
from app.models.user import Invitation, User

__all__ = [
    "Annotation",
    "AnnotationStatus",
    "AuditLog",
    "Base",
    "Correction",
    "ExpertRating",
    "Extraction",
    "Invitation",
    "PlantName",
    "Rating",
    "ReferenceHistory",
    "ReferencePreparation",
    "Role",
    "Scan",
    "ScanStatus",
    "ShareLink",
    "User",
    "ValidationRun",
    "Verdict",
    "VerdictCode",
]
