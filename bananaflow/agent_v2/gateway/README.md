# Bananaflow Agent v2 Gateway

Agent v2 is the clean conversational gateway architecture for Bananaflow.

## Runtime chain

```text
/api/agent/message
  -> agent_v2.gateway.service.handle_agent_message
  -> context builder
  -> capability catalog
  -> coordinator
  -> dispatcher
      - canvas planner adapter
      - ToolExecutor
      - retrieval tools through Tool Registry
      - general answer / chitchat
  -> synthesizer
  -> AgentMessageResponse
```

## Principles

- conversational first
- capability-aware, not rigid intent routing
- tools and retrieval are invoked only when they materially help
- canvas planning stays on the existing planner implementation
- observability goes through the shared abstraction

## Main files

- `schemas.py`: public request / response / decision models
- `context.py`: request summarization
- `catalog.py`: capability catalog from virtual capabilities and Tool Registry
- `prompts.py`: coordinator prompt and payload formatting
- `coordinator.py`: safe shortcuts and LLM coordination
- `dispatcher.py`: execute planner / tools / workflow steps
- `synthesizer.py`: normalize final response payload
- `service.py`: end-to-end entrypoint for `/api/agent/message`
