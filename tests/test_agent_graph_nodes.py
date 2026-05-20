# tests/test_agent_graph_nodes.py
import os
import sys
import unittest

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


class TestAgentState(unittest.TestCase):
    def test_state_has_required_fields(self):
        from agent_v2.graph.state import AgentState
        import typing
        hints = typing.get_type_hints(AgentState, include_extras=True)
        for field in [
            "message", "thread_id", "intent", "exec_response_text",
            "exec_patches", "conversation_history", "trace", "final_response",
        ]:
            self.assertIn(field, hints, f"AgentState missing field: {field}")

    def test_invoke_response_fields(self):
        from agent_v2.graph.schemas import AgentInvokeResponse
        resp = AgentInvokeResponse(message="hi", intent="answer_only", thread_id="t1")
        self.assertEqual(resp.message, "hi")
        self.assertEqual(resp.patches, [])
        self.assertEqual(resp.warnings, [])
        self.assertIsNone(resp.async_task)
        self.assertIsNone(resp.tool_result)
        self.assertIsNone(resp.thought)

    def test_invoke_request_has_no_recent_messages(self):
        from agent_v2.graph.schemas import AgentInvokeRequest
        import inspect
        sig = inspect.signature(AgentInvokeRequest)
        self.assertNotIn("recent_messages", sig.parameters)


class TestNormalizeRequestNode(unittest.TestCase):
    def _make_state(self, **overrides):
        base = {
            "message": "你好",
            "force_action": None,
            "ui_action": None,
            "uploaded_documents": [],
            "selected_artifact": None,
            "mode": None,
            "thread_id": "t1",
            "canvas_id": None,
            "canvas_node_hints": None,
            "member_authorization": "",
            "current_nodes": [],
            "current_connections": [],
            "supplemental_prompt": None,
            "product": None, "audience": None, "price_band": None,
            "conversion_goal": None, "primary_platform": None,
            "secondary_platform": None, "selected_angle": None,
            "task_mode": None, "episode_count": None, "existing_script": None,
        }
        base.update(overrides)
        return base

    def test_ui_action_prompt_polish_sets_intent(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(message="润色提示词", ui_action="prompt_polish", mode="text2img")
        result = normalize_request(state)
        self.assertEqual(result["intent"], "tool_call")
        self.assertEqual(result["tool_name"], "prompt.polish")
        self.assertEqual(result["tool_args"]["mode"], "text2img")

    def test_force_action_canvas_plan_sets_intent(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(message="帮我搭画布", force_action="canvas_plan")
        result = normalize_request(state)
        self.assertEqual(result["intent"], "canvas_plan")

    def test_ui_action_canvas_plan_sets_intent(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(message="搭建画布", ui_action="canvas_plan")
        result = normalize_request(state)
        self.assertEqual(result["intent"], "canvas_plan")

    def test_selected_storyboard_edit_sets_canvas_plan(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(
            message="把这个镜头改得更克制",
            selected_artifact={"kind": "storyboard_selection", "fromNodeId": "s1",
                               "meta": {"selectionType": "shot", "selectionId": "shot-1"}},
        )
        result = normalize_request(state)
        self.assertEqual(result["intent"], "canvas_plan")

    def test_uploaded_storyboard_csv_sets_storyboard_tool(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(
            message="请整理",
            uploaded_documents=[{
                "name": "shots.csv",
                "kind": "storyboard_script_table",
                "text_content": "镜号,景别\n1,特写",
            }],
        )
        result = normalize_request(state)
        self.assertEqual(result["intent"], "tool_call")
        self.assertEqual(result["tool_name"], "storyboard.design")

    def test_no_shortcut_clears_intent_for_llm(self):
        from agent_v2.graph.nodes.normalize import normalize_request
        state = self._make_state(message="你好")
        result = normalize_request(state)
        self.assertEqual(result["intent"], "")
        self.assertEqual(result["tool_name"], "")


class TestAssembleContextNode(unittest.TestCase):
    def test_builds_canvas_summary_from_nodes(self):
        from agent_v2.graph.nodes.context import assemble_context
        state = {
            "current_nodes": [
                {"id": "n1", "type": "image_gen"},
                {"id": "n2", "type": "text_input"},
                {"id": "n3", "type": "image_gen"},  # duplicate type
            ],
            "current_connections": [{"from": "n1", "to": "n2"}],
            "selected_artifact": None,
            "thread_id": "t1",
            "canvas_id": "c1",
            "mode": None,
            "task_mode": None,
            "product": None,
        }
        result = assemble_context(state)
        self.assertEqual(result["canvas_summary"]["node_count"], 3)
        self.assertEqual(result["canvas_summary"]["connection_count"], 1)
        self.assertIn("image_gen", result["canvas_summary"]["node_types"])
        # duplicate types deduplicated
        self.assertEqual(len([t for t in result["canvas_summary"]["node_types"] if t == "image_gen"]), 1)

    def test_builds_artifact_summary_from_selected(self):
        from agent_v2.graph.nodes.context import assemble_context
        state = {
            "current_nodes": [],
            "current_connections": [],
            "selected_artifact": {
                "kind": "storyboard_selection",
                "fromNodeId": "s1",
                "meta": {
                    "selectionType": "scene",
                    "selectionId": "scene-2",
                    "selectionLabel": "场景 2",
                },
            },
            "thread_id": "t1",
            "canvas_id": None,
            "mode": None,
            "task_mode": None,
            "product": None,
        }
        result = assemble_context(state)
        self.assertEqual(result["artifact_summary"]["kind"], "storyboard_selection")
        self.assertEqual(result["artifact_summary"]["selection_type"], "scene")


import types as _types


def _install_google_stub():
    if "google.genai" in sys.modules:
        return
    google_module = _types.ModuleType("google")
    genai_module = _types.ModuleType("google.genai")
    genai_module.types = _types.SimpleNamespace(
        Part=lambda text="": _types.SimpleNamespace(text=text),
        GenerateContentConfig=lambda **kwargs: _types.SimpleNamespace(**kwargs),
    )
    google_module.genai = genai_module
    sys.modules["google"] = google_module
    sys.modules["google.genai"] = genai_module


_install_google_stub()


class TestClassifyIntentNode(unittest.TestCase):
    def _base_state(self, intent="", **overrides):
        state = {
            "message": "你好",
            "intent": intent,
            "intent_confidence": 0.0,
            "intent_reason": "",
            "tool_name": "",
            "tool_args": {},
            "canvas_summary": {},
            "artifact_summary": {},
            "conversation_history": [],
            "mode": None,
            "task_mode": None,
            "product": None,
            "canvas_id": None,
            "thread_id": "t1",
            "member_authorization": "",
            "uploaded_documents": [],
            "selected_artifact": None,
            "trace": [],
        }
        state.update(overrides)
        return state

    def test_skips_llm_when_intent_already_set(self):
        from agent_v2.graph.nodes.classify import classify_intent
        from unittest import mock
        state = self._base_state(intent="canvas_plan", tool_name="")
        with mock.patch("agent_v2.graph.nodes.classify._call_llm_coordinator") as mock_llm:
            result = classify_intent(state)
        mock_llm.assert_not_called()
        self.assertEqual(result["intent"], "canvas_plan")

    def test_calls_llm_and_parses_answer_only(self):
        from agent_v2.graph.nodes.classify import classify_intent
        from unittest import mock
        state = self._base_state(intent="")
        llm_json = '{"action":"answer_only","reason":"casual","confidence":0.9,"matched_capabilities":["general_answer"],"answer":"你好！"}'
        with mock.patch("agent_v2.graph.nodes.classify._call_llm_coordinator", return_value=llm_json):
            result = classify_intent(state)
        self.assertEqual(result["intent"], "answer_only")
        self.assertAlmostEqual(result["intent_confidence"], 0.9)

    def test_falls_back_to_answer_only_on_llm_failure(self):
        from agent_v2.graph.nodes.classify import classify_intent
        from unittest import mock
        state = self._base_state(intent="")
        with mock.patch("agent_v2.graph.nodes.classify._call_llm_coordinator", side_effect=RuntimeError("timeout")):
            result = classify_intent(state)
        self.assertEqual(result["intent"], "answer_only")
        self.assertEqual(result["intent_reason"], "coordinator_fallback")

    def test_storyboard_promise_guard_upgrades_to_tool_call(self):
        from agent_v2.graph.nodes.classify import classify_intent
        from unittest import mock
        state = self._base_state(
            intent="",
            message="比例16:9，黑色电影风格，总时长48秒",
            conversation_history=[{"role": "user", "text": "帮我做一个产品广告分镜"}],
        )
        promise_json = '{"action":"answer_only","reason":"llm_promise","confidence":0.62,"answer":"好的，我将调用故事板设计工具为您生成分镜草稿。"}'
        with mock.patch("agent_v2.graph.nodes.classify._call_llm_coordinator", return_value=promise_json):
            result = classify_intent(state)
        self.assertEqual(result["intent"], "tool_call")
        self.assertEqual(result["tool_name"], "storyboard.design")


class TestRouter(unittest.TestCase):
    def test_answer_only_routes_to_chitchat(self):
        from agent_v2.graph.router import _route_after_classify
        self.assertEqual(_route_after_classify({"intent": "answer_only"}), "execute_chitchat")

    def test_clarify_routes_to_clarify(self):
        from agent_v2.graph.router import _route_after_classify
        self.assertEqual(_route_after_classify({"intent": "clarify"}), "execute_clarify")

    def test_canvas_plan_routes_to_canvas(self):
        from agent_v2.graph.router import _route_after_classify
        self.assertEqual(_route_after_classify({"intent": "canvas_plan"}), "execute_canvas_plan")

    def test_tool_call_routes_to_tool(self):
        from agent_v2.graph.router import _route_after_classify
        self.assertEqual(_route_after_classify({"intent": "tool_call"}), "execute_tool_call")

    def test_unknown_falls_back_to_chitchat(self):
        from agent_v2.graph.router import _route_after_classify
        self.assertEqual(_route_after_classify({"intent": "unknown_intent"}), "execute_chitchat")

    def test_storyboard_tool_routes_to_storyboard(self):
        from agent_v2.graph.router import _route_after_tool
        self.assertEqual(
            _route_after_tool({"tool_name": "storyboard.design", "exec_data": {}}),
            "execute_storyboard",
        )

    def test_non_storyboard_routes_to_build_response(self):
        from agent_v2.graph.router import _route_after_tool
        self.assertEqual(
            _route_after_tool({"tool_name": "prompt.polish", "exec_data": {}}),
            "build_response",
        )


class TestExecuteChitchat(unittest.TestCase):
    def test_calls_chitchat_tool_and_sets_response_text(self):
        from agent_v2.graph.nodes.execute_chitchat import execute_chitchat
        from unittest import mock
        state = {
            "message": "你好",
            "thread_id": "t1",
            "member_authorization": "",
            "trace": [],
        }
        mock_payload = {"text": "你好！有什么需要帮助的吗？"}
        with mock.patch(
            "agent_v2.graph.nodes.execute_chitchat._run_chitchat_tool",
            return_value=mock_payload,
        ):
            result = execute_chitchat(state)
        self.assertEqual(result["exec_response_text"], "你好！有什么需要帮助的吗？")
        self.assertEqual(result["exec_patches"], [])
        self.assertEqual(result["exec_warnings"], [])

    def test_uses_llm_answer_when_already_set(self):
        from agent_v2.graph.nodes.execute_chitchat import execute_chitchat
        state = {
            "message": "你好",
            "thread_id": "t1",
            "member_authorization": "",
            "trace": [],
            "_llm_answer": "直接回答：你好！",
        }
        from unittest import mock
        with mock.patch("agent_v2.graph.nodes.execute_chitchat._run_chitchat_tool", return_value={"text": "hi"}):
            result = execute_chitchat(state)
        self.assertIn("exec_response_text", result)


class TestExecuteClarify(unittest.TestCase):
    def test_returns_clarification_question(self):
        from agent_v2.graph.nodes.execute_clarify import execute_clarify
        state = {
            "message": "帮我做个视频",
            "trace": [],
            "_clarification_question": "请问产品名称是什么？",
        }
        result = execute_clarify(state)
        self.assertEqual(result["exec_response_text"], "请问产品名称是什么？")
        self.assertEqual(result["exec_patches"], [])

    def test_default_question_when_none_set(self):
        from agent_v2.graph.nodes.execute_clarify import execute_clarify
        state = {"message": "...", "trace": [], "_clarification_question": None}
        result = execute_clarify(state)
        self.assertIn("exec_response_text", result)
        self.assertTrue(len(result["exec_response_text"]) > 0)


class TestExecuteCanvasPlan(unittest.TestCase):
    def test_applies_planner_result_to_patches(self):
        from agent_v2.graph.nodes.execute_canvas import execute_canvas_plan
        from unittest import mock

        planner_result = {
            "patch": [{"op": "add_node", "node": {"id": "n1", "type": "image_gen"}}],
            "summary": "已搭建画布。",
            "thought": "",
        }
        state = {
            "message": "帮我搭一个图生图流程",
            "thread_id": "t1",
            "supplemental_prompt": None,
            "current_nodes": [],
            "current_connections": [],
            "selected_artifact": None,
            "canvas_id": "c1",
            "trace": [],
        }
        with mock.patch(
            "agent_v2.graph.nodes.execute_canvas._run_canvas_planner",
            return_value=planner_result,
        ):
            result = execute_canvas_plan(state)

        self.assertEqual(result["exec_patches"], planner_result["patch"])
        self.assertEqual(result["exec_response_text"], "已搭建画布。")
        self.assertEqual(result["exec_data"]["thought"], "")


class TestExecuteToolCall(unittest.TestCase):
    def test_executes_prompt_polish_and_returns_tool_result(self):
        from agent_v2.graph.nodes.execute_tool import execute_tool_call
        from unittest import mock

        state = {
            "message": "产品图片白底",
            "tool_name": "prompt.polish",
            "tool_args": {"prompt": "产品图片白底", "mode": "text2img"},
            "thread_id": "t1",
            "member_authorization": "",
            "trace": [],
        }
        mock_result = {"text": "clean white background product photo", "variants": []}
        with mock.patch(
            "agent_v2.graph.nodes.execute_tool._run_tool",
            return_value=mock_result,
        ):
            result = execute_tool_call(state)

        self.assertEqual(result["exec_data"], mock_result)
        self.assertEqual(result["exec_patches"], [])

    def test_falls_back_to_chitchat_when_tool_not_found(self):
        from agent_v2.graph.nodes.execute_tool import execute_tool_call
        from unittest import mock

        state = {
            "message": "你好",
            "tool_name": "nonexistent.tool",
            "tool_args": {},
            "thread_id": "t1",
            "member_authorization": "",
            "trace": [],
        }
        with mock.patch(
            "agent_v2.graph.nodes.execute_tool._run_chitchat_fallback",
            return_value={"text": "fallback response"},
        ):
            result = execute_tool_call(state)
        self.assertEqual(result["exec_response_text"], "fallback response")


class TestExecuteStoryboard(unittest.TestCase):
    def test_creates_async_task_and_returns_task_id(self):
        from agent_v2.graph.nodes.execute_storyboard import execute_storyboard
        from unittest import mock

        state = {
            "thread_id": "t1",
            "tool_args": {"brief": "广告分镜", "aspect_ratio": "16:9"},
            "member_authorization": "",
            "trace": [],
        }
        with mock.patch(
            "agent_v2.graph.nodes.execute_storyboard._create_storyboard_task",
            return_value="task-abc",
        ):
            result = execute_storyboard(state)

        self.assertEqual(result["exec_data"]["task_id"], "task-abc")
        self.assertEqual(result["exec_data"]["status"], "pending")
        self.assertIn("task-abc", result["exec_response_text"])


if __name__ == "__main__":
    unittest.main()
