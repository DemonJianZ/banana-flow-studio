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


from bananaflow.agent_v2.gateway.coordinator import coordinate_agent_message  # noqa: E402
from bananaflow.agent_v2.gateway.context import summarize_selected_artifact  # noqa: E402
from bananaflow.agent_v2.gateway.schemas import AgentMessageRequest, CoordinatorDecision  # noqa: E402
from bananaflow.agent_v2.gateway.service import handle_agent_message  # noqa: E402
from bananaflow.agent.context import compact_nodes  # noqa: E402


class _FakeTracer:
    def __init__(self) -> None:
        self.calls = []

    def start_run(self, name, **kwargs):
        self.calls.append(("start_run", name, kwargs))
        return "run-v2"

    def end_run(self, run_id, **kwargs):
        self.calls.append(("end_run", run_id, kwargs))


class AgentV2GatewayTests(unittest.TestCase):
    def _make_request(self, headers=None) -> Request:
        raw_headers = []
        for key, value in dict(headers or {}).items():
            raw_headers.append((str(key).lower().encode("utf-8"), str(value).encode("utf-8")))
        request = Request({"type": "http", "method": "POST", "path": "/api/agent/message", "headers": raw_headers})
        request.state.req_id = "req-v2"
        return request

    def test_coordinator_should_apply_ui_shortcut(self):
        decision = coordinate_agent_message(
            AgentMessageRequest(message="润色一下我的提示词", ui_action="prompt_polish", mode="text2img")
        )
        self.assertEqual(decision.action, "tool_call")
        self.assertEqual(decision.tool_name, "prompt.polish")
        self.assertTrue(decision.forced)

    def test_coordinator_should_fallback_to_answer_only(self):
        with mock.patch("bananaflow.agent_v2.gateway.coordinator._coordinate_with_llm", return_value=None):
            decision = coordinate_agent_message(AgentMessageRequest(message="你好"))
        self.assertEqual(decision.action, "answer_only")
        self.assertEqual(decision.matched_rule, "fallback.answer_only")

    def test_coordinator_should_convert_storyboard_promise_reply_into_tool_call(self):
        llm_decision = CoordinatorDecision(
            action="answer_only",
            reason="llm_promise_only",
            confidence=0.62,
            answer="好的，我已经收到了您提供的所有关键参数：比例为16:9，风格为黑色电影风格，总时长约为48秒。我将使用这些信息，调用专业的故事板设计工具为您生成详细的分镜草稿。",
        )
        with mock.patch("bananaflow.agent_v2.gateway.coordinator._coordinate_with_llm", return_value=llm_decision):
            decision = coordinate_agent_message(
                AgentMessageRequest(
                    message="比例16:9，黑色电影风格，总时长48秒",
                    recent_messages=[{"role": "user", "text": "帮我做一个产品广告分镜"}],
                )
            )
        self.assertEqual(decision.action, "tool_call")
        self.assertEqual(decision.tool_name, "storyboard.design")
        self.assertEqual(decision.matched_rule, "guard.storyboard_tool_call")
        self.assertEqual(decision.tool_args["aspect_ratio"], "16:9")
        self.assertEqual(decision.tool_args["style"], "黑色电影风格")
        self.assertEqual(decision.tool_args["target_duration_sec"], 48.0)

    def test_coordinator_should_use_ai_chat_client_when_authorization_exists(self):
        fake_response = types.SimpleNamespace(text='{"action":"answer_only","reason":"member_ai","confidence":0.9,"answer":"你好"}')
        with mock.patch("bananaflow.agent_v2.gateway.coordinator._load_ai_chat_text_client", return_value=mock.Mock(return_value=fake_response)) as loader:
            decision = coordinate_agent_message(AgentMessageRequest(message="你好"), authorization="token-123")
        self.assertEqual(decision.action, "answer_only")
        self.assertEqual(decision.answer, "你好")
        loader.return_value.assert_called_once()

    def test_coordinator_should_route_selected_storyboard_edit_to_canvas_plan(self):
        decision = coordinate_agent_message(
            AgentMessageRequest(
                message="把这个镜头的旁白改得更克制一点",
                selected_artifact={
                    "kind": "storyboard_selection",
                    "fromNodeId": "story-1",
                    "meta": {
                        "selectionType": "shot",
                        "selectionId": "shot-3",
                        "selectionLabel": "镜头 3",
                    },
                },
            )
        )
        self.assertEqual(decision.action, "canvas_plan")
        self.assertEqual(decision.matched_rule, "selection.storyboard_edit")
        self.assertTrue(decision.forced)

    def test_selected_artifact_summary_should_include_storyboard_selection_meta(self):
        summary = summarize_selected_artifact(
            AgentMessageRequest(
                message="改一下",
                selected_artifact={
                    "kind": "storyboard_selection",
                    "fromNodeId": "story-1",
                    "meta": {
                        "nodeKind": "storyboard_plan",
                        "selectionType": "scene",
                        "selectionId": "scene-2",
                        "selectionLabel": "场景 2",
                        "selectionSummary": "调整雨夜暗巷氛围",
                        "storyboardTitle": "猫薄荷接头",
                        "sceneTitle": "雨夜的对峙",
                        "sceneLocation": "雨夜暗巷",
                        "payload": {"scene_id": "scene-2"},
                    },
                },
            )
        )
        self.assertEqual(summary["kind"], "storyboard_selection")
        self.assertEqual(summary["selection_type"], "scene")
        self.assertEqual(summary["selection_id"], "scene-2")
        self.assertEqual(summary["scene_location"], "雨夜暗巷")
        self.assertEqual(summary["payload"], {"scene_id": "scene-2"})

    def test_compact_nodes_should_preserve_storyboard_plan_payload(self):
        compacted = compact_nodes(
            [
                {
                    "id": "story-1",
                    "type": "storyboard_plan",
                    "x": 10,
                    "y": 20,
                    "data": {
                        "label": "故事板",
                        "node_kind": "storyboard_plan",
                        "title": "猫薄荷接头",
                        "storyboard_plan": {
                            "title": "猫薄荷接头",
                            "scenes": [{"scene_id": "scene-1", "title": "雨夜的对峙"}],
                        },
                    },
                }
            ]
        )
        self.assertEqual(compacted[0]["type"], "storyboard_plan")
        self.assertEqual(compacted[0]["data"]["title"], "猫薄荷接头")
        self.assertEqual(compacted[0]["data"]["storyboard_plan"]["scenes"][0]["scene_id"], "scene-1")

    def test_service_should_return_unified_response_and_trace(self):
        fake_tracer = _FakeTracer()
        decision = CoordinatorDecision(action="answer_only", reason="mocked", confidence=0.7)
        with mock.patch("bananaflow.agent_v2.gateway.service.get_tracer", return_value=fake_tracer):
            with mock.patch("bananaflow.agent_v2.gateway.service.coordinate_agent_message", return_value=decision):
                with mock.patch("bananaflow.agent_v2.gateway.service.dispatch_agent_message") as dispatch:
                    dispatch.return_value = {"response_text": "hi", "data": {"text": "hi"}}
                    out = handle_agent_message(AgentMessageRequest(message="你好"), request=self._make_request())
        self.assertTrue(out.ok)
        self.assertEqual(out.action, "answer_only")
        self.assertEqual(out.trace[0]["type"], "COORDINATOR_DECISION")
        self.assertEqual(out.trace[-1]["type"], "RESPONSE_SYNTHESIZED")
        self.assertEqual(fake_tracer.calls[0][0], "start_run")
        self.assertEqual(fake_tracer.calls[-1][0], "end_run")

    def test_service_should_extract_member_authorization_from_request(self):
        fake_tracer = _FakeTracer()
        with mock.patch("bananaflow.agent_v2.gateway.service.get_tracer", return_value=fake_tracer):
            with mock.patch("bananaflow.agent_v2.gateway.service.coordinate_agent_message", return_value=CoordinatorDecision(action="answer_only")) as coordinate:
                with mock.patch("bananaflow.agent_v2.gateway.service.dispatch_agent_message", return_value={"response_text": "ok", "data": {}}):
                    handle_agent_message(
                        AgentMessageRequest(message="你好"),
                        request=self._make_request(headers={"authorization": "Bearer token-xyz"}),
                    )
        self.assertEqual(coordinate.call_args.kwargs["authorization"], "token-xyz")


if __name__ == "__main__":
    unittest.main()
