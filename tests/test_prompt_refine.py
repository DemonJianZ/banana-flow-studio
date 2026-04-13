import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


from bananaflow.prompts import refine


class PromptRefineTests(unittest.TestCase):
    def test_normalize_prompt_polish_output_strips_wrappers(self):
        self.assertEqual(
            refine.normalize_prompt_polish_output("```text\nPrompt: A clean product photo\n```"),
            "A clean product photo",
        )

    def test_ollama_prompt_polish_calls_ollama_model(self):
        fake_response = SimpleNamespace(
            candidates=[
                SimpleNamespace(
                    content=SimpleNamespace(
                        parts=[
                            SimpleNamespace(
                                text='{"variants":[{"label":"贴近原文","text":"暴风雪中的极寒天气，摩托车手俯身疾驰，雪地公路蜿蜒向前，轮胎卷起雪雾，远处巍峨雪山群峰耸立，全景构图展现速度与自然的碰撞"}]}'
                            )
                        ]
                    )
                )
            ]
        )

        with patch("bananaflow.prompts.refine.generate_content_with_proxy", return_value=fake_response) as mock_call:
            out = refine.ollama_prompt_polish("暴风雪中的极寒天气，摩托车手俯身疾驰，雪地公路蜿蜒向前，轮胎卷起雪雾，远处巍峨雪山群峰耸立，全景构图展现速度与自然的碰撞", "text2img", req_id="req-1")

        self.assertEqual(
            out["text"],
            "暴风雪中的极寒天气，摩托车手俯身疾驰，雪地公路蜿蜒向前，轮胎卷起雪雾，远处巍峨雪山群峰耸立，全景构图展现速度与自然的碰撞",
        )
        self.assertEqual(len(out["variants"]), 3)
        self.assertEqual(out["variants"][0]["label"], "贴近原文")
        self.assertTrue(mock_call.called)
        _, kwargs = mock_call.call_args
        self.assertEqual(kwargs["model"], refine.MODEL_PROMPT_POLISH)
        self.assertEqual(
            kwargs["contents"][1].text,
            "User prompt: 暴风雪中的极寒天气，摩托车手俯身疾驰，雪地公路蜿蜒向前，轮胎卷起雪雾，远处巍峨雪山群峰耸立，全景构图展现速度与自然的碰撞",
        )
        self.assertEqual(kwargs["http_proxy"], refine.AGENT_MODEL_HTTP_PROXY)
        self.assertEqual(kwargs["https_proxy"], refine.AGENT_MODEL_HTTPS_PROXY)

    def test_ollama_prompt_polish_rejects_empty_prompt(self):
        self.assertEqual(refine.ollama_prompt_polish("   "), {"text": "", "variants": []})


if __name__ == "__main__":
    unittest.main()
