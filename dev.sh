#!/bin/bash

# Anywhere Desktop - 热重载开发启动脚本

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MAIN_PORT=5173
WINDOW_PORT=5174
MAIN_URL="http://127.0.0.1:${MAIN_PORT}"
WINDOW_URL="http://127.0.0.1:${WINDOW_PORT}"

BACKEND_PRELOAD="${ROOT_DIR}/apps/backend/public/preload.js"
BACKEND_WINDOW_PRELOAD="${ROOT_DIR}/apps/backend/public/window_preload.js"
BACKEND_FAST_PRELOAD="${ROOT_DIR}/apps/backend/public/fast_window_preload.js"
FAST_WINDOW_ENTRY="${ROOT_DIR}/apps/fast-window/fast_input.html"

LOG_DIR="${ROOT_DIR}/logs"
mkdir -p "$LOG_DIR"

PIDS=()

cleanup() {
  local pid
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
}

trap cleanup EXIT INT TERM

start_bg() {
  local name="$1"
  local cmd="$2"
  local log_file="$3"

  : > "$log_file"
  bash -lc "$cmd" > "$log_file" 2>&1 &
  local pid=$!
  PIDS+=("$pid")
  echo "[dev] ${name} started (pid=${pid})"
}

wait_for_http() {
  local url="$1"
  local timeout=45
  local i=0
  while [ "$i" -lt "$timeout" ]; do
    if curl -fsS --max-time 1 "$url" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

wait_for_file() {
  local file_path="$1"
  local timeout=45
  local i=0
  while [ "$i" -lt "$timeout" ]; do
    if [ -f "$file_path" ]; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

echo "[dev] starting backend watch + vite dev servers..."

start_bg "backend watch" \
  "pnpm --dir apps/backend watch" \
  "${LOG_DIR}/backend-dev.log"

start_bg "main vite" \
  "pnpm --dir apps/main exec vite --force --host 127.0.0.1 --port ${MAIN_PORT} --strictPort" \
  "${LOG_DIR}/main-dev.log"

start_bg "window vite" \
  "pnpm --dir apps/window exec vite --host 127.0.0.1 --port ${WINDOW_PORT} --strictPort" \
  "${LOG_DIR}/window-dev.log"

wait_for_file "$BACKEND_PRELOAD" || { echo "[dev] preload.js not ready"; exit 1; }
wait_for_file "$BACKEND_WINDOW_PRELOAD" || { echo "[dev] window_preload.js not ready"; exit 1; }
wait_for_file "$BACKEND_FAST_PRELOAD" || { echo "[dev] fast_window_preload.js not ready"; exit 1; }

wait_for_http "$MAIN_URL" || { echo "[dev] main vite not ready, check ${LOG_DIR}/main-dev.log"; exit 1; }
wait_for_http "$WINDOW_URL" || { echo "[dev] window vite not ready, check ${LOG_DIR}/window-dev.log"; exit 1; }

echo "[dev] ready"
echo "[dev] main:   ${MAIN_URL}"
echo "[dev] window: ${WINDOW_URL}"
echo "[dev] starting electron..."

ANYWHERE_DEV_MAIN_URL="$MAIN_URL" \
ANYWHERE_DEV_WINDOW_URL="$WINDOW_URL" \
ANYWHERE_DEV_PRELOAD_PATH="$BACKEND_PRELOAD" \
ANYWHERE_DEV_FAST_WINDOW_ENTRY="$FAST_WINDOW_ENTRY" \
pnpm start
