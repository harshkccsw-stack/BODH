#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-dev}"

# ---- helpers ----
need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: '$1' is required but not installed." >&2
    exit 1
  fi
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
      echo "ERROR: MySQL did not become healthy within 60 attempts." >&2
      compose logs mysql | tail -50 >&2
      exit 1
    fi
    sleep 2
  done
  echo "==> MySQL is healthy."
}

# ---- modes ----
case "$MODE" in
  dev)
    need docker
    echo "==> Dev mode: MySQL in Docker, Spring app on host with hot reload"
    compose up -d mysql
    wait_for_mysql
    echo "==> Starting Spring app on http://localhost:4000  (Ctrl+C to stop)"
    SPRING_PROFILES_ACTIVE=dev exec ./mvnw spring-boot:run
    ;;

  prod)
    need docker
    echo "==> Prod mode: building app image and bringing up the full stack"
    compose --profile prod build app
    compose --profile prod up -d
    echo "==> Stack started. Tailing logs (Ctrl+C to detach; the stack keeps running)..."
    compose --profile prod logs -f
    ;;

  stop)
    compose --profile prod down
    ;;

  reset)
    echo "==> Tearing down stack and removing MySQL volume (data will be lost)"
    compose --profile prod down -v
    ;;

  logs)
    compose --profile prod logs -f
    ;;

  *)
    cat >&2 <<USAGE
Usage: $0 [dev|prod|stop|reset|logs]

  dev    Start MySQL in Docker, run Spring app on the host (mvn spring-boot:run).
         App: http://localhost:4000   MySQL: localhost:3306 (user: bodh / pw: bodh)
  prod   Build the app image and run the full stack (MySQL + app) in Docker.
  stop   Stop the prod stack (keeps the MySQL volume).
  reset  Stop the prod stack AND drop the MySQL volume (DESTRUCTIVE).
  logs   Tail logs from the prod stack.

Environment overrides (read from shell or .env):
  DB_NAME, DB_USERNAME, DB_PASSWORD, DB_ROOT_PASSWORD, DB_PORT
  APP_PORT, APP_AUTH_TOKEN_SECRET, APP_CORS_ALLOWED_ORIGINS, APP_UPLOADS_BASE_URL
USAGE
    exit 1
    ;;
esac
