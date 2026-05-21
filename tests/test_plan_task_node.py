import os, sys, unittest
ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


class TestTaskPlanState(unittest.TestCase):
    def test_agent_state_has_task_plan(self):
        import typing
        from agent_v2.graph.state import AgentState
        hints = typing.get_type_hints(AgentState, include_extras=True)
        self.assertIn("task_plan", hints, "AgentState must have task_plan field")

    def test_task_plan_field_is_optional_dict(self):
        import typing
        from agent_v2.graph.state import AgentState
        hints = typing.get_type_hints(AgentState, include_extras=True)
        hint = str(hints["task_plan"])
        self.assertIn("None", hint)
        self.assertIn("dict", hint)


class TestPlanTaskNode(unittest.TestCase):
    def _make_state(self, intent="answer_only", tool_name="", tool_args=None, **overrides):
        base = {
            "message": "你好",
            "thread_id": "t1",
            "intent": intent,
            "intent_confidence": 1.0,
            "intent_reason": "llm_coordinator",
            "tool_name": tool_name,
            "tool_args": tool_args or {},
            "member_authorization": "",
            "canvas_summary": {},
            "artifact_summary": {},
            "conversation_history": [],
            "trace": [],
            "task_plan": None,
        }
        base.update(overrides)
        return base

    def test_plan_task_produces_task_plan(self):
        from agent_v2.graph.nodes.plan_task import plan_task
        state = self._make_state(intent="answer_only", message="你好")
        result = plan_task(state)
        self.assertIn("task_plan", result)
        tp = result["task_plan"]
        self.assertIsInstance(tp, dict)

    def test_task_plan_has_required_fields(self):
        from agent_v2.graph.nodes.plan_task import plan_task
        state = self._make_state(intent="tool_call", message="帮我生成一张商品图")
        result = plan_task(state)
        tp = result["task_plan"]
        for field in ["intent", "target_agent", "task_type", "user_goal",
                      "action", "expected_output", "risk_level", "need_confirmation"]:
            self.assertIn(field, tp, f"task_plan missing field: {field}")

    def test_target_agent_matches_classify_intent(self):
        from agent_v2.graph.nodes.plan_task import plan_task
        cases = [
            ("answer_only", "execute_chitchat"),
            ("tool_call",   "execute_tool_call"),
        ]
        for intent, expected_agent in cases:
            with self.subTest(intent=intent):
                state = self._make_state(intent=intent)
                result = plan_task(state)
                self.assertEqual(
                    result["task_plan"]["target_agent"],
                    expected_agent,
                    f"intent={intent} must map to {expected_agent}",
                )

    def test_plan_task_returns_trace_entry(self):
        from agent_v2.graph.nodes.plan_task import plan_task
        state = self._make_state(intent="answer_only")
        result = plan_task(state)
        trace = result["trace"]
        self.assertTrue(any(t.get("type") == "PLAN_TASK" for t in trace))

    def test_plan_task_fallback_on_unknown_intent(self):
        """Unknown intent falls back to execute_chitchat without raising."""
        from agent_v2.graph.nodes.plan_task import plan_task
        state = self._make_state(intent="unknown_intent")
        result = plan_task(state)
        tp = result["task_plan"]
        self.assertEqual(tp["target_agent"], "execute_chitchat")

    def test_shot_workflow_plan_keeps_deterministic_task_type(self):
        from agent_v2.graph.nodes.plan_task import plan_task
        from unittest import mock

        state = self._make_state(
            intent="tool_call",
            tool_name="shot_workflow.compose",
            message="把剧本搭建成出图工作流",
        )
        stale_llm = {
            "intent": "tool.storyboard",
            "task_type": "generate_storyboard",
            "user_goal": "生成故事板",
            "action": "生成",
            "expected_output": "async_task",
        }
        with mock.patch("agent_v2.graph.nodes.plan_task._call_planner_llm", return_value=stale_llm) as call_llm:
            result = plan_task(state)

        call_llm.assert_not_called()
        tp = result["task_plan"]
        self.assertEqual(tp["task_type"], "compose_shot_image_workflow")
        self.assertEqual(tp["user_goal"], "把剧本搭建成出图工作流")
        self.assertEqual(tp["action"], "搭建")
        self.assertEqual(tp["expected_output"], "canvas_patch")


class TestRouterAfterPlan(unittest.TestCase):
    def _plan_state(self, target_agent: str) -> dict:
        return {"task_plan": {"target_agent": target_agent}, "tool_name": ""}

    def test_routes_chitchat(self):
        from agent_v2.graph.router import _route_after_plan
        self.assertEqual(_route_after_plan(self._plan_state("execute_chitchat")), "execute_chitchat")

    def test_routes_tool_call(self):
        from agent_v2.graph.router import _route_after_plan
        self.assertEqual(_route_after_plan(self._plan_state("execute_tool_call")), "execute_tool_call")

    def test_unknown_target_agent_falls_back_to_chitchat(self):
        from agent_v2.graph.router import _route_after_plan
        self.assertEqual(_route_after_plan(self._plan_state("unknown_node")), "execute_chitchat")


class TestExecuteNodesConsumePlan(unittest.TestCase):
    def _state_with_plan(self, intent="answer_only", user_goal="测试目标", **overrides):
        base = {
            "message": "原始消息",
            "thread_id": "t1",
            "intent": intent,
            "tool_name": "",
            "tool_args": {},
            "member_authorization": "",
            "trace": [],
            "exec_response_text": "",
            "exec_patches": [],
            "exec_warnings": [],
            "exec_data": {},
            "task_plan": {
                "intent": intent,
                "target_agent": "execute_chitchat",
                "task_type": "answer_question",
                "user_goal": user_goal,
                "target_object": None,
                "action": "回答",
                "required_context": [],
                "expected_output": "message",
                "risk_level": "low",
                "need_confirmation": False,
            },
        }
        base.update(overrides)
        return base

    def test_build_response_includes_task_plan_in_trace(self):
        from agent_v2.graph.nodes.build_response import build_response
        state = self._state_with_plan()
        state.update({
            "exec_patches": [],
            "exec_warnings": [],
            "exec_data": {},
            "exec_response_text": "hello",
            "canvas_summary": {},
            "artifact_summary": {},
            "conversation_history": [],
            "canvas_id": None,
            "mode": None,
            "final_response": None,
        })
        result = build_response(state)
        final = result["final_response"]
        trace = final["trace"]
        build_entry = next((t for t in trace if t.get("type") == "BUILD_RESPONSE"), None)
        self.assertIsNotNone(build_entry)
        self.assertIn("task_type", build_entry)


class TestGraphTopology(unittest.TestCase):
    def test_plan_task_node_in_graph(self):
        from agent_v2.graph import build_agent_graph
        g = build_agent_graph()
        self.assertIn("plan_task", g.nodes, "plan_task must be a node in the compiled graph")

    def test_classify_intent_edges_to_plan_task(self):
        from agent_v2.graph import build_agent_graph
        g = build_agent_graph()
        mermaid = g.get_graph().draw_mermaid()
        self.assertIn("classify_intent", mermaid)
        self.assertIn("plan_task", mermaid)
        # classify_intent must connect to plan_task
        self.assertTrue(
            "classify_intent" in mermaid and "plan_task" in mermaid,
            "Both classify_intent and plan_task must appear in graph"
        )

    def test_plan_task_does_not_edge_to_classify(self):
        from agent_v2.graph import build_agent_graph
        g = build_agent_graph()
        mermaid = g.get_graph().draw_mermaid()
        # plan_task should never route back to classify_intent
        self.assertNotIn("plan_task --> classify_intent", mermaid.replace("  ", " "))


if __name__ == "__main__":
    unittest.main()
