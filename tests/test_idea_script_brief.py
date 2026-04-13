import os
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from bananaflow.agent.idea_script.prompts import build_generator_prompt, build_inference_prompt

try:
    from bananaflow.agent.idea_script.schemas import IdeaScriptRequest
except Exception:
    IdeaScriptRequest = None


class IdeaScriptBriefTests(unittest.TestCase):
    def test_request_accepts_brief_fields(self):
        if IdeaScriptRequest is None:
            self.skipTest("pydantic not installed in current test environment")
        req = IdeaScriptRequest(
            product="洗面奶",
            audience="油皮通勤女生",
            price_band="50-99元",
            conversion_goal="点击商品详情",
            primary_platform="抖音",
            secondary_platform="小红书",
            selected_angle="scene",
        )

        self.assertEqual(req.product, "洗面奶")
        self.assertEqual(req.audience, "油皮通勤女生")
        self.assertEqual(req.primary_platform, "抖音")
        self.assertEqual(req.selected_angle, "scene")

    def test_inference_prompt_includes_brief_context(self):
        prompt = build_inference_prompt(
            "洗面奶",
            brief_context={
                "audience": "油皮通勤女生",
                "primary_platform": "抖音",
                "conversion_goal": "点击商品详情",
            },
        )

        self.assertIn("product: 洗面奶", prompt)
        self.assertIn("target_audience: 油皮通勤女生", prompt)
        self.assertIn("primary_platform: 抖音", prompt)
        self.assertIn("conversion_goal: 点击商品详情", prompt)

    def test_generator_prompt_includes_brief_context(self):
        prompt = build_generator_prompt(
            product="洗面奶",
            persona="油皮通勤女生",
            pain_points=["容易出油"],
            scenes=["早上通勤前"],
            brief_context={
                "price_band": "50-99元",
                "secondary_platform": "小红书",
                "selected_angle": "scene",
            },
        )

        self.assertIn("product: 洗面奶", prompt)
        self.assertIn("price_band: 50-99元", prompt)
        self.assertIn("secondary_platform: 小红书", prompt)
        self.assertIn("preferred_angle: scene", prompt)

    def test_generator_prompt_drops_internal_few_shot_template(self):
        prompt = build_generator_prompt(
            product="洗面奶",
            persona="油皮通勤女生",
            pain_points=["容易出油"],
            scenes=["早上通勤前"],
            brief_context={
                "primary_platform": "抖音",
                "secondary_platform": "小红书",
            },
        )

        self.assertNotIn("few_shot_example", prompt)
        self.assertIn("Treat the external skill instructions", prompt)
        self.assertIn("Do not reuse generic house-style templates", prompt)


if __name__ == "__main__":
    unittest.main()
