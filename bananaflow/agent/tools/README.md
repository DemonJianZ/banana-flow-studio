# Bananaflow Agent Tool Registry

This package adds a stable tool layer between agent workflows and deterministic service calls.

## Scope

The registry is intended for:

- prompt polishing
- script generation
- asset search
- ComfyUI image generation
- image-to-video
- background removal
- artifact export
- eval harvesting

It does not replace the existing LangGraph planner and it does not migrate Bananaflow to `create_agent`.

## Components

- `specs.py`: tool spec model, canonical hashing, lightweight JSON-schema validation
- `registry.py`: in-process tool registration and lookup
- `executor.py`: validated execution with per-call context
- `builtin.py`: built-in Bananaflow tools mapped to current service entry points
- `errors.py`: explicit registry, validation, and execution errors

## Usage

```python
from bananaflow.agent.tools import AgentToolContext, build_builtin_executor

executor = build_builtin_executor()
result = executor.execute(
    "agent_prompt_polish",
    {"prompt": "白底商业产品海报", "mode": "text2img"},
    context=AgentToolContext(req_id="demo-1"),
)
```

## Design notes

- Specs carry `tool_version` and deterministic `tool_hash`.
- Validation happens before the underlying handler runs.
- Existing workflows can opt into the registry without changing the planner.
- Built-ins wrap current Bananaflow modules rather than re-implementing business logic.
