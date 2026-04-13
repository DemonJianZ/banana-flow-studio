import importlib
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
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


def _reload_modules():
    _install_google_stub()
    _install_httpx_stub()
    for name in (
        "bananaflow.services.runtime_skill",
        "bananaflow.services.ollama_client",
        "bananaflow.services.genai_client",
        "bananaflow.prompts.refine",
        "bananaflow.agent.idea_script.gemini_client",
    ):
        sys.modules.pop(name, None)
    runtime_skill = importlib.import_module("bananaflow.services.runtime_skill")
    refine = importlib.import_module("bananaflow.prompts.refine")
    idea_client_module = importlib.import_module("bananaflow.agent.idea_script.gemini_client")
    return runtime_skill, refine, idea_client_module


class RuntimeSkillIntegrationTests(unittest.TestCase):
    def setUp(self):
        self._env_backup = os.environ.copy()
        self._module_backup = {
            name: sys.modules.get(name)
            for name in (
                "google",
                "google.genai",
                "httpx",
                "bananaflow.services.runtime_skill",
                "bananaflow.services.ollama_client",
                "bananaflow.services.genai_client",
                "bananaflow.prompts.refine",
                "bananaflow.agent.idea_script.gemini_client",
            )
        }

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._env_backup)
        for name, module in self._module_backup.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module

    def test_prompt_polish_system_prompt_no_longer_includes_runtime_skill(self):
        os.environ["BANANAFLOW_PROMPT_POLISH_SKILL_TEXT"] = "保持中国市场增长运营语气。"
        runtime_skill, refine, _ = _reload_modules()
        runtime_skill.clear_runtime_skill_cache()

        prompt = refine.build_prompt_polish_system_prompt("img2video")

        self.assertNotIn("外部技能约束", prompt)
        self.assertNotIn("保持中国市场增长运营语气。", prompt)
        self.assertIn("动作连续性", prompt)

    def test_runtime_skill_reads_skill_markdown_from_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_file = os.path.join(tmpdir, "SKILL.md")
            with open(skill_file, "w", encoding="utf-8") as fh:
                fh.write("# China Growth Ops\n聚焦中国市场转化与增长。")
            os.environ["BANANAFLOW_PROMPT_POLISH_SKILL_DIR"] = tmpdir
            runtime_skill, _, _ = _reload_modules()
            runtime_skill.clear_runtime_skill_cache()

            skill_text = runtime_skill.get_runtime_skill_text("prompt_polish")

        self.assertIn("China Growth Ops", skill_text)
        self.assertIn("聚焦中国市场转化与增长", skill_text)

    def test_runtime_skill_auto_discovers_project_local_skill_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = Path(tmpdir) / "skills" / ".agents" / "skills" / "china-growth-ops-skill"
            skill_dir.mkdir(parents=True, exist_ok=True)
            (skill_dir / "SKILL.md").write_text("# Local Skill\n自动发现项目内 skill。", encoding="utf-8")
            runtime_skill, _, _ = _reload_modules()
            runtime_skill.clear_runtime_skill_cache()

            with mock.patch.object(runtime_skill, "_project_root", return_value=Path(tmpdir)):
                skill_text = runtime_skill.get_runtime_skill_text("idea_script")

        self.assertIn("Local Skill", skill_text)
        self.assertIn("自动发现项目内 skill", skill_text)

    def test_idea_script_skill_bundle_includes_reference_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = Path(tmpdir) / "skills" / ".agents" / "skills" / "china-growth-ops-skill"
            ref_dir = skill_dir / "references"
            ref_dir.mkdir(parents=True, exist_ok=True)
            (skill_dir / "SKILL.md").write_text("# Local Skill\n核心工作流。", encoding="utf-8")
            (ref_dir / "templates.md").write_text("# Copy Templates\nChat Reply", encoding="utf-8")
            (ref_dir / "example-run.md").write_text("# Example Run\nOffer Decision", encoding="utf-8")
            runtime_skill, _, _ = _reload_modules()
            runtime_skill.clear_runtime_skill_cache()

            with mock.patch.object(runtime_skill, "_project_root", return_value=Path(tmpdir)):
                skill_text = runtime_skill.get_runtime_skill_text("idea_script")

        self.assertIn("Local Skill", skill_text)
        self.assertIn("[Reference: references/templates.md]", skill_text)
        self.assertIn("Copy Templates", skill_text)
        self.assertIn("Example Run", skill_text)

    def test_storyboard_skill_auto_discovers_project_local_skill_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = Path(tmpdir) / "skills" / ".agents" / "skills" / "storyboard-storytelling-pipeline"
            ref_dir = skill_dir / "references"
            ref_dir.mkdir(parents=True, exist_ok=True)
            (skill_dir / "SKILL.md").write_text("# Storyboard Skill\n故事优先。", encoding="utf-8")
            (ref_dir / "workflow.md").write_text("# Workflow\nStage based.", encoding="utf-8")
            runtime_skill, _, _ = _reload_modules()
            runtime_skill.clear_runtime_skill_cache()

            with mock.patch.object(runtime_skill, "_project_root", return_value=Path(tmpdir)):
                skill_text = runtime_skill.get_runtime_skill_text("storyboard")

        self.assertIn("Storyboard Skill", skill_text)
        self.assertIn("[Reference: references/workflow.md]", skill_text)
        self.assertIn("Stage based.", skill_text)

    def test_drama_skill_auto_discovers_project_local_skill_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = Path(tmpdir) / "skills" / ".agents" / "skills" / "drama-creator"
            skill_dir.mkdir(parents=True, exist_ok=True)
            (skill_dir / "SKILL.md").write_text("# Drama Skill\n竖屏短剧创作。", encoding="utf-8")
            runtime_skill, _, _ = _reload_modules()
            runtime_skill.clear_runtime_skill_cache()

            with mock.patch.object(runtime_skill, "_project_root", return_value=Path(tmpdir)):
                skill_text = runtime_skill.get_runtime_skill_text("drama")

        self.assertIn("Drama Skill", skill_text)
        self.assertIn("竖屏短剧创作", skill_text)

    def test_idea_script_client_appends_scope_skill_block(self):
        os.environ["BANANAFLOW_IDEA_SCRIPT_SKILL_TEXT"] = "Focus on Chinese growth hooks and local commerce context."
        runtime_skill, _, idea_client_module = _reload_modules()
        runtime_skill.clear_runtime_skill_cache()

        client = idea_client_module.IdeaScriptGeminiClient()
        prompt = client._with_skill("Return JSON only.")

        self.assertIn("Return JSON only.", prompt)
        self.assertIn("External skill instructions:", prompt)
        self.assertIn("Focus on Chinese growth hooks and local commerce context.", prompt)


if __name__ == "__main__":
    unittest.main()
