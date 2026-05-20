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
        # Should allow None
        self.assertIn("None", hint)


if __name__ == "__main__":
    unittest.main()
