# Compares label fields with studied preparations. Pure Python: no FastAPI or SQLAlchemy imports.
# TODO(expert): the vocabularies, tolerances and verdict logic below need a pharmacognosy review.

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import asdict, dataclass, field
from enum import StrEnum
from typing import Any

RULES_VERSION = "0.1.0"

COMPARED = ("plant", "plant_part", "preparation_type", "extract_ratio", "solvent")
CORE = COMPARED[:3]


class Status(StrEnum):
    match = "match"
    partial = "partial"
    mismatch = "mismatch"
    missing = "missing"
    na = "na"


class Verdict(StrEnum):  # same values as models.enums.VerdictCode
    matches = "matches"
    partly_matches = "partly_matches"
    cannot_say = "cannot_say"
    not_covered = "not_covered"
    differs = "differs"  # internal: stated fields contradict every studied preparation


@dataclass(frozen=True)
class Reference:
    id: str
    herb_latin: str
    plant_part: str
    preparation_type: str
    extract_ratio_min: float | None = None
    extract_ratio_max: float | None = None
    solvent_type: str | None = None
    solvent_strength: str | None = None
    evidence_level: str | None = None
    source_doc: str | None = None
    source_section: str | None = None
    source_url: str | None = None
    verified: bool = False


@dataclass
class Row:
    field: str
    label: str | None
    reference: str | None  # None: not applicable to this preparation
    status: Status


@dataclass
class Comparison:
    reference_id: str
    name: str
    evidence_level: str | None
    rows: list[Row]

    def status(self, key: str) -> Status:
        return next(r.status for r in self.rows if r.field == key)

    def has(self, status: Status) -> bool:
        return any(r.status == status for r in self.rows)

    def score(self) -> int:
        weights = {Status.match: 3, Status.partial: 1, Status.mismatch: -4}
        return sum(weights.get(r.status, 0) for r in self.rows)


@dataclass
class Item:
    code: str
    params: dict[str, Any] = field(default_factory=dict)
    source: str | None = None  # reference id
    ask: str | None = None  # manufacturer | patient (missing items only)


@dataclass
class Result:
    verdict: Verdict
    plant_latin: list[str]
    reasons: list[Item]
    comparisons: list[Comparison]
    missing: list[Item]
    sources: list[Reference]
    rules_version: str = RULES_VERSION

    def to_json(self) -> dict[str, Any]:
        return asdict(self)


# Vocabularies: canonical term -> phrases found on labels and in the reference table.
PLANT_PARTS = {
    "herb": ("herb", "herba", "aerial part", "aerial parts", "flowering top", "flowering tops"),
    "leaf": ("leaf", "leaves", "folium"),
    "flower": ("flower", "flowers", "flos", "flower head", "flower heads"),
    "root": ("root", "roots", "radix"),
    "rhizome": ("rhizome", "rhizoma"),
    "fruit": ("fruit", "fruits", "fructus", "berry", "berries"),
    "seed": ("seed", "seeds", "semen"),
    "bark": ("bark", "cortex"),
}
# Order matters: the plain "extract" (type not stated) must come last.
PREPARATIONS = {
    "dry_extract": ("dry extract", "dried extract", "extractum siccum"),
    "liquid_extract": ("liquid extract", "fluid extract", "extractum fluidum"),
    "soft_extract": ("soft extract", "thick extract"),
    "tincture": ("tincture",),
    "essential_oil": ("essential oil",),
    "tea": ("herbal tea", "tea", "tea bag", "tea bags", "infusion", "comminuted"),
    "powder": ("powder", "powdered"),
    "extract": ("extract", "extracts"),
}
EXTRACTS = {"dry_extract", "liquid_extract", "soft_extract", "tincture", "extract"}
SOLVENTS = {
    "ethanol": ("ethanol", "alcohol"),  # TODO(expert): is "alcohol" on a label always ethanol?
    "methanol": ("methanol",),
    "acetone": ("acetone",),
    "ethyl acetate": ("ethyl acetate",),
    "water": ("water", "aqua", "purified water"),
    "glycerol": ("glycerol", "glycerin", "glycerine"),
}
STRENGTH_TOLERANCE = 0.5  # percentage points; TODO(expert)

_NUM = r"(\d+(?:[.,]\d+)?)"
_RATIO = re.compile(_NUM + r"\s*(?:(?:-|–|—|to)\s*" + _NUM + r")?\s*:\s*1\b")
_STRENGTH = re.compile(_NUM + r"\s*%\s*(?:\(?\s*(v/v|m/m|w/w|vol)\b)?", re.IGNORECASE)


def _words(text: str) -> str:
    text = text.lower().replace("’", "'")
    return " ".join(re.sub(r"[^\w']+", " ", text).split())


def _contains(text: str, phrase: str) -> bool:
    return f" {_words(phrase)} " in f" {_words(text)} "


def _canonical(text: str, vocab: Mapping[str, Sequence[str]]) -> str | None:
    return next(
        (k for k, phrases in vocab.items() if any(_contains(text, p) for p in phrases)), None
    )


def _num(s: str) -> float:
    return float(s.replace(",", "."))


def _fmt(n: float) -> str:
    return f"{n:g}"


def resolve_plant(label: str, names: Iterable[tuple[str, str]]) -> list[str]:
    """Latin names whose common or Latin name appears in the label's plant text."""
    hits = [(_words(n), latin) for n, latin in names if _contains(label, n)]
    # Keep the longest names only, so "German chamomile" wins over "chamomile".
    longest = [
        h for h in hits if not any(h[0] != o[0] and f" {h[0]} " in f" {o[0]} " for o in hits)
    ]
    return sorted({latin for _, latin in longest})


def parse_ratio(text: str) -> tuple[float, float] | None:
    m = _RATIO.search(text)
    if not m:
        return None
    lo = _num(m.group(1))
    return lo, _num(m.group(2)) if m.group(2) else lo


def parse_solvent(text: str) -> tuple[str | None, float | None, str | None]:
    m = _STRENGTH.search(text)
    unit = (m.group(2) or "").lower() if m else ""
    unit = {"w/w": "m/m", "vol": "v/v"}.get(unit, unit)
    return _canonical(text, SOLVENTS), _num(m.group(1)) if m else None, unit or None


def _plant_row(label: str, latin: list[str], ref: Reference) -> Row:
    # Several species fit the label's name (e.g. "chamomile"): consistent but not specific.
    status = Status.match if len(latin) == 1 else Status.partial
    return Row("plant", label, ref.herb_latin, status)


def _part_row(label: str | None, ref: Reference) -> Row:
    if not label:
        return Row("plant_part", None, ref.plant_part, Status.missing)
    ours, theirs = _canonical(label, PLANT_PARTS), _canonical(ref.plant_part, PLANT_PARTS)
    if ours is None or theirs is None:
        status = Status.partial  # wording we don't recognise; TODO(expert)
    else:
        status = Status.match if ours == theirs else Status.mismatch
    return Row("plant_part", label, ref.plant_part, status)


def _prep_row(label: str | None, ref: Reference) -> Row:
    if not label:
        return Row("preparation_type", None, ref.preparation_type, Status.missing)
    ours, theirs = _canonical(label, PREPARATIONS), _canonical(ref.preparation_type, PREPARATIONS)
    if ours is None:
        status = Status.partial
    elif ours == theirs:
        status = Status.match
    elif ours == "extract" and theirs in EXTRACTS:
        status = Status.partial  # "extract" without saying dry or liquid
    else:
        status = Status.mismatch
    return Row("preparation_type", label, ref.preparation_type, status)


def _is_extract(ref: Reference) -> bool:
    return _canonical(ref.preparation_type, PREPARATIONS) in EXTRACTS


def _ratio_row(label: str | None, ref: Reference) -> Row:
    if not _is_extract(ref):
        return Row("extract_ratio", label, None, Status.mismatch if label else Status.na)
    low, high = ref.extract_ratio_min, ref.extract_ratio_max
    if low is None or high is None:
        return Row("extract_ratio", label, None, Status.na)  # reference gives no ratio
    shown = f"{_fmt(low)}:1" if low == high else f"{_fmt(low)}–{_fmt(high)}:1"
    if not label:
        return Row("extract_ratio", None, shown, Status.missing)
    parsed = parse_ratio(label)
    if parsed is None:
        return Row("extract_ratio", label, shown, Status.partial)
    lo, hi = parsed
    if low <= lo and hi <= high:
        status = Status.match
    elif hi < low or lo > high:
        status = Status.mismatch
    else:
        status = Status.partial  # ranges overlap; TODO(expert)
    return Row("extract_ratio", label, shown, status)


def _solvent_row(label: str | None, ref: Reference) -> Row:
    if not _is_extract(ref):
        return Row("solvent", label, None, Status.mismatch if label else Status.na)
    if not ref.solvent_type:
        return Row("solvent", label, None, Status.na)
    shown = " ".join(filter(None, [ref.solvent_type, ref.solvent_strength]))
    if not label:
        return Row("solvent", None, shown, Status.missing)
    name, pct, unit = parse_solvent(label)
    ref_name, ref_pct, ref_unit = parse_solvent(shown)
    if name is None:
        status = Status.partial
    elif name != ref_name:
        status = Status.mismatch
    elif ref_pct is None:
        status = Status.match
    elif pct is None:
        status = Status.partial  # strength not stated
    elif abs(pct - ref_pct) > STRENGTH_TOLERANCE or (unit and ref_unit and unit != ref_unit):
        status = Status.mismatch  # TODO(expert): is 60% m/m vs 60% v/v a different solvent?
    else:
        status = Status.match
    return Row("solvent", label, shown, status)


def preparation_name(ref: Reference) -> str:
    ratio = _ratio_row(None, ref).reference
    solvent = _solvent_row(None, ref).reference
    return ", ".join(filter(None, [ref.preparation_type, ratio and f"DER {ratio}", solvent]))


def compare(fields: Mapping[str, str | None], ref: Reference, latin: list[str]) -> Comparison:
    rows = [
        _plant_row(fields.get("plant") or "", latin, ref),
        _part_row(fields.get("plant_part"), ref),
        _prep_row(fields.get("preparation_type"), ref),
        _ratio_row(fields.get("extract_ratio"), ref),
        _solvent_row(fields.get("solvent"), ref),
    ]
    return Comparison(ref.id, preparation_name(ref), ref.evidence_level, rows)


def _missing_items(
    fields: Mapping[str, str | None], relevant: list[Comparison], latin: list[str]
) -> list[Item]:
    items: list[Item] = []
    plant = fields.get("plant") or ""
    if not plant:
        items.append(Item("plant", ask="manufacturer"))
    elif len(latin) > 1:
        items.append(Item("species", {"plant": plant, "options": latin}, ask="manufacturer"))
    for key in COMPARED[1:]:
        statuses = {c.status(key) for c in relevant}
        if Status.missing in statuses:
            items.append(Item(key, {"plant": plant}, ask="manufacturer"))
        elif Status.partial in statuses and key == "preparation_type":
            items.append(Item("extract_type", ask="manufacturer"))
        elif Status.partial in statuses and key == "solvent":
            items.append(Item("solvent_strength", ask="manufacturer"))
    items += [Item(k, ask="manufacturer") for k in ("batch", "expiry") if not fields.get(k)]
    if items:
        items.append(Item("leaflet", ask="patient"))
    return items


def _fields_with(c: Comparison, status: Status, skip: Iterable[str] = ()) -> list[str]:
    return [r.field for r in c.rows if r.status == status and r.field not in skip]


def evaluate(
    fields: Mapping[str, str | None],
    references: Iterable[Reference],
    plant_names: Iterable[tuple[str, str]],
) -> Result:
    """`fields` holds stated values only (None when not stated or unreadable)."""
    plant = fields.get("plant") or ""
    latin = resolve_plant(plant, plant_names) if plant else []
    wanted = {_words(n) for n in latin}
    refs = [r for r in references if _words(r.herb_latin) in wanted]
    label_only = Item("label_only")

    if not plant:
        reasons = [Item("plant_missing"), label_only]
        return Result(Verdict.cannot_say, latin, reasons, [], _missing_items(fields, [], latin), [])
    if not refs:
        reasons = [Item("not_covered", {"plant": plant}), label_only]
        return Result(Verdict.not_covered, latin, reasons, [], [], [])

    by_id = {r.id: r for r in refs}
    comparisons = sorted((compare(fields, r, latin) for r in refs), key=lambda c: -c.score())
    possible = [c for c in comparisons if not c.has(Status.mismatch)]
    full = [c for c in possible if all(r.status in (Status.match, Status.na) for r in c.rows)]

    reasons = [
        Item("plant_ambiguous", {"plant": plant, "options": latin})
        if len(latin) > 1
        else Item("plant_named", {"plant": plant, "latin": latin[0]})
    ]
    if full:
        verdict, closest = Verdict.matches, full[0]
        reasons += [
            Item("matches", {"prep": closest.name}, closest.reference_id),
            Item("same_kind"),
        ]
    elif not possible:
        verdict, closest = Verdict.differs, comparisons[0]
        reasons.append(Item("differs", {"count": len(comparisons)}, closest.reference_id))
    else:
        closest = possible[0]
        core_known = all(closest.status(k) in (Status.match, Status.partial) for k in CORE)
        detail = [closest.status(k) for k in COMPARED[3:]]
        detail_ok = not _is_extract(by_id[closest.reference_id]) or any(
            s in (Status.match, Status.partial) for s in detail
        )
        missing_keys = sorted(
            {f for c in possible for f in _fields_with(c, Status.missing)}, key=COMPARED.index
        )
        # TODO(expert): is one remaining candidate with a consistent extract detail enough?
        if len(possible) == 1 and core_known and detail_ok:
            verdict = Verdict.partly_matches
            reasons.append(Item("partly", {"prep": closest.name}, closest.reference_id))
            partial = _fields_with(closest, Status.partial, skip=("plant",))
            if partial:
                reasons.append(Item("less_specific", {"fields": partial}))
        else:
            verdict = Verdict.cannot_say
            if len(possible) > 1:
                reasons.append(
                    Item("several_possible", {"count": len(possible)}, closest.reference_id)
                )
        if missing_keys:
            reasons.append(Item("not_stated", {"fields": missing_keys}))
    reasons.append(label_only)

    # Closest preparation first, then the rest by score; sources follow the same order.
    comparisons.remove(closest)
    comparisons.insert(0, closest)
    missing = _missing_items(fields, possible or [closest], latin)
    sources = [by_id[c.reference_id] for c in comparisons]
    return Result(verdict, latin, reasons, comparisons, missing, sources)
