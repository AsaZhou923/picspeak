#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

start_backend() {
  cd "$ROOT_DIR/backend"
  python -m uvicorn app.main:app --reload --host 127.0.0.1 --port "${BACKEND_PORT:-8000}"
}

start_frontend() {
  cd "$ROOT_DIR/frontend"
  npm run dev -- --hostname 127.0.0.1 --port "${FRONTEND_PORT:-3000}"
}

start_backend &
BACKEND_PID=$!
start_frontend &
FRONTEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

wait
