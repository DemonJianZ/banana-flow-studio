#!/usr/bin/env bash
set -euo pipefail

export http_proxy="http://szdayu:123456@124.243.168.90:16607"
export https_proxy="http://szdayu:123456@124.243.168.90:16607"
INTERNAL_NO_PROXY="127.0.0.1,localhost,::1,0.0.0.0,192.168.20.30,192.168.20.30:8188,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
export no_proxy="${no_proxy:+${no_proxy},}${INTERNAL_NO_PROXY}"
export NO_PROXY="${NO_PROXY:+${NO_PROXY},}${INTERNAL_NO_PROXY}"

BRANCH="dev"
BACKEND_PORT="8083"
FRONTEND_PORT="5174"
DISPLAY_HOST="${DISPLAY_HOST:-192.168.20.30}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_ROOT="${WORKTREE_ROOT:-$(dirname "$SOURCE_REPO")/banana-flow-studio-dev}"
AUTH_DB_PATH_VALUE="${AUTH_DB_PATH_VALUE:-$WORKTREE_ROOT/bananaflow/auth_test.db}"
RUN_DIR="$WORKTREE_ROOT/.run"
BACKEND_PID_FILE="$RUN_DIR/backend_${BACKEND_PORT}.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend_${FRONTEND_PORT}.pid"
BACKEND_LOG="$RUN_DIR/backend_${BACKEND_PORT}.log"
FRONTEND_LOG="$RUN_DIR/frontend_${FRONTEND_PORT}.log"

log() {
  echo "[test] $*"
}

die() {
  echo "[test][ERROR] $*" >&2
  exit 1
}

ensure_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

ensure_worktree() {
  if [[ "$WORKTREE_ROOT" == "$SOURCE_REPO" ]]; then
    local current_branch
    current_branch="$(git -C "$SOURCE_REPO" branch --show-current)"
    [[ "$current_branch" == "$BRANCH" ]] || die "current repo branch is '$current_branch', expected '$BRANCH'"
    return
  fi

  if [[ -e "$WORKTREE_ROOT" && ! -e "$WORKTREE_ROOT/.git" ]]; then
    die "$WORKTREE_ROOT exists but is not a git worktree"
  fi

  if [[ -e "$WORKTREE_ROOT/.git" ]]; then
    log "reuse worktree: $WORKTREE_ROOT"
    git -C "$WORKTREE_ROOT" checkout "$BRANCH" >/dev/null 2>&1 || die "failed to checkout $BRANCH in $WORKTREE_ROOT"
  else
    log "create worktree: $WORKTREE_ROOT ($BRANCH)"
    git -C "$SOURCE_REPO" worktree add "$WORKTREE_ROOT" "$BRANCH" >/dev/null
  fi
}

ensure_backend_env() {
  if [[ ! -d "$WORKTREE_ROOT/.venv" ]]; then
    log "create python venv"
    python3 -m venv "$WORKTREE_ROOT/.venv"
  fi
  if ! "$WORKTREE_ROOT/.venv/bin/python" - <<'PY' >/dev/null 2>&1
import fastapi, uvicorn  # noqa: F401
PY
  then
    log "install backend dependencies"
    "$WORKTREE_ROOT/.venv/bin/pip" install -r "$WORKTREE_ROOT/requirements.txt" >/dev/null
  fi
}

ensure_frontend_env() {
  if [[ ! -d "$WORKTREE_ROOT/node_modules" ]]; then
    log "install frontend dependencies"
    (cd "$WORKTREE_ROOT" && npm install --no-audit --no-fund >/dev/null)
  fi
}

stop_if_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      sleep 1
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
    rm -f "$pid_file"
  fi
}

start_backend() {
  stop_if_running "$BACKEND_PID_FILE"
  mkdir -p "$RUN_DIR"
  (
    cd "$WORKTREE_ROOT/bananaflow"
    AUTH_DB_PATH="$AUTH_DB_PATH_VALUE" HOST="0.0.0.0" PORT="$BACKEND_PORT" WORKERS="1" \
      nohup "$WORKTREE_ROOT/.venv/bin/python" main.py >"$BACKEND_LOG" 2>&1 &
    echo $! >"$BACKEND_PID_FILE"
  )
  sleep 1
  kill -0 "$(cat "$BACKEND_PID_FILE")" >/dev/null 2>&1 || die "backend failed, check $BACKEND_LOG"
}

start_frontend() {
  stop_if_running "$FRONTEND_PID_FILE"
  mkdir -p "$RUN_DIR"
  (
    cd "$WORKTREE_ROOT"
    VITE_API_BASE="http://${DISPLAY_HOST}:${BACKEND_PORT}" \
      nohup npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" >"$FRONTEND_LOG" 2>&1 &
    echo $! >"$FRONTEND_PID_FILE"
  )
  sleep 1
  kill -0 "$(cat "$FRONTEND_PID_FILE")" >/dev/null 2>&1 || die "frontend failed, check $FRONTEND_LOG"
}

ensure_cmd git
ensure_cmd python3
ensure_cmd npm
ensure_worktree
ensure_backend_env
ensure_frontend_env
start_backend
start_frontend

log "started successfully"
log "branch: $BRANCH"
log "frontend: http://${DISPLAY_HOST}:${FRONTEND_PORT}"
log "backend:  http://${DISPLAY_HOST}:${BACKEND_PORT}"
log "auth db:  $AUTH_DB_PATH_VALUE"
log "backend log:  $BACKEND_LOG"
log "frontend log: $FRONTEND_LOG"
