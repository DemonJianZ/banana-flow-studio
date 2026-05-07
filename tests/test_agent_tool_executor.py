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
    AgentToolSpec,
    AgentToolValidationError,
    register_builtin_tools,
)
from bananaflow.core.config import MODEL_PROMPT_POLISH  # noqa: E402
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

    def test_builtin_prompt_polish_should_wrap_existing_logic(self):
        registry = register_builtin_tools(AgentToolRegistry())
        executor = AgentToolExecutor(registry)

        with mock.patch("bananaflow.agent.tools.builtin.ollama_prompt_polish") as polish:
            polish.return_value = {
                "text": "polished prompt",
                "variants": [{"label": "v1", "text": "polished prompt"}],
            }

            out = executor.execute(
                "agent_prompt_polish",
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

        with mock.patch("bananaflow.agent.tools.builtin.idea_script_orchestrator.run") as run:
            run.return_value = fake_response

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
        run.assert_called_once()
        kwargs = run.call_args.kwargs
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


if __name__ == "__main__":
    unittest.main()
