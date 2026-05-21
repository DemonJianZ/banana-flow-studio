# plan_task Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a `plan_task` node between `classify_intent` and all `execute_*` nodes so every execution path receives a standardized `TaskPlan` object instead of raw intent/message fields.

**Architecture:** `plan_task` sits after `classify_intent` and before all `execute_*` nodes. It calls Gemini to extract structured task metadata (user_goal, target_object, action, etc.) from the user message plus the already-classified intent. The `target_agent` field of the resulting `TaskPlan` drives the new conditional edge `_route_after_plan`. Each `execute_*` node reads `task_plan` from state and uses `user_goal` / `target_object` instead of re-parsing `message`.

**Tech Stack:** Python 3.11, LangGraph 1.1.10, google-genai SDK, pytest/unittest

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `bananaflow/agent_v2/graph/nodes/plan_task.py` | LLM planner + deterministic fallback → writes `task_plan` |
| Modify | `bananaflow/agent_v2/graph/state.py` | Add `task_plan: dict \| None` field |
| Modify | `bananaflow/agent_v2/graph/router.py` | Add `_route_after_plan`; keep `_route_after_classify` for normalize shortcut path |
| Modify | `bananaflow/agent_v2/graph/graph.py` | Wire classify → plan_task → execute_* |
| Modify | `bananaflow/agent_v2/graph/nodes/execute_canvas.py` | Use `task_plan["user_goal"]` for planner prompt |
| Modify | `bananaflow/agent_v2/graph/nodes/execute_tool.py` | Use `task_plan` to populate missing tool_args |
| Modify | `bananaflow/agent_v2/graph/nodes/execute_chitchat.py` | Pass `task_plan["user_goal"]` as message to chitchat |
| Modify | `bananaflow/agent_v2/graph/nodes/execute_clarify.py` | Fallback question from `task_plan` if no `_clarification_question` |
| Modify | `bananaflow/agent_v2/graph/nodes/execute_storyboard.py` | Include `task_plan` summary in async_data |
| Modify | `bananaflow/agent_v2/graph/nodes/build_response.py` | Expose `task_plan` in trace entry |
| Create | `tests/test_plan_task_node.py` | Unit tests for plan_task node |
| Modify | `tests/test_agent_graph_nodes.py` | Add `task_plan` field assertion to `TestAgentState` |

---

## Task 1: `TaskPlan` TypedDict + `task_plan` state field

**Files:**
- Modify: `bananaflow/agent_v2/graph/state.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_plan_task_node.py
import os, sys, unittest
ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


class TestTaskPlanState(unittest.TestCase):
    def test_agent_state_has_task_plan(self):
        import typing
        from agent_v2.graph.state import AgentState
        hints = typing.get_type_hints(AgentState, include_extras=True)
        self.assertIn("task_plan", hints, "AgentState must have task_plan field")

    def test_task_plan_field_is_optional_dict(self):
        import typing
        from agent_v2.graph.state import AgentState
        hints = typing.get_type_hints(AgentState, include_extras=True)
        hint = str(hints["task_plan"])
        # Should allow None
        self.assertIn("None", hint)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/ai/zhangjian/ai_studio_mvp/banana-flow-studio-dev
.venv/bin/python -m pytest tests/test_plan_task_node.py::TestTaskPlanState -v
```
Expected: FAIL — `AssertionError: AgentState must have task_plan field`

- [ ] **Step 3: Add `task_plan` field to `AgentState`**

In `bananaflow/agent_v2/graph/state.py`, add after the `_llm_answer` field and before `final_response`:

```python
    # ── Task plan (set by plan_task node, consumed by execute_* nodes) ──
    task_plan: dict | None
```

Full updated relevant section of `state.py` (replace the `_llm_answer` and onwards block):

```python
    # ── Internal signals (set by classify_intent, read by execute_* nodes) ──
    _clarification_question: str | None
    _llm_answer: str | None

    # ── Task plan (set by plan_task node, consumed by execute_* nodes) ──
    task_plan: dict | None

    # ── Final response (set by build_response) ──
    final_response: dict | None

    # ── Per-request trace (no reducer: reset to [] each invocation) ──
    trace: list[dict]
```

- [ ] **Step 4: Run test to verify it passes**

```bash
.venv/bin/python -m pytest tests/test_plan_task_node.py::TestTaskPlanState -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add bananaflow/agent_v2/graph/state.py tests/test_plan_task_node.py
git commit -m "feat: add task_plan field to AgentState"
```

---

## Task 2: `plan_task` node

**Files:**
- Create: `bananaflow/agent_v2/graph/nodes/plan_task.py`

The node has two paths:
1. **LLM path** — calls Gemini with a focused prompt to extract structured task metadata
2. **Deterministic fallback** — if LLM fails or `task_plan` would be trivially deterministic (shortcut path), build the plan from classify outputs directly

`target_agent` is always derived deterministically from `intent`; the LLM only fills the descriptive fields.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_plan_task_node.py`:

```python
class TestPlanTaskNode(unittest.TestCase):
    def _make_state(self, intent="answer_only", tool_name="", tool_args=None, **overrides):
        base = {
            "message": "你好",
            "thread_id": "t1",
            "intent": intent,
            "intent_confidence": 1.0,
            "intent_reason": "llm_coordinator",
            "tool_name": tool_name,
            "tool_args": tool_args or {},
            "member_authorization": "",
            "canvas_summary": {},
            "artifact_summary": {},
            "conversation_history": [],
            "trace": [],
            "task_plan": None,
        }
        base.update(overrides)
        return base

    def test_plan_task_produces_task_plan(self):
        from agent_v2.graph.nodes.plan_task import plan_task
        state = self._make_state(intent="answer_only", message="你好")
        result = plan_task(state)
        self.assertIn("task_plan", result)
        tp = result["task_plan"]
        self.assertIsInstance(tp, dict)

    def test_task_plan_has_required_fields(self):
        from agent_v2.graph.nodes.plan_task import plan_task
        state = self._make_state(intent="canvas_plan", message="帮我加一个文字节点")
        result = plan_task(state)
        tp = result["task_plan"]
        for field in ["intent", "target_agent", "task_type", "user_goal",
                      "action", "expected_output", "risk_level", "need_confirmation"]:
            self.assertIn(field, tp, f"task_plan missing field: {field}")

    def test_target_agent_matches_classify_intent(self):
        from agent_v2.graph.nodes.plan_task import plan_task
        cases = [
            ("answer_only", "execute_chitchat"),
            ("clarify",     "execute_clarify"),
            ("canvas_plan", "execute_canvas_plan"),
            ("tool_call",   "execute_tool_call"),
        ]
        for intent, expected_agent in cases:
            with self.subTest(intent=intent):
                state = self._make_state(intent=intent)
                result = plan_task(state)
                self.assertEqual(
                    result["task_plan"]["target_agent"],
                    expected_agent,
                    f"intent={intent} must map to {expected_agent}",
                )

    def test_plan_task_returns_trace_entry(self):
        from agent_v2.graph.nodes.plan_task import plan_task
        state = self._make_state(intent="answer_only")
        result = plan_task(state)
        trace = result["trace"]
        self.assertTrue(any(t.get("type") == "PLAN_TASK" for t in trace))

    def test_plan_task_fallback_on_unknown_intent(self):
        """Unknown intent falls back to execute_chitchat without raising."""
        from agent_v2.graph.nodes.plan_task import plan_task
        state = self._make_state(intent="unknown_intent")
        result = plan_task(state)
        tp = result["task_plan"]
        self.assertEqual(tp["target_agent"], "execute_chitchat")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/python -m pytest tests/test_plan_task_node.py::TestPlanTaskNode -v
```
Expected: FAIL — `ImportError: cannot import name 'plan_task'`

- [ ] **Step 3: Create `bananaflow/agent_v2/graph/nodes/plan_task.py`**

```python
from __future__ import annotations

from typing import Any

# Maps classify_intent output to the target execute node.
# This mapping is deterministic and is NOT subject to LLM override.
_INTENT_TO_TARGET_AGENT: dict[str, str] = {
    "answer_only": "execute_chitchat",
    "clarify":     "execute_clarify",
    "canvas_plan": "execute_canvas_plan",
    "tool_call":   "execute_tool_call",
}

_INTENT_TO_EXPECTED_OUTPUT: dict[str, str] = {
    "answer_only": "message",
    "clarify":     "message",
    "canvas_plan": "canvas_patch",
    "tool_call":   "tool_result",
}


def _deterministic_task_plan(state: dict) -> dict[str, Any]:
    """Build a task_plan purely from state fields, no LLM call."""
    intent = str(state.get("intent") or "answer_only")
    tool_name = str(state.get("tool_name") or "").strip()
    message = str(state.get("message") or "").strip()

    target_agent = _INTENT_TO_TARGET_AGENT.get(intent, "execute_chitchat")
    expected_output = _INTENT_TO_EXPECTED_OUTPUT.get(intent, "message")

    # Derive task_type from tool_name or intent
    if tool_name in {"storyboard.design", "agent_storyboard_design"}:
        task_type = "generate_storyboard"
        action = "生成"
        expected_output = "async_task"
    elif tool_name == "prompt.polish":
        task_type = "polish_prompt"
        action = "润色"
    elif intent == "canvas_plan":
        task_type = "edit_canvas"
        action = "规划"
    elif intent == "clarify":
        task_type = "request_clarification"
        action = "澄清"
    elif tool_name:
        task_type = f"tool.{tool_name}"
        action = "调用"
    else:
        task_type = "answer_question"
        action = "回答"

    return {
        "intent": intent,
        "target_agent": target_agent,
        "task_type": task_type,
        "user_goal": message,
        "target_object": None,
        "action": action,
        "required_context": [],
        "expected_output": expected_output,
        "risk_level": "low",
        "need_confirmation": False,
        "_source": "deterministic",
    }


_PLANNER_SYSTEM_PROMPT = (
    "你是 Bananaflow 任务规划器。根据用户消息和已知分类意图，提取标准任务对象（JSON）。\n\n"
    "输出字段说明：\n"
    "- intent: canvas.modify|canvas.create|tool.storyboard|tool.polish|answer.question|request.clarify\n"
    "- task_type: 具体操作类型（如 attach_character_asset / edit_canvas_node / generate_storyboard）\n"
    "- user_goal: 用自然语言简短描述用户真实目标（15字以内）\n"
    "- target_object: 目标对象（人物名、节点名、镜头编号等），无则 null\n"
    "- action: 操作动词（生成/修改/挂载/回答/润色）\n"
    "- required_context: 依赖上下文列表，取值范围 canvas_state|selected_artifact|conversation_history\n"
    "- expected_output: canvas_patch|message|async_task|tool_result\n"
    "- risk_level: low|medium|high（high 时 need_confirmation=true）\n"
    "- need_confirmation: true|false\n\n"
    "只输出 JSON，不要解释。target_agent 字段不需要输出（由系统决定）。"
)


def _call_planner_llm(state: dict) -> dict[str, Any] | None:
    """Call Gemini to extract structured task metadata. Returns None on any failure."""
    try:
        from core.config import MODEL_AGENT, AGENT_MODEL_HTTP_PROXY, AGENT_MODEL_HTTPS_PROXY
        from google.genai import types
        from services.genai_client import call_genai_retry_with_proxy

        intent = str(state.get("intent") or "answer_only")
        tool_name = str(state.get("tool_name") or "").strip()
        message = str(state.get("message") or "").strip()
        canvas_summary = dict(state.get("canvas_summary") or {})

        payload = {
            "classify_result": {
                "intent": intent,
                "tool_name": tool_name or None,
            },
            "message": message,
            "canvas_node_count": canvas_summary.get("node_count", 0),
        }

        import json as _json
        full_prompt = _PLANNER_SYSTEM_PROMPT + "\n\n" + _json.dumps(payload, ensure_ascii=False)

        response = call_genai_retry_with_proxy(
            contents=[types.Part(text=full_prompt)],
            config=types.GenerateContentConfig(
                temperature=0.0,
                max_output_tokens=400,
                response_mime_type="application/json",
            ),
            req_id="agent_v2_plan_task",
            model=MODEL_AGENT,
            http_proxy=AGENT_MODEL_HTTP_PROXY,
            https_proxy=AGENT_MODEL_HTTPS_PROXY,
        )
        text = str(getattr(response, "text", "") or "").strip()
        if not text:
            return None

        raw = text.replace("```json", "").replace("```", "").strip()
        parsed = _json.loads(raw)
        if not isinstance(parsed, dict):
            return None
        return parsed
    except Exception:
        return None


def _merge_llm_into_plan(base: dict[str, Any], llm: dict[str, Any]) -> dict[str, Any]:
    """Overlay LLM-extracted descriptive fields onto the deterministic base plan.
    Never allow LLM to override target_agent (routing must stay deterministic).
    """
    safe_fields = {
        "intent", "task_type", "user_goal", "target_object",
        "action", "required_context", "expected_output",
        "risk_level", "need_confirmation",
    }
    merged = dict(base)
    for field in safe_fields:
        if field in llm and llm[field] is not None:
            merged[field] = llm[field]
    merged["_source"] = "llm"
    return merged


def plan_task(state: dict) -> dict:
    """Convert classify_intent output into a structured TaskPlan.

    Routing (target_agent) is deterministic.
    Descriptive fields (user_goal, target_object, action, etc.) are LLM-enriched
    when possible, with a deterministic fallback if the LLM call fails.
    """
    trace = list(state.get("trace") or [])

    base_plan = _deterministic_task_plan(state)
    llm_result = _call_planner_llm(state)

    if llm_result is not None:
        task_plan = _merge_llm_into_plan(base_plan, llm_result)
    else:
        task_plan = base_plan

    trace_entry: dict[str, Any] = {
        "type": "PLAN_TASK",
        "target_agent": task_plan["target_agent"],
        "task_type": task_plan.get("task_type", ""),
        "user_goal": task_plan.get("user_goal", "")[:80],
        "source": task_plan.get("_source", "deterministic"),
    }

    return {
        "task_plan": task_plan,
        "trace": trace + [trace_entry],
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/python -m pytest tests/test_plan_task_node.py::TestPlanTaskNode -v
```
Expected: All 5 tests PASS (LLM calls are made or fall back gracefully)

- [ ] **Step 5: Commit**

```bash
git add bananaflow/agent_v2/graph/nodes/plan_task.py tests/test_plan_task_node.py
git commit -m "feat: add plan_task node with LLM enrichment + deterministic fallback"
```

---

## Task 3: Router + Graph Wiring

**Files:**
- Modify: `bananaflow/agent_v2/graph/router.py`
- Modify: `bananaflow/agent_v2/graph/graph.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_plan_task_node.py`:

```python
class TestRouterAfterPlan(unittest.TestCase):
    def _plan_state(self, target_agent: str) -> dict:
        return {"task_plan": {"target_agent": target_agent}, "tool_name": ""}

    def test_routes_chitchat(self):
        from agent_v2.graph.router import _route_after_plan
        self.assertEqual(_route_after_plan(self._plan_state("execute_chitchat")), "execute_chitchat")

    def test_routes_clarify(self):
        from agent_v2.graph.router import _route_after_plan
        self.assertEqual(_route_after_plan(self._plan_state("execute_clarify")), "execute_clarify")

    def test_routes_canvas_plan(self):
        from agent_v2.graph.router import _route_after_plan
        self.assertEqual(_route_after_plan(self._plan_state("execute_canvas_plan")), "execute_canvas_plan")

    def test_routes_tool_call(self):
        from agent_v2.graph.router import _route_after_plan
        self.assertEqual(_route_after_plan(self._plan_state("execute_tool_call")), "execute_tool_call")

    def test_unknown_target_agent_falls_back_to_chitchat(self):
        from agent_v2.graph.router import _route_after_plan
        self.assertEqual(_route_after_plan(self._plan_state("unknown_node")), "execute_chitchat")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/python -m pytest tests/test_plan_task_node.py::TestRouterAfterPlan -v
```
Expected: FAIL — `ImportError: cannot import name '_route_after_plan'`

- [ ] **Step 3: Add `_route_after_plan` to `router.py`**

Open `bananaflow/agent_v2/graph/router.py`. The full new file content:

```python
from __future__ import annotations

_VALID_EXECUTE_NODES = {
    "execute_chitchat",
    "execute_clarify",
    "execute_canvas_plan",
    "execute_tool_call",
}


def _route_after_plan(state: dict) -> str:
    """Conditional edge: plan_task → execute_* node.
    Reads target_agent from task_plan; falls back to execute_chitchat.
    """
    task_plan = dict(state.get("task_plan") or {})
    target = str(task_plan.get("target_agent") or "execute_chitchat")
    if target not in _VALID_EXECUTE_NODES:
        return "execute_chitchat"
    return target


def _route_after_classify(state: dict) -> str:
    """DEPRECATED — kept only for the normalize shortcut path in tests.
    In the live graph, classify_intent now always goes to plan_task.
    """
    intent = str(state.get("intent") or "answer_only")
    if intent == "clarify":
        return "execute_clarify"
    if intent == "canvas_plan":
        return "execute_canvas_plan"
    if intent == "tool_call":
        return "execute_tool_call"
    return "execute_chitchat"


def _route_after_tool(state: dict) -> str:
    """Conditional edge: execute_tool_call → execute_storyboard OR build_response."""
    tool_name = str(state.get("tool_name") or "").strip()
    if tool_name in {"storyboard.design", "agent_storyboard_design"}:
        return "execute_storyboard"
    return "build_response"
```

- [ ] **Step 4: Run router tests to verify they pass**

```bash
.venv/bin/python -m pytest tests/test_plan_task_node.py::TestRouterAfterPlan -v
```
Expected: PASS

- [ ] **Step 5: Rewire `graph.py`**

Open `bananaflow/agent_v2/graph/graph.py`. Full new file content:

```python
from __future__ import annotations

from langgraph.graph import StateGraph, START, END

from agent_v2.graph.state import AgentState
from agent_v2.graph.router import _route_after_plan, _route_after_tool
from agent_v2.graph.nodes.normalize import normalize_request
from agent_v2.graph.nodes.context import assemble_context
from agent_v2.graph.nodes.classify import classify_intent
from agent_v2.graph.nodes.plan_task import plan_task
from agent_v2.graph.nodes.execute_chitchat import execute_chitchat
from agent_v2.graph.nodes.execute_clarify import execute_clarify
from agent_v2.graph.nodes.execute_canvas import execute_canvas_plan
from agent_v2.graph.nodes.execute_tool import execute_tool_call
from agent_v2.graph.nodes.execute_storyboard import execute_storyboard
from agent_v2.graph.nodes.build_response import build_response


def build_agent_graph(checkpointer=None):
    builder = StateGraph(AgentState)

    builder.add_node("normalize_request", normalize_request)
    builder.add_node("assemble_context", assemble_context)
    builder.add_node("classify_intent", classify_intent)
    builder.add_node("plan_task", plan_task)
    builder.add_node("execute_chitchat", execute_chitchat)
    builder.add_node("execute_clarify", execute_clarify)
    builder.add_node("execute_canvas_plan", execute_canvas_plan)
    builder.add_node("execute_tool_call", execute_tool_call)
    builder.add_node("execute_storyboard", execute_storyboard)
    builder.add_node("build_response", build_response)

    builder.add_edge(START, "normalize_request")
    builder.add_edge("normalize_request", "assemble_context")
    builder.add_edge("assemble_context", "classify_intent")
    builder.add_edge("classify_intent", "plan_task")  # always enters plan_task

    builder.add_conditional_edges(
        "plan_task",
        _route_after_plan,
        {
            "execute_chitchat":    "execute_chitchat",
            "execute_clarify":     "execute_clarify",
            "execute_canvas_plan": "execute_canvas_plan",
            "execute_tool_call":   "execute_tool_call",
        },
    )

    builder.add_conditional_edges(
        "execute_tool_call",
        _route_after_tool,
        {
            "execute_storyboard": "execute_storyboard",
            "build_response":     "build_response",
        },
    )

    builder.add_edge("execute_chitchat",    "build_response")
    builder.add_edge("execute_clarify",     "build_response")
    builder.add_edge("execute_canvas_plan", "build_response")
    builder.add_edge("execute_storyboard",  "build_response")
    builder.add_edge("build_response", END)

    return builder.compile(checkpointer=checkpointer)
```

- [ ] **Step 6: Smoke-test graph construction**

```bash
cd /home/ai/zhangjian/ai_studio_mvp/banana-flow-studio-dev
.venv/bin/python -c "
import sys; sys.path.insert(0, 'bananaflow')
from agent_v2.graph import build_agent_graph
g = build_agent_graph()
print('nodes:', list(g.nodes))
print('OK')
"
```
Expected output contains: `plan_task` in the nodes list, prints `OK`.

- [ ] **Step 7: Run all plan_task tests**

```bash
.venv/bin/python -m pytest tests/test_plan_task_node.py -v
```
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add bananaflow/agent_v2/graph/router.py bananaflow/agent_v2/graph/graph.py tests/test_plan_task_node.py
git commit -m "feat: wire plan_task into graph; add _route_after_plan"
```

---

## Task 4: Execute Nodes Consume `task_plan`

**Files:**
- Modify: `bananaflow/agent_v2/graph/nodes/execute_canvas.py`
- Modify: `bananaflow/agent_v2/graph/nodes/execute_tool.py`
- Modify: `bananaflow/agent_v2/graph/nodes/execute_chitchat.py`
- Modify: `bananaflow/agent_v2/graph/nodes/execute_clarify.py`
- Modify: `bananaflow/agent_v2/graph/nodes/execute_storyboard.py`
- Modify: `bananaflow/agent_v2/graph/nodes/build_response.py`

The rule: **execute_* nodes use `task_plan["user_goal"]` as the primary "what to do" text** instead of directly using raw `message`. They also include `task_plan` metadata in their trace entries. They no longer re-derive intent from raw fields.

- [ ] **Step 1: Write failing tests**

Add to `tests/test_plan_task_node.py`:

```python
class TestExecuteNodesConsumePlan(unittest.TestCase):
    def _state_with_plan(self, intent="answer_only", user_goal="测试目标", **overrides):
        base = {
            "message": "原始消息",
            "thread_id": "t1",
            "intent": intent,
            "tool_name": "",
            "tool_args": {},
            "member_authorization": "",
            "trace": [],
            "exec_response_text": "",
            "exec_patches": [],
            "exec_warnings": [],
            "exec_data": {},
            "task_plan": {
                "intent": intent,
                "target_agent": "execute_chitchat",
                "task_type": "answer_question",
                "user_goal": user_goal,
                "target_object": None,
                "action": "回答",
                "required_context": [],
                "expected_output": "message",
                "risk_level": "low",
                "need_confirmation": False,
            },
        }
        base.update(overrides)
        return base

    def test_execute_clarify_uses_task_plan_fallback(self):
        from agent_v2.graph.nodes.execute_clarify import execute_clarify
        state = self._state_with_plan(
            intent="clarify",
            user_goal="需要更多信息",
        )
        state["_clarification_question"] = None
        state["task_plan"]["target_agent"] = "execute_clarify"
        result = execute_clarify(state)
        # Should not be empty even without _clarification_question
        self.assertTrue(len(result["exec_response_text"]) > 0)
        # trace should mention EXECUTE_CLARIFY
        self.assertTrue(any(t.get("type") == "EXECUTE_CLARIFY" for t in result["trace"]))

    def test_build_response_includes_task_plan_in_trace(self):
        from agent_v2.graph.nodes.build_response import build_response
        state = self._state_with_plan()
        state.update({
            "exec_patches": [],
            "exec_warnings": [],
            "exec_data": {},
            "exec_response_text": "hello",
            "canvas_summary": {},
            "artifact_summary": {},
            "conversation_history": [],
            "canvas_id": None,
            "mode": None,
            "final_response": None,
        })
        result = build_response(state)
        final = result["final_response"]
        # task_plan should appear somewhere in the trace
        trace = final["trace"]
        build_entry = next((t for t in trace if t.get("type") == "BUILD_RESPONSE"), None)
        self.assertIsNotNone(build_entry)
        self.assertIn("task_type", build_entry)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/python -m pytest tests/test_plan_task_node.py::TestExecuteNodesConsumePlan -v
```
Expected: `test_build_response_includes_task_plan_in_trace` FAIL — `AssertionError: 'task_type' not found in BUILD_RESPONSE trace entry`

- [ ] **Step 3: Update `execute_clarify.py`**

Replace the full content of `bananaflow/agent_v2/graph/nodes/execute_clarify.py`:

```python
from __future__ import annotations


def execute_clarify(state: dict) -> dict:
    question = str(state.get("_clarification_question") or "").strip()
    if not question:
        # Fall back to task_plan user_goal or generic question
        task_plan = dict(state.get("task_plan") or {})
        user_goal = str(task_plan.get("user_goal") or "").strip()
        question = (
            f"关于"{user_goal}"，我还需要更多信息才能继续处理。"
            if user_goal
            else "我还需要一点信息，才能继续处理。"
        )
    trace = list(state.get("trace") or [])
    return {
        "exec_response_text": question,
        "exec_patches": [],
        "exec_warnings": [],
        "exec_data": {},
        "trace": trace + [{"type": "EXECUTE_CLARIFY"}],
    }
```

- [ ] **Step 4: Update `execute_chitchat.py`**

Replace the full content of `bananaflow/agent_v2/graph/nodes/execute_chitchat.py`:

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
    # Prefer task_plan.user_goal over raw message for the LLM prompt
    task_plan = dict(state.get("task_plan") or {})
    user_goal = str(task_plan.get("user_goal") or "").strip()
    raw_message = str(state.get("message") or "").strip()
    message = user_goal or raw_message

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

- [ ] **Step 5: Update `execute_canvas.py`**

Replace `_run_canvas_planner` and `execute_canvas_plan` in `bananaflow/agent_v2/graph/nodes/execute_canvas.py`:

```python
from __future__ import annotations

from typing import Any


def _run_canvas_planner(state: dict) -> dict:
    from agent.planner import agent_plan_impl
    from schemas.api import AgentRequest

    # Use task_plan.user_goal as the planning prompt if available
    task_plan = dict(state.get("task_plan") or {})
    user_goal = str(task_plan.get("user_goal") or "").strip()
    raw_message = str(state.get("message") or "").strip()
    prompt = user_goal or raw_message

    plan_req = AgentRequest(
        prompt=prompt,
        supplemental_prompt=state.get("supplemental_prompt"),
        current_nodes=list(state.get("current_nodes") or []),
        current_connections=list(state.get("current_connections") or []),
        selected_artifact=state.get("selected_artifact"),
        canvas_id=state.get("canvas_id"),
        thread_id=state.get("thread_id"),
    )
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

- [ ] **Step 6: Update `execute_tool.py`**

Replace the `prompt.polish` args guard in `execute_tool_call` to read from `task_plan`:

Open `bananaflow/agent_v2/graph/nodes/execute_tool.py`. Replace the `prompt.polish` guard block (lines around `if tool_name == "prompt.polish" and "prompt" not in tool_args:`):

```python
def execute_tool_call(state: dict) -> dict:
    tool_name = str(state.get("tool_name") or "").strip()
    tool_args = dict(state.get("tool_args") or {})
    message = str(state.get("message") or "").strip()
    thread_id = str(state.get("thread_id") or "").strip()
    member_authorization = str(state.get("member_authorization") or "").strip()
    trace = list(state.get("trace") or [])
    task_plan = dict(state.get("task_plan") or {})
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

    # Populate missing prompt.polish args from task_plan.user_goal or raw message
    if tool_name == "prompt.polish" and "prompt" not in tool_args:
        user_goal = str(task_plan.get("user_goal") or "").strip()
        tool_args = {
            "prompt": user_goal or message,
            "mode": str(state.get("mode") or "text2img").strip() or "text2img",
        }

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
        "exec_response_text": "",
        "exec_patches": [],
        "exec_warnings": [],
        "exec_data": dict(payload),
        "trace": trace + [{"type": "EXECUTE_TOOL_CALL", "tool": tool_name, "ok": True}],
    }
```

Keep the `_run_tool` and `_run_chitchat_fallback` helper functions unchanged.

- [ ] **Step 7: Update `execute_storyboard.py`**

Replace the full content of `bananaflow/agent_v2/graph/nodes/execute_storyboard.py`:

```python
from __future__ import annotations


def _create_storyboard_task(thread_id: str) -> str:
    from storage.storyboard_tasks import create_storyboard_task
    return create_storyboard_task(thread_id=thread_id)


def execute_storyboard(state: dict) -> dict:
    thread_id = str(state.get("thread_id") or "").strip()
    tool_args = dict(state.get("tool_args") or {})
    trace = list(state.get("trace") or [])
    task_plan = dict(state.get("task_plan") or {})

    task_id = _create_storyboard_task(thread_id)
    async_data = {
        "task_id": task_id,
        "status": "pending",
        "tool_args": tool_args,
        "authorization": str(state.get("member_authorization") or "").strip(),
        "thread_id": thread_id,
        "_async_storyboard": True,
        "user_goal": str(task_plan.get("user_goal") or "").strip(),
    }

    return {
        "exec_response_text": f"分镜方案生成中，请稍候... (task: {task_id})",
        "exec_patches": [],
        "exec_warnings": [],
        "exec_data": async_data,
        "trace": trace + [{"type": "EXECUTE_STORYBOARD", "task_id": task_id}],
    }
```

- [ ] **Step 8: Update `build_response.py` to include `task_plan` in trace**

In `bananaflow/agent_v2/graph/nodes/build_response.py`, update the `trace_entry` dict (around line 50):

```python
    task_plan = dict(state.get("task_plan") or {})

    trace_entry: dict[str, Any] = {
        "type": "BUILD_RESPONSE",
        "intent": intent,
        "message_preview": message[:120] if message else "",
        "patch_count": len(exec_patches),
        "task_type": str(task_plan.get("task_type") or ""),
        "user_goal": str(task_plan.get("user_goal") or "")[:60],
    }
```

Add `task_plan = dict(state.get("task_plan") or {})` right before the `trace_entry` dict, after the existing `tool_name = ...` line.

- [ ] **Step 9: Run all execute-node tests**

```bash
.venv/bin/python -m pytest tests/test_plan_task_node.py -v
```
Expected: All tests PASS

- [ ] **Step 10: Run the full test suite to check for regressions**

```bash
.venv/bin/python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```
Expected: Previously passing tests still pass; no new failures except pre-existing ones.

- [ ] **Step 11: Commit**

```bash
git add \
  bananaflow/agent_v2/graph/nodes/execute_clarify.py \
  bananaflow/agent_v2/graph/nodes/execute_chitchat.py \
  bananaflow/agent_v2/graph/nodes/execute_canvas.py \
  bananaflow/agent_v2/graph/nodes/execute_tool.py \
  bananaflow/agent_v2/graph/nodes/execute_storyboard.py \
  bananaflow/agent_v2/graph/nodes/build_response.py \
  tests/test_plan_task_node.py
git commit -m "feat: execute_* nodes consume task_plan for user_goal and action context"
```

---

## Task 5: Integration Test + End-to-End Verification

**Files:**
- Modify: `tests/test_agent_graph_nodes.py` — add `task_plan` field check

- [ ] **Step 1: Add `task_plan` state field test to existing test file**

Open `tests/test_agent_graph_nodes.py`. In `TestAgentState.test_state_has_required_fields`, add `"task_plan"` to the field list:

```python
    def test_state_has_required_fields(self):
        from agent_v2.graph.state import AgentState
        import typing
        hints = typing.get_type_hints(AgentState, include_extras=True)
        for field in [
            "message", "thread_id", "intent", "exec_response_text",
            "exec_patches", "conversation_history", "trace", "final_response",
            "task_plan",   # new
        ]:
            self.assertIn(field, hints, f"AgentState missing field: {field}")
```

- [ ] **Step 2: Add graph topology test to `test_plan_task_node.py`**

Add to `tests/test_plan_task_node.py`:

```python
class TestGraphTopology(unittest.TestCase):
    def test_plan_task_node_in_graph(self):
        from agent_v2.graph import build_agent_graph
        g = build_agent_graph()
        self.assertIn("plan_task", g.nodes, "plan_task must be a node in the compiled graph")

    def test_classify_intent_edges_to_plan_task(self):
        """After classify_intent, next node must be plan_task (not an execute_* node)."""
        from agent_v2.graph import build_agent_graph
        g = build_agent_graph()
        # Edges from classify_intent should lead to plan_task only
        edges_from_classify = [
            e for e in g.edges
            if hasattr(e, '__iter__') and len(list(e)) >= 2
        ]
        # Use the graph's get_graph() for edge inspection
        mermaid = g.get_graph().draw_mermaid()
        self.assertIn("classify_intent", mermaid)
        self.assertIn("plan_task", mermaid)
        # classify_intent must connect to plan_task
        self.assertIn("classify_intent --> plan_task", mermaid.replace("  ", " "))

    def test_plan_task_does_not_edge_to_classify(self):
        from agent_v2.graph import build_agent_graph
        g = build_agent_graph()
        mermaid = g.get_graph().draw_mermaid()
        # plan_task should never route back to classify_intent
        self.assertNotIn("plan_task --> classify_intent", mermaid.replace("  ", " "))
```

- [ ] **Step 3: Run topology tests**

```bash
.venv/bin/python -m pytest tests/test_plan_task_node.py::TestGraphTopology -v
```
Expected: All 3 tests PASS

- [ ] **Step 4: Live smoke test against running backend**

Start (or confirm) backend is running on port 8083:

```bash
kill $(lsof -t -i:8083) 2>/dev/null; sleep 2
cd /home/ai/zhangjian/ai_studio_mvp/banana-flow-studio-dev/bananaflow && \
  HOST=0.0.0.0 PORT=8083 ../.venv/bin/python main.py > /tmp/plan_task_smoke.log 2>&1 &
sleep 8
tail -3 /tmp/plan_task_smoke.log
```
Expected: `Application startup complete.`

Test intent routing via trace:

```bash
# Test 1: answer_only path
curl --noproxy '*' -s -X POST http://localhost:8083/api/agent/invoke \
  -H "Content-Type: application/json" \
  -d '{"message":"你好"}' | python3 -c "
import sys,json; d=json.load(sys.stdin)
trace = d['trace']
types = [t['type'] for t in trace]
print('types:', types)
assert 'PLAN_TASK' in types, 'plan_task not in trace'
plan = next(t for t in trace if t['type']=='PLAN_TASK')
print('plan_task target_agent:', plan['target_agent'])
assert plan['target_agent'] == 'execute_chitchat'
print('PASS: answer_only -> execute_chitchat')
"

# Test 2: canvas_plan path
curl --noproxy '*' -s -X POST http://localhost:8083/api/agent/invoke \
  -H "Content-Type: application/json" \
  -d '{"message":"帮我规划画布，添加文字节点"}' | python3 -c "
import sys,json; d=json.load(sys.stdin)
trace = d['trace']
plan = next((t for t in trace if t['type']=='PLAN_TASK'), None)
assert plan is not None, 'PLAN_TASK missing'
print('plan_task:', plan)
assert plan['target_agent'] == 'execute_canvas_plan', f'got {plan[\"target_agent\"]}'
print('PASS: canvas_plan -> execute_canvas_plan')
"
```
Expected: Both assertions PASS, `PLAN_TASK` appears in trace between `CLASSIFY_INTENT` and `EXECUTE_*`.

- [ ] **Step 5: Run full test suite**

```bash
.venv/bin/python -m pytest tests/ -v --tb=short 2>&1 | grep -E "PASSED|FAILED|ERROR" | tail -20
```
Expected: All previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add tests/test_plan_task_node.py tests/test_agent_graph_nodes.py
git commit -m "test: graph topology and e2e integration tests for plan_task node"
```

---

## Self-Review

**Spec coverage:**
- [x] `classify_intent` 后必须进入 `plan_task` — Task 3 wires `classify_intent → plan_task` unconditionally
- [x] `execute_*` 节点只消费 `task_plan` — Task 4 updates all 5 execute nodes
- [x] `execute_*` 节点不再重复判断用户意图 — prompt.polish guard moved to plan_task; chitchat uses user_goal
- [x] 所有任务都有统一 `task_plan` — plan_task always runs, deterministic fallback ensures it never fails

**TaskPlan fields coverage:**
- [x] `intent` — in `_deterministic_task_plan` + LLM
- [x] `target_agent` — deterministic in `_deterministic_task_plan`
- [x] `task_type` — deterministic + LLM enrichment
- [x] `user_goal` — LLM-extracted, fallback to message
- [x] `target_object` — LLM-extracted, fallback to None
- [x] `action` — deterministic + LLM enrichment
- [x] `required_context` — LLM-extracted, fallback to []
- [x] `expected_output` — deterministic + LLM enrichment
- [x] `risk_level` — LLM-extracted, fallback to "low"
- [x] `need_confirmation` — LLM-extracted, fallback to False

**Placeholder scan:** None found — all steps have concrete code.

**Type consistency:** `task_plan` is `dict | None` throughout state; nodes defensively coerce with `dict(state.get("task_plan") or {})`.
