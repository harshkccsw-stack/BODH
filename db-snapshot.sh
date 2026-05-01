#!/usr/bin/env bash
# Snapshot the local Postgres database (bodh-postgres container) into ./db-snapshots/
#
# Usage:
#   ./db-snapshot.sh                  # create timestamped snapshot
#   ./db-snapshot.sh --name pre-mig   # create snapshot with custom suffix
#   ./db-snapshot.sh list             # list existing snapshots
#   ./db-snapshot.sh restore <file>   # restore from a snapshot file

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SNAP_DIR="$ROOT/db-snapshots"
CONTAINER="bodh-postgres"
DB_USER="bodh"
DB_NAME="bodhassess"

mkdir -p "$SNAP_DIR"

die() { echo "error: $*" >&2; exit 1; }

_docker_prefix() {
  if docker info >/dev/null 2>&1; then
    echo ""
  else
    echo "sudo"
  fi
}

DOCKER="$(_docker_prefix) docker"

ensure_running() {
  command -v docker >/dev/null 2>&1 || die "docker not found in PATH"
  if ! $DOCKER ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    die "container '$CONTAINER' is not running (start with: ./run.sh infra)"
  fi
}

snapshot() {
  ensure_running
  local suffix="${1:-}"
  local ts; ts="$(date +%Y%m%d-%H%M%S)"
  local name="bodhassess-${ts}"
  [ -n "$suffix" ] && name="${name}-${suffix}"
  local outfile="$SNAP_DIR/${name}.sql.gz"

  echo "==> Dumping $DB_NAME from $CONTAINER → $outfile"
  $DOCKER exec -t "$CONTAINER" pg_dump \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --no-owner --no-privileges --clean --if-exists \
    | gzip -9 > "$outfile"

  local size; size="$(du -h "$outfile" | cut -f1)"
  echo "==> Snapshot saved ($size): $outfile"
}

list_snapshots() {
  if [ -z "$(ls -A "$SNAP_DIR" 2>/dev/null)" ]; then
    echo "no snapshots in $SNAP_DIR"
    return 0
  fi
  ls -lh --time=ctime "$SNAP_DIR" | awk 'NR>1 {print $9, "("$5")"}'
}

restore_snapshot() {
  ensure_running
  local file="${1:-}"
  [ -n "$file" ] || die "usage: $0 restore <snapshot-file>"
  [ -f "$file" ] || file="$SNAP_DIR/$file"
  [ -f "$file" ] || die "snapshot not found: $1"

  echo "==> Restoring $file into $DB_NAME"
  read -r -p "    this will OVERWRITE the current database. continue? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || { echo "aborted"; exit 0; }

  if [[ "$file" == *.gz ]]; then
    gunzip -c "$file" | $DOCKER exec -i "$CONTAINER" psql --username="$DB_USER" --dbname="$DB_NAME"
  else
    $DOCKER exec -i "$CONTAINER" psql --username="$DB_USER" --dbname="$DB_NAME" < "$file"
  fi
  echo "==> Restore complete"
}

case "${1:-snapshot}" in
  snapshot|"")
    snapshot ""
    ;;
  --name)
    [ -n "${2:-}" ] || die "usage: $0 --name <suffix>"
    snapshot "$2"
    ;;
  list|ls)
    list_snapshots
    ;;
  restore)
    restore_snapshot "${2:-}"
    ;;
  -h|--help|help)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    echo "Usage: $0 [snapshot|--name <suffix>|list|restore <file>]" >&2
    exit 1
    ;;
esac
