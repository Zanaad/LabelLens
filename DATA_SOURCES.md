# Data sources

Status: **no real reference data yet.** Everything below marked TODO must be filled in, and every
reference row checked by our pharmacognosy mentor, before results are shown as anything but a sample.

## Reference preparations (`reference_preparations`)

- **Source:** European Union herbal monographs, European Medicines Agency (EMA), Committee on
  Herbal Medicinal Products (HMPC), and the clinical studies they cite.
- **Fields taken:** herb (Latin name), plant part, preparation type, drug-extract ratio range,
  extraction solvent and strength, evidence level (well-established / traditional use), document,
  section, URL.
- **Licence / terms of reuse:** TODO(team): confirm EMA's terms for reusing monograph content and
  cite them here.
- **Checked by:** TODO(expert): mentor name, date, rows checked. Rows stay `verified=false` until then.

## Plant names (`plant_names`)

- Common names (English and the languages found on labels) mapped to Latin names.
- **Source:** TODO(team). Rows stay `verified=false` until checked.

## Label images (`data/labels/`)

- Photos of herbal product labels taken by the team. TODO(team): note where products were
  photographed, and confirm that images contain no personal data (no prescriptions, receipts or
  patient names).
- **Licence:** TODO(team) (suggest CC BY 4.0 for our own photos).

## Fonts

- IBM Plex Sans and IBM Plex Mono, SIL Open Font License 1.1, loaded from Google Fonts.
