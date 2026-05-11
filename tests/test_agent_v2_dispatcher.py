import os
import sys
import types
import unittest
from unittest import mock

from starlette.requests import Request


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
    genai_module.types = types.SimpleNamespace(
        Part=lambda text="": types.SimpleNamespace(text=text),
        GenerateContentConfig=lambda **kwargs: types.SimpleNamespace(**kwargs),
    )
    google_module.genai = genai_module
    sys.modules["google"] = google_module
    sys.modules["google.genai"] = genai_module


_install_google_stub()


from bananaflow.agent_v2.gateway.dispatcher import dispatch_agent_message  # noqa: E402
from bananaflow.agent_v2.gateway.schemas import AgentMessageRequest, CoordinatorDecision, CoordinatorStep  # noqa: E402


class AgentV2DispatcherTests(unittest.TestCase):
    def _make_request(self) -> Request:
        request = Request({"type": "http", "method": "POST", "path": "/api/agent/message", "headers": []})
        request.state.req_id = "req-v2"
        return request

    def test_dispatch_answer_only_should_use_direct_answer(self):
        out = dispatch_agent_message(
            AgentMessageRequest(message="你好"),
            CoordinatorDecision(action="answer_only", reason="general", answer="直接回复"),
            request=self._make_request(),
            trace_sink=[],
        )
        self.assertEqual(out["action"], "answer_only")
        self.assertEqual(out["response_text"], "直接回复")

    def test_dispatch_tool_call_should_resolve_matched_capability(self):
        with mock.patch("bananaflow.agent_v2.gateway.dispatcher._TOOL_EXECUTOR.execute") as execute:
            execute.return_value = {"collection": "knowledge", "items": [{"doc_id": "k1"}]}
            out = dispatch_agent_message(
                AgentMessageRequest(message="查知识库"),
                CoordinatorDecision(
                    action="tool_call",
                    reason="tool needed",
                    matched_capabilities=["retrieval.search_knowledge"],
                    tool_args={"query": "知识库"},
                ),
                request=self._make_request(),
                trace_sink=[],
            )
        self.assertEqual(out["action"], "tool_call")
        self.assertEqual(execute.call_args.args[0], "retrieval.search_knowledge")
        self.assertEqual(out["data"]["collection"], "knowledge")

    def test_dispatch_canvas_plan_should_call_adapter(self):
        trace_sink = []
        with mock.patch("bananaflow.agent_v2.gateway.dispatcher.run_canvas_planner") as planner:
            planner.return_value = {"ok": True, "patch": []}
            out = dispatch_agent_message(
                AgentMessageRequest(message="加个节点"),
                CoordinatorDecision(action="canvas_plan", reason="canvas"),
                request=self._make_request(),
                trace_sink=trace_sink,
            )
        self.assertEqual(out["action"], "canvas_plan")
        self.assertTrue(out["planner_result"]["ok"])
        self.assertEqual(trace_sink[0]["type"], "AGENT_PLANNER_RUN")

    def test_dispatch_workflow_plan_should_execute_steps(self):
        with mock.patch("bananaflow.agent_v2.gateway.dispatcher._TOOL_EXECUTOR.execute") as execute:
            with mock.patch("bananaflow.agent_v2.gateway.dispatcher.run_canvas_planner") as planner:
                execute.return_value = {"text": "polished"}
                planner.return_value = {"ok": True, "patch": [{"op": "add"}]}
                out = dispatch_agent_message(
                    AgentMessageRequest(message="先润色再改画布"),
                    CoordinatorDecision(
                        action="workflow_plan",
                        reason="multi step",
                        answer="开始处理。",
                        steps=[
                            CoordinatorStep(action="tool_call", tool_name="prompt.polish", tool_args={"prompt": "x"}),
                            CoordinatorStep(action="canvas_plan", reason="update canvas"),
                        ],
                    ),
                    request=self._make_request(),
                    trace_sink=[],
                )
        self.assertEqual(out["action"], "workflow_plan")
        self.assertEqual(len(out["workflow_results"]), 2)
        self.assertEqual(out["workflow_results"][0]["tool_name"], "prompt.polish")
        self.assertEqual(out["workflow_results"][1]["action"], "canvas_plan")


if __name__ == "__main__":
    unittest.main()
