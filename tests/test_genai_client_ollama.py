import importlib
import os
import sys
import types
import unittest
from unittest import mock


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


def _install_google_stub():
    google_module = types.ModuleType("google")
    genai_module = types.ModuleType("google.genai")

    class _DummyPart:
        def __init__(self, text=""):
            self.text = text

    class _DummyGenerateContentConfig:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

    class _DummyGoogleModels:
        def __init__(self):
            self.calls = []

        def generate_content(self, **kwargs):
            self.calls.append(kwargs)
            return {"provider": "google", "kwargs": kwargs}

    class _DummyGoogleClient:
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs
            self.models = _DummyGoogleModels()

    genai_module.Client = _DummyGoogleClient
    genai_module.types = types.SimpleNamespace(
        Part=_DummyPart,
        GenerateContentConfig=_DummyGenerateContentConfig,
    )
    google_module.genai = genai_module
    sys.modules["google"] = google_module
    sys.modules["google.genai"] = genai_module


def _install_httpx_stub():
    httpx_module = types.ModuleType("httpx")

    class _DummyHttpxResponse:
        def __init__(self, status_code=200, data=None):
            self.status_code = status_code
            self._data = data or {}

        def raise_for_status(self):
            if self.status_code >= 400:
                raise RuntimeError(f"http error: {self.status_code}")

        def json(self):
            return dict(self._data)

    class _DummyHttpxClient:
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url):
            return _DummyHttpxResponse(status_code=200, data={"models": []})

        def post(self, url, json=None):
            return _DummyHttpxResponse(status_code=200, data={"response": "stub"})

    httpx_module.Client = _DummyHttpxClient
    sys.modules["httpx"] = httpx_module


def _reload_llm_modules():
    _install_google_stub()
    _install_httpx_stub()
    for name in (
        "bananaflow.services.ollama_client",
        "bananaflow.services.genai_client",
    ):
        sys.modules.pop(name, None)
    ollama_module = importlib.import_module("bananaflow.services.ollama_client")
    genai_module = importlib.import_module("bananaflow.services.genai_client")
    return ollama_module, genai_module


class GenAIClientOllamaTests(unittest.TestCase):
    def setUp(self):
        self._module_backup = {
            "google": sys.modules.get("google"),
            "google.genai": sys.modules.get("google.genai"),
            "httpx": sys.modules.get("httpx"),
            "bananaflow.services.ollama_client": sys.modules.get("bananaflow.services.ollama_client"),
            "bananaflow.services.genai_client": sys.modules.get("bananaflow.services.genai_client"),
        }

    def tearDown(self):
        for name, module in self._module_backup.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module

    def test_unified_client_routes_ollama_models_by_prefix(self):
        _, genai_module = _reload_llm_modules()
        google_client = mock.Mock()
        google_client.models.generate_content = mock.Mock(return_value="google")
        ollama_client = mock.Mock()
        ollama_client.generate_content = mock.Mock(return_value="ollama")

        client = genai_module.UnifiedGenAIClient(google_client=google_client, ollama_client=ollama_client)
        result = client.models.generate_content(
            model="ollama:gemma4",
            contents=["hello"],
            config={"temperature": 0.2},
        )

        self.assertEqual(result, "ollama")
        ollama_client.generate_content.assert_called_once()
        google_client.models.generate_content.assert_not_called()

    def test_unified_client_routes_non_ollama_models_to_google(self):
        _, genai_module = _reload_llm_modules()
        google_client = mock.Mock()
        google_client.models.generate_content = mock.Mock(return_value="google")
        ollama_client = mock.Mock()

        client = genai_module.UnifiedGenAIClient(google_client=google_client, ollama_client=ollama_client)
        result = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=["hello"],
            config={"temperature": 0.2},
        )

        self.assertEqual(result, "google")
        google_client.models.generate_content.assert_called_once()
        ollama_client.generate_content.assert_not_called()

    def test_call_genai_retry_with_proxy_uses_shared_client_for_ollama(self):
        _, genai_module = _reload_llm_modules()
        shared_client = mock.Mock()
        shared_client.models.generate_content = mock.Mock(return_value="ollama")

        with mock.patch.object(genai_module, "get_client", return_value=shared_client):
            with mock.patch.object(genai_module, "_build_google_client") as build_google_client:
                result = genai_module.call_genai_retry_with_proxy(
                    contents=["hello"],
                    config={"temperature": 0.1},
                    req_id="req_1",
                    retries=1,
                    model="ollama:gemma4",
                    http_proxy="http://proxy.local:8080",
                    https_proxy="http://proxy.local:8080",
                )

        self.assertEqual(result, "ollama")
        shared_client.models.generate_content.assert_called_once()
        build_google_client.assert_not_called()

    def test_ollama_requested_when_canvas_default_model_uses_ollama(self):
        _, genai_module = _reload_llm_modules()

        with mock.patch.object(genai_module, "MODEL_AGENT", "ollama:gemma4:latest"):
            self.assertTrue(genai_module._ollama_requested())

    def test_ollama_prompt_builder_and_response_shape_match_existing_contract(self):
        ollama_module, _ = _reload_llm_modules()

        class _Part:
            def __init__(self, text):
                self.text = text

        class _Container:
            def __init__(self, parts):
                self.parts = parts

        prompt = ollama_module.build_prompt_from_contents(
            [
                "system",
                {"text": "user", "parts": [{"text": "context"}]},
                _Container(parts=[_Part("assistant")]),
            ]
        )
        response = ollama_module.OllamaGenerateResponse(text="final answer", raw={"response": "final answer"})

        self.assertEqual(prompt, "system\n\nuser\n\ncontext\n\nassistant")
        self.assertEqual(response.text, "final answer")
        self.assertEqual(response.candidates[0].content.parts[0].text, "final answer")

    def test_idea_script_client_defaults_to_ollama_gemma4(self):
        _reload_llm_modules()
        for name in (
            "bananaflow.agent.idea_script.gemini_client",
        ):
            sys.modules.pop(name, None)
        idea_client_module = importlib.import_module("bananaflow.agent.idea_script.gemini_client")

        self.assertEqual(idea_client_module.DEFAULT_IDEA_SCRIPT_MODEL, "ollama:gemma4:latest")

        client = idea_client_module.IdeaScriptGeminiClient()
        self.assertTrue(client.is_ollama)
        self.assertEqual(client.timeout_sec, idea_client_module.DEFAULT_IDEA_SCRIPT_OLLAMA_TIMEOUT_SEC)

        fake_response = types.SimpleNamespace(
            text=(
                "["
                "{\"angle\":\"persona\",\"title\":\"A\",\"hook\":\"H\",\"script_60s\":\"[HOOK] a [VIEW] b [STEPS] c [PRODUCT] d [CTA] e\",\"visual_keywords\":[\"a\",\"b\",\"c\",\"d\",\"e\"]},"
                "{\"angle\":\"scene\",\"title\":\"B\",\"hook\":\"H\",\"script_60s\":\"[HOOK] a [VIEW] b [STEPS] c [PRODUCT] d [CTA] e\",\"visual_keywords\":[\"a\",\"b\",\"c\",\"d\",\"e\"]},"
                "{\"angle\":\"misconception\",\"title\":\"C\",\"hook\":\"H\",\"script_60s\":\"[HOOK] a [VIEW] b [STEPS] c [PRODUCT] d [CTA] e\",\"visual_keywords\":[\"a\",\"b\",\"c\",\"d\",\"e\"]}"
                "]"
            ),
            candidates=[
                types.SimpleNamespace(
                    content=types.SimpleNamespace(parts=[types.SimpleNamespace(text="stub")])
                )
            ],
        )
        client.ollama_client.generate_content = mock.Mock(return_value=fake_response)

        out = client.generate_idea_scripts(
            audience_context={
                "product": "耳机",
                "persona": "通勤职场人",
                "pain_points": ["通勤降噪"],
                "scenes": ["地铁"],
            }
        )

        self.assertEqual(len(out), 3)
        client.ollama_client.generate_content.assert_called_once()

    def test_idea_script_client_coerces_skill_style_inference_payload(self):
        _reload_llm_modules()
        for name in (
            "bananaflow.agent.idea_script.gemini_client",
        ):
            sys.modules.pop(name, None)
        idea_client_module = importlib.import_module("bananaflow.agent.idea_script.gemini_client")

        client = idea_client_module.IdeaScriptGeminiClient()
        normalized = client._coerce_inference_payload(
            {
                "offer_decision": {
                    "selected_angle": "低门槛冲动购买",
                    "why_this_angle_wins": "痛点明显，适合先测点击率和冲动购买力",
                },
                "copy_pack": {
                    "source_offer": {
                        "product": "桌面理线器",
                        "pain_point": "桌面线材凌乱",
                    }
                },
                "platform_plan": {
                    "primary": {
                        "platform": "抖音",
                        "content_type": "问题到解决的短视频演示",
                    }
                },
            },
            product="桌面理线器",
            brief_context={
                "audience": "办公桌容易凌乱的上班族",
                "conversion_goal": "点击商品详情",
                "primary_platform": "抖音",
            },
        )

        self.assertEqual(normalized["product"], "桌面理线器")
        self.assertEqual(normalized["persona"], "办公桌容易凌乱的上班族")
        self.assertIn("桌面线材凌乱", normalized["pain_points"])
        self.assertIn("抖音平台首轮测试", normalized["scenes"])
        self.assertIn("痛点明显", normalized["why_this_persona"])
        self.assertGreater(normalized["confidence"], 0.5)

    def test_idea_script_client_coerces_nested_scene_objects_and_alias_fields(self):
        _reload_llm_modules()
        for name in (
            "bananaflow.agent.idea_script.gemini_client",
        ):
            sys.modules.pop(name, None)
        idea_client_module = importlib.import_module("bananaflow.agent.idea_script.gemini_client")

        client = idea_client_module.IdeaScriptGeminiClient()
        normalized = client._coerce_inference_payload(
            {
                "product_sku": "某品牌眼霜",
                "target_buyer_persona": "30-35岁都市宝妈",
                "pain_points": ["黑眼圈明显", "细纹开始出现"],
                "scenes": [
                    {
                        "name": "深夜护肤",
                        "description": "深夜洗漱后进行眼部护理。",
                        "purchase_moment": "对比多款产品后决定购买。",
                    }
                ],
                "primary_platform_assumption": "抖音",
                "confidence": 0.9,
            },
            product="眼霜",
            brief_context={},
        )

        self.assertEqual(normalized["product"], "某品牌眼霜")
        self.assertEqual(normalized["persona"], "30-35岁都市宝妈")
        self.assertIn("黑眼圈明显", normalized["pain_points"])
        self.assertIn("深夜洗漱后进行眼部护理。", normalized["scenes"])
        self.assertIn("对比多款产品后决定购买。", normalized["scenes"])

    def test_idea_script_client_coerces_target_buyer_persona_object(self):
        _reload_llm_modules()
        for name in (
            "bananaflow.agent.idea_script.gemini_client",
        ):
            sys.modules.pop(name, None)
        idea_client_module = importlib.import_module("bananaflow.agent.idea_script.gemini_client")

        client = idea_client_module.IdeaScriptGeminiClient()
        normalized = client._coerce_inference_payload(
            {
                "selected_angle": "眼周细纹、黑眼圈的视觉改善",
                "target_buyer_persona": {
                    "persona_name": "关注眼周保养的职场白领",
                    "description_zh": "25-35岁的办公室白领，关注眼周初老。",
                    "pain_points_zh": ["熬夜导致黑眼圈", "眼周细纹开始出现"],
                    "shoots_scene_zh": ["加班回家后照镜子护理眼周。"],
                    "confidence": 0.9,
                },
                "primary_platform_assumption": {
                    "platform_name_zh": "抖音",
                    "focus_reason_zh": "抖音适合快速视觉演示。",
                },
                "unsafe_claim_risk": "中等。避免绝对化词汇。",
            },
            product="眼霜",
            brief_context={},
        )

        self.assertIn("办公室白领", normalized["persona"])
        self.assertIn("熬夜导致黑眼圈", normalized["pain_points"])
        self.assertIn("加班回家后照镜子护理眼周。", normalized["scenes"])
        self.assertIn("抖音适合快速视觉演示。", normalized["why_this_persona"])

    def test_idea_script_client_coerces_candidate_angles_payload(self):
        _reload_llm_modules()
        for name in (
            "bananaflow.agent.idea_script.gemini_client",
        ):
            sys.modules.pop(name, None)
        idea_client_module = importlib.import_module("bananaflow.agent.idea_script.gemini_client")

        client = idea_client_module.IdeaScriptGeminiClient()
        normalized = client._coerce_generation_payload(
            {
                "candidate_angles": [
                    {
                        "angle": "Persona-Driven: 熬夜党肌肤救星",
                        "angle_title": "人物标题",
                        "hook": "人物钩子",
                        "script_60s": "[HOOK] a [VIEW] b [STEPS] c [PRODUCT] d [CTA] e",
                        "visual_keywords": ["人物", "修护", "熬夜"],
                    },
                    {
                        "angle": "Scene-Driven: 懒人高效决策对比法",
                        "angle_title": "场景标题",
                        "hook": "场景钩子",
                        "script_60s": "[HOOK] a [VIEW] b [STEPS] c [PRODUCT] d [CTA] e",
                        "visual_keywords": ["场景", "对比", "决策"],
                    },
                    {
                        "angle": "Misconception-Based: 彻底清洁的误区",
                        "angle_title": "误区标题",
                        "hook": "误区钩子",
                        "script_60s": "[HOOK] a [VIEW] b [STEPS] c [PRODUCT] d [CTA] e",
                        "visual_keywords": ["误区", "清洁", "屏障"],
                    },
                ]
            }
        )

        self.assertEqual(len(normalized), 3)
        self.assertEqual(normalized[0]["angle"], "Persona-Driven: 熬夜党肌肤救星")
        self.assertEqual(normalized[1]["angle"], "Scene-Driven: 懒人高效决策对比法")
        self.assertEqual(normalized[2]["angle"], "Misconception-Based: 彻底清洁的误区")
        self.assertEqual(normalized[0]["title"], "人物标题")

    def test_idea_script_client_preserves_skill_native_angle_labels(self):
        _reload_llm_modules()
        for name in (
            "bananaflow.agent.idea_script.gemini_client",
        ):
            sys.modules.pop(name, None)
        idea_client_module = importlib.import_module("bananaflow.agent.idea_script.gemini_client")

        client = idea_client_module.IdeaScriptGeminiClient()
        normalized = client._coerce_generation_payload(
            {
                "angles": [
                    {
                        "angle": "场景切入：深夜自我护理仪式感",
                        "title": "场景标题",
                        "hook": "场景钩子",
                        "script_60s": "[HOOK] a [VIEW] b [STEPS] c [PRODUCT] d [CTA] e",
                        "visual_keywords": ["深夜", "护理", "仪式感"],
                    },
                    {
                        "angle": "痛点激发：产后状态的急救需求",
                        "title": "痛点标题",
                        "hook": "痛点钩子",
                        "script_60s": "[HOOK] a [VIEW] b [STEPS] c [PRODUCT] d [CTA] e",
                        "visual_keywords": ["宝妈", "急救", "补水"],
                    },
                    {
                        "angle": "认知纠正：效果和性价比的双重满足",
                        "title": "认知标题",
                        "hook": "认知钩子",
                        "script_60s": "[HOOK] a [VIEW] b [STEPS] c [PRODUCT] d [CTA] e",
                        "visual_keywords": ["性价比", "纠正", "效果"],
                    },
                ]
            }
        )

        self.assertEqual(
            [item["angle"] for item in normalized],
            [
                "场景切入：深夜自我护理仪式感",
                "痛点激发：产后状态的急救需求",
                "认知纠正：效果和性价比的双重满足",
            ],
        )

    def test_idea_script_client_coerces_angle_keyed_payload(self):
        _reload_llm_modules()
        for name in (
            "bananaflow.agent.idea_script.gemini_client",
        ):
            sys.modules.pop(name, None)
        idea_client_module = importlib.import_module("bananaflow.agent.idea_script.gemini_client")

        client = idea_client_module.IdeaScriptGeminiClient()
        normalized = client._coerce_generation_payload(
            {
                "angle_1": {
                    "angle": "解决痛点型：聚焦妈咪的实际困扰",
                    "title": "标题1",
                    "hook": "hook1",
                    "script_60s": "[HOOK] a [VIEW] b [STEPS] c [PRODUCT] d [CTA] e",
                    "visual_keywords": ["黑眼圈", "宝妈"],
                },
                "angle_2": {
                    "angle": "情绪共鸣型：建立情感连接和信任",
                    "title": "标题2",
                    "hook": "hook2",
                    "script_60s": "[HOOK] a [VIEW] b [STEPS] c [PRODUCT] d [CTA] e",
                    "visual_keywords": ["情绪", "共鸣"],
                },
                "angle_3": {
                    "angle": "价值科普型：从专业角度提供解决方案",
                    "title": "标题3",
                    "hook": "hook3",
                    "script_60s": "[HOOK] a [VIEW] b [STEPS] c [PRODUCT] d [CTA] e",
                    "visual_keywords": ["科普", "成分"],
                },
            }
        )

        self.assertEqual(len(normalized), 3)
        self.assertEqual(normalized[0]["angle"], "解决痛点型：聚焦妈咪的实际困扰")
        self.assertEqual(normalized[2]["title"], "标题3")

    def test_idea_script_client_coerces_candidates_payload(self):
        _reload_llm_modules()
        for name in (
            "bananaflow.agent.idea_script.gemini_client",
        ):
            sys.modules.pop(name, None)
        idea_client_module = importlib.import_module("bananaflow.agent.idea_script.gemini_client")

        client = idea_client_module.IdeaScriptGeminiClient()
        normalized = client._coerce_generation_payload(
            {
                "candidates": [
                    {
                        "angle": "可见的日常功效改善",
                        "title": "标题A",
                        "hook": "hookA",
                        "script_60s": "[HOOK] a [VIEW] b [STEPS] c [PRODUCT] d [CTA] e",
                        "visual_keywords": "熬夜场景，暗沉眼周特写",
                    },
                    {
                        "angle": "成分和科技概念深度科普",
                        "title": "标题B",
                        "hook": "hookB",
                        "script_60s": "[HOOK] a [VIEW] b [STEPS] c [PRODUCT] d [CTA] e",
                        "visual_keywords": "皮肤微观结构科普动画，成分图解",
                    },
                    {
                        "angle": "场景化的需求痛点解决",
                        "title": "标题C",
                        "hook": "hookC",
                        "script_60s": "[HOOK] a [VIEW] b [STEPS] c [PRODUCT] d [CTA] e",
                    },
                ]
            }
        )

        self.assertEqual(len(normalized), 3)
        self.assertEqual(normalized[0]["angle"], "可见的日常功效改善")
        self.assertIn("熬夜场景", normalized[0]["visual_keywords"])


if __name__ == "__main__":
    unittest.main()
