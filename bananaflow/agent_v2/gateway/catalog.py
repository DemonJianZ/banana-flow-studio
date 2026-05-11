from __future__ import annotations

from typing import Any, Dict, List, Optional

from agent.tools import AgentToolRegistry, build_builtin_registry


def _virtual_capabilities() -> List[Dict[str, Any]]:
    return [
        {
            "name": "general_answer",
            "description": "Answer naturally without calling tools when no system capability is needed.",
            "category": "virtual",
            "enabled": True,
            "timeout_seconds": None,
            "retry": {"max_attempts": 1},
            "cost_level": "low",
            "tags": ["chat", "general_answer"],
            "annotations": {"readOnlyHint": True, "idempotentHint": False, "destructiveHint": False},
            "input_schema": {"type": "object", "properties": {"message": {"type": "string"}}, "additionalProperties": True},
        },
        {
            "name": "canvas_planner",
            "description": "Use when the user wants canvas edits, workflow planning, nodes, edges, or patch generation.",
            "category": "virtual",
            "enabled": True,
            "timeout_seconds": None,
            "retry": {"max_attempts": 1},
            "cost_level": "medium",
            "tags": ["canvas", "planner", "workflow"],
            "annotations": {"readOnlyHint": False, "idempotentHint": False, "destructiveHint": False},
            "input_schema": {"type": "object", "properties": {"message": {"type": "string"}}, "additionalProperties": True},
        },
    ]


def build_capability_catalog(registry: Optional[AgentToolRegistry] = None) -> List[Dict[str, Any]]:
    resolved_registry = registry or build_builtin_registry()
    catalog: List[Dict[str, Any]] = list(_virtual_capabilities())
    for item in resolved_registry.to_prompt_catalog(enabled=True):
        catalog.append(dict(item))
        for alias in list(item.get("aliases") or []):
            alias_name = str(alias or "").strip()
            if not alias_name:
                continue
            alias_item = dict(item)
            alias_item["name"] = alias_name
            alias_item["canonical_name"] = item.get("name")
            catalog.append(alias_item)
    return catalog
