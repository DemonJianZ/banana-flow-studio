# Bananaflow Agent Tool Registry

This package adds a stable tool layer between agent workflows and deterministic service calls.

## Architecture

- `specs.py`
  Carries tool contract, metadata, aliases, retry policy, cost hints, and prompt-catalog serialization.
- `registry.py`
  Owns canonical tool registration, alias lookup, catalog listing, and governance-oriented filtering.
- `executor.py`
  Handles input validation, output validation, disabled-tool enforcement, retries, latency accounting, and trace emission.
- `builtin.py`
  Registers built-in Bananaflow tools and loads heavy runtime dependencies lazily inside handlers.
- `errors.py`
  Defines explicit error classes for lookup, validation, and execution failures.

## Lifecycle

1. A tool spec is registered with a handler.
2. Agent code calls `execute()` or `safe_execute()`.
3. The executor resolves aliases to the canonical tool.
4. `enabled` policy is enforced.
5. Input is normalized and validated.
6. The handler runs with an `AgentToolContext`.
7. Output is validated against `output_schema`.
8. A compact trace event is appended to `trace_sink`.
9. Call metadata is exposed through `get_last_call_meta()`.

## Scope

The registry is intended for deterministic or governance-sensitive capabilities such as:

- prompt polishing
- script generation
- asset search
- ComfyUI image generation
- image-to-video
- background removal
- artifact export
- eval harvesting

It does not replace the existing LangGraph planner and it does not migrate Bananaflow to `create_agent`.

## Governance

- Tools can be marked `enabled=False` and are blocked by default.
- Metadata such as `category`, `cost_level`, `timeout_seconds`, and `retry` is part of the tool contract.
- `list_tools()` and `to_prompt_catalog()` can filter by `category` and `enabled`.
- Trace data is redacted and truncated to reduce leakage and payload growth.

## Usage

```python
from bananaflow.agent.tools import AgentToolContext, build_builtin_executor

executor = build_builtin_executor()
result = executor.execute(
    "prompt.polish",
    {"prompt": "白底商业产品海报", "mode": "text2img"},
    context=AgentToolContext(req_id="demo-1"),
)
```

```python
from bananaflow.agent.tools import AgentToolContext, build_builtin_executor

executor = build_builtin_executor()
result = executor.safe_execute(
    "comfyui.rmbg",
    {"image": "data:image/png;base64,..."},
    context=AgentToolContext(req_id="demo-2", trace_sink=[]),
)
if not result.ok:
    print(result.error, result.retry_count, result.latency_ms)
```

## Prompt Catalog

```python
from bananaflow.agent.tools import build_builtin_registry

registry = build_builtin_registry()
catalog = registry.to_prompt_catalog(category="prompt", enabled=True)
```

## Limitations

- Schema validation is lightweight and intentionally narrow; it is not a full JSON Schema engine.
- `timeout_seconds` is metadata today; the executor records it and traces it but does not hard-cancel handlers.
- Built-in handlers still rely on the existing Bananaflow service modules; the registry governs them but does not replace them.
- The planner remains separate by design. The registry is a middle layer, not a planner rewrite.
