#!/usr/bin/env bash
# Compile both projects and commit the result.
#
# Usage:
#   ./build.sh                  # build both, commit with default message
#   ./build.sh "your message"   # build both, commit with the given message
#   ./build.sh --no-commit      # build only, do not touch git
#   ./build.sh --push           # build, commit, then push to origin

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT/bodhassess-api"
WEB_DIR="$ROOT/bodhassess-app"
BUILD_DIR="$ROOT/.build"
mkdir -p "$BUILD_DIR"

die() { echo "error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 not found in PATH"; }

DO_COMMIT=1
DO_PUSH=0
MESSAGE=""

for arg in "$@"; do
  case "$arg" in
    --no-commit) DO_COMMIT=0 ;;
    --push)      DO_PUSH=1 ;;
    -h|--help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) MESSAGE="$arg" ;;
  esac
done

build_api() {
  need go
  [ -f "$API_DIR/go.mod" ] || die "no go.mod at $API_DIR"
  echo "==> Building Go API"
  ( cd "$API_DIR" && go build -o "$BUILD_DIR/bodh-server" ./cmd/server )
  echo "    -> $BUILD_DIR/bodh-server"
}

build_web() {
  need npm
  [ -f "$WEB_DIR/package.json" ] || die "no package.json at $WEB_DIR"
  if [ ! -d "$WEB_DIR/node_modules" ]; then
    echo "==> npm install"
    ( cd "$WEB_DIR" && npm install --no-audit --no-fund )
  fi
  echo "==> Building web app"
  ( cd "$WEB_DIR" && npm run build )
}

commit_changes() {
  need git
  cd "$ROOT"
  if [ -z "$(git status --porcelain)" ]; then
    echo "==> No changes to commit"
    return 0
  fi
  local msg="${MESSAGE:-build: compile API and web ($(date +%Y-%m-%d\ %H:%M))}"
  echo "==> Committing: $msg"
  git add -A
  git commit -m "$msg"
}

push_changes() {
  need git
  cd "$ROOT"
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  echo "==> Pushing $branch to origin"
  git push origin "$branch"
}

build_api
build_web

if [ "$DO_COMMIT" -eq 1 ]; then
  commit_changes
fi

if [ "$DO_PUSH" -eq 1 ]; then
  push_changes
fi

echo "==> Done"
