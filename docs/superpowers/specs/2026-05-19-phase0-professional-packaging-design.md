# Phase 0 设计文档：工程化包装

**版本：** 1.0  
**日期：** 2026-05-19  
**目标：** 将 BananaFlow Studio 从 MVP 状态整理为专业工程项目——补全文档、去除内网依赖、清理已提交状态文件、添加健康检查端点。

---

## 1. 目标与范围

### 目标

- README 替换 Vite 模板，成为项目真实入口
- 配置去内网化：所有内网 IP/默认密钥改为空字符串或本机占位符，空 endpoint 触发显式错误
- 状态文件清理：取消追踪已提交的 `.db` 文件
- 健康检查：添加 `/healthz`（存活）和 `/readyz`（就绪）端点
- 工程文档：补充架构文档和面试演示文档

### 不在范围内

- 路由拆分（Phase 1）
- 任务队列升级（Phase 2）
- 安全加固（Phase 3）
- 前端模块化（Phase 5）

---

## 2. 文件变更清单

### 新建 / 重写

| 文件 | 说明 |
|---|---|
| `README.md` | 重写现有 Vite 模板（替换，非新建） |
| `docs/architecture.md` | 系统架构、数据流、模块边界 |
| `docs/interview-demo.md` | 面试演示文档（5 分钟 + 15 分钟版本） |
| `.env.example` | 全量环境变量说明，按服务分组，标注 required/optional/sensitive |
| `bananaflow/api/health_routes.py` | `/healthz` + `/readyz` 端点 |
| `bananaflow/core/config_guard.py` | `MissingConfigError` + `require_endpoint()` 工具函数 |

### 修改

| 文件 | 变更内容 |
|---|---|
| `.gitignore` | 补充 `*.db`、`*.db-journal`、`*.sqlite*`、`.run/`、`tmp/`、`debug_output/`、`Thumbs.db` |
| `bananaflow/app_factory.py` | 注册 `health_router` |
| `bananaflow/core/config.py` | `COMFYUI_URL` 默认值 → `http://localhost:8188`；`AI_CHAT_DOWNSTREAM_URL` 默认值 → `""` |
| `bananaflow/api/routes.py` | `MEMBER_API_BASE` 默认值 → `""`；使用 `require_endpoint()` 替换裸用 empty URL 的调用点；移除 `AI_CHAT_DOWNSTREAM_URL or f"{MEMBER_API_BASE}/ai/aiChat"` 隐式 fallback |
| `src/config.js` | 用 `envText()` 标准化替代 `??`；`VITE_API_BASE` 默认 `http://localhost:8082`；`VITE_MEMBER_API_BASE` 默认 `""` |

### 取消 git 追踪（`git rm --cached`，不删除本地文件，不重写历史）

用 `git ls-files '*.db'` 固定清单后执行，当前已追踪的文件：

```
bananaflow/auth_test.db
bananaflow/data/asset_library.db
bananaflow/data/assets.db
bananaflow/data/memories.db
bananaflow/data/sessions.db
data/asset_library.db
data/assets.db
data/memories.db
data/sessions.db
data/storyboard_tasks.db
```

---

## 3. 健康端点设计

### `GET /healthz`

- 无任何 I/O
- 进程活着即返回 HTTP 200
- 响应：`{"status": "ok", "timestamp": "<ISO8601>"}`

### `GET /readyz`

HTTP 状态码语义：

| status | HTTP |
|---|---|
| `ok` | 200 |
| `degraded` | 200 |
| `not_ready` | 503 |

检查项：

| 检查 | 失败时 | 说明 |
|---|---|---|
| SQLite 数据目录可写 | `not_ready` | 无本地存储等于无法运行 |
| `JWT_SECRET` 是否为开发默认值 | `degraded` | 生产须显式覆盖 |
| ComfyUI 连通性 | `degraded` | 超时 500ms；未配置 → `skip` |
| AI Chat downstream 连通性 | `degraded` | 超时 500ms；未配置 → `skip` |
| Gemini API key 存在性 | `degraded` | 只检查 key 非空，不发请求 |

响应格式（每个 check 用对象，方便后续加 `latency_ms`、`target`、`error`）：

```json
{
  "status": "degraded",
  "timestamp": "2026-05-19T12:00:00Z",
  "checks": {
    "sqlite_writable": { "status": "ok" },
    "jwt_secret": { "status": "degraded", "reason": "development default secret" },
    "comfyui": { "status": "skip", "reason": "COMFYUI_URL not configured" },
    "ai_chat_downstream": { "status": "ok" },
    "gemini_key": { "status": "degraded", "reason": "GEMINI_API_KEY not set" }
  }
}
```

外部依赖探测限制：超时 300–800ms；URL 为空字符串 → `skip`，不探测，不报错。注意：`COMFYUI_URL` 默认值为 `http://localhost:8188`（非空），因此在未显式配置时仍会探测本机端口——探测失败返回 `degraded`，不阻断启动，符合预期。`AI_CHAT_DOWNSTREAM_URL` 默认值改为 `""`，不配置则 `skip`。Gemini 不发实际请求（只检查 key 是否存在），避免耗费额度。

### 注册方式（`app_factory.py`）

```python
from api.health_routes import health_router
app.include_router(health_router)
```

---

## 4. 配置校验设计（`config_guard.py`）

```python
class MissingConfigError(RuntimeError):
    pass

def require_endpoint(name: str, url: str) -> str:
    """空 endpoint 抛出明确错误，而不是生成格式错误的 URL。"""
    value = str(url or "").strip()
    if not value:
        raise MissingConfigError(f"配置缺失：{name} 未设置，请在 .env 中配置")
    return value.rstrip("/")
```

在路由处理函数中：

```python
try:
    endpoint = require_endpoint("AI_CHAT_DOWNSTREAM_URL", AI_CHAT_DOWNSTREAM_URL)
except MissingConfigError as exc:
    raise HTTPException(status_code=503, detail=str(exc))
```

特别检查点：`routes.py` 中所有形如 `AI_CHAT_DOWNSTREAM_URL or f"{_MEMBER_API_BASE}/ai/aiChat"` 的隐式 fallback，在 `_MEMBER_API_BASE=""` 时会生成 `/ai/aiChat` 这类错误地址，须一并替换。

---

## 5. `src/config.js` 设计

```js
const envText = (value) => String(value ?? "").trim();

export const API_BASE =
  envText(import.meta.env.VITE_API_BASE) || "http://localhost:8082";

export const MEMBER_API_BASE =
  envText(import.meta.env.VITE_MEMBER_API_BASE);
```

`MEMBER_API_BASE === ""` 的 graceful fallback 在 API wrapper 层统一拦截：

```js
// src/api/memberApi.js（或现有 wrapper）
if (!MEMBER_API_BASE) {
  throw new Error("会员服务未配置（VITE_MEMBER_API_BASE 未设置）");
}
```

组件层捕获后显示"会员服务未配置"提示，不发出格式错误的 HTTP 请求。

---

## 6. `.env.example` 结构

按服务与能力分组，每个变量标注：`required when X | sensitive: yes/no | default: Y`。

**分组：**

1. **Google AI / Gemini** — `GEMINI_API_KEY`、`GOOGLE_API_KEY`、`MODEL_AGENT`、`MODEL_AGENT_CHAT`、`MODEL_GEMINI`、`MODEL_STORYBOARD`、`MODEL_PROMPT_POLISH`
2. **ByteDance Ark（豆包）** — `ARK_API_KEY`、`MODEL_DOUBAO`
3. **ComfyUI** — `COMFYUI_URL`、`COMFYUI_*_PATH`、`COMFYUI_TIMEOUT_SEC`
4. **外部服务** — `AI_CHAT_DOWNSTREAM_URL`、`MEMBER_API_BASE`、`AI_CHAT_LANGUAGE_MODEL_ID`、`AI_CHAT_TASK_*`
5. **认证与安全** — `JWT_SECRET`（标注：生产须显式设置，否则 /readyz 报 degraded）
6. **服务绑定** — `HOST`、`PORT`
7. **代理** — `AGENT_MODEL_HTTP_PROXY`、`AGENT_MODEL_HTTPS_PROXY`、`AGENT_CHAT_HTTP_PROXY`、`AGENT_CHAT_HTTPS_PROXY`、`IDEA_SCRIPT_HTTP_PROXY`、`IDEA_SCRIPT_HTTPS_PROXY`
8. **存储路径** — `AUTH_DB_PATH`、`BANANAFLOW_SESSIONS_DB_PATH`、`BANANAFLOW_MEMORIES_DB_PATH`、`BANANAFLOW_ASSET_LIBRARY_DB_PATH`、`BANANAFLOW_ASSET_DB_PATH`、`AI_CHAT_TASK_DB_PATH`
9. **CORS** — `BANANAFLOW_CORS_ALLOW_ORIGINS`、`BANANAFLOW_CORS_ALLOW_CREDENTIALS`
10. **功能开关** — `USE_LANGGRAPH`、`IDEA_SCRIPT_TAG_NORMALIZE_ENABLED`
11. **可观测性（预留）** — `BANANAFLOW_OBSERVABILITY_PROVIDER`、`LANGFUSE_PUBLIC_KEY`、`LANGFUSE_SECRET_KEY`、`LANGFUSE_HOST`、`LANGSMITH_API_KEY`

**不包含（确认为死配置）：** `BANANAFLOW_IDEA_SCRIPT_SKILL_NAME`、`BANANAFLOW_STORYBOARD_SKILL_NAME`、`IDEA_SCRIPT_STORYBOARD_ENABLED`、`IDEA_SCRIPT_EDIT_PLAN_ENABLED`、`BANANAFLOW_AGENT_TRACE_*`、`IDEA_SCRIPT_*_TIMEOUT_SEC`（代码中均无 `os.getenv` 引用）。

---

## 7. 文档大纲

### `README.md`（重写，中文）

1. 项目简介 + 一句话定位
2. **核心演示链路**（Agent → 分镜设计 → 素材匹配 → 画布 → 生成 → 反馈）
3. 运行模式：最小模式 / 完整模式 / 无外部服务 Mock 模式
4. 技术栈
5. 快速开始（clone → 配置 .env → 启动）
6. 配置说明（指向 `.env.example`）
7. 测试（backend `pytest tests/`、frontend `npm test`、单文件示例）
8. 已知限制（SQLite、Shell 部署、Workbench.jsx 大文件、任务队列待升级）
9. 生产化路线（指向 `docs/architecture.md`）
10. 项目结构

### `docs/architecture.md`（中文）

1. 系统架构图（Mermaid）
2. 当前架构 vs 目标架构
3. Agent v2 Pipeline 流程（coordinator → dispatcher → synthesizer）
4. 模块边界（各子目录职责与接口）
5. 关键数据流（请求入 → Agent → 工具执行 → 响应出）
6. 异步任务流程（POST submit → task_id → GET poll → 结果）
7. 存储层（SQLite 分库职责表）
8. 错误处理与降级策略
9. 安全边界与工具治理
10. Phase 1 改造计划简述

### `docs/interview-demo.md`（中文）

1. 项目背景与业务场景
2. 5 分钟讲解版本（结构化话术）
3. 15 分钟深入版本（技术细节展开）
4. 核心技术挑战与解决方案（含实际踩坑）
5. 我做过的工程取舍
6. 面试官可能追问与回答
7. 下一步生产化路线

---

## 8. 执行顺序

1. **`.gitignore` + `git rm --cached`** — 先做，避免后续 commit 意外带入 .db
2. **`config_guard.py` + `config.py` + `routes.py` + `src/config.js`** — 配置去内网化和校验
3. **`health_routes.py` + `app_factory.py`** — 健康端点
4. **`.env.example`** — 基于修改后的代码整理全量变量
5. **文档** — README、architecture.md、interview-demo.md
6. **baseline 测试** — `npm run build`、`npm run lint`、`.venv/bin/python -m pytest tests/`，记录结果

---

## 9. 成功标准

- [ ] `git ls-files '*.db'` 输出为空
- [ ] 已追踪的源码、脚本、文档示例中无内网 IP（192.168.x.x）作为硬编码默认值或凭据（开发者本地 `.env` 可填内网地址，不作为验收对象）
- [ ] `GET /healthz` 返回 200
- [ ] `GET /readyz` 在未配外部服务时返回 HTTP 200，`status=degraded`，不返回 503
- [ ] `GET /readyz` 在 SQLite 数据目录不可写时返回 HTTP 503，`status=not_ready`
- [ ] `AI_CHAT_DOWNSTREAM_URL=""` 时调用 AI Chat 路由返回 503 with 明确错误信息，不生成 `/ai/aiChat`
- [ ] `MEMBER_API_BASE=""` 时，会员相关 API wrapper 不发出格式错误请求，并返回/显示明确的"会员服务未配置"
- [ ] `npm run build` 通过，`pytest tests/` 通过（记录 baseline，允许既有 skip）
- [ ] README.md 不再包含 "React + Vite" 模板文本
