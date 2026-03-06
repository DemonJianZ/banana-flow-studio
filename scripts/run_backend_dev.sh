#!/usr/bin/env bash
set -euo pipefail

############################################
# BananaFlow Studio - Backend Dev Script
############################################

# 1️⃣ 基础配置（按需修改）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${SCRIPT_DIR}/.." && pwd)"
BRANCH="dev"
BACKEND_HOST="0.0.0.0"
BACKEND_PORT="8083"
NO_PROXY_BACKEND_HOST="192.168.20.30"

############################################
# 2️⃣ 进入仓库目录
############################################

if [ ! -d "$REPO" ]; then
  echo "❌ Repo path not found: $REPO"
  exit 1
fi

cd "$REPO"

############################################
# 3️⃣ 拉取最新代码
############################################

echo "🔄 Switching to branch: $BRANCH"
git checkout "$BRANCH"

echo "⬇ Pulling latest code..."
git pull --ff-only origin "$BRANCH"

############################################
# 4️⃣ Python 环境与依赖
############################################

echo "🐍 Preparing virtualenv..."
[ -d .venv ] || python3 -m venv .venv

echo "⬆ Upgrading pip..."
.venv/bin/python -m pip install -U pip

echo "📦 Installing Python dependencies..."
.venv/bin/python -m pip install -r requirements.txt

############################################
# 5️⃣ 代理设置（避免访问内网走代理）
############################################

export NO_PROXY="127.0.0.1,localhost,${NO_PROXY_BACKEND_HOST}"
export no_proxy="$NO_PROXY"

############################################
# 6️⃣ 启动后端服务
############################################

echo "🚀 Starting backend server..."
echo "🌐 Backend: http://${BACKEND_HOST}:${BACKEND_PORT}"

HOST="${BACKEND_HOST}" PORT="${BACKEND_PORT}" .venv/bin/python bananaflow/main.py
