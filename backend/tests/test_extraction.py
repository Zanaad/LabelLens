import pytest
from pydantic import ValidationError

from app.extraction.schema import ExtractedField, FieldStatus


def stated(value: str, evidence: str) -> ExtractedField:
    return ExtractedField(value=value, status=FieldStatus.stated, confidence=0.9, evidence=evidence)


def test_value_found_in_evidence_ignoring_case_and_punctuation():
    assert stated("ethanol 60% (V/V)", "Extraction solvent: Ethanol 60 % V/V").value
    assert stated("25g", "Net weight 25 g").value


@pytest.mark.parametrize(
    ("value", "evidence"),
    [("dry extract", "Net weight 25g"), ("25g", "Net weight 250g"), ("—", "Net weight — 25g")],
)
def test_value_missing_from_evidence_is_rejected(value, evidence):
    with pytest.raises(ValidationError, match="appear in its label evidence"):
        stated(value, evidence)
