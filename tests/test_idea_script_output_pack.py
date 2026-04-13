import os
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from bananaflow.agent.idea_script.output_pack import build_structured_result, parse_script_sections


class IdeaScriptOutputPackTests(unittest.TestCase):
    def test_parse_script_sections_extracts_tagged_segments(self):
        sections = parse_script_sections(
            "[HOOK] 先别急着买\n[VIEW] 先看场景\n[STEPS] 三步判断\n[PRODUCT] 这款更稳\n[CTA] 先收藏"
        )

        self.assertEqual(sections["HOOK"], "先别急着买")
        self.assertEqual(sections["CTA"], "先收藏")

    def test_build_structured_result_prefers_selected_angle(self):
        result = build_structured_result(
            req_payload={
                "product": "洗面奶",
                "audience": "油皮通勤女生",
                "conversion_goal": "点击商品详情",
                "primary_platform": "抖音",
                "secondary_platform": "小红书",
                "selected_angle": "scene",
            },
            topics=[
                {
                    "angle": "persona",
                    "title": "人物标题",
                    "hook": "人物钩子",
                    "script_60s": "[HOOK] 人物\n[VIEW] 说明\n[STEPS] 步骤\n[PRODUCT] 产品\n[CTA] 行动",
                    "visual_keywords": ["人物", "对比"],
                },
                {
                    "angle": "scene",
                    "title": "场景标题",
                    "hook": "场景钩子",
                    "script_60s": "[HOOK] 场景\n[VIEW] 场景说明\n[STEPS] 场景步骤\n[PRODUCT] 场景产品\n[CTA] 立即查看",
                    "visual_keywords": ["场景", "对比", "通勤"],
                },
            ],
            risk_level="medium",
            blocking_issues=["hook_too_generic"],
            risky_spans=[{"field": "hook"}],
        )

        self.assertEqual(result["selected_topic_angle"], "scene")
        self.assertEqual(result["selected_topic_title"], "场景标题")
        self.assertEqual(result["platform_plan"]["primary"]["platform"], "抖音")
        self.assertIn("场景钩子", result["copy_pack"]["hook"])
        self.assertIn("hook_too_generic", "\n".join(result["risks_and_blockers"]))
        self.assertEqual(result["browser_ready_fields"]["platform"], "抖音")
        self.assertGreaterEqual(len(result["kpi_checklist"]), 5)

    def test_build_structured_result_prefers_raw_skill_payload(self):
        result = build_structured_result(
            req_payload={
                "product": "眼霜",
                "conversion_goal": "点击商品详情",
                "primary_platform": "抖音",
            },
            topics=[
                {
                    "angle": "维稳/高频使用场景构建",
                    "title": "熬夜党自救手册",
                    "hook": "学生党熬夜后怎么护理眼周",
                    "script_60s": "任意脚本",
                    "visual_keywords": ["熬夜", "眼周"],
                }
            ],
            raw_skill_payload={
                "selected_angle": "维稳/高频使用场景构建",
                "platform_plan": {
                    "primary": {"platform": "抖音", "goal": "点击商品详情", "format": "直播脚本", "cta": "点下方链接"},
                    "secondary": {"platform": "小红书", "goal": "点击商品详情", "format": "种草笔记", "cta": "看详情页"},
                },
                "copy_pack": {
                    "title": "真正的技能标题",
                    "hook": "真正的技能开头",
                    "caption": "真正的技能说明",
                    "product_highlights": ["卖点1", "卖点2"],
                    "faq": [{"question": "适合谁", "answer": "熬夜学生党"}],
                    "chat_reply_templates": ["先看详情页，再按预算选。"],
                },
                "browser_ready_fields": {
                    "platform": "抖音",
                    "product_title": "技能商品标题",
                    "short_description": "技能短描述",
                    "cta_text": "点下方链接",
                    "tags": ["熬夜", "学生党"],
                },
                "risks_and_blockers": ["避免夸大功效"],
                "kpi_checklist": ["浏览量", "点击率"],
                "next_actions": ["先改成抖音最终稿"],
            },
        )

        self.assertEqual(result["selected_topic_angle"], "维稳/高频使用场景构建")
        self.assertEqual(result["copy_pack"]["title"], "真正的技能标题")
        self.assertEqual(result["platform_plan"]["primary"]["format"], "直播脚本")
        self.assertEqual(result["browser_ready_fields"]["product_title"], "技能商品标题")
        self.assertEqual(result["risks_and_blockers"], ["避免夸大功效"])
        self.assertEqual(result["kpi_checklist"], ["浏览量", "点击率"])


if __name__ == "__main__":
    unittest.main()
