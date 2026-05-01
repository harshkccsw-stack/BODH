#!/usr/bin/env bash
# bodh.sh — one script for the whole BodhAssess workflow.
#
# Replaces:  run.sh  build.sh  push-to-prod.sh
#
# Usage:
#   ./bodh.sh                 # interactive menu
#   ./bodh.sh run             # local dev stack (docker infra + Go API + Vite)
#   ./bodh.sh stop            # stop local dev stack
#   ./bodh.sh logs            # tail local dev logs
#   ./bodh.sh build [args]    # compile API + web; optionally commit/push
#   ./bodh.sh push [args]     # deploy: git push + restart backend on droplet
#   ./bodh.sh -h | help       # this help
#
# Subcommand-specific flags:
#   build "msg" | --no-commit | --push
#   push  staging|production | -y | --skip-push | --skip-backend | -m "msg"

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

API_DIR="$ROOT/bodhassess-api"
WEB_DIR="$ROOT/bodhassess-app"
BUILD_DIR="$ROOT/.build"
LOG_DIR="$ROOT/.run-logs"
API_PID_FILE="$LOG_DIR/api.pid"
WEB_PID_FILE="$LOG_DIR/web.pid"

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
need() { command -v "$1" >/dev/null 2>&1 || die "$1 not found in PATH"; }
lower(){ printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

show_help() {
  cat <<HELP
${B}bodh.sh${N} — one script for the whole BodhAssess workflow.

${B}USAGE${N}
  ./bodh.sh                       interactive menu
  ./bodh.sh <command> [args]      run a command directly
  ./bodh.sh -h | --help | help    this help
  ./bodh.sh <command> --help      help for a single command

${B}COMMANDS${N}
  ${CYAN}run${N} [up|infra|api|web|stop|logs]
      Start the local dev stack (docker infra + Go API on :8080 + Vite on :3000).
      Sub-modes:
        up       (default) start everything; Ctrl-C stops it all
        infra    docker infra only (postgres, redis, minio)
        api      Go API only (infra must already be up)
        web      Vite dev server only
        stop     stop everything
        logs     tail api.log + web.log

  ${CYAN}stop${N}                          alias for: run stop
  ${CYAN}logs${N}                          alias for: run logs

  ${CYAN}build${N} ["msg"] [--no-commit] [--push]
      Compile API (Go) + web (Vite, prod URLs baked in), commit, optionally push.
      Examples:
        ./bodh.sh build
        ./bodh.sh build "feat: x" --push
        ./bodh.sh build --no-commit          # build only, leave git alone

  ${CYAN}push${N} [staging|production] [-y] [--skip-push] [--skip-backend] [-m "msg"]
      Deploy. Prompts for env (default ${GRN}staging${N}) when not given.
        1. git push <branch> → origin           (DO App Platform rebuilds frontend)
        2. rsync source → \$REMOTE_HOST:\$APP_DIR  (backend source on droplet)
        3. ssh → docker compose build + up -d   (backend rebuild + restart)
        4. curl \$HEALTH_URL                     (optional smoke test)
      Flags:
        -y, --yes        skip confirmations (production still safe — see below)
        --skip-push      don't touch git (backend redeploy only)
        --skip-backend   only push to GitHub, no SSH
        -m, --message    commit message for any pending changes
      Production requires typing 'yes' even with -y? ${YEL}No${N} — -y skips it. Be careful.

${B}CONFIG (deploy.<env>.env)${N}
  Each environment has its own gitignored config file (deploy.staging.env,
  deploy.production.env). Required keys:
    REMOTE_HOST=root@1.2.3.4              SSH target for the droplet
    APP_DIR=/opt/bodh                     where source lives on the droplet
    GIT_BRANCH=master                     branch DO App Platform watches
  Optional:
    GIT_REMOTE=origin                     defaults to 'origin'
    HEALTH_URL=https://api.example.com/api/v1/health
  See ${B}deploy.example.env${N} for a template.

${B}EXAMPLES${N}
  ./bodh.sh                              # menu
  ./bodh.sh run                          # local dev
  ./bodh.sh push                         # interactive deploy (defaults to staging)
  ./bodh.sh push staging -y              # deploy staging non-interactively
  ./bodh.sh push production              # type 'yes' at prompt
  ./bodh.sh push --skip-push             # restart backend only
  ./bodh.sh push --skip-backend          # frontend only (just git push)
HELP
}

show_run_help() {
  cat <<HELP
${B}run${N} — local dev stack

  ./bodh.sh run [up|infra|api|web|stop|logs]

  up       (default) docker infra + Go API + Vite (Ctrl-C stops everything)
  infra    only docker (postgres, redis, minio)
  api      only the Go API on :8080
  web      only the Vite dev server on :3000
  stop     stop the local stack
  logs     tail api.log + web.log
HELP
}

show_build_help() {
  cat <<HELP
${B}build${N} — compile API + web, optionally commit & push

  ./bodh.sh build ["msg"] [--no-commit] [--push]

  "msg"          commit message (default: "build: compile API and web (DATE)")
  --no-commit    build only, don't touch git
  --push         after committing, also push to origin
HELP
}

show_push_help() {
  cat <<HELP
${B}push${N} — deploy frontend (via git) + backend (via rsync + ssh)

  ./bodh.sh push [staging|production] [-y] [--skip-push] [--skip-backend] [-m "msg"]

  staging|production   target env (prompted if omitted; default: staging)
  -y, --yes            skip confirmation prompts
  --skip-push          don't run git push (backend redeploy only)
  --skip-backend       don't ssh/rsync to droplet (frontend git push only)
  -m, --message        auto-commit pending changes with this message

  Reads deploy.<env>.env for: REMOTE_HOST, APP_DIR, GIT_BRANCH, GIT_REMOTE,
  HEALTH_URL. See deploy.example.env for the template.
HELP
}

# ════════════════════════════════════════════════════════════════════════
# RUN — local dev stack
# ════════════════════════════════════════════════════════════════════════
compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose -f "$API_DIR/docker-compose.yml" "$@"
  else
    docker-compose -f "$API_DIR/docker-compose.yml" "$@"
  fi
}

start_infra() {
  need docker
  mkdir -p "$LOG_DIR"
  info "Starting docker infra (postgres, redis, minio)"
  compose up -d
  printf "    waiting for postgres healthcheck"
  for _ in $(seq 1 30); do
    if compose ps postgres 2>/dev/null | grep -q healthy; then
      echo " — healthy"
      return 0
    fi
    printf "."; sleep 1
  done
  echo
  die "postgres did not become healthy in 30s (check: ./bodh.sh logs)"
}

start_api() {
  need go
  [ -f "$API_DIR/go.mod" ] || die "no go.mod at $API_DIR"
  mkdir -p "$LOG_DIR"

  if lsof -nP -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1; then
    info ":8080 already in use — killing the listener"
    lsof -nP -iTCP:8080 -sTCP:LISTEN -t 2>/dev/null | xargs -r kill 2>/dev/null || true
    sleep 1
    lsof -nP -iTCP:8080 -sTCP:LISTEN -t 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  fi

  info "Building API binary → $LOG_DIR/api.log"
  ( cd "$API_DIR" && go build -o "$LOG_DIR/bodh-server" ./cmd/server ) || die "go build failed"

  info "Starting Go API on :8080"
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
  mkdir -p "$LOG_DIR"
  [ -d "$WEB_DIR/node_modules" ] || ( cd "$WEB_DIR" && info "npm install" && npm install --no-audit --no-fund )
  info "Starting Vite dev server on :3000 → $LOG_DIR/web.log"
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
      info "Stopping $label (pid $pid)"
      kill "$pid" 2>/dev/null || true
      for _ in $(seq 1 10); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.3
      done
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
  [ "$label" = "web" ] && pkill -f "vite.*--port 3000" 2>/dev/null || true
}

cmd_run() {
  local sub="${1:-up}"
  case "$sub" in
    up|start|"")
      trap 'echo; cmd_run stop; exit 0' INT TERM
      start_infra
      start_api
      start_web
      echo
      ok "Stack is up"
      echo "    web:     http://localhost:3000"
      echo "    api:     http://localhost:8080/api/v1"
      echo "    minio:   http://localhost:9001"
      echo "    logs:    $LOG_DIR/{api,web}.log  (or ./bodh.sh logs)"
      echo "    stop:    Ctrl-C  (or ./bodh.sh stop)"
      echo
      wait
      ;;
    stop|down)
      stop_proc "$WEB_PID_FILE" web
      stop_proc "$API_PID_FILE" api
      info "Stopping docker infra"
      compose down
      ;;
    infra) start_infra ;;
    api)   start_api ;;
    web)   start_web ;;
    logs)  tail -F "$LOG_DIR/api.log" "$LOG_DIR/web.log" ;;
    -h|--help|help) show_run_help ;;
    *) die "run: unknown sub-command '$sub' (expected up|stop|infra|api|web|logs|--help)" ;;
  esac
}

# ════════════════════════════════════════════════════════════════════════
# BUILD — compile API + web, optionally commit/push
# ════════════════════════════════════════════════════════════════════════
build_api() {
  need go
  [ -f "$API_DIR/go.mod" ] || die "no go.mod at $API_DIR"
  mkdir -p "$BUILD_DIR"
  info "Building Go API"
  ( cd "$API_DIR" && go build -o "$BUILD_DIR/bodh-server" ./cmd/server )
  ok "$BUILD_DIR/bodh-server"
}

build_web() {
  need npm
  [ -f "$WEB_DIR/package.json" ] || die "no package.json at $WEB_DIR"
  if [ ! -d "$WEB_DIR/node_modules" ]; then
    info "npm install"
    ( cd "$WEB_DIR" && npm install --no-audit --no-fund )
  fi
  info "Building web app (production URLs baked in)"
  ( cd "$WEB_DIR" && \
    VITE_API_URL="${VITE_API_URL:-https://api.bodh.biz/api/v1}" \
    VITE_BASE_PATH="${VITE_BASE_PATH:-/dashboard}" \
    npm run build )
}

cmd_build() {
  local DO_COMMIT=1 DO_PUSH=0 MESSAGE=""
  for arg in "$@"; do
    case "$arg" in
      --no-commit) DO_COMMIT=0 ;;
      --push)      DO_PUSH=1 ;;
      -h|--help)   show_build_help; return 0 ;;
      *) MESSAGE="$arg" ;;
    esac
  done

  build_api
  build_web

  if [ "$DO_COMMIT" -eq 1 ]; then
    need git; cd "$ROOT"
    if [ -z "$(git status --porcelain)" ]; then
      info "No changes to commit"
    else
      local msg="${MESSAGE:-build: compile API and web ($(date +%Y-%m-%d\ %H:%M))}"
      info "Committing: $msg"
      git add -A
      git commit -m "$msg"
    fi
  fi

  if [ "$DO_PUSH" -eq 1 ]; then
    need git; cd "$ROOT"
    local branch; branch="$(git rev-parse --abbrev-ref HEAD)"
    info "Pushing $branch to origin"
    git push origin "$branch"
  fi

  ok "Build done"
}

# ════════════════════════════════════════════════════════════════════════
# PUSH — git push (frontend) + ssh-restart docker compose backend
# ════════════════════════════════════════════════════════════════════════
cmd_push() {
  cd "$ROOT"

  local ENV="" ASSUME_YES=0 SKIP_PUSH=0 SKIP_BACKEND=0 COMMIT_MSG=""
  while [ $# -gt 0 ]; do
    case "$1" in
      production|staging) ENV="$1" ;;
      -y|--yes)           ASSUME_YES=1 ;;
      --skip-push)        SKIP_PUSH=1 ;;
      --skip-backend)     SKIP_BACKEND=1 ;;
      -m|--message)       shift; COMMIT_MSG="${1:-}" ;;
      -m=*|--message=*)   COMMIT_MSG="${1#*=}" ;;
      -h|--help)        show_push_help; return 0 ;;
      *) die "push: unknown arg '$1'" ;;
    esac
    shift
  done

  if [ -z "$ENV" ]; then
    printf "${B}Push target?${N} [${GRN}staging${N}/production] (default: staging): "
    read -r reply || reply=""
    case "$(lower "${reply:-staging}")" in
      s|stag|staging)     ENV="staging" ;;
      p|prod|production)  ENV="production" ;;
      *) die "invalid choice: '$reply' — expected 'staging' or 'production'" ;;
    esac
  fi

  local CONFIG="deploy.$ENV.env"
  [ -f "$CONFIG" ] || die "$CONFIG missing — copy deploy.example.env to $CONFIG and fill it in"
  set -a; # shellcheck disable=SC1090
  source "$CONFIG"; set +a

  : "${REMOTE_HOST:?REMOTE_HOST not set in $CONFIG (e.g. root@1.2.3.4)}"
  local APP_DIR="${APP_DIR:-/opt/bodh}"
  local GIT_BRANCH="${GIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
  local GIT_REMOTE="${GIT_REMOTE:-origin}"
  local HEALTH_URL="${HEALTH_URL:-}"

  echo
  printf "  ${B}Environment:${N}   $ENV\n"
  printf "  ${B}Frontend:${N}      git push $GIT_BRANCH → $GIT_REMOTE  (DO App Platform auto-rebuilds)\n"
  printf "  ${B}Backend:${N}       rsync source → $REMOTE_HOST:$APP_DIR  +  docker compose restart\n"
  [ -n "$HEALTH_URL" ]      && printf "  ${B}Health URL:${N}    $HEALTH_URL\n"
  [ "$SKIP_PUSH" -eq 1 ]    && printf "  ${YEL}skipping git push (frontend will not update)${N}\n"
  [ "$SKIP_BACKEND" -eq 1 ] && printf "  ${YEL}skipping backend rsync/restart${N}\n"
  echo

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

  local START; START=$(date +%s)

  if [ "$SKIP_PUSH" -eq 0 ]; then
    if [ -n "$(git status --porcelain)" ]; then
      if [ -n "$COMMIT_MSG" ] || [ "$ASSUME_YES" -eq 1 ]; then
        local msg="${COMMIT_MSG:-deploy($ENV): $(date +%Y-%m-%d\ %H:%M)}"
        info "Committing pending changes: $msg"
        git add -A
        git commit -m "$msg"
      else
        warn "uncommitted changes:"
        git status --short
        printf "Commit them all now? [Y/n] "
        read -r reply || reply=""
        case "$(lower "${reply:-y}")" in
          y|yes)
            local msg="deploy($ENV): $(date +%Y-%m-%d\ %H:%M)"
            git add -A
            git commit -m "$msg"
            ok "Committed: $msg"
            ;;
          *) die "aborted — commit/stash manually, rerun with -m \"msg\" or --skip-push" ;;
        esac
      fi
    fi

    info "Pushing $GIT_BRANCH → $GIT_REMOTE (DigitalOcean App Platform will rebuild the frontend)"
    git push "$GIT_REMOTE" "$GIT_BRANCH"
    ok "GitHub updated"
  fi

  if [ "$SKIP_BACKEND" -eq 0 ]; then
    need rsync
    info "Syncing backend source to $REMOTE_HOST:$APP_DIR"
    ssh "$REMOTE_HOST" "mkdir -p \"$APP_DIR\""
    rsync -az --delete \
      --exclude='/bodhassess-api/uploads' \
      --exclude='/bodhassess-api/server' \
      --exclude='/bodhassess-api/.run-logs' \
      --exclude='/bodhassess-api/node_modules' \
      --exclude='.DS_Store' \
      bodhassess-api deploy "$REMOTE_HOST:$APP_DIR/"
    ok "Source synced"

    info "Rebuilding + restarting backend on $REMOTE_HOST"
    ssh "$REMOTE_HOST" APP_DIR="$APP_DIR" bash -s <<'REMOTE'
set -euo pipefail
: "${APP_DIR:?}"
[ -d "$APP_DIR/deploy" ] || { echo "missing $APP_DIR/deploy on droplet" >&2; exit 1; }
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

  if [ -n "$HEALTH_URL" ] && [ "$SKIP_BACKEND" -eq 0 ]; then
    info "Health check $HEALTH_URL"
    local HEALTHY=0
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then HEALTHY=1; break; fi
      sleep 2
    done
    [ "$HEALTHY" = 1 ] && ok "API healthy" || warn "API not healthy yet at $HEALTH_URL"
  fi

  echo
  ok "Push to $ENV finished in $(( $(date +%s) - START ))s"
  [ "$SKIP_PUSH" -eq 0 ]    && printf "  ${B}Frontend:${N}  DigitalOcean App Platform is rebuilding from GitHub now\n"
  [ "$SKIP_BACKEND" -eq 0 ] && printf "  ${B}Backend:${N}   redeployed on $REMOTE_HOST\n"
}

# ════════════════════════════════════════════════════════════════════════
# INTERACTIVE MENU
# ════════════════════════════════════════════════════════════════════════
menu() {
  echo
  printf "${B}BodhAssess — what do you want to do?${N}\n\n"
  echo "  1) run     start local dev stack (docker + Go API + Vite)"
  echo "  2) stop    stop local dev stack"
  echo "  3) logs    tail local dev logs"
  echo "  4) build   compile API + web (commit & optional push)"
  echo "  5) push    deploy: git push + restart backend on droplet"
  echo "  h) help    show full reference"
  echo "  q) quit"
  echo
  printf "Choose [1-5/h/q]: "
  read -r choice || choice=""
  case "$(lower "${choice:-}")" in
    1|run)              cmd_run up ;;
    2|stop|down)        cmd_run stop ;;
    3|logs)             cmd_run logs ;;
    4|build)            cmd_build ;;
    5|push|deploy)      cmd_push ;;
    h|help|\?)          show_help ;;
    q|quit|exit|"")     echo "bye."; exit 0 ;;
    *) die "invalid choice: '$choice'" ;;
  esac
}

# ════════════════════════════════════════════════════════════════════════
# DISPATCH
# ════════════════════════════════════════════════════════════════════════
case "${1:-}" in
  ""|menu)            menu ;;
  -h|--help|help)     show_help ;;
  run|up|start)       shift || true; cmd_run "${1:-up}" ;;
  stop|down)          cmd_run stop ;;
  logs)               cmd_run logs ;;
  infra|api|web)      cmd_run "$1" ;;
  build)              shift; cmd_build "$@" ;;
  push|deploy)        shift; cmd_push "$@" ;;
  *) die "unknown command: '$1' (try: ./bodh.sh help)" ;;
esac
