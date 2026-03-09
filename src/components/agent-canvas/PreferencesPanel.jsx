import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Eraser,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  deactivatePreference,
  expirePreferences,
  listPreferences,
  setPreference,
} from "../../api/memoryPreferences";
import { notifyApp } from "../../lib/notify";
import {
  PREFERENCE_FIELDS,
  HOT_KEYS,
  DEFAULT_PREFS,
  QUICK_TEMPLATES,
  asArray,
  normalizeImportedProfile,
  countActivePreferences,
  buildClearablePreferenceKeys,
} from "./preferencesPanelUtils";

const SAMPLE_PROMPT = "帮我用小红书语气设计洗面奶爆款脚本";
const PROFILE_STORAGE_KEY = "bananaflow_preference_profiles_v1";

const parseHistory = (record) => {
  const raw = record?.value_history_json ?? record?.value_history;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((item) => item && typeof item === "object").slice(-10);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => item && typeof item === "object").slice(-10);
      }
    } catch {
      return [];
    }
  }
  return [];
};

const displayValue = (value) => {
  if (Array.isArray(value)) return value.join(" / ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value || "");
};

const readProfiles = () => {
  try {
    const text = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!text) return [];
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object" && item.values && typeof item.values === "object")
      .slice(0, 20);
  } catch {
    return [];
  }
};

const writeProfiles = (profiles) => {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify((profiles || []).slice(0, 20)));
  } catch {
    // ignore localStorage failure
  }
};


function PreferenceFieldCard({
  field,
  record,
  draftValue,
  confidence,
  ttlDays,
  pending,
  loading,
  highlighted,
  focused,
  onDraftChange,
  onConfidenceChange,
  onTtlChange,
  onSave,
  onDeactivate,
}) {
  const historyItems = useMemo(() => parseHistory(record), [record]);
  const isActive = record?.is_active !== false;
  const currentValues = asArray(record?.value);

  return (
    <div
      className={`rounded-lg border p-3 space-y-3 transition-colors ${
        focused
          ? "border-cyan-500 bg-cyan-950/15"
          : highlighted
          ? "border-indigo-700/70 bg-indigo-950/10"
          : "border-slate-700 bg-slate-900/80"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm text-slate-100 font-semibold">{field.label}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">key: {field.key}</div>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border ${
            isActive
              ? "text-emerald-200 border-emerald-700/70 bg-emerald-900/20"
              : "text-slate-300 border-slate-700 bg-slate-800"
          }`}
        >
          {isActive ? "生效中" : "已停用"}
        </span>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] text-slate-400">当前值</div>
        {currentValues.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {currentValues.map((item) => (
              <span
                key={`${field.key}_current_${item}`}
                className="px-2 py-0.5 rounded-full text-[11px] border border-cyan-600/70 bg-cyan-500/10 text-cyan-100"
              >
                {item}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-slate-500">未设置</div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[11px] text-slate-400">编辑</div>
        <div className="flex flex-wrap gap-1.5">
          {field.options.map((option) => {
            const selected =
              field.type === "multi"
                ? asArray(draftValue).includes(option)
                : String(draftValue || "") === option;
            return (
              <button
                key={`${field.key}_${option}`}
                type="button"
                disabled={pending || loading}
                onClick={() => {
                  if (field.type === "single") {
                    onDraftChange(option);
                    return;
                  }
                  const current = asArray(draftValue);
                  if (current.includes(option)) {
                    onDraftChange(current.filter((item) => item !== option));
                  } else {
                    onDraftChange([...current, option]);
                  }
                }}
                className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
                  selected
                    ? "border-cyan-500 bg-cyan-500/20 text-cyan-100"
                    : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
                } ${pending || loading ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-slate-400 space-y-1">
          <span>置信度 (0~1)</span>
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={confidence}
            onChange={(e) => onConfidenceChange(e.target.value)}
            disabled={pending || loading}
            placeholder="0.90"
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-cyan-500"
          />
        </label>
        <label className="text-[11px] text-slate-400 space-y-1">
          <span>TTL 天数 (可选)</span>
          <input
            type="number"
            min="1"
            step="1"
            value={ttlDays}
            onChange={(e) => onTtlChange(e.target.value)}
            disabled={pending || loading}
            placeholder="7"
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-cyan-500"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-400">
        <div>confidence: {record?.confidence ?? "-"}</div>
        <div>update_count: {record?.update_count ?? "-"}</div>
        <div>last_confirmed_at: {record?.last_confirmed_at || "-"}</div>
        <div>ttl_at: {record?.ttl_at || "-"}</div>
      </div>

      {historyItems.length > 0 && (
        <details className="rounded border border-slate-700 bg-slate-950/70 p-2">
          <summary className="text-[11px] text-slate-300 cursor-pointer">历史记录 ({historyItems.length})</summary>
          <div className="mt-1.5 space-y-1.5">
            {historyItems
              .slice(-10)
              .reverse()
              .map((entry, idx) => (
                <div key={`${field.key}_history_${idx}`} className="text-[10px] text-slate-400 border-b border-slate-800 pb-1">
                  <div>{entry?.ts || "-"}</div>
                  <div>
                    {displayValue(entry?.old_value)} → {displayValue(entry?.new_value)} ({entry?.reason || "-"})
                  </div>
                </div>
              ))}
          </div>
        </details>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={pending || loading}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border ${
            pending || loading
              ? "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed"
              : "bg-cyan-600/20 border-cyan-500/60 text-cyan-100 hover:bg-cyan-600/30"
          }`}
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          保存
        </button>
        <button
          type="button"
          onClick={onDeactivate}
          disabled={pending || loading}
          className={`px-3 py-1.5 rounded text-xs border ${
            pending || loading
              ? "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed"
              : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
          }`}
        >
          停用
        </button>
      </div>
    </div>
  );
}

export default function PreferencesPanel({
  open,
  onClose,
  apiFetch,
  onQuickExample,
  onPreferenceSaved,
  prefill = null,
}) {
  const [loading, setLoading] = useState(false);
  const [pendingKey, setPendingKey] = useState("");
  const [bulkPending, setBulkPending] = useState(false);
  const [expiring, setExpiring] = useState(false);
  const [importingProfile, setImportingProfile] = useState(false);
  const [preferencesByKey, setPreferencesByKey] = useState({});
  const [draftByKey, setDraftByKey] = useState({});
  const [confidenceByKey, setConfidenceByKey] = useState({});
  const [ttlDaysByKey, setTtlDaysByKey] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [contextUsage, setContextUsage] = useState(null);
  const [showQuickTemplates, setShowQuickTemplates] = useState(false);
  const [profiles, setProfiles] = useState(() => readProfiles());
  const [profileName, setProfileName] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [focusedKey, setFocusedKey] = useState("");
  const importRef = useRef(null);

  const applyDraftsFromRecords = useCallback((recordsByKey) => {
    const nextDrafts = {};
    const nextConfidence = {};
    const nextTtl = {};
    for (const field of PREFERENCE_FIELDS) {
      const record = recordsByKey[field.key];
      if (field.type === "multi") {
        nextDrafts[field.key] = asArray(record?.value);
      } else {
        nextDrafts[field.key] = String(record?.value || "");
      }
      nextConfidence[field.key] =
        record?.confidence !== undefined && record?.confidence !== null ? String(record.confidence) : "0.9";
      nextTtl[field.key] = "";
    }
    setDraftByKey(nextDrafts);
    setConfidenceByKey(nextConfidence);
    setTtlDaysByKey(nextTtl);
  }, []);

  const emitPreferenceSaved = useCallback(
    (payload) => {
      if (typeof onPreferenceSaved === "function") {
        onPreferenceSaved(payload);
      }
    },
    [onPreferenceSaved],
  );

  const orderedFields = useMemo(() => {
    return [...PREFERENCE_FIELDS].sort((a, b) => {
      const aHot = HOT_KEYS.has(a.key) ? 0 : 1;
      const bHot = HOT_KEYS.has(b.key) ? 0 : 1;
      return aHot - bHot;
    });
  }, []);

  const activePreferenceCount = useMemo(() => {
    return countActivePreferences(preferencesByKey);
  }, [preferencesByKey]);

  const loadPreferences = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setFeedback(null);
    try {
      const { preferences, meta } = await listPreferences(apiFetch);
      const mapped = {};
      for (const item of preferences) {
        const key = String(item?.key || "").trim();
        if (!key) continue;
        mapped[key] = item;
      }
      setPreferencesByKey(mapped);
      applyDraftsFromRecords(mapped);
      const usageFlag =
        meta?.memory_pref_used ??
        meta?.preferences_used_in_context ??
        meta?.context_preferences_used ??
        null;
      setContextUsage(typeof usageFlag === "boolean" ? usageFlag : null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载偏好失败";
      setFeedback({ type: "error", message });
      notifyApp({ type: "error", message });
    } finally {
      setLoading(false);
    }
  }, [apiFetch, applyDraftsFromRecords, open]);

  useEffect(() => {
    if (!open) return;
    setProfiles(readProfiles());
    void loadPreferences();
  }, [open, loadPreferences]);

  useEffect(() => {
    if (!open || !prefill || !prefill.key) return;
    if (loading) return;
    const key = String(prefill.key || "").trim();
    if (!key) return;
    const nextValue = Array.isArray(prefill.value)
      ? prefill.value.map((item) => String(item || "").trim()).filter(Boolean)
      : String(prefill.value || "").trim();
    if (!nextValue || (Array.isArray(nextValue) && nextValue.length === 0)) return;
    setDraftByKey((prev) => ({ ...prev, [key]: nextValue }));
    setFocusedKey(key);
    if (prefill.confidence !== undefined && prefill.confidence !== null && prefill.confidence !== "") {
      setConfidenceByKey((prev) => ({ ...prev, [key]: String(prefill.confidence) }));
    }
    if (prefill.ttl_days !== undefined && prefill.ttl_days !== null && prefill.ttl_days !== "") {
      setTtlDaysByKey((prev) => ({ ...prev, [key]: String(prefill.ttl_days) }));
    }
  }, [loading, open, prefill]);

  useEffect(() => {
    if (!open) return;
    if (!focusedKey && prefill?.key) {
      setFocusedKey(String(prefill.key || ""));
    }
  }, [focusedKey, open, prefill?.key]);

  if (!open) return null;

  const updateDraftValue = (key, nextValue) => {
    setFocusedKey(key);
    setDraftByKey((prev) => ({ ...prev, [key]: nextValue }));
  };

  const getDraftSnapshot = () => {
    const values = {};
    for (const field of PREFERENCE_FIELDS) {
      if (field.type === "multi") {
        const next = asArray(draftByKey[field.key]);
        if (next.length > 0) values[field.key] = next;
        continue;
      }
      const next = String(draftByKey[field.key] || "").trim();
      if (next) values[field.key] = next;
    }
    return values;
  };

  const saveSinglePreference = async (field) => {
    const key = field.key;
    const draftValue = draftByKey[key];
    const normalizedValue = field.type === "multi" ? asArray(draftValue) : String(draftValue || "").trim();
    if (field.type === "single" && !normalizedValue) {
      const message = `请先为 ${field.label} 选择一个值`;
      setFeedback({ type: "error", message });
      notifyApp({ type: "warning", message });
      return;
    }

    setPendingKey(key);
    setFeedback(null);
    try {
      const confidenceRaw = String(confidenceByKey[key] || "").trim();
      const ttlRaw = String(ttlDaysByKey[key] || "").trim();
      const payload = { key, value: normalizedValue };
      if (confidenceRaw) payload.confidence = confidenceRaw;
      if (ttlRaw) payload.ttl_days = ttlRaw;
      const memory = await setPreference(apiFetch, payload);
      await loadPreferences();
      const message = `${field.label} 已保存`;
      setFeedback({ type: "success", message });
      notifyApp({ type: "success", message });
      emitPreferenceSaved({ key, value: normalizedValue, memory });
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      setFeedback({ type: "error", message });
      notifyApp({ type: "error", message });
    } finally {
      setPendingKey("");
    }
  };

  const applyValues = async (values, messagePrefix = "偏好") => {
    const entries = Object.entries(values || {});
    if (entries.length === 0) {
      const message = "没有可应用的偏好值";
      setFeedback({ type: "error", message });
      notifyApp({ type: "warning", message });
      return;
    }
    setBulkPending(true);
    setFeedback(null);
    try {
      for (const [key, value] of entries) {
        await setPreference(apiFetch, {
          key,
          value,
          confidence: confidenceByKey[key] || 0.9,
        });
      }
      await loadPreferences();
      const message = `${messagePrefix} 已应用 (${entries.length})`;
      setFeedback({ type: "success", message });
      notifyApp({ type: "success", message });
      emitPreferenceSaved({ key: entries[0][0], value: entries[0][1] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "批量保存失败";
      setFeedback({ type: "error", message });
      notifyApp({ type: "error", message });
    } finally {
      setBulkPending(false);
    }
  };

  const handleSave = async (field) => {
    await saveSinglePreference(field);
  };

  const handleDeactivate = async (field) => {
    setPendingKey(field.key);
    setFeedback(null);
    try {
      await deactivatePreference(apiFetch, field.key);
      await loadPreferences();
      const message = `${field.label} 已停用`;
      setFeedback({ type: "success", message });
      notifyApp({ type: "success", message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "停用失败";
      setFeedback({ type: "error", message });
      notifyApp({ type: "error", message });
    } finally {
      setPendingKey("");
    }
  };

  const handleExpire = async () => {
    setExpiring(true);
    setFeedback(null);
    try {
      const data = await expirePreferences(apiFetch);
      await loadPreferences();
      const message = `清理完成，过期 ${Number(data?.expired_count || 0)} 条偏好`;
      setFeedback({ type: "success", message });
      notifyApp({ type: "success", message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "清理失败";
      setFeedback({ type: "error", message });
      notifyApp({ type: "error", message });
    } finally {
      setExpiring(false);
    }
  };

  const handleClearAll = async () => {
    const keys = buildClearablePreferenceKeys(preferencesByKey);
    if (keys.length === 0) {
      const message = "当前没有生效偏好可清除";
      setFeedback({ type: "success", message });
      notifyApp({ type: "info", message });
      return;
    }
    setBulkPending(true);
    setFeedback(null);
    try {
      for (const key of keys) {
        await deactivatePreference(apiFetch, key);
      }
      await loadPreferences();
      const message = `已清除 ${keys.length} 条偏好`;
      setFeedback({ type: "success", message });
      notifyApp({ type: "success", message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "清除偏好失败";
      setFeedback({ type: "error", message });
      notifyApp({ type: "error", message });
    } finally {
      setBulkPending(false);
    }
  };

  const handleResetDefaults = async () => {
    await applyValues(DEFAULT_PREFS, "默认偏好");
  };

  const handleApplyTemplate = async (template) => {
    if (!template?.values) return;
    await applyValues(template.values, `快速设置「${template.label}」`);
  };

  const handleSaveProfile = () => {
    const values = getDraftSnapshot();
    if (Object.keys(values).length === 0) {
      const message = "当前没有可保存的偏好草稿";
      setFeedback({ type: "error", message });
      notifyApp({ type: "warning", message });
      return;
    }
    const nextProfile = {
      id: `profile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: String(profileName || `偏好档案-${profiles.length + 1}`).slice(0, 40),
      values,
      created_at: new Date().toISOString(),
    };
    const next = [nextProfile, ...profiles].slice(0, 20);
    setProfiles(next);
    writeProfiles(next);
    setSelectedProfileId(nextProfile.id);
    setProfileName("");
    const message = `档案已保存：${nextProfile.name}`;
    setFeedback({ type: "success", message });
    notifyApp({ type: "success", message });
  };

  const handleApplyProfile = async () => {
    const selected = profiles.find((item) => item.id === selectedProfileId);
    if (!selected) {
      const message = "请先选择一个档案";
      setFeedback({ type: "error", message });
      notifyApp({ type: "warning", message });
      return;
    }
    await applyValues(selected.values, `档案「${selected.name}」`);
  };

  const handleExportProfile = () => {
    const selected = profiles.find((item) => item.id === selectedProfileId);
    const profile =
      selected || {
        id: `profile_export_${Date.now()}`,
        name: "当前偏好草稿",
        values: getDraftSnapshot(),
        created_at: new Date().toISOString(),
      };
    if (Object.keys(profile.values || {}).length === 0) {
      const message = "没有可导出的偏好";
      setFeedback({ type: "error", message });
      notifyApp({ type: "warning", message });
      return;
    }
    const blob = new Blob([JSON.stringify(profile, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${profile.name || "preference_profile"}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    const message = "档案已导出";
    setFeedback({ type: "success", message });
    notifyApp({ type: "success", message });
  };

  const handleImportProfile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportingProfile(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const profile = normalizeImportedProfile(parsed);
      if (!profile) {
        throw new Error("档案内容无效");
      }
      const next = [profile, ...profiles].slice(0, 20);
      setProfiles(next);
      writeProfiles(next);
      setSelectedProfileId(profile.id);
      await applyValues(profile.values, `导入档案「${profile.name}」`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入档案失败";
      setFeedback({ type: "error", message });
      notifyApp({ type: "error", message });
    } finally {
      setImportingProfile(false);
    }
  };

  const commonPlatformField = PREFERENCE_FIELDS.find((item) => item.key === "platform");
  const commonToneField = PREFERENCE_FIELDS.find((item) => item.key === "tone");

  return (
    <div className="fixed inset-0 z-[120] pointer-events-none">
      <aside
        className="absolute right-0 top-0 h-full w-[min(94vw,560px)] border-l border-slate-700 bg-slate-900 text-white shadow-2xl flex flex-col pointer-events-auto"
      >
        <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">偏好设置</div>
            <div className="text-[10px] text-slate-500 mt-0.5">当前偏好将影响脚本/分镜/素材匹配的默认风格</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
            aria-label="关闭偏好设置"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="text-xs text-slate-200">当前设置偏好：{activePreferenceCount}</div>
          <div className="text-[10px] text-slate-500">常用：平台 / 语气</div>
        </div>

        <div className="px-4 py-3 border-b border-slate-800 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                const text = SAMPLE_PROMPT;
                if (typeof onQuickExample === "function") onQuickExample(text);
                const message = "已插入快速示例到输入框";
                setFeedback({ type: "success", message });
                notifyApp({ type: "info", message });
              }}
              className="px-2.5 py-1 rounded border border-cyan-700/70 bg-cyan-500/10 text-cyan-100 text-xs hover:bg-cyan-500/20"
            >
              快速示例
            </button>
            <button
              type="button"
              onClick={() => setShowQuickTemplates((prev) => !prev)}
              disabled={loading || bulkPending}
              className="px-2.5 py-1 rounded border border-indigo-700/70 bg-indigo-500/10 text-indigo-100 text-xs hover:bg-indigo-500/20 disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3 inline mr-1" />
              快速设置
            </button>
            <button
              type="button"
              onClick={handleResetDefaults}
              disabled={loading || bulkPending}
              className="px-2.5 py-1 rounded border border-slate-700 bg-slate-950 text-slate-200 text-xs hover:bg-slate-800 disabled:opacity-50"
            >
              重置默认
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              disabled={loading || bulkPending}
              className="px-2.5 py-1 rounded border border-red-700/70 bg-red-500/10 text-red-100 text-xs hover:bg-red-500/20 disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3 inline mr-1" />
              清除所有偏好
            </button>
          </div>

          {showQuickTemplates && (
            <div className="rounded border border-indigo-700/40 bg-indigo-950/20 p-2 space-y-1.5">
              {QUICK_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  disabled={loading || bulkPending}
                  onClick={() => void handleApplyTemplate(template)}
                  className="w-full text-left px-2 py-1.5 rounded border border-slate-700 bg-slate-950/80 hover:bg-slate-900 disabled:opacity-50"
                >
                  <div className="text-[11px] text-indigo-100">{template.label}</div>
                  <div className="text-[10px] text-slate-400">{template.description}</div>
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="rounded border border-slate-700 bg-slate-950/70 p-2 space-y-1.5">
              <div className="text-[11px] text-slate-300">常用快速选择 · 平台</div>
              <div className="flex flex-wrap gap-1">
                {commonPlatformField?.options.map((option) => (
                  <button
                    key={`common_platform_${option}`}
                    type="button"
                    onClick={() => {
                      setFocusedKey("platform");
                      setDraftByKey((prev) => ({ ...prev, platform: option }));
                    }}
                    className={`px-2 py-0.5 rounded-full text-[10px] border ${
                      String(draftByKey.platform || "") === option
                        ? "border-cyan-500 bg-cyan-500/20 text-cyan-100"
                        : "border-slate-700 text-slate-300"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void saveSinglePreference(commonPlatformField)}
                disabled={loading || bulkPending || pendingKey === "platform"}
                className="px-2 py-1 rounded border border-cyan-500/60 bg-cyan-600/15 text-cyan-100 text-[10px] disabled:opacity-50"
              >
                保存平台
              </button>
            </div>

            <div className="rounded border border-slate-700 bg-slate-950/70 p-2 space-y-1.5">
              <div className="text-[11px] text-slate-300">常用快速选择 · 语气</div>
              <div className="flex flex-wrap gap-1">
                {commonToneField?.options.map((option) => (
                  <button
                    key={`common_tone_${option}`}
                    type="button"
                    onClick={() => {
                      setFocusedKey("tone");
                      setDraftByKey((prev) => {
                        const current = asArray(prev.tone);
                        const next = current.includes(option)
                          ? current.filter((item) => item !== option)
                          : [...current, option];
                        return { ...prev, tone: next };
                      });
                    }}
                    className={`px-2 py-0.5 rounded-full text-[10px] border ${
                      asArray(draftByKey.tone).includes(option)
                        ? "border-cyan-500 bg-cyan-500/20 text-cyan-100"
                        : "border-slate-700 text-slate-300"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void saveSinglePreference(commonToneField)}
                disabled={loading || bulkPending || pendingKey === "tone"}
                className="px-2 py-1 rounded border border-cyan-500/60 bg-cyan-600/15 text-cyan-100 text-[10px] disabled:opacity-50"
              >
                保存语气
              </button>
            </div>
          </div>

          <div className="rounded border border-slate-700 bg-slate-950/60 p-2 space-y-2">
            <div className="text-[11px] text-slate-300">自定义档案</div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="档案名（可选）"
                className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={loading || bulkPending}
                className="px-2 py-1 rounded border border-slate-700 text-[11px] text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                保存档案
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 outline-none"
              >
                <option value="">选择档案</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleApplyProfile()}
                disabled={loading || bulkPending || !selectedProfileId}
                className="px-2 py-1 rounded border border-cyan-500/60 bg-cyan-600/15 text-[11px] text-cyan-100 disabled:opacity-50"
              >
                应用
              </button>
              <button
                type="button"
                onClick={handleExportProfile}
                disabled={loading || bulkPending}
                className="px-2 py-1 rounded border border-slate-700 text-[11px] text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                <Download className="w-3 h-3 inline mr-1" />
                导出
              </button>
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                disabled={loading || bulkPending || importingProfile}
                className="px-2 py-1 rounded border border-slate-700 text-[11px] text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                <Upload className="w-3 h-3 inline mr-1" />
                导入
              </button>
              <input
                ref={importRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => void handleImportProfile(e)}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExpire}
              disabled={expiring || loading || bulkPending}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs ${
                expiring || loading || bulkPending
                  ? "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed"
                  : "bg-slate-950 text-slate-200 border-slate-700 hover:bg-slate-800"
              }`}
            >
              {expiring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              清理过期偏好
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              disabled={loading || bulkPending}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              <Eraser className="w-3.5 h-3.5" />
              清空生效项
            </button>
          </div>
        </div>

        {contextUsage !== null && (
          <div className="px-4 py-2 border-b border-slate-800 text-[11px] text-slate-300">
            偏好注入上下文：{contextUsage ? "已启用" : "未启用"}
          </div>
        )}

        {feedback && (
          <div
            className={`mx-4 mt-3 rounded border px-3 py-2 text-xs ${
              feedback.type === "error"
                ? "border-red-700/80 bg-red-900/20 text-red-200"
                : "border-emerald-700/80 bg-emerald-900/20 text-emerald-100"
            }`}
          >
            {feedback.message}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="h-full min-h-[180px] flex items-center justify-center text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              加载偏好中...
            </div>
          ) : (
            orderedFields.map((field) => (
              <PreferenceFieldCard
                key={field.key}
                field={field}
                record={preferencesByKey[field.key]}
                draftValue={draftByKey[field.key]}
                confidence={confidenceByKey[field.key] ?? ""}
                ttlDays={ttlDaysByKey[field.key] ?? ""}
                pending={pendingKey === field.key || bulkPending || importingProfile}
                loading={loading}
                highlighted={HOT_KEYS.has(field.key)}
                focused={focusedKey === field.key}
                onDraftChange={(nextValue) => updateDraftValue(field.key, nextValue)}
                onConfidenceChange={(nextValue) =>
                  setConfidenceByKey((prev) => ({ ...prev, [field.key]: nextValue }))
                }
                onTtlChange={(nextValue) => setTtlDaysByKey((prev) => ({ ...prev, [field.key]: nextValue }))}
                onSave={() => void handleSave(field)}
                onDeactivate={() => void handleDeactivate(field)}
              />
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
