#!/usr/bin/env bash
set -euo pipefail

log() {
  echo "[INFO] $*"
}

warn() {
  echo "[WARN] $*" >&2
}

die() {
  echo "[ERROR] $*" >&2
  exit 1
}

USER_NAME="$(whoami)"
REPO_PATH="${REPO_PATH:-}"
DEV_DIR="${DEV_DIR:-/srv/banana-flow-studio-dev}"
PROD_DIR="${PROD_DIR:-/srv/banana-flow-studio-prod}"

log "Using user: $USER_NAME"

if [ -z "$REPO_PATH" ]; then
  if [ -d "./.git" ]; then
    REPO_PATH="$(pwd)"
  elif [ -d "$HOME/banana-flow-studio/.git" ]; then
    REPO_PATH="$HOME/banana-flow-studio"
  fi
fi

[ -n "$REPO_PATH" ] || die "Cannot locate git repo. Please set REPO_PATH to the banana-flow-studio repo directory."
[ -d "$REPO_PATH/.git" ] || die "$REPO_PATH is not a git repo."

cd "$REPO_PATH"
REPO_PATH="$(pwd)"
log "Repo located at: $REPO_PATH"

MAIN_FILE_REL=""
if [ -f "main.py" ]; then
  MAIN_FILE_REL="main.py"
elif [ -f "bananaflow/main.py" ]; then
  MAIN_FILE_REL="bananaflow/main.py"
fi

[ -n "$MAIN_FILE_REL" ] || die "main.py not found (checked main.py and bananaflow/main.py)."

MAIN_FILE="$REPO_PATH/$MAIN_FILE_REL"
APP_REL_DIR="$(dirname "$MAIN_FILE_REL")"
if [ "$APP_REL_DIR" = "." ]; then
  APP_REL_DIR=""
fi

origin_url="$(git config --get remote.origin.url || true)"
[ -n "$origin_url" ] || die "Cannot determine repo URL from git remote origin. Please configure origin or provide repo URL/path."
log "origin remote: $origin_url"

create_app_import="$(grep -E "^[[:space:]]*(from .+ import create_app|import create_app)" "$MAIN_FILE" | head -n 1 || true)"
if [ -z "$create_app_import" ]; then
  warn "Could not auto-detect create_app import line from $MAIN_FILE_REL"
else
  log "Detected create_app import: $create_app_import"
fi

git fetch --all --prune || true

if git show-ref --verify --quiet refs/heads/main; then
  log "main branch exists"
else
  if git show-ref --verify --quiet refs/heads/master; then
    log "Creating main from master"
    git checkout master
    git branch -m master main
  else
    log "Creating main from current HEAD"
    git checkout -b main
  fi
fi

if git show-ref --verify --quiet refs/heads/dev; then
  log "dev branch exists"
else
  log "Creating dev branch from main"
  git checkout main
  git checkout -b dev
fi

git checkout main

if [ ! -f requirements.txt ]; then
  log "requirements.txt not found, creating from local .venv"
  if [ ! -d ".venv" ]; then
    python3 -m venv .venv
  fi
  .venv/bin/python -m pip install -U pip
  .venv/bin/python -m pip install -U fastapi uvicorn
  .venv/bin/python -m pip freeze > requirements.txt
else
  log "requirements.txt exists, skip generation"
fi

MAIN_FILE="$MAIN_FILE" python3 - <<'PY'
import os
import pathlib
import re

p = pathlib.Path(os.environ["MAIN_FILE"])
s = p.read_text(encoding="utf-8")

if "os.getenv(\"PORT\"" in s or "os.environ.get(\"PORT\"" in s:
    print("[INFO] main.py already configurable; skip patch.")
    raise SystemExit(0)

if re.search(r"^\s*import os\s*$", s, flags=re.M) is None:
    s = "import os\n" + s

pat = re.compile(r"^(?P<indent>\s*)uvicorn\.run\(\s*app\s*,.*\)\s*$", re.M)
m = pat.search(s)
if not m:
    print("[WARN] Could not auto-patch uvicorn.run(app, ...). Please patch manually.")
    raise SystemExit(0)

indent = m.group("indent")
replacement = (
    f"{indent}host = os.getenv('HOST', '0.0.0.0')\n"
    f"{indent}port = int(os.getenv('PORT', '8082'))\n"
    f"{indent}workers = int(os.getenv('WORKERS', '1'))\n"
    f"{indent}uvicorn.run('main:app', host=host, port=port, workers=workers)"
)
s = s[:m.start()] + replacement + s[m.end():]
p.write_text(s, encoding="utf-8")
print(f"[INFO] Patched {p}")
PY

sudo mkdir -p "$(dirname "$DEV_DIR")"
sudo mkdir -p "$(dirname "$PROD_DIR")"
sudo chown "$USER_NAME:$USER_NAME" "$(dirname "$DEV_DIR")"
sudo chown "$USER_NAME:$USER_NAME" "$(dirname "$PROD_DIR")"

ensure_worktree() {
  local path="$1"
  local branch="$2"

  if [ -e "$path" ] && [ ! -e "$path/.git" ]; then
    die "$path exists but is not a git worktree. Please clean it manually."
  fi

  if [ -e "$path/.git" ]; then
    log "Worktree exists: $path"
    git -C "$path" fetch origin || true
    git -C "$path" checkout "$branch"
    git -C "$path" pull --ff-only origin "$branch" || true
  else
    log "Creating worktree $path ($branch)"
    git worktree add "$path" "$branch"
  fi
}

ensure_worktree "$PROD_DIR" main
ensure_worktree "$DEV_DIR" dev

if [ ! -f "$DEV_DIR/.env.dev" ]; then
  cat > "$DEV_DIR/.env.dev" <<'EOF'
ENV=dev
HOST=0.0.0.0
PORT=8083
WORKERS=1
EOF
  log "Created $DEV_DIR/.env.dev"
else
  log "Keep existing $DEV_DIR/.env.dev"
fi

if [ ! -f "$PROD_DIR/.env.prod" ]; then
  cat > "$PROD_DIR/.env.prod" <<'EOF'
ENV=prod
HOST=0.0.0.0
PORT=8082
WORKERS=2
EOF
  log "Created $PROD_DIR/.env.prod"
else
  log "Keep existing $PROD_DIR/.env.prod"
fi

for D in "$DEV_DIR" "$PROD_DIR"; do
  [ -f "$D/requirements.txt" ] || die "requirements.txt not found in $D"
  if [ ! -d "$D/.venv" ]; then
    python3 -m venv "$D/.venv"
  fi
  "$D/.venv/bin/python" -m pip install -U pip
  "$D/.venv/bin/python" -m pip install -r "$D/requirements.txt"
done

if [ -n "$APP_REL_DIR" ]; then
  DEV_WORKDIR="$DEV_DIR/$APP_REL_DIR"
  PROD_WORKDIR="$PROD_DIR/$APP_REL_DIR"
  DEV_MAIN="$DEV_DIR/$APP_REL_DIR/main.py"
  PROD_MAIN="$PROD_DIR/$APP_REL_DIR/main.py"
else
  DEV_WORKDIR="$DEV_DIR"
  PROD_WORKDIR="$PROD_DIR"
  DEV_MAIN="$DEV_DIR/main.py"
  PROD_MAIN="$PROD_DIR/main.py"
fi

DEV_SVC="/etc/systemd/system/banana-flow-studio-dev.service"
PROD_SVC="/etc/systemd/system/banana-flow-studio-prod.service"

sudo tee "$DEV_SVC" >/dev/null <<EOF
[Unit]
Description=banana-flow-studio (dev)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$DEV_WORKDIR
EnvironmentFile=$DEV_DIR/.env.dev
ExecStart=$DEV_DIR/.venv/bin/python $DEV_MAIN
Restart=always
RestartSec=2
User=$USER_NAME
Group=$USER_NAME
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo tee "$PROD_SVC" >/dev/null <<EOF
[Unit]
Description=banana-flow-studio (prod)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$PROD_WORKDIR
EnvironmentFile=$PROD_DIR/.env.prod
ExecStart=$PROD_DIR/.venv/bin/python $PROD_MAIN
Restart=always
RestartSec=2
User=$USER_NAME
Group=$USER_NAME
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

chmod +x "$DEV_DIR/deploy_dev.sh" "$PROD_DIR/deploy_prod.sh" "$PROD_DIR/rollback_prod.sh" || true

sudo systemctl daemon-reload
sudo systemctl enable banana-flow-studio-dev banana-flow-studio-prod
sudo systemctl restart banana-flow-studio-dev
sudo systemctl restart banana-flow-studio-prod

cat <<EOF

==================== DONE ====================

Repo:
  $REPO_PATH

Worktrees:
  DEV  -> $DEV_DIR  (branch: dev)
  PROD -> $PROD_DIR (branch: main)

Services:
  banana-flow-studio-dev  : port 8083
  banana-flow-studio-prod : port 8082

Deploy:
  $DEV_DIR/deploy_dev.sh
  $PROD_DIR/deploy_prod.sh

Rollback:
  $PROD_DIR/rollback_prod.sh

Logs:
  journalctl -u banana-flow-studio-prod -f

================================================
EOF
