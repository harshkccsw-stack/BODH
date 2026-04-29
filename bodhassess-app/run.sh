#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

MODE="${1:-dev}"

if [ ! -d node_modules ]; then
  echo "==> Installing dependencies"
  npm install --no-audit --no-fund
fi

case "$MODE" in
  dev)
    echo "==> Starting Vite dev server on http://localhost:3000"
    exec npm run dev
    ;;
  build)
    echo "==> Building production bundle"
    exec npm run build
    ;;
  preview)
    if [ ! -d dist ]; then
      echo "==> No dist/ found — building first"
      npm run build
    fi
    echo "==> Serving production build on http://localhost:3000"
    exec npm run preview
    ;;
  typecheck)
    exec npm run typecheck
    ;;
  lint)
    exec npm run lint
    ;;
  *)
    echo "Usage: $0 [dev|build|preview|typecheck|lint]" >&2
    exit 1
    ;;
esac
