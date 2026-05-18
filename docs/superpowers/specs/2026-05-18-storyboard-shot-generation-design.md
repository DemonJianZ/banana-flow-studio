# Storyboard Shot Image Generation — Design Spec

**Date:** 2026-05-18  
**Status:** Approved  
**Scope:** Phase 2 of the storyboard pipeline — generating per-shot storyboard images from the shot list produced in Phase 1.

---

## Overview

After the agent produces a `StoryboardPlan` (with entities, scenes, and shots), users can generate an image for any individual shot. Clicking `@镜头N` in the shot list opens a hover card; a "生成" button triggers a two-step backend flow: LLM prompt writing → gptimage2 multi-image composition.

---

## Backend

### New Endpoint: `POST /api/storyboard/generate_shot`

**Request body:**
```json
{
  "shot": {
    "shot_id": "...",
    "shot_no": 1,
    "visual_description": "...",
    "camera": "...",
    "duration_sec": 4.0,
    "referenced_entities": ["龙女", "阿巳"],
    "generation_notes": ""
  },
  "storyboard_plan": {
    "title": "...",
    "style": "...",
    "aspect_ratio": "16:9",
    "global_notes": [],
    "design_rationale": ""
  },
  "entities": {
    "characters": [...],
    "subjects": [...],
    "locations": [...]
  },
  "reference_images": [
    { "type": "character", "name": "龙女", "url": "/main_assets/人物/龙女三视图.png" },
    { "type": "asset",     "name": "龙女", "url": "/api/serve/asset/xxx.png" },
    { "type": "scene",     "name": "阿巳庭院", "url": "/main_assets/场景/阿巳庭院/preview.jpg" }
  ],
  "ai_chat_model_id": "gptimage2-model-id",
  "authorization": "Bearer ..."
}
```

**Response:** `{ "task_id": "..." }` — identical to existing asset generation; frontend polls `/api/ai_chat_image_status/{task_id}`.

### Execution Flow (Two Steps)

**Step 1 — LLM prompt writing (Gemini flash / `MODEL_AGENT_CHAT`)**

System prompt instructs the LLM to act as a storyboard image director. Input context:
- Shot: `visual_description`, `camera`, `duration_sec`, `referenced_entities`, `generation_notes`
- Global style: `storyboard_plan.style`, `global_notes`, `design_rationale`, `aspect_ratio`
- Entity visual traits: for each entity in `referenced_entities`, include `core_description`, `visual_traits`, `appearance`
- Available reference images: list of `{ type, name }` only (URLs not sent to LLM — LLM selects by name)

LLM returns JSON:
```json
{
  "selected_image_names": ["龙女三视图", "阿巳庭院preview"],
  "prompt": "..."
}
```

The endpoint maps `selected_image_names` back to URLs from the `reference_images` list.  
Max selected images: 4. If LLM output fails to parse, fall back to using all reference images with a template prompt built from `visual_description`.

**Step 2 — gptimage2 submission**

Pass `prompt` + resolved image URLs to the existing `ai_chat_image_via_curl` internal logic (reuse the same helper already used by `/api/ai_chat_image_via_curl`). Return the resulting `task_id`.

### File Location

`bananaflow/api/routes.py` — new route added near the existing storyboard-related routes.

Helper for prompt construction: inline function `_build_shot_prompt_context()` within the route handler (no new file needed given current codebase style).

---

## Frontend — State

### `storyboard_asset_state` Extension

Add `shots` key alongside existing `characters`, `subjects`, `locations`:

```js
storyboard_asset_state: {
  characters: { [entity_id]: AssetState },
  subjects:   { [entity_id]: AssetState },
  locations:  { [entity_id]: AssetState },
  shots:      { [shot_id]:   AssetState }   // new
}
```

`AssetState` shape is unchanged: `{ status, selectedImageUrl, candidates, lastGeneratedAt, error, ... }`.

`updateStoryboardAssetStatus(nodeId, "shots", shot_id, patch)` works without modification.

### Reference Image Collection

On generation trigger, the frontend collects all available reference image candidates from the node and passes them to the backend. The backend LLM decides which to use — no frontend pre-filtering.

| Source | Type label | Included when |
|---|---|---|
| `local_asset_bindings.character_bindings[*].three_view_url` | `"character"` | non-empty |
| `storyboard_asset_state.characters[id].selectedImageUrl` | `"asset"` | non-empty |
| `storyboard_asset_state.subjects[id].selectedImageUrl` | `"asset"` | non-empty |
| `local_asset_bindings.scene_bindings[*].preview_urls[0]` | `"scene"` | non-empty |
| `storyboard_asset_state.locations[id].selectedImageUrl` | `"asset"` | non-empty |

Entity name is set to the human-readable name of the entity (after `stripStoryboardDisplayIds`).

### `runStoryboardShotGeneration(storyboardNode, scene, shot)`

New `useCallback` in `Workbench`:
1. Set `shots[shot_id].status = "running"` via `updateStoryboardAssetStatus`
2. Collect reference images (see table above)
3. Resolve `ai_chat_model_id` (same gptimage2 model ID used by asset generation)
4. `POST /api/storyboard/generate_shot` with full payload
5. Poll `/api/ai_chat_image_status/{task_id}` (reuse existing poll helper)
6. On success: set `selectedImageUrl`, push to `candidates`, set `status = "success"`
7. On error: set `status = "error"`, store `error` message

---

## Frontend — UI

### Shot List: `@镜头N` Chips

In `NodeComponent`, the shot list (currently plain text "镜头 N" in each shot card) is updated:

- The "镜头 N" label becomes a styled clickable chip: `@镜头N`
- **Color**: orange (`bg-orange-50 text-orange-700 ring-orange-200`) — distinct from character (cyan), subject (violet), scene (amber)
- **Status overlay** on the chip:
  - Generating: `<Loader2 className="animate-spin" />` spinner appended
  - Has image: small green dot on top-right of chip

Clicking the chip calls `onShotChipClick(scene, shot, chipElement)` (new prop on `NodeComponent`), which opens the shot hover card at the chip's position.

### Shot Hover Card

Separate from the existing asset hover card. Controlled by new state `hoveredStoryboardShotCard` (analogous to `hoveredStoryboardAssetCard`) in `Workbench`.

**Card structure:**

```
┌─────────────────────────────────────────┐
│ @镜头N · 场景名          [camera] [Xs]  │
├─────────────────────────────────────────┤
│ [Generated image — clickable for zoom]  │
│ [Candidate thumbnails row if >1]        │
├─────────────────────────────────────────┤
│ visual_description text                 │
│ 对白: Speaker: "line" (if any)          │
├─────────────────────────────────────────┤
│ [✨ 生成] or [↺ 重生成]  (spinner if    │
│  running)                               │
└─────────────────────────────────────────┘
```

- Width: 360px, same as asset hover card
- Close behavior: mouse-leave with 300ms delay timer (same pattern as asset card)
- Image preview: clicking generated image calls `setPreviewImage(url)`
- Portal: rendered via `ReactDOM.createPortal` into `document.body` (same as asset card)

### New State & Props

| What | Where |
|---|---|
| `hoveredStoryboardShotCard` state | `Workbench` |
| `openStoryboardShotHoverCard(scene, shot, x, y)` | `Workbench` |
| `closeStoryboardShotHoverCard()` | `Workbench` |
| `scheduleCloseStoryboardShotHoverCard()` | `Workbench` |
| `runStoryboardShotGeneration(node, scene, shot)` | `Workbench` (useCallback) |
| `onShotChipClick` prop | `NodeComponent` |

---

## Error Handling

| Failure point | Behavior |
|---|---|
| LLM prompt writing fails / bad JSON | Fall back to template prompt from `visual_description`; still call gptimage2 |
| gptimage2 task fails | Set `status = "error"`, show error message in hover card |
| No reference images available | Proceed with text-only prompt; LLM selects empty image list |
| `ai_chat_model_id` not resolved | Show error in hover card; do not call backend |

---

## Out of Scope

- Batch generation of all shots
- Editing the LLM-written prompt before submission
- Shot image export / download
- Voiceover generation per shot
