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
FRONTEND_PORT="5174"
AGENT_PROXY_URL="${AGENT_PROXY_URL:-http://szdayu:123456@124.243.168.90:16607}"
USE_LOCAL_OLLAMA_AGENT="${USE_LOCAL_OLLAMA_AGENT:-0}"
LOCAL_OLLAMA_MODEL="${LOCAL_OLLAMA_MODEL:-gemma4:latest}"
LOCAL_OLLAMA_BASE_URL="${LOCAL_OLLAMA_BASE_URL:-http://127.0.0.1:11434}"

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
DEFAULT_CORS_ORIGINS="http://meta.dayukeji-inc.cn,https://meta.dayukeji-inc.cn,http://test.dayukeji-inc.cn,https://test.dayukeji-inc.cn,http://${NO_PROXY_BACKEND_HOST}:${FRONTEND_PORT},http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}"
if [[ "${USE_LOCAL_OLLAMA_AGENT}" =~ ^(1|true|yes|on)$ ]]; then
  echo "🧠 Agent base model: ollama:${LOCAL_OLLAMA_MODEL}"
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
HOST="${BACKEND_HOST}" PORT="${BACKEND_PORT}" \
AGENT_MODEL_HTTP_PROXY="${AGENT_PROXY_URL}" AGENT_MODEL_HTTPS_PROXY="${AGENT_PROXY_URL}" \
AGENT_CHAT_HTTP_PROXY="${AGENT_PROXY_URL}" AGENT_CHAT_HTTPS_PROXY="${AGENT_PROXY_URL}" \
IDEA_SCRIPT_HTTP_PROXY="${AGENT_PROXY_URL}" IDEA_SCRIPT_HTTPS_PROXY="${AGENT_PROXY_URL}" \
BANANAFLOW_CORS_ALLOW_ORIGINS="${BANANAFLOW_CORS_ALLOW_ORIGINS:-$DEFAULT_CORS_ORIGINS}" \
BANANAFLOW_CORS_ALLOW_CREDENTIALS="${BANANAFLOW_CORS_ALLOW_CREDENTIALS:-1}" \
.venv/bin/python bananaflow/main.py
