import React from "react";

const FIELD_LABEL_CLASS = "text-[11px] tracking-[0.12em] text-slate-500";
const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-300";
const CHIP_BASE_CLASS =
  "rounded-full border px-2.5 py-1 text-[11px] transition";

function ChipGroup({ options = [], value = "", onChange, multi = false }) {
  const selectedValues = multi ? new Set(Array.isArray(value) ? value : []) : new Set([value]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const selected = selectedValues.has(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => {
              if (multi) {
                const next = new Set(selectedValues);
                if (selected) next.delete(option);
                else next.add(option);
                onChange?.(Array.from(next));
                return;
              }
              onChange?.(selected ? "" : option);
            }}
            className={`${CHIP_BASE_CLASS} ${
              selected
                ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export default function ScriptBriefCard({
  draft = {},
  audienceOptions = [],
  priceBandOptions = [],
  conversionGoalOptions = [],
  platformOptions = [],
  onChange,
  onSubmit,
  onSubmitDefaults,
  onCancel,
  submitLabel = "开始生成",
}) {
  const handleChange = (key, value) => {
    onChange?.({ ...draft, [key]: value });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      <div className="space-y-1">
        <div className="text-sm font-medium text-slate-800">脚本设定</div>
        <div className="text-xs leading-5 text-slate-400">
          先锁定产品、人群、平台和目标，再开始生成，更接近增长运营场景。
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className={FIELD_LABEL_CLASS}>产品 / 服务</div>
          <input
            value={draft?.product || ""}
            onChange={(e) => handleChange("product", e.target.value)}
            placeholder="例如：洗面奶"
            className={INPUT_CLASS}
          />
        </div>
        <div className="space-y-1.5">
          <div className={FIELD_LABEL_CLASS}>目标人群</div>
          <input
            value={draft?.audience || ""}
            onChange={(e) => handleChange("audience", e.target.value)}
            placeholder="例如：油皮通勤女生"
            className={INPUT_CLASS}
          />
          {audienceOptions.length > 0 ? (
            <ChipGroup
              options={audienceOptions}
              value={draft?.audience || ""}
              onChange={(value) => handleChange("audience", value)}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className={FIELD_LABEL_CLASS}>价格带</div>
          <ChipGroup
            options={priceBandOptions}
            value={draft?.priceBand || ""}
            onChange={(value) => handleChange("priceBand", value)}
          />
        </div>
        <div className="space-y-1.5">
          <div className={FIELD_LABEL_CLASS}>转化目标</div>
          <ChipGroup
            options={conversionGoalOptions}
            value={draft?.conversionGoal || ""}
            onChange={(value) => handleChange("conversionGoal", value)}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className={FIELD_LABEL_CLASS}>主平台</div>
          <ChipGroup
            options={platformOptions}
            value={draft?.primaryPlatform || ""}
            onChange={(value) => handleChange("primaryPlatform", value)}
          />
        </div>
        <div className="space-y-1.5">
          <div className={FIELD_LABEL_CLASS}>次平台</div>
          <ChipGroup
            options={["不设置", ...platformOptions.filter((item) => item !== draft?.primaryPlatform)]}
            value={draft?.secondaryPlatform ? draft.secondaryPlatform : "不设置"}
            onChange={(value) => handleChange("secondaryPlatform", value === "不设置" ? "" : value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSubmit?.()}
          className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs text-cyan-700 hover:bg-cyan-100"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={() => onSubmitDefaults?.()}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:text-slate-900"
        >
          先用默认值
        </button>
        <button
          type="button"
          onClick={() => onCancel?.()}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-900"
        >
          取消
        </button>
      </div>
    </div>
  );
}
