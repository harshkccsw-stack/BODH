#!/usr/bin/env bash
# Boot the full BodhAssess dev stack:
#   1. Postgres / Redis / MinIO via docker compose (bodhassess-api/docker-compose.yml)
#   2. Go API server (bodhassess-api/cmd/server)  → http://localhost:8080
#   3. Next.js dev server (bodhassess-app)        → http://localhost:3000
#
# Logs stream into ./logs/. Ctrl+C stops the API + Next.js cleanly; the
# docker containers are left running so the next `bash run.sh` is fast.
# Pass `--down` to also stop the containers.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$ROOT/bodhassess-api"
APP_DIR="$ROOT/bodhassess-app"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

# If the current user can't reach the docker socket, fall back to sudo.
# (We expect passwordless sudo on this dev box; prompts will surface here.)
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
    echo "[run.sh] Using 'sudo docker' (current user lacks docker socket access)."
  else
    echo "[run.sh] ERROR: cannot access docker daemon. Either add your user to the 'docker' group ('sudo usermod -aG docker $USER' then re-login) or grant passwordless sudo for docker." >&2
    exit 1
  fi
fi

# Detect docker compose command (v2 plugin vs legacy docker-compose)
if $DOCKER compose version >/dev/null 2>&1; then
  DC="$DOCKER compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
  if [[ "$DOCKER" == "sudo docker" ]]; then DC="sudo docker-compose"; fi
else
  echo "[run.sh] ERROR: docker compose is not installed." >&2
  exit 1
fi

if [[ "${1:-}" == "--down" ]]; then
  echo "[run.sh] Stopping docker compose services…"
  (cd "$API_DIR" && $DC down)
  exit 0
fi

API_PID=""
APP_PID=""

cleanup() {
  echo
  echo "[run.sh] Shutting down API + Next.js…"
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "$APP_PID" ]] && kill "$APP_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "[run.sh] Done. (Docker containers left running — use 'bash run.sh --down' to stop them.)"
}
trap cleanup EXIT INT TERM

# 1. Bring up containers (idempotent — `up -d` is a no-op if already running)
echo "[run.sh] Starting Postgres / Redis / MinIO…"
(cd "$API_DIR" && $DC up -d)

# Wait for Postgres to be ready (compose has a healthcheck — poll it briefly)
echo -n "[run.sh] Waiting for Postgres to be ready"
for i in {1..30}; do
  if $DOCKER exec bodh-postgres pg_isready -U bodh -d bodhassess >/dev/null 2>&1; then
    echo " — ready."
    break
  fi
  echo -n "."
  sleep 1
done

# 2. Apply any new migrations beyond 001_init.sql (compose only auto-runs 001).
#    Run them in numeric order, skipping the init file (already applied).
echo "[run.sh] Applying migrations 002+…"
for f in $(ls "$API_DIR/migrations" | sort); do
  if [[ "$f" == "001_init.sql" ]]; then continue; fi
  if [[ "$f" != *.sql ]]; then continue; fi
  $DOCKER exec -i bodh-postgres psql -U bodh -d bodhassess -v ON_ERROR_STOP=0 < "$API_DIR/migrations/$f" >/dev/null 2>&1 || true
done

# 3. Start the Go API
echo "[run.sh] Starting Go API → http://localhost:8080  (logs: $LOG_DIR/api.log)"
(cd "$API_DIR" && go run ./cmd/server) >"$LOG_DIR/api.log" 2>&1 &
API_PID=$!

# 4. Install + start Next.js dev server
if [[ ! -d "$APP_DIR/node_modules" ]]; then
  echo "[run.sh] Installing Next.js dependencies (first run)…"
  (cd "$APP_DIR" && npm install)
fi

echo "[run.sh] Starting Next.js → http://localhost:3000  (logs: $LOG_DIR/app.log)"
(cd "$APP_DIR" && npm run dev) >"$LOG_DIR/app.log" 2>&1 &
APP_PID=$!

echo
echo "[run.sh] All services started. PIDs: api=$API_PID app=$APP_PID"
echo "[run.sh] Tail logs in another terminal:"
echo "          tail -f $LOG_DIR/api.log"
echo "          tail -f $LOG_DIR/app.log"
echo "[run.sh] Press Ctrl+C to stop the API and Next.js."

# Wait until either child exits, then cleanup runs via trap
wait -n "$API_PID" "$APP_PID" || true
