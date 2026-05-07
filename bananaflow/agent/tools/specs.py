from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .errors import AgentToolValidationError


def canonical_json(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def compute_tool_hash(base_definition: Dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(base_definition).encode("utf-8")).hexdigest()


def _path_join(path: str, part: str) -> str:
    if not path:
        return part
    if not part:
        return path
    return f"{path}.{part}"


def _is_object_schema(schema: Dict[str, Any]) -> bool:
    schema_type = str(schema.get("type") or "").strip()
    if schema_type == "object":
        return True
    return any(key in schema for key in ("required", "properties", "additionalProperties"))


def _validate_schema(schema: Dict[str, Any], value: Any, path: str = "") -> None:
    schema_type = str(schema.get("type") or "").strip()
    if _is_object_schema(schema):
        if not isinstance(value, dict):
            raise AgentToolValidationError(f"{path or 'args'} must be an object")
        required = [str(item) for item in list(schema.get("required") or []) if str(item)]
        for key in required:
            if key not in value:
                raise AgentToolValidationError(f"missing required field: {_path_join(path or 'args', key)}")
        properties = schema.get("properties") or {}
        additional_properties = schema.get("additionalProperties", True)
        if additional_properties is False:
            unknown = sorted(set(value.keys()) - set(properties.keys()))
            if unknown:
                raise AgentToolValidationError(
                    f"unexpected field: {_path_join(path or 'args', str(unknown[0]))}"
                )
        for key, child_schema in dict(properties).items():
            if key in value and isinstance(child_schema, dict):
                _validate_schema(child_schema, value.get(key), _path_join(path or "args", str(key)))
    elif schema_type == "array":
        if not isinstance(value, list):
            raise AgentToolValidationError(f"{path or 'args'} must be an array")
        items_schema = schema.get("items") or {}
        min_items = schema.get("minItems")
        max_items = schema.get("maxItems")
        if min_items is not None and len(value) < int(min_items):
            raise AgentToolValidationError(f"{path or 'args'} must contain at least {int(min_items)} items")
        if max_items is not None and len(value) > int(max_items):
            raise AgentToolValidationError(f"{path or 'args'} must contain at most {int(max_items)} items")
        if isinstance(items_schema, dict):
            for index, item in enumerate(value):
                _validate_schema(items_schema, item, f"{path or 'args'}[{index}]")
    elif schema_type == "string":
        if not isinstance(value, str):
            raise AgentToolValidationError(f"{path or 'args'} must be a string")
        enum = schema.get("enum")
        if isinstance(enum, list) and enum and value not in enum:
            raise AgentToolValidationError(f"{path or 'args'} must be one of {enum}")
    elif schema_type == "integer":
        if isinstance(value, bool) or not isinstance(value, int):
            raise AgentToolValidationError(f"{path or 'args'} must be an integer")
        minimum = schema.get("minimum")
        maximum = schema.get("maximum")
        if minimum is not None and value < int(minimum):
            raise AgentToolValidationError(f"{path or 'args'} must be >= {int(minimum)}")
        if maximum is not None and value > int(maximum):
            raise AgentToolValidationError(f"{path or 'args'} must be <= {int(maximum)}")
    elif schema_type == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise AgentToolValidationError(f"{path or 'args'} must be a number")
        minimum = schema.get("minimum")
        maximum = schema.get("maximum")
        if minimum is not None and float(value) < float(minimum):
            raise AgentToolValidationError(f"{path or 'args'} must be >= {float(minimum)}")
        if maximum is not None and float(value) > float(maximum):
            raise AgentToolValidationError(f"{path or 'args'} must be <= {float(maximum)}")
    elif schema_type == "boolean":
        if not isinstance(value, bool):
            raise AgentToolValidationError(f"{path or 'args'} must be a boolean")

    any_of = schema.get("anyOf")
    if isinstance(any_of, list) and any_of:
        child_errors: List[str] = []
        for child in any_of:
            try:
                _validate_schema(dict(child or {}), value, path)
                break
            except AgentToolValidationError as exc:
                child_errors.append(str(exc))
        else:
            raise AgentToolValidationError(
                child_errors[0] if child_errors else f"{path or 'args'} failed anyOf validation"
            )

    one_of = schema.get("oneOf")
    if isinstance(one_of, list) and one_of:
        match_count = 0
        first_error: Optional[str] = None
        for child in one_of:
            try:
                _validate_schema(dict(child or {}), value, path)
                match_count += 1
            except AgentToolValidationError as exc:
                if first_error is None:
                    first_error = str(exc)
        if match_count != 1:
            raise AgentToolValidationError(first_error or f"{path or 'args'} failed oneOf validation")


@dataclass(frozen=True)
class AgentToolSpec:
    name: str
    description: str
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]
    annotations: Dict[str, Any]
    tool_version: str = "1.0.0"
    aliases: List[str] = field(default_factory=list)
    category: str = "general"
    enabled: bool = True
    timeout_seconds: Optional[float] = None
    retry: Dict[str, Any] = field(default_factory=lambda: {"max_attempts": 1})
    cost_level: str = "low"
    tags: List[str] = field(default_factory=list)

    def definition_base(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": dict(self.input_schema),
            "outputSchema": dict(self.output_schema),
            "annotations": dict(self.annotations),
            "tool_version": self.tool_version,
            "aliases": list(self.aliases),
            "category": self.category,
            "enabled": bool(self.enabled),
            "timeout_seconds": self.timeout_seconds,
            "retry": dict(self.retry),
            "cost_level": self.cost_level,
            "tags": list(self.tags),
        }

    @property
    def tool_hash(self) -> str:
        return compute_tool_hash(self.definition_base())

    def to_dict(self) -> Dict[str, Any]:
        payload = self.definition_base()
        payload["tool_hash"] = self.tool_hash
        return payload

    def to_prompt_catalog(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "aliases": list(self.aliases),
            "description": self.description,
            "category": self.category,
            "enabled": bool(self.enabled),
            "timeout_seconds": self.timeout_seconds,
            "retry": dict(self.retry),
            "cost_level": self.cost_level,
            "tags": list(self.tags),
            "annotations": dict(self.annotations),
            "input_schema": dict(self.input_schema),
        }

    def validate_input(self, args: Dict[str, Any]) -> Dict[str, Any]:
        payload = dict(args or {})
        _validate_schema(self.input_schema, payload, "")
        return payload

    def validate_output(self, output: Dict[str, Any]) -> Dict[str, Any]:
        payload = dict(output or {})
        _validate_schema(self.output_schema, payload, "")
        return payload
