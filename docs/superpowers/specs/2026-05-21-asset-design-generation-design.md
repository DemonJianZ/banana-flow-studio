# Asset Design Generation — Design Spec

**Date:** 2026-05-21  
**Scope:** `shot_workflow` / `execute_build_asset_canvas` 流程中，对资产库未匹配实体自动生成设定图节点

---

## 背景

`execute_build_asset_canvas` 在画布上创建角色/道具/场景设定图组。当前行为：
- 资产库有匹配 → `input` 节点（展示三视图）
- 资产库无匹配 → `text_input` 节点（名称/描述占位，无生成流程）

目标：对未匹配实体，在画布上创建完整的生成工作流节点（`text_input → processor → output`），并由 LLM 批量生成类型化的设定图提示词（角色三视图 / 道具产品渲染 / 场景概念图）。

---

## 设计原则

- **触发方式**：手动，用户在画布上点击"运行"触发生成（与现有镜头生成节点体验一致）
- **生成后端**：跟随 `mode_policy`（`text2img` / `local_text2img`），与镜头生成使用相同决策逻辑
- **提示词来源**：专用 LLM 批量调用；失败时逐实体走模板兜底
- **职责边界**：LLM 在 prompter 模块，画布构建在 builder 模块，编排在 execute 节点

---

## 文件改动清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `bananaflow/agent_v2/shot_workflow/asset_design_prompter.py` | **新增** | LLM 批量生成设定图提示词 |
| `bananaflow/agent_v2/shot_workflow/asset_canvas_builder.py` | **修改** | 接收 enriched entities，为未匹配实体创建三节点生成链 |
| `bananaflow/agent_v2/graph/nodes/execute_build_asset_canvas.py` | **修改** | 编排：提取 entity_id → 匹配 → 生成 prompts → 合并 enriched → 构建 patch |

---

## 数据结构

### `entity_id` 生成规则

```python
import re

def make_entity_id(entity_type: str, name: str, occurrence: int = 1) -> str:
    safe = re.sub(r'[\s/:\\|]', '_', name.strip())
    suffix = "" if occurrence == 1 else f"_{occurrence}"
    return f"{entity_type}_{safe}{suffix}"
```

同名实体按提取顺序加 `_2`, `_3` 后缀（第 1 次出现无后缀，第 2 次起加序号）。调用方维护 `name_count: dict[str, int]`，每次使用后递增。

### `asset_id` 生成规则（Phase 0）

```python
import hashlib

def make_asset_id(relative_path: str) -> str:
    return hashlib.md5(relative_path.encode()).hexdigest()[:12]
```

> **Phase 0 限制**：文件路径变更后 ID 随之变化。后续资产 manifest 化后替换为正式 `asset_id`。

---

### Enriched Entity（`execute_build_asset_canvas.py` 组装，传入 builder）

```python
{
  "entity_id":    "character_辰辰",
  "name":         "辰辰",
  "entity_type":  "character",          # character | prop | scene
  "description":  "身着青色道袍，腰系玉佩...",
  # 匹配结果（execute 合并进来）
  "asset_status": "matched",            # matched | missing | candidate
  "matched_url":  "/main_assets/人物/龙女三视图.png",  # None if missing
  "asset_id":     "a3f1c9e2b401",       # None if missing
  "match_score":  3.0,                  # None if missing
  "match_reason": None,                 # candidate 时填写原因
  # 设计提示词（execute 合并进来，仅 missing 实体有）
  "design_prompt":        "Three-view character design sheet...",
  "design_prompt_source": "llm",        # llm | fallback
  "design_prompt_warnings": []
}
```

---

### `match_asset_entities()` 返回值

```python
{
  "matched": [
    {
      "entity_id":  "character_龙女",
      "name":       "龙女",
      "entity_type": "character",
      "asset_id":   "a3f1c9e2b401",
      "url":        "/main_assets/人物/龙女三视图.png",
      "score":      3.0
    }
  ],
  "unmatched": [
    {
      "entity_id":   "character_辰辰",
      "name":        "辰辰",
      "entity_type": "character",
      "description": "身着青色道袍，腰系玉佩..."
    }
  ],
  "candidates": [
    {
      "entity_id":   "character_辰辰",
      "name":        "辰辰",
      "entity_type": "character",
      "url":         "...",
      "score":       0.7,
      "reason":      "name_alias_or_description_overlap"
    }
  ]
}
```

---

### `generate_design_prompts()` 返回值

```python
{
  "character_辰辰": {
    "entity_id":   "character_辰辰",
    "name":        "辰辰",
    "prompt":      "Three-view character design sheet, front/side/back view, full body, white background...",
    "source":      "llm",          # llm | fallback
    "entity_type": "character",
    "warnings":    []
  },
  "prop_玉佩": {
    "entity_id":   "prop_玉佩",
    "name":        "玉佩",
    "prompt":      "Product concept illustration, clean white background, studio lighting, multiple angles...",
    "source":      "fallback",
    "entity_type": "prop",
    "warnings":    ["llm_entity_missing_from_response"]
  }
}
```

---

### Canvas 节点 `data`（未匹配实体，`text_input` 节点）

```python
{
  "text":                   "Three-view character design sheet...",
  "title":                  "辰辰 设定图",
  "entity_id":              "character_辰辰",
  "entity_name":            "辰辰",
  "entity_type":            "character",
  "description":            "身着青色道袍，腰系玉佩...",
  "asset_status":           "missing",
  "design_prompt_source":   "llm",
  "workflow_role":          "asset_design_generation"
}
```

### Canvas 节点 `data`（未匹配实体，`processor` 节点）

```python
{
  "mode":          "text2img",           # resolve_asset_design_mode(mode_policy) 决定
  "prompt":        "Three-view character design sheet...",  # 必填，与 text_input.text 相同
  "model":         "",                   # local_text2img 时填 MODEL_COMFYUI_IMAGE_Z_IMAGE_TURBO
  "workflow_role": "asset_design_generation",
  "asset_status":  "missing",
  "entity_id":     "character_辰辰",
  "entity_name":   "辰辰",
  "entity_type":   "character",
  "templates":     {"size": "1k"},
  "batchSize":     1,
  "status":        "idle"
}
```

`mode` 通过 `resolve_asset_design_mode()` 决策，**不允许 `multi_image_generate`**（缺失资产无参考图）：

```python
def resolve_asset_design_mode(mode_policy: str) -> str:
    if mode_policy in {"local", "comfyui", "local_text2img"}:
        return "local_text2img"
    return "text2img"  # 含 auto、multi_image_generate 均降级为 text2img
```

---

## 模块详细设计

### `asset_design_prompter.py`（新增）

**职责**：按实体类型批量生成设定图提示词，LLM 失败时逐实体走模板兜底。

```python
def generate_design_prompts(
    entities: list[dict],    # unmatched entities，带 entity_id/name/entity_type/description
    authorization: str = "",
) -> dict[str, dict]:        # {entity_id: DesignPromptResult}
```

**LLM 调用策略**：
- 一次批量调用（reuse `_call_llm` from `llm_decomposer.py`）
- 输出 JSON：`{entity_id: "english prompt string"}`
- 解析失败（JSON 整体不可用）→ 全部实体走模板 fallback
- JSON 可用但某 entity_id 缺失 → 仅该实体走模板 fallback

**按类型模板（fallback）**：

| entity_type | 模板方向 |
|---|---|
| `character` | `"Three-view character design sheet of {name}, front/side/back, white background, full body illustration, {description}"` |
| `prop` | `"Product concept illustration of {name}, clean white background, studio lighting, multiple angles, {description}"` |
| `scene` | `"Environment concept art of {name}, establishing shot, wide angle, cinematic, {description}"` |

---

### `match_asset_entities(entities)` — 替换 `_match_assets()`

**签名变化**：原 `_match_assets(char_entities, scene_entities)` → `match_asset_entities(entities: list[dict])`。

每个 entity 自带 `entity_type`，函数内部按 type 路由：
- `character` → 现有 character 名称匹配逻辑
- `scene` → 现有 scene 文件夹匹配逻辑
- `prop` → **Phase 0 不做本地资产匹配，直接归入 `unmatched`**（本地资产库无道具分类）

统一返回 `match_result`。

---

### `asset_canvas_builder.py` — 改动点

**`build_asset_canvas_patch()` 新签名**：

```python
def build_asset_canvas_patch(
    enriched_entities: list[dict],   # 已含 asset_status/matched_url/design_prompt
    *,
    current_nodes: list[dict] | None = None,
    mode_policy: str = "text2img",
) -> list[dict]:
```

`characters` / `scenes` 两个参数合并为一个 `enriched_entities`，按 `entity_type` 分组分别建 group container。

**`_build_group()` 节点决策**：

```
asset_status == "matched"   → input 节点（matched_url）
asset_status == "missing"   → text_input + processor + output + 连线
asset_status == "candidate" → Phase 0：同 missing，走生成链（无前端确认 UI）
                               Phase 1：input 节点（候选图）+ 前端确认 UI
```

**布局**：
- matched 实体：沿用现有 grid 布局（`_COL_W = 308px`，每行最多 4 列）
- missing 实体（三节点链）：每个实体独占一行，`text_input (x, y) → processor (x+360, y) → output (x+720, y)`
- group container 宽度：有 missing 实体时扩至 `max_grid_w + 720px`

---

### `execute_build_asset_canvas.py` — 新编排流程

```python
def execute_build_asset_canvas(state):
    # 1. 提取实体，生成 entity_id（safe_name，同名去重）
    entities = _extract_entities(tool_args)

    # 2. 批量匹配资产库
    match_result = match_asset_entities(entities)

    # 3. 对 unmatched + candidate 实体批量生成 design prompts（LLM）
    #    Phase 0：candidate 无前端确认 UI，同 missing 走生成链
    entities_to_design = match_result["unmatched"] + match_result["candidates"]
    design_prompts = generate_design_prompts(
        entities_to_design, authorization=authorization
    )

    # 4. 合并 match_result + design_prompts → enriched_entities
    enriched = _enrich_entities(entities, match_result, design_prompts)

    # 5. 构建画布 patch
    patch = build_asset_canvas_patch(
        enriched, current_nodes=current_nodes, mode_policy=mode_policy
    )

    # 6. 汇总 summary + warnings（含 fallback 提示）
    ...
```

---

## 兜底与错误处理

| 场景 | 处理 |
|---|---|
| LLM 整体调用失败 | 所有 unmatched 实体走模板 fallback，`source: "fallback"` |
| LLM JSON 解析失败 | 同上 |
| LLM 响应中漏掉某实体 | 仅该实体走模板 fallback |
| `match_asset_entities` 抛异常 | 所有实体视为 unmatched |
| `build_asset_canvas_patch` 抛异常 | 调用 `_build_placeholder_asset_patch(enriched_entities, current_nodes)`，为每个实体创建 bare `text_input` 节点（兜底，保证画布不为空）|

---

## Phase 划分

| Phase | 范围 |
|---|---|
| **Phase 0（本次）** | match → generate prompts → 三节点生成链 上画布，用户手动运行 |
| **Phase 1** | 生成后"保存到资产库"按钮；候选匹配（candidates）前端确认 UI |
| **Phase 2** | 资产 manifest 正式化（正式 asset_id），替换路径 hash |

---

## 开放问题（暂不阻塞 Phase 0）

- candidate 阈值（目前 score ≥ 1.0 为匹配，0.5-1.0 可作为候选）待前端 UI 设计后确认
- `workflow_role: "asset_design_generation"` 前端是否需要特殊渲染（vs `shot_image_generation`）待 UI 确认
