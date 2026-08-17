#!/usr/bin/env bash
#
# BodhAssess production database backup.
#
#   mysqldump (inside the MySQL container) -> gzip -> DigitalOcean Spaces
#
# Installed on the production droplet as /usr/local/bin/bodh-db-backup.sh and
# fired nightly by /etc/cron.d/bodh-db-backup. Configuration lives in
# /etc/bodh-backup.env; the Spaces credentials live in the s3cmd config file
# that env file points at. Nothing secret belongs in this script.
#
# Safety property worth preserving: local and remote pruning happen ONLY after
# a dump has been verified AND uploaded. A run of failed backups therefore
# degrades to *stale* backups, never to *no* backups.

set -euo pipefail

CONFIG_FILE="${BODH_BACKUP_CONFIG:-/etc/bodh-backup.env}"
LOCK_FILE="/var/lock/bodh-db-backup.lock"

# ---------------------------------------------------------------- logging ---
# Everything the script says goes to stdout AND the log file, so a manual run
# is readable and the cron run is recorded.
log()  { printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$1" "${*:2}"; }
info() { log INFO "$@"; }
fail() { log FAILED "$@"; exit 1; }

# --------------------------------------------------------------- one only ---
# Re-exec under flock so a slow dump can never overlap the next night's run.
if [[ "${BODH_BACKUP_LOCKED:-}" != "1" ]]; then
  export BODH_BACKUP_LOCKED=1
  exec flock -n "$LOCK_FILE" "$0" "$@"
fi

# ------------------------------------------------------------------ config ---
[[ -r "$CONFIG_FILE" ]] || fail "config file $CONFIG_FILE is missing or unreadable"
# shellcheck disable=SC1090
source "$CONFIG_FILE"

: "${DB_CONTAINER:?DB_CONTAINER not set in $CONFIG_FILE}"
: "${BACKUP_DIR:?BACKUP_DIR not set in $CONFIG_FILE}"
: "${SPACES_BUCKET:?SPACES_BUCKET not set in $CONFIG_FILE}"
: "${SPACES_PREFIX:?SPACES_PREFIX not set in $CONFIG_FILE}"
: "${S3CMD_CONFIG:?S3CMD_CONFIG not set in $CONFIG_FILE}"
: "${RETENTION_DAYS:?RETENTION_DAYS not set in $CONFIG_FILE}"
: "${LOG_FILE:?LOG_FILE not set in $CONFIG_FILE}"

# Backup timestamps and the cron schedule must agree on a timezone, otherwise a
# midnight run can stamp yesterday's date. CRON_TZ in the cron.d file matches.
export TZ="${BACKUP_TZ:-Asia/Kolkata}"

# Now that LOG_FILE is known, tee everything into it.
exec > >(tee -a "$LOG_FILE") 2>&1

S3="s3cmd -c $S3CMD_CONFIG"
DEST="s3://${SPACES_BUCKET}/${SPACES_PREFIX%/}"

trap 'rc=$?; [[ $rc -eq 0 ]] || log FAILED "run aborted (exit $rc)"' EXIT

info "=== backup run starting (container=$DB_CONTAINER bucket=$SPACES_BUCKET) ==="

# ------------------------------------------------------------ preflight ---
command -v docker >/dev/null 2>&1 || fail "docker not found in PATH"
command -v s3cmd  >/dev/null 2>&1 || fail "s3cmd not found in PATH (apt-get install s3cmd)"
[[ -r "$S3CMD_CONFIG" ]] || fail "s3cmd config $S3CMD_CONFIG is missing or unreadable"

docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null | grep -qx true \
  || fail "container $DB_CONTAINER is not running"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
BASENAME="bodhpsychometric-${STAMP}.sql.gz"
FINAL="${BACKUP_DIR%/}/${BASENAME}"
PART="${FINAL}.part"

# ------------------------------------------------------------------ dump ---
# mysqldump runs INSIDE the container and expands the container's own env vars,
# so neither the root password nor the database name is written down here and
# neither shows up in `ps` on the host.
#
#   --single-transaction  consistent snapshot without locking the app out (InnoDB)
#   --hex-blob            Organization.logoBase64 is a LONGTEXT data URL
#   --routines/--triggers/--events  ship the whole schema, not just tables
#   --no-tablespaces      avoids needing the PROCESS privilege
#   --set-gtid-purged=OFF the dump is a restore source, not a replica seed
info "dumping database from $DB_CONTAINER ..."
docker exec "$DB_CONTAINER" sh -c '
    exec mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" \
      --single-transaction --quick \
      --routines --triggers --events \
      --hex-blob --no-tablespaces --set-gtid-purged=OFF \
      --default-character-set=utf8mb4 \
      "$MYSQL_DATABASE"' 2> >(grep -v '\[Warning\] Using a password' >&2) \
  | gzip -9 > "$PART" \
  || fail "mysqldump/gzip pipeline failed"

# ---------------------------------------------------------------- verify ---
# A dump that was cut short still exits 0 in some failure modes, so check the
# size and the trailer mysqldump writes as its very last line.
SIZE="$(stat -c %s "$PART")"
[[ "$SIZE" -gt 1024 ]] || { rm -f "$PART"; fail "dump is implausibly small (${SIZE} bytes)"; }
if ! gzip -cd "$PART" | tail -c 512 | grep -q 'Dump completed'; then
  rm -f "$PART"
  fail "dump is truncated (no 'Dump completed' trailer)"
fi
mv "$PART" "$FINAL"
chmod 600 "$FINAL"
info "dump ok: $FINAL ($(numfmt --to=iec --suffix=B "$SIZE" 2>/dev/null || echo "${SIZE} bytes"))"

# ---------------------------------------------------------------- upload ---
info "uploading to ${DEST}/${BASENAME} ..."
$S3 --no-progress put "$FINAL" "${DEST}/${BASENAME}" >/dev/null \
  || fail "upload to ${DEST}/${BASENAME} failed"
$S3 info "${DEST}/${BASENAME}" >/dev/null 2>&1 \
  || fail "uploaded object ${DEST}/${BASENAME} is not readable back"
info "upload ok"

# ----------------------------------------------------------------- prune ---
# Reached only on a verified, uploaded backup.
CUTOFF="$(date -d "${RETENTION_DAYS} days ago" '+%Y-%m-%d')"
info "pruning backups older than ${RETENTION_DAYS} days (cutoff ${CUTOFF}) ..."

# Local: age on disk is trustworthy here because the files are written once.
# -mtime +$((RETENTION_DAYS - 1)) keeps today's plus the previous RETENTION_DAYS-1.
LOCAL_GONE=0
while IFS= read -r -d '' old; do
  rm -f -- "$old" && LOCAL_GONE=$((LOCAL_GONE + 1))
  info "  local delete $(basename "$old")"
done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'bodhpsychometric-*.sql.gz' \
           -mtime "+$((RETENTION_DAYS - 1))" -print0)

# Remote: compare the date embedded in the KEY, not s3cmd's own timestamp
# column — the key was stamped in $TZ, the column is UTC, and near midnight
# those disagree by a day.
REMOTE_GONE=0
while read -r key; do
  [[ -n "$key" ]] || continue
  name="${key##*/}"
  keydate="${name#bodhpsychometric-}"
  keydate="${keydate:0:10}"
  [[ "$keydate" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue   # skip anything unrecognised
  if [[ "$keydate" < "$CUTOFF" ]]; then
    $S3 del "$key" >/dev/null && REMOTE_GONE=$((REMOTE_GONE + 1))
    info "  remote delete $name"
  fi
done < <($S3 ls "${DEST}/" | awk '{print $NF}' | grep -E '/bodhpsychometric-.*\.sql\.gz$' || true)

info "pruned ${LOCAL_GONE} local / ${REMOTE_GONE} remote"
info "=== backup run finished ok: ${BASENAME} ==="
