# tests/test_agent_graph_e2e.py
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


class TestAgentGraphE2E(unittest.IsolatedAsyncioTestCase):
    def _make_initial_state(self, message: str, thread_id: str = "test-thread-1") -> dict:
        return {
            "message": message,
            "thread_id": thread_id,
            "canvas_id": None,
            "mode": None,
            "force_action": None,
            "ui_action": None,
            "uploaded_documents": [],
            "selected_artifact": None,
            "canvas_node_hints": None,
            "member_authorization": "",
            "current_nodes": [],
            "current_connections": [],
            "supplemental_prompt": None,
            "product": None, "audience": None, "price_band": None,
            "conversion_goal": None, "primary_platform": None,
            "secondary_platform": None, "selected_angle": None,
            "task_mode": None, "episode_count": None, "existing_script": None,
            "canvas_summary": {},
            "artifact_summary": {},
            "intent": "",
            "intent_confidence": 0.0,
            "intent_reason": "",
            "tool_name": "",
            "tool_args": {},
            "exec_response_text": "",
            "exec_patches": [],
            "exec_warnings": [],
            "exec_data": {},
            "final_response": None,
            "trace": [],
            "_clarification_question": None,
            "_llm_answer": None,
        }

    async def test_chitchat_via_force_action(self):
        from langgraph.checkpoint.memory import MemorySaver
        from agent_v2.graph import build_agent_graph

        graph = build_agent_graph(checkpointer=MemorySaver())
        state = self._make_initial_state("你好", thread_id="e2e-t1")
        state["force_action"] = "answer_only"

        mock_payload = {"text": "你好！请问有什么可以帮到您？"}
        with mock.patch("agent_v2.graph.nodes.execute_chitchat._run_chitchat_tool", return_value=mock_payload):
            result = await graph.ainvoke(state, config={"configurable": {"thread_id": "e2e-t1"}})

        resp = result["final_response"]
        self.assertTrue(resp["ok"])
        self.assertEqual(resp["intent"], "answer_only")
        self.assertEqual(resp["message"], "你好！请问有什么可以帮到您？")
        self.assertEqual(resp["patches"], [])

    async def test_conversation_history_accumulates_across_turns(self):
        from langgraph.checkpoint.memory import MemorySaver
        from agent_v2.graph import build_agent_graph

        checkpointer = MemorySaver()
        graph = build_agent_graph(checkpointer=checkpointer)
        config = {"configurable": {"thread_id": "e2e-history-t1"}}

        mock_payload = {"text": "第一轮回答"}
        with mock.patch("agent_v2.graph.nodes.execute_chitchat._run_chitchat_tool", return_value=mock_payload):
            state1 = self._make_initial_state("第一个问题", thread_id="e2e-history-t1")
            state1["force_action"] = "answer_only"
            await graph.ainvoke(state1, config=config)

        mock_payload2 = {"text": "第二轮回答"}
        with mock.patch("agent_v2.graph.nodes.execute_chitchat._run_chitchat_tool", return_value=mock_payload2):
            state2 = self._make_initial_state("第二个问题", thread_id="e2e-history-t1")
            state2["force_action"] = "answer_only"
            result2 = await graph.ainvoke(state2, config=config)

        # After 2 turns, conversation_history should have 4 entries (2 user + 2 assistant)
        history = result2.get("conversation_history", [])
        self.assertEqual(len(history), 4)
        self.assertEqual(history[0]["text"], "第一个问题")
        self.assertEqual(history[2]["text"], "第二个问题")

    async def test_storyboard_via_uploaded_csv(self):
        from langgraph.checkpoint.memory import MemorySaver
        from agent_v2.graph import build_agent_graph

        graph = build_agent_graph(checkpointer=MemorySaver())
        state = self._make_initial_state("整理成故事板", thread_id="e2e-sb-t1")
        state["uploaded_documents"] = [{
            "name": "shots.csv",
            "kind": "storyboard_script_table",
            "text_content": "镜号,景别\n1,特写",
        }]

        with mock.patch("agent_v2.graph.nodes.execute_storyboard._create_storyboard_task", return_value="sb-task-1"):
            result = await graph.ainvoke(state, config={"configurable": {"thread_id": "e2e-sb-t1"}})

        resp = result["final_response"]
        self.assertEqual(resp["intent"], "tool_call")
        self.assertIsNotNone(resp["async_task"])
        self.assertEqual(resp["async_task"]["task_id"], "sb-task-1")


if __name__ == "__main__":
    unittest.main()
