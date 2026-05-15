# Bananaflow Agent Architecture

The active agent runtime is the Agent v2 chain.

```text
/api/agent/message
  -> agent_v2.gateway.service.handle_agent_message
  -> coordinator decision
  -> planner / tool executor / retrieval / general answer
  -> AgentMessageResponse
```

Core modules kept after cleanup:

- `agent_v2/gateway/*`
- `agent/planner.py`
- `agent/graph.py`
- `agent/storyboard_local_edit.py`
- `agent/tools/*`
- `retrieval/*`
- `observability/*`

Removed in this cleanup:

- legacy `agent/gateway/*`
- legacy capability execution modules
- old `idea_script`, `drama_creator`, `storyboard_execution` subsystems
