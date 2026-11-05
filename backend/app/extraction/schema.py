from enum import StrEnum

from pydantic import BaseModel, Field

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


class ExtractedField(BaseModel):
    value: str | None = Field(description="Text exactly as printed; null unless status is stated")
    status: FieldStatus
    confidence: float = Field(ge=0, le=1)
    evidence: str | None = Field(description="Exact label text the value was copied from")


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
