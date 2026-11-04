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
development (scan, review fields and result work; reference data is a sample).

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
create the first admin from the command line (it asks for the password):

```bash
docker compose exec backend python -m app.cli create-admin --email you@example.org --name "Your Name"
```

Then sign in as that admin, open **Admin**, and create invitation links for reviewers.

Load the reference table (studied preparations and plant names). Running it again only applies
changes:

```bash
docker compose exec backend python -m app.cli import-reference /data/reference/sample.json
```

## Label reading

By default (`EXTRACTION_PROVIDER=cached`) LabelLens replays saved readings from
`data/extraction_cache/`, so it runs without an API key or cost. In this mode only the three
example labels on the Scan page can be read; their saved readings are hand-written fixtures.

To read real labels with Claude, set these in `.env` and restart:

```bash
EXTRACTION_PROVIDER=claude
EXTRACTION_MODEL=claude-opus-5-5     # or another Claude model, e.g. claude-sonnet-5-5
EXTRACTION_API_KEY=                  # your Anthropic API key
```

Every real reading is saved to `data/extraction_cache/` (keyed by input, prompt version and
model), so it can be replayed later with the cached provider and used for validation.

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
(`data/reference/sample.json`) currently contains **placeholder rows only** (`verified=false`,
values taken from the design prototype); real rows are added and checked by a pharmacognosy
mentor. The import refuses unchecked rows without a `TODO(expert)` note, and the result page
says "sample reference data" while any row it used is unchecked.

Code: [MIT licence](LICENSE).

## Reproducing validation results

The validation harness (`validation/run_validation.py`) is not built yet. It will run the cached
extraction outputs and the rules engine over the annotated labels in `data/labels/` and write
metrics to `validation/results/`, without API keys. Every number we report must come from it.

## Repository layout

```
backend/
  app/
    main.py          FastAPI app factory
    config.py        settings from env vars (see .env.example)
    db.py            database engine and session
    cli.py           admin commands (create-admin, import-reference)
    api/             routes (auth, invitations, scans, health), auth dependencies, schemas
    models/          SQLAlchemy models
    services/        password hashing, tokens, rate limiting, audit log, file storage
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
data/                reference table (sample.json), saved label readings, annotated labels
validation/          validation harness, baselines, results
```
