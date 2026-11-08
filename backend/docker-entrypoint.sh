#!/bin/sh
set -e
alembic upgrade head
# Seeding never blocks startup; problems are printed to the log.
python -m app.cli seed-admin || true
python -m app.cli seed-reference /data/reference/ema-draft.json || true
exec "$@"
