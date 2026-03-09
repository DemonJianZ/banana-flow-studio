#!/usr/bin/env bash
set -euo pipefail

BRANCH="dev"
BACKEND_PORT="8083"
FRONTEND_PORT="5174"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_ROOT="${WORKTREE_ROOT:-$(dirname "$SOURCE_REPO")/banana-flow-studio-dev}"
RUN_DIR="$WORKTREE_ROOT/.run"
BACKEND_PID_FILE="$RUN_DIR/backend_${BACKEND_PORT}.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend_${FRONTEND_PORT}.pid"

log() {
  echo "[test-stop] $*"
}

stop_by_pid_file() {
  local pid_file="$1"
  local name="$2"
  if [[ ! -f "$pid_file" ]]; then
    return
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
    kill -9 "$pid" >/dev/null 2>&1 || true
    log "stopped $name by pid: $pid"
  fi
  rm -f "$pid_file"
}

stop_by_port() {
  local port="$1"
  local name="$2"
  local pids=""

  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
  elif command -v ss >/dev/null 2>&1; then
    pids="$(ss -ltnp 2>/dev/null | awk -v p=":${port}" '$4 ~ p {print $NF}' | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u || true)"
  fi

  if [[ -z "${pids// }" ]]; then
    return
  fi

  for pid in $pids; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      sleep 1
      kill -9 "$pid" >/dev/null 2>&1 || true
      log "stopped $name by port $port (pid: $pid)"
    fi
  done
}

log "branch target: $BRANCH"
stop_by_pid_file "$FRONTEND_PID_FILE" "frontend"
stop_by_pid_file "$BACKEND_PID_FILE" "backend"
stop_by_port "$FRONTEND_PORT" "frontend"
stop_by_port "$BACKEND_PORT" "backend"
log "done"
