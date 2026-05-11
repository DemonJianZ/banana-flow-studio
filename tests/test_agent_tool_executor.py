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

    class _DummyPart:
        def __init__(self, text=""):
            self.text = text

    class _DummyGenerateContentConfig:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

    genai_module.types = types.SimpleNamespace(
        Part=_DummyPart,
        GenerateContentConfig=_DummyGenerateContentConfig,
    )
    google_module.genai = genai_module
    sys.modules["google"] = google_module
    sys.modules["google.genai"] = genai_module


_install_google_stub()


from bananaflow.agent.tools import (  # noqa: E402
    AgentToolContext,
    AgentToolExecutor,
    AgentToolRegistry,
    AgentToolResult,
    AgentToolSpec,
    AgentToolValidationError,
    register_builtin_tools,
)
from bananaflow.core.config import MODEL_AGENT_CHAT, MODEL_PROMPT_POLISH  # noqa: E402
from bananaflow.schemas.api import PromptPolishRequest  # noqa: E402
from bananaflow.agent.capability_executors import run_agent_prompt_polish  # noqa: E402


class AgentToolExecutorTests(unittest.TestCase):
    def test_execute_should_validate_args_and_attach_tool_metadata(self):
        registry = AgentToolRegistry()
        registry.register(
            AgentToolSpec(
                name="demo_tool",
                description="demo",
                input_schema={
                    "type": "object",
                    "properties": {"value": {"type": "integer", "minimum": 1}},
                    "required": ["value"],
                    "additionalProperties": False,
                },
                output_schema={"type": "object", "properties": {}, "additionalProperties": True},
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
            ),
            lambda args, ctx: {"echo": args["value"], "req_id": ctx.req_id},
        )
        executor = AgentToolExecutor(registry)

        with self.assertRaises(AgentToolValidationError):
            executor.execute("demo_tool", {"value": 0})

        out = executor.execute("demo_tool", {"value": 3}, context=AgentToolContext(req_id="req-1"))

        self.assertEqual(out["echo"], 3)
        self.assertEqual(out["req_id"], "req-1")
        self.assertEqual(out["tool_name"], "demo_tool")
        self.assertEqual(len(out["tool_hash"]), 64)
        self.assertEqual(executor.get_last_call_meta()["req_id"], "req-1")

    def test_safe_execute_should_return_failure_result_with_latency(self):
        registry = AgentToolRegistry()
        registry.register(
            AgentToolSpec(
                name="broken_tool",
                description="broken",
                input_schema={"type": "object", "properties": {}, "additionalProperties": False},
                output_schema={"type": "object", "properties": {}, "additionalProperties": True},
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
            ),
            lambda args, ctx: (_ for _ in ()).throw(RuntimeError("boom")),
        )
        executor = AgentToolExecutor(registry)

        result = executor.safe_execute("broken_tool", {}, context=AgentToolContext(req_id="req-fail"))

        self.assertIsInstance(result, AgentToolResult)
        self.assertFalse(result.ok)
        self.assertEqual(result.error_type, "RuntimeError")
        self.assertGreaterEqual(result.latency_ms, 0)

    def test_safe_execute_should_populate_retry_count(self):
        registry = AgentToolRegistry()
        state = {"calls": 0}

        def flaky(args, ctx):
            state["calls"] += 1
            if state["calls"] < 3:
                raise RuntimeError("retry me")
            return {"ok": True}

        registry.register(
            AgentToolSpec(
                name="flaky_tool",
                description="flaky",
                input_schema={"type": "object", "properties": {}, "additionalProperties": False},
                output_schema={"type": "object", "properties": {}, "additionalProperties": True},
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
                retry={"max_attempts": 3},
            ),
            flaky,
        )
        executor = AgentToolExecutor(registry)

        result = executor.safe_execute("flaky_tool", {}, context=AgentToolContext(req_id="req-retry"))

        self.assertTrue(result.ok)
        self.assertEqual(result.retry_count, 2)
        self.assertEqual(state["calls"], 3)
        self.assertGreaterEqual(result.latency_ms, 0)

    def test_disabled_tools_should_be_blocked_by_default(self):
        registry = AgentToolRegistry()
        registry.register(
            AgentToolSpec(
                name="disabled_tool",
                description="disabled",
                input_schema={"type": "object", "properties": {}, "additionalProperties": False},
                output_schema={"type": "object", "properties": {}, "additionalProperties": True},
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
                enabled=False,
            ),
            lambda args, ctx: {"ok": True},
        )
        executor = AgentToolExecutor(registry)

        result = executor.safe_execute("disabled_tool", {}, context=AgentToolContext(req_id="req-disabled"))

        self.assertFalse(result.ok)
        self.assertIn("tool disabled", result.error)

    def test_output_schema_should_be_validated(self):
        registry = AgentToolRegistry()
        registry.register(
            AgentToolSpec(
                name="output_tool",
                description="output",
                input_schema={"type": "object", "properties": {}, "additionalProperties": False},
                output_schema={
                    "type": "object",
                    "properties": {"text": {"type": "string"}, "tool_version": {"type": "string"}, "tool_hash": {"type": "string"}},
                    "required": ["text", "tool_version", "tool_hash"],
                    "additionalProperties": True,
                },
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
            ),
            lambda args, ctx: {"text": 123},
        )
        executor = AgentToolExecutor(registry)

        result = executor.safe_execute("output_tool", {}, context=AgentToolContext(req_id="req-output"))

        self.assertFalse(result.ok)
        self.assertIn("must be a string", result.error)

    def test_trace_sink_should_receive_redacted_event(self):
        registry = AgentToolRegistry()
        registry.register(
            AgentToolSpec(
                name="trace_tool",
                description="trace",
                input_schema={
                    "type": "object",
                    "properties": {
                        "authorization": {"type": "string"},
                        "image": {"type": "string"},
                        "note": {"type": "string"},
                    },
                    "required": ["authorization", "image"],
                    "additionalProperties": False,
                },
                output_schema={"type": "object", "properties": {}, "additionalProperties": True},
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
            ),
            lambda args, ctx: {"password": "secret-value", "echo": args.get("note", "")},
        )
        executor = AgentToolExecutor(registry)
        trace_sink = []

        result = executor.safe_execute(
            "trace_tool",
            {
                "authorization": "Bearer super-secret",
                "image": "data:image/png;base64," + ("A" * 500),
                "note": "x" * 400,
            },
            context=AgentToolContext(req_id="req-trace", trace_sink=trace_sink),
        )

        self.assertTrue(result.ok)
        self.assertEqual(len(trace_sink), 1)
        event = trace_sink[0]
        self.assertEqual(event["type"], "AGENT_TOOL_CALL")
        self.assertEqual(event["category"], "general")
        self.assertEqual(event["cost_level"], "low")
        self.assertEqual(event["tool_version"], "1.0.0")
        self.assertEqual(len(event["tool_hash"]), 64)
        self.assertEqual(event["args"]["authorization"], "<redacted>")
        self.assertIn("<truncated", event["args"]["image"])
        self.assertIn("<truncated", event["args"]["note"])
        self.assertEqual(event["output"]["password"], "<redacted>")

    def test_trace_should_limit_list_length_and_object_depth(self):
        registry = AgentToolRegistry()
        registry.register(
            AgentToolSpec(
                name="trace_limit_tool",
                description="trace limit",
                input_schema={"type": "object", "properties": {"nested": {"type": "object"}}, "additionalProperties": False},
                output_schema={"type": "object", "properties": {}, "additionalProperties": True},
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
            ),
            lambda args, ctx: {"ok": True, "nested": args.get("nested")},
        )
        executor = AgentToolExecutor(registry)
        trace_sink = []
        context = AgentToolContext(req_id="req-trace-limit", trace_sink=trace_sink, extra={"trace_list_limit": 2, "trace_object_depth": 2})

        nested = {"a": {"b": {"c": {"d": "too deep"}}}}
        executor.safe_execute("trace_limit_tool", {"nested": nested}, context=context)
        executor.safe_execute("trace_limit_tool", {"nested": nested}, context=context)
        executor.safe_execute("trace_limit_tool", {"nested": nested}, context=context)

        self.assertEqual(len(trace_sink), 2)
        self.assertEqual(trace_sink[-1]["args"]["nested"]["a"], "<max-depth>")

    def test_anyof_required_fields_should_be_enforced(self):
        registry = AgentToolRegistry()
        registry.register(
            AgentToolSpec(
                name="anyof_tool",
                description="anyof",
                input_schema={
                    "type": "object",
                    "properties": {"a": {"type": "string"}, "b": {"type": "string"}},
                    "anyOf": [{"required": ["a"]}, {"required": ["b"]}],
                    "additionalProperties": False,
                },
                output_schema={"type": "object", "properties": {}, "additionalProperties": True},
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
            ),
            lambda args, ctx: {"ok": True},
        )
        executor = AgentToolExecutor(registry)

        result = executor.safe_execute("anyof_tool", {}, context=AgentToolContext(req_id="req-anyof"))

        self.assertFalse(result.ok)
        self.assertIn("missing required field", result.error)

    def test_optional_none_values_should_be_omitted_before_validation(self):
        registry = AgentToolRegistry()
        seen = {}

        def handler(args, ctx):
            seen.update(args)
            return {"ok": True}

        registry.register(
            AgentToolSpec(
                name="optional_tool",
                description="optional",
                input_schema={
                    "type": "object",
                    "properties": {
                        "prompt": {"type": "string"},
                        "existing_script": {"type": "string"},
                    },
                    "required": ["prompt"],
                    "additionalProperties": False,
                },
                output_schema={"type": "object", "properties": {}, "additionalProperties": True},
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
            ),
            handler,
        )
        executor = AgentToolExecutor(registry)

        result = executor.safe_execute(
            "optional_tool",
            {"prompt": "x", "existing_script": None},
            context=AgentToolContext(req_id="req-none"),
        )

        self.assertTrue(result.ok)
        self.assertEqual(seen, {"prompt": "x"})

    def test_builtin_prompt_polish_should_wrap_existing_logic(self):
        registry = register_builtin_tools(AgentToolRegistry())
        executor = AgentToolExecutor(registry)

        with mock.patch("bananaflow.agent.tools.builtin._load_ollama_prompt_polish") as load_polish:
            polish = mock.Mock(
                return_value={
                    "text": "polished prompt",
                    "variants": [{"label": "v1", "text": "polished prompt"}],
                }
            )
            load_polish.return_value = polish

            out = executor.execute(
                "prompt.polish",
                {"prompt": "raw prompt", "mode": "text2img"},
                context=AgentToolContext(req_id="req-polish"),
            )

        self.assertEqual(out["text"], "polished prompt")
        self.assertEqual(out["model"], MODEL_PROMPT_POLISH)
        self.assertEqual(out["variants"][0]["label"], "v1")
        polish.assert_called_once()

    def test_builtin_idea_script_should_forward_execution_context(self):
        registry = register_builtin_tools(AgentToolRegistry())
        executor = AgentToolExecutor(registry)
        trajectory_sink = []
        trace_sink = []

        fake_response = types.SimpleNamespace(
            model_dump=lambda mode="json": {
                "topics": [],
                "edit_plans": [],
                "selected_topic_angle": None,
                "selected_topic_title": None,
            }
        )

        class _FakeIdeaScriptRequest:
            @classmethod
            def model_validate(cls, payload):
                return types.SimpleNamespace(**payload)

        fake_orchestrator = types.SimpleNamespace(run=mock.Mock(return_value=fake_response))

        with mock.patch("bananaflow.agent.tools.builtin._load_idea_script_components") as load_components:
            load_components.return_value = (fake_orchestrator, _FakeIdeaScriptRequest)

            out = executor.execute(
                "agent_idea_script_generate",
                {"product": "洗面奶"},
                context=AgentToolContext(
                    req_id="req-idea",
                    session_id="session-1",
                    session_summary_present=True,
                    tenant_id="tenant-a",
                    user_id="user-a",
                    trajectory_sink=trajectory_sink,
                    trace_sink=trace_sink,
                ),
            )

        self.assertEqual(out["topics"], [])
        self.assertEqual(out["edit_plans"], [])
        fake_orchestrator.run.assert_called_once()
        kwargs = fake_orchestrator.run.call_args.kwargs
        self.assertEqual(kwargs["session_id"], "session-1")
        self.assertTrue(kwargs["session_summary_present"])
        self.assertEqual(kwargs["tenant_id"], "tenant-a")
        self.assertEqual(kwargs["user_id"], "user-a")
        self.assertIs(kwargs["trajectory_sink"], trajectory_sink)
        self.assertIs(kwargs["trace_sink"], trace_sink)

    def test_capability_executor_prompt_polish_should_route_via_tool_executor(self):
        with mock.patch("bananaflow.agent.capability_executors._TOOL_EXECUTOR.execute") as execute:
            execute.return_value = {"text": "ok", "variants": [], "tool_version": "1.0.0", "tool_hash": "0" * 64}

            response = run_agent_prompt_polish(PromptPolishRequest(prompt="原始", mode="text2img"), "req-cap")

        self.assertEqual(response.text, "ok")
        execute.assert_called_once()
        call_args = execute.call_args
        self.assertEqual(call_args.args[0], "agent_prompt_polish")

    def test_capability_executor_chitchat_should_route_via_tool_executor(self):
        from bananaflow.agent.capability_executors import run_agent_chitchat

        with mock.patch("bananaflow.agent.capability_executors._TOOL_EXECUTOR.execute") as execute:
            execute.return_value = {"text": "chat ok", "model": "model-a", "tool_version": "1.0.0", "tool_hash": "0" * 64}

            response = run_agent_chitchat("你好", "req-chat")

        self.assertEqual(response.text, "chat ok")
        self.assertEqual(response.model, MODEL_AGENT_CHAT)
        execute.assert_called_once()
        self.assertEqual(execute.call_args.args[0], "agent_chitchat")

    def test_builtin_chitchat_should_use_ai_chat_client_when_authorization_exists(self):
        executor = AgentToolExecutor(register_builtin_tools(AgentToolRegistry()))

        def _fake_call(**kwargs):
            return type("Resp", (), {"text": "member ai reply"})()

        with mock.patch("bananaflow.agent.tools.builtin._load_ai_chat_text_client", return_value=_fake_call):
            out = executor.execute(
                "agent_chitchat",
                {"message": "你好"},
                context=AgentToolContext(req_id="req-chat-auth", extra={"member_authorization": "token-123"}),
            )

        self.assertEqual(out["text"], "member ai reply")
        self.assertEqual(out["model"], "gemini-3-flash")


if __name__ == "__main__":
    unittest.main()
