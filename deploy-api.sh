#!/usr/bin/env bash
# deploy-api.sh — simple "pull master + rebuild API container" deploy.
#
# Usage:
#   ./deploy-api.sh
#
# Uses your existing SSH key (~/.ssh/id_ed25519) via ~/.ssh/config — no
# password prompt. Pull master, rebuild the api container, restart it,
# print success or a clear error.

set -euo pipefail

# ── server config (edit these to point at a different droplet) ────────────
REMOTE_HOST="root@168.144.118.157"
APP_DIR="/root/bodhassess-api"
BRANCH="master"

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

# ── plan ──────────────────────────────────────────────────────────────────
echo
printf "  ${B}Host:${N}    %s\n" "$REMOTE_HOST"
printf "  ${B}Dir:${N}     %s (on droplet)\n" "$APP_DIR"
printf "  ${B}Branch:${N}  %s\n" "$BRANCH"
echo

START=$(date +%s)
info "Connecting and deploying…"
echo

# ── run the remote deploy ─────────────────────────────────────────────────
# We don't `set -e` around ssh so we can capture its exit code and report
# a clean error instead of just dying mid-pipeline.
set +e
ssh -o BatchMode=yes "$REMOTE_HOST" \
  APP_DIR="$APP_DIR" BRANCH="$BRANCH" \
  bash -s <<'REMOTE'
set -euo pipefail
: "${APP_DIR:?}"; : "${BRANCH:?}"

[ -d "$APP_DIR" ] || { echo "✗ $APP_DIR not found on droplet" >&2; exit 1; }
cd "$APP_DIR"

if [ ! -d ".git" ]; then
  echo "✗ $APP_DIR is not a git checkout — clone the repo there first" >&2
  exit 1
fi

echo "==> git fetch origin $BRANCH"
git fetch origin "$BRANCH"

echo "==> git reset --hard origin/$BRANCH"
git reset --hard "origin/$BRANCH"

# Production compose lives in deploy/ — that's where api builds + runs.
[ -f "$APP_DIR/deploy/docker-compose.yml" ] || {
  echo "✗ $APP_DIR/deploy/docker-compose.yml not found" >&2
  exit 1
}
cd "$APP_DIR/deploy"

echo "==> docker compose build api"
if ! docker compose build api; then
  echo "✗ docker compose build api failed" >&2
  exit 2
fi

echo "==> docker compose up -d api"
docker compose up -d api

echo "==> docker compose ps api"
docker compose ps api
REMOTE
RC=$?
set -e

# ── report ────────────────────────────────────────────────────────────────
echo
DUR=$(( $(date +%s) - START ))
case "$RC" in
  0)   ok "Deploy succeeded in ${DUR}s" ;;
  2)   die "Build failed — see 'docker compose build api' output above" ;;
  255) die "SSH connection failed — check VPN/network and that the droplet is up" ;;
  *)   die "Deploy failed (exit code $RC) — see output above" ;;
esac
