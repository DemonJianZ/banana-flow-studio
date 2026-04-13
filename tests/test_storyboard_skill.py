import sys
import types
import unittest
from pathlib import Path
from unittest import mock


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


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


_install_google_stub()

from bananaflow.agent.storyboard_skill import run_storyboard_pipeline  # noqa: E402


class StoryboardSkillTests(unittest.TestCase):
    def test_run_storyboard_pipeline_start_and_continue(self):
        responses = [
            types.SimpleNamespace(
                text="""
                {
                  "stage_id": "script_read",
                  "stage_title": "脚本解读",
                  "summary": "完成脚本解读。",
                  "content": "主角是宿舍学生，痛点是异味残留。",
                  "next_stage_hint": "进入戏剧地图"
                }
                """.strip()
            ),
            types.SimpleNamespace(
                text="""
                {
                  "stage_id": "sequence_map",
                  "stage_title": "戏剧地图",
                  "summary": "完成戏剧地图。",
                  "content": "痛点 -> 转折 -> 高潮 -> CTA",
                  "next_stage_hint": "进入镜头策略"
                }
                """.strip()
            ),
        ]

        with mock.patch("bananaflow.agent.storyboard_skill.get_runtime_skill_text", return_value="skill"), \
             mock.patch("bananaflow.agent.storyboard_skill.OllamaTextClient") as client_cls:
            client = client_cls.return_value
            client.is_available.return_value = True
            client.generate_content.side_effect = responses

            out1 = run_storyboard_pipeline(
                {
                    "product": "洗发水",
                    "script": "标题：宿舍异味\n正文：...",
                    "prompt": "生成分镜",
                },
                action="start",
            )
            out2 = run_storyboard_pipeline(
                {
                    "product": "洗发水",
                    "script": "标题：宿舍异味\n正文：...",
                    "prompt": "继续生成分镜",
                },
                action="continue",
                state=out1["state"],
            )

        self.assertEqual(out1["stage_id"], "script_read")
        self.assertTrue(out1["can_continue"])
        self.assertIn("script_read", out1["completed_stage_ids"])
        self.assertEqual(out2["stage_id"], "sequence_map")
        self.assertIn("sequence_map", out2["completed_stage_ids"])
        self.assertIn("script_read", out2["completed_stage_ids"])

    def test_run_storyboard_pipeline_salvages_truncated_json(self):
        fake_text = """
        {
          "stage_id": "script_read",
          "stage_title": "脚本解读",
          "summary": "完成脚本解读。",
          "content": "主角、欲望、阻力都已锁定。"
        """.strip()

        with mock.patch("bananaflow.agent.storyboard_skill.get_runtime_skill_text", return_value="skill"), \
             mock.patch("bananaflow.agent.storyboard_skill.OllamaTextClient") as client_cls:
            client = client_cls.return_value
            client.is_available.return_value = True
            client.generate_content.return_value = types.SimpleNamespace(text=fake_text)

            out = run_storyboard_pipeline(
                {
                    "product": "眼霜",
                    "script": "标题：眼霜\n正文：[HOOK] ...",
                    "prompt": "生成分镜",
                }
            )

        self.assertEqual(out["stage_id"], "script_read")
        self.assertIn("完成脚本解读", out["raw"].get("summary", ""))

    def test_run_storyboard_pipeline_builds_execution_preparation_after_final_delivery(self):
        state = {
            "project_title": "逛街vlog：一站式街拍OOTD搭配手册",
            "source": {
                "product": "OOTD vlog",
                "source_title": "一站式街拍OOTD搭配手册",
                "selected_angle": "逛街 vlog / OOTD",
                "primary_platform": "抖音",
                "secondary_platform": "小红书",
                "script": "标题：逛街vlog：一站式街拍OOTD搭配手册\n正文：从出门 look 建立到 hero look 收尾。",
            },
            "stages": {
                "final_delivery": {
                    "stage_id": "final_delivery",
                    "stage_title": "最终分镜总稿",
                    "summary": "主分镜已完成。",
                    "content": "Host: Luna\nRole: OOTD vlog 主持人\nLook A：奶油白针织短上衣 + 高腰直筒牛仔裤 + 金属耳圈 + 黑色腋下包\nLook B：灰色西装外套 + 黑色吊带 + 百褶短裙 + 长靴 + 银色项链\nLocation A：街角咖啡店外摆、玻璃橱窗、暖色午后阳光\nLocation B：买手店门口、混凝土墙面、窄巷路牌、城市人流\n【场景一：出门建立】(0-6s)\nShot 1 (WS): Luna 走出公寓楼门口，Look A 全身建立。\nShot 2 (MS): Luna 对镜整理针织上衣下摆。\n【场景二：hero 收尾】(6-12s)\nShot 3 (CU): 回头微笑，hero close-up。锚点：hero look。",
                    "sections": [],
                    "status": "done",
                }
            },
        }

        out = run_storyboard_pipeline(
            {
                "product": "OOTD vlog",
                "script": "标题：逛街vlog：一站式街拍OOTD搭配手册\n正文：从出门 look 建立到 hero look 收尾。",
                "prompt": "继续生成分镜",
                "source_title": "一站式街拍OOTD搭配手册",
                "primary_platform": "抖音",
                "secondary_platform": "小红书",
            },
            action="continue",
            state=state,
        )

        self.assertEqual(out["stage_id"], "execution_preparation")
        self.assertIn("execution_preparation", out["completed_stage_ids"])
        self.assertFalse(out["can_continue"])
        self.assertTrue(out["asset_bible"])
        self.assertTrue(out["shot_spec"])
        self.assertTrue(out["prompt_pack"])
        self.assertEqual(out["state"]["execution_preparation"]["status"], "done")

    def test_rough_thumbnail_stage_retries_when_output_is_only_abstract_explanation(self):
        state = {
            "project_title": "预告片分镜",
            "source": {
                "product": "预告片",
                "script": "标题：预告片\n正文：界限突破与身份揭示。",
            },
            "stages": {
                "script_read": {"stage_id": "script_read", "stage_title": "脚本解读", "summary": "done", "content": "done", "sections": [], "status": "done"},
                "sequence_map": {"stage_id": "sequence_map", "stage_title": "戏剧地图", "summary": "done", "content": "done", "sections": [], "status": "done"},
                "camera_strategy": {"stage_id": "camera_strategy", "stage_title": "镜头语言策略", "summary": "done", "content": "done", "sections": [], "status": "done"},
                "scene_shot_flow": {"stage_id": "scene_shot_flow", "stage_title": "场景戏核与 Shot Flow", "summary": "done", "content": "done", "sections": [], "status": "done"},
            },
        }
        responses = [
            types.SimpleNamespace(
                text="""
                {
                  "stage_id": "rough_thumbnail_sheet",
                  "stage_title": "粗分镜任务单",
                  "summary": "本阶段是为了锁定戏剧冲突。",
                  "content": "本阶段的任务是根据已确定的戏剧序列和镜头语言策略，为关键场景锁定戏剧核心和观众关注点。",
                  "sections": []
                }
                """.strip()
            ),
            types.SimpleNamespace(
                text="""
                {
                  "stage_id": "rough_thumbnail_sheet",
                  "stage_title": "粗分镜任务单",
                  "summary": "共 6 个 rough frame，可直接开画。",
                  "content": "Frame 1：主角站在门口回头。\\nFrame 2：手部推门特写。\\nFrame 3：走廊长镜头建立空间。",
                  "sections": [
                    {
                      "id": "thumbnail_tasks",
                      "title": "Thumbnail Tasks",
                      "content": "Frame 4：身份揭示特写。\\nFrame 5：对视反应镜头。\\nFrame 6：收尾定格。"
                    }
                  ]
                }
                """.strip()
            ),
        ]

        with mock.patch("bananaflow.agent.storyboard_skill.get_runtime_skill_text", return_value="skill"), \
             mock.patch("bananaflow.agent.storyboard_skill.OllamaTextClient") as client_cls:
            client = client_cls.return_value
            client.is_available.return_value = True
            client.generate_content.side_effect = responses

            out = run_storyboard_pipeline(
                {
                    "product": "预告片",
                    "script": "标题：预告片\n正文：界限突破与身份揭示。",
                    "prompt": "继续生成分镜",
                },
                action="continue",
                state=state,
            )

        self.assertEqual(out["stage_id"], "rough_thumbnail_sheet")
        self.assertIn("Frame 1", out["summary"] + "\n" + out["sections"][0]["content"] + "\n" + out["raw"].get("content", ""))
        self.assertEqual(client.generate_content.call_count, 2)

    def test_invalid_stage_returns_blocked_state_instead_of_throwing(self):
        state = {
            "project_title": "预告片分镜",
            "source": {
                "product": "预告片",
                "script": "标题：预告片\n正文：界限突破与身份揭示。",
            },
            "stages": {
                "script_read": {"stage_id": "script_read", "stage_title": "脚本解读", "summary": "done", "content": "done", "sections": [], "status": "done"},
                "sequence_map": {"stage_id": "sequence_map", "stage_title": "戏剧地图", "summary": "done", "content": "done", "sections": [], "status": "done"},
                "camera_strategy": {"stage_id": "camera_strategy", "stage_title": "镜头语言策略", "summary": "done", "content": "done", "sections": [], "status": "done"},
                "scene_shot_flow": {"stage_id": "scene_shot_flow", "stage_title": "场景戏核与 Shot Flow", "summary": "done", "content": "done", "sections": [], "status": "done"},
            },
        }
        invalid_response = types.SimpleNamespace(
            text="""
            {
              "stage_id": "rough_thumbnail_sheet",
              "stage_title": "粗分镜任务单",
              "summary": "本阶段是为了锁定戏剧冲突。",
              "content": "本阶段的任务是根据已确定的戏剧序列和镜头语言策略，为关键场景锁定戏剧核心和观众关注点。",
              "sections": []
            }
            """.strip()
        )

        with mock.patch("bananaflow.agent.storyboard_skill.get_runtime_skill_text", return_value="skill"), \
             mock.patch("bananaflow.agent.storyboard_skill.OllamaTextClient") as client_cls:
            client = client_cls.return_value
            client.is_available.return_value = True
            client.generate_content.side_effect = [invalid_response, invalid_response]

            out = run_storyboard_pipeline(
                {
                    "product": "预告片",
                    "script": "标题：预告片\n正文：界限突破与身份揭示。",
                    "prompt": "继续生成分镜",
                },
                action="continue",
                state=state,
            )

        self.assertEqual(out["stage_id"], "rough_thumbnail_sheet")
        self.assertFalse(out["can_continue"])
        self.assertIn("未通过质量校验", out["summary"])
        self.assertEqual(out["state"]["stages"]["rough_thumbnail_sheet"]["status"], "blocked")
        self.assertTrue(out["raw"].get("blocked_reason"))

    def test_rough_thumbnail_stage_accepts_frames_array_and_normalizes_sections(self):
        state = {
            "project_title": "预告片分镜",
            "source": {
                "product": "预告片",
                "script": "标题：预告片\n正文：界限突破与身份揭示。",
            },
            "stages": {
                "script_read": {"stage_id": "script_read", "stage_title": "脚本解读", "summary": "done", "content": "done", "sections": [], "status": "done"},
                "sequence_map": {"stage_id": "sequence_map", "stage_title": "戏剧地图", "summary": "done", "content": "done", "sections": [], "status": "done"},
                "camera_strategy": {"stage_id": "camera_strategy", "stage_title": "镜头语言策略", "summary": "done", "content": "done", "sections": [], "status": "done"},
                "scene_shot_flow": {"stage_id": "scene_shot_flow", "stage_title": "场景戏核与 Shot Flow", "summary": "done", "content": "done", "sections": [], "status": "done"},
            },
        }
        response = types.SimpleNamespace(
            text="""
            {
              "stage_id": "rough_thumbnail_sheet",
              "stage_title": "粗分镜任务单",
              "summary": "共 3 个 rough frame，可直接开画。",
              "content": "已输出结构化粗分镜任务单。",
              "frames": [
                {
                  "frame_id": "Frame 1",
                  "purpose": "建立人物",
                  "framing": "MS",
                  "action": "主角推门进入镜头。",
                  "anchor": "门口动作",
                  "note": "保持门框构图"
                },
                {
                  "frame_id": "Frame 2",
                  "purpose": "反应特写",
                  "framing": "CU",
                  "action": "主角停顿并看向右侧。",
                  "anchor": "眼神转向",
                  "note": "为下一镜留 eyeline"
                }
              ]
            }
            """.strip()
        )

        with mock.patch("bananaflow.agent.storyboard_skill.get_runtime_skill_text", return_value="skill"), \
             mock.patch("bananaflow.agent.storyboard_skill.OllamaTextClient") as client_cls:
            client = client_cls.return_value
            client.is_available.return_value = True
            client.generate_content.return_value = response

            out = run_storyboard_pipeline(
                {
                    "product": "预告片",
                    "script": "标题：预告片\n正文：界限突破与身份揭示。",
                    "prompt": "继续生成分镜",
                },
                action="continue",
                state=state,
            )

        stage_state = out["state"]["stages"]["rough_thumbnail_sheet"]
        self.assertEqual(stage_state["status"], "done")
        self.assertEqual(len(stage_state["sections"]), 2)
        self.assertEqual(stage_state["sections"][0]["title"], "Frame 1")
        self.assertIn("景别：MS", stage_state["sections"][0]["content"])
        self.assertIn("动作：主角推门进入镜头。", stage_state["sections"][0]["content"])

    def test_final_delivery_auto_appends_local_shot_manifest_when_missing(self):
        state = {
            "project_title": "预告片分镜",
            "source": {
                "product": "预告片",
                "script": "标题：预告片\n正文：界限突破与身份揭示。",
            },
            "stages": {
                "script_read": {"stage_id": "script_read", "stage_title": "脚本解读", "summary": "done", "content": "done", "sections": [], "status": "done"},
                "sequence_map": {"stage_id": "sequence_map", "stage_title": "戏剧地图", "summary": "done", "content": "1. 开场：建立人物。", "sections": [], "status": "done"},
                "camera_strategy": {"stage_id": "camera_strategy", "stage_title": "镜头语言策略", "summary": "done", "content": "中近景为主。", "sections": [], "status": "done"},
                "scene_shot_flow": {
                    "stage_id": "scene_shot_flow",
                    "stage_title": "场景戏核与 Shot Flow",
                    "summary": "done",
                    "content": "【场景一：建立】(0-4s)\nShot 1 (MS): 主角推门进入镜头。\nShot 2 (CU): 主角停顿并看向右侧。",
                    "sections": [],
                    "status": "done",
                },
            },
        }
        response = types.SimpleNamespace(
            text="""
            {
              "stage_id": "final_delivery",
              "stage_title": "最终分镜总稿",
              "summary": "完成最终总稿。",
              "content": "按开场建立与人物揭示推进，保留人脸与动作方向连续性。",
              "sections": []
            }
            """.strip()
        )

        with mock.patch("bananaflow.agent.storyboard_skill.get_runtime_skill_text", return_value="skill"), \
             mock.patch("bananaflow.agent.storyboard_skill.OllamaTextClient") as client_cls:
            client = client_cls.return_value
            client.is_available.return_value = True
            client.generate_content.return_value = response

            out = run_storyboard_pipeline(
                {
                    "product": "预告片",
                    "script": "标题：预告片\n正文：界限突破与身份揭示。",
                    "prompt": "继续生成分镜",
                },
                action="rerun_stage",
                state=state,
                target_stage="final_delivery",
            )

        final_state = out["state"]["stages"]["final_delivery"]
        manifest = next((item for item in final_state["sections"] if item.get("id") == "shot_manifest"), None)
        self.assertEqual(final_state["status"], "done")
        self.assertIsNotNone(manifest)
        self.assertEqual(out["raw"].get("shot_manifest_source"), "local_compiler")

    def test_final_delivery_falls_back_to_rough_thumbnail_sections_for_manifest(self):
        state = {
            "project_title": "预告片分镜",
            "source": {
                "product": "预告片",
                "script": "标题：预告片\n正文：界限突破与身份揭示。",
            },
            "stages": {
                "rough_thumbnail_sheet": {
                    "stage_id": "rough_thumbnail_sheet",
                    "stage_title": "粗分镜任务单",
                    "summary": "共 2 个 rough frame，可直接开画。",
                    "content": "已输出结构化粗分镜任务单。",
                    "sections": [
                        {"id": "frame_01", "title": "Frame 1", "content": "景别：MS\n动作：主角推门进入镜头。\n锚点：门口动作\n备注：保持门框构图"},
                        {"id": "frame_02", "title": "Frame 2", "content": "景别：CU\n动作：主角停顿并看向右侧。\n锚点：眼神转向\n备注：为下一镜留 eyeline"},
                    ],
                    "status": "done",
                }
            },
        }
        response = types.SimpleNamespace(
            text="""
            {
              "stage_id": "final_delivery",
              "stage_title": "最终分镜总稿",
              "summary": "完成最终总稿。",
              "content": "按人物进入与停顿反应推进。",
              "sections": []
            }
            """.strip()
        )

        with mock.patch("bananaflow.agent.storyboard_skill.get_runtime_skill_text", return_value="skill"), \
             mock.patch("bananaflow.agent.storyboard_skill.OllamaTextClient") as client_cls:
            client = client_cls.return_value
            client.is_available.return_value = True
            client.generate_content.return_value = response

            out = run_storyboard_pipeline(
                {
                    "product": "预告片",
                    "script": "标题：预告片\n正文：界限突破与身份揭示。",
                    "prompt": "继续生成分镜",
                },
                action="rerun_stage",
                state=state,
                target_stage="final_delivery",
            )

        final_state = out["state"]["stages"]["final_delivery"]
        manifest = next((item for item in final_state["sections"] if item.get("id") == "shot_manifest"), None)
        self.assertEqual(final_state["status"], "done")
        self.assertIsNotNone(manifest)
        self.assertEqual(out["raw"].get("shot_manifest_source"), "rough_thumbnail_fallback")

    def test_final_delivery_falls_back_to_scene_shot_flow_when_no_rough_sections(self):
        state = {
            "project_title": "预告片分镜",
            "source": {
                "product": "预告片",
                "script": "标题：预告片\n正文：界限突破与身份揭示。",
            },
            "stages": {
                "scene_shot_flow": {
                    "stage_id": "scene_shot_flow",
                    "stage_title": "场景戏核与 Shot Flow",
                    "summary": "完成逐镜头 shot flow。",
                    "content": "Shot 1 (MS): 主角推门进入镜头。\nShot 2 (CU): 主角停顿并看向右侧。",
                    "sections": [],
                    "status": "done",
                }
            },
        }
        response = types.SimpleNamespace(
            text="""
            {
              "stage_id": "final_delivery",
              "stage_title": "最终分镜总稿",
              "summary": "完成最终总稿。",
              "content": "按人物进入与停顿反应推进。",
              "sections": []
            }
            """.strip()
        )

        with mock.patch("bananaflow.agent.storyboard_skill.get_runtime_skill_text", return_value="skill"), \
             mock.patch("bananaflow.agent.storyboard_skill.OllamaTextClient") as client_cls:
            client = client_cls.return_value
            client.is_available.return_value = True
            client.generate_content.return_value = response

            out = run_storyboard_pipeline(
                {
                    "product": "预告片",
                    "script": "标题：预告片\n正文：界限突破与身份揭示。",
                    "prompt": "继续生成分镜",
                },
                action="rerun_stage",
                state=state,
                target_stage="final_delivery",
            )

        final_state = out["state"]["stages"]["final_delivery"]
        manifest = next((item for item in final_state["sections"] if item.get("id") == "shot_manifest"), None)
        self.assertEqual(final_state["status"], "done")
        self.assertIsNotNone(manifest)
        self.assertEqual(out["raw"].get("shot_manifest_source"), "local_compiler")

    def test_final_delivery_falls_back_to_f_style_rough_thumbnail_blocks_for_manifest(self):
        state = {
            "project_title": "护肤科普分镜",
            "source": {
                "product": "洗面奶",
                "script": "标题：洗面奶科普\n正文：困境-顿悟-实践。",
            },
            "stages": {
                "scene_shot_flow": {
                    "stage_id": "scene_shot_flow",
                    "stage_title": "场景戏核与 Shot Flow",
                    "summary": "完成场景分镜结构。",
                    "content": (
                        "【开场】质疑切入：揭示“盲买”的痛点 (0-3s)\n"
                        "目标：迅速抓住观众注意力，制造误区焦虑。\n"
                        "戏核：洗面奶的误区（只关注清洁力）。\n"
                        "连续性锚点：博主的眼神和手势（指向成分表）。\n"
                        "【冲突升级】科普演示：从“泡泡”到“屏障”的知识转折 (3-25s)\n"
                        "目标：将抽象知识转化为保护膜视觉体验。\n"
                        "戏核：优秀的洗面奶 = 温和清洁 + 屏障修复。\n"
                        "连续性锚点：从过度清洁的刺激到保护膜形成的视觉对比。\n"
                        "【解决方案】日常实践：场景化使用与坚持（25-45s）\n"
                        "目标：把知识点拉回生活场景，建立早晚使用代入感。\n"
                        "戏核：护肤品是融入日常作息的习惯。\n"
                        "连续性锚点：从早晨净化到夜晚修复的流程切换。\n"
                        "【总结/CTA】升华与行动号召 (45-60s)\n"
                        "目标：总结观点并引导下一步行动。\n"
                        "戏核：看成分表比看广告更有用。\n"
                        "连续性锚点：从产品使用到知识理念的价值升华。"
                    ),
                    "sections": [],
                    "status": "done",
                },
                "rough_thumbnail_sheet": {
                    "stage_id": "rough_thumbnail_sheet",
                    "stage_title": "粗分镜任务单",
                    "summary": "第一轮可执行粗分镜任务单。",
                    "content": (
                        "F1_1\n"
                        "景别：特写（CU）/快速切换\n"
                        "动作：博主A表情夸张，手拿一瓶洗面奶，指着成分表，眼神犀利。\n"
                        "锚点：博主A的表情和成分表。\n"
                        "备注：节奏极快，开场必须有冲击力。\n"
                        "F1_2\n"
                        "景别：中景（MS）/博主A与产品并置\n"
                        "动作：博主A做出“不”的手势，指向产品包装上的“清洁力强”字样，然后摇头。\n"
                        "锚点：博主A的否定手势。\n"
                        "备注：强调问题不在于产品，而在于关注点太窄。\n"
                        "F2_1\n"
                        "景别：特写（CU）/皮肤特写（CG）\n"
                        "动作：模拟皮肤屏障受损的视觉图。\n"
                        "锚点：受损的皮肤区域。\n"
                        "备注：视觉化比口播更震撼。\n"
                        "F3_1\n"
                        "景别：中景（MS）/博主A，背景干净、明亮\n"
                        "动作：博主A语气转变，表情变得自信和专业。手势指向一个虚拟的科学公式图表。\n"
                        "锚点：博主A的眼神和图表。\n"
                        "备注：这是情绪的转折点，营造顿悟感。"
                    ),
                    "sections": [],
                    "status": "done",
                }
            },
        }
        response = types.SimpleNamespace(
            text="""
            {
              "stage_id": "final_delivery",
              "stage_title": "最终分镜总稿",
              "summary": "完成最终总稿。",
              "content": "按护肤困境与科学解决方案推进。",
              "sections": []
            }
            """.strip()
        )

        with mock.patch("bananaflow.agent.storyboard_skill.get_runtime_skill_text", return_value="skill"), \
             mock.patch("bananaflow.agent.storyboard_skill.OllamaTextClient") as client_cls:
            client = client_cls.return_value
            client.is_available.return_value = True
            client.generate_content.return_value = response

            out = run_storyboard_pipeline(
                {
                    "product": "洗面奶",
                    "script": "标题：洗面奶科普\n正文：困境-顿悟-实践。",
                    "prompt": "继续生成分镜",
                },
                action="rerun_stage",
                state=state,
                target_stage="final_delivery",
            )

        final_state = out["state"]["stages"]["final_delivery"]
        manifest = next((item for item in final_state["sections"] if item.get("id") == "shot_manifest"), None)
        self.assertEqual(final_state["status"], "done")
        self.assertIsNotNone(manifest)
        self.assertEqual(out["raw"].get("shot_manifest_source"), "rough_thumbnail_fallback")
        manifest_rows = __import__("json").loads(manifest["content"])
        self.assertEqual(manifest_rows[0]["scene_title"], "开场")
        self.assertEqual(manifest_rows[0]["purpose"], "迅速抓住观众注意力，制造误区焦虑。")
        self.assertEqual(manifest_rows[0]["subject"], "博主质疑成分表")
        self.assertEqual(manifest_rows[0]["camera_movement"], "rapid_cut")
        self.assertGreaterEqual(manifest_rows[3]["climax_weight"], 0.78)

    def test_execution_preparation_reports_blocked_when_no_shots_can_be_parsed(self):
        state = {
            "project_title": "抽象广告分镜",
            "source": {
                "product": "香氛",
                "script": "标题：抽象广告\n正文：抽象氛围推进。",
            },
            "stages": {
                "final_delivery": {
                    "stage_id": "final_delivery",
                    "stage_title": "最终分镜总稿",
                    "summary": "完成最终总稿。",
                    "content": "本片以氛围和节奏推进，不再逐镜头展开。",
                    "sections": [],
                    "status": "done",
                }
            },
        }

        out = run_storyboard_pipeline(
            {
                "product": "香氛",
                "script": "标题：抽象广告\n正文：抽象氛围推进。",
                "prompt": "继续生成分镜",
            },
            action="continue",
            state=state,
        )

        self.assertEqual(out["stage_id"], "execution_preparation")
        self.assertIn("解析出可执行 shot", out["summary"])
        self.assertEqual(out["raw"].get("blocked_reason"), "no_parsed_shots")
        self.assertEqual(out["shot_spec"].get("shots", []), [])


if __name__ == "__main__":
    unittest.main()
