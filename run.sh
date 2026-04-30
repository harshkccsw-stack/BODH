#!/usr/bin/env bash
# Bring up the whole BodhAssess stack locally:
#   1. docker-compose infra (postgres, redis, minio) from bodhassess-api/
#   2. Go API server on :8080
#   3. Vite dev server on :3000
#
# Usage:
#   ./run.sh            # start everything (foreground, Ctrl-C stops it all)
#   ./run.sh stop       # stop API + web + docker infra
#   ./run.sh infra      # start docker infra only
#   ./run.sh api        # start API only (infra must already be up)
#   ./run.sh web        # start web only
#   ./run.sh logs       # tail all logs

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT/bodhassess-api"
WEB_DIR="$ROOT/bodhassess-app"
LOG_DIR="$ROOT/.run-logs"
API_PID_FILE="$LOG_DIR/api.pid"
WEB_PID_FILE="$LOG_DIR/web.pid"

mkdir -p "$LOG_DIR"

die() { echo "error: $*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "$1 not found in PATH"; }

_docker_prefix() {
  # Use raw docker if the current user can reach the daemon, else sudo.
  if docker info >/dev/null 2>&1; then
    echo ""
  else
    echo "sudo"
  fi
}

compose() {
  local pfx; pfx="$(_docker_prefix)"
  if $pfx docker compose version >/dev/null 2>&1; then
    $pfx docker compose -f "$API_DIR/docker-compose.yml" "$@"
  else
    $pfx docker-compose -f "$API_DIR/docker-compose.yml" "$@"
  fi
}

start_infra() {
  need docker
  echo "==> Starting docker infra (postgres, redis, minio)"
  compose up -d
  echo "    waiting for postgres healthcheck..."
  for _ in $(seq 1 30); do
    if compose ps postgres 2>/dev/null | grep -q healthy; then
      echo "    postgres is healthy"
      return 0
    fi
    sleep 1
  done
  die "postgres did not become healthy in 30s (check: ./run.sh logs)"
}

start_api() {
  need go
  [ -f "$API_DIR/go.mod" ] || die "no go.mod at $API_DIR"

  # Refuse to start if :8080 is already taken (orphan from a previous run, etc.)
  if lsof -nP -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "==> :8080 already in use — killing the listener"
    lsof -nP -iTCP:8080 -sTCP:LISTEN -t 2>/dev/null | xargs -r kill 2>/dev/null || true
    sleep 1
    lsof -nP -iTCP:8080 -sTCP:LISTEN -t 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  fi

  echo "==> Building API binary → $LOG_DIR/api.log"
  ( cd "$API_DIR" && go build -o "$LOG_DIR/bodh-server" ./cmd/server ) || die "go build failed"

  echo "==> Starting Go API on :8080"
  ( cd "$API_DIR" && "$LOG_DIR/bodh-server" > "$LOG_DIR/api.log" 2>&1 ) &
  echo $! > "$API_PID_FILE"
  sleep 1
  if ! kill -0 "$(cat "$API_PID_FILE")" 2>/dev/null; then
    tail -20 "$LOG_DIR/api.log" >&2
    die "API failed to start"
  fi
}

start_web() {
  need npm
  [ -d "$WEB_DIR/node_modules" ] || ( cd "$WEB_DIR" && echo "==> npm install" && npm install --no-audit --no-fund )
  echo "==> Starting Vite dev server on :3000 → $LOG_DIR/web.log"
  ( cd "$WEB_DIR" && npm run dev > "$LOG_DIR/web.log" 2>&1 ) &
  echo $! > "$WEB_PID_FILE"
  sleep 2
  if ! kill -0 "$(cat "$WEB_PID_FILE")" 2>/dev/null; then
    tail -20 "$LOG_DIR/web.log" >&2
    die "web failed to start"
  fi
}

stop_proc() {
  local pidfile="$1" label="$2"
  if [ -f "$pidfile" ]; then
    local pid; pid="$(cat "$pidfile" 2>/dev/null || true)"
    if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
      echo "==> Stopping $label (pid $pid)"
      kill "$pid" 2>/dev/null || true
      for _ in $(seq 1 10); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.3
      done
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
  # Vite spawns a child — kill anything still holding the port
  if [ "$label" = "web" ]; then
    pkill -f "vite.*--port 3000" 2>/dev/null || true
  fi
}

stop_all() {
  stop_proc "$WEB_PID_FILE" web
  stop_proc "$API_PID_FILE" api
  echo "==> Stopping docker infra"
  compose down
}

case "${1:-up}" in
  up|start|"")
    trap 'echo; stop_all; exit 0' INT TERM
    start_infra
    start_api
    start_web
    echo
    echo "==> Stack is up"
    echo "    web:      http://localhost:3000"
    echo "    api:      http://localhost:8080/api/v1"
    echo "    minio:    http://localhost:9001"
    echo "    logs:     $LOG_DIR/{api,web}.log  (or ./run.sh logs)"
    echo "    stop:     Ctrl-C  (or ./run.sh stop)"
    echo
    wait
    ;;
  stop|down)
    stop_all
    ;;
  infra)
    start_infra
    ;;
  api)
    start_api
    ;;
  web)
    start_web
    ;;
  logs)
    tail -F "$LOG_DIR/api.log" "$LOG_DIR/web.log"
    ;;
  *)
    echo "Usage: $0 [up|stop|infra|api|web|logs]" >&2
    exit 1
    ;;
esac
