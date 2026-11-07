#!/bin/sh
set -e
alembic upgrade head
# Never blocks startup; a bad ADMIN_* value is printed to the log.
python -m app.cli seed-admin || true
exec "$@"
