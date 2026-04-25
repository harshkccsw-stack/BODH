#!/usr/bin/env bash
# Compile API + web locally, push to a remote host, restart.
#
# Usage:
#   ./deploy.sh production
#   ./deploy.sh staging
#   ./deploy.sh production --skip-api      # web only
#   ./deploy.sh production --skip-web      # api only
#   ./deploy.sh production --yes           # skip confirmation prompt
#
# Reads config from deploy.<env>.env (gitignored). See deploy.example.env.

set -euo pipefail
cd "$(dirname "$0")"

# ── colors ────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  B='\033[1m'; CYAN='\033[36m'; YEL='\033[33m'; RED='\033[31m'; GRN='\033[32m'; N='\033[0m'
else
  B=''; CYAN=''; YEL=''; RED=''; GRN=''; N=''
fi
info() { printf "${CYAN}==>${N} %s\n" "$*"; }
ok()   { printf "${GRN}✓${N} %s\n" "$*"; }
warn() { printf "${YEL}!${N} %s\n" "$*"; }
die()  { printf "${RED}✗${N} %s\n" "$*" >&2; exit 1; }

# ── arg parsing ───────────────────────────────────────────────────────────
[ $# -ge 1 ] || die "usage: $0 <production|staging> [--skip-api|--skip-web|--yes]"
ENV="$1"; shift

case "$ENV" in
  production|staging) : ;;
  *) die "first arg must be 'production' or 'staging'" ;;
esac

SKIP_API=0
SKIP_WEB=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --skip-api) SKIP_API=1 ;;
    --skip-web) SKIP_WEB=1 ;;
    --yes|-y)   ASSUME_YES=1 ;;
    *) die "unknown flag: $arg" ;;
  esac
done

# ── load config ───────────────────────────────────────────────────────────
CONFIG="deploy.$ENV.env"
[ -f "$CONFIG" ] || die "$CONFIG missing — copy deploy.example.env and fill it in"
set -a; source "$CONFIG"; set +a

: "${REMOTE_HOST:?REMOTE_HOST not set in $CONFIG (e.g. deploy@api.example.com)}"
: "${API_REMOTE_PATH:?API_REMOTE_PATH not set (e.g. /opt/bodh/bin/server)}"
: "${WEB_REMOTE_PATH:?WEB_REMOTE_PATH not set (e.g. /opt/bodh/web)}"
: "${API_RESTART_CMD:?API_RESTART_CMD not set (e.g. sudo systemctl restart bodh-api)}"
: "${VITE_API_URL:?VITE_API_URL not set (e.g. https://api.example.com/api/v1)}"

HEALTH_URL="${HEALTH_URL:-}"
WEB_URL="${WEB_URL:-}"
MIGRATE_CMD="${MIGRATE_CMD:-}"

# ── confirm ───────────────────────────────────────────────────────────────
echo
printf "  ${B}Environment:${N}    $ENV\n"
printf "  ${B}Remote host:${N}    $REMOTE_HOST\n"
printf "  ${B}API path:${N}       $API_REMOTE_PATH\n"
printf "  ${B}Web path:${N}       $WEB_REMOTE_PATH\n"
printf "  ${B}VITE_API_URL:${N}   $VITE_API_URL\n"
printf "  ${B}Restart cmd:${N}    $API_RESTART_CMD\n"
[ -n "$MIGRATE_CMD" ] && printf "  ${B}Migrate cmd:${N}    $MIGRATE_CMD\n"
[ "$SKIP_API" -eq 1 ] && printf "  ${YEL}skipping API${N}\n"
[ "$SKIP_WEB" -eq 1 ] && printf "  ${YEL}skipping web${N}\n"
echo

if [ "$ASSUME_YES" -eq 0 ]; then
  read -r -p "Proceed? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || die "aborted"
fi

START=$(date +%s)

# ── API: build + upload + restart ─────────────────────────────────────────
if [ "$SKIP_API" -eq 0 ]; then
  info "Building API binary (GOOS=linux GOARCH=amd64)"
  TMP_BIN="$(mktemp -t bodh-server.XXXXXX)"
  ( cd bodhassess-api && \
    GOOS=linux GOARCH=amd64 CGO_ENABLED=0 GOFLAGS=-trimpath \
    go build -ldflags='-s -w' -o "$TMP_BIN" ./cmd/server )
  ok "Built $(du -h "$TMP_BIN" | awk '{print $1}')"

  info "Uploading binary to $REMOTE_HOST:$API_REMOTE_PATH"
  ssh "$REMOTE_HOST" "mkdir -p \"$(dirname "$API_REMOTE_PATH")\""
  rsync -az --progress "$TMP_BIN" "$REMOTE_HOST:$API_REMOTE_PATH.new"
  ssh "$REMOTE_HOST" "chmod +x \"$API_REMOTE_PATH.new\" && \
                     mv \"$API_REMOTE_PATH.new\" \"$API_REMOTE_PATH\""
  rm -f "$TMP_BIN"

  if [ -n "$MIGRATE_CMD" ]; then
    info "Running migrations on remote"
    ssh "$REMOTE_HOST" "$MIGRATE_CMD"
  fi

  info "Restarting API on remote"
  ssh "$REMOTE_HOST" "$API_RESTART_CMD"

  if [ -n "$HEALTH_URL" ]; then
    info "Health check $HEALTH_URL"
    OK=0
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then OK=1; break; fi
      sleep 2
    done
    [ "$OK" -eq 1 ] && ok "API healthy" || warn "API not yet healthy at $HEALTH_URL"
  fi
fi

# ── Web: build + upload ───────────────────────────────────────────────────
if [ "$SKIP_WEB" -eq 0 ]; then
  info "Building web (VITE_API_URL=$VITE_API_URL)"
  ( cd bodhassess-app && \
    [ -d node_modules ] || npm ci --no-audit --no-fund
    VITE_API_URL="$VITE_API_URL" \
    VITE_APP_NAME="${VITE_APP_NAME:-BodhAssess}" \
    VITE_AUTH_STORAGE_KEY="${VITE_AUTH_STORAGE_KEY:-bodhassess.auth.token}" \
    npm run build )
  ok "Built $(du -sh bodhassess-app/dist | awk '{print $1}')"

  info "Uploading dist/ to $REMOTE_HOST:$WEB_REMOTE_PATH"
  ssh "$REMOTE_HOST" "mkdir -p \"$WEB_REMOTE_PATH\""
  rsync -az --delete bodhassess-app/dist/ "$REMOTE_HOST:$WEB_REMOTE_PATH/"

  if [ -n "${WEB_RELOAD_CMD:-}" ]; then
    info "Reloading web server on remote"
    ssh "$REMOTE_HOST" "$WEB_RELOAD_CMD"
  fi

  if [ -n "$WEB_URL" ]; then
    info "Web check $WEB_URL"
    if curl -fsS -I "$WEB_URL" >/dev/null 2>&1; then
      ok "Web reachable"
    else
      warn "Web not reachable yet at $WEB_URL"
    fi
  fi
fi

echo
ok "Deploy to $ENV finished in $(( $(date +%s) - START ))s"
