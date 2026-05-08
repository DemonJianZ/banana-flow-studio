import os
import sys
import unittest
from unittest import mock


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


from bananaflow.agent.tools import AgentToolContext, AgentToolExecutor, AgentToolRegistry, AgentToolSpec  # noqa: E402
from bananaflow.observability import (  # noqa: E402
    NoopTracer,
    ObservabilityConfig,
    ObservabilityTracer,
    build_tracer,
    get_tracer,
    reset_tracer_cache,
)
from bananaflow.observability.providers import BaseObservabilityProvider  # noqa: E402


class _FakeProvider(BaseObservabilityProvider):
    provider_name = "fake"

    def __init__(self) -> None:
        self.events = []

    def start_run(self, **kwargs):
        self.events.append(("start_run", kwargs))
        return "run-fake"

    def end_run(self, run_id, **kwargs):
        self.events.append(("end_run", {"run_id": run_id, **kwargs}))

    def start_span(self, **kwargs):
        self.events.append(("start_span", kwargs))
        return "span-fake"

    def end_span(self, span_id, **kwargs):
        self.events.append(("end_span", {"span_id": span_id, **kwargs}))

    def generation(self, **kwargs):
        self.events.append(("generation", kwargs))

    def tool_call(self, **kwargs):
        self.events.append(("tool_call", kwargs))

    def score(self, **kwargs):
        self.events.append(("score", kwargs))


class ObservabilityTracerTests(unittest.TestCase):
    def tearDown(self):
        reset_tracer_cache()

    def test_build_tracer_should_default_to_noop(self):
        tracer = build_tracer(ObservabilityConfig(provider="none"))
        self.assertIsInstance(tracer, NoopTracer)
        self.assertTrue(tracer.start_run("demo"))

    def test_build_tracer_should_select_langfuse_and_langsmith_without_sdk(self):
        langfuse_tracer = build_tracer(ObservabilityConfig(provider="langfuse"))
        langsmith_tracer = build_tracer(ObservabilityConfig(provider="langsmith"))

        self.assertIsInstance(langfuse_tracer, ObservabilityTracer)
        self.assertEqual(langfuse_tracer.provider_name, "langfuse")
        self.assertIsInstance(langsmith_tracer, ObservabilityTracer)
        self.assertEqual(langsmith_tracer.provider_name, "langsmith")

    def test_get_tracer_should_follow_env_provider(self):
        with mock.patch.dict(os.environ, {"OBS_PROVIDER": "none"}, clear=False):
            reset_tracer_cache()
            tracer = get_tracer()
        self.assertIsInstance(tracer, NoopTracer)

    def test_tracer_should_sanitize_tool_payloads_and_emit_events(self):
        provider = _FakeProvider()
        tracer = ObservabilityTracer(provider, ObservabilityConfig(provider="fake"))

        run_id = tracer.start_run(
            "agent.run",
            input_data={"authorization": "Bearer secret", "image": "data:image/png;base64," + ("A" * 320)},
            metadata={"api_key": "xyz"},
        )
        with tracer.span("tool.span", run_id=run_id, input_data={"password": "hidden"}):
            tracer.generation(
                "coordinator",
                run_id=run_id,
                model="demo-model",
                input_data={"prompt": "hello", "token": "abc"},
                output_data={"text": "world"},
            )
            tracer.tool_call(
                "prompt.polish",
                run_id=run_id,
                input_data={"cookie": "session=abc", "payload": "A" * 200},
                output_data={"text": "done", "secret": "value"},
                error=None,
                metadata={"nested": {"secret": "hide-me"}},
            )
            tracer.score("quality", run_id=run_id, value=0.8, comment="ok")
        tracer.end_run(run_id, output_data={"text": "done", "password": "pw"})

        event_names = [name for name, _ in provider.events]
        self.assertEqual(event_names, ["start_run", "start_span", "generation", "tool_call", "score", "end_span", "end_run"])

        start_run_payload = provider.events[0][1]
        self.assertEqual(start_run_payload["input_data"]["authorization"], "<redacted>")
        self.assertIn("<truncated", start_run_payload["input_data"]["image"])
        self.assertEqual(start_run_payload["metadata"]["api_key"], "<redacted>")

        tool_call_payload = provider.events[3][1]
        self.assertEqual(tool_call_payload["input_data"]["cookie"], "<redacted>")
        self.assertEqual(tool_call_payload["output_data"]["secret"], "<redacted>")
        self.assertEqual(tool_call_payload["metadata"]["nested"]["secret"], "<redacted>")

    def test_span_should_close_with_error_metadata(self):
        provider = _FakeProvider()
        tracer = ObservabilityTracer(provider, ObservabilityConfig(provider="fake"))

        with self.assertRaises(RuntimeError):
            with tracer.span("broken", run_id="run-1", input_data={"message": "x"}):
                raise RuntimeError("boom")

        self.assertEqual(provider.events[0][0], "start_span")
        self.assertEqual(provider.events[1][0], "end_span")
        self.assertEqual(provider.events[1][1]["error"], "boom")

    def test_tool_executor_should_emit_observability_tool_call_when_run_id_exists(self):
        registry = AgentToolRegistry()
        registry.register(
            AgentToolSpec(
                name="demo_tool",
                description="demo",
                input_schema={
                    "type": "object",
                    "properties": {"authorization": {"type": "string"}, "payload": {"type": "string"}},
                    "required": ["authorization", "payload"],
                    "additionalProperties": False,
                },
                output_schema={"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"], "additionalProperties": True},
                annotations={"readOnlyHint": True, "idempotentHint": True, "destructiveHint": False},
            ),
            lambda args, ctx: {"text": args["payload"], "secret": "server-secret"},
        )
        executor = AgentToolExecutor(registry)
        provider = _FakeProvider()
        tracer = ObservabilityTracer(provider, ObservabilityConfig(provider="fake"))

        result = executor.safe_execute(
            "demo_tool",
            {"authorization": "Bearer secret", "payload": "data:image/png;base64," + ("A" * 320)},
            context=AgentToolContext(req_id="req-obs", extra={"run_id": "run-123", "tracer": tracer}),
        )

        self.assertTrue(result.ok)
        self.assertEqual(provider.events[0][0], "tool_call")
        payload = provider.events[0][1]
        self.assertEqual(payload["run_id"], "run-123")
        self.assertEqual(payload["tool_name"], "demo_tool")
        self.assertEqual(payload["input_data"]["authorization"], "<redacted>")
        self.assertIn("<truncated", payload["input_data"]["payload"])
        self.assertEqual(payload["output_data"]["secret"], "<redacted>")
        self.assertEqual(payload["metadata"]["req_id"], "req-obs")


if __name__ == "__main__":
    unittest.main()
