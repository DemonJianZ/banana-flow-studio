import { useCallback } from "react";
import { aiChatAnchor, AI_CHAT_ANCHOR_OPERATE_ENUM_1, isLoginRequiredError } from "../api/aiChat";

export function useWorkbenchAnchorActions({ apiFetch, pushApiDebugDetail, updateApiDebugStatus }) {
  const triggerAIChatAnchor = useCallback(
    async ({ partEnum, modelId = 1, from, to, debugLabel }) => {
      const rawModelId = String(modelId ?? "").trim();
      const numericModelId = Number(rawModelId);
      const resolvedModelId = Number.isFinite(numericModelId) && numericModelId > 0 ? numericModelId : 1;
      const payload = {
        part_enum: Number(partEnum),
        operate_enum: AI_CHAT_ANCHOR_OPERATE_ENUM_1,
        ai_chat_model_id: resolvedModelId,
        from: String(from || window.location.pathname || "/app"),
        to: String(to || ""),
      };

      updateApiDebugStatus("aiChatAnchor", {
        status: "loading",
        message: `POST /ai/aiChatAnchor part=${payload.part_enum}`,
      });

      try {
        const data = await aiChatAnchor(apiFetch, payload, {
          onDebug: (event) => pushApiDebugDetail("aiChatAnchor", event),
        });
        updateApiDebugStatus("aiChatAnchor", {
          status: "success",
          message: `${debugLabel || payload.to || payload.part_enum} 已上报`,
        });
        return data;
      } catch (error) {
        updateApiDebugStatus("aiChatAnchor", {
          status: isLoginRequiredError(error) ? "login_required" : "error",
          message: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
    [apiFetch, pushApiDebugDetail, updateApiDebugStatus],
  );

  const handleAnchorActionClick = useCallback(
    ({ partEnum, modelId, to, debugLabel, action }) => {
      void triggerAIChatAnchor({
        partEnum,
        modelId,
        to,
        debugLabel,
      });
      action?.();
    },
    [triggerAIChatAnchor],
  );

  return { handleAnchorActionClick, triggerAIChatAnchor };
}
