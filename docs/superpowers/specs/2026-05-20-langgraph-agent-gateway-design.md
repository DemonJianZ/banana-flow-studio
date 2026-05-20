# LangGraph Agent Gateway 重构设计

**日期：** 2026-05-20  
**状态：** 已批准，待实现  
**范围：** 替换 `POST /api/agent/message` → `POST /api/agent/invoke`，引入 LangGraph-native 有状态图架构

---

## 背景

现有入口 agent（`agent_v2/gateway/`）采用纯函数式 coordinate → dispatch → synthesize 三段式流水线，LangGraph 仅用于 storyboard 子图。本次重构目标：

- 将主流程改为 LangGraph `StateGraph`，节点间通过 `AgentState` 共享状态
- 引入 SQLite checkpointing，对话历史按 `thread_id` 持久化，`recent_messages` 不再由前端传入
- 重新设计响应 schema：`{ message, patches, warnings, intent, thread_id, async_task, trace, error }`
- 独立执行节点（chitchat / clarify / canvas_plan / tool_call / storyboard）通过 conditional edges 分叉

---

## AgentState

```python
from typing import Annotated
from typing_extensions import TypedDict
import operator
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    # 输入（normalize_request 写入）
    message: str
    thread_id: str
    canvas_id: str | None
    mode: str | None
    force_action: str | None
    ui_action: str | None
    uploaded_documents: list[dict]
    selected_artifact: dict | None
    canvas_node_hints: dict | None
    member_authorization: str

    # 上下文（assemble_context 写入）
    canvas_summary: dict
    artifact_summary: dict
    conversation_history: Annotated[list, add_messages]  # checkpointed，跨轮累积

    # 意图（classify_intent 写入）
    intent: str                    # answer_only | clarify | tool_call | canvas_plan
    intent_confidence: float
    intent_reason: str
    tool_name: str | None
    tool_args: dict

    # 执行结果（execute_* 节点写入）
    exec_response_text: str
    exec_patches: list[dict]
    exec_warnings: list[str]
    exec_data: dict

    # 最终响应（build_response 写入）
    final_response: dict | None

    # 追踪（各节点 append，operator.add reducer）
    trace: Annotated[list[dict], operator.add]
```

**关键设计：**
- `conversation_history` 使用 `add_messages` reducer，checkpointer 自动按 thread_id 累积并去重
- `trace` 使用 `operator.add`，各节点独立 append 不产生冲突
- `final_response` 存 dict 而非 Pydantic model，方便 JSON 序列化

---

## 图拓扑

```
START
  │
  ▼
normalize_request
  │
  ▼
assemble_context
  │
  ▼
classify_intent ──────────────────────────────────────────┐
  │                                                        │ _route_after_classify()
  ├─[answer_only / fallback]──► execute_chitchat           │
  ├─[clarify]─────────────────► execute_clarify            │
  ├─[canvas_plan]─────────────► execute_canvas_plan        │
  └─[tool_call]───────────────► execute_tool_call ─────────┘
                                                             │ storyboard 由 tool_name 判断，
                                                             │ 不是独立的 intent 值
                                      │
                              _route_after_tool()
                                      │
                          ┌───────────┴───────────┐
                          │                       │
                   [storyboard]           [其他 tool]
                          │                       │
                 execute_storyboard        (直接到 build_response)
                          │
                          └───────────┬───────────┘
                                      ▼
                               build_response
                                      │
                                     END
```

### 节点职责

| 节点 | 职责 | 复用现有代码 |
|---|---|---|
| `normalize_request` | 清洗输入字段，检测 force_action/ui_action shortcut，写入 state 基础字段 | `coordinator._shortcut_decision()` 逻辑 |
| `assemble_context` | 构建 canvas_summary、artifact_summary；从 checkpoint 注入 conversation_history | `gateway/context.py` |
| `classify_intent` | 调用 LLM coordinator，解析 JSON 决策，写入 intent/tool_name/tool_args | `coordinator._coordinate_with_llm()` |
| `execute_chitchat` | 调用 agent_chitchat tool，写入 exec_response_text | `AgentToolExecutor` |
| `execute_clarify` | 直接返回 clarification_question 文本，无 LLM 调用 | 纯逻辑 |
| `execute_canvas_plan` | 调用 LangGraph canvas planner，写入 exec_patches | `canvas/planner_adapter.py` |
| `execute_tool_call` | 调用 AgentToolExecutor，写入 exec_data；storyboard 工具跳转 execute_storyboard | `AgentToolExecutor` |
| `execute_storyboard` | 创建异步 storyboard 任务，写入 async task_id | `create_storyboard_task()` |
| `build_response` | 汇总 exec_* 字段为 AgentInvokeResponse，append 本轮消息到 conversation_history | 新建 |

### Conditional Edge 函数

```python
def _route_after_classify(state: AgentState) -> str:
    intent = state.get("intent", "answer_only")
    if intent == "clarify":
        return "execute_clarify"
    if intent == "canvas_plan":
        return "execute_canvas_plan"
    if intent in ("tool_call", "storyboard"):
        return "execute_tool_call"
    return "execute_chitchat"  # answer_only + fallback

def _route_after_tool(state: AgentState) -> str:
    tool_name = state.get("tool_name") or ""
    if tool_name in {"storyboard.design", "agent_storyboard_design"}:
        return "execute_storyboard"
    return "build_response"
```

---

## 响应 Schema

```python
class AgentInvokeResponse(BaseModel):
    ok: bool = True

    # 前端直接渲染
    message: str = ""              # 对话文本（原 response_text）
    patches: list[dict] = []       # canvas 变更指令
    warnings: list[str] = []       # 非致命警告

    # 元信息
    intent: str = ""               # 路由决策（answer_only | clarify | tool_call | canvas_plan）
    thread_id: str = ""            # 回传，前端用于下次请求

    # 异步任务（storyboard）
    async_task: dict | None = None  # {"task_id": "...", "status": "pending"}

    # 调试
    trace: list[dict] = []
    error: str | None = None
```

**与旧 `AgentMessageResponse` 的字段映射：**

| 旧字段 | 新字段 | 备注 |
|---|---|---|
| `response_text` | `message` | 直接改名 |
| `data.patches` | `patches` | 提升到顶层 |
| `action` | `intent` | 语义更清晰 |
| `data.task_id` | `async_task.task_id` | 嵌套结构 |
| `trace` | `trace` | 不变 |
| `decision` | 移除 | 内部细节不暴露给前端 |
| `data`（其余）| 移除 | 清洗掉内部字段 |

---

## Checkpointing

**实现：** `AsyncSqliteSaver`  
**DB 路径：** `data/agent_checkpoints.db`  
**Config 传递：**

```python
config = {"configurable": {"thread_id": req.thread_id or str(uuid4())}}
result = await graph.ainvoke(initial_state, config=config)
```

**Graph 初始化：** 在 `app_factory.py` 的 `create_app()` 里创建单例，存入 `app.state.agent_graph`

```python
# app_factory.py
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from agent_v2.graph import build_agent_graph

async def _init_agent_graph(app):
    checkpointer = await AsyncSqliteSaver.from_conn_string("data/agent_checkpoints.db").__aenter__()
    app.state.agent_graph = build_agent_graph(checkpointer=checkpointer)
```

**conversation_history 积累：**
- `build_response` 节点 append `HumanMessage(content=state["message"])` + `AIMessage(content=state["exec_response_text"])`
- `add_messages` reducer 处理去重
- 过期清理：本次不实现，后续加 TTL job

---

## 文件布局

### 新建

```
bananaflow/agent_v2/graph/
  __init__.py              # 导出 build_agent_graph()
  state.py                 # AgentState TypedDict
  schemas.py               # AgentInvokeResponse
  graph.py                 # StateGraph 组装 + compile
  router.py                # _route_after_classify(), _route_after_tool()
  nodes/
    __init__.py
    normalize.py           # normalize_request 节点
    context.py             # assemble_context 节点
    classify.py            # classify_intent 节点
    execute_chitchat.py
    execute_clarify.py
    execute_canvas.py
    execute_tool.py
    execute_storyboard.py
    build_response.py
```

### 修改

```
bananaflow/api/routes.py
  - 删除 POST /api/agent/message
  - 新增 POST /api/agent/invoke

bananaflow/app_factory.py
  - 初始化 agent graph + checkpointer 单例

src/api/agentCanvas.ts (或对应 JS)
  - URL: /api/agent/message → /api/agent/invoke
  - 移除 recent_messages 字段
  - 响应字段适配

src/hooks/useAgentChat.js
  - response_text → message
  - data.patches → patches
  - data.task_id → async_task.task_id
  - 新增 warnings 处理
```

### 删除

```
bananaflow/agent_v2/gateway/service.py
bananaflow/agent_v2/gateway/coordinator.py
bananaflow/agent_v2/gateway/dispatcher.py
bananaflow/agent_v2/gateway/synthesizer.py
bananaflow/agent_v2/gateway/catalog.py     # 逻辑迁入 nodes/classify.py
bananaflow/agent_v2/gateway/context.py    # 逻辑迁入 nodes/context.py
bananaflow/agent_v2/gateway/prompts.py    # 逻辑迁入 nodes/classify.py
bananaflow/agent_v2/gateway/schemas.py    # 替换为 graph/schemas.py
```

---

## 迁移顺序（最小风险）

1. 新建 `agent_v2/graph/` 全部文件，后端新增 `/api/agent/invoke`（旧端点暂留）
2. 后端单元测试通过后，前端切换到新端点
3. 端到端验证通过后，删除旧端点 + `gateway/` 目录

---

## 不在本次范围内

- Streaming（SSE）响应
- conversation_history TTL 清理
- 多 tenant checkpointer 隔离
- `workflow_plan` action 类型（当前未被实际使用）
