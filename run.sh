#!/usr/bin/env bash
# Top-level orchestrator for BodhAssess (api + web + mysql).
#
#   ./run.sh dev    -> MySQL in Docker, Spring API + Vite dev server on host
#                      with hot reload (recommended for development)
#   ./run.sh api    -> MySQL in Docker, Spring API on host (no web)
#   ./run.sh app    -> Vite dev server on host only (no API, no MySQL)
#   ./run.sh prod   -> full stack in Docker: mysql + api + web (nginx)
#   ./run.sh stop   -> stop the prod stack (volumes preserved)
#   ./run.sh reset  -> stop and remove the MySQL volume (DESTRUCTIVE)
#   ./run.sh logs   -> tail prod-stack logs
#
# Read environment from a .env file in this directory (see .env.example).
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-dev}"

ROOT="$(pwd)"
API_DIR="$ROOT/bodhassess-api-spring"
WEB_DIR="$ROOT/bodhassess-app"
LOG_DIR="$ROOT/.dev-logs"
API_PID_FILE="$LOG_DIR/api.pid"
WEB_PID_FILE="$LOG_DIR/web.pid"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' not found in PATH" >&2; exit 1; }
}

# Resolve `docker compose` (v2) vs `docker-compose` (v1).
compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "ERROR: neither 'docker compose' nor 'docker-compose' is available." >&2
    exit 1
  fi
}

wait_for_mysql() {
  echo "==> Waiting for MySQL to become healthy..."
  local tries=0
  until compose exec -T mysql mysqladmin ping -h localhost -u root -p"${DB_ROOT_PASSWORD:-rootpw}" --silent >/dev/null 2>&1; do
    tries=$((tries+1))
    if [ "$tries" -gt 60 ]; then
      echo "ERROR: MySQL did not become healthy within 120s." >&2
      compose logs mysql | tail -50 >&2
      exit 1
    fi
    sleep 2
  done
  echo "==> MySQL is healthy."
}

stop_dev_processes() {
  for pidfile in "$API_PID_FILE" "$WEB_PID_FILE"; do
    if [ -f "$pidfile" ]; then
      local pid
      pid="$(cat "$pidfile" 2>/dev/null || true)"
      if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        # Give the process a moment, then force-kill if still alive.
        sleep 1
        kill -9 "$pid" 2>/dev/null || true
      fi
      rm -f "$pidfile"
    fi
  done
}

case "$MODE" in
  dev)
    need docker
    need java
    need npm
    mkdir -p "$LOG_DIR"

    echo "==> Starting MySQL in Docker (port ${DB_PORT:-3306})"
    compose up -d mysql
    wait_for_mysql

    echo "==> Starting Redis in Docker (port ${REDIS_PORT:-6390})"
    compose up -d redis

    if [ ! -d "$WEB_DIR/node_modules" ]; then
      echo "==> Installing frontend dependencies"
      (cd "$WEB_DIR" && npm install --no-audit --no-fund)
    fi

    echo "==> Starting Spring API on http://localhost:${APP_PORT:-4000} (logs: .dev-logs/api.log)"
    (
      cd "$API_DIR"
      SPRING_PROFILES_ACTIVE=dev exec ./mvnw -q spring-boot:run
    ) >"$LOG_DIR/api.log" 2>&1 &
    echo $! >"$API_PID_FILE"

    echo "==> Starting Vite dev server on http://localhost:${WEB_PORT:-3000} (logs: .dev-logs/web.log)"
    (
      cd "$WEB_DIR"
      exec npm run dev
    ) >"$LOG_DIR/web.log" 2>&1 &
    echo $! >"$WEB_PID_FILE"

    cleanup() {
      echo
      echo "==> Stopping dev processes..."
      stop_dev_processes
      echo "==> Stopping MySQL and Redis containers..."
      compose stop mysql redis >/dev/null 2>&1 || true
      exit 0
    }
    trap cleanup INT TERM

    echo
    echo "==================================================================="
    echo "  Web:    http://localhost:${WEB_PORT:-3000}"
    echo "  API:    http://localhost:${APP_PORT:-4000}/api/v1"
    echo "  DB:     localhost:${DB_PORT:-3306}    (user=${DB_USERNAME:-bodh})"
    echo "  Redis:  localhost:${REDIS_PORT:-6390}"
    echo "  Tailing combined logs — press Ctrl-C to stop everything."
    echo "==================================================================="
    echo
    tail -F "$LOG_DIR/api.log" "$LOG_DIR/web.log"
    ;;

  api)
    need docker
    need java
    echo "==> Starting MySQL in Docker (port ${DB_PORT:-3306})"
    compose up -d mysql
    wait_for_mysql

    echo "==> Starting Redis in Docker (port ${REDIS_PORT:-6390})"
    compose up -d redis

    echo "==> Starting Spring API on http://localhost:${APP_PORT:-4000}  (Ctrl+C to stop)"
    cleanup_api() {
      echo
      echo "==> Stopping MySQL and Redis containers..."
      compose stop mysql redis >/dev/null 2>&1 || true
      exit 0
    }
    trap cleanup_api INT TERM

    cd "$API_DIR"
    SPRING_PROFILES_ACTIVE=dev exec ./mvnw spring-boot:run
    ;;

  app)
    need npm
    if [ ! -d "$WEB_DIR/node_modules" ]; then
      echo "==> Installing frontend dependencies"
      (cd "$WEB_DIR" && npm install --no-audit --no-fund)
    fi
    echo "==> Starting Vite dev server on http://localhost:${WEB_PORT:-3000}  (Ctrl+C to stop)"
    echo "    NOTE: API not started — make sure something is listening on ${VITE_API_URL:-http://localhost:4000/api/v1}"
    cd "$WEB_DIR"
    exec npm run dev
    ;;

  prod)
    need docker
    echo "==> Building images and bringing up the full stack"
    compose --profile prod build
    compose --profile prod up -d
    echo "==> Stack started. Tailing logs (Ctrl-C detaches; stack keeps running)..."
    compose --profile prod logs -f
    ;;

  stop)
    need docker
    stop_dev_processes
    compose --profile prod down
    ;;

  reset)
    need docker
    echo "==> Tearing down stack and removing MySQL volume (data will be lost)"
    stop_dev_processes
    compose --profile prod down -v
    ;;

  logs)
    need docker
    compose --profile prod logs -f
    ;;

  *)
    cat >&2 <<USAGE
Usage: $0 [dev|api|app|prod|stop|reset|logs]

  dev    Everything for development: MySQL in Docker, Spring API + Vite on host.
         Web: http://localhost:${WEB_PORT:-3000}   API: http://localhost:${APP_PORT:-4000}
  api    MySQL in Docker + Spring API on host. No frontend.
         API: http://localhost:${APP_PORT:-4000}
  app    Vite dev server on host only. No API, no MySQL.
         Web: http://localhost:${WEB_PORT:-3000}
  prod   Build and run the full stack in Docker (mysql + api + nginx-served web).
  stop   Stop the prod stack and any lingering dev processes.
  reset  Stop and DROP the MySQL volume (DESTRUCTIVE).
  logs   Tail prod-stack logs.

Env (read from .env or shell):
  DB_NAME, DB_USERNAME, DB_PASSWORD, DB_ROOT_PASSWORD, DB_PORT
  REDIS_HOST, REDIS_PORT
  APP_PORT, WEB_PORT
  APP_AUTH_TOKEN_SECRET, APP_AUTH_TOKEN_EXPIRATION_MSEC
  APP_CORS_ALLOWED_ORIGINS, APP_UPLOADS_BASE_URL
  VITE_API_URL, VITE_BASE_PATH, VITE_APP_NAME
USAGE
    exit 1
    ;;
esac
