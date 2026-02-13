#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-banana-flow-studio-prod}"
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "ERROR: $REPO_DIR is not a git repository."
  exit 1
fi

cd "$REPO_DIR"

if ! git rev-parse HEAD~1 >/dev/null 2>&1; then
  echo "ERROR: No previous commit exists to rollback to."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: Working tree is not clean. Commit or stash changes before rollback."
  exit 1
fi

current_commit="$(git rev-parse --short HEAD)"
target_commit="$(git rev-parse --short HEAD~1)"

git reset --hard HEAD~1

if command -v sudo >/dev/null 2>&1; then
  sudo systemctl restart "$SERVICE_NAME"
else
  systemctl restart "$SERVICE_NAME"
fi

echo "Rolled back $SERVICE_NAME from $current_commit to $target_commit"
