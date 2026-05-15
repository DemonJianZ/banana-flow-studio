import json
import os
import sys
import unittest
from unittest import mock

from starlette.requests import Request


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


from bananaflow.agent.tools import AgentToolContext, build_builtin_executor, build_builtin_registry  # noqa: E402
from bananaflow.agent.tools.errors import AgentToolExecutionError  # noqa: E402
from bananaflow.agent_v2.gateway.dispatcher import dispatch_agent_message  # noqa: E402
from bananaflow.agent_v2.gateway.schemas import AgentMessageRequest, CoordinatorDecision  # noqa: E402
from bananaflow.agent_v2.storyboard import StoryboardPlan, design_storyboard  # noqa: E402
from bananaflow.agent_v2.storyboard.script_table import parse_storyboard_script_table  # noqa: E402
from bananaflow.agent_v2.storyboard.designer import default_storyboard_llm_generate, parse_llm_json  # noqa: E402
from bananaflow.agent_v2.storyboard.validator import coerce_storyboard_plan_payload, validate_storyboard_payload  # noqa: E402


def _sample_plan():
    return {
        "title": "夏日饮品广告分镜",
        "aspect_ratio": "16:9",
        "style": "明亮电商广告",
        "target_duration_sec": 20,
        "estimated_duration_sec": 20,
        "shot_default_duration_sec": 4,
        "entities": {
            "characters": [{"entity_id": "char_1", "name": "年轻女性", "kind": "character", "description": "主角", "visual_traits": ["短发"]}],
            "subjects": [{"entity_id": "subj_1", "name": "饮品瓶", "kind": "subject", "description": "产品瓶身", "visual_traits": ["透明冰感"]}],
            "locations": [
                {"entity_id": "loc_1", "name": "海边露台", "kind": "location", "description": "午后阳光", "visual_traits": ["蓝天"]},
                {"entity_id": "loc_2", "name": "海边产品展台", "kind": "location", "description": "产品定格展示区", "visual_traits": ["高亮背板"]},
            ],
        },
        "scenes": [
            {
                "scene_id": "scene_1",
                "scene_no": 1,
                "title": "海边露台开场区",
                "summary": "产品和人物登场",
                "location": "海边露台",
                "objective": "建立氛围",
                "scene_notes": "",
                "shots": [
                    {
                        "shot_id": "scene_1_shot_1",
                        "shot_no": 1,
                        "duration_sec": 4,
                        "camera": "wide",
                        "visual_description": "阳光下的露台，主角拿起饮品瓶看向镜头。",
                        "sound_description": "海风与轻快音乐",
                        "dialogues": [{"speaker": "年轻女性", "text": "这个夏天就要这一口。"}],
                        "voiceover": "冰爽感一秒到位。",
                        "referenced_entities": ["年轻女性", "饮品瓶", "海边露台"],
                        "generation_notes": "主打高光与冰雾细节",
                    },
                    {
                        "shot_id": "scene_1_shot_2",
                        "shot_no": 2,
                        "duration_sec": 4,
                        "camera": "close-up",
                        "visual_description": "镜头推近瓶身冷凝水珠和标签。",
                        "sound_description": "瓶盖开启声",
                        "dialogues": [],
                        "voiceover": "",
                        "referenced_entities": ["饮品瓶"],
                        "generation_notes": "突出品牌标识",
                    },
                ],
            },
            {
                "scene_id": "scene_2",
                "scene_no": 2,
                "title": "海边产品展台",
                "summary": "强调口感",
                "location": "海边产品展台",
                "objective": "刺激转化",
                "scene_notes": "",
                "shots": [
                    {
                        "shot_id": "scene_2_shot_1",
                        "shot_no": 1,
                        "duration_sec": 6,
                        "camera": "medium",
                        "visual_description": "主角喝下一口后露出满足神情。",
                        "sound_description": "环境音乐继续推进",
                        "dialogues": [],
                        "voiceover": "清爽、轻盈、立刻提神。",
                        "referenced_entities": ["年轻女性", "饮品瓶", "海边产品展台"],
                        "generation_notes": "表情自然",
                    },
                    {
                        "shot_id": "scene_2_shot_2",
                        "shot_no": 2,
                        "duration_sec": 6,
                        "camera": "packshot",
                        "visual_description": "产品瓶身与购买口号定格在画面中心。",
                        "sound_description": "音乐收束",
                        "dialogues": [],
                        "voiceover": "现在就把夏天带回家。",
                        "referenced_entities": ["饮品瓶", "海边产品展台"],
                        "generation_notes": "保留 CTA 区域",
                    },
                ],
            },
        ],
        "global_notes": ["保持明亮清爽色调"],
        "design_rationale": "以产品冰爽感和人物体验构建转化型商业分镜。",
        "warnings": [],
    }


class StoryboardDesignAgentTests(unittest.TestCase):
    def _make_request(self) -> Request:
        request = Request({"type": "http", "method": "POST", "path": "/api/agent/message", "headers": []})
        request.state.req_id = "req-storyboard"
        return request

    def test_storyboard_plan_schema_should_validate_sample(self):
        plan = StoryboardPlan.model_validate(_sample_plan())
        self.assertEqual(plan.aspect_ratio, "16:9")
        self.assertEqual(len(plan.scenes), 2)

    def test_coerce_storyboard_payload_should_strip_entity_mentions_from_location_and_recompute_duration(self):
        payload = _sample_plan()
        payload["entities"]["characters"][0]["name"] = "阿巳"
        payload["entities"]["characters"].append(
            {"entity_id": "char_2", "name": "一禅", "kind": "character", "description": "配角", "visual_traits": []}
        )
        payload["entities"]["subjects"].append(
            {"entity_id": "subj_2", "name": "空酒坛", "kind": "subject", "description": "散落在地上的酒坛", "visual_traits": []}
        )
        payload["entities"]["locations"][0]["core_description"] = "阿巳和一禅所在的海边露台，旁边还有空酒坛。"
        payload["estimated_duration_sec"] = 999
        coerced = coerce_storyboard_plan_payload(
            payload,
            style="明亮电商广告",
            aspect_ratio="16:9",
            target_duration_sec=20,
            shot_duration_sec=4,
        )
        self.assertNotIn("阿巳", coerced["entities"]["locations"][0]["core_description"])
        self.assertNotIn("一禅", coerced["entities"]["locations"][0]["core_description"])
        self.assertNotIn("空酒坛", coerced["entities"]["locations"][0]["core_description"])
        self.assertEqual(coerced["estimated_duration_sec"], 20.0)

    def test_parse_storyboard_script_table_should_extract_rows(self):
        rows = parse_storyboard_script_table(
            "镜号\t固定/运动\t景别\t画面内容\t台词\t音效/BGM\t时长\t参考\n"
            "1\t固定\t特写\t白天庭院里辰辰抬手\t辰辰：秋水，节奏跟上。\t鸟鸣、风声\t5s\t\n"
            "2\t固定\t中景\t秋水被法力控制，表情僵硬\t\t\t4s\t[图片]\n"
        )
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["shot_no"], "1")
        self.assertEqual(rows[0]["dialogue"], "辰辰：秋水，节奏跟上。")
        self.assertEqual(rows[1]["reference"], "[图片]")

    def test_parse_storyboard_script_table_should_support_english_headers(self):
        rows = parse_storyboard_script_table(
            "shot_no,camera_motion,shot_size,visual_content,dialogue,sound,duration,reference\n"
            "1,fixed,close-up,Chencheng raises a hand,Chencheng: keep up,birds,5s,\n"
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["shot_no"], "1")
        self.assertEqual(rows[0]["visual_content"], "Chencheng raises a hand")

    def test_parse_llm_json_should_tolerate_trailing_commas(self):
        payload = parse_llm_json(
            """
            {
              "title": "测试分镜",
              "style": "黑色电影",
              "scenes": [],
            }
            """
        )
        self.assertEqual(payload["title"], "测试分镜")

    def test_parse_llm_json_should_tolerate_pythonish_single_quotes(self):
        payload = parse_llm_json("{'title': '测试分镜', 'style': '黑色电影', 'scenes': []}")
        self.assertEqual(payload["style"], "黑色电影")

    def test_parse_llm_json_should_tolerate_mismatched_closing_brackets(self):
        payload = parse_llm_json(
            """
            {
              "title": "测试分镜",
              "style": "黑色电影",
              "entities": {
                "characters": [
                  {"entity_id": "c1", "name": "橘猫老大", "kind": "character"}
                }]
              },
              "scenes": []
            }
            """
        )
        self.assertEqual(payload["title"], "测试分镜")

    def test_default_storyboard_llm_generate_should_retry_with_json_repair_when_auth_response_is_malformed(self):
        responses = iter(
            [
                type("Resp", (), {"text": "{'title' '坏掉的json'}"})(),
                type("Resp", (), {"text": '{"title":"修复后","scenes":[]}'} )(),
            ]
        )

        def _fake_call(**kwargs):
            return next(responses)

        with mock.patch("bananaflow.agent_v2.storyboard.designer._load_ai_chat_text_client", return_value=_fake_call):
            payload = default_storyboard_llm_generate(
                "scene_outline",
                "prompt",
                req_id="req-repair-json",
                authorization="token-abc",
            )
        self.assertEqual(payload["title"], "修复后")

    def test_storyboard_plan_schema_should_accept_richer_entity_and_location_design(self):
        payload = _sample_plan()
        payload["entities"]["characters"][0].update(
            {
                "role": "leader",
                "core_description": "一只强壮的成年橘猫，带有黑帮老大的气场。",
                "appearance": {
                    "species": "cat",
                    "fur_color": "orange",
                    "build": "strong",
                    "outfit": ["黑色外套"],
                    "accessories": ["粗大的金属项链"],
                    "expression": ["冷酷", "凶狠"],
                },
                "style_notes": ["黑色电影", "高对比光影"],
                "story_function": "核心角色",
            }
        )
        payload["entities"]["locations"][0].update(
            {
                "core_description": "气氛肃杀，暴雨如注。",
                "visual_design": {
                    "lighting": ["冷蓝月光", "远处红色霓虹"],
                    "mood": ["肃杀", "紧张"],
                    "contrast": "冷暖强对比",
                    "surface": ["湿地面", "积水反光"],
                },
            }
        )
        plan = StoryboardPlan.model_validate(payload)
        self.assertEqual(plan.entities.characters[0].role, "leader")
        self.assertEqual(plan.entities.characters[0].appearance.species, "cat")
        self.assertEqual(plan.entities.locations[0].visual_design.contrast, "冷暖强对比")

    def test_storyboard_design_tool_should_be_registered(self):
        registry = build_builtin_registry()
        self.assertTrue(registry.has("storyboard.design"))
        self.assertTrue(registry.has("agent_storyboard_design"))

    def test_storyboard_design_should_return_json_serializable_plan_using_mocked_llm(self):
        executor = build_builtin_executor()
        sequence = {
            "intake": {
                "title": "夏日饮品广告分镜",
                "style": "明亮电商广告",
                "aspect_ratio": "16:9",
                "target_duration_sec": 20,
                "shot_default_duration_sec": 4,
                "language": "zh-CN",
                "constraints": ["无血腥"],
                "creative_goal": "生成可执行分镜",
            },
            "entity_design": _sample_plan()["entities"],
            "scene_outline": {
                "title": _sample_plan()["title"],
                "global_notes": _sample_plan()["global_notes"],
                "design_rationale": _sample_plan()["design_rationale"],
                "scenes": [{k: v for k, v in scene.items() if k != "shots"} for scene in _sample_plan()["scenes"]],
            },
            "shot_design": {
                "estimated_duration_sec": 20,
                "scenes": _sample_plan()["scenes"],
            },
        }

        with mock.patch("bananaflow.agent_v2.storyboard.designer.default_storyboard_llm_generate", side_effect=lambda stage, prompt, req_id="storyboard", authorization="": sequence[stage]):
            result = executor.execute(
                "storyboard.design",
                {"brief": "做一个夏日饮品广告分镜", "style": "明亮电商广告"},
                context=AgentToolContext(req_id="req-tool", extra={"run_id": "run-storyboard"}),
            )

        encoded = json.dumps(result, ensure_ascii=False)
        self.assertIn("夏日饮品广告分镜", encoded)
        self.assertEqual(result["style"], "明亮电商广告")
        self.assertEqual(result["script_source"], "brief")
        self.assertEqual(result["script_row_count"], 0)

    def test_storyboard_design_falls_back_to_brief_when_script_table_not_parsed(self):
        """T1.1: empty script_rows logs warning and falls back to brief-only (no longer raises)."""
        executor = build_builtin_executor()
        import logging
        with self.assertLogs("bananaflow.agent.tools.builtin", level="WARNING") as log_ctx:
            # Will call the real LLM; only verify it does NOT raise and warning is logged.
            try:
                executor.execute(
                    "storyboard.design",
                    {
                        "brief": "请整理成故事板",
                        "script_table": "totally unrelated plain text",
                        "script_table_name": "storyboard_shots.csv",
                        "script_rows": [],
                    },
                    context=AgentToolContext(req_id="req-tool"),
                )
            except AgentToolExecutionError as exc:
                # Only allowed error is brief-empty (not parse-failure)
                self.assertNotIn("storyboard_script_table_parse_failed", str(exc))
        self.assertTrue(
            any("storyboard_script_table_parse_failed" in m for m in log_ctx.output),
            "Expected warning log for parse failure",
        )

    def test_invalid_brief_should_return_controlled_error(self):
        executor = build_builtin_executor()
        result = executor.safe_execute("storyboard.design", {"brief": "   "}, context=AgentToolContext(req_id="req-empty"))
        self.assertFalse(result.ok)
        self.assertIn("storyboard_brief_required", result.error)

    def test_validator_should_catch_missing_visual_description(self):
        broken = _sample_plan()
        broken["scenes"][0]["shots"][0]["visual_description"] = ""
        _, errors = validate_storyboard_payload(broken, style="明亮电商广告", aspect_ratio="16:9", target_duration_sec=20, shot_duration_sec=4)
        self.assertTrue(any("visual_description_required" in item for item in errors))

    def test_validator_should_normalize_malformed_entity_payloads_from_llm(self):
        broken = _sample_plan()
        broken["entities"]["characters"][0]["visual_traits"] = [
            {
                "role": "主要角色",
                "core_description": "一只强壮的成年橘猫，带有黑帮老大的气场。",
                "appearance": {
                    "species": "cat",
                    "fur_color": "orange",
                    "outfit": ["黑色外套"],
                    "accessories": ["粗大的金属项链"],
                    "expression": ["冷酷", "凶狠"],
                },
                "style_notes": ["黑色电影"],
            }
        ]
        plan, errors = validate_storyboard_payload(
            broken,
            style="明亮电商广告",
            aspect_ratio="16:9",
            target_duration_sec=20,
            shot_duration_sec=4,
        )
        self.assertEqual(errors, [])
        self.assertEqual(plan.entities.characters[0].role, "主要角色")
        self.assertEqual(plan.entities.characters[0].appearance.species, "cat")
        self.assertIn("黑色外套", plan.entities.characters[0].visual_traits)

    def test_validator_should_normalize_null_shot_fields_without_triggering_schema_failure(self):
        broken = _sample_plan()
        for scene in broken["scenes"]:
            for shot in scene["shots"]:
                shot["voiceover"] = None
                shot["dialogues"] = None
                shot["referenced_entities"] = None
        plan, errors = validate_storyboard_payload(
            broken,
            style="明亮电商广告",
            aspect_ratio="16:9",
            target_duration_sec=20,
            shot_duration_sec=4,
        )
        self.assertEqual(errors, [])
        self.assertEqual(plan.scenes[0].shots[0].voiceover, "")
        self.assertEqual(plan.scenes[0].shots[0].dialogues, [])
        self.assertEqual(plan.scenes[0].shots[0].referenced_entities, [])

    def test_validator_should_normalize_string_visual_design_fields_into_lists(self):
        broken = _sample_plan()
        broken["entities"]["characters"][0]["appearance"] = {
            "details": "在雨夜的阴影中，橘色毛发带着湿漉漉的油光。"
        }
        broken["entities"]["characters"][0]["visual_design"] = {
            "lighting": "初期：侧逆光，勾勒轮廓；后期：金色强背光。",
            "mood": "从压抑、肃杀到狂热、失控。",
            "surface": "湿滑的石板路，反射出霓虹和金光。",
            "focus": "从环境的广角压抑过渡到面部特写。",
            "camera_bias": "低角度拍摄，增强压迫感。",
            "palette": "深蓝、墨黑、湿灰、金黄、翠绿。",
        }
        plan, errors = validate_storyboard_payload(
            broken,
            style="明亮电商广告",
            aspect_ratio="16:9",
            target_duration_sec=20,
            shot_duration_sec=4,
        )
        self.assertEqual(errors, [])
        self.assertEqual(plan.entities.characters[0].appearance.details, ["在雨夜的阴影中，橘色毛发带着湿漉漉的油光。"])
        self.assertTrue(plan.entities.characters[0].visual_design.lighting)
        self.assertTrue(plan.entities.characters[0].visual_design.palette)

    def test_validator_should_enrich_entity_core_description_from_appearance_fields(self):
        broken = _sample_plan()
        broken["entities"]["characters"][0] = {
            "entity_id": "char_1",
            "name": "年轻女性 (The Orange Boss)",
            "kind": "character",
            "role": "黑帮老大",
            "core_description": "",
            "appearance": {
                "species": "橘猫",
                "build": "强壮的成年",
                "outfit": ["身穿黑色外套"],
                "accessories": ["脖子上戴着粗大的金属项链"],
                "expression": ["眼神冷酷凶狠"],
            },
            "story_function": "主要角色",
        }
        broken["entities"]["subjects"][0] = {
            "entity_id": "subj_1",
            "name": "饮品瓶 (The Mysterious Box)",
            "kind": "subject",
            "core_description": "",
            "appearance": {
                "material": "黑色金属",
                "details": ["带有复杂的密码锁", "银色防撞包边"],
            },
            "story_function": "关键物件",
        }
        plan, errors = validate_storyboard_payload(
            broken,
            style="明亮电商广告",
            aspect_ratio="16:9",
            target_duration_sec=20,
            shot_duration_sec=4,
        )
        self.assertEqual(errors, [])
        self.assertEqual(plan.entities.characters[0].name, "年轻女性")
        self.assertIn("黑色外套", plan.entities.characters[0].core_description)
        self.assertIn("金属项链", plan.entities.characters[0].core_description)
        self.assertIn("黑色金属质感", plan.entities.subjects[0].core_description)
        self.assertIn("复杂的密码锁", plan.entities.subjects[0].core_description)

    def test_validator_should_enrich_location_core_description_from_visual_design_fields(self):
        broken = _sample_plan()
        broken["entities"]["locations"][0] = {
            "entity_id": "loc_1",
            "name": "海边露台 (Rain Alley)",
            "kind": "location",
            "core_description": "",
            "visual_design": {
                "lighting": ["冷蓝色月光", "远处红色霓虹"],
                "mood": ["肃杀", "压抑"],
                "surface": ["湿滑地面", "积水反光", "潮湿砖墙"],
                "focus": ["巷口积水", "角色站位区域"],
                "palette": ["冷蓝", "暗红", "湿灰"],
                "contrast": "强烈冷暖对比",
            },
        }
        plan, errors = validate_storyboard_payload(
            broken,
            style="明亮电商广告",
            aspect_ratio="16:9",
            target_duration_sec=20,
            shot_duration_sec=4,
        )
        self.assertEqual(errors, [])
        self.assertEqual(plan.entities.locations[0].name, "海边露台")
        self.assertIn("冷蓝色月光", plan.entities.locations[0].core_description)
        self.assertIn("积水反光", plan.entities.locations[0].core_description)
        self.assertIn("强烈冷暖对比", plan.entities.locations[0].core_description)

    def test_validator_should_normalize_scene_location_to_canonical_location_name(self):
        broken = _sample_plan()
        broken["scenes"][0]["location"] = "海边露台 (Rain Alley)"
        broken["scenes"][1]["location"] = "loc_2"
        plan, errors = validate_storyboard_payload(
            broken,
            style="明亮电商广告",
            aspect_ratio="16:9",
            target_duration_sec=20,
            shot_duration_sec=4,
        )
        self.assertEqual(errors, [])
        self.assertEqual(plan.scenes[0].location, "海边露台")
        self.assertEqual(plan.scenes[1].location, "海边产品展台")

    def test_validator_should_normalize_action_like_scene_title_back_to_location(self):
        broken = _sample_plan()
        broken["scenes"][0]["title"] = "海边露台的秘密接头"
        plan, errors = validate_storyboard_payload(
            broken,
            style="明亮电商广告",
            aspect_ratio="16:9",
            target_duration_sec=20,
            shot_duration_sec=4,
        )
        self.assertEqual(plan.scenes[0].title, "海边露台")
        self.assertEqual(errors, [])

    def test_validator_should_normalize_dict_and_alias_referenced_entities(self):
        broken = _sample_plan()
        broken["entities"]["characters"][0]["name"] = "年轻女性（辰辰）"
        broken["entities"]["subjects"][0]["name"] = "饮品瓶/云影镜"
        broken["scenes"][0]["shots"][0]["referenced_entities"] = [
            {"entity_id": "char_1", "name": "年轻女性"},
            {"entity_id": "subj_1", "name": "云影镜"},
            "饮品瓶",
        ]
        plan, errors = validate_storyboard_payload(
            broken,
            style="明亮电商广告",
            aspect_ratio="16:9",
            target_duration_sec=20,
            shot_duration_sec=4,
        )
        self.assertEqual(errors, [])
        self.assertEqual(plan.entities.characters[0].name, "年轻女性")
        self.assertEqual(plan.scenes[0].shots[0].referenced_entities, ["年轻女性", "饮品瓶/云影镜", "饮品瓶/云影镜"])

    def test_validator_should_reject_duplicate_scene_descriptions(self):
        broken = _sample_plan()
        broken["scenes"][0]["summary"] = "同一段场景描述"
        broken["scenes"][0]["scene_notes"] = "冷蓝灯光打在潮湿地面上。"
        broken["scenes"][1]["summary"] = "同一段场景描述"
        broken["scenes"][1]["scene_notes"] = "冷蓝灯光打在潮湿地面上。"
        _, errors = validate_storyboard_payload(
            broken,
            style="明亮电商广告",
            aspect_ratio="16:9",
            target_duration_sec=20,
            shot_duration_sec=4,
        )
        self.assertIn("scene_2:duplicate_scene_description:scene_1", errors)

    def test_validator_should_reject_duplicate_scene_location(self):
        broken = _sample_plan()
        broken["entities"]["locations"].append(
            {"entity_id": "loc_2", "name": "手提箱内部", "kind": "location", "description": "金色背光", "visual_traits": ["黑暗环境"]}
        )
        broken["scenes"][0]["location"] = "海边露台"
        broken["scenes"][1]["location"] = "海边露台"
        broken["scenes"][1]["title"] = "海边露台展示区"
        _, errors = validate_storyboard_payload(
            broken,
            style="明亮电商广告",
            aspect_ratio="16:9",
            target_duration_sec=20,
            shot_duration_sec=4,
        )
        self.assertIn("scene_2:duplicate_scene_location:海边露台:scene_1", errors)

    def test_validator_should_strip_location_description_with_character_reference(self):
        broken = _sample_plan()
        broken["entities"]["locations"][0]["core_description"] = "海边露台上，年轻女性站在饮品瓶旁边看向镜头。"
        _, errors = validate_storyboard_payload(
            broken,
            style="明亮电商广告",
            aspect_ratio="16:9",
            target_duration_sec=20,
            shot_duration_sec=4,
        )
        self.assertNotIn("loc_1:location_description_should_not_reference_entity:年轻女性", errors)

    def test_repair_path_should_run_once_when_validation_fails(self):
        invalid_plan = _sample_plan()
        invalid_plan["scenes"][0]["shots"][0]["visual_description"] = ""
        calls = []

        def fake_llm(stage, prompt, req_id="storyboard"):
            calls.append(stage)
            if stage == "intake":
                return {
                    "title": "夏日饮品广告分镜",
                    "style": "明亮电商广告",
                    "aspect_ratio": "16:9",
                    "target_duration_sec": 20,
                    "shot_default_duration_sec": 4,
                    "language": "zh-CN",
                    "constraints": [],
                    "creative_goal": "生成可执行分镜",
                }
            if stage == "entity_design":
                return _sample_plan()["entities"]
            if stage == "scene_outline":
                return {
                    "title": _sample_plan()["title"],
                    "global_notes": _sample_plan()["global_notes"],
                    "design_rationale": _sample_plan()["design_rationale"],
                    "scenes": [{k: v for k, v in scene.items() if k != "shots"} for scene in _sample_plan()["scenes"]],
                }
            if stage == "shot_design":
                return {"estimated_duration_sec": 20, "scenes": invalid_plan["scenes"]}
            if stage == "repair":
                return _sample_plan()
            raise AssertionError(stage)

        plan = design_storyboard(
            brief="做一个夏日饮品广告分镜",
            style="明亮电商广告",
            llm_generate=lambda stage, prompt: fake_llm(stage, prompt),
            req_id="req-repair",
        )
        self.assertEqual(calls.count("repair"), 1)
        self.assertTrue(plan.scenes[0].shots[0].visual_description)

    def test_storyboard_design_should_use_ai_chat_client_when_authorization_exists(self):
        intake = {
            "title": "夏日饮品广告分镜",
            "style": "明亮电商广告",
            "aspect_ratio": "16:9",
            "target_duration_sec": 20,
            "shot_default_duration_sec": 4,
            "language": "zh-CN",
            "constraints": [],
            "creative_goal": "生成可执行分镜",
        }
        scene_outline = {
            "title": _sample_plan()["title"],
            "global_notes": _sample_plan()["global_notes"],
            "design_rationale": _sample_plan()["design_rationale"],
            "scenes": [{k: v for k, v in scene.items() if k != "shots"} for scene in _sample_plan()["scenes"]],
        }
        shot_design = {"estimated_duration_sec": 20, "scenes": _sample_plan()["scenes"]}
        payloads = iter([
            json.dumps(intake, ensure_ascii=False),
            json.dumps(_sample_plan()["entities"], ensure_ascii=False),
            json.dumps(scene_outline, ensure_ascii=False),
            json.dumps(shot_design, ensure_ascii=False),
        ])

        def _fake_call(**kwargs):
            return type("Resp", (), {"text": next(payloads)})()

        with mock.patch("bananaflow.agent_v2.storyboard.designer._load_ai_chat_text_client", return_value=_fake_call):
            result = build_builtin_executor().execute(
                "storyboard.design",
                {"brief": "做一个夏日饮品广告分镜", "style": "明亮电商广告"},
                context=AgentToolContext(req_id="req-auth", extra={"run_id": "run-auth", "member_authorization": "token-abc"}),
            )
        self.assertEqual(result["title"], "夏日饮品广告分镜")
        self.assertEqual(result["style"], "明亮电商广告")

    def test_dispatcher_should_dispatch_storyboard_asynchronously(self):
        """Storyboard tool call now returns async task_id immediately without calling executor."""
        with mock.patch("bananaflow.agent_v2.gateway.dispatcher.create_storyboard_task") as mock_create:
            mock_create.return_value = "test-task-id-123"
            out = dispatch_agent_message(
                AgentMessageRequest(message="给我一个分镜方案"),
                CoordinatorDecision(
                    action="tool_call",
                    reason="storyboard",
                    matched_capabilities=["storyboard.design"],
                    tool_args={"brief": "给我一个分镜方案"},
                ),
                request=self._make_request(),
                trace_sink=[],
            )
        self.assertEqual(out["action"], "tool_call")
        self.assertTrue(out["data"].get("_async_storyboard"))
        self.assertEqual(out["data"].get("task_id"), "test-task-id-123")
        self.assertIn("tool_args", out["data"])

    def test_storyboard_graph_should_emit_observability_spans_when_run_id_exists(self):
        class _FakeTracer:
            def __init__(self):
                self.names = []

            class _Span:
                def __init__(self, owner, name):
                    self.owner = owner
                    self.name = name

                def __enter__(self):
                    self.owner.names.append(self.name)
                    return "span"

                def __exit__(self, exc_type, exc, tb):
                    return False

            def span(self, name, *, run_id, input_data=None, metadata=None):
                return self._Span(self, name)

        fake_tracer = _FakeTracer()
        sequence = {
            "intake": {
                "title": "夏日饮品广告分镜",
                "style": "明亮电商广告",
                "aspect_ratio": "16:9",
                "target_duration_sec": 20,
                "shot_default_duration_sec": 4,
                "language": "zh-CN",
                "constraints": [],
                "creative_goal": "生成可执行分镜",
            },
            "entity_design": _sample_plan()["entities"],
            "scene_outline": {
                "title": _sample_plan()["title"],
                "global_notes": _sample_plan()["global_notes"],
                "design_rationale": _sample_plan()["design_rationale"],
                "scenes": [{k: v for k, v in scene.items() if k != "shots"} for scene in _sample_plan()["scenes"]],
            },
            "shot_design": {
                "estimated_duration_sec": 20,
                "scenes": _sample_plan()["scenes"],
            },
        }
        with mock.patch("bananaflow.agent_v2.storyboard.graph.get_tracer", return_value=fake_tracer):
            with mock.patch("bananaflow.agent_v2.storyboard.designer.default_storyboard_llm_generate", side_effect=lambda stage, prompt, req_id="storyboard", authorization="": sequence[stage]):
                build_builtin_executor().execute(
                    "storyboard.design",
                    {"brief": "做一个夏日饮品广告分镜", "style": "明亮电商广告"},
                    context=AgentToolContext(req_id="req-span", extra={"run_id": "run-span"}),
                )
        self.assertEqual(
            fake_tracer.names,
            [
                "storyboard.intake",
                "storyboard.entity_design",
                "storyboard.scene_outline",
                "storyboard.shot_design",
                "storyboard.validate",
                "storyboard.finalize",
            ],
        )


if __name__ == "__main__":
    unittest.main()
