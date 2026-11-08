# Data sources

Status: **source-linked EMA draft data added; expert verification pending.** Everything below marked TODO must be filled in, and every
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

## Validation labels (Validation → Validation labels)

- Label photos are uploaded by experts in the app and stored in its upload storage, not in the
  repository. Each validation run keeps a copy of the correct answers it was scored against.
- Record each label's source and licence in its notes. Images must not contain personal data (no
  prescriptions, receipts or patient names).

### Local draft validation set (6 Nov 2026)

Ten product-label images are stored only in the local app's upload storage as Draft or In review annotations.
Three came from team-provided local files; seven came from public product pages. Each annotation's
notes record its source page and filename. These third-party images are for local validation
review, not repository publication. Confirm reuse rights before distributing the images. Groq
readings exist for two labels; seven others have limited assistant-entered first-pass fields,
explicitly marked for independent checking. Rate limits or connection failures stopped further
Groq readings. No draft counts toward the standard validation report until an admin checks every
field against the image and marks it Final. An expected verdict is optional and must have its own
reviewed basis.

## Fonts

- IBM Plex Sans and IBM Plex Mono, SIL Open Font License 1.1, loaded from Google Fonts.

## EMA draft dataset (2026-11-05)

`data/reference/ema-draft.json` contains seven selected preparations for three herbs. Each row records a direct final-monograph URL, document identifier, page/section, evidence category and an expert-review note. European Medicines Agency is the source; these structured entries are our transcription, not an EMA-approved dataset. The PDF title pages authorise reproduction with source acknowledgement. Preserve attribution and review any third-party material separately.

Sources:
- https://www.ema.europa.eu/en/documents/herbal-monograph/final-european-union-herbal-monograph-hypericum-perforatum-l-herba-revision-1_en.pdf
- https://www.ema.europa.eu/en/documents/herbal-monograph/final-european-union-herbal-monograph-ginkgo-biloba-l-folium_en.pdf
- https://www.ema.europa.eu/en/documents/herbal-monograph/final-european-union-herbal-monograph-matricaria-recutita-l-flos-first-version_en.pdf

This is partial preparation coverage, not a complete monograph database. Traditional-use rows must not be interpreted as clinical-trial evidence. Plant-name mappings are retained unchecked candidates. `sample.json` remains the original demo/test fixture. Importing the draft does not delete previously imported sample rows; review those separately before using an existing database.
