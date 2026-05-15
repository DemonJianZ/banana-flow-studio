# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

BananaFlow Studio is an e-commerce AI image/video workbench (电商智能图像工作台). It combines a Python/FastAPI backend with a React/Vite frontend, using Google Gemini, ByteDance Ark (Doubao), Ollama, and ComfyUI for AI image/video generation and processing.

## Commands

### Backend

```bash
# Run backend (dev, from repo root)
./scripts/run_backend_dev.sh
# Or manually (must run uvicorn from within bananaflow/):
cd bananaflow && HOST=0.0.0.0 PORT=8083 ../.venv/bin/python main.py
```

The virtual environment is at `.venv/` in the repo root. Backend dev port is `8083`; prod port is `8082`.

### Frontend

```bash
# Run frontend (dev)
./scripts/run_frontend_dev.sh
# Or manually:
VITE_API_BASE=http://192.168.20.30:8083 npm run dev -- --host 0.0.0.0 --port 5174

# Build for production
npm run build
```

### Both Together

```bash
./scripts/run_test_stack.sh   # start backend + frontend (background, PIDs in .run/)
./scripts/stop_test_stack.sh  # stop both
```

### Tests

```bash
# Backend (pytest, from repo root)
.venv/bin/python -m pytest tests/

# Run a single test file
.venv/bin/python -m pytest tests/test_foo.py

# Frontend
npm test
```

### Deploy

```bash
./deploy_dev.sh   # deploy dev (port 8083, systemd unit banana-flow-studio-dev)
./deploy_prod.sh  # deploy prod (port 8082, systemd unit banana-flow-studio-prod)
./rollback_prod.sh
```

## Key Environment Variables

### Backend
| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | — | Google Gemini |
| `ARK_API_KEY` | — | ByteDance Ark (Doubao) image/video |
| `COMFYUI_URL` | `http://192.168.20.30:8188` | ComfyUI instance |
| `MODEL_AGENT` | `ollama:gemma4:latest` | Main agent LLM |
| `MODEL_AGENT_CHAT` | `gemini-2.5-flash-lite` | Agent chat LLM |
| `MODEL_GEMINI` | `gemini-3-pro-image-preview` | Image generation |
| `JWT_SECRET` | `bananaflow_dev_secret` | Auth token signing |
| `HOST` / `PORT` | `0.0.0.0` / `8082` | Backend bind address |
| `AGENT_MODEL_HTTP_PROXY` | — | HTTP proxy for agent model calls |
| `BANANAFLOW_CORS_ALLOW_ORIGINS` | (internal defaults) | CORS origins, comma-separated |

### Frontend
| Variable | Default |
|---|---|
| `VITE_API_BASE` | `http://192.168.20.30:8082` |
| `VITE_MEMBER_API_BASE` | `http://192.168.20.12:16313` |

## Backend Architecture

### Entry Points
- `bananaflow/main.py` — uvicorn startup
- `bananaflow/app_factory.py` — `create_app()` wires CORS, mounts all routers, initializes stores
- `bananaflow/api/routes.py` — monolithic route file (~4500 lines) containing all API endpoints
- `bananaflow/auth_routes.py` — auth endpoints with custom HMAC-SHA256 JWT and SQLite user DB

### Agent v2 Pipeline

The primary conversational agent lives in `bananaflow/agent_v2/` and is invoked at `POST /api/agent/message`:

```
handle_agent_message  (gateway/service.py)
  → context_builder   (build conversation context / summarize)
  → capability_catalog (enumerate available tools + virtual capabilities)
  → coordinator       (LLM: decide what kind of request this is)
  → dispatcher        (execute):
      - canvas_planner_adapter  (storyboard/script planning via LangGraph)
      - ToolExecutor            (builtin tool registry in agent/tools/)
      - retrieval tools         (Qdrant vector store)
      - general LLM answer
  → synthesizer       (normalize response to AgentMessageResponse)
```

Key agent files:
- `agent_v2/gateway/coordinator.py` — LLM routing/intent classification
- `agent_v2/gateway/dispatcher.py` — execution dispatch
- `agent_v2/gateway/service.py` — end-to-end entrypoint
- `agent/tools/` — tool registry, executor, and builtin tool definitions
- `agent/graph.py` — LangGraph planning graph
- `agent_v2/storyboard/` — storyboard design agent (planning only, no generation)
- `agent_v2/canvas/` — canvas planner adapter

### Services Layer
- `services/comfyui.py` — ComfyUI HTTP client and all workflow runners (~63KB)
- `services/genai_client.py` — Google Gemini / Ollama client wrapper with proxy support
- `services/ark.py`, `services/ark_video.py` — ByteDance Doubao image/video generation
- `services/ollama_client.py` — Ollama LLM client
- `retrieval/` — Qdrant vector store, embeddings, and indexer for RAG

### Storage (all SQLite)
- `bananaflow/auth.db` — users and quotas
- `data/ai_chat_tasks.db` — async AI chat task queue
- `sessions/service.py` — session store (SQLite-backed)
- `memory/service.py` — user preferences/memory store
- `storage/asset_library.py` — asset library

### Async Task Pattern
Long-running tasks (video split, video BG removal, video upscale) follow a start/poll pattern:
- `POST /api/<task>/start` — enqueues job, returns `task_id`
- `GET /api/<task>/status/{task_id}` — poll for completion

## Frontend Architecture

### Router
The app uses a **hand-rolled router** (`src/router.jsx`) based on `window.history` and React Context — `react-router-dom` is a dependency but is not used at runtime.

### Pages and Routes
| Route | Page | Purpose |
|---|---|---|
| `/app` | `Workbench.jsx` | Primary AI chat workbench (~806KB) |
| `/app/swap` | `PipelineSwapTrio.jsx` | Face/outfit/background swap |
| `/app/batch-video` | `PipelineBatchVideo.jsx` | Batch video processing |
| `/app/feature-extract` | `PipelineFeatureExtract.jsx` | Product feature extraction |
| `/app/rmbg` | `PipelineRmbg.jsx` | Background removal |
| `/app/batch-wordart` | `PipelineBatchWordArt.jsx` | Batch word art |
| `/app/360-viewer` | `Html360Viewer.jsx` | 3D 360° product viewer (Three.js) |

### Key Frontend Modules
- `src/auth/AuthProvider.jsx` — JWT token auth context
- `src/api/agentCanvas.ts` — agent canvas API calls
- `src/components/agent-canvas/` — canvas UI components (CanvasBlock, ScriptExecutionPlan, TopicCards, etc.)
- `src/config.js` — `API_BASE` and `MEMBER_API_BASE` (overridden by `VITE_*` env vars)

## Testing Notes

Backend tests in `tests/` stub out heavy external dependencies (google-genai, Ark, ComfyUI) and add both repo root and `bananaflow/` to `sys.path`. Tests use `unittest` style with pytest as the runner.
