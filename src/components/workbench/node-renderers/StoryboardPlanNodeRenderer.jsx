import React from "react";
import { ArrowRight, CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import {
  collectStoryboardMentionTerms,
  isSameArtifactSelection,
  matchesSceneBinding,
  renderStoryboardMentionText,
  stripStoryboardDisplayIds,
} from "../../../constants/workbench.jsx";

export default function StoryboardPlanNodeRenderer({
  node,
  updateData,
  activeArtifact,
  onSelectArtifact,
  onStoryboardMentionHover,
  onStoryboardMentionLeave,
  onShotChipClick,
}) {
  return (
          <div className="nodrag space-y-3 p-3">
            <div className="rounded-[14px] border border-violet-200 bg-[linear-gradient(180deg,#fcfaff,#f4f1ff)] p-3 shadow-[0_12px_28px_rgba(76,29,149,0.08)]">
              {(() => {
                const storyboardPlan = node.data?.storyboard_plan || {};
                const storyboardMentionTerms = collectStoryboardMentionTerms(storyboardPlan);
                const locationList = Array.isArray(storyboardPlan?.entities?.locations) ? storyboardPlan.entities.locations : [];
                const locationByName = new Map(
                  locationList
                    .map((item) => [String(item?.name || "").trim(), item])
                    .filter(([name]) => !!name)
                );
                const selectStoryboardTarget = (selectionType, selectionId, selectionLabel, selectionSummary, payload = {}) => {
                  const next = {
                    kind: "storyboard_selection",
                    fromNodeId: node.id,
                    meta: {
                      nodeKind: "storyboard_plan",
                      selectionType,
                      selectionId,
                      selectionLabel,
                      selectionSummary,
                      storyboardTitle: String(storyboardPlan?.title || node.data?.title || "").trim(),
                      sceneTitle: String(payload?.sceneTitle || "").trim() || null,
                      sceneLocation: String(payload?.sceneLocation || "").trim() || null,
                      payload,
                    },
                  };
                  onSelectArtifact?.(isSameArtifactSelection(activeArtifact, next) ? null : next);
                };
                const selectStoryboardMention = (mentionEntry) => {
                  if (!mentionEntry?.selectionType || !mentionEntry?.selectionId) return;
                  selectStoryboardTarget(
                    mentionEntry.selectionType,
                    mentionEntry.selectionId,
                    mentionEntry.selectionLabel || mentionEntry.term || "故事板片段",
                    mentionEntry.selectionSummary || "",
                    mentionEntry.payload || {},
                  );
                };
                const removeStoryboardEntity = (assetType, entityId) => {
                  const plan = node.data?.storyboard_plan || {};
                  const key = assetType === "characters" ? "characters" : "subjects";
                  updateData(node.id, {
                    storyboard_plan: {
                      ...plan,
                      entities: {
                        ...(plan.entities || {}),
                        [key]: ((plan.entities?.[key]) || []).filter((e) => String(e?.entity_id || "") !== entityId),
                      },
                    },
                  });
                };
                const removeStoryboardScene = (sceneId) => {
                  const plan = node.data?.storyboard_plan || {};
                  const sceneToRemove = (Array.isArray(plan.scenes) ? plan.scenes : []).find((s) => String(s?.scene_id || "") === sceneId);
                  const removedLocationName = stripStoryboardDisplayIds(String(sceneToRemove?.location || "").trim());
                  updateData(node.id, {
                    storyboard_plan: {
                      ...plan,
                      scenes: (Array.isArray(plan.scenes) ? plan.scenes : []).filter((s) => String(s?.scene_id || "") !== sceneId),
                      entities: {
                        ...(plan.entities || {}),
                        locations: ((plan.entities?.locations) || []).filter(
                          (loc) => !removedLocationName || stripStoryboardDisplayIds(String(loc?.name || "")) !== removedLocationName,
                        ),
                      },
                    },
                  });
                };
                const removeStoryboardShot = (sceneId, shotId) => {
                  const plan = node.data?.storyboard_plan || {};
                  updateData(node.id, {
                    storyboard_plan: {
                      ...plan,
                      scenes: (Array.isArray(plan.scenes) ? plan.scenes : []).map((s) =>
                        String(s?.scene_id || "") !== sceneId
                          ? s
                          : { ...s, shots: (Array.isArray(s.shots) ? s.shots : []).filter((sh) => String(sh?.shot_id || "") !== shotId) },
                      ),
                    },
                  });
                };
                const isStoryboardTargetActive = (selectionType, selectionId) =>
                  isSameArtifactSelection(activeArtifact, {
                    kind: "storyboard_selection",
                    fromNodeId: node.id,
                    meta: { selectionType, selectionId },
                  });
                return (
                  <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-[13px] font-semibold text-slate-900 break-words">
                    {String(node.data?.storyboard_plan?.title || node.data?.title || "Storyboard Plan").trim() || "Storyboard Plan"}
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-700">
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                      比例 {String(node.data?.storyboard_plan?.aspect_ratio || "16:9").trim() || "16:9"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                      风格 {String(node.data?.storyboard_plan?.style || "-").trim() || "-"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                      时长 {String(node.data?.storyboard_plan?.estimated_duration_sec || node.data?.storyboard_plan?.target_duration_sec || "-")}
                    </span>
                  </div>
                </div>
                <div className="rounded-full border border-violet-200 bg-white px-2 py-1 text-[10px] font-medium text-violet-700">
                  故事板
                </div>
              </div>

              {Array.isArray(node.data?.storyboard_plan?.warnings) && node.data.storyboard_plan.warnings.length > 0 ? (
                <div className="mt-3 rounded-[10px] border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-800">
                  {node.data.storyboard_plan.warnings.join(" | ")}
                </div>
              ) : null}

              {node.data?.workflow_mode === "storyboard_image_production" ? (
                <div className="mt-3 rounded-[12px] border border-cyan-200 bg-cyan-50/80 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-800">
                      <Sparkles className="h-3.5 w-3.5" />
                      分镜图生产工作流
                    </div>
                    <span className="rounded-full border border-cyan-200 bg-white px-2 py-0.5 text-[10px] text-cyan-700">已就绪</span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {(Array.isArray(node.data?.workflow_steps) ? node.data.workflow_steps : []).map((step, index) => {
                      const status = String(step?.status || "ready").trim();
                      const isDone = status === "success";
                      return (
                        <div key={step?.id || index} className="rounded-[9px] border border-white/70 bg-white px-2 py-1.5">
                          <div className="flex items-center gap-1 text-[10px] font-medium text-slate-700">
                            {isDone ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <ArrowRight className="h-3 w-3 text-cyan-500" />}
                            <span className="truncate">{String(step?.label || `步骤 ${index + 1}`).trim()}</span>
                          </div>
                          {step?.count ? <div className="mt-0.5 text-[9px] text-slate-400">{step.count} 项</div> : null}
                        </div>
                      );
                    })}
                  </div>
                  {String(node.data?.workflow_summary || "").trim() ? (
                    <div className="mt-2 text-[10px] leading-5 text-cyan-800/80">{String(node.data.workflow_summary).trim()}</div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 grid grid-cols-[240px_240px_minmax(0,1fr)] gap-3 items-start">
                <div className="min-h-0 rounded-[12px] border border-slate-200 bg-white p-2.5">
                  <div className="text-[11px] font-semibold text-slate-700">角色与主体设定</div>
                  <div className="custom-scrollbar mt-2 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                    {(() => {
                      const characters = Array.isArray(node.data?.storyboard_plan?.entities?.characters)
                        ? node.data.storyboard_plan.entities.characters
                        : [];
                      const subjects = Array.isArray(node.data?.storyboard_plan?.entities?.subjects)
                        ? node.data.storyboard_plan.entities.subjects
                        : [];
                      const items = [
                        ...characters.map((item) => ({ ...item, _sectionLabel: "角色" })),
                        ...subjects.map((item) => ({ ...item, _sectionLabel: "主体" })),
                      ];
                      const charBindings = Array.isArray(node.data?.storyboard_plan?.local_asset_bindings?.character_bindings)
                        ? node.data.storyboard_plan.local_asset_bindings.character_bindings
                        : [];
                      const bindingByEntityId = Object.fromEntries(
                        charBindings.map((cb) => [String(cb?.entity_id || ""), cb]).filter(([k]) => k),
                      );
                      if (!items.length) {
                        return (
                          <div className="rounded-[10px] border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-[11px] text-slate-500">
                            暂无角色与主体设定
                          </div>
                        );
                      }
                      return items.map((item, index) => {
                        const selectionId = String(item?.entity_id || `${item?._sectionLabel || "entity"}-${index}`).trim();
                        const isActive = isStoryboardTargetActive("entity", selectionId);
                        const binding = bindingByEntityId[selectionId] || null;
                        const threeViewUrl = String(binding?.three_view_url || "").trim();
                        const assetTypeKey = item?._sectionLabel === "角色" ? "characters" : "subjects";
                        return (
                          <div key={selectionId} className="group relative">
                            <button
                              type="button"
                              onClick={() =>
                                selectStoryboardTarget(
                                  "entity",
                                  selectionId,
                                  `${item?._sectionLabel || "设定"} · ${String(item?.name || "").trim() || `项目 ${index + 1}`}`,
                                  String(item?.core_description || item?.description || item?.story_function || "").trim(),
                                  {
                                    entityId: selectionId,
                                    entityName: String(item?.name || "").trim(),
                                    entityType: item?._sectionLabel || "设定",
                                    coreDescription: String(item?.core_description || item?.description || "").trim(),
                                    storyFunction: String(item?.story_function || "").trim(),
                                  },
                                )
                              }
                              className={`w-full rounded-[10px] border px-2.5 py-2 pr-7 text-left transition-colors ${
                                isActive
                                  ? "border-cyan-300 bg-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]"
                                  : "border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-[12px] font-semibold text-slate-800 break-words">
                                    {renderStoryboardMentionText(
                                      String(item?.name || "").trim() || `${item?._sectionLabel || "设定"} ${index + 1}`,
                                      storyboardMentionTerms,
                                      selectStoryboardMention,
                                      onStoryboardMentionHover,
                                      onStoryboardMentionLeave,
                                      node,
                                    )}
                                  </div>
                                </div>
                                {isActive ? <span className="shrink-0 text-[10px] text-cyan-700">已选中</span> : null}
                              </div>
                              {!threeViewUrl && String(item?.core_description || item?.description || "").trim() ? (
                                <div className="mt-1 text-[11px] leading-5 text-slate-700 break-words">
                                  {renderStoryboardMentionText(
                                    String(item.core_description || item.description).trim(),
                                    storyboardMentionTerms,
                                    selectStoryboardMention,
                                    onStoryboardMentionHover,
                                    onStoryboardMentionLeave,
                                    node,
                                  )}
                                </div>
                              ) : null}
                              {String(item?.story_function || "").trim() ? (
                                <div className="mt-1 text-[10px] leading-5 text-slate-500 break-words">
                                  作用: {String(item.story_function).trim()}
                                </div>
                              ) : null}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeStoryboardEntity(assetTypeKey, selectionId); }}
                              className="absolute right-1.5 top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-500 group-hover:flex"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                <div className="min-h-0 rounded-[12px] border border-slate-200 bg-white p-2.5">
                  <div className="text-[11px] font-semibold text-slate-700">场景设定</div>
                  <div className="custom-scrollbar mt-2 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                    {(() => {
                      const scenes = Array.isArray(node.data?.storyboard_plan?.scenes)
                        ? node.data.storyboard_plan.scenes
                        : [];
                      if (!scenes.length) {
                        return (
                          <div className="rounded-[10px] border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-[11px] text-slate-500">
                            暂无场景设定
                          </div>
                        );
                      }
                      const sceneBindings = Array.isArray(node.data?.storyboard_plan?.local_asset_bindings?.scene_bindings)
                        ? node.data.storyboard_plan.local_asset_bindings.scene_bindings : [];
                      return scenes.map((scene, index) => {
                        const selectionId = String(scene?.scene_id || `scene-setting-${index}`).trim();
                        const isActive = isStoryboardTargetActive("scene", selectionId);
                        const sceneDisplayName = stripStoryboardDisplayIds(scene?.location || scene?.title || "") || `场景 ${index + 1}`;
                        const matchedLocation = locationByName.get(String(scene?.location || "").trim());
                        const locationName = String(scene?.location || "").trim();
                        const sceneBinding = sceneBindings.find((sb) => matchesSceneBinding(sb, locationName)) || null;
                        const hasScenePreview = !!(sceneBinding && Array.isArray(sceneBinding.preview_urls) && sceneBinding.preview_urls.some(Boolean));
                        return (
                          <div key={selectionId} className="group relative">
                            <button
                              type="button"
                              onClick={() =>
                                selectStoryboardTarget(
                                  "scene",
                                  selectionId,
                                  `场景 ${scene?.scene_no || index + 1} · ${sceneDisplayName}`,
                                  String(scene?.scene_notes || scene?.summary || matchedLocation?.core_description || matchedLocation?.description || "").trim(),
                                  {
                                    sceneId: selectionId,
                                    sceneNo: scene?.scene_no || index + 1,
                                    sceneTitle: String(scene?.title || "").trim(),
                                    sceneLocation: String(scene?.location || "").trim(),
                                    sceneSummary: String(scene?.summary || "").trim(),
                                    sceneNotes: String(scene?.scene_notes || "").trim(),
                                    locationDescription: String(matchedLocation?.core_description || matchedLocation?.description || "").trim(),
                                  },
                                )
                              }
                              className={`w-full rounded-[10px] border px-2.5 py-2 pr-7 text-left transition-colors ${
                                isActive
                                  ? "border-cyan-300 bg-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]"
                                  : "border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white"
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold text-slate-800 break-words">
                                  <span>场景 {scene?.scene_no || index + 1} </span>
                                  {renderStoryboardMentionText(
                                    sceneDisplayName,
                                    storyboardMentionTerms,
                                    selectStoryboardMention,
                                    onStoryboardMentionHover,
                                    onStoryboardMentionLeave,
                                    node,
                                  )}
                                </div>
                              </div>
                              {!hasScenePreview && String(matchedLocation?.core_description || matchedLocation?.description || scene?.scene_notes || scene?.summary || "").trim() ? (
                                <div className="mt-2 rounded-[10px] border border-violet-100 bg-violet-50/70 px-2.5 py-2 text-[11px] leading-5 text-slate-700 break-words">
                                  {renderStoryboardMentionText(
                                    String(matchedLocation?.core_description || matchedLocation?.description || scene?.scene_notes || scene?.summary).trim(),
                                    storyboardMentionTerms,
                                    selectStoryboardMention,
                                    onStoryboardMentionHover,
                                    onStoryboardMentionLeave,
                                    node,
                                  )}
                                </div>
                              ) : null}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeStoryboardScene(selectionId); }}
                              className="absolute right-1.5 top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-500 group-hover:flex"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

              <div className="min-h-0 rounded-[12px] border border-slate-200 bg-white p-2.5">
                  <div className="text-[11px] font-semibold text-slate-700">镜头列表</div>
                <div className="custom-scrollbar mt-2 grid max-h-[520px] grid-cols-2 gap-2 overflow-y-auto pr-1">
                {Array.isArray(node.data?.storyboard_plan?.scenes) && node.data.storyboard_plan.scenes.length > 0 ? (
                  node.data.storyboard_plan.scenes.map((scene, sceneIndex) => (
                    <div key={scene?.scene_id || sceneIndex} className="rounded-[12px] border border-slate-200 bg-slate-50/60 p-2.5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
                      {(() => {
                        const sceneDisplayName = stripStoryboardDisplayIds(scene?.location || scene?.title || "") || `场景 ${sceneIndex + 1}`;
                        return (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold text-slate-800 break-words">
                            <span>场景 {scene?.scene_no || sceneIndex + 1} </span>
                            {renderStoryboardMentionText(
                              sceneDisplayName,
                              storyboardMentionTerms,
                              selectStoryboardMention,
                              onStoryboardMentionHover,
                              onStoryboardMentionLeave,
                              node,
                            )}
                          </div>
                        </div>
                      </div>
                        );
                      })()}

                      <div className="mt-2 space-y-2">
                        {(Array.isArray(scene?.shots) ? scene.shots : []).map((shot, shotIndex) => {
                          const selectionId = String(shot?.shot_id || `${scene?.scene_id || sceneIndex}-shot-${shotIndex}`).trim();
                          const isActive = isStoryboardTargetActive("shot", selectionId);
                          return (
                          <div key={selectionId} className="group relative">
                          <button
                            type="button"
                            onClick={() =>
                              selectStoryboardTarget(
                                "shot",
                                selectionId,
                                `镜头 ${shot?.shot_no || shotIndex + 1} · ${String(scene?.title || "").trim() || `场景 ${sceneIndex + 1}`}`,
                                String(shot?.visual_description || "").trim(),
                                {
                                  shotId: selectionId,
                                  shotNo: shot?.shot_no || shotIndex + 1,
                                  sceneId: String(scene?.scene_id || "").trim(),
                                  sceneTitle: String(scene?.title || "").trim(),
                                  sceneLocation: String(scene?.location || "").trim(),
                                  camera: String(shot?.camera || "").trim(),
                                  durationSec: shot?.duration_sec ?? null,
                                  visualDescription: String(shot?.visual_description || "").trim(),
                                  dialogues: Array.isArray(shot?.dialogues) ? shot.dialogues : [],
                                  voiceover: String(shot?.voiceover || "").trim(),
                                },
                              )
                            }
                            className={`w-full rounded-[10px] border px-2.5 py-2 pr-7 text-left transition-colors ${
                              isActive
                                ? "border-cyan-300 bg-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]"
                                : "border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onShotChipClick) onShotChipClick(node, scene, shot, e.currentTarget);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.stopPropagation();
                                      if (onShotChipClick) onShotChipClick(node, scene, shot, e.currentTarget);
                                    }
                                  }}
                                  className="inline-flex cursor-pointer items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 transition-colors bg-orange-50 text-orange-700 ring-orange-200 hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
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
                                      return <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500" />;
                                    }
                                    return null;
                                  })()}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                {String(shot?.camera || "").trim() ? <span>{String(shot.camera).trim()}</span> : null}
                                {shot?.duration_sec ? <span>{shot.duration_sec}s</span> : null}
                                {isActive ? <span className="text-cyan-700">已选中</span> : null}
                              </div>
                            </div>
                            <div className="mt-1 text-[11px] leading-5 text-slate-700 break-words">
                              {renderStoryboardMentionText(
                                String(shot?.visual_description || "").trim() || "暂无镜头描述",
                                storyboardMentionTerms,
                                selectStoryboardMention,
                                onStoryboardMentionHover,
                                onStoryboardMentionLeave,
                                node,
                              )}
                            </div>
                            {Array.isArray(shot?.dialogues) && shot.dialogues.length > 0 ? (
                              <div className="mt-1.5 space-y-0.5">
                                {shot.dialogues.map((d, di) => {
                                  const speaker = String(d?.speaker || "").trim();
                                  const line = String(d?.text || "").trim();
                                  if (!line) return null;
                                  return (
                                    <div key={di} className="text-[10px] leading-5 break-words">
                                      {speaker ? (
                                        <>
                                          <span className="font-medium text-slate-700">{speaker}：</span>
                                          <span className="text-slate-500">{line}</span>
                                        </>
                                      ) : (
                                        <span className="text-slate-500">"{line}"</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                            {String(shot?.voiceover || "").trim() ? (
                              <div className="mt-1 text-[10px] leading-5 text-slate-500 break-words">
                                <span>旁白: </span>
                                {renderStoryboardMentionText(
                                  String(shot.voiceover).trim(),
                                  storyboardMentionTerms,
                                  selectStoryboardMention,
                                  onStoryboardMentionHover,
                                  onStoryboardMentionLeave,
                                  node,
                                )}
                              </div>
                            ) : null}
                          </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeStoryboardShot(String(scene?.scene_id || ""), selectionId); }}
                              className="absolute right-1.5 top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-500 group-hover:flex"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )})}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 rounded-[12px] border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-[11px] text-slate-500">
                    暂无分镜场景
                  </div>
                )}
                </div>
              </div>
              </div>

              {(() => {
                const lab = node.data?.storyboard_plan?.local_asset_bindings;
                if (!lab) return null;
                const chars = Array.isArray(lab.character_bindings) ? lab.character_bindings : [];
                const scenes = Array.isArray(lab.scene_bindings) ? lab.scene_bindings : [];
                const missingChars = Array.isArray(lab.missing_characters) ? lab.missing_characters : [];
                const missingScenes = Array.isArray(lab.missing_scenes) ? lab.missing_scenes : [];
                const warnings = Array.isArray(lab.warnings) ? lab.warnings : [];
                if (!chars.length && !scenes.length && !missingChars.length && !missingScenes.length && !warnings.length) return null;
                return (
                  <div className="mt-3 rounded-[10px] border border-emerald-200 bg-emerald-50/60 px-2.5 py-2">
                    <div className="mb-1.5 text-[10px] font-semibold text-emerald-800">素材绑定</div>
                    {chars.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {chars.map((cb, i) => (
                          <span key={cb?.entity_id || i} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] text-slate-700">
                            <span className="font-medium">{String(cb?.character_name || "").trim()}</span>
                            <span title={cb?.three_view_url || undefined} className={cb?.three_view_url ? "text-emerald-600" : "text-slate-400"}>
                              三视图{cb?.three_view_url ? "✓" : "✗"}
                            </span>
                            <span title={cb?.voice_url || undefined} className={cb?.voice_url ? "text-emerald-600" : "text-slate-400"}>
                              音色{cb?.voice_url ? "✓" : "✗"}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                    {scenes.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {scenes.map((sb, i) => (
                          <span key={sb?.folder_name || i} title={sb?.folder_path || undefined} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] text-slate-700">
                            <span>{String(sb?.folder_name || "").trim()}</span>
                            <span className="text-blue-500">✓</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {(missingChars.length > 0 || missingScenes.length > 0) && (
                      <div className="mt-1.5 text-[10px] text-slate-500">
                        {missingChars.length > 0 && (
                          <span className="mr-2">角色缺失: {missingChars.join("、")}</span>
                        )}
                        {missingScenes.length > 0 && (
                          <span>场景缺失: {missingScenes.length} 项</span>
                        )}
                      </div>
                    )}
                    {warnings.length > 0 && (
                      <div className="mt-1.5 text-[10px] text-amber-700">⚠ {warnings.length} 项警告</div>
                    )}
                  </div>
                );
              })()}
                  </>
                );
              })()}
            </div>
          </div>
  );
}
