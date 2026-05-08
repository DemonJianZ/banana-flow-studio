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
    genai_module.types = types.SimpleNamespace(
        Part=lambda text="": types.SimpleNamespace(text=text),
        GenerateContentConfig=lambda **kwargs: types.SimpleNamespace(**kwargs),
    )
    google_module.genai = genai_module
    sys.modules["google"] = google_module
    sys.modules["google.genai"] = genai_module


_install_google_stub()


from bananaflow.agent.gateway.router import (  # noqa: E402
    build_capability_catalog,
    coordinate_agent_message,
    route_agent_message_intent,
)
from bananaflow.agent.gateway.schemas import AgentMessageRequest, CoordinatorDecision  # noqa: E402


class AgentGatewayRouterTests(unittest.TestCase):
    def test_force_action_should_win(self):
        decision = coordinate_agent_message(
            AgentMessageRequest(message="随便聊聊", force_action="answer_only")
        )
        self.assertEqual(decision.action, "answer_only")
        self.assertTrue(decision.forced)
        self.assertEqual(decision.matched_rule, "force_action")

    def test_ui_action_should_map_to_prompt_polish_tool(self):
        decision = coordinate_agent_message(
            AgentMessageRequest(message="润色一下我的提示词", ui_action="prompt_polish", mode="text2img")
        )
        self.assertEqual(decision.action, "tool_call")
        self.assertEqual(decision.tool_name, "prompt.polish")
        self.assertEqual(decision.tool_args["mode"], "text2img")
        self.assertTrue(decision.forced)

    def test_should_use_llm_coordinator_when_available(self):
        fake = CoordinatorDecision(
            action="tool_call",
            reason="llm decided",
            confidence=0.93,
            matched_rule="llm_coordinator",
            matched_capabilities=["prompt.polish"],
            tool_name="prompt.polish",
            tool_args={"prompt": "整理一下"},
        )
        with mock.patch("bananaflow.agent.gateway.router._coordinate_with_llm", return_value=fake):
            decision = coordinate_agent_message(AgentMessageRequest(message="帮我整理成更适合出图的提示词"))
        self.assertEqual(decision.action, "tool_call")
        self.assertEqual(decision.tool_name, "prompt.polish")
        self.assertEqual(decision.matched_rule, "llm_coordinator")

    def test_should_fallback_to_answer_only_when_coordinator_returns_none(self):
        with mock.patch("bananaflow.agent.gateway.router._coordinate_with_llm", return_value=None):
            decision = coordinate_agent_message(AgentMessageRequest(message="你好呀"))
        self.assertEqual(decision.action, "answer_only")
        self.assertEqual(decision.matched_rule, "fallback.answer_only")
        self.assertIn("general_answer", decision.matched_capabilities)

    def test_should_fallback_to_answer_only_when_coordinator_errors(self):
        with mock.patch("bananaflow.agent.gateway.router._coordinate_with_llm", side_effect=RuntimeError("llm down")):
            decision = route_agent_message_intent(AgentMessageRequest(message="你好呀"))
        self.assertEqual(decision.action, "answer_only")
        self.assertEqual(decision.matched_rule, "fallback.answer_only")

    def test_capability_catalog_should_include_virtual_and_registry_capabilities(self):
        catalog = build_capability_catalog()
        names = {item["name"] for item in catalog}
        self.assertIn("general_answer", names)
        self.assertIn("canvas_planner", names)
        self.assertIn("prompt.polish", names)


if __name__ == "__main__":
    unittest.main()
