from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.api.schemas import PreparationIn, ReferenceFile
from app.cli import import_reference
from app.rules.engine import Reference, Status, Verdict, evaluate, parse_ratio, parse_solvent

SJW, GINKGO, CHAMOMILE = "Hypericum perforatum L.", "Ginkgo biloba L.", "Matricaria recutita L."
TOPS, TEA = "Herb (flowering tops)", "Comminuted herbal substance (herbal tea)"
REFS = [
    Reference("sjw-meth", SJW, TOPS, "Dry extract", 3, 7, "Methanol", "80% (v/v)"),
    Reference("sjw-eth", SJW, TOPS, "Dry extract", 3, 6, "Ethanol", "80% (v/v)"),
    Reference("sjw-tea", SJW, "Herb", TEA),
    Reference("gin", GINKGO, "Leaf", "Refined dry extract", 35, 67, "Acetone", "60% (m/m)"),
    Reference("cha-tea", CHAMOMILE, "Flower", TEA),
]
NAMES = [
    ("St John's wort", SJW),
    ("Ginkgo biloba", GINKGO),
    ("Chamomile", CHAMOMILE),
    ("Chamomile", "Chamaemelum nobile (L.) All."),
    ("German chamomile", CHAMOMILE),
]
SAMPLE = Path(__file__).parents[2] / "data" / "reference" / "sample.json"


def check(**fields: str | None):
    return evaluate(fields, REFS, NAMES)


def sjw_dry_extract(**fields: str):
    base = {"plant": "St John's wort", "plant_part": "herb", "preparation_type": "dry extract"}
    return check(**base, **fields)


def test_full_extract_details_match():
    r = check(
        plant="Ginkgo biloba",
        plant_part="leaf",
        preparation_type="dry extract",
        extract_ratio="35–67:1",
        solvent="acetone 60% (m/m)",
        batch="GB-55102",
        expiry="11/2027",
    )
    assert r.verdict == Verdict.matches
    assert r.comparisons[0].reference_id == "gin"
    assert r.missing == []


def test_missing_extract_details_leave_several_preparations_possible():
    r = check(plant="St John's wort", plant_part="Herb", preparation_type="extract")
    assert r.verdict == Verdict.cannot_say
    assert {c.reference_id for c in r.comparisons[:2]} == {"sjw-meth", "sjw-eth"}
    assert r.comparisons[2].status("preparation_type") == Status.mismatch  # the tea
    asked = [i.code for i in r.missing]
    assert asked[:3] == ["extract_type", "extract_ratio", "solvent"]
    assert asked[-1] == "leaflet"


def test_ambiguous_species_only_partly_matches():
    r = check(plant="chamomile", plant_part="flowers", preparation_type="tea")
    assert r.verdict == Verdict.partly_matches
    assert r.comparisons[0].status("plant") == Status.partial
    assert r.missing[0].code == "species"
    # A more specific name resolves the species.
    r = check(plant="German chamomile", plant_part="flowers", preparation_type="tea")
    assert r.verdict == Verdict.matches


def test_one_consistent_extract_detail_partly_matches():
    r = sjw_dry_extract(solvent="ethanol 80% V/V")
    assert r.verdict == Verdict.partly_matches
    assert r.comparisons[0].reference_id == "sjw-eth"


def test_contradicting_every_preparation_differs():
    r = check(plant="St John's wort", plant_part="herb", preparation_type="tincture")
    assert r.verdict == Verdict.differs


def test_unknown_or_missing_plant():
    assert check(plant="Valerian root").verdict == Verdict.not_covered
    r = check(preparation_type="dry extract")
    assert r.verdict == Verdict.cannot_say and r.missing[0].code == "plant"


@pytest.mark.parametrize(
    ("label", "status"),
    [
        ("4–6:1", Status.match),
        ("8–10:1", Status.mismatch),
        ("5-9:1", Status.partial),
        ("about five to one", Status.partial),
    ],
)
def test_ratio_comparison(label: str, status: Status):
    r = sjw_dry_extract(extract_ratio=label)
    meth = next(c for c in r.comparisons if c.reference_id == "sjw-meth")
    assert meth.status("extract_ratio") == status


def test_parsers():
    assert parse_ratio("DER 3,5 - 6 : 1") == (3.5, 6.0)
    assert parse_ratio("5:1") == (5.0, 5.0)
    assert parse_solvent("Ethanol 60 % V/V") == ("ethanol", 60.0, "v/v")
    assert parse_solvent("acetone (60% w/w)") == ("acetone", 60.0, "m/m")


def test_import_rejects_unchecked_rows_without_todo_and_is_idempotent(db: Session):
    with pytest.raises(ValueError, match="todo_note_required"):
        PreparationIn(herb_latin=SJW, plant_part="Herb", preparation_type="Dry extract")
    data = ReferenceFile.model_validate_json(SAMPLE.read_bytes())
    assert import_reference(db, data) == len(data.preparations) + len(data.plant_names)
    assert import_reference(db, data) == 0
