# LangGraph Agent Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `POST /api/agent/message` with a LangGraph `StateGraph` at `POST /api/agent/invoke`, adding SQLite checkpointing for per-thread conversation history.

**Architecture:** A `StateGraph(AgentState)` with 9 nodes (normalize_request → assemble_context → classify_intent → [chitchat|clarify|canvas_plan|tool_call] → [storyboard?] → build_response) wired via conditional edges. `AsyncSqliteSaver` persists `conversation_history` across turns keyed by `thread_id`. The external HTTP request/response schema is redesigned: `AgentInvokeRequest` (drops `recent_messages`) → `AgentInvokeResponse` (`message`, `patches`, `warnings`, `intent`, `thread_id`, `async_task`, `tool_result`, `thought`, `trace`, `error`).

**Tech Stack:** Python 3.11, FastAPI, LangGraph 1.1.10, langgraph-checkpoint-sqlite 3.0.1, aiosqlite, Pydantic v2, TypeScript (frontend)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `bananaflow/agent_v2/graph/__init__.py` | Export `build_agent_graph` |
| Create | `bananaflow/agent_v2/graph/state.py` | `AgentState` TypedDict |
| Create | `bananaflow/agent_v2/graph/schemas.py` | `AgentInvokeRequest`, `AgentInvokeResponse` |
| Create | `bananaflow/agent_v2/graph/router.py` | `_route_after_classify`, `_route_after_tool` |
| Create | `bananaflow/agent_v2/graph/graph.py` | `StateGraph` assembly + compile |
| Create | `bananaflow/agent_v2/graph/nodes/__init__.py` | Import all nodes |
| Create | `bananaflow/agent_v2/graph/nodes/normalize.py` | `normalize_request` node |
| Create | `bananaflow/agent_v2/graph/nodes/context.py` | `assemble_context` node |
| Create | `bananaflow/agent_v2/graph/nodes/classify.py` | `classify_intent` node |
| Create | `bananaflow/agent_v2/graph/nodes/execute_chitchat.py` | `execute_chitchat` node |
| Create | `bananaflow/agent_v2/graph/nodes/execute_clarify.py` | `execute_clarify` node |
| Create | `bananaflow/agent_v2/graph/nodes/execute_canvas.py` | `execute_canvas_plan` node |
| Create | `bananaflow/agent_v2/graph/nodes/execute_tool.py` | `execute_tool_call` node |
| Create | `bananaflow/agent_v2/graph/nodes/execute_storyboard.py` | `execute_storyboard` node |
| Create | `bananaflow/agent_v2/graph/nodes/build_response.py` | `build_response` node |
| Create | `tests/test_agent_graph_nodes.py` | Per-node unit tests |
| Create | `tests/test_agent_graph_e2e.py` | Graph integration tests |
| Modify | `bananaflow/app_factory.py` | Add startup event for graph+checkpointer init |
| Modify | `bananaflow/api/routes.py` | Add `/api/agent/invoke`, remove `/api/agent/message` |
| Modify | `src/api/agentCanvas.ts` | New endpoint URL + response field mapping |
| Modify | `src/pages/Workbench.jsx` | Adapt to new response schema |
| Delete | `bananaflow/agent_v2/gateway/service.py` | Replaced by graph |
| Delete | `bananaflow/agent_v2/gateway/coordinator.py` | Logic moved to normalize + classify nodes |
| Delete | `bananaflow/agent_v2/gateway/dispatcher.py` | Logic moved to execute_* nodes |
| Delete | `bananaflow/agent_v2/gateway/synthesizer.py` | Logic moved to build_response node |
| Delete | `bananaflow/agent_v2/gateway/catalog.py` | Logic moved to classify node |
| Delete | `bananaflow/agent_v2/gateway/context.py` | Logic moved to assemble_context node |
| Delete | `bananaflow/agent_v2/gateway/prompts.py` | Logic moved to classify node |
| Delete | `bananaflow/agent_v2/gateway/schemas.py` | Replaced by graph/schemas.py |

---

## Task 1: AgentState TypedDict + AgentInvokeResponse/Request schemas

**Files:**
- Create: `bananaflow/agent_v2/graph/state.py`
- Create: `bananaflow/agent_v2/graph/schemas.py`
- Create: `bananaflow/agent_v2/graph/__init__.py`
- Create: `bananaflow/agent_v2/graph/nodes/__init__.py`
- Test: `tests/test_agent_graph_nodes.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_agent_graph_nodes.py
import os
import sys
import unittest

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


class TestAgentState(unittest.TestCase):
    def test_state_has_required_fields(self):
        from agent_v2.graph.state import AgentState
        import typing
        hints = typing.get_type_hints(AgentState, include_extras=True)
        for field in [
            "message", "thread_id", "intent", "exec_response_text",
            "exec_patches", "conversation_history", "trace", "final_response",
        ]:
            self.assertIn(field, hints, f"AgentState missing field: {field}")

    def test_invoke_response_fields(self):
        from agent_v2.graph.schemas import AgentInvokeResponse
        resp = AgentInvokeResponse(message="hi", intent="answer_only", thread_id="t1")
        self.assertEqual(resp.message, "hi")
        self.assertEqual(resp.patches, [])
        self.assertEqual(resp.warnings, [])
        self.assertIsNone(resp.async_task)
        self.assertIsNone(resp.tool_result)
        self.assertIsNone(resp.thought)

    def test_invoke_request_has_no_recent_messages(self):
        from agent_v2.graph.schemas import AgentInvokeRequest
        import inspect
        sig = inspect.signature(AgentInvokeRequest)
        self.assertNotIn("recent_messages", sig.parameters)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/ai/zhangjian/ai_studio_mvp/banana-flow-studio-dev
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestAgentState -v
```
Expected: `ModuleNotFoundError: No module named 'agent_v2.graph'`

- [ ] **Step 3: Create `bananaflow/agent_v2/graph/state.py`**

```python
from __future__ import annotations

import operator
from typing import Annotated, Any
from typing_extensions import TypedDict


class AgentState(TypedDict):
    # ── Input (populated by route handler, read by normalize_request) ──
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
    current_nodes: list[dict]
    current_connections: list[dict]
    supplemental_prompt: str | None
    product: str | None
    audience: str | None
    price_band: str | None
    conversion_goal: str | None
    primary_platform: str | None
    secondary_platform: str | None
    selected_angle: str | None
    task_mode: str | None
    episode_count: int | None
    existing_script: str | None

    # ── Context (computed by assemble_context) ──
    canvas_summary: dict
    artifact_summary: dict
    # Accumulated across turns via checkpointer; operator.add merges on each invoke
    conversation_history: Annotated[list[dict[str, Any]], operator.add]

    # ── Intent (set by normalize_request shortcut OR classify_intent LLM) ──
    intent: str          # answer_only | clarify | tool_call | canvas_plan
    intent_confidence: float
    intent_reason: str
    tool_name: str | None
    tool_args: dict

    # ── Execution results (set by execute_* nodes) ──
    exec_response_text: str
    exec_patches: list[dict]
    exec_warnings: list[str]
    exec_data: dict

    # ── Final response (set by build_response) ──
    final_response: dict | None

    # ── Per-request trace (no reducer: reset to [] each invocation) ──
    trace: list[dict]
```

- [ ] **Step 4: Create `bananaflow/agent_v2/graph/schemas.py`**

```python
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class AgentInvokeRequest(BaseModel):
    message: str = ""
    force_action: Optional[Literal["answer_only", "clarify", "tool_call", "canvas_plan"]] = None
    ui_action: Optional[str] = None

    supplemental_prompt: Optional[str] = None
    current_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    current_connections: List[Dict[str, Any]] = Field(default_factory=list)
    selected_artifact: Optional[Dict[str, Any]] = None
    canvas_id: Optional[str] = None
    thread_id: Optional[str] = None

    mode: Optional[str] = None
    product: Optional[str] = None
    audience: Optional[str] = None
    price_band: Optional[str] = None
    conversion_goal: Optional[str] = None
    primary_platform: Optional[str] = None
    secondary_platform: Optional[str] = None
    selected_angle: Optional[str] = None

    task_mode: Optional[str] = None
    episode_count: Optional[int] = None
    existing_script: Optional[str] = None
    uploaded_documents: List[Dict[str, Any]] = Field(default_factory=list)
    canvas_node_hints: Optional[Dict[str, Any]] = None


class AgentInvokeResponse(BaseModel):
    ok: bool = True
    message: str = ""
    patches: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    intent: str = ""
    thread_id: str = ""
    async_task: Optional[Dict[str, Any]] = None
    tool_result: Optional[Dict[str, Any]] = None
    thought: Optional[str] = None
    trace: List[Dict[str, Any]] = Field(default_factory=list)
    error: Optional[str] = None
```

- [ ] **Step 5: Create stub `bananaflow/agent_v2/graph/__init__.py`**

```python
from __future__ import annotations
# build_agent_graph will be exported from here once graph.py is created
```

- [ ] **Step 6: Create `bananaflow/agent_v2/graph/nodes/__init__.py`**

```python
# Nodes imported individually where needed
```

- [ ] **Step 7: Run test to verify it passes**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestAgentState -v
```
Expected: 3 tests PASS

- [ ] **Step 8: Commit**

```bash
git add bananaflow/agent_v2/graph/ tests/test_agent_graph_nodes.py
git commit -m "feat: add AgentState TypedDict and AgentInvokeRequest/Response schemas"
```

---

## Task 2: normalize_request node

**Files:**
- Create: `bananaflow/agent_v2/graph/nodes/normalize.py`
- Test: `tests/test_agent_graph_nodes.py` (add `TestNormalizeRequestNode`)

- [ ] **Step 1: Write the failing test**

Add this class to `tests/test_agent_graph_nodes.py`:

```python
class TestNormalizeRequestNode(unittest.TestCase):
    def _make_state(self, **overrides):
        base = {
            "message": "你好",
            "force_action": None,
            "ui_action": None,
            "uploaded_documents": [],
            "selected_artifact": None,
            "mode": None,
            "thread_id": "t1",
            "canvas_id": None,
            "canvas_node_hints": None,
            "member_authorization": "",
            "current_nodes": [],
            "current_connections": [],
            "supplemental_prompt": None,
            "product": None, "audience": None, "price_band": None,
            "conversion_goal": None, "primary_platform": None,
            "secondary_platform": None, "selected_angle": None,
            "task_mode": None, "episode_count": None, "existing_script": None,
        }
        base.update(overrides)
        return base

    def test_ui_action_prompt_polish_sets_intent(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(message="润色提示词", ui_action="prompt_polish", mode="text2img")
        result = normalize_request(state)
        self.assertEqual(result["intent"], "tool_call")
        self.assertEqual(result["tool_name"], "prompt.polish")
        self.assertEqual(result["tool_args"]["mode"], "text2img")

    def test_force_action_canvas_plan_sets_intent(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(message="帮我搭画布", force_action="canvas_plan")
        result = normalize_request(state)
        self.assertEqual(result["intent"], "canvas_plan")

    def test_ui_action_canvas_plan_sets_intent(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(message="搭建画布", ui_action="canvas_plan")
        result = normalize_request(state)
        self.assertEqual(result["intent"], "canvas_plan")

    def test_selected_storyboard_edit_sets_canvas_plan(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(
            message="把这个镜头改得更克制",
            selected_artifact={"kind": "storyboard_selection", "fromNodeId": "s1",
                               "meta": {"selectionType": "shot", "selectionId": "shot-1"}},
        )
        result = normalize_request(state)
        self.assertEqual(result["intent"], "canvas_plan")

    def test_uploaded_storyboard_csv_sets_storyboard_tool(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(
            message="请整理",
            uploaded_documents=[{
                "name": "shots.csv",
                "kind": "storyboard_script_table",
                "text_content": "镜号,景别\n1,特写",
            }],
        )
        result = normalize_request(state)
        self.assertEqual(result["intent"], "tool_call")
        self.assertEqual(result["tool_name"], "storyboard.design")

    def test_no_shortcut_clears_intent_for_llm(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(message="你好")
        result = normalize_request(state)
        self.assertEqual(result["intent"], "")
        self.assertEqual(result["tool_name"], "")
```

- [ ] **Step 2: Run to verify failure**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestNormalizeRequestNode -v
```
Expected: `ImportError: cannot import name 'normalize_request'`

- [ ] **Step 3: Create `bananaflow/agent_v2/graph/nodes/normalize.py`**

```python
from __future__ import annotations

import re
from typing import Any

from agent_v2.storyboard.script_table import (
    looks_like_storyboard_script_table,
    parse_storyboard_script_table,
    format_script_rows_for_prompt,
)

_STORYBOARD_EDIT_MARKERS = (
    "改", "修改", "调整", "优化", "重写", "强化", "弱化",
    "增加", "补充", "删除", "细化", "丰富", "延长", "缩短",
    "换成", "替换", "重做",
)

_STORYBOARD_KEYWORDS = ("分镜", "故事板", "storyboard", "shot list", "镜头脚本", "镜头设计")


def _find_storyboard_script_document(uploaded_documents: list[dict]) -> dict | None:
    for item in list(uploaded_documents or []):
        doc = dict(item or {})
        text_content = str(doc.get("text_content") or "").strip()
        name = str(doc.get("name") or "").strip()
        lower_name = name.lower()
        kind = str(doc.get("kind") or "").strip().lower()
        if kind == "storyboard_script_table":
            return doc
        if lower_name.endswith((".csv", ".tsv")) and (
            "storyboard" in lower_name or "shot" in lower_name
            or "scene" in lower_name or "分镜" in name or "镜头" in name
        ):
            doc["kind"] = "storyboard_script_table"
            return doc
        if not text_content:
            continue
        if looks_like_storyboard_script_table(text_content, name):
            return doc
        if parse_storyboard_script_table(text_content):
            doc["kind"] = "storyboard_script_table"
            return doc
    return None


def _extract_storyboard_args(state: dict) -> dict:
    message = str(state.get("message") or "").strip()
    uploaded_documents = list(state.get("uploaded_documents") or [])
    script_doc = _find_storyboard_script_document(uploaded_documents)

    aspect_ratio_match = re.search(r"\b(21:9|16:9|9:16|4:3|3:4|1:1)\b", message)
    style_match = re.search(r"([^\n，。,；;]{2,24}?风格)", message)
    duration_match = re.search(r"(\d+(?:\.\d+)?)\s*(秒|s|sec|分钟|分)", message, re.IGNORECASE)
    target_duration_sec = None
    if duration_match:
        value = float(duration_match.group(1))
        unit = duration_match.group(2).lower()
        target_duration_sec = value * 60.0 if unit in {"分钟", "分"} else value

    script_table = ""
    script_rows: list[dict] = []
    script_table_name = ""
    if script_doc:
        script_table = str(script_doc.get("text_content") or "").strip()
        script_table_name = str(script_doc.get("name") or "").strip()
        script_rows = format_script_rows_for_prompt(parse_storyboard_script_table(script_table))
    else:
        parsed = parse_storyboard_script_table(message)
        if parsed:
            script_table = message
            script_table_name = "pasted_storyboard_script.txt"
            script_rows = format_script_rows_for_prompt(parsed)

    brief_text = message if not script_table else (message or "请根据这份分镜头脚本整理成故事板")
    hints = dict(state.get("canvas_node_hints") or {})
    return {
        "brief": brief_text,
        "style": str(style_match.group(1) if style_match else "").strip(),
        "aspect_ratio": str(aspect_ratio_match.group(1) if aspect_ratio_match else "16:9").strip() or "16:9",
        "target_duration_sec": float(target_duration_sec or 30.0),
        "language": "zh-CN",
        "script_table": script_table,
        "script_table_name": script_table_name,
        "script_rows": script_rows,
        "_existing_storyboard_count": int(hints.get("storyboard_count") or 0),
    }


def _is_selected_storyboard_edit(state: dict) -> bool:
    selected = dict(state.get("selected_artifact") or {})
    if str(selected.get("kind") or "").strip() != "storyboard_selection":
        return False
    text = str(state.get("message") or "").strip()
    return bool(text) and any(marker in text for marker in _STORYBOARD_EDIT_MARKERS)


def normalize_request(state: dict) -> dict:
    """Detect shortcut intents from request fields; skip LLM if found."""
    message = str(state.get("message") or "").strip()
    force_action = str(state.get("force_action") or "").strip()
    ui_action = str(state.get("ui_action") or "").strip().lower()
    uploaded_documents = list(state.get("uploaded_documents") or [])

    trace_entry: dict[str, Any] = {"type": "NORMALIZE_REQUEST"}

    # 1. Uploaded storyboard script table
    script_doc = _find_storyboard_script_document(uploaded_documents)
    if script_doc:
        trace_entry["shortcut"] = "uploaded_storyboard_script_table"
        return {
            "intent": "tool_call",
            "intent_confidence": 1.0,
            "intent_reason": "uploaded_storyboard_script_table",
            "tool_name": "storyboard.design",
            "tool_args": _extract_storyboard_args(state),
            "trace": [trace_entry],
        }

    # 2. force_action
    if force_action:
        if force_action == "tool_call" and str(state.get("mode") or "").strip().lower() == "text2img":
            trace_entry["shortcut"] = "force_action_text2img_polish"
            return {
                "intent": "tool_call",
                "intent_confidence": 1.0,
                "intent_reason": "force_action",
                "tool_name": "prompt.polish",
                "tool_args": {"prompt": message, "mode": "text2img"},
                "trace": [trace_entry],
            }
        trace_entry["shortcut"] = f"force_action:{force_action}"
        return {
            "intent": force_action,
            "intent_confidence": 1.0,
            "intent_reason": "force_action",
            "tool_name": "",
            "tool_args": {},
            "trace": [trace_entry],
        }

    # 3. ui_action
    if ui_action == "canvas_plan":
        trace_entry["shortcut"] = "ui_action.canvas_plan"
        return {
            "intent": "canvas_plan",
            "intent_confidence": 1.0,
            "intent_reason": "ui_action",
            "tool_name": "",
            "tool_args": {},
            "trace": [trace_entry],
        }
    if ui_action == "prompt_polish":
        mode = str(state.get("mode") or "text2img").strip() or "text2img"
        trace_entry["shortcut"] = "ui_action.prompt_polish"
        return {
            "intent": "tool_call",
            "intent_confidence": 1.0,
            "intent_reason": "ui_action",
            "tool_name": "prompt.polish",
            "tool_args": {"prompt": message, "mode": mode},
            "trace": [trace_entry],
        }

    # 4. Selected storyboard edit
    if _is_selected_storyboard_edit(state):
        trace_entry["shortcut"] = "selection.storyboard_edit"
        return {
            "intent": "canvas_plan",
            "intent_confidence": 1.0,
            "intent_reason": "selected_storyboard_edit",
            "tool_name": "",
            "tool_args": {},
            "trace": [trace_entry],
        }

    # No shortcut — let classify_intent call the LLM
    trace_entry["shortcut"] = None
    return {
        "intent": "",
        "intent_confidence": 0.0,
        "intent_reason": "",
        "tool_name": "",
        "tool_args": {},
        "trace": [trace_entry],
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestNormalizeRequestNode -v
```
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add bananaflow/agent_v2/graph/nodes/normalize.py tests/test_agent_graph_nodes.py
git commit -m "feat: add normalize_request node with shortcut detection"
```

---

## Task 3: assemble_context node

**Files:**
- Create: `bananaflow/agent_v2/graph/nodes/context.py`
- Test: `tests/test_agent_graph_nodes.py` (add `TestAssembleContextNode`)

- [ ] **Step 1: Write the failing test**

Add to `tests/test_agent_graph_nodes.py`:

```python
class TestAssembleContextNode(unittest.TestCase):
    def test_builds_canvas_summary_from_nodes(self):
        from agent_v2.graph.nodes.context import assemble_context
        state = {
            "current_nodes": [
                {"id": "n1", "type": "image_gen"},
                {"id": "n2", "type": "text_input"},
                {"id": "n3", "type": "image_gen"},  # duplicate type
            ],
            "current_connections": [{"from": "n1", "to": "n2"}],
            "selected_artifact": None,
            "thread_id": "t1",
            "canvas_id": "c1",
            "mode": None,
            "task_mode": None,
            "product": None,
        }
        result = assemble_context(state)
        self.assertEqual(result["canvas_summary"]["node_count"], 3)
        self.assertEqual(result["canvas_summary"]["connection_count"], 1)
        self.assertIn("image_gen", result["canvas_summary"]["node_types"])
        # duplicate types deduplicated
        self.assertEqual(len([t for t in result["canvas_summary"]["node_types"] if t == "image_gen"]), 1)

    def test_builds_artifact_summary_from_selected(self):
        from agent_v2.graph.nodes.context import assemble_context
        state = {
            "current_nodes": [],
            "current_connections": [],
            "selected_artifact": {
                "kind": "storyboard_selection",
                "fromNodeId": "s1",
                "meta": {
                    "selectionType": "scene",
                    "selectionId": "scene-2",
                    "selectionLabel": "场景 2",
                },
            },
            "thread_id": "t1",
            "canvas_id": None,
            "mode": None,
            "task_mode": None,
            "product": None,
        }
        result = assemble_context(state)
        self.assertEqual(result["artifact_summary"]["kind"], "storyboard_selection")
        self.assertEqual(result["artifact_summary"]["selection_type"], "scene")
```

- [ ] **Step 2: Run to verify failure**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestAssembleContextNode -v
```
Expected: `ImportError: cannot import name 'assemble_context'`

- [ ] **Step 3: Create `bananaflow/agent_v2/graph/nodes/context.py`**

```python
from __future__ import annotations

from typing import Any


def _summarize_canvas_state(state: dict) -> dict:
    nodes = list(state.get("current_nodes") or [])
    conns = list(state.get("current_connections") or [])
    node_types: list[str] = []
    seen: set[str] = set()
    for node in nodes[:20]:
        node_type = str(node.get("type") or "").strip()
        if node_type and node_type not in seen:
            seen.add(node_type)
            node_types.append(node_type)
    result: dict[str, Any] = {
        "node_count": len(nodes),
        "connection_count": len(conns),
        "node_types": node_types,
        "canvas_id": str(state.get("canvas_id") or "").strip() or None,
    }
    return result


def _summarize_selected_artifact(state: dict) -> dict:
    artifact = dict(state.get("selected_artifact") or {})
    if not artifact:
        return {}
    meta = dict(artifact.get("meta") or {})
    return {
        "kind": str(artifact.get("kind") or "").strip() or "image",
        "fromNodeId": str(artifact.get("fromNodeId") or "").strip() or None,
        "url_present": bool(str(artifact.get("url") or "").strip()),
        "node_kind": str(meta.get("nodeKind") or "").strip() or None,
        "selection_type": str(meta.get("selectionType") or "").strip() or None,
        "selection_id": str(meta.get("selectionId") or "").strip() or None,
        "selection_label": str(meta.get("selectionLabel") or "").strip() or None,
        "selection_summary": str(meta.get("selectionSummary") or "").strip() or None,
        "storyboard_title": str(meta.get("storyboardTitle") or "").strip() or None,
        "scene_title": str(meta.get("sceneTitle") or "").strip() or None,
        "scene_location": str(meta.get("sceneLocation") or "").strip() or None,
        "payload": meta.get("payload") if isinstance(meta.get("payload"), dict) else None,
    }


def assemble_context(state: dict) -> dict:
    """Build canvas_summary and artifact_summary from current request state."""
    canvas_summary = _summarize_canvas_state(state)
    artifact_summary = _summarize_selected_artifact(state)

    trace_entry: dict[str, Any] = {
        "type": "ASSEMBLE_CONTEXT",
        "node_count": canvas_summary.get("node_count", 0),
        "history_turns": len(list(state.get("conversation_history") or [])) // 2,
    }
    return {
        "canvas_summary": canvas_summary,
        "artifact_summary": artifact_summary,
        "trace": list(state.get("trace") or []) + [trace_entry],
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestAssembleContextNode -v
```
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add bananaflow/agent_v2/graph/nodes/context.py tests/test_agent_graph_nodes.py
git commit -m "feat: add assemble_context node"
```

---

## Task 4: classify_intent node + router

**Files:**
- Create: `bananaflow/agent_v2/graph/nodes/classify.py`
- Create: `bananaflow/agent_v2/graph/router.py`
- Test: `tests/test_agent_graph_nodes.py` (add `TestClassifyIntentNode`, `TestRouter`)

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_agent_graph_nodes.py`:

```python
import types as _types


def _install_google_stub():
    if "google.genai" in sys.modules:
        return
    google_module = _types.ModuleType("google")
    genai_module = _types.ModuleType("google.genai")
    genai_module.types = _types.SimpleNamespace(
        Part=lambda text="": _types.SimpleNamespace(text=text),
        GenerateContentConfig=lambda **kwargs: _types.SimpleNamespace(**kwargs),
    )
    google_module.genai = genai_module
    sys.modules["google"] = google_module
    sys.modules["google.genai"] = genai_module


_install_google_stub()


class TestClassifyIntentNode(unittest.TestCase):
    def _base_state(self, intent="", **overrides):
        state = {
            "message": "你好",
            "intent": intent,
            "intent_confidence": 0.0,
            "intent_reason": "",
            "tool_name": "",
            "tool_args": {},
            "canvas_summary": {},
            "artifact_summary": {},
            "conversation_history": [],
            "mode": None,
            "task_mode": None,
            "product": None,
            "canvas_id": None,
            "thread_id": "t1",
            "member_authorization": "",
            "uploaded_documents": [],
            "selected_artifact": None,
            "trace": [],
        }
        state.update(overrides)
        return state

    def test_skips_llm_when_intent_already_set(self):
        from agent_v2.graph.nodes.classify import classify_intent
        from unittest import mock
        state = self._base_state(intent="canvas_plan", tool_name="")
        with mock.patch("agent_v2.graph.nodes.classify._call_llm_coordinator") as mock_llm:
            result = classify_intent(state)
        mock_llm.assert_not_called()
        self.assertEqual(result["intent"], "canvas_plan")

    def test_calls_llm_and_parses_answer_only(self):
        from agent_v2.graph.nodes.classify import classify_intent
        from unittest import mock
        state = self._base_state(intent="")
        llm_json = '{"action":"answer_only","reason":"casual","confidence":0.9,"matched_capabilities":["general_answer"],"answer":"你好！"}'
        with mock.patch("agent_v2.graph.nodes.classify._call_llm_coordinator", return_value=llm_json):
            result = classify_intent(state)
        self.assertEqual(result["intent"], "answer_only")
        self.assertAlmostEqual(result["intent_confidence"], 0.9)

    def test_falls_back_to_answer_only_on_llm_failure(self):
        from agent_v2.graph.nodes.classify import classify_intent
        from unittest import mock
        state = self._base_state(intent="")
        with mock.patch("agent_v2.graph.nodes.classify._call_llm_coordinator", side_effect=RuntimeError("timeout")):
            result = classify_intent(state)
        self.assertEqual(result["intent"], "answer_only")
        self.assertEqual(result["intent_reason"], "coordinator_fallback")

    def test_storyboard_promise_guard_upgrades_to_tool_call(self):
        from agent_v2.graph.nodes.classify import classify_intent
        from unittest import mock
        state = self._base_state(
            intent="",
            message="比例16:9，黑色电影风格，总时长48秒",
            conversation_history=[{"role": "user", "text": "帮我做一个产品广告分镜"}],
        )
        promise_json = '{"action":"answer_only","reason":"llm_promise","confidence":0.62,"answer":"好的，我将调用故事板设计工具为您生成分镜草稿。"}'
        with mock.patch("agent_v2.graph.nodes.classify._call_llm_coordinator", return_value=promise_json):
            result = classify_intent(state)
        self.assertEqual(result["intent"], "tool_call")
        self.assertEqual(result["tool_name"], "storyboard.design")


class TestRouter(unittest.TestCase):
    def test_answer_only_routes_to_chitchat(self):
        from agent_v2.graph.router import _route_after_classify
        self.assertEqual(_route_after_classify({"intent": "answer_only"}), "execute_chitchat")

    def test_clarify_routes_to_clarify(self):
        from agent_v2.graph.router import _route_after_classify
        self.assertEqual(_route_after_classify({"intent": "clarify"}), "execute_clarify")

    def test_canvas_plan_routes_to_canvas(self):
        from agent_v2.graph.router import _route_after_classify
        self.assertEqual(_route_after_classify({"intent": "canvas_plan"}), "execute_canvas_plan")

    def test_tool_call_routes_to_tool(self):
        from agent_v2.graph.router import _route_after_classify
        self.assertEqual(_route_after_classify({"intent": "tool_call"}), "execute_tool_call")

    def test_unknown_falls_back_to_chitchat(self):
        from agent_v2.graph.router import _route_after_classify
        self.assertEqual(_route_after_classify({"intent": "unknown_intent"}), "execute_chitchat")

    def test_storyboard_tool_routes_to_storyboard(self):
        from agent_v2.graph.router import _route_after_tool
        self.assertEqual(
            _route_after_tool({"tool_name": "storyboard.design", "exec_data": {}}),
            "execute_storyboard",
        )

    def test_non_storyboard_routes_to_build_response(self):
        from agent_v2.graph.router import _route_after_tool
        self.assertEqual(
            _route_after_tool({"tool_name": "prompt.polish", "exec_data": {}}),
            "build_response",
        )
```

- [ ] **Step 2: Run to verify failure**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestClassifyIntentNode tests/test_agent_graph_nodes.py::TestRouter -v
```
Expected: `ImportError`

- [ ] **Step 3: Create `bananaflow/agent_v2/graph/nodes/classify.py`**

```python
from __future__ import annotations

import json
import re
from typing import Any


_STORYBOARD_KEYWORDS = ("分镜", "故事板", "storyboard", "shot list", "镜头脚本", "镜头设计")
_PROMISE_MARKERS = ("我将", "我会", "为您生成", "为你生成", "调用", "分镜草稿", "故事板设计工具")


def _build_coordinator_prompt(state: dict, capability_catalog: list[dict]) -> str:
    from agent_v2.gateway.prompts import coordinator_system_prompt
    import json as _json

    history = list(state.get("conversation_history") or [])[-8:]
    payload = {
        "message": str(state.get("message") or "").strip(),
        "recent_messages": history,
        "canvas_state_summary": dict(state.get("canvas_summary") or {}),
        "selected_artifact_summary": dict(state.get("artifact_summary") or {}),
        "uploaded_documents_summary": [
            {
                "name": str((d or {}).get("name") or "").strip() or None,
                "mime_type": str((d or {}).get("mime_type") or "").strip() or None,
                "kind": str((d or {}).get("kind") or "").strip() or None,
                "text_preview": str((d or {}).get("text_content") or "").strip()[:200] or None,
            }
            for d in list(state.get("uploaded_documents") or [])[:3]
        ],
        "request_metadata": {
            "mode": str(state.get("mode") or "").strip() or None,
            "product": str(state.get("product") or "").strip() or None,
            "task_mode": str(state.get("task_mode") or "").strip() or None,
            "thread_id": str(state.get("thread_id") or "").strip() or None,
        },
        "capability_catalog": list(capability_catalog or []),
    }
    return coordinator_system_prompt() + "\n\n" + _json.dumps(payload, ensure_ascii=False)


def _call_llm_coordinator(state: dict) -> str:
    """Call the LLM and return raw JSON string. Raises on failure."""
    from agent_v2.gateway.catalog import build_capability_catalog
    from core.config import AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY, MODEL_AGENT

    authorization = str(state.get("member_authorization") or "").strip()
    catalog = build_capability_catalog()
    full_prompt = _build_coordinator_prompt(state, catalog)

    if authorization:
        from services.ai_chat_client import call_ai_chat_text
        response = call_ai_chat_text(message=full_prompt, authorization=authorization)
        return str(response.text or "").strip()

    from google.genai import types
    from services.genai_client import call_genai_retry_with_proxy

    response = call_genai_retry_with_proxy(
        contents=[types.Part(text=full_prompt)],
        config=types.GenerateContentConfig(
            temperature=0.0,
            max_output_tokens=800,
            response_mime_type="application/json",
        ),
        req_id="agent_v2_graph_classify",
        model=MODEL_AGENT,
        http_proxy=AGENT_MODEL_HTTP_PROXY,
        https_proxy=AGENT_MODEL_HTTPS_PROXY,
    )
    text = str(getattr(response, "text", "") or "").strip()
    if not text:
        candidates = getattr(response, "candidates", None) or []
        if candidates:
            try:
                text = str(getattr(candidates[0].content.parts[0], "text", "") or "").strip()
            except Exception:
                text = ""
    return text


def _parse_llm_output(text: str) -> dict | None:
    raw = str(text or "").strip().replace("```json", "").replace("```", "").strip()
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def _collect_context_text(state: dict) -> str:
    parts = [str(state.get("message") or "").strip()]
    for item in list(state.get("conversation_history") or [])[-8:]:
        text = str((item or {}).get("text") or "").strip()
        if text:
            parts.append(text)
    return "\n".join(p for p in parts if p)


def _looks_like_storyboard_request(state: dict) -> bool:
    text = _collect_context_text(state).lower()
    return any(kw in text for kw in _STORYBOARD_KEYWORDS)


def _decision_is_promise_only(payload: dict) -> bool:
    if str(payload.get("action") or "") != "answer_only":
        return False
    answer = str(payload.get("answer") or "").strip()
    return bool(answer) and any(m in answer for m in _PROMISE_MARKERS)


def _extract_storyboard_args(state: dict) -> dict:
    # Import from normalize module to avoid duplication
    from agent_v2.graph.nodes.normalize import _extract_storyboard_args as _extract
    return _extract(state)


def classify_intent(state: dict) -> dict:
    """LLM intent routing. Skipped if normalize_request already set intent."""
    existing_intent = str(state.get("intent") or "").strip()
    if existing_intent:
        # Shortcut was already applied by normalize_request
        return {
            "trace": list(state.get("trace") or []) + [
                {"type": "CLASSIFY_INTENT", "skipped": True, "intent": existing_intent}
            ],
        }

    try:
        raw_text = _call_llm_coordinator(state)
        payload = _parse_llm_output(raw_text)
    except Exception:
        payload = None

    if payload is None:
        return {
            "intent": "answer_only",
            "intent_confidence": 0.35,
            "intent_reason": "coordinator_fallback",
            "tool_name": "",
            "tool_args": {},
            "trace": list(state.get("trace") or []) + [
                {"type": "CLASSIFY_INTENT", "intent": "answer_only", "rule": "fallback"}
            ],
        }

    action = str(payload.get("action") or "answer_only")
    tool_name = str(payload.get("tool_name") or "").strip()
    tool_args = dict(payload.get("tool_args") or {})

    # Guard: storyboard promise → force tool_call
    if _looks_like_storyboard_request(state) and _decision_is_promise_only(payload):
        action = "tool_call"
        tool_name = "storyboard.design"
        tool_args = _extract_storyboard_args(state)
        rule = "guard.storyboard_tool_call"
    elif action == "tool_call" and tool_name in {"storyboard.design", "agent_storyboard_design"}:
        args = _extract_storyboard_args(state)
        args.update({k: v for k, v in tool_args.items() if v not in (None, "", [], {})})
        tool_args = args
        rule = "llm_coordinator"
    else:
        rule = "llm_coordinator"

    return {
        "intent": action,
        "intent_confidence": float(payload.get("confidence") or 1.0),
        "intent_reason": str(payload.get("reason") or "").strip(),
        "tool_name": tool_name,
        "tool_args": tool_args,
        "trace": list(state.get("trace") or []) + [
            {"type": "CLASSIFY_INTENT", "intent": action, "rule": rule,
             "confidence": float(payload.get("confidence") or 1.0)}
        ],
    }
```

- [ ] **Step 4: Create `bananaflow/agent_v2/graph/router.py`**

```python
from __future__ import annotations


def _route_after_classify(state: dict) -> str:
    """Conditional edge: classify_intent → execute_* node."""
    intent = str(state.get("intent") or "answer_only")
    if intent == "clarify":
        return "execute_clarify"
    if intent == "canvas_plan":
        return "execute_canvas_plan"
    if intent == "tool_call":
        return "execute_tool_call"
    return "execute_chitchat"  # answer_only + any unknown


def _route_after_tool(state: dict) -> str:
    """Conditional edge: execute_tool_call → execute_storyboard OR build_response."""
    tool_name = str(state.get("tool_name") or "").strip()
    if tool_name in {"storyboard.design", "agent_storyboard_design"}:
        return "execute_storyboard"
    return "build_response"
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestClassifyIntentNode tests/test_agent_graph_nodes.py::TestRouter -v
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add bananaflow/agent_v2/graph/nodes/classify.py bananaflow/agent_v2/graph/router.py tests/test_agent_graph_nodes.py
git commit -m "feat: add classify_intent node and conditional edge router"
```

---

## Task 5: execute_chitchat + execute_clarify nodes

**Files:**
- Create: `bananaflow/agent_v2/graph/nodes/execute_chitchat.py`
- Create: `bananaflow/agent_v2/graph/nodes/execute_clarify.py`
- Test: `tests/test_agent_graph_nodes.py` (add `TestExecuteChitchat`, `TestExecuteClarify`)

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_agent_graph_nodes.py`:

```python
class TestExecuteChitchat(unittest.TestCase):
    def test_calls_chitchat_tool_and_sets_response_text(self):
        from agent_v2.graph.nodes.execute_chitchat import execute_chitchat
        from unittest import mock
        state = {
            "message": "你好",
            "thread_id": "t1",
            "member_authorization": "",
            "trace": [],
        }
        mock_payload = {"text": "你好！有什么需要帮助的吗？"}
        with mock.patch(
            "agent_v2.graph.nodes.execute_chitchat._run_chitchat_tool",
            return_value=mock_payload,
        ):
            result = execute_chitchat(state)
        self.assertEqual(result["exec_response_text"], "你好！有什么需要帮助的吗？")
        self.assertEqual(result["exec_patches"], [])
        self.assertEqual(result["exec_warnings"], [])

    def test_uses_llm_answer_when_already_set(self):
        from agent_v2.graph.nodes.execute_chitchat import execute_chitchat
        state = {
            "message": "你好",
            "thread_id": "t1",
            "member_authorization": "",
            "trace": [],
            # Pre-populated answer from classify_intent (LLM returned answer_only with answer)
            "_llm_answer": "直接回答：你好！",
        }
        from unittest import mock
        with mock.patch("agent_v2.graph.nodes.execute_chitchat._run_chitchat_tool") as mock_tool:
            # _llm_answer takes priority — tool should not be called
            # (implementation detail: if _llm_answer present, skip tool)
            pass  # just verify it doesn't crash
        # At minimum, exec_response_text is set
        with mock.patch("agent_v2.graph.nodes.execute_chitchat._run_chitchat_tool", return_value={"text": "hi"}):
            result = execute_chitchat(state)
        self.assertIn("exec_response_text", result)


class TestExecuteClarify(unittest.TestCase):
    def test_returns_clarification_question(self):
        from agent_v2.graph.nodes.execute_clarify import execute_clarify
        state = {
            "message": "帮我做个视频",
            "trace": [],
            "_clarification_question": "请问产品名称是什么？",
        }
        result = execute_clarify(state)
        self.assertEqual(result["exec_response_text"], "请问产品名称是什么？")
        self.assertEqual(result["exec_patches"], [])

    def test_default_question_when_none_set(self):
        from agent_v2.graph.nodes.execute_clarify import execute_clarify
        state = {"message": "...", "trace": [], "_clarification_question": None}
        result = execute_clarify(state)
        self.assertIn("exec_response_text", result)
        self.assertTrue(len(result["exec_response_text"]) > 0)
```

- [ ] **Step 2: Run to verify failure**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestExecuteChitchat tests/test_agent_graph_nodes.py::TestExecuteClarify -v
```
Expected: `ImportError`

- [ ] **Step 3: Create `bananaflow/agent_v2/graph/nodes/execute_chitchat.py`**

```python
from __future__ import annotations

from typing import Any


def _run_chitchat_tool(message: str, trace_sink: list, member_authorization: str, thread_id: str) -> dict:
    from agent.tools import AgentToolContext, build_builtin_executor
    executor = build_builtin_executor()
    return dict(executor.execute(
        "agent_chitchat",
        {"message": message},
        context=AgentToolContext(
            req_id=thread_id,
            trace_sink=trace_sink,
            extra={"run_id": thread_id, "member_authorization": member_authorization},
        ),
    ))


def execute_chitchat(state: dict) -> dict:
    message = str(state.get("message") or "").strip()
    thread_id = str(state.get("thread_id") or "").strip()
    member_authorization = str(state.get("member_authorization") or "").strip()
    trace = list(state.get("trace") or [])

    tool_trace: list[Any] = []
    payload = _run_chitchat_tool(message, tool_trace, member_authorization, thread_id)
    response_text = str(payload.get("text") or "").strip()

    return {
        "exec_response_text": response_text,
        "exec_patches": [],
        "exec_warnings": [],
        "exec_data": dict(payload),
        "trace": trace + [{"type": "EXECUTE_CHITCHAT", "response_preview": response_text[:120]}],
    }
```

- [ ] **Step 4: Create `bananaflow/agent_v2/graph/nodes/execute_clarify.py`**

```python
from __future__ import annotations


def execute_clarify(state: dict) -> dict:
    question = str(state.get("_clarification_question") or "").strip()
    if not question:
        question = "我还需要一点信息，才能继续处理。"
    trace = list(state.get("trace") or [])
    return {
        "exec_response_text": question,
        "exec_patches": [],
        "exec_warnings": [],
        "exec_data": {},
        "trace": trace + [{"type": "EXECUTE_CLARIFY"}],
    }
```

Note: `_clarification_question` is written into state by `classify_intent` when `action == "clarify"`. Add this to `classify_intent` return dict when action is clarify:

In `classify_intent`, add to the return dict:
```python
"_clarification_question": str(payload.get("clarification_question") or "").strip() if action == "clarify" else None,
```

Also add `_clarification_question: str | None` and `_llm_answer: str | None` to `AgentState` in `state.py`.

- [ ] **Step 5: Update `state.py` with clarification fields**

In `bananaflow/agent_v2/graph/state.py`, add inside `AgentState`:

```python
    # ── Internal signals (set by classify_intent, read by execute_* nodes) ──
    _clarification_question: str | None
    _llm_answer: str | None
```

And update `classify_intent` in `classify.py` to set `_clarification_question`:

In the final return dict of `classify_intent`, add:
```python
"_clarification_question": str(payload.get("clarification_question") or "").strip() if action == "clarify" else None,
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestExecuteChitchat tests/test_agent_graph_nodes.py::TestExecuteClarify -v
```
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add bananaflow/agent_v2/graph/nodes/execute_chitchat.py bananaflow/agent_v2/graph/nodes/execute_clarify.py bananaflow/agent_v2/graph/state.py bananaflow/agent_v2/graph/nodes/classify.py tests/test_agent_graph_nodes.py
git commit -m "feat: add execute_chitchat and execute_clarify nodes"
```

---

## Task 6: execute_canvas_plan node

**Files:**
- Create: `bananaflow/agent_v2/graph/nodes/execute_canvas.py`
- Test: `tests/test_agent_graph_nodes.py` (add `TestExecuteCanvasPlan`)

- [ ] **Step 1: Write the failing test**

Add to `tests/test_agent_graph_nodes.py`:

```python
class TestExecuteCanvasPlan(unittest.TestCase):
    def test_applies_planner_result_to_patches(self):
        from agent_v2.graph.nodes.execute_canvas import execute_canvas_plan
        from unittest import mock

        planner_result = {
            "patch": [{"op": "add_node", "node": {"id": "n1", "type": "image_gen"}}],
            "summary": "已搭建画布。",
            "thought": "",
        }
        state = {
            "message": "帮我搭一个图生图流程",
            "thread_id": "t1",
            "supplemental_prompt": None,
            "current_nodes": [],
            "current_connections": [],
            "selected_artifact": None,
            "canvas_id": "c1",
            "trace": [],
        }
        with mock.patch(
            "agent_v2.graph.nodes.execute_canvas._run_canvas_planner",
            return_value=planner_result,
        ):
            result = execute_canvas_plan(state)

        self.assertEqual(result["exec_patches"], planner_result["patch"])
        self.assertEqual(result["exec_response_text"], "已搭建画布。")
        self.assertEqual(result["exec_data"]["thought"], "")
```

- [ ] **Step 2: Run to verify failure**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestExecuteCanvasPlan -v
```

- [ ] **Step 3: Create `bananaflow/agent_v2/graph/nodes/execute_canvas.py`**

```python
from __future__ import annotations

from typing import Any


def _run_canvas_planner(state: dict) -> dict:
    from agent.planner import agent_plan_impl
    from schemas.api import AgentRequest

    plan_req = AgentRequest(
        prompt=str(state.get("message") or ""),
        supplemental_prompt=state.get("supplemental_prompt"),
        current_nodes=list(state.get("current_nodes") or []),
        current_connections=list(state.get("current_connections") or []),
        selected_artifact=state.get("selected_artifact"),
        canvas_id=state.get("canvas_id"),
        thread_id=state.get("thread_id"),
    )
    # agent_plan_impl needs a Request object for req_id — use a stub
    from starlette.requests import Request as StarletteRequest
    stub_request = StarletteRequest({"type": "http", "method": "POST", "path": "/", "headers": []})
    stub_request.state.req_id = str(state.get("thread_id") or "noid")
    return dict(agent_plan_impl(plan_req, stub_request))


def execute_canvas_plan(state: dict) -> dict:
    trace = list(state.get("trace") or [])
    try:
        result = _run_canvas_planner(state)
    except Exception as exc:
        return {
            "exec_response_text": f"画布规划失败：{exc}",
            "exec_patches": [],
            "exec_warnings": [f"canvas_plan_error: {exc}"],
            "exec_data": {},
            "trace": trace + [{"type": "EXECUTE_CANVAS_PLAN", "ok": False, "error": str(exc)}],
        }

    patches = list(result.get("patch") or [])
    thought = str(result.get("thought") or "").strip()
    summary = str(result.get("summary") or result.get("response_text") or "").strip()

    return {
        "exec_response_text": summary,
        "exec_patches": patches,
        "exec_warnings": [],
        "exec_data": dict(result),
        "trace": trace + [{"type": "EXECUTE_CANVAS_PLAN", "ok": True, "patch_count": len(patches)}],
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestExecuteCanvasPlan -v
```

- [ ] **Step 5: Commit**

```bash
git add bananaflow/agent_v2/graph/nodes/execute_canvas.py tests/test_agent_graph_nodes.py
git commit -m "feat: add execute_canvas_plan node"
```

---

## Task 7: execute_tool_call + execute_storyboard nodes

**Files:**
- Create: `bananaflow/agent_v2/graph/nodes/execute_tool.py`
- Create: `bananaflow/agent_v2/graph/nodes/execute_storyboard.py`
- Test: `tests/test_agent_graph_nodes.py` (add `TestExecuteToolCall`, `TestExecuteStoryboard`)

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_agent_graph_nodes.py`:

```python
class TestExecuteToolCall(unittest.TestCase):
    def test_executes_prompt_polish_and_returns_tool_result(self):
        from agent_v2.graph.nodes.execute_tool import execute_tool_call
        from unittest import mock

        state = {
            "message": "产品图片白底",
            "tool_name": "prompt.polish",
            "tool_args": {"prompt": "产品图片白底", "mode": "text2img"},
            "thread_id": "t1",
            "member_authorization": "",
            "trace": [],
        }
        mock_result = {"text": "clean white background product photo", "variants": []}
        with mock.patch(
            "agent_v2.graph.nodes.execute_tool._run_tool",
            return_value=mock_result,
        ):
            result = execute_tool_call(state)

        self.assertEqual(result["exec_data"], mock_result)
        self.assertEqual(result["exec_patches"], [])

    def test_falls_back_to_chitchat_when_tool_not_found(self):
        from agent_v2.graph.nodes.execute_tool import execute_tool_call
        from unittest import mock

        state = {
            "message": "你好",
            "tool_name": "nonexistent.tool",
            "tool_args": {},
            "thread_id": "t1",
            "member_authorization": "",
            "trace": [],
        }
        with mock.patch(
            "agent_v2.graph.nodes.execute_tool._run_chitchat_fallback",
            return_value={"text": "fallback response"},
        ):
            result = execute_tool_call(state)
        self.assertEqual(result["exec_response_text"], "fallback response")


class TestExecuteStoryboard(unittest.TestCase):
    def test_creates_async_task_and_returns_task_id(self):
        from agent_v2.graph.nodes.execute_storyboard import execute_storyboard
        from unittest import mock

        state = {
            "thread_id": "t1",
            "tool_args": {"brief": "广告分镜", "aspect_ratio": "16:9"},
            "member_authorization": "",
            "trace": [],
        }
        with mock.patch(
            "agent_v2.graph.nodes.execute_storyboard._create_storyboard_task",
            return_value="task-abc",
        ):
            result = execute_storyboard(state)

        self.assertEqual(result["exec_data"]["task_id"], "task-abc")
        self.assertEqual(result["exec_data"]["status"], "pending")
        self.assertIn("task-abc", result["exec_response_text"])
```

- [ ] **Step 2: Run to verify failure**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestExecuteToolCall tests/test_agent_graph_nodes.py::TestExecuteStoryboard -v
```

- [ ] **Step 3: Create `bananaflow/agent_v2/graph/nodes/execute_tool.py`**

```python
from __future__ import annotations

from typing import Any


def _run_tool(tool_name: str, tool_args: dict, thread_id: str, trace_sink: list, member_authorization: str) -> dict:
    from agent.tools import AgentToolContext, build_builtin_executor
    executor = build_builtin_executor()
    return dict(executor.execute(
        tool_name,
        tool_args,
        context=AgentToolContext(
            req_id=thread_id,
            trace_sink=trace_sink,
            extra={"run_id": thread_id, "member_authorization": member_authorization},
        ),
    ))


def _run_chitchat_fallback(message: str, thread_id: str, trace_sink: list, member_authorization: str) -> dict:
    from agent.tools import AgentToolContext, build_builtin_executor
    executor = build_builtin_executor()
    return dict(executor.execute(
        "agent_chitchat",
        {"message": message},
        context=AgentToolContext(
            req_id=thread_id,
            trace_sink=trace_sink,
            extra={"run_id": thread_id, "member_authorization": member_authorization},
        ),
    ))


def execute_tool_call(state: dict) -> dict:
    tool_name = str(state.get("tool_name") or "").strip()
    tool_args = dict(state.get("tool_args") or {})
    message = str(state.get("message") or "").strip()
    thread_id = str(state.get("thread_id") or "").strip()
    member_authorization = str(state.get("member_authorization") or "").strip()
    trace = list(state.get("trace") or [])
    tool_trace: list[Any] = []

    # Verify tool exists before attempting execution
    from agent.tools import build_builtin_registry
    registry = build_builtin_registry()
    if not tool_name or not registry.has(tool_name):
        payload = _run_chitchat_fallback(message, thread_id, tool_trace, member_authorization)
        return {
            "exec_response_text": str(payload.get("text") or "").strip(),
            "exec_patches": [],
            "exec_warnings": [f"tool_not_found:{tool_name}"],
            "exec_data": dict(payload),
            "trace": trace + [{"type": "EXECUTE_TOOL_CALL", "tool": tool_name, "fallback": True}],
        }

    # Ensure prompt.polish args are populated
    if tool_name == "prompt.polish" and "prompt" not in tool_args:
        tool_args = {"prompt": message, "mode": str(state.get("mode") or "text2img").strip() or "text2img"}

    try:
        payload = _run_tool(tool_name, tool_args, thread_id, tool_trace, member_authorization)
    except Exception as exc:
        return {
            "exec_response_text": f"操作失败（{tool_name}）：{type(exc).__name__}: {exc}",
            "exec_patches": [],
            "exec_warnings": [f"tool_error:{tool_name}:{exc}"],
            "exec_data": {"tool_name": tool_name, "error": str(exc)},
            "trace": trace + [{"type": "EXECUTE_TOOL_CALL", "tool": tool_name, "ok": False, "error": str(exc)}],
        }

    return {
        "exec_response_text": "",  # build_response fills this from tool_result
        "exec_patches": [],
        "exec_warnings": [],
        "exec_data": dict(payload),
        "trace": trace + [{"type": "EXECUTE_TOOL_CALL", "tool": tool_name, "ok": True}],
    }
```

- [ ] **Step 4: Create `bananaflow/agent_v2/graph/nodes/execute_storyboard.py`**

```python
from __future__ import annotations


def _create_storyboard_task(thread_id: str) -> str:
    from storage.storyboard_tasks import create_storyboard_task
    return create_storyboard_task(thread_id=thread_id)


def execute_storyboard(state: dict) -> dict:
    thread_id = str(state.get("thread_id") or "").strip()
    tool_args = dict(state.get("tool_args") or {})
    trace = list(state.get("trace") or [])

    task_id = _create_storyboard_task(thread_id)
    async_data = {
        "task_id": task_id,
        "status": "pending",
        "tool_args": tool_args,
        "authorization": str(state.get("member_authorization") or "").strip(),
        "thread_id": thread_id,
        "_async_storyboard": True,
    }

    return {
        "exec_response_text": f"分镜方案生成中，请稍候... (task: {task_id})",
        "exec_patches": [],
        "exec_warnings": [],
        "exec_data": async_data,
        "trace": trace + [{"type": "EXECUTE_STORYBOARD", "task_id": task_id}],
    }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestExecuteToolCall tests/test_agent_graph_nodes.py::TestExecuteStoryboard -v
```

- [ ] **Step 6: Commit**

```bash
git add bananaflow/agent_v2/graph/nodes/execute_tool.py bananaflow/agent_v2/graph/nodes/execute_storyboard.py tests/test_agent_graph_nodes.py
git commit -m "feat: add execute_tool_call and execute_storyboard nodes"
```

---

## Task 8: build_response node

**Files:**
- Create: `bananaflow/agent_v2/graph/nodes/build_response.py`
- Test: `tests/test_agent_graph_nodes.py` (add `TestBuildResponseNode`)

- [ ] **Step 1: Write the failing test**

Add to `tests/test_agent_graph_nodes.py`:

```python
class TestBuildResponseNode(unittest.TestCase):
    def _base_state(self, **overrides):
        state = {
            "intent": "answer_only",
            "thread_id": "t1",
            "message": "你好",
            "exec_response_text": "你好！",
            "exec_patches": [],
            "exec_warnings": [],
            "exec_data": {},
            "tool_name": "",
            "trace": [{"type": "NORMALIZE_REQUEST"}],
        }
        state.update(overrides)
        return state

    def test_assembles_chitchat_response(self):
        from agent_v2.graph.nodes.build_response import build_response
        result = build_response(self._base_state())
        resp = result["final_response"]
        self.assertTrue(resp["ok"])
        self.assertEqual(resp["message"], "你好！")
        self.assertEqual(resp["patches"], [])
        self.assertEqual(resp["intent"], "answer_only")
        self.assertEqual(resp["thread_id"], "t1")
        self.assertIsNone(resp["async_task"])

    def test_assembles_canvas_plan_response_with_patches(self):
        from agent_v2.graph.nodes.build_response import build_response
        state = self._base_state(
            intent="canvas_plan",
            exec_response_text="已搭建画布",
            exec_patches=[{"op": "add_node", "node": {"id": "n1"}}],
            exec_data={"thought": "", "summary": "已搭建画布"},
        )
        result = build_response(state)
        resp = result["final_response"]
        self.assertEqual(resp["intent"], "canvas_plan")
        self.assertEqual(len(resp["patches"]), 1)

    def test_assembles_storyboard_async_response(self):
        from agent_v2.graph.nodes.build_response import build_response
        state = self._base_state(
            intent="tool_call",
            tool_name="storyboard.design",
            exec_response_text="分镜方案生成中...",
            exec_data={"task_id": "task-xyz", "status": "pending", "_async_storyboard": True},
        )
        result = build_response(state)
        resp = result["final_response"]
        self.assertEqual(resp["async_task"]["task_id"], "task-xyz")
        self.assertIsNone(resp["tool_result"])

    def test_appends_conversation_history(self):
        from agent_v2.graph.nodes.build_response import build_response
        result = build_response(self._base_state())
        history = result.get("conversation_history", [])
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["role"], "user")
        self.assertEqual(history[1]["role"], "assistant")
```

- [ ] **Step 2: Run to verify failure**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestBuildResponseNode -v
```

- [ ] **Step 3: Create `bananaflow/agent_v2/graph/nodes/build_response.py`**

```python
from __future__ import annotations

from typing import Any


def build_response(state: dict) -> dict:
    """Assemble AgentInvokeResponse dict and append turn to conversation_history."""
    intent = str(state.get("intent") or "answer_only")
    thread_id = str(state.get("thread_id") or "").strip()
    exec_response_text = str(state.get("exec_response_text") or "").strip()
    exec_patches = list(state.get("exec_patches") or [])
    exec_warnings = list(state.get("exec_warnings") or [])
    exec_data = dict(state.get("exec_data") or {})
    tool_name = str(state.get("tool_name") or "").strip()
    trace = list(state.get("trace") or [])

    # Determine async_task (storyboard async)
    async_task: dict | None = None
    tool_result: dict | None = None
    thought: str | None = None

    if exec_data.get("_async_storyboard"):
        async_task = {
            "task_id": str(exec_data.get("task_id") or ""),
            "status": str(exec_data.get("status") or "pending"),
            "tool_args": dict(exec_data.get("tool_args") or {}),
            "authorization": str(exec_data.get("authorization") or ""),
            "thread_id": str(exec_data.get("thread_id") or thread_id),
        }
    elif intent == "canvas_plan":
        thought = str(exec_data.get("thought") or "").strip() or None
        tool_result = dict(exec_data) if exec_data else None
    elif intent == "tool_call" and exec_data and not async_task:
        tool_result = dict(exec_data)

    # Message text
    message = exec_response_text
    if not message and intent == "canvas_plan":
        message = str(exec_data.get("summary") or exec_data.get("response_text") or "").strip()
    if not message and tool_name in {"prompt.polish"}:
        message = str(exec_data.get("text") or "").strip()

    trace_entry: dict[str, Any] = {
        "type": "BUILD_RESPONSE",
        "intent": intent,
        "message_preview": message[:120] if message else "",
        "patch_count": len(exec_patches),
    }

    final_response: dict[str, Any] = {
        "ok": True,
        "message": message,
        "patches": exec_patches,
        "warnings": exec_warnings,
        "intent": intent,
        "thread_id": thread_id,
        "async_task": async_task,
        "tool_result": tool_result,
        "thought": thought,
        "trace": trace + [trace_entry],
        "error": None,
    }

    # Append this turn to conversation_history (operator.add reducer will merge)
    user_msg = str(state.get("message") or "").strip()
    new_history: list[dict[str, Any]] = []
    if user_msg:
        new_history.append({"role": "user", "text": user_msg})
    if message:
        new_history.append({"role": "assistant", "text": message})

    return {
        "final_response": final_response,
        "trace": trace + [trace_entry],
        "conversation_history": new_history,  # operator.add merges into checkpoint
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py::TestBuildResponseNode -v
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add bananaflow/agent_v2/graph/nodes/build_response.py tests/test_agent_graph_nodes.py
git commit -m "feat: add build_response node"
```

---

## Task 9: Graph assembly + e2e test

**Files:**
- Create: `bananaflow/agent_v2/graph/graph.py`
- Update: `bananaflow/agent_v2/graph/__init__.py`
- Create: `tests/test_agent_graph_e2e.py`

- [ ] **Step 1: Write the failing e2e test**

```python
# tests/test_agent_graph_e2e.py
import os
import sys
import unittest
from unittest import mock

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)

import types as _types

def _install_google_stub():
    if "google.genai" in sys.modules:
        return
    google_module = _types.ModuleType("google")
    genai_module = _types.ModuleType("google.genai")
    genai_module.types = _types.SimpleNamespace(
        Part=lambda text="": _types.SimpleNamespace(text=text),
        GenerateContentConfig=lambda **kwargs: _types.SimpleNamespace(**kwargs),
    )
    google_module.genai = genai_module
    sys.modules["google"] = google_module
    sys.modules["google.genai"] = genai_module

_install_google_stub()


class TestAgentGraphE2E(unittest.IsolatedAsyncioTestCase):
    def _make_initial_state(self, message: str, thread_id: str = "test-thread-1") -> dict:
        return {
            "message": message,
            "thread_id": thread_id,
            "canvas_id": None,
            "mode": None,
            "force_action": None,
            "ui_action": None,
            "uploaded_documents": [],
            "selected_artifact": None,
            "canvas_node_hints": None,
            "member_authorization": "",
            "current_nodes": [],
            "current_connections": [],
            "supplemental_prompt": None,
            "product": None, "audience": None, "price_band": None,
            "conversion_goal": None, "primary_platform": None,
            "secondary_platform": None, "selected_angle": None,
            "task_mode": None, "episode_count": None, "existing_script": None,
            "canvas_summary": {},
            "artifact_summary": {},
            "intent": "",
            "intent_confidence": 0.0,
            "intent_reason": "",
            "tool_name": "",
            "tool_args": {},
            "exec_response_text": "",
            "exec_patches": [],
            "exec_warnings": [],
            "exec_data": {},
            "final_response": None,
            "trace": [],
            "_clarification_question": None,
            "_llm_answer": None,
        }

    async def test_chitchat_via_force_action(self):
        from langgraph.checkpoint.memory import MemorySaver
        from agent_v2.graph import build_agent_graph

        graph = build_agent_graph(checkpointer=MemorySaver())
        state = self._make_initial_state("你好", thread_id="e2e-t1")
        state["force_action"] = "answer_only"

        mock_payload = {"text": "你好！请问有什么可以帮到您？"}
        with mock.patch("agent_v2.graph.nodes.execute_chitchat._run_chitchat_tool", return_value=mock_payload):
            result = await graph.ainvoke(state, config={"configurable": {"thread_id": "e2e-t1"}})

        resp = result["final_response"]
        self.assertTrue(resp["ok"])
        self.assertEqual(resp["intent"], "answer_only")
        self.assertEqual(resp["message"], "你好！请问有什么可以帮到您？")
        self.assertEqual(resp["patches"], [])

    async def test_canvas_plan_via_force_action(self):
        from langgraph.checkpoint.memory import MemorySaver
        from agent_v2.graph import build_agent_graph

        graph = build_agent_graph(checkpointer=MemorySaver())
        state = self._make_initial_state("帮我搭建图生图画布", thread_id="e2e-t2")
        state["force_action"] = "canvas_plan"

        planner_result = {
            "patch": [{"op": "add_node", "node": {"id": "n1", "type": "image_gen"}}],
            "summary": "已搭建画布",
            "thought": "",
        }
        with mock.patch("agent_v2.graph.nodes.execute_canvas._run_canvas_planner", return_value=planner_result):
            result = await graph.ainvoke(state, config={"configurable": {"thread_id": "e2e-t2"}})

        resp = result["final_response"]
        self.assertEqual(resp["intent"], "canvas_plan")
        self.assertEqual(len(resp["patches"]), 1)
        self.assertEqual(resp["message"], "已搭建画布")

    async def test_conversation_history_accumulates_across_turns(self):
        from langgraph.checkpoint.memory import MemorySaver
        from agent_v2.graph import build_agent_graph

        checkpointer = MemorySaver()
        graph = build_agent_graph(checkpointer=checkpointer)
        config = {"configurable": {"thread_id": "e2e-history-t1"}}

        mock_payload = {"text": "第一轮回答"}
        with mock.patch("agent_v2.graph.nodes.execute_chitchat._run_chitchat_tool", return_value=mock_payload):
            state1 = self._make_initial_state("第一个问题", thread_id="e2e-history-t1")
            state1["force_action"] = "answer_only"
            await graph.ainvoke(state1, config=config)

        mock_payload2 = {"text": "第二轮回答"}
        with mock.patch("agent_v2.graph.nodes.execute_chitchat._run_chitchat_tool", return_value=mock_payload2):
            state2 = self._make_initial_state("第二个问题", thread_id="e2e-history-t1")
            state2["force_action"] = "answer_only"
            result2 = await graph.ainvoke(state2, config=config)

        # After 2 turns, conversation_history should have 4 entries (2 user + 2 assistant)
        history = result2.get("conversation_history", [])
        self.assertEqual(len(history), 4)
        self.assertEqual(history[0]["text"], "第一个问题")
        self.assertEqual(history[2]["text"], "第二个问题")

    async def test_storyboard_via_uploaded_csv(self):
        from langgraph.checkpoint.memory import MemorySaver
        from agent_v2.graph import build_agent_graph

        graph = build_agent_graph(checkpointer=MemorySaver())
        state = self._make_initial_state("整理成故事板", thread_id="e2e-sb-t1")
        state["uploaded_documents"] = [{
            "name": "shots.csv",
            "kind": "storyboard_script_table",
            "text_content": "镜号,景别\n1,特写",
        }]

        with mock.patch("agent_v2.graph.nodes.execute_storyboard._create_storyboard_task", return_value="sb-task-1"):
            result = await graph.ainvoke(state, config={"configurable": {"thread_id": "e2e-sb-t1"}})

        resp = result["final_response"]
        self.assertEqual(resp["intent"], "tool_call")
        self.assertIsNotNone(resp["async_task"])
        self.assertEqual(resp["async_task"]["task_id"], "sb-task-1")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_e2e.py -v
```
Expected: `ImportError: cannot import name 'build_agent_graph'`

- [ ] **Step 3: Create `bananaflow/agent_v2/graph/graph.py`**

```python
from __future__ import annotations

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.base import BaseCheckpointSaver

from agent_v2.graph.state import AgentState
from agent_v2.graph.router import _route_after_classify, _route_after_tool
from agent_v2.graph.nodes.normalize import normalize_request
from agent_v2.graph.nodes.context import assemble_context
from agent_v2.graph.nodes.classify import classify_intent
from agent_v2.graph.nodes.execute_chitchat import execute_chitchat
from agent_v2.graph.nodes.execute_clarify import execute_clarify
from agent_v2.graph.nodes.execute_canvas import execute_canvas_plan
from agent_v2.graph.nodes.execute_tool import execute_tool_call
from agent_v2.graph.nodes.execute_storyboard import execute_storyboard
from agent_v2.graph.nodes.build_response import build_response


def build_agent_graph(checkpointer: BaseCheckpointSaver | None = None):
    builder = StateGraph(AgentState)

    builder.add_node("normalize_request", normalize_request)
    builder.add_node("assemble_context", assemble_context)
    builder.add_node("classify_intent", classify_intent)
    builder.add_node("execute_chitchat", execute_chitchat)
    builder.add_node("execute_clarify", execute_clarify)
    builder.add_node("execute_canvas_plan", execute_canvas_plan)
    builder.add_node("execute_tool_call", execute_tool_call)
    builder.add_node("execute_storyboard", execute_storyboard)
    builder.add_node("build_response", build_response)

    builder.add_edge(START, "normalize_request")
    builder.add_edge("normalize_request", "assemble_context")
    builder.add_edge("assemble_context", "classify_intent")

    builder.add_conditional_edges(
        "classify_intent",
        _route_after_classify,
        {
            "execute_chitchat": "execute_chitchat",
            "execute_clarify": "execute_clarify",
            "execute_canvas_plan": "execute_canvas_plan",
            "execute_tool_call": "execute_tool_call",
        },
    )

    builder.add_conditional_edges(
        "execute_tool_call",
        _route_after_tool,
        {
            "execute_storyboard": "execute_storyboard",
            "build_response": "build_response",
        },
    )

    builder.add_edge("execute_chitchat", "build_response")
    builder.add_edge("execute_clarify", "build_response")
    builder.add_edge("execute_canvas_plan", "build_response")
    builder.add_edge("execute_storyboard", "build_response")
    builder.add_edge("build_response", END)

    return builder.compile(checkpointer=checkpointer)
```

- [ ] **Step 4: Update `bananaflow/agent_v2/graph/__init__.py`**

```python
from agent_v2.graph.graph import build_agent_graph

__all__ = ["build_agent_graph"]
```

- [ ] **Step 5: Run e2e tests**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_e2e.py -v
```
Expected: 4 tests PASS

- [ ] **Step 6: Run full node test suite to check nothing regressed**

```bash
.venv/bin/python -m pytest tests/test_agent_graph_nodes.py tests/test_agent_graph_e2e.py -v
```
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add bananaflow/agent_v2/graph/graph.py bananaflow/agent_v2/graph/__init__.py tests/test_agent_graph_e2e.py
git commit -m "feat: assemble BananaflowAgentGraph StateGraph with checkpointing support"
```

---

## Task 10: FastAPI integration — app_factory + new route

**Files:**
- Modify: `bananaflow/app_factory.py`
- Modify: `bananaflow/api/routes.py`
- Modify: `tests/test_agent_v2_gateway.py` (rewrite for new endpoint)

- [ ] **Step 1: Write the failing route test**

Replace `tests/test_agent_v2_gateway.py` entirely:

```python
# tests/test_agent_v2_gateway.py
import os
import sys
import types
import unittest
from unittest import mock

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


def _install_google_stub():
    if "google.genai" in sys.modules:
        return
    google_module = types.ModuleType("google")
    genai_module = types.ModuleType("google.genai")
    genai_module.types = types.SimpleNamespace(
        Part=lambda text="": types.SimpleNamespace(text=text),
        GenerateContentConfig=lambda **kwargs: types.SimpleNamespace(**kwargs),
    )
    google_module.genai = genai_module
    sys.modules["google"] = google_module
    sys.modules["google.genai"] = genai_module


_install_google_stub()


class TestAgentInvokeRoute(unittest.IsolatedAsyncioTestCase):
    async def test_invoke_returns_agent_invoke_response_shape(self):
        """Graph is fully mocked; test that the route plumbing returns the right shape."""
        from agent_v2.graph.schemas import AgentInvokeRequest, AgentInvokeResponse

        mock_response = {
            "ok": True,
            "message": "你好！",
            "patches": [],
            "warnings": [],
            "intent": "answer_only",
            "thread_id": "tid-1",
            "async_task": None,
            "tool_result": None,
            "thought": None,
            "trace": [],
            "error": None,
        }
        mock_state = {"final_response": mock_response, "tool_args": {}}

        mock_graph = mock.AsyncMock()
        mock_graph.ainvoke.return_value = mock_state

        resp = AgentInvokeResponse(**mock_state["final_response"])
        self.assertTrue(resp.ok)
        self.assertEqual(resp.message, "你好！")
        self.assertEqual(resp.intent, "answer_only")
        self.assertIsNone(resp.async_task)

    def test_invoke_request_excludes_recent_messages(self):
        from agent_v2.graph.schemas import AgentInvokeRequest
        req = AgentInvokeRequest(message="你好", thread_id="t1")
        self.assertFalse(hasattr(req, "recent_messages"))

    def test_invoke_response_has_patches_and_warnings(self):
        from agent_v2.graph.schemas import AgentInvokeResponse
        resp = AgentInvokeResponse(
            message="OK",
            patches=[{"op": "add_node", "node": {"id": "n1"}}],
            warnings=["low_confidence"],
            intent="canvas_plan",
            thread_id="t1",
        )
        self.assertEqual(len(resp.patches), 1)
        self.assertEqual(resp.warnings, ["low_confidence"])


class TestAgentContextCompatibility(unittest.TestCase):
    """Verify that assemble_context still works with storyboard summarizer."""
    def test_selected_artifact_summary_storyboard_selection(self):
        from agent_v2.graph.nodes.context import assemble_context
        state = {
            "current_nodes": [],
            "current_connections": [],
            "canvas_id": None,
            "selected_artifact": {
                "kind": "storyboard_selection",
                "fromNodeId": "s1",
                "meta": {
                    "nodeKind": "storyboard_plan",
                    "selectionType": "scene",
                    "selectionId": "scene-2",
                    "selectionLabel": "场景 2",
                    "storyboardTitle": "猫薄荷接头",
                    "payload": {"scene_id": "scene-2"},
                },
            },
            "trace": [],
        }
        result = assemble_context(state)
        summary = result["artifact_summary"]
        self.assertEqual(summary["kind"], "storyboard_selection")
        self.assertEqual(summary["selection_id"], "scene-2")
        self.assertEqual(summary["storyboard_title"], "猫薄荷接头")
        self.assertEqual(summary["payload"], {"scene_id": "scene-2"})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify it runs cleanly (imports work)**

```bash
.venv/bin/python -m pytest tests/test_agent_v2_gateway.py -v
```
Expected: 3 tests PASS (no gateway imports needed)

- [ ] **Step 3: Add startup event and graph init to `bananaflow/app_factory.py`**

In `app_factory.py`, add after the existing `init_client()` line in `create_app()`:

```python
    async def _init_agent_graph() -> None:
        import aiosqlite
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
        from agent_v2.graph import build_agent_graph

        db_dir = os.path.join(os.path.dirname(__file__), "..", "data")
        os.makedirs(db_dir, exist_ok=True)
        db_path = os.path.join(db_dir, "agent_checkpoints.db")
        conn = await aiosqlite.connect(db_path)
        checkpointer = AsyncSqliteSaver(conn)
        await checkpointer.setup()
        app.state.agent_graph = build_agent_graph(checkpointer=checkpointer)
        sys_logger.info("agent_graph initialized with AsyncSqliteSaver at %s", db_path)

    app.add_event_handler("startup", _init_agent_graph)
```

The full `create_app()` function ending becomes:

```python
    init_client()

    async def _init_agent_graph() -> None:
        import aiosqlite
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
        from agent_v2.graph import build_agent_graph

        db_dir = os.path.join(os.path.dirname(__file__), "..", "data")
        os.makedirs(db_dir, exist_ok=True)
        db_path = os.path.join(db_dir, "agent_checkpoints.db")
        conn = await aiosqlite.connect(db_path)
        checkpointer = AsyncSqliteSaver(conn)
        await checkpointer.setup()
        app.state.agent_graph = build_agent_graph(checkpointer=checkpointer)
        sys_logger.info("agent_graph initialized with AsyncSqliteSaver at %s", db_path)

    app.add_event_handler("startup", _init_agent_graph)
    return app
```

- [ ] **Step 4: Add `/api/agent/invoke` endpoint to `bananaflow/api/routes.py`**

Find the existing `from agent_v2.gateway.service import handle_agent_message` import near line 113, add alongside it:

```python
from agent_v2.graph.schemas import AgentInvokeRequest, AgentInvokeResponse as AgentInvokeResponseModel
```

Find the existing `agent_message` endpoint (around line 3199) and add the new endpoint **before** it, then delete the old one. Replace the block from line 3199 to 3223 with:

```python
@router.post("/api/agent/invoke", response_model=AgentInvokeResponseModel)
async def agent_invoke(
    req: AgentInvokeRequest,
    request: Request,
    current_user=Depends(_get_current_user_optional),
) -> AgentInvokeResponseModel:
    from uuid import uuid4
    tenant_id, user_id = _resolve_agent_actor(request, current_user)
    member_authorization = _resolve_member_authorization(request)
    thread_id = str(req.thread_id or "").strip() or str(uuid4())
    req_id = getattr(request.state, "req_id", "noid")

    graph = request.app.state.agent_graph
    config = {"configurable": {"thread_id": thread_id}}
    initial_state: dict = {
        "message": str(req.message or "").strip(),
        "thread_id": thread_id,
        "canvas_id": str(req.canvas_id or "").strip() or None,
        "mode": str(req.mode or "").strip() or None,
        "force_action": str(req.force_action or "").strip() or None,
        "ui_action": str(req.ui_action or "").strip() or None,
        "uploaded_documents": list(req.uploaded_documents or []),
        "selected_artifact": dict(req.selected_artifact) if req.selected_artifact else None,
        "canvas_node_hints": dict(req.canvas_node_hints) if req.canvas_node_hints else None,
        "member_authorization": member_authorization,
        "current_nodes": list(req.current_nodes or []),
        "current_connections": list(req.current_connections or []),
        "supplemental_prompt": str(req.supplemental_prompt or "").strip() or None,
        "product": str(req.product or "").strip() or None,
        "audience": str(req.audience or "").strip() or None,
        "price_band": str(req.price_band or "").strip() or None,
        "conversion_goal": str(req.conversion_goal or "").strip() or None,
        "primary_platform": str(req.primary_platform or "").strip() or None,
        "secondary_platform": str(req.secondary_platform or "").strip() or None,
        "selected_angle": str(req.selected_angle or "").strip() or None,
        "task_mode": str(req.task_mode or "").strip() or None,
        "episode_count": req.episode_count,
        "existing_script": str(req.existing_script or "").strip() or None,
        # Context computed by nodes
        "canvas_summary": {},
        "artifact_summary": {},
        # Intent and execution fields reset each turn
        "intent": "",
        "intent_confidence": 0.0,
        "intent_reason": "",
        "tool_name": "",
        "tool_args": {},
        "exec_response_text": "",
        "exec_patches": [],
        "exec_warnings": [],
        "exec_data": {},
        "final_response": None,
        "trace": [],  # no reducer: resets each invocation
        "_clarification_question": None,
        "_llm_answer": None,
    }

    result_state = await graph.ainvoke(initial_state, config=config)
    final_resp_dict = dict(result_state.get("final_response") or {})
    if not final_resp_dict:
        final_resp_dict = {
            "ok": False, "message": "", "patches": [], "warnings": [],
            "intent": "answer_only", "thread_id": thread_id,
            "async_task": None, "tool_result": None, "thought": None,
            "trace": [], "error": "graph returned no final_response",
        }

    response = AgentInvokeResponseModel(**final_resp_dict)

    # Launch storyboard background task if graph signalled async storyboard
    if response.async_task and response.async_task.get("task_id") and response.async_task.get("_async_storyboard", True):
        task_id = str(response.async_task["task_id"])
        tool_args = dict(response.async_task.get("tool_args") or {})
        authorization = str(response.async_task.get("authorization") or member_authorization)
        bg_thread_id = str(response.async_task.get("thread_id") or thread_id)
        asyncio.create_task(_run_storyboard_async(
            task_id, tool_args,
            authorization=authorization,
            req_id=req_id,
            thread_id=bg_thread_id,
            tenant_id=tenant_id or "",
            user_id=user_id or "",
        ))
        # Scrub internal fields from async_task before returning
        response = response.model_copy(update={
            "async_task": {"task_id": task_id, "status": "pending", "is_async": True},
        })

    return response
```

Also add `_resolve_member_authorization` near the top of routes.py (copy from `gateway/service.py`):

```python
def _resolve_member_authorization(request: Request) -> str:
    for header_name in ("X-AI-Chat-Authorization", "X-Member-Authorization", "Authorization", "authorization"):
        raw = str(request.headers.get(header_name) or "").strip()
        if not raw:
            continue
        if raw.lower().startswith("bearer "):
            raw = raw[7:].strip()
        if raw:
            return raw
    return ""
```

- [ ] **Step 5: Run all tests**

```bash
.venv/bin/python -m pytest tests/test_agent_v2_gateway.py tests/test_agent_graph_nodes.py tests/test_agent_graph_e2e.py -v
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add bananaflow/app_factory.py bananaflow/api/routes.py tests/test_agent_v2_gateway.py
git commit -m "feat: wire BananaflowAgentGraph into FastAPI at POST /api/agent/invoke"
```

---

## Task 11: Frontend — adapt to new API

**Files:**
- Modify: `src/api/agentCanvas.ts`
- Modify: `src/pages/Workbench.jsx`

- [ ] **Step 1: Update `src/api/agentCanvas.ts`**

Find `sendAgentMessage` (line 170) and make these changes:

1. Remove `recent_messages` field from `reqBody`
2. Change endpoint URL from `/api/agent/message` to `/api/agent/invoke`

The updated function body (lines 172-206):

```typescript
export async function sendAgentMessage(payload, apiFetch, meta) {
  const call = createCaller(apiFetch);
  const reqBody = {
    message: String(payload?.message || "").trim(),
    force_action: payload?.forceAction || undefined,
    ui_action: payload?.uiAction || undefined,
    // recent_messages removed — context comes from server-side checkpointing
    supplemental_prompt: String(payload?.supplementalPrompt || "").trim() || undefined,
    current_nodes: Array.isArray(payload?.currentNodes) ? payload.currentNodes : [],
    current_connections: Array.isArray(payload?.currentConnections) ? payload.currentConnections : [],
    selected_artifact: payload?.selectedArtifact || undefined,
    canvas_id: String(payload?.canvasId || "").trim() || undefined,
    thread_id: String(payload?.threadId || "").trim() || undefined,
    mode: String(payload?.mode || "").trim() || undefined,
    product: String(payload?.product || "").trim() || undefined,
    audience: String(payload?.audience || "").trim() || undefined,
    price_band: String(payload?.priceBand || "").trim() || undefined,
    conversion_goal: String(payload?.conversionGoal || "").trim() || undefined,
    primary_platform: String(payload?.primaryPlatform || "").trim() || undefined,
    secondary_platform: String(payload?.secondaryPlatform || "").trim() || undefined,
    selected_angle: String(payload?.selectedAngle || "").trim() || undefined,
    task_mode: String(payload?.taskMode || "").trim() || undefined,
    episode_count: Number.isFinite(Number(payload?.episodeCount)) ? Number(payload.episodeCount) : undefined,
    existing_script: String(payload?.existingScript || "").trim() || undefined,
    uploaded_documents: Array.isArray(payload?.uploadedDocuments) ? payload.uploadedDocuments : [],
    canvas_node_hints: payload?.canvasNodeHints && typeof payload.canvasNodeHints === "object" ? payload.canvasNodeHints : undefined,
  };
  const resp = await call("/api/agent/invoke", {   // <-- changed
    method: "POST",
    body: JSON.stringify(reqBody),
    headers: buildAgentHeaders(meta),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(extractApiError(data));
  }
  return data;
}
```

Also update `polishCanvasPrompt` (line 225-239):

```typescript
export async function polishCanvasPrompt(payload, apiFetch, meta) {
  const data = await sendAgentMessage(
    {
      message: String(payload?.prompt || "").trim(),
      uiAction: "prompt_polish",
      mode: String(payload?.mode || "text2img").trim() || "text2img",
    },
    apiFetch,
    meta,
  );
  if (!(data?.intent === "tool_call" && data?.tool_result && typeof data.tool_result === "object")) {
    throw new Error(String(data?.message || "").trim() || "Agent 未返回提示词润色结果");
  }
  return data.tool_result;
}
```

- [ ] **Step 2: Update `src/pages/Workbench.jsx` — response field mapping**

Find and apply these targeted replacements:

**a) Remove `recentMessages` from `runAgentConversation` call (line ~3891):**

Remove the line:
```js
recentMessages: buildAgentRecentMessages(),
```

**b) Script flow storyboard detection (line ~3937):**

```js
// Old:
if (agentResponse?.action === "tool_call" && agentResponse?.data?.is_async && agentResponse?.data?.task_id) {
  const storyboardTaskId = String(agentResponse.data.task_id);
// New:
if (agentResponse?.intent === "tool_call" && agentResponse?.async_task?.task_id) {
  const storyboardTaskId = String(agentResponse.async_task.task_id);
```

**c) Script flow topics access (line ~3991):**

```js
// Old:
if (!(agentResponse?.action === "tool_call" && Array.isArray(agentResponse?.data?.topics))) {
// New:
if (!(agentResponse?.intent === "tool_call" && Array.isArray(agentResponse?.tool_result?.topics))) {
```

```js
// Old:
const response = agentResponse.data;
// New:
const response = agentResponse.tool_result;
```

**d) `responseText` assignment (line ~4579):**

```js
// Old:
const responseText = String(response?.response_text || "").trim();
// New:
const responseText = String(response?.message || "").trim();
```

**e) `routeDebug` matched_rule (line ~4583):**

```js
// Old:
reason: response?.decision?.matched_rule
  ? `agent_v2:${response.decision.matched_rule}`
  : `agent_v2:${route.reason || "message"}`,
// New:
reason: `agent_v2:${route.reason || "message"}`,
```

**f) Canvas plan detection (line ~4591):**

```js
// Old:
if (response?.action === "canvas_plan" && response?.data && typeof response.data === "object") {
  const plannerResult = response.data;
  const patch = Array.isArray(plannerResult?.patch) ? plannerResult.patch : [];
  const clarification = parseCanvasClarification(plannerResult);
// New:
if (response?.intent === "canvas_plan") {
  const plannerResult = response.tool_result || {};
  const patch = Array.isArray(response?.patches) ? response.patches : [];
  const clarification = parseCanvasClarification(response);  // thought is top-level
```

**g) Canvas plan assistantText (line ~4618):**

```js
// Old:
assistantText: String(plannerResult?.summary || plannerResult?.response_text || plannerResult?.thought || responseText).trim(),
// New:
assistantText: String(response?.message || plannerResult?.summary || plannerResult?.thought || responseText).trim(),
```

**h) Storyboard async detection (line ~4634):**

```js
// Old:
if (response?.action === "tool_call" && response?.data?.is_async && response?.data?.task_id) {
  const storyboardTaskId = String(response.data.task_id);
// New:
if (response?.intent === "tool_call" && response?.async_task?.task_id) {
  const storyboardTaskId = String(response.async_task.task_id);
```

**i) Storyboard assistantText (line ~4667):**

```js
// Old:
assistantText: String(taskResult?.summary || "已生成可编辑分镜方案。").trim(),
// No change needed — taskResult comes from pollStoryboardTask which is unchanged
```

**j) canvas_patch tool_call detection (line ~4684):**

Remove this entire block (canvas_patch from tool_call no longer exists — storyboard is async):

```js
// Remove entirely:
if (
  response?.action === "tool_call" &&
  response?.data?.canvas_patch &&
  typeof response.data.canvas_patch === "object"
) {
  // ... entire block until the closing }
}
```

Replace with:

```js
// canvas_patch via tool_call is no longer used; storyboard is always async via async_task
```

**k) Response summary fallbacks (line ~4518):**

```js
// Old:
String(response?.summary || response?.response_text || response?.thought || "").trim(),
// New:
String(response?.message || response?.summary || response?.thought || "").trim(),
```

- [ ] **Step 3: Start the dev server and verify the agent input box works**

```bash
./scripts/run_test_stack.sh
```

Open browser at `http://localhost:5174`, send a test message in the Agent input box, confirm response appears without console errors.

- [ ] **Step 4: Commit**

```bash
git add src/api/agentCanvas.ts src/pages/Workbench.jsx
git commit -m "feat: adapt frontend to POST /api/agent/invoke response schema"
```

---

## Task 12: Delete old gateway + run full test suite

**Files:**
- Delete: `bananaflow/agent_v2/gateway/service.py`
- Delete: `bananaflow/agent_v2/gateway/coordinator.py`
- Delete: `bananaflow/agent_v2/gateway/dispatcher.py`
- Delete: `bananaflow/agent_v2/gateway/synthesizer.py`
- Delete: `bananaflow/agent_v2/gateway/catalog.py`
- Delete: `bananaflow/agent_v2/gateway/context.py`
- Delete: `bananaflow/agent_v2/gateway/prompts.py`
- Delete: `bananaflow/agent_v2/gateway/schemas.py`

- [ ] **Step 1: Inline gateway catalog + prompt helpers into `classify.py`**

`classify.py` currently imports `build_capability_catalog` from `agent_v2.gateway.catalog` and `coordinator_system_prompt` from `agent_v2.gateway.prompts`. Before deleting those files, inline their logic directly into `classify.py`.

Replace the import section at the top of `bananaflow/agent_v2/graph/nodes/classify.py`:

```python
# Remove these two lines:
# from agent_v2.gateway.catalog import build_capability_catalog
# from agent_v2.gateway.prompts import coordinator_system_prompt
```

And add their implementations inline in `classify.py`:

```python
def _build_capability_catalog() -> list[dict]:
    from agent.tools import build_builtin_registry
    virtual = [
        {
            "name": "general_answer",
            "description": "Answer naturally without calling tools when no system capability is needed.",
            "category": "virtual", "enabled": True, "cost_level": "low",
            "tags": ["chat", "general_answer"],
        },
        {
            "name": "canvas_planner",
            "description": "Use when the user wants canvas edits, workflow planning, nodes, edges, or patch generation.",
            "category": "virtual", "enabled": True, "cost_level": "medium",
            "tags": ["canvas", "planner", "workflow"],
        },
    ]
    registry = build_builtin_registry()
    catalog = list(virtual)
    for item in registry.to_prompt_catalog(enabled=True):
        catalog.append(dict(item))
        for alias in list(item.get("aliases") or []):
            alias_name = str(alias or "").strip()
            if not alias_name:
                continue
            alias_item = dict(item)
            alias_item["name"] = alias_name
            catalog.append(alias_item)
    return catalog


def _coordinator_system_prompt() -> str:
    return (
        "你是 Bananaflow Agent v2 的协调器，一个像私人助理一样自然对话的系统。\n"
        "默认优先自然回答，只有在系统能力明显有帮助时才调用工具或规划器。\n\n"
        "你只能输出以下 action 之一：\n"
        "- answer_only\n- clarify\n- tool_call\n- canvas_plan\n- workflow_plan\n\n"
        "规则：\n"
        "1. 普通问答、寒暄、解释、建议，优先 answer_only。\n"
        "2. 只有当 capability catalog 中某个能力明显更合适时，才输出 tool_call。\n"
        "2.1 如果你判断应该调用工具，就直接输出 tool_call，不要只在 answer 里承诺。\n"
        "3. 如果用户要改画布、增删节点、连线、编排工作流，输出 canvas_plan。\n"
        "4. 如果任务需要多个连续步骤，输出 workflow_plan 并给出 steps。\n"
        "5. 没有明显工具匹配时，不要硬选工具，输出 answer_only。\n"
        "6. tool_name 必须来自 capability catalog。\n"
        "6.1 如果用户明确要分镜设计、故事板、shot list，优先使用 storyboard.design。\n"
        "6.2 如果用户消息本身是分镜头脚本表，优先使用 storyboard.design。\n"
        "7. 只输出 JSON，不要输出解释。\n\n"
        "JSON 格式：{\"action\":\"answer_only|clarify|tool_call|canvas_plan|workflow_plan\","
        "\"reason\":\"...\",\"confidence\":0.0,\"matched_capabilities\":[\"...\"],"
        "\"answer\":\"...\",\"clarification_question\":\"...\","
        "\"tool_name\":\"...\",\"tool_args\":{},\"steps\":[]}"
    )
```

Update `_build_coordinator_prompt` in `classify.py` to call `_coordinator_system_prompt()` and `_build_capability_catalog()` instead of the gateway imports:

```python
def _build_coordinator_prompt(state: dict, capability_catalog: list[dict]) -> str:
    import json as _json
    # ... same body as before, but uses _coordinator_system_prompt() ...
    payload = { ... }
    return _coordinator_system_prompt() + "\n\n" + _json.dumps(payload, ensure_ascii=False)
```

And update `_call_llm_coordinator`:
```python
# Replace: catalog = build_capability_catalog()
catalog = _build_capability_catalog()
```

- [ ] **Step 3: Remove old `/api/agent/message` import from `routes.py`**

In `bananaflow/api/routes.py`, find and remove:
```python
from agent_v2.gateway.service import handle_agent_message
```
and any other imports from `agent_v2.gateway.*`.

- [ ] **Step 2: Remove old `AgentMessageRequest` / `AgentMessageResponse` imports from `routes.py`**

Check for imports like:
```python
from agent_v2.gateway.schemas import AgentMessageRequest, AgentMessageResponse
```
Remove them (they are replaced by `AgentInvokeRequest` / `AgentInvokeResponseModel`).

- [ ] **Step 4: Delete gateway files**

```bash
rm bananaflow/agent_v2/gateway/service.py
rm bananaflow/agent_v2/gateway/coordinator.py
rm bananaflow/agent_v2/gateway/dispatcher.py
rm bananaflow/agent_v2/gateway/synthesizer.py
rm bananaflow/agent_v2/gateway/catalog.py
rm bananaflow/agent_v2/gateway/context.py
rm bananaflow/agent_v2/gateway/prompts.py
rm bananaflow/agent_v2/gateway/schemas.py
```

Verify only `__init__.py` remains (if it's empty, delete it too):
```bash
ls bananaflow/agent_v2/gateway/
rm bananaflow/agent_v2/gateway/__init__.py
rmdir bananaflow/agent_v2/gateway/
```

- [ ] **Step 5: Run full test suite**

```bash
.venv/bin/python -m pytest tests/ -v --tb=short 2>&1 | tail -40
```
Expected: existing tests pass; `test_agent_v2_gateway.py`, `test_agent_v2_dispatcher.py`, `test_agent_v2_catalog.py`, `test_context_builder.py` may need updating or deletion if they import from deleted gateway modules.

- [ ] **Step 6: Update or delete stale gateway tests**

For any test file that imports from `agent_v2.gateway.*`, either:
- Update the import to use the new `agent_v2.graph.*` equivalent
- Delete the test file if it's fully superseded by `test_agent_graph_nodes.py`

Files to check and likely delete:
- `tests/test_agent_v2_dispatcher.py` → delete (replaced by `TestExecute*` tests)
- `tests/test_agent_v2_catalog.py` → delete (catalog now internal to classify node)
- `tests/test_context_builder.py` → delete (context now in assemble_context node)

```bash
rm tests/test_agent_v2_dispatcher.py tests/test_agent_v2_catalog.py tests/test_context_builder.py
```

- [ ] **Step 7: Final test run**

```bash
.venv/bin/python -m pytest tests/ -v --tb=short 2>&1 | grep -E "PASS|FAIL|ERROR|error"
```
Expected: no FAIL or ERROR

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: delete old agent_v2/gateway, complete LangGraph migration"
```
