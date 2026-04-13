import os
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
PACKAGE_DIR = os.path.join(ROOT_DIR, "bananaflow")
if PACKAGE_DIR not in sys.path:
    sys.path.insert(0, PACKAGE_DIR)


from bananaflow.agent.normalizer import normalize_patch
from bananaflow.core.config import MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO


class NormalizerTests(unittest.TestCase):
    def test_update_node_text2img_gets_default_size_template(self):
        out = normalize_patch(
            {
                "patch": [
                    {
                        "op": "update_node",
                        "id": "proc_1",
                        "data": {
                            "mode": "text2img",
                            "prompt": "A clean product shot",
                        },
                    }
                ],
                "summary": "",
                "thought": "",
            }
        )

        templates = out["patch"][0]["data"]["templates"]
        self.assertEqual(templates["size"], "1024x1024")
        self.assertEqual(templates["aspect_ratio"], "1:1")

    def test_structure_only_strips_canvas_config_fields(self):
        out = normalize_patch(
            {
                "patch": [
                    {
                        "op": "add_node",
                        "node": {
                            "id": "proc_1",
                            "type": "processor",
                            "x": 120,
                            "y": 120,
                            "data": {
                                "mode": "text2img",
                                "prompt": "A clean product shot",
                                "templates": {"size": "1024x1024", "aspect_ratio": "1:1"},
                                "model": MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO,
                            },
                        },
                    }
                ],
                "summary": "",
                "thought": "",
            },
            structure_only=True,
        )

        data = out["patch"][0]["node"]["data"]
        self.assertEqual(data["mode"], "text2img")
        self.assertNotIn("prompt", data)
        self.assertNotIn("templates", data)
        self.assertNotIn("model", data)

    def test_update_node_local_text2img_keeps_prompt_and_model_defaults(self):
        out = normalize_patch(
            {
                "patch": [
                    {
                        "op": "update_node",
                        "id": "proc_2",
                        "data": {
                            "mode": "local_text2img",
                            "prompt": "A clean product shot",
                        },
                    }
                ],
                "summary": "",
                "thought": "",
            }
        )

        data = out["patch"][0]["data"]
        self.assertEqual(data["prompt"], "A clean product shot")
        self.assertEqual(data["templates"]["size"], "1024x1024")
        self.assertEqual(data["templates"]["aspect_ratio"], "1:1")
        self.assertEqual(data["model"], MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO)


if __name__ == "__main__":
    unittest.main()
