# LabelLens plan

EthnoHack 2026, Track 4 (digital health and phytotherapy), 2–8 November 2026.

## What we are building

A pharmacist takes a photo of a herbal product's label. LabelLens reads the label, compares it with
the herbal preparations studied in EU monographs, and gives one of three answers:

- **Matches a studied preparation**
- **Partly matches**
- **Cannot say whether the evidence applies**

It only checks what is printed on the label, not what is inside the product. It never says a
product is "safe", never gives dosing advice, and never treats missing information as good news.

## Where we are (6 Nov 2026)

| Step | What it includes | Status |
| --- | --- | --- |
| 0 | Project setup, login, roles, and design | **Done** |
| 1 | Photo or text input, AI label reading, and pharmacist field review | **Done** |
| 2 | Reference table, comparison rules, verdict, missing details, and sources | **Done** |
| 3 | History, patient link, and printable one-page summary | **Done** |
| 4 | Expert review queue, admin tools, validation workflow, and email password reset | **Done** |
| 5 | Source-linked EMA draft rows and live label reading | **Done for the local prototype** |
| 6 | Real-label validation, demo polish, and deployment | **In progress** |

Step 5 is complete as an implementation milestone: the local app can read new photos and pasted
text through Groq, let a pharmacist correct fields, and compare them with source-linked EMA draft
rows. This does **not** mean the extracted fields or the reference transcription have been
independently verified. The result page labels unchecked reference rows as sample data.

### What we use now

- **AI label reading:** GroqCloud's `qwen/qwen3.8-27b` vision model through the backend, with
  `EXTRACTION_PROVIDER=groq` and a private `GROQ_API_KEY` in `.env`. The key is never sent to the
  browser or committed. The free tier has rate limits. Claude remains an optional paid provider;
  cached mode replays saved readings without an API call.
- **Evidence data:** `data/reference/ema-draft.json`, seven source-linked draft preparations for
  Ginkgo, German chamomile, and St John's wort, transcribed from EMA monographs. The older
  `sample.json` is a fixture. Check the active database's rows before making a claim about its
  exact contents; imports upsert and do not remove old rows.
- **Decision path:** the AI extracts label fields; the pharmacist checks and corrects them; the
  deterministic rules compare plant, part, preparation, DER, and solvent with the reference
  rows. The AI does not choose the verdict. Dose and marker are displayed but not compared.
- **Output:** a cautious verdict, field-by-field comparison, source links, missing-detail
  questions, patient link, and browser-printable one-page summary.

### What remains

1. **Audit the draft data ourselves.** Reopen each cited EMA monograph and record who checked each
   row, the date, the passage, and any correction. Keep `verified=false` and the sample warning
   unless a qualified reviewer actually verifies a row. No expert is required to finish the app
   or submit the hackathon prototype; do not claim expert validation we have not obtained.
2. **Test real product photos and record outcomes.** Save the original image/source, the AI's
   fields, pharmacist corrections, and the final verdict. We have already tried real Ginkgo and
   chamomile packages: the Ginkgo result could not resolve the missing DER/solvent, and one
   chamomile reading mistook `25g` for a preparation. A real image and a successful API call are
   not accuracy measurements. Keep fictional examples separate from this test set.
3. **Run validation with honest ground truth.** A team member can transcribe clearly printed
   fields and have a second member cross-check them. For verdict accuracy, record who assigned
   expected answers and their basis; report counts and uncertainty. If there are too few checked
   labels, show examples and limitations instead of an accuracy percentage. Expert review is an
   optional later improvement, not a dependency for the prototype.
4. **Improve the real-photo path.** Groq sometimes returns `json_validate_failed` on a valid
   image; the app currently shows a generic unavailable message. Fix the retry/error handling
   and test small-print labels. Prevent outputs such as the literal word `none` or a value with
   unrelated quoted evidence from being counted as a stated field.
5. **Finish demo and deployment work.** Decide whether to keep fictional example labels clearly
   marked in the app, and deploy with HTTPS, secure production configuration, backups, and a
   smoke test. The current Compose setup is for
   local use. Record the EMA reuse terms before publishing reference data in a public repository.

### Possible later features

- A copyable manufacturer-question message based on the missing-detail checklist.
- A way to turn reviewed corrections into validation-label drafts.
- Assisted monograph transcription with cited passages and human approval before rows become
  checked. This is optional and is not needed for the hackathon prototype.
- A read-only MCP tool over the reference table, if there is time and a real use case.

## How label reading works

There are three modes, chosen with `EXTRACTION_PROVIDER` in `.env`:

- **Demo mode (`cached`, the default).** No AI call and no cost. The app replays saved readings
  from `data/extraction_cache/`. Right now only the three example labels on the Scan page have
  saved readings, so uploading a real photo shows a "demo mode" message.
- **Groq mode (`groq`).** The photo or text is sent to the Groq-hosted Qwen vision model. Set
  `GROQ_API_KEY` and `GROQ_MODEL=qwen/qwen3.8-27b`. It has a limited free tier.
- **Claude mode (`claude`).** The photo is sent to Claude, Anthropic's AI model, which reads the
  label. This needs an **Anthropic API key** (a paid key from console.anthropic.com) in
  `EXTRACTION_API_KEY`. Every reading is saved, so it can be replayed later for free.

The default model is **Claude Opus 5.5** (`claude-opus-5-5`). To use the cheaper Claude Sonnet 5.5,
set `EXTRACTION_MODEL=claude-sonnet-5-5`.

## Decisions and risks to communicate

- **Scope:** a result compares label wording with described preparations; it does not test the
  product, prove efficacy, or give clinical advice.
- **Reference status:** the EMA draft rows have source links but remain unchecked. Their status
  is shown in the UI. Lack of an external expert does not make step 5 unfinished; it limits the
  claim we can make about reference accuracy.
- **AI reading:** small print, glare, and multilingual packaging can produce wrong or invented
  fields. Pharmacist review is part of the workflow, and real-label validation remains step 6.
- **Free API:** Groq's quota and structured-output failures can interrupt a demo. Keep clearly
  marked fictional text examples available and test a real photo before presenting.
- **Publication:** check EMA reuse terms and the active database content before public release.

## Decisions made

### Shared interface refresh

- Refined shared navigation, typography, controls, tables and authentication layouts. Desktop uses a two-row top navigation; mobile uses a compact menu. Existing role permissions remain. Warm neutral surfaces and restrained teal accents use the existing light/dark tokens. No new dependencies.


### Step 5 Groq reading (6 Nov)

- Added a Groq provider for text and JPEG labels using the existing extraction schema and cache.
  The configured local provider is Groq with `qwen/qwen3.8-27b`; the key stays in the backend.
- Live calls succeeded for fictional text, a generated test photo, and real product photos used
  in the UI. These prove the integration works, not that extraction is reliably accurate.
- A real Ginkgo image also triggered Groq `json_validate_failed` with strict structured output;
  this is recorded above as remaining robustness work.

### Step 5 data work (5 Nov)

- Added `data/reference/ema-draft.json`: seven preparations across Hypericum, Ginkgo and Matricaria, transcribed from final EMA monographs with document identifiers and page/section locators. All remain `verified=false`.
- The old `sample.json` remains a test/demo fixture. Use the EMA draft for a new local reference table; the importer upserts and does not remove previous sample rows. Do not combine both datasets in an existing database without reviewing obsolete rows in Admin.
- Corrected the Hypericum source (the old landing URL describes a combination product), and specified Matricaria liquid extract h as DER 1:1 and ethanol 55% V/V.
- Coverage is deliberately partial. Compound solvents, solvent ranges and other preparations need further modelling/review. Marker specifications, route and indication are not compared; matching fields is not full monograph compliance.
- Name mappings remain unchecked candidates. Live extraction and real-photo trials are now in place; independent reference auditing and recorded validation results remain outstanding.

### About page (6 Nov)

- **About** is public and holds the terms of use that register and invitation link to: what the
  app does and never does, terms, what we store and who sees it, sources and licences. The
  footer's "About LabelLens" link now opens it (it used to open Methods).
- TODO(team): the terms and data wording were written by us from what the code does; someone
  should review them before real users sign up, and update them when EMA reuse terms or self-hosted
  fonts land.

### Settings page (6 Nov)

- **Settings** follows the design: Profile (full name editable, email and role read-only),
  Password, Sessions, and Your data (pharmacists only). We kept the organisation
  field, which the design's Settings leaves out, since it is shown on patient links.
- **Changing the password** asks for the current one (wrong answer: `wrong_password`), uses the
  login rate limit and is audited. It signs the account out on every device, this one included,
  like a reset: sessions are cut off by whole seconds, so a cookie issued in the same second would
  also be refused. **Sign out of all devices** works the same way.
- **No Preferences section.** The design's language choice is left out (English only, step 0), and
  theme alone would only repeat the header toggle.
- **Your data:** "Revoke all patient links" and "Delete my scan history" ask for confirmation,
  touch only the user's own data and are audited. The CSV is built in the browser from the same
  list as My scans (newest 1000 scans), so no new endpoint was needed.
- **Permission denied** now matches the design: who you are signed in as, and a way back.

### Step 4 (5 Nov)

- **Always the better option, not the easier one** (agreed). So: validation labels are managed in
  an admin screen, and forgotten passwords are reset by email.
- **Password reset by email.**
  - "Forgot password?" asks for an email and always answers the same way, so nobody can find out
    who has an account.
  - The link works once and expires after 60 minutes; only its hash is stored.
  - Choosing a new password signs the account out on every device.
  - Admins can also send a reset email from the user list.
  - Email is sent over SMTP with settings in `.env`; no new library. We use Gmail with an app
    password; with no `SMTP_HOST` set, no email is sent.
- **Expert review queue.** Experts and admins see the newest verdict of each checked scan,
  without the pharmacist's name or email (as onboarding promises). They choose Agree, Disagree
  (then the right verdict) or Unsure, with an optional reason. A review shows up in the
  pharmacist's activity log.
- **"Differs" is named on expert and admin screens** ("Differs from every studied preparation"),
  so the mentor can see it. Pharmacists and patients still see "Cannot say".
- **Admin users page:** deactivate or reactivate accounts (it takes effect immediately), send a
  reset email, and see the invitations. Admins can't deactivate themselves.
- **Reference table page** for everyone; admins add, edit and delete rows, and every change to a
  studied preparation is kept in a history (who, when, which fields). Rows not yet checked still
  need a `TODO(expert)` note.
- **Validation labels (admin):**
  - Upload a photo or paste label text. The app pre-fills the fields from its own reading when
    there is one; the annotator corrects every field and sets the expected verdict.
  - The expected verdict should come from the expert, not from what LabelLens says, so the editor
    does not show the app's verdict.
  - Only labels marked Final count. The same photo can't be added twice.
- **Validation runs:**
  - Started by an admin on the Validation page, or with `python -m app.cli run-validation`. Both
    run the same code. A run only replays saved readings, so it never costs money.
  - Each run measures: fields read correctly (including "invented" values the label doesn't
    state); verdict right end to end and with the correct fields; two baselines (a keyword
    match, and a plain AI prompt without our rules); and how often experts agree.
  - Every number has a 95% confidence range, and the page warns when fewer than 30 labels count.
  - Each run stores a copy of the exact answers it was scored against, so pitch numbers can be
    traced back.
  - The plain-prompt baseline needs its own saved readings:
    `python -m app.cli fetch-readings` creates them with the configured live API.
  - This replaces the planned `validation/run_validation.py` script: one code path, used by both
    the page and the command line.
- **Charts** use Recharts (agreed), loaded only on the Validation page so other pages stay fast.
  Colours were checked with a colour-blindness validator; every chart has a table with the same
  numbers.

### Step 3 (4 Nov)

- **Compare two products: postponed** (agreed). The design has no Compare screen. The Compare
  buttons and the "Saved comparisons" tile are left out until it is designed.
- **PDF = the browser's "Save as PDF"** (agreed). The summary page is an A4 sheet styled for
  printing; it always prints in the light theme and fits on one page for the example labels.
  No new dependencies.
- **Patient links:**
  - They work like invitations: the token sits after `#` in the link, so it never reaches server
    logs, and only its hash is stored.
  - They expire after 24 hours, 7 days or 30 days, and can be revoked on the scan's detail page.
    The design says "from My scans", but that page has no room for a list of links per scan.
  - A link shows the verdict as it was when the link was made. Checking the scan again later does
    not change what the patient sees; make a new link for that.
  - The patient page shows the product name, the plant and the verdict in plain language. It
    shows nothing else from the scan: no photo, no fields.
- **Patient wording** was written by us, following the design's three examples. TODO(expert): a
  pharmacist on the team should check it (see risk 3).
- **Sources are listed once per document.** Several studied preparations usually cite the same
  monograph; listing it three times looked wrong and pushed the summary onto a second page.
- **Added beyond the design:** a "Delete scan" button on the scan detail page (privacy: users can
  remove a scan and its photo themselves).
- **Left out of My scans:** label thumbnails (they would load every full-size photo). Filtering
  and sorting happen in the browser over your newest 1000 scans.
- **Activity log** comes from the audit log (scanned, corrected, checked, shared, revoked). Expert
  reviews will show up there in step 4.

### Step 2 (3 Nov)

- **How the comparison works.** The label's plant name is looked up in the plant names table
  ("St John's wort" → Hypericum perforatum). Then the plant part, preparation type, extract ratio
  and solvent are compared with every studied preparation of that plant. Each gets match,
  partial, mismatch, missing or not applicable.
- **How the verdict is chosen:**
  - *Matches*: every field fits one studied preparation.
  - *Partly matches*: only one preparation is still possible, nothing contradicts it, but
    something is less specific (e.g. "chamomile" without the species).
  - *Cannot say*: two or more preparations are still possible, because details are missing.
  - *Not yet covered*: the plant isn't in our table.
  - *Differs*: the label contradicts every studied preparation (shown as "Cannot say" for now).
  - Every judgement call in the code is marked `TODO(expert)` for the mentor.
- **Sample reference data** is in `data/reference/sample.json`: 7 preparations and 10 plant names
  for St John's wort, ginkgo and chamomile. The values come from the design prototype's example
  data, not from the monographs. Every row is marked unchecked, and the result page says
  "Sample reference data" until the mentor checks them. The import refuses unchecked rows
  without a `TODO(expert)` note.
- **One common name can mean several plants.** "Chamomile" can be German or Roman chamomile, so
  a small database change lets one name point to several Latin names.
- **All wording lives in the frontend.** The rules engine only returns codes (e.g.
  `several_possible`); the sentences are in `en.ts`, so the existing "safe" test covers them.
- **Left out of the result page for now:**
  - Share link, PDF summary, compare, "Save to history": these come in step 3. Scans are
    already saved automatically.
  - "Quality notes" (published reports on product quality): we have no checked sources for
    them yet.
  - Marker content (e.g. hypericin %) isn't compared, because the reference table has no column
    for it.
- **Each check is saved.** Pressing "Check evidence" stores a new verdict with the rules version,
  so old results stay as they were, even after the rules change.

### Step 1 (3 Nov)

- **AI model:** Claude Opus 5.5 by default (see "How label reading works"). If Claude declines a
  label, it automatically retries with another Claude model. The AI must fill in a fixed form
  (value, status, confidence, quoted label text for each field), so its answers always have the
  same shape.
- **New libraries (approved):** `anthropic` (talks to Claude), `python-multipart` (file uploads),
  `pillow` (image handling).
- **Pasting label text: yes. iPhone HEIC photos: no** (needs another library). The page says "JPG or PNG".
- **Wording changes (approved):** onboarding says "never says whether a product is harmless or
  right for someone" instead of mentioning safety; "medium confidence" no longer says "inferred",
  because the AI must never guess.
- **The AI copies label text exactly.** It does not turn "St John's wort" into the Latin name.
  That lookup happens in step 2.
- **No boxes drawn on the photo.** AI box positions are not reliable enough. Each field shows the
  exact label text it was read from instead.
- **Unreadable label:** nothing is saved. **Not a herbal product:** saved, marked "out of scope".
- **Example labels:** I wrote their saved readings by hand (marked as hand-written in each file).
  Replace them with real readings once we have a key. If the AI instructions change, the saved
  readings no longer match and must be redone.
- **"Supported herbs" list** is left off the Scan page until the table of studied preparations
  exists, so the app does not promise what it can't check yet.
- **Photos:** we keep the full-size photo, turned upright, with location and camera data removed.
  The AI gets a smaller copy (longest side at most 2048 px).

### Step 0

- **Node 22** for the frontend. Node 20 is no longer supported and the current tools need 22.
  If your machine has Node 20, run the checks with `docker run node:22`.
- **Libraries added** (all needed for the agreed stack): backend `uvicorn`, `pydantic-settings`,
  `email-validator`, `psycopg[binary]`, `argon2-cffi`, `pyjwt`, and `httpx` for tests; frontend
  testing and lint tools only. Rate limiting and translations are small home-made versions
  instead of extra libraries.
- **Staying logged in:** a secure cookie that lasts 8 hours. Logging out ends it on that device;
  we can't force-logout someone from elsewhere (fine for a hackathon).
- **Protection against attacks from other websites:** strict cookie settings, JSON-only requests,
  and an explicit list of allowed sites.
- **Rate limit:** 10 login or register attempts per minute per IP address. Kept in memory, so it
  resets when the backend restarts.
- **Invitations:** no email is sent. The admin copies a one-time link, valid 7 days. Pharmacists
  register themselves and can't be invited.
- **First admin** is created from the command line: `python -m app.cli create-admin`.
- **Tests** run on SQLite locally (fast); CI also runs them on PostgreSQL and checks that the
  database migrations match the code.
- **Fonts** load from Google Fonts, like the design. We can host them ourselves later for privacy.
- **Expert and admin menus and icons** are not in the design; we chose ones that fit.
- **English only.** The app is not aimed at one country. All text lives in
  `frontend/src/i18n/en.ts`, so other languages can be added later.

## Design

The approved design is the prototype file `LabelLens prototype.html` that was shared with the
team. It is not in the repo: ask for it if you don't have it, and open it in a browser to see
every screen. The colours from the design are in `frontend/src/theme/tokens.css`.

### Where we changed the design

| Screen | Design says | Why we changed it | What we did |
| --- | --- | --- | --- |
| Onboarding step 1 | "never makes safety claims" | Uses the word "safe" | "never says whether a product is harmless or right for someone" |
| Review fields | "...or inferred from wording" | The AI must never guess | "Read from small or partly obscured text. Please check." |
| Sign in | "Sign in as a sample user" buttons | Skips the real login | Left out. Demo accounts come in step 5 |
| Scan | "JPG, PNG or HEIC" | HEIC needs another library | "JPG or PNG" |
| Onboarding step 3 | Language choice | App is English only | Left out |
| Account menu | Settings icon is a circle with rays | Looked like a sun, not settings | Standard gear icon |
| "Matches" colour | Teal | Verdicts must not be green | Kept: it's teal, not green, and always comes with an icon and text. Say if you want it changed |

Screens the original design mentions but does not draw include accept invitation, forgot password,
settings, about, reference table, validation, methods, compare, expert review queue, and admin.
The current app implements invitation, password reset, reference, validation, methods, expert
review, and admin screens. Compare remains postponed; About and Settings need a final content pass.
