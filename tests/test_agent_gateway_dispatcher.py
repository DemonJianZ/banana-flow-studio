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


from bananaflow.agent.gateway.dispatcher import dispatch_agent_message  # noqa: E402
from bananaflow.agent.gateway.schemas import (  # noqa: E402
    AgentMessageRequest,
    CoordinatorDecision,
    CoordinatorStep,
)
from bananaflow.agent.gateway.service import handle_agent_message  # noqa: E402


class AgentGatewayDispatcherTests(unittest.TestCase):
    def _make_request(self) -> Request:
        request = Request({"type": "http", "method": "POST", "path": "/api/agent/message", "headers": []})
        request.state.req_id = "req-gateway"
        return request

    def test_dispatch_answer_only_should_use_direct_answer(self):
        request = self._make_request()
        req = AgentMessageRequest(message="你好")
        decision = CoordinatorDecision(action="answer_only", reason="general", answer="直接回复")
        out = dispatch_agent_message(req, decision, request=request, trace_sink=[])
        self.assertEqual(out["action"], "answer_only")
        self.assertEqual(out["response_text"], "直接回复")

    def test_dispatch_answer_only_should_fallback_to_chitchat_tool(self):
        request = self._make_request()
        req = AgentMessageRequest(message="你好")
        decision = CoordinatorDecision(action="answer_only", reason="general")
        with mock.patch("bananaflow.agent.gateway.dispatcher._TOOL_EXECUTOR.execute") as execute:
            execute.return_value = {"text": "你好，我在。"}
            out = dispatch_agent_message(req, decision, request=request, trace_sink=[])
        self.assertEqual(out["response_text"], "你好，我在。")
        self.assertEqual(execute.call_args.args[0], "agent_chitchat")

    def test_dispatch_clarify_should_return_question(self):
        request = self._make_request()
        req = AgentMessageRequest(message="帮我处理一下")
        decision = CoordinatorDecision(action="clarify", reason="missing info", clarification_question="你想处理哪一部分？")
        out = dispatch_agent_message(req, decision, request=request, trace_sink=[])
        self.assertEqual(out["action"], "clarify")
        self.assertEqual(out["response_text"], "你想处理哪一部分？")

    def test_dispatch_tool_call_should_call_tool_executor(self):
        request = self._make_request()
        req = AgentMessageRequest(message="润色提示词", mode="text2img")
        decision = CoordinatorDecision(
            action="tool_call",
            reason="single step",
            tool_name="prompt.polish",
            tool_args={},
        )
        with mock.patch("bananaflow.agent.gateway.dispatcher._TOOL_EXECUTOR.execute") as execute:
            execute.return_value = {"text": "polished", "variants": []}
            out = dispatch_agent_message(req, decision, request=request, trace_sink=[])
        self.assertEqual(out["action"], "tool_call")
        self.assertEqual(out["response_text"], "polished")
        self.assertEqual(execute.call_args.args[0], "prompt.polish")
        self.assertEqual(execute.call_args.args[1]["prompt"], "润色提示词")

    def test_dispatch_tool_call_should_resolve_from_matched_capabilities(self):
        request = self._make_request()
        req = AgentMessageRequest(message="帮我查知识库")
        decision = CoordinatorDecision(
            action="tool_call",
            reason="single step",
            matched_capabilities=["retrieval.search_knowledge"],
            tool_args={"query": "知识库", "top_k": 2},
        )
        with mock.patch("bananaflow.agent.gateway.dispatcher._TOOL_EXECUTOR.execute") as execute:
            execute.return_value = {"collection": "knowledge", "items": [{"doc_id": "k1"}]}
            out = dispatch_agent_message(req, decision, request=request, trace_sink=[])
        self.assertEqual(out["action"], "tool_call")
        self.assertEqual(execute.call_args.args[0], "retrieval.search_knowledge")
        self.assertEqual(out["data"]["collection"], "knowledge")

    def test_dispatch_canvas_plan_should_call_agent_plan_impl(self):
        request = self._make_request()
        req = AgentMessageRequest(message="加一个文生图节点", current_nodes=[{"id": "n1"}])
        decision = CoordinatorDecision(action="canvas_plan", reason="canvas edit")
        trace_sink = []
        with mock.patch("bananaflow.agent.gateway.dispatcher.agent_plan_impl") as plan_impl:
            plan_impl.return_value = {"ok": True, "patch": []}
            out = dispatch_agent_message(req, decision, request=request, trace_sink=trace_sink)
        self.assertEqual(out["action"], "canvas_plan")
        self.assertTrue(out["planner_result"]["ok"])
        self.assertEqual(trace_sink[0]["type"], "AGENT_PLANNER_RUN")
        plan_impl.assert_called_once()

    def test_dispatch_workflow_plan_should_execute_steps_sequentially(self):
        request = self._make_request()
        req = AgentMessageRequest(message="先润色再改画布", mode="text2img")
        decision = CoordinatorDecision(
            action="workflow_plan",
            reason="multi step",
            answer="我先按步骤处理。",
            steps=[
                CoordinatorStep(action="tool_call", tool_name="prompt.polish", tool_args={"prompt": "a"}),
                CoordinatorStep(action="canvas_plan", reason="update canvas"),
            ],
        )
        trace_sink = []
        with mock.patch("bananaflow.agent.gateway.dispatcher._TOOL_EXECUTOR.execute") as execute:
            with mock.patch("bananaflow.agent.gateway.dispatcher.agent_plan_impl") as plan_impl:
                execute.return_value = {"text": "polished"}
                plan_impl.return_value = {"ok": True, "patch": [{"op": "add"}]}
                out = dispatch_agent_message(req, decision, request=request, trace_sink=trace_sink)
        self.assertEqual(out["action"], "workflow_plan")
        self.assertEqual(len(out["workflow_results"]), 2)
        self.assertEqual(out["workflow_results"][0]["tool_name"], "prompt.polish")
        self.assertEqual(out["workflow_results"][1]["action"], "canvas_plan")
        self.assertEqual(out["response_text"], "我先按步骤处理。")

    def test_service_should_append_coordinator_and_response_trace(self):
        request = self._make_request()
        req = AgentMessageRequest(message="你好")
        decision = CoordinatorDecision(action="answer_only", reason="mocked", confidence=0.7)
        with mock.patch("bananaflow.agent.gateway.service.coordinate_agent_message", return_value=decision):
            with mock.patch("bananaflow.agent.gateway.service.dispatch_agent_message") as dispatch:
                dispatch.return_value = {"response_text": "hi", "data": {"text": "hi"}}
                out = handle_agent_message(req, request=request)
        self.assertEqual(out.action, "answer_only")
        self.assertEqual(out.trace[0]["type"], "COORDINATOR_DECISION")
        self.assertEqual(out.trace[-1]["type"], "RESPONSE_SYNTHESIZED")
        self.assertEqual(out.response_text, "hi")


if __name__ == "__main__":
    unittest.main()
