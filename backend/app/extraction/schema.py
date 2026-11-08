import re
from enum import StrEnum

from pydantic import BaseModel, Field, model_validator

# Order matches the review screen.
FIELD_KEYS = (
    "plant",
    "plant_part",
    "preparation_type",
    "extract_ratio",
    "solvent",
    "marker",
    "dose",
    "other_ingredients",
    "batch",
    "expiry",
)


class FieldStatus(StrEnum):
    stated = "stated"
    not_stated = "not_stated"
    unreadable = "unreadable"


def _squash(text: str) -> str:
    # Ignores case, spacing and punctuation, so "60 % V/V" matches "60% (V/V)".
    return re.sub(r"[\W_]+", "", text.casefold())


class ExtractedField(BaseModel):
    value: str | None = Field(description="Text exactly as printed; null unless status is stated")
    status: FieldStatus
    confidence: float = Field(ge=0, le=1)
    evidence: str | None = Field(description="Exact label text the value was copied from")

    @model_validator(mode="after")
    def check_value(self) -> "ExtractedField":
        if self.status == FieldStatus.stated:
            if not self.value or self.value.strip().casefold() in {"none", "null", "n/a"}:
                raise ValueError("stated field needs a label value")
            if not self.evidence or not self.evidence.strip():
                raise ValueError("stated field needs label evidence")
            squashed = _squash(self.value)
            if not squashed or squashed not in _squash(self.evidence):
                raise ValueError("stated value must appear in its label evidence")
        elif self.value is not None or self.evidence is not None:
            raise ValueError("missing or unreadable field must have null value and evidence")
        return self


class PlainLabelExtraction(BaseModel):
    """Validation baseline: values only, no status, confidence or evidence."""

    product_name: str | None
    plant: str | None
    plant_part: str | None
    preparation_type: str | None
    extract_ratio: str | None
    solvent: str | None
    marker: str | None
    dose: str | None
    other_ingredients: str | None
    batch: str | None
    expiry: str | None


class LabelExtraction(BaseModel):
    label_readable: bool = Field(description="False if the photo is too blurred or dark to read")
    is_herbal_product: bool = Field(description="False for conventional medicines or non-herbal")
    product_name: str | None = Field(description="Product name exactly as printed, or null")
    plant: ExtractedField
    plant_part: ExtractedField
    preparation_type: ExtractedField
    extract_ratio: ExtractedField
    solvent: ExtractedField
    marker: ExtractedField
    dose: ExtractedField
    other_ingredients: ExtractedField
    batch: ExtractedField
    expiry: ExtractedField
