#!/usr/bin/env bash
set -euo pipefail

############################################
# BananaFlow Studio - Frontend Dev Script
############################################

# 1️⃣ 基础配置（按需修改）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${SCRIPT_DIR}/.." && pwd)"
BRANCH="dev"
BACKEND_HOST="192.168.20.30"
BACKEND_PORT="8083"
FRONTEND_PORT="5174"

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
# 4️⃣ 安装依赖
############################################

echo "📦 Installing npm dependencies..."
npm ci

############################################
# 5️⃣ 代理设置（避免访问内网走代理）
############################################

export NO_PROXY="127.0.0.1,localhost,${BACKEND_HOST}"
export no_proxy="$NO_PROXY"

############################################
# 6️⃣ 启动前端开发服务器
############################################

echo "🚀 Starting Vite dev server..."
echo "🔗 Backend: http://${BACKEND_HOST}:${BACKEND_PORT}"
echo "🌐 Frontend: http://0.0.0.0:${FRONTEND_PORT}"

VITE_API_BASE="http://${BACKEND_HOST}:${BACKEND_PORT}" \
npm run dev -- --host 0.0.0.0 --port ${FRONTEND_PORT}
