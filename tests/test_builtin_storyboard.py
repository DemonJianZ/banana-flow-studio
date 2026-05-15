"""
Tests for _handle_storyboard_design in agent/tools/builtin.py.
Covers T1.1: script_table parse failure falls back to brief-only.
"""
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

from bananaflow.agent.tools.builtin import _handle_storyboard_design  # noqa: E402
from bananaflow.agent.tools import AgentToolContext  # noqa: E402


def _mock_context():
    ctx = AgentToolContext(req_id="test-req", trace_sink=[], extra={})
    return ctx


def _minimal_plan_dict():
    return {
        "title": "测试分镜",
        "aspect_ratio": "16:9",
        "style": "写实",
        "target_duration_sec": 30.0,
        "estimated_duration_sec": 28.0,
        "shot_default_duration_sec": 4.0,
        "entities": {"characters": [], "subjects": [], "locations": []},
        "scenes": [],
        "global_notes": [],
        "design_rationale": "",
        "warnings": [],
    }


class TestHandleStoryboardDesignFallback(unittest.TestCase):

    def test_parse_failure_fallbacks_to_brief(self):
        """script_table 非空但 script_rows 为空 → 不抛异常，改为 brief-only 调用。"""
        plan_dict = _minimal_plan_dict()

        with mock.patch(
            "bananaflow.agent.tools.builtin._load_storyboard_components",
        ) as mock_load:
            mock_design = mock.MagicMock(return_value=mock.MagicMock(model_dump=lambda mode=None: plan_dict))
            mock_load.return_value = mock_design

            result = _handle_storyboard_design(
                args={
                    "brief": "一个咖啡广告",
                    "script_table": "这不是合法表格内容 XYZ",
                    "script_table_name": "bad_script.txt",
                    "script_rows": [],  # parse failed → empty
                },
                context=_mock_context(),
            )

        # Should return successfully, not raise
        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("title"), "测试分镜")

        # design_storyboard must be called with empty script_table (fallback cleared it)
        call_kwargs = mock_design.call_args[1]
        self.assertEqual(call_kwargs.get("script_table"), "")
        self.assertEqual(call_kwargs.get("script_table_name"), "")
        self.assertEqual(call_kwargs.get("script_rows"), [])
        self.assertEqual(result.get("script_source"), "brief")

    def test_valid_script_rows_not_affected(self):
        """合法 script_rows 非空 → 走 script_table 路径，不清空。"""
        plan_dict = _minimal_plan_dict()

        with mock.patch(
            "bananaflow.agent.tools.builtin._load_storyboard_components",
        ) as mock_load:
            mock_design = mock.MagicMock(return_value=mock.MagicMock(model_dump=lambda mode=None: plan_dict))
            mock_load.return_value = mock_design

            _handle_storyboard_design(
                args={
                    "brief": "一个咖啡广告",
                    "script_table": "| 镜号 | 场景 |\n|1|咖啡馆|",
                    "script_table_name": "good_script.txt",
                    "script_rows": [{"scene": "咖啡馆", "shot_no": "1"}],
                },
                context=_mock_context(),
            )

        call_kwargs = mock_design.call_args[1]
        self.assertEqual(call_kwargs.get("script_table_name"), "good_script.txt")
        self.assertEqual(len(call_kwargs.get("script_rows", [])), 1)

    def test_no_script_table_uses_brief_directly(self):
        """无 script_table → 正常 brief 路径，无任何警告或清空。"""
        plan_dict = _minimal_plan_dict()

        with mock.patch(
            "bananaflow.agent.tools.builtin._load_storyboard_components",
        ) as mock_load:
            mock_design = mock.MagicMock(return_value=mock.MagicMock(model_dump=lambda mode=None: plan_dict))
            mock_load.return_value = mock_design

            result = _handle_storyboard_design(
                args={"brief": "一个简单广告"},
                context=_mock_context(),
            )

        self.assertEqual(result.get("script_source"), "brief")


if __name__ == "__main__":
    unittest.main()
