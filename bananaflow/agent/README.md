# Bananaflow Agent Architecture

This module is centered around the newer coordinator-based agent architecture.

## Primary chain

```text
/api/agent/message
  -> agent.gateway.service.handle_agent_message
  -> agent.gateway.router.coordinate_agent_message
  -> capability catalog
  -> coordinator decision
  -> agent.gateway.dispatcher.dispatch_agent_message
  -> planner / tool executor / retrieval / general answer
  -> AgentMessageResponse
```

## Main components

### 1. Gateway / Coordinator

Files:
- `agent/gateway/schemas.py`
- `agent/gateway/rules.py`
- `agent/gateway/router.py`
- `agent/gateway/dispatcher.py`
- `agent/gateway/service.py`

Responsibilities:
- receive `AgentMessageRequest`
- apply safe shortcuts for UI-driven actions
- build capability catalog from virtual capabilities plus Tool Registry
- use the coordinator model to choose:
  - `answer_only`
  - `clarify`
  - `tool_call`
  - `canvas_plan`
  - `workflow_plan`
- synthesize `AgentMessageResponse`

### 2. Canvas Planner Agent

Files:
- `agent/planner.py`
- `agent/graph.py`
- `agent/planner_legacy.py`
- `agent/clarify.py`
- `agent/deterministic.py`
- `agent/normalizer.py`

Responsibilities:
- power `/api/agent/plan`
- provide canvas patch planning and deterministic fallback behavior

Notes:
- `planner.py` is the stable planner entrypoint.
- `graph.py` and `planner_legacy.py` are implementation detail modules for the planner path, not the conversational gateway path.

### 3. Tool Registry / Tool Executor

Files:
- `agent/tools/specs.py`
- `agent/tools/registry.py`
- `agent/tools/executor.py`
- `agent/tools/builtin.py`

Responsibilities:
- define governed deterministic tools
- expose prompt catalog to the coordinator
- execute tools with validation, retries, redaction, tracing, and observability hooks

The gateway dispatcher should prefer Tool Registry tools over bespoke direct integrations.

### 4. Retrieval layer

Files:
- `retrieval/schemas.py`
- `retrieval/vector_store.py`
- `retrieval/qdrant_store.py`
- `retrieval/service.py`
- `retrieval/indexer.py`

Responsibilities:
- provide asset / knowledge / eval-case retrieval
- keep Qdrant-specific code behind an adapter
- expose retrieval through Tool Registry aliases:
  - `retrieval.search_assets`
  - `retrieval.search_knowledge`
  - `retrieval.search_eval_cases`

### 5. Observability layer

Files:
- `observability/config.py`
- `observability/providers.py`
- `observability/tracer.py`

Responsibilities:
- abstract `none | langfuse | langsmith`
- keep SDK calls out of business modules
- receive Tool Executor events when `run_id` is present

## Compatibility paths

These modules remain for compatibility with older APIs or internal flows:

- `agent/capability_executors.py`
  - keeps `/api/agent/*` capability endpoints working
  - internally routes through Tool Executor where possible
- `agent/capabilities_runner.py`
  - compatibility wrapper for optional LangGraph capability execution
- `agent/capabilities_graph.py`
  - legacy graph-based capability orchestration

They are not the preferred path for new conversational agent work.

## Runtime skills, quality, and HITL

These remain valid only when connected to the newer chain:

- runtime skills:
  - still used by dedicated storyboard flows and any explicit integrations that call them
  - not part of the default `/api/agent/message` path unless the coordinator or tools invoke them
- quality / eval / HITL:
  - remain active where idea-script, eval harvesting, or feedback flows already connect
  - retrieval exposes eval cases through the retrieval abstraction

## Guidance for new work

When adding new agent capabilities:

1. Prefer a Tool Registry tool if the action is deterministic or governable.
2. Expose it through the capability catalog.
3. Let the coordinator decide whether to call it.
4. Route execution through `gateway/dispatcher.py`.
5. Use retrieval and observability abstractions instead of direct provider SDK calls.

Avoid adding new direct capability branches inside the gateway when a Tool Registry tool can represent the action.
