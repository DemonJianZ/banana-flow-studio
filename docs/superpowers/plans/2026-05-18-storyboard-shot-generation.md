# Storyboard Shot Image Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-shot storyboard image generation: clicking `@镜头N` opens a hover card; pressing "生成" calls a new backend endpoint that (1) uses Gemini flash to write an image prompt with selected reference images, then (2) submits the result to the existing gptimage2 multi-image composition pipeline and returns a `task_id`.

**Architecture:** New `POST /api/storyboard/generate_shot` route handles the two-step LLM-then-gptimage2 flow and reuses the existing `create_ai_chat_task` + `_run_ai_chat_image_task` machinery. Frontend adds a `shots` bucket to `storyboard_asset_state`, converts shot list items to orange `@镜头N` chips, and renders a new shot hover card portal (mirrors the existing asset hover card pattern).

**Tech Stack:** Python/FastAPI (Pydantic v2, `call_genai_retry`), React functional components, Tailwind CSS, `createPortal`, `submitAIChatImageTask` + poll helper already in `src/api/aiChat.js`.

---

## File Map

| File | Change |
|---|---|
| `bananaflow/api/routes.py` | Add `StoryboardShotGenerateRequest` model + `_build_shot_prompt_context()` helper + `POST /api/storyboard/generate_shot` route; add `MODEL_AGENT_CHAT` to config import |
| `src/pages/Workbench.jsx` | Add `hoveredStoryboardShotCard` state + ref + open/close/schedule helpers + `runStoryboardShotGeneration` useCallback + shot hover card portal; pass `onShotChipClick` prop to `NodeComponent` |
| `src/pages/Workbench.jsx` (NodeComponent IIFE) | Replace "镜头 N" text label with orange `@镜头N` chip; wire `onShotChipClick` prop |

---

## Task 1: Backend — New `POST /api/storyboard/generate_shot` Route

**Files:**
- Modify: `bananaflow/api/routes.py` (add import + Pydantic model + two helpers + route near line 2916 after `get_ai_chat_image_task_status`)
- Test: `tests/test_storyboard_shot_generation.py`

### Step 1a: Write failing test

- [ ] **Write the test**

```python
# tests/test_storyboard_shot_generation.py
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

        # Patch LLM to return selected_image_names + prompt
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
        # request_form["message"] should contain the LLM-generated prompt
        form = call_kwargs.kwargs.get("request_form") or call_kwargs.args[4] if len(call_kwargs.args) > 4 else {}
        self.assertIn("水墨风", str(form.get("message", "")))

    def test_fallback_prompt_on_llm_parse_failure(self):
        """When LLM returns unparseable JSON, falls back to visual_description template prompt."""
        mock_llm_response = MagicMock()
        mock_llm_response.text = "sorry, I cannot help with that"

        fake_task = {"task_id": "ai_chat_task_fallback", "status": "PENDING"}

        with patch("api.routes.call_genai_retry", return_value=mock_llm_response), \
             patch("api.routes.create_ai_chat_task", return_value=fake_task), \
             patch("api.routes.asyncio.create_task"), \
             patch("api.routes.MODEL_AGENT_CHAT", "gemini-2.5-flash-lite"):
            from app_factory import create_app
            app = create_app()
            client = TestClient(app)
            resp = client.post("/api/storyboard/generate_shot", json=self._make_payload())

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("task_id", data)

    def test_missing_authorization_returns_400(self):
        """Empty authorization should return 400."""
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
```

- [ ] **Run test to verify it fails**

```bash
.venv/bin/python -m pytest tests/test_storyboard_shot_generation.py -v
```

Expected: FAIL with ImportError or 404 (route not yet defined).

### Step 1b: Add config import and Pydantic model

- [ ] **In `bananaflow/api/routes.py`, add `MODEL_AGENT_CHAT` to the existing config import block (line 28–46)**

```python
# Change:
from core.config import (
    MODEL_GEMINI,
    MODEL_DOUBAO,
    # ... existing items ...
    AI_CHAT_TASK_MAX_RETRIES,
)

# To (add MODEL_AGENT_CHAT at the end of the import):
from core.config import (
    MODEL_GEMINI,
    MODEL_DOUBAO,
    MODEL_COMFYUI_OVERLAYTEXT,
    MODEL_COMFYUI_RMBG,
    MODEL_COMFYUI_REMOVE_WATERMARK,
    MODEL_COMFYUI_MULTI_ANGLESHOTS,
    MODEL_COMFYUI_VIDEO_UPSCALE,
    MODEL_COMFYUI_VIDEO_LINEART,
    MODEL_COMFYUI_VIDEO_RMBG,
    MODEL_COMFYUI_CONTROLNET,
    MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO,
    MODEL_COMFYUI_QWEN_I2V,
    AI_CHAT_DOWNSTREAM_URL,
    AI_CHAT_TASK_DB_PATH,
    AI_CHAT_TASK_TEMP_DIR,
    AI_CHAT_TASK_TIMEOUT_SEC,
    AI_CHAT_TASK_MAX_RETRIES,
    MODEL_AGENT_CHAT,
)
```

- [ ] **Add Pydantic model for the new endpoint** — insert after the `_AIChatNonRetryableError` class (around line 399, before `def _now_iso()`):

```python
class _StoryboardShotReferenceImage(BaseModel):
    type: str = ""
    name: str = ""
    url: str = ""


class _StoryboardShotGenerateRequest(BaseModel):
    shot: Dict[str, Any]
    storyboard_plan: Dict[str, Any]
    entities: Dict[str, Any] = Field(default_factory=dict)
    reference_images: List[_StoryboardShotReferenceImage] = Field(default_factory=list)
    ai_chat_model_id: str = ""
    authorization: str = ""
    module_enum: str = "1"
    part_enum: str = "2"
    ai_chat_session_id: str = ""
    history_ai_chat_record_id: str = ""
    ai_image_param_size_id: str = ""
    ai_image_param_ratio_id: str = ""
```

### Step 1c: Add helper + route

- [ ] **Add `_build_shot_prompt_context()` helper and the LLM call function** — insert immediately before the `_get_storyboard_asset_root()` function (around line 2916):

```python
def _build_shot_prompt_context(req: _StoryboardShotGenerateRequest) -> str:
    """Build the text context sent to the LLM for prompt writing."""
    shot = req.shot or {}
    plan = req.storyboard_plan or {}
    entities = req.entities or {}

    # Collect entity visual details for referenced entities
    ref_names = [str(n or "").strip() for n in list(shot.get("referenced_entities") or []) if str(n or "").strip()]
    all_entities: list = (
        list(entities.get("characters") or [])
        + list(entities.get("subjects") or [])
        + list(entities.get("locations") or [])
    )
    entity_details: list[str] = []
    for ent in all_entities:
        name = str(ent.get("name") or "").strip()
        if not name or not any(name in ref or ref in name for ref in ref_names):
            continue
        desc = str(ent.get("core_description") or ent.get("description") or "").strip()
        traits = ", ".join(str(t) for t in list(ent.get("visual_traits") or []) if str(t or "").strip())
        line = f"- {name}"
        if desc:
            line += f": {desc}"
        if traits:
            line += f" | 外观: {traits}"
        entity_details.append(line)

    # Available reference images (names only, not URLs)
    ref_image_names = [str(img.name or "").strip() for img in req.reference_images if str(img.name or "").strip()]

    global_notes = [str(n) for n in list(plan.get("global_notes") or []) if str(n or "").strip()]
    lines = [
        "# 任务",
        "你是分镜图导演，请根据以下镜头信息为 gptimage2 多图合成生成最优提示词。",
        "",
        "# 镜头信息",
        f"视觉描述: {str(shot.get('visual_description') or '').strip()}",
        f"运镜: {str(shot.get('camera') or '').strip()}",
        f"时长: {shot.get('duration_sec', '')}s",
        f"生成备注: {str(shot.get('generation_notes') or '').strip()}",
        "",
        "# 全局风格",
        f"风格: {str(plan.get('style') or '').strip()}",
        f"画幅: {str(plan.get('aspect_ratio') or '16:9').strip()}",
        f"全局说明: {'; '.join(global_notes)}",
        f"设计理念: {str(plan.get('design_rationale') or '').strip()}",
        "",
        "# 相关角色/主体视觉特征",
    ]
    lines.extend(entity_details or ["(无)"])
    lines += [
        "",
        "# 可用参考图（按名称选取，最多4张）",
    ]
    lines.extend(f"- {n}" for n in ref_image_names) if ref_image_names else lines.append("(无)")
    lines += [
        "",
        "# 输出格式（严格 JSON，不要解释）",
        '{"selected_image_names": ["图名1", "图名2"], "prompt": "英文提示词"}',
        "",
        "要求：",
        "1. selected_image_names 从上面可用参考图中按名称选，最多4张，没有合适的返回空数组。",
        "2. prompt 用英文，描述画面构图、人物动作、环境、光影、风格，针对 gptimage2 多图合成优化。",
        "3. 只输出 JSON，不要 markdown 代码块，不要多余文字。",
    ]
    return "\n".join(lines)


def _write_shot_generation_prompt(
    req: _StoryboardShotGenerateRequest,
    req_id: str,
) -> tuple[str, list[str]]:
    """
    Call Gemini flash to write the gptimage2 prompt.
    Returns (prompt_text, resolved_image_urls).
    Falls back to a template prompt if LLM output is unparseable.
    """
    context = _build_shot_prompt_context(req)
    url_by_name: dict[str, str] = {
        str(img.name or "").strip(): str(img.url or "").strip()
        for img in req.reference_images
        if str(img.name or "").strip() and str(img.url or "").strip()
    }
    try:
        response = call_genai_retry(
            contents=[types.Part(text=context)],
            config=types.GenerateContentConfig(temperature=0.3),
            req_id=f"{req_id}:shot_prompt",
            model=MODEL_AGENT_CHAT,
        )
        raw_text = str(getattr(response, "text", "") or "").strip()
        # Parse JSON from LLM output
        import re as _re
        json_match = _re.search(r"\{[\s\S]*\}", raw_text)
        if json_match:
            parsed = json.loads(json_match.group())
        else:
            parsed = json.loads(raw_text)
        selected_names = [str(n).strip() for n in list(parsed.get("selected_image_names") or []) if str(n or "").strip()]
        prompt_text = str(parsed.get("prompt") or "").strip()
        if not prompt_text:
            raise ValueError("empty prompt from LLM")
        # Resolve names → URLs; cap at 4
        resolved_urls = [url_by_name[n] for n in selected_names[:4] if n in url_by_name]
        return prompt_text, resolved_urls
    except Exception:
        # Fallback: template prompt + all reference image URLs
        shot = req.shot or {}
        plan = req.storyboard_plan or {}
        style = str(plan.get("style") or "").strip()
        vis = str(shot.get("visual_description") or "").strip()
        fallback_prompt = f"{style + ', ' if style else ''}{vis}" or "storyboard shot illustration"
        fallback_urls = [str(img.url or "").strip() for img in req.reference_images if str(img.url or "").strip()][:4]
        return fallback_prompt, fallback_urls
```

- [ ] **Add the route** — insert immediately after `_write_shot_generation_prompt` (still before `_get_storyboard_asset_root`):

```python
@router.post("/api/storyboard/generate_shot", response_model=AIChatImageTaskSubmitResponse)
async def storyboard_generate_shot(body: _StoryboardShotGenerateRequest, request: Request):
    req_id = getattr(request.state, "req_id", uuid.uuid4().hex[:8])
    authorization = str(body.authorization or "").strip()
    if not authorization:
        raise HTTPException(status_code=400, detail="authorization 不能为空")
    ai_chat_model_id = str(body.ai_chat_model_id or "").strip()
    if not ai_chat_model_id:
        raise HTTPException(status_code=400, detail="ai_chat_model_id 不能为空")

    task_id = f"ai_chat_task_{uuid.uuid4().hex}"

    prompt_text, resolved_image_urls = _write_shot_generation_prompt(body, req_id)

    request_form: Dict[str, Any] = {
        "endpoint": AI_CHAT_DOWNSTREAM_URL,
        "authorization": authorization,
        "history_ai_chat_record_id": str(body.history_ai_chat_record_id or "").strip(),
        "module_enum": str(body.module_enum or "1").strip(),
        "part_enum": str(body.part_enum or "2").strip(),
        "message": prompt_text,
        "ai_chat_session_id": str(body.ai_chat_session_id or "").strip(),
        "ai_chat_model_id": ai_chat_model_id,
        "ai_image_param_size_id": str(body.ai_image_param_size_id or "").strip(),
        "ai_image_param_ratio_id": str(body.ai_image_param_ratio_id or "").strip(),
        "images": resolved_image_urls,
        "files": [],
        "tusd_file_remote_ids": [],
    }

    task = create_ai_chat_task(
        AI_CHAT_TASK_DB_PATH,
        task_id=task_id,
        req_id=req_id,
        status="PENDING",
        progress_message="分镜图任务已提交",
        endpoint=AI_CHAT_DOWNSTREAM_URL,
        ai_chat_model_id=ai_chat_model_id,
        image_count=len(resolved_image_urls),
        request_form=request_form,
        request_files=[],
    )
    asyncio.create_task(_run_ai_chat_image_task(task_id))
    return AIChatImageTaskSubmitResponse(
        ok=True,
        task_id=task_id,
        status=str(task.get("status") or "PENDING"),
        message="分镜图任务已提交",
    )
```

### Step 1d: Run tests

- [ ] **Run tests to verify they pass**

```bash
.venv/bin/python -m pytest tests/test_storyboard_shot_generation.py -v
```

Expected: all 3 tests PASS.

- [ ] **Smoke-test with curl** (backend must be running on port 8083)

```bash
curl -s -X POST http://localhost:8083/api/storyboard/generate_shot \
  -H "Content-Type: application/json" \
  -d '{
    "shot": {"shot_id":"s1","shot_no":1,"visual_description":"test","camera":"中景","duration_sec":4.0,"referenced_entities":[],"generation_notes":""},
    "storyboard_plan": {"title":"t","style":"","aspect_ratio":"16:9","global_notes":[],"design_rationale":""},
    "entities": {},
    "reference_images": [],
    "ai_chat_model_id": "test-model-id",
    "authorization": "Bearer test"
  }' | python3 -m json.tool
```

Expected: `{"ok": true, "task_id": "ai_chat_task_...", ...}`

- [ ] **Commit**

```bash
git add bananaflow/api/routes.py tests/test_storyboard_shot_generation.py
git commit -m "feat: add POST /api/storyboard/generate_shot — LLM prompt + gptimage2 submission"
```

---

## Task 2: Frontend State — `hoveredStoryboardShotCard` + `runStoryboardShotGeneration`

**Files:**
- Modify: `src/pages/Workbench.jsx` — Workbench component section (around line 8880 for state, ~10942 for callbacks)

The `updateStoryboardAssetStatus` helper already supports arbitrary `assetType` keys (including `"shots"`) — no changes needed there.

### Step 2a: Add state and timer ref

- [ ] **After line 8881 (`const storyboardAssetHoverCloseTimerRef = useRef(null);`), add:**

```jsx
const [hoveredStoryboardShotCard, setHoveredStoryboardShotCard] = useState(null);
const storyboardShotHoverCloseTimerRef = useRef(null);
```

### Step 2b: Add open/close callbacks

- [ ] **After `scheduleCloseStoryboardAssetHoverCard` (after line 9019), add:**

```jsx
const closeStoryboardShotHoverCard = useCallback(() => {
  if (storyboardShotHoverCloseTimerRef.current) {
    window.clearTimeout(storyboardShotHoverCloseTimerRef.current);
    storyboardShotHoverCloseTimerRef.current = null;
  }
  setHoveredStoryboardShotCard(null);
}, []);

const scheduleCloseStoryboardShotHoverCard = useCallback(() => {
  if (storyboardShotHoverCloseTimerRef.current) {
    window.clearTimeout(storyboardShotHoverCloseTimerRef.current);
  }
  storyboardShotHoverCloseTimerRef.current = window.setTimeout(() => {
    setHoveredStoryboardShotCard((current) => (current?.sticky ? current : null));
    storyboardShotHoverCloseTimerRef.current = null;
  }, 300);
}, []);

const openStoryboardShotHoverCard = useCallback((storyboardNode, scene, shot, chipElement) => {
  if (!storyboardNode || !shot) return;
  if (storyboardShotHoverCloseTimerRef.current) {
    window.clearTimeout(storyboardShotHoverCloseTimerRef.current);
    storyboardShotHoverCloseTimerRef.current = null;
  }
  const rect = chipElement?.getBoundingClientRect?.() || { left: 0, bottom: 0 };
  const x = Math.min(rect.left, Math.max(window.innerWidth - 380, 24));
  const y = Math.min(rect.bottom + 6, Math.max(window.innerHeight - 480, 24));
  setHoveredStoryboardShotCard({ nodeId: storyboardNode.id, scene, shot, x, y, sticky: false });
}, []);
```

### Step 2c: Add `runStoryboardShotGeneration` callback

- [ ] **After `runStoryboardAssetDirectGeneration` (after line ~10942), add:**

```jsx
const runStoryboardShotGeneration = useCallback(
  async (storyboardNode, scene, shot) => {
    if (!storyboardNode || !shot || !apiFetch) return;
    const shotId = String(shot?.shot_id || "").trim();
    if (!shotId) return;

    updateStoryboardAssetStatus(storyboardNode.id, "shots", shotId, {
      status: "running",
      error: "",
    });
    setHoveredStoryboardShotCard((current) =>
      current && current.nodeId === storyboardNode.id && String(current.shot?.shot_id || "") === shotId
        ? { ...current, sticky: true }
        : current,
    );

    try {
      // --- Resolve model ID (same as asset generation) ---
      const preferredNanoModelId = String(AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2 || "").trim();
      const loadedModelIdSet = new Set(
        (Array.isArray(imageModelRecords) ? imageModelRecords : [])
          .map((item) => String(item?.id || item?.value || "").trim())
          .filter(Boolean),
      );
      const targetModelId =
        (preferredNanoModelId && loadedModelIdSet.has(preferredNanoModelId) ? preferredNanoModelId : "") ||
        findAIChatModelIdByKeywords(imageModelRecords) ||
        "";
      if (!targetModelId) throw new Error("未找到 gptimage2 对应的图像模型ID");

      // --- Resolve params (size + ratio) ---
      const paramList = await resolveModelParamsForId(targetModelId);
      const resolvedParamPayload = buildAIChatParamPayload(paramList);
      const selectedRatio = String(storyboardNode.data?.storyboard_plan?.aspect_ratio || "16:9").trim() || "16:9";
      const matchedSizeId = findAIChatParamValueId(paramList, ["size", "尺寸"], "1k");
      const matchedRatioId = findAIChatParamValueId(paramList, ["ratio", "比例", "宽高比", "画幅", "aspect"], selectedRatio);
      if (matchedSizeId) resolvedParamPayload.ai_image_param_size_id = matchedSizeId;
      if (matchedRatioId) resolvedParamPayload.ai_image_param_ratio_id = matchedRatioId;

      // --- Collect reference images ---
      const plan = storyboardNode.data?.storyboard_plan || {};
      const assetState = storyboardNode.data?.storyboard_asset_state || {};
      const lab = plan.local_asset_bindings || {};
      const charBindings = Array.isArray(lab.character_bindings) ? lab.character_bindings : [];
      const sceneBindings = Array.isArray(lab.scene_bindings) ? lab.scene_bindings : [];
      const allEntities = [
        ...Array.isArray(plan.entities?.characters) ? plan.entities.characters : [],
        ...Array.isArray(plan.entities?.subjects) ? plan.entities.subjects : [],
      ];
      const referenceImages = [];
      // Character three-view and generated asset images
      for (const cb of charBindings) {
        const threeViewUrl = String(cb?.three_view_url || "").trim();
        if (threeViewUrl) {
          referenceImages.push({ type: "character", name: stripStoryboardDisplayIds(String(cb?.character_name || cb?.entity_name || "")), url: threeViewUrl });
        }
        const entityId = String(cb?.entity_id || "").trim();
        const charAssetUrl = String(assetState?.characters?.[entityId]?.selectedImageUrl || "").trim();
        if (charAssetUrl) {
          referenceImages.push({ type: "asset", name: stripStoryboardDisplayIds(String(cb?.entity_name || "")), url: charAssetUrl });
        }
      }
      // Subject generated asset images
      for (const ent of allEntities.filter((e) => String(e?.kind || "") === "subject" || !String(e?.kind || ""))) {
        const entityId = String(ent?.entity_id || "").trim();
        const subjAssetUrl = String(assetState?.subjects?.[entityId]?.selectedImageUrl || "").trim();
        if (subjAssetUrl) {
          referenceImages.push({ type: "asset", name: stripStoryboardDisplayIds(String(ent?.name || "")), url: subjAssetUrl });
        }
      }
      // Scene preview + generated asset images
      for (const sb of sceneBindings) {
        const previewUrl = String((Array.isArray(sb?.preview_urls) ? sb.preview_urls : [])[0] || "").trim();
        if (previewUrl) {
          referenceImages.push({ type: "scene", name: String(sb?.folder_name || sb?.matched_from || "").trim(), url: previewUrl });
        }
      }
      for (const locEnt of Array.isArray(plan.entities?.locations) ? plan.entities.locations : []) {
        const entityId = String(locEnt?.entity_id || "").trim();
        const locAssetUrl = String(assetState?.locations?.[entityId]?.selectedImageUrl || "").trim();
        if (locAssetUrl) {
          referenceImages.push({ type: "asset", name: stripStoryboardDisplayIds(String(locEnt?.name || "")), url: locAssetUrl });
        }
      }

      // --- Build request body ---
      const authorizationInfo = resolveMemberAuthorizationInfo();
      if (!authorizationInfo?.value) throw new Error("缺少 member authorization");

      const storyboardPlanPayload = {
        title: String(plan.title || "").trim(),
        style: String(plan.style || "").trim(),
        aspect_ratio: String(plan.aspect_ratio || "16:9").trim(),
        global_notes: Array.isArray(plan.global_notes) ? plan.global_notes : [],
        design_rationale: String(plan.design_rationale || "").trim(),
      };
      const entitiesPayload = {
        characters: Array.isArray(plan.entities?.characters) ? plan.entities.characters : [],
        subjects: Array.isArray(plan.entities?.subjects) ? plan.entities.subjects : [],
        locations: Array.isArray(plan.entities?.locations) ? plan.entities.locations : [],
      };

      const submitResp = await apiFetch("/api/storyboard/generate_shot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shot: {
            shot_id: shot.shot_id,
            shot_no: shot.shot_no,
            visual_description: String(shot.visual_description || "").trim(),
            camera: String(shot.camera || "").trim(),
            duration_sec: shot.duration_sec ?? 4.0,
            referenced_entities: Array.isArray(shot.referenced_entities) ? shot.referenced_entities : [],
            generation_notes: String(shot.generation_notes || "").trim(),
          },
          storyboard_plan: storyboardPlanPayload,
          entities: entitiesPayload,
          reference_images: referenceImages,
          ai_chat_model_id: targetModelId,
          authorization: authorizationInfo.value,
          history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
          module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
          part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "text2img" })),
          ai_chat_session_id: aiChatSessionIdRef.current || "",
          ...resolvedParamPayload,
        }),
      });
      const submitData = await submitResp.json().catch(() => ({}));
      if (!submitResp.ok) throw new Error(String(submitData?.detail || "分镜图任务提交失败"));
      const taskId = String(submitData?.task_id || "").trim();
      if (!taskId) throw new Error("未返回 task_id");

      // --- Poll for result ---
      const { submitAIChatImageTask: _unused, ...importedHelpers } = await import("../api/aiChat.js");
      // Use existing poll helper by constructing a fake submit that returns immediately
      const proxyPayload = {
        authorization: authorizationInfo.value,
        history_ai_chat_record_id: aiChatHistoryRecordIdRef.current || "",
        module_enum: WORKBENCH_AI_CHAT_MODULE_ENUM,
        part_enum: String(resolveWorkbenchAIChatPartEnum({ mode: "text2img" })),
        ai_chat_session_id: aiChatSessionIdRef.current || "",
        ai_chat_model_id: targetModelId,
        message: "",
        ...resolvedParamPayload,
      };
      // Since the task is already submitted, poll directly
      const pollPath = `/api/ai_chat_image_status/${encodeURIComponent(taskId)}`;
      // Use submitAIChatImageTask with a pre-submitted task_id by re-implementing a short poll
      const pollIntervalMs = 1200;
      const timeoutMs = 600000;
      const startedAt = Date.now();
      let resultUrl = "";
      let proxyData = null;
      while (true) {
        if (Date.now() - startedAt > timeoutMs) throw new Error("分镜图生成超时");
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        const statusResp = await apiFetch(`/api/ai_chat_image_via_curl/${encodeURIComponent(taskId)}`);
        const statusData = await statusResp.json().catch(() => ({}));
        const status = String(statusData?.status || "").toUpperCase();
        if (status === "SUCCESS") {
          proxyData = statusData?.result && typeof statusData.result === "object" ? statusData.result : {};
          break;
        }
        if (status === "FAILED" || status === "TIMEOUT") {
          const errMsg = String(proxyData?.done_error || statusData?.error || `分镜图生成${status === "TIMEOUT" ? "超时" : "失败"}`);
          throw new Error(errMsg);
        }
      }
      if (proxyData?.source_session_id) aiChatSessionIdRef.current = String(proxyData.source_session_id);
      if (proxyData?.source_history_record_id) aiChatHistoryRecordIdRef.current = String(proxyData.source_history_record_id);
      resultUrl =
        pickFirstImageUrl(proxyData?.image_url) ||
        pickFirstImageUrl(proxyData?.events) ||
        pickFirstImageUrl(proxyData?.text) ||
        pickFirstImageUrl(proxyData) ||
        "";
      if (!resultUrl) throw new Error("分镜图生成未返回图片");

      const generatedAt = Date.now();
      updateStoryboardAssetStatus(storyboardNode.id, "shots", shotId, (prev) => {
        const prevCandidates = normalizeStoryboardAssetCandidates(prev?.candidates);
        const nextCandidate = {
          id: `candidate_${generatedAt}_${Math.random().toString(36).slice(2, 8)}`,
          url: resultUrl,
          createdAt: generatedAt,
          source: "generate",
        };
        const nextCandidates = [nextCandidate, ...prevCandidates.filter((c) => String(c?.url || "") !== resultUrl)].slice(0, 8);
        return {
          ...prev,
          status: "success",
          error: "",
          images: [resultUrl],
          candidates: nextCandidates,
          selectedCandidateId: nextCandidate.id,
          selectedImageUrl: resultUrl,
          lastGeneratedAt: generatedAt,
        };
      });
    } catch (error) {
      updateStoryboardAssetStatus(storyboardNode.id, "shots", shotId, {
        status: "error",
        error: String(error?.message || error || "分镜图生成失败"),
      });
    } finally {
      setHoveredStoryboardShotCard((current) =>
        current && current.nodeId === storyboardNode.id && String(current.shot?.shot_id || "") === shotId
          ? { ...current, sticky: false }
          : current,
      );
    }
  },
  [apiFetch, imageModelRecords, resolveModelParamsForId, updateStoryboardAssetStatus, resolveMemberAuthorizationInfo],
);
```

> **Note on polling:** `stripStoryboardDisplayIds` is used inside the callback — it's defined as a module-level const before `NodeComponent`, so it's accessible in the Workbench component scope.

- [ ] **Verify no syntax errors by running the frontend dev server**

```bash
./scripts/run_frontend_dev.sh
```

Expected: Vite starts without errors (no red import/syntax errors in console).

- [ ] **Commit**

```bash
git add src/pages/Workbench.jsx
git commit -m "feat: add hoveredStoryboardShotCard state and runStoryboardShotGeneration callback"
```

---

## Task 3: NodeComponent — `@镜头N` Chip + `onShotChipClick` Prop

**Files:**
- Modify: `src/pages/Workbench.jsx` — NodeComponent IIFE storyboard shot rendering section (around line 7474–7571)
- Modify: `src/pages/Workbench.jsx` — NodeComponent prop declaration + Workbench call site

### Step 3a: Add `onShotChipClick` to NodeComponent props

- [ ] **Find the NodeComponent function declaration** (around line 4761). Add `onShotChipClick` to the destructured props:**

```jsx
// Find the existing prop destructure. It looks like:
function NodeComponent({
  node,
  updateData,
  // ... many props ...
  onStoryboardMentionHover,
  onStoryboardMentionLeave,
}) {

// Add onShotChipClick after onStoryboardMentionLeave:
function NodeComponent({
  node,
  updateData,
  // ... many props ...
  onStoryboardMentionHover,
  onStoryboardMentionLeave,
  onShotChipClick,
}) {
```

### Step 3b: Replace "镜头 N" text with `@镜头N` chip

- [ ] **Find the shot card label block (around line 7508–7511):**

```jsx
// Current:
<div className="flex items-center justify-between gap-2">
  <div className="text-[11px] font-medium text-slate-800">
    镜头 {shot?.shot_no || shotIndex + 1}
  </div>
```

Replace with:

```jsx
<div className="flex items-center justify-between gap-2">
  <div className="flex items-center gap-1.5">
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (onShotChipClick) onShotChipClick(node, scene, shot, e.currentTarget);
      }}
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 transition-colors
        bg-orange-50 text-orange-700 ring-orange-200 hover:bg-orange-100
      `}
    >
      @镜头{shot?.shot_no || shotIndex + 1}
      {(() => {
        const shotId = String(shot?.shot_id || `${scene?.scene_id || sceneIndex}-shot-${shotIndex}`).trim();
        const shotAssetState = node?.data?.storyboard_asset_state?.shots?.[shotId] || {};
        const shotStatus = String(shotAssetState?.status || "").trim();
        if (shotStatus === "running") {
          return <Loader2 className="ml-0.5 h-2.5 w-2.5 animate-spin text-orange-500" />;
        }
        if (shotStatus === "success" && String(shotAssetState?.selectedImageUrl || "").trim()) {
          return <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-green-500" />;
        }
        return null;
      })()}
    </button>
  </div>
```

### Step 3c: Pass `onShotChipClick` from Workbench call site

- [ ] **Find the NodeComponent call site in Workbench (around line 17303). Add the new prop after `onStoryboardMentionLeave`:**

```jsx
// Current:
onStoryboardMentionHover={openStoryboardAssetHoverCard}
onStoryboardMentionLeave={scheduleCloseStoryboardAssetHoverCard}

// Add:
onStoryboardMentionHover={openStoryboardAssetHoverCard}
onStoryboardMentionLeave={scheduleCloseStoryboardAssetHoverCard}
onShotChipClick={openStoryboardShotHoverCard}
```

- [ ] **Check in browser:** open a storyboard node — shot items should now show orange `@镜头N` chips. Clicking a chip should call `openStoryboardShotHoverCard` (no hover card yet, but no JS errors).

- [ ] **Commit**

```bash
git add src/pages/Workbench.jsx
git commit -m "feat: replace shot labels with orange @镜头N chips; wire onShotChipClick prop"
```

---

## Task 4: Shot Hover Card Portal

**Files:**
- Modify: `src/pages/Workbench.jsx` — add shot hover card portal immediately after the existing asset hover card portal (around line 18108)

### Step 4a: Add the hover card portal

- [ ] **Find the existing asset hover card portal block** (around line 18108, starting with `{hoveredStoryboardAssetCard ? createPortal(...`). Insert the shot card portal **after** the closing `)}` of that block:

```jsx
{hoveredStoryboardShotCard
  ? createPortal(
      (() => {
        const storyboardNode = nodes.find((n) => n.id === hoveredStoryboardShotCard.nodeId) || null;
        const shot = hoveredStoryboardShotCard.shot || null;
        const scene = hoveredStoryboardShotCard.scene || null;
        const shotId = String(shot?.shot_id || "").trim();
        const shotAssetState = storyboardNode?.data?.storyboard_asset_state?.shots?.[shotId] || {};
        const generationStatus = String(shotAssetState?.status || "").trim();
        const isRunning = generationStatus === "running";
        const selectedImageUrl = String(shotAssetState?.selectedImageUrl || "").trim();
        const candidateItems = normalizeStoryboardAssetCandidates(shotAssetState?.candidates);
        const generatedAt = shotAssetState?.lastGeneratedAt ? new Date(shotAssetState.lastGeneratedAt).toLocaleString() : "";
        const errorMsg = String(shotAssetState?.error || "").trim();
        const sceneDisplayName = stripStoryboardDisplayIds(String(scene?.location || scene?.title || "").trim()) || `场景 ${scene?.scene_no || ""}`;

        return (
          <div
            className="fixed z-[191] w-[360px] pointer-events-auto"
            style={{ left: hoveredStoryboardShotCard.x, top: hoveredStoryboardShotCard.y }}
            onMouseEnter={() => {
              if (storyboardShotHoverCloseTimerRef.current) {
                window.clearTimeout(storyboardShotHoverCloseTimerRef.current);
                storyboardShotHoverCloseTimerRef.current = null;
              }
            }}
            onMouseLeave={scheduleCloseStoryboardShotHoverCard}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.16)]">
              {/* Header */}
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[11px] font-semibold text-orange-700 ring-1 ring-orange-200">
                      @镜头{shot?.shot_no}
                    </span>
                    <span className="truncate text-[12px] font-medium text-slate-700">{sceneDisplayName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 shrink-0">
                    {String(shot?.camera || "").trim() ? <span>{String(shot.camera).trim()}</span> : null}
                    {shot?.duration_sec ? <span>{shot.duration_sec}s</span> : null}
                  </div>
                </div>
                {generatedAt ? <div className="mt-1.5 text-[10px] text-slate-400">最近生成：{generatedAt}</div> : null}
              </div>

              {/* Body */}
              <div className="space-y-3 p-4">
                {/* Generated image */}
                {selectedImageUrl ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => setPreviewImage(selectedImageUrl)}
                      className="block w-full overflow-hidden rounded-[14px] border border-slate-200 bg-slate-50"
                    >
                      <img
                        src={selectedImageUrl}
                        alt={`镜头${shot?.shot_no} 分镜图`}
                        className="w-full object-contain"
                        style={{ maxHeight: 200 }}
                      />
                    </button>
                    {/* Candidate thumbnails row */}
                    {candidateItems.length > 1 ? (
                      <div className="mt-2 flex gap-1.5 overflow-x-auto">
                        {candidateItems.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              updateStoryboardAssetStatus(storyboardNode.id, "shots", shotId, {
                                selectedImageUrl: c.url,
                                selectedCandidateId: c.id,
                              })
                            }
                            className={`h-14 w-14 shrink-0 overflow-hidden rounded-[8px] border-2 transition-colors ${
                              c.url === selectedImageUrl ? "border-orange-400" : "border-slate-200 hover:border-slate-400"
                            }`}
                          >
                            <img src={c.url} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Visual description */}
                {String(shot?.visual_description || "").trim() ? (
                  <div className="text-[11px] leading-5 text-slate-600 break-words">
                    {String(shot.visual_description).trim()}
                  </div>
                ) : null}

                {/* Dialogues */}
                {Array.isArray(shot?.dialogues) && shot.dialogues.length > 0 ? (
                  <div className="space-y-0.5">
                    {shot.dialogues.map((d, di) => {
                      const speaker = String(d?.speaker || "").trim();
                      const line = String(d?.text || "").trim();
                      if (!line) return null;
                      return (
                        <div key={di} className="text-[10px] leading-5 text-slate-500 break-words">
                          {speaker ? (
                            <>
                              <span className="font-medium text-slate-700">{speaker}：</span>
                              <span>{line}</span>
                            </>
                          ) : (
                            <span>"{line}"</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {/* Error message */}
                {errorMsg ? (
                  <div className="rounded-[10px] bg-rose-50 px-3 py-2 text-[11px] text-rose-600">{errorMsg}</div>
                ) : null}

                {/* Generate button */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => {
                      if (storyboardNode) runStoryboardShotGeneration(storyboardNode, scene, shot);
                    }}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-[12px] py-2.5 text-[12px] font-medium transition-colors ${
                      isRunning
                        ? "cursor-not-allowed bg-slate-100 text-slate-400"
                        : "bg-orange-500 text-white hover:bg-orange-600"
                    }`}
                  >
                    {isRunning ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" />生成中…</>
                    ) : selectedImageUrl ? (
                      <><RotateCcw className="h-3.5 w-3.5" />重生成</>
                    ) : (
                      <><Sparkles className="h-3.5 w-3.5" />生成分镜图</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })(),
      document.body,
    )
  : null}
```

### Step 4b: Verify in browser

- [ ] **Start the dev stack**

```bash
./scripts/run_test_stack.sh
```

- [ ] **Open a project with a storyboard node in the browser at `http://192.168.20.30:5174/app`**
- [ ] **Verify:** Storyboard shot items show orange `@镜头N` chips
- [ ] **Click a chip** → hover card appears at chip position
- [ ] **Move mouse away** → card closes after 300ms
- [ ] **Click "生成分镜图"** → button shows spinner, status dot appears on chip when done
- [ ] **Click generated image** → full-screen preview opens
- [ ] **Multiple generations** → candidate thumbnail row appears

- [ ] **Commit**

```bash
git add src/pages/Workbench.jsx
git commit -m "feat: add shot hover card portal with image preview, candidate row, and generate button"
```

---

## Self-Review Checklist

**Spec coverage:**

| Spec requirement | Covered in task |
|---|---|
| `POST /api/storyboard/generate_shot` with defined request body | Task 1 |
| Returns `{task_id}`, frontend polls `/api/ai_chat_image_via_curl/{task_id}` | Task 1 + Task 2 |
| Step 1: LLM (MODEL_AGENT_CHAT) writes `{selected_image_names, prompt}` | Task 1 `_write_shot_generation_prompt` |
| Step 2: gptimage2 via existing `create_ai_chat_task` + `_run_ai_chat_image_task` | Task 1 route |
| Max 4 reference images; fallback on LLM parse failure | Task 1 `_write_shot_generation_prompt` |
| `storyboard_asset_state.shots[shot_id]` bucket | Task 2 (uses existing `updateStoryboardAssetStatus`) |
| Reference image collection table (character three_view, asset, scene preview) | Task 2 `runStoryboardShotGeneration` |
| `@镜头N` chip — orange color, spinner on running, green dot on success | Task 3 |
| `onShotChipClick` prop | Task 3 |
| Shot hover card: header, image, thumbnails, description, dialogues, generate button | Task 4 |
| 360px width, portal into body, close on mouse-leave 300ms | Task 4 |
| Image click → `setPreviewImage` | Task 4 |
| Error display | Task 4 |

**Placeholder scan:** No TBD or TODO items found.

**Type consistency:**
- `shotId` = `String(shot?.shot_id || "")` consistently across Tasks 2, 3, 4
- `hoveredStoryboardShotCard` shape: `{nodeId, scene, shot, x, y, sticky}` — used consistently in Task 2 (set) and Task 4 (read)
- `updateStoryboardAssetStatus(nodeId, "shots", shotId, patch)` — Task 2 writes, Task 4 reads same path
- `normalizeStoryboardAssetCandidates` — same helper used in asset card, imported in Task 4
- `stripStoryboardDisplayIds` — module-level const in Workbench.jsx, accessible in both NodeComponent IIFE and Workbench scope
