#!/usr/bin/env bash
# Apply any missing SQL migrations in ./migrations/ to the postgres database.
# Idempotent: uses a schema_migrations table to track applied files.
#
# If the DB is already populated but schema_migrations is empty (e.g. the DB
# was created from earlier hand-applied migrations), we baseline by inserting
# all current filenames as "applied" instead of re-running them.
#
# Requires docker-compose.prod.yml services to be up. Run from the directory
# that holds docker-compose.prod.yml.

set -euo pipefail

COMPOSE="${COMPOSE:-docker compose -f docker-compose.prod.yml}"
DB_USER="${DB_USER:?DB_USER required}"
DB_NAME="${DB_NAME:?DB_NAME required}"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD required}"

psql_exec() {
  $COMPOSE exec -T -e PGPASSWORD="$DB_PASSWORD" postgres \
    psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" "$@"
}

echo "==> Ensuring schema_migrations table exists"
psql_exec -c "CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);" >/dev/null

applied=$(psql_exec -At -c "SELECT filename FROM schema_migrations ORDER BY filename;")
tenants_exists=$(psql_exec -At -c "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants';")

# Baseline mode: tables already exist but no migrations recorded → trust the
# existing schema and mark all present files as applied without re-running.
if [ -n "$tenants_exists" ] && [ -z "$applied" ]; then
  echo "==> Baselining existing DB (marking all current migrations as applied)"
  for f in $(ls migrations/0[0-9][0-9]_*.sql | sort); do
    name=$(basename "$f")
    psql_exec -c "INSERT INTO schema_migrations (filename) VALUES ('$name') ON CONFLICT DO NOTHING;" >/dev/null
    echo "    baseline  $name"
  done
  echo "==> Baseline complete"
  exit 0
fi

for f in $(ls migrations/0[0-9][0-9]_*.sql | sort); do
  name=$(basename "$f")
  if echo "$applied" | grep -qx "$name"; then
    echo "    skip  $name"
    continue
  fi
  echo "==> apply $name"
  psql_exec -f "/migrations/$name" >/dev/null
  psql_exec -c "INSERT INTO schema_migrations (filename) VALUES ('$name');" >/dev/null
done

echo "==> Migrations complete"
