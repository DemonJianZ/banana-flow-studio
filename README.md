# BananaFlow Studio — 电商智能图像工作台

基于多模型 Agent 的电商视觉内容生产工具。通过对话驱动分镜规划、素材匹配、图片/视频生成，将内容创意到制作的链路压缩到单一工作台。

## 核心演示链路

```
用户输入创意 → Agent 理解意图 → 分镜设计（结构化剧本）
→ 素材匹配（角色/场景/音色库）→ 逐镜头图片生成
→ 画布编排 → 生成反馈与调整
```

支持的生成能力：Gemini 图片生成、豆包图片/视频生成、ComfyUI 工作流（去背景、超分、线稿、ControlNet 等）

## 运行模式

| 模式 | 需要配置 | 说明 |
|---|---|---|
| **最小模式** | `GEMINI_API_KEY` 或 `ARK_API_KEY` | 图片生成可用，ComfyUI/会员服务不可用 |
| **完整模式** | 全部 `.env.example` 中标 `required` 的变量 | 全功能可用 |
| **无外部服务** | 无 | 后端可启动，AI 生成功能返回 503，可用于前端调试 |

## 技术栈

**后端：** Python 3.11 · FastAPI · uvicorn · LangGraph · SQLite · httpx  
**AI 模型：** Google Gemini · ByteDance Doubao (Ark) · ComfyUI · Ollama  
**前端：** React 18 · Vite · Tailwind CSS · Three.js（360° 查看器）  
**部署：** systemd · shell scripts

## 快速开始

```bash
# 1. 克隆
git clone <repo-url> && cd banana-flow-studio-dev

# 2. 安装依赖
python -m venv .venv && .venv/bin/pip install -r requirements.txt
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，至少填入 GEMINI_API_KEY 或 ARK_API_KEY

# 4. 启动（开发模式）
./scripts/run_test_stack.sh
# 后端: http://localhost:8083
# 前端: http://localhost:5174
```

或分别启动：

```bash
# 后端
cd bananaflow && HOST=0.0.0.0 PORT=8083 ../.venv/bin/python main.py

# 前端
VITE_API_BASE=http://localhost:8083 npm run dev -- --host 0.0.0.0 --port 5174
```

## 配置说明

所有配置均通过环境变量控制，参见 [`.env.example`](.env.example) 中的完整说明。

关键变量：
- `GEMINI_API_KEY` / `ARK_API_KEY` — AI 生成所需密钥
- `COMFYUI_URL` — ComfyUI 服务地址（默认 `http://localhost:8188`）
- `JWT_SECRET` — 生产环境**必须**显式设置强随机值

## 测试

```bash
# 后端单元测试
.venv/bin/python -m pytest tests/ -v

# 运行单个测试文件
.venv/bin/python -m pytest tests/test_health_routes.py -v

# 前端构建检查
npm run build
```

## 健康检查

```bash
curl http://localhost:8082/healthz   # 存活探针（无 I/O）
curl http://localhost:8082/readyz    # 就绪探针（SQLite 可写 + 依赖状态）
```

`/readyz` 响应示例：

```json
{
  "status": "degraded",
  "checks": {
    "sqlite_writable": { "status": "ok" },
    "jwt_secret": { "status": "degraded", "reason": "development default secret" },
    "comfyui": { "status": "ok" },
    "gemini_key": { "status": "ok" }
  }
}
```

## 项目结构

```
bananaflow/           # Python 后端包
  agent_v2/           # Agent v2 pipeline（coordinator/dispatcher/synthesizer）
  api/                # FastAPI 路由（routes.py + health_routes.py）
  core/               # 配置与工具（config.py、config_guard.py）
  services/           # 外部服务客户端（ComfyUI、Gemini、Ark）
  sessions/           # 会话存储（SQLite）
  memory/             # 用户偏好存储
  storage/            # 素材库存储
  retrieval/          # Qdrant 向量检索
src/                  # React 前端
  pages/              # 页面组件（Workbench.jsx 为主工作台）
  api/                # 前端 API 封装
  components/         # 可复用组件
tests/                # 后端测试
docs/                 # 架构文档与面试材料
```

## 已知限制

- **数据库：** 使用 SQLite，不支持多实例水平扩展；生产建议迁移到 PostgreSQL（见 Phase 2 计划）
- **任务队列：** 异步任务用 asyncio + SQLite 轮询实现，无分布式任务调度；高并发下建议升级为 Redis + arq
- **前端主文件：** `Workbench.jsx` 约 19k 行，待 Phase 5 拆分为功能模块
- **部署：** 当前通过 shell 脚本 + systemd 管理，无容器化；生产建议 Docker + K8s
- **单 Worker：** 后端为 uvicorn 单进程，CPU 密集型任务会阻塞其他请求

## 生产化路线

详见 [docs/architecture.md](docs/architecture.md)（当前架构 vs 目标架构 + 各阶段计划）。
