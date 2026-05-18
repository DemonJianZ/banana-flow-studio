import sys, os, json, unittest
from unittest.mock import patch, MagicMock

# Ensure both repo root and bananaflow/ are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "bananaflow"))

class TestStoryboardShotGenerationEndpoint(unittest.TestCase):

    def _make_payload(self, **overrides):
        base = {
            "shot": {
                "shot_id": "s1",
                "shot_no": 1,
                "visual_description": "龙女站在庭院中",
                "camera": "中景",
                "duration_sec": 4.0,
                "referenced_entities": ["龙女"],
                "generation_notes": "",
            },
            "storyboard_plan": {
                "title": "测试",
                "style": "水墨风",
                "aspect_ratio": "16:9",
                "global_notes": ["写意"],
                "design_rationale": "",
            },
            "entities": {"characters": [], "subjects": [], "locations": []},
            "reference_images": [
                {"type": "character", "name": "龙女三视图", "url": "/main_assets/人物/龙女三视图.png"},
            ],
            "ai_chat_model_id": "gptimage2-abc",
            "authorization": "Bearer test-token",
        }
        base.update(overrides)
        return base

    def test_returns_task_id_on_success(self):
        """Endpoint must call LLM, resolve image URLs, submit task and return task_id."""
        from fastapi.testclient import TestClient

        mock_llm_response = MagicMock()
        mock_llm_response.text = json.dumps({
            "selected_image_names": ["龙女三视图"],
            "prompt": "水墨风，龙女站在庭院"
        })

        fake_task = {"task_id": "ai_chat_task_abc123", "status": "PENDING"}

        with patch("api.routes.call_genai_retry", return_value=mock_llm_response), \
             patch("api.routes.create_ai_chat_task", return_value=fake_task) as mock_create, \
             patch("api.routes.asyncio.create_task"), \
             patch("api.routes.MODEL_AGENT_CHAT", "gemini-2.5-flash-lite"):
            from app_factory import create_app
            app = create_app()
            client = TestClient(app)
            resp = client.post("/api/storyboard/generate_shot", json=self._make_payload())

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("task_id", data)
        mock_create.assert_called_once()
        call_kwargs = mock_create.call_args
        form = call_kwargs.kwargs.get("request_form") or {}
        self.assertIn("水墨风", str(form.get("message", "")))

    def test_fallback_prompt_on_llm_parse_failure(self):
        """When LLM returns unparseable JSON, falls back to visual_description template prompt."""
        from fastapi.testclient import TestClient
        mock_llm_response = MagicMock()
        mock_llm_response.text = "sorry, I cannot help with that"

        fake_task = {"task_id": "ai_chat_task_fallback", "status": "PENDING"}

        with patch("api.routes.call_genai_retry", return_value=mock_llm_response), \
             patch("api.routes.create_ai_chat_task", return_value=fake_task) as mock_create, \
             patch("api.routes.asyncio.create_task"), \
             patch("api.routes.MODEL_AGENT_CHAT", "gemini-2.5-flash-lite"):
            from app_factory import create_app
            app = create_app()
            client = TestClient(app)
            resp = client.post("/api/storyboard/generate_shot", json=self._make_payload())

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("task_id", data)
        mock_create.assert_called_once()
        form = mock_create.call_args.kwargs.get("request_form") or {}
        self.assertTrue(form.get("message"), "fallback prompt must not be empty")
        self.assertIn("龙女站在庭院中", str(form.get("message", "")))

    def test_missing_authorization_returns_400(self):
        """Empty authorization should return 400."""
        from fastapi.testclient import TestClient
        with patch("api.routes.call_genai_retry"), \
             patch("api.routes.create_ai_chat_task"), \
             patch("api.routes.asyncio.create_task"):
            from app_factory import create_app
            app = create_app()
            client = TestClient(app)
            resp = client.post(
                "/api/storyboard/generate_shot",
                json=self._make_payload(authorization="")
            )
        self.assertEqual(resp.status_code, 400)


if __name__ == "__main__":
    unittest.main()
