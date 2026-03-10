#!/usr/bin/env bash
set -euo pipefail

BRANCH="main"
BACKEND_PORT="8082"
FRONTEND_PORT="5173"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_ROOT="${WORKTREE_ROOT:-$(dirname "$SOURCE_REPO")/banana-flow-studio-main}"
RUN_DIR=""
BACKEND_PID_FILE=""
FRONTEND_PID_FILE=""

log() {
  echo "[prod-stop] $*"
}

refresh_runtime_paths() {
  RUN_DIR="$WORKTREE_ROOT/.run"
  BACKEND_PID_FILE="$RUN_DIR/backend_${BACKEND_PORT}.pid"
  FRONTEND_PID_FILE="$RUN_DIR/frontend_${FRONTEND_PORT}.pid"
}

find_branch_worktree() {
  git -C "$SOURCE_REPO" worktree list --porcelain 2>/dev/null | awk -v b="refs/heads/$BRANCH" '
    $1=="worktree" { wt=$2 }
    $1=="branch" && $2==b { print wt; exit }
  '
}

resolve_worktree_root() {
  local existing
  existing="$(find_branch_worktree || true)"
  if [[ -n "$existing" ]] && [[ "$existing" != "$WORKTREE_ROOT" ]]; then
    WORKTREE_ROOT="$existing"
  fi
  refresh_runtime_paths
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

resolve_worktree_root
log "branch target: $BRANCH"
log "worktree: $WORKTREE_ROOT"
stop_by_pid_file "$FRONTEND_PID_FILE" "frontend"
stop_by_pid_file "$BACKEND_PID_FILE" "backend"
stop_by_port "$FRONTEND_PORT" "frontend"
stop_by_port "$BACKEND_PORT" "backend"
log "done"
