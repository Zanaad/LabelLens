# LabelLens

**Does the evidence for this herb apply to this product?**

LabelLens helps pharmacists check whether a herbal product's label describes the same kind of
preparation that was studied in EU herbal monographs. A pharmacist photographs the label; LabelLens
reads it, compares it with studied preparations, and returns one of:

- **Matches a studied preparation**
- **Partly matches**
- **Cannot say whether the evidence applies**

It also lists what the label leaves out, with a question to ask for each, and links every claim to
its source.

> Research prediction, not medical advice. This checks the label, not what is inside the product.
> LabelLens gives no dosing or treatment advice.

Built for EthnoHack 2026, Track 4 (digital health and phytotherapy). Status: early
development (scan, review, result, scan history, patient share links, printable summary, expert
review, admin pages and validation work; reference data is a sample).

## What LabelLens does, in plain words

Studies say a herb helped, but only for the exact preparation they tested: a given plant part,
extract type, extract ratio and solvent. A shop product that just says "St John's wort" may be a
different preparation, so the evidence may not apply to it.

1. **Read:** the app copies what the label says (plant, plant part, preparation, ratio, solvent)
   and the pharmacist fixes any mistake.
2. **Compare:** it checks those facts against the studied preparations in the EU monographs.
3. **Answer:** matches, partly matches, or cannot say, plus what the label leaves out and what to
   ask the manufacturer, with a source for every claim.

Reading the label is only the first step. The value is in the comparison.

## Quick start (Docker)

Requirements: Docker with Compose v2.

```bash
cp .env.example .env            # then fill in POSTGRES_PASSWORD and JWT_SECRET
docker compose up --build
```

Generate each secret with `python -c "import secrets; print(secrets.token_urlsafe(32))"`.

- App: http://localhost:8080
- API docs: http://localhost:8000/api/docs

Pharmacists register themselves at `/register`. Expert reviewers and admins are invitation-only;
the first admin is created on the first start from `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PASSWORD`
in `.env` (only if no admin exists yet; remove the password from `.env` afterwards). To add another
admin by hand (it asks for the password):

```bash
docker compose exec backend python -m app.cli create-admin --email you@example.org --name "Your Name"
```

Then sign in as that admin, open **Admin**, and create invitation links for reviewers.

Load the reference table (studied preparations and plant names). Running it again only applies
changes:

```bash
docker compose exec backend python -m app.cli import-reference /data/reference/ema-draft.json
```

## Label reading

By default (`EXTRACTION_PROVIDER=cached`) LabelLens replays saved readings from
`data/extraction_cache/`, so it runs without an API key or cost. In this mode only the three
example labels on the Scan page can be read; their saved readings are hand-written fixtures.

To read new label photos or pasted text with Groq's free API, create a key at
[GroqCloud](https://console.groq.com/keys), then set these in `.env`:

```bash
EXTRACTION_PROVIDER=groq
GROQ_MODEL=qwen/qwen3.8-27b
GROQ_API_KEY=                  # your private GroqCloud key
```

Run `docker compose up -d --build backend`. Keep the key only in `.env`, not `.env.example`.
Groq's free tier has rate limits; check your account's limits before a demo. No paid tier is
selected automatically. Do not scan labels containing patient or personal information.

Every real reading is saved to `data/extraction_cache/` (keyed by input, prompt version and
model), so it can be replayed later with the cached provider and used for validation.

## Email (password reset)

"Forgot password?" emails a one-time link that expires after 60 minutes; admins can also send
one from **Admin → Users**. Without `SMTP_HOST` no email is sent. Put your provider's SMTP details
in `.env` and restart. For Gmail, turn on 2-Step Verification, create an app password under
Google Account → Security → App passwords, and use it as `SMTP_PASSWORD`:

```bash
APP_BASE_URL=https://your-labellens-address   # start of the link inside the email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURITY=starttls                        # or ssl (port 465) or none
SMTP_USERNAME=                                # your Gmail address
SMTP_PASSWORD=                                # the app password, not your normal password
SMTP_FROM="LabelLens <your.address@gmail.com>"
```

Check the spam folder when testing.

## Local development

Backend (Python 3.11+):

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -e '.[dev]'
# needs a PostgreSQL 16 and DATABASE_URL + JWT_SECRET in .env (format in .env.example)
alembic upgrade head
uvicorn app.main:app --reload

# Checks
ruff check . && ruff format --check . && mypy app
pytest                           # SQLite, no services needed
TEST_DATABASE_URL="<postgres url>" pytest   # same tests on PostgreSQL

# Migrations
alembic revision --autogenerate -m "describe change"
alembic upgrade head && alembic check
```

Frontend (Node 22 LTS, see `frontend/.nvmrc`):

```bash
cd frontend
npm ci
npm run dev                      # http://localhost:5173, proxies /api to :8000
npm run lint && npm run typecheck && npm test && npm run build
```

On a machine with an older Node, run the checks in a container:

```bash
docker run --rm -u $(id -u):$(id -g) -e npm_config_cache=/tmp/.npm -v "$PWD":/app -w /app node:22 npm test
```

## Data sources and licences

Reference preparations come from EU herbal monographs published by the European Medicines Agency (Committee on Herbal Medicinal Products,
HMPC) and the studies they cite. The reference table in this repository
(`data/reference/ema-draft.json`) contains **seven source-linked draft rows** (`verified=false`,
transcribed from final EMA monographs); these rows still need checking by a pharmacognosy
mentor. The import refuses unchecked rows without a `TODO(expert)` note, and the result page
says "sample reference data" while any row it used is unchecked.

Code: [MIT licence](LICENSE).

## Validation

Validation measures how often LabelLens is right on labels whose correct answers are known.

1. **Add labels:** as an admin, open **Admin → Validation labels**, upload a label photo or paste
   its text, check every field against the label, set the expected verdict (decided by an expert)
   and mark the label **Final**.
2. **Run:** open **Validation** and click **Run validation**, or from the command line:

   ```bash
   docker compose exec backend python -m app.cli run-validation --out /validation/results
   ```

   A run replays saved readings only (no API calls, no cost) and is stored, with a copy of the
   exact answers it was scored against. `--out` also writes the metrics as JSON to
   `validation/results/`.
3. **Read the results** on the Validation page: fields read correctly (including values the
   reader invented), verdict accuracy end to end and with the correct fields, two baselines (keyword
   matching, and a plain AI prompt without our rules), expert agreement, and every mistake. All
   numbers come with a 95% confidence range.

Labels without a saved reading are left out of the field and end-to-end numbers. With
`EXTRACTION_PROVIDER=groq` and a Groq key, `python -m app.cli fetch-readings` reads them (and the
plain-prompt baseline); the readings are saved for later runs.

Every number used in the pitch must come from a stored run over Final labels.

## Repository layout

```
backend/
  app/
    main.py          FastAPI app factory
    config.py        settings from env vars (see .env.example)
    db.py            database engine and session
    cli.py           admin commands (create-admin, import-reference, run-validation, fetch-readings)
    api/             routes (auth, admin, invitations, scans, share links, reviews, reference,
                     annotations, validation, health), auth dependencies, schemas
    models/          SQLAlchemy models
    services/        password hashing, tokens, rate limiting, audit log, file storage, email,
                     validation runs
    extraction/      label extraction providers
    rules/           rules engine (pure Python, versioned): label fields vs studied preparations
  alembic/           database migrations
  tests/             pytest
frontend/src/
  app/               routes, auth/role guards, navigation per role
  api/               API client and TanStack Query hooks
  components/        layout and UI components
  pages/             one file per screen
  i18n/              UI strings (English)
  theme/             design tokens (CSS variables), theme toggle
data/                reference table (sample.json), saved label readings
validation/results/  JSON copies of validation runs (run-validation --out)
```
