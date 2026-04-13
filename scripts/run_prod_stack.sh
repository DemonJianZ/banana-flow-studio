#!/usr/bin/env bash
set -euo pipefail

AGENT_PROXY_URL="${AGENT_PROXY_URL:-http://szdayu:123456@124.243.168.90:16607}"
USE_LOCAL_OLLAMA_AGENT="${USE_LOCAL_OLLAMA_AGENT:-0}"
LOCAL_OLLAMA_MODEL="${LOCAL_OLLAMA_MODEL:-gemma4:latest}"
LOCAL_OLLAMA_BASE_URL="${LOCAL_OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
INTERNAL_NO_PROXY="127.0.0.1,localhost,::1,0.0.0.0,192.168.20.30,192.168.20.30:8188,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
export no_proxy="${no_proxy:+${no_proxy},}${INTERNAL_NO_PROXY}"
export NO_PROXY="${NO_PROXY:+${NO_PROXY},}${INTERNAL_NO_PROXY}"

BRANCH="main"
BACKEND_PORT="8082"
FRONTEND_PORT="5173"
DISPLAY_HOST="${DISPLAY_HOST:-192.168.20.30}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_ROOT="${WORKTREE_ROOT:-$(dirname "$SOURCE_REPO")/banana-flow-studio-main}"
AUTH_DB_PATH_VALUE="${AUTH_DB_PATH_VALUE:-$SOURCE_REPO/bananaflow/auth.db}"
RUN_DIR=""
BACKEND_PID_FILE=""
FRONTEND_PID_FILE=""
BACKEND_LOG=""
FRONTEND_LOG=""

log() {
  echo "[prod] $*"
}

die() {
  echo "[prod][ERROR] $*" >&2
  exit 1
}

ensure_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

refresh_runtime_paths() {
  RUN_DIR="$WORKTREE_ROOT/.run"
  BACKEND_PID_FILE="$RUN_DIR/backend_${BACKEND_PORT}.pid"
  FRONTEND_PID_FILE="$RUN_DIR/frontend_${FRONTEND_PORT}.pid"
  BACKEND_LOG="$RUN_DIR/backend_${BACKEND_PORT}.log"
  FRONTEND_LOG="$RUN_DIR/frontend_${FRONTEND_PORT}.log"
}

find_branch_worktree() {
  git -C "$SOURCE_REPO" worktree list --porcelain | awk -v b="refs/heads/$BRANCH" '
    $1=="worktree" { wt=$2 }
    $1=="branch" && $2==b { print wt; exit }
  '
}

ensure_worktree() {
  local existing
  existing="$(find_branch_worktree || true)"
  if [[ -n "$existing" ]] && [[ "$existing" != "$WORKTREE_ROOT" ]]; then
    WORKTREE_ROOT="$existing"
    refresh_runtime_paths
    log "branch '$BRANCH' already checked out at: $WORKTREE_ROOT"
  fi

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

ensure_auth_db_path() {
  [[ -f "$AUTH_DB_PATH_VALUE" ]] || die "auth db not found: $AUTH_DB_PATH_VALUE"
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
  local cors_origins
  cors_origins="${BANANAFLOW_CORS_ALLOW_ORIGINS:-http://meta.dayukeji-inc.cn,https://meta.dayukeji-inc.cn,http://test.dayukeji-inc.cn,https://test.dayukeji-inc.cn,http://${DISPLAY_HOST}:${FRONTEND_PORT},http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}}"
  if [[ "${USE_LOCAL_OLLAMA_AGENT}" =~ ^(1|true|yes|on)$ ]]; then
    export BANANAFLOW_OLLAMA_ENABLE="1"
    export BANANAFLOW_OLLAMA_BASE_URL="${LOCAL_OLLAMA_BASE_URL}"
    export MODEL_AGENT="${MODEL_AGENT:-ollama:${LOCAL_OLLAMA_MODEL}}"
    export MODEL_AGENT_CHAT="${MODEL_AGENT_CHAT:-ollama:${LOCAL_OLLAMA_MODEL}}"
    export IDEA_SCRIPT_DEFAULT_MODEL="${IDEA_SCRIPT_DEFAULT_MODEL:-ollama:${LOCAL_OLLAMA_MODEL}}"
    export IDEA_SCRIPT_INFERENCE_MODEL="${IDEA_SCRIPT_INFERENCE_MODEL:-ollama:${LOCAL_OLLAMA_MODEL}}"
    export IDEA_SCRIPT_GENERATION_MODEL="${IDEA_SCRIPT_GENERATION_MODEL:-ollama:${LOCAL_OLLAMA_MODEL}}"
    export IDEA_SCRIPT_RISK_SCAN_MODEL="${IDEA_SCRIPT_RISK_SCAN_MODEL:-ollama:${LOCAL_OLLAMA_MODEL}}"
    export IDEA_SCRIPT_SAFE_REWRITE_MODEL="${IDEA_SCRIPT_SAFE_REWRITE_MODEL:-ollama:${LOCAL_OLLAMA_MODEL}}"
    export IDEA_SCRIPT_SCORE_MODEL="${IDEA_SCRIPT_SCORE_MODEL:-ollama:${LOCAL_OLLAMA_MODEL}}"
    export IDEA_SCRIPT_STORYBOARD_GENERATE_MODEL="${IDEA_SCRIPT_STORYBOARD_GENERATE_MODEL:-ollama:${LOCAL_OLLAMA_MODEL}}"
  fi
  (
    cd "$WORKTREE_ROOT/bananaflow"
    AUTH_DB_PATH="$AUTH_DB_PATH_VALUE" HOST="0.0.0.0" PORT="$BACKEND_PORT" WORKERS="1" \
      AGENT_MODEL_HTTP_PROXY="$AGENT_PROXY_URL" AGENT_MODEL_HTTPS_PROXY="$AGENT_PROXY_URL" \
      AGENT_CHAT_HTTP_PROXY="$AGENT_PROXY_URL" AGENT_CHAT_HTTPS_PROXY="$AGENT_PROXY_URL" \
      IDEA_SCRIPT_HTTP_PROXY="$AGENT_PROXY_URL" IDEA_SCRIPT_HTTPS_PROXY="$AGENT_PROXY_URL" \
      BANANAFLOW_CORS_ALLOW_ORIGINS="$cors_origins" BANANAFLOW_CORS_ALLOW_CREDENTIALS="${BANANAFLOW_CORS_ALLOW_CREDENTIALS:-1}" \
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
refresh_runtime_paths
ensure_worktree
ensure_backend_env
ensure_auth_db_path
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
