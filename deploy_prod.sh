#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-banana-flow-studio-prod}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "ERROR: $REPO_DIR is not a git repository."
  exit 1
fi

cd "$REPO_DIR"

git fetch origin
git checkout "$TARGET_BRANCH"
git pull --ff-only origin "$TARGET_BRANCH"

if [ ! -f "requirements.txt" ]; then
  echo "ERROR: requirements.txt not found in $REPO_DIR."
  exit 1
fi

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install -r requirements.txt

if command -v sudo >/dev/null 2>&1; then
  sudo systemctl restart "$SERVICE_NAME"
else
  systemctl restart "$SERVICE_NAME"
fi

echo "Deployed $TARGET_BRANCH to $SERVICE_NAME"
