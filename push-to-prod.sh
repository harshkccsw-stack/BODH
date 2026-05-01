#!/usr/bin/env bash
# push-to-prod.sh — ship the project.
#
#   1. git push to origin               → DigitalOcean App Platform rebuilds the frontend
#   2. ssh into the droplet, git pull,  → docker compose rebuilds + restarts the backend
#      rebuild + restart docker compose
#
# Usage:
#   ./push-to-prod.sh                   # interactive prompt (default: staging)
#   ./push-to-prod.sh staging
#   ./push-to-prod.sh production
#   ./push-to-prod.sh -y                # take the default (staging) and skip confirms
#   ./push-to-prod.sh production -y     # production, no confirmation
#   ./push-to-prod.sh --skip-push       # don't touch git, just restart backend
#   ./push-to-prod.sh --skip-backend    # only push to GitHub, no SSH
#   ./push-to-prod.sh -m "msg"          # commit pending changes with this message
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

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# ── arg parsing ───────────────────────────────────────────────────────────
ENV=""
ASSUME_YES=0
SKIP_PUSH=0
SKIP_BACKEND=0
COMMIT_MSG=""

while [ $# -gt 0 ]; do
  case "$1" in
    production|staging)   ENV="$1" ;;
    -y|--yes)             ASSUME_YES=1 ;;
    --skip-push)          SKIP_PUSH=1 ;;
    --skip-backend)       SKIP_BACKEND=1 ;;
    -m|--message)         shift; COMMIT_MSG="${1:-}" ;;
    -m=*|--message=*)     COMMIT_MSG="${1#*=}" ;;
    -h|--help)            sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown arg: $1 (expected: production | staging | -y | --skip-push | --skip-backend | -m MSG)" ;;
  esac
  shift
done

# ── prompt for env (default: staging) ─────────────────────────────────────
if [ -z "$ENV" ]; then
  printf "${B}Push target?${N} [${GRN}staging${N}/production] (default: staging): "
  read -r reply || reply=""
  case "$(lower "${reply:-staging}")" in
    s|stag|staging)        ENV="staging" ;;
    p|prod|production)     ENV="production" ;;
    *) die "invalid choice: '$reply' — expected 'staging' or 'production'" ;;
  esac
fi

# ── load env config ───────────────────────────────────────────────────────
CONFIG="deploy.$ENV.env"
[ -f "$CONFIG" ] || die "$CONFIG missing — copy deploy.example.env to $CONFIG and fill it in"
set -a; # shellcheck disable=SC1090
source "$CONFIG"; set +a

: "${REMOTE_HOST:?REMOTE_HOST not set in $CONFIG (e.g. root@1.2.3.4 — see deploy.example.env)}"
APP_DIR="${APP_DIR:-/opt/bodh}"
GIT_BRANCH="${GIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
HEALTH_URL="${HEALTH_URL:-}"

# ── plan ──────────────────────────────────────────────────────────────────
echo
printf "  ${B}Environment:${N}   $ENV\n"
printf "  ${B}Branch:${N}        $GIT_BRANCH (→ $GIT_REMOTE)\n"
printf "  ${B}Droplet:${N}       $REMOTE_HOST\n"
printf "  ${B}App dir:${N}       $APP_DIR (on droplet)\n"
[ -n "$HEALTH_URL" ] && printf "  ${B}Health URL:${N}    $HEALTH_URL\n"
[ "$SKIP_PUSH" -eq 1 ]    && printf "  ${YEL}skipping git push${N}\n"
[ "$SKIP_BACKEND" -eq 1 ] && printf "  ${YEL}skipping backend restart${N}\n"
echo

# ── confirm ───────────────────────────────────────────────────────────────
if [ "$ASSUME_YES" -eq 0 ]; then
  if [ "$ENV" = "production" ]; then
    printf "${RED}This deploys to PRODUCTION.${N} Type 'yes' to continue: "
    read -r reply || reply=""
    [ "$reply" = "yes" ] || die "aborted"
  else
    printf "Proceed? [Y/n] "
    read -r reply || reply=""
    case "$(lower "${reply:-y}")" in y|yes) : ;; *) die "aborted" ;; esac
  fi
fi

START=$(date +%s)

# ── git: commit pending + push (frontend auto-deploys from GitHub) ────────
if [ "$SKIP_PUSH" -eq 0 ]; then
  if [ -n "$(git status --porcelain)" ]; then
    if [ -n "$COMMIT_MSG" ] || [ "$ASSUME_YES" -eq 1 ]; then
      msg="${COMMIT_MSG:-deploy($ENV): $(date +%Y-%m-%d\ %H:%M)}"
      info "Committing pending changes: $msg"
      git add -A
      git commit -m "$msg"
    else
      warn "uncommitted changes in working tree:"
      git status --short
      printf "Commit them all now? [Y/n] "
      read -r reply || reply=""
      case "$(lower "${reply:-y}")" in
        y|yes)
          msg="deploy($ENV): $(date +%Y-%m-%d\ %H:%M)"
          git add -A
          git commit -m "$msg"
          ok "Committed: $msg"
          ;;
        *) die "aborted — commit/stash manually, or rerun with -m \"msg\" or --skip-push" ;;
      esac
    fi
  fi

  info "Pushing $GIT_BRANCH → $GIT_REMOTE (DigitalOcean App Platform will rebuild the frontend)"
  git push "$GIT_REMOTE" "$GIT_BRANCH"
  ok "GitHub updated"
fi

# ── backend: ssh, pull, rebuild, restart ──────────────────────────────────
if [ "$SKIP_BACKEND" -eq 0 ]; then
  info "Restarting backend on $REMOTE_HOST"

  # Sent over ssh; remote shell expands variables we pass via env.
  ssh "$REMOTE_HOST" \
    APP_DIR="$APP_DIR" GIT_BRANCH="$GIT_BRANCH" GIT_REMOTE="$GIT_REMOTE" \
    bash -s <<'REMOTE'
set -euo pipefail
: "${APP_DIR:?}"; : "${GIT_BRANCH:?}"; : "${GIT_REMOTE:?}"

[ -d "$APP_DIR" ] || { echo "missing $APP_DIR on droplet — run host-do.sh first" >&2; exit 1; }
cd "$APP_DIR"

if [ -d ".git" ]; then
  echo "==> Fetching $GIT_REMOTE/$GIT_BRANCH"
  git fetch "$GIT_REMOTE" "$GIT_BRANCH"
  echo "==> Resetting to $GIT_REMOTE/$GIT_BRANCH"
  git reset --hard "$GIT_REMOTE/$GIT_BRANCH"
else
  echo "!! $APP_DIR is not a git checkout — rebuilding from whatever source is there"
fi

cd "$APP_DIR/deploy"
echo "==> docker compose build api"
docker compose build api
echo "==> docker compose up -d api"
docker compose up -d api
echo "==> docker compose ps api"
docker compose ps api
REMOTE

  ok "Backend redeployed"
fi

# ── health check ──────────────────────────────────────────────────────────
if [ -n "$HEALTH_URL" ] && [ "$SKIP_BACKEND" -eq 0 ]; then
  info "Health check $HEALTH_URL"
  HEALTHY=0
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then HEALTHY=1; break; fi
    sleep 2
  done
  [ "$HEALTHY" = 1 ] && ok "API healthy" || warn "API not healthy yet at $HEALTH_URL — check 'docker compose logs api' on the droplet"
fi

echo
ok "Push to $ENV finished in $(( $(date +%s) - START ))s"
[ "$SKIP_PUSH" -eq 0 ] && printf "  ${B}Frontend:${N}  DigitalOcean App Platform is rebuilding from GitHub now\n"
[ "$SKIP_BACKEND" -eq 0 ] && printf "  ${B}Backend:${N}   redeployed on $REMOTE_HOST\n"
