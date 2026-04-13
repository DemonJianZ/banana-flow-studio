import React from "react";

const SECTION_CLASS = "space-y-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left shadow-[0_12px_28px_rgba(15,23,42,0.06)]";

function SectionTitle({ children }) {
  return <div className="text-[11px] tracking-[0.12em] text-slate-500">{children}</div>;
}

function InfoBlock({ label, value }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <div className="text-[11px] tracking-[0.12em] text-slate-500">{label}</div>
      <div className="text-sm leading-6 text-slate-700 whitespace-pre-wrap break-words">{value}</div>
    </div>
  );
}

function getPlatformPlan(platform, brief = {}) {
  return {
    platform,
    goal: brief?.conversionGoal || "",
    format: "",
    cta: brief?.conversionGoal || "",
  };
}

function parseScriptSections(scriptText = "") {
  const text = String(scriptText || "").trim();
  if (!text) return {};
  const sections = {};
  const regex = /\[(HOOK|VIEW|STEPS|PRODUCT|CTA)\]\s*([\s\S]*?)(?=\[(?:HOOK|VIEW|STEPS|PRODUCT|CTA)\]|$)/g;
  let match = regex.exec(text);
  while (match) {
    sections[match[1]] = String(match[2] || "").trim();
    match = regex.exec(text);
  }
  return sections;
}

function buildRiskNotes(topic, brief) {
  const combined = `${topic?.title || ""}\n${topic?.hook || ""}\n${topic?.script_60s || ""}`;
  const notes = [];
  if (/(治疗|治愈|药效|根治|保证|永久|100%|立刻见效)/i.test(combined)) {
    notes.push("避免绝对化、保证式或医疗化表述。");
  }
  if (!notes.length) {
    notes.push("保持真实体验表达，避免夸大和不具备证据的承诺。");
  }
  return notes;
}

export default function ScriptExecutionPlan({ brief = {}, topics = [], response = null }) {
  const structuredPlan = response?.platform_plan || {};
  const structuredCopyPack = response?.copy_pack || {};
  const structuredBrowserFields = response?.browser_ready_fields || {};
  const structuredRisks = Array.isArray(response?.risks_and_blockers) ? response.risks_and_blockers : [];
  const structuredKpis = Array.isArray(response?.kpi_checklist) ? response.kpi_checklist : [];
  const structuredNextActions = Array.isArray(response?.next_actions) ? response.next_actions : [];
  const selectedAngle = response?.selected_topic_angle || brief?.selectedAngle || "";
  const selectedTopic =
    topics.find((item) => item?.angle === selectedAngle) ||
    topics.find((item) => item?.title === response?.selected_topic_title) ||
    null;
  if (!selectedTopic) {
    return (
      <div className={SECTION_CLASS}>
        <SectionTitle>继续推进</SectionTitle>
        <div className="text-sm leading-6 text-slate-600">
          先从上面的 3 个主题里选择一个“主打角度”，再继续生成平台计划和内容包。
        </div>
      </div>
    );
  }

  const sections = parseScriptSections(selectedTopic?.script_60s || "");
  const primaryPlan = structuredPlan?.primary?.platform ? structuredPlan.primary : getPlatformPlan(brief?.primaryPlatform, brief);
  const secondaryPlan = structuredPlan?.secondary?.platform
    ? structuredPlan.secondary
    : (brief?.secondaryPlatform ? getPlatformPlan(brief.secondaryPlatform, brief) : null);
  const riskNotes = structuredRisks.length > 0 ? structuredRisks : buildRiskNotes(selectedTopic, brief);
  const nextActions = structuredNextActions.length > 0 ? structuredNextActions : [];
  const kpiChecklist = structuredKpis.length > 0 ? structuredKpis : ["浏览量", "点击率", "收藏/保存", "咨询数", "加购", "下单", "退款信号"];

  return (
    <div className="space-y-2">
      <div className={SECTION_CLASS}>
        <SectionTitle>主打方案</SectionTitle>
        <InfoBlock
          label="选定角度"
          value={`${selectedTopic?.angle || structuredPlan?.selected_angle_label || "主题"} · ${structuredCopyPack?.title || selectedTopic?.title || "-"}`}
        />
        <InfoBlock label="开头钩子" value={structuredCopyPack?.hook || selectedTopic?.hook || sections.HOOK || ""} />
        <InfoBlock label="核心说明" value={structuredCopyPack?.caption || sections.VIEW || ""} />
        <InfoBlock label="行动引导" value={sections.CTA || structuredBrowserFields?.cta_text || brief?.conversionGoal || ""} />
      </div>

      <div className={SECTION_CLASS}>
        <SectionTitle>平台计划</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-sm font-medium text-slate-800">{brief?.primaryPlatform || "主平台"}</div>
            <InfoBlock label="目标" value={primaryPlan.goal} />
            <InfoBlock label="内容形式" value={primaryPlan.format} />
            <InfoBlock label="推荐引导" value={primaryPlan.cta} />
          </div>
          {secondaryPlan ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-sm font-medium text-slate-800">{brief?.secondaryPlatform}</div>
              <InfoBlock label="目标" value={secondaryPlan.goal} />
              <InfoBlock label="内容形式" value={secondaryPlan.format} />
              <InfoBlock label="推荐引导" value={secondaryPlan.cta} />
            </div>
          ) : null}
        </div>
      </div>

      <div className={SECTION_CLASS}>
        <SectionTitle>内容包</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <InfoBlock label="标题" value={structuredCopyPack?.title || selectedTopic?.title || ""} />
          <InfoBlock label="开头" value={structuredCopyPack?.hook || selectedTopic?.hook || sections.HOOK || ""} />
          <InfoBlock label="场景说明" value={structuredCopyPack?.caption || sections.VIEW || ""} />
          <InfoBlock label="演示步骤" value={sections.STEPS || ""} />
          <InfoBlock label="产品表达" value={sections.PRODUCT || ""} />
          <InfoBlock label="行动引导" value={sections.CTA || primaryPlan.cta} />
        </div>
        {Array.isArray(structuredCopyPack?.product_highlights) && structuredCopyPack.product_highlights.length > 0 ? (
          <div className="space-y-2">
            <SectionTitle>卖点摘要</SectionTitle>
            {structuredCopyPack.product_highlights.map((item, index) => (
              <div key={`${item}_${index}`} className="text-sm leading-6 text-slate-600">
                {index + 1}. {item}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {structuredBrowserFields && Object.keys(structuredBrowserFields).length > 0 ? (
        <div className={SECTION_CLASS}>
          <SectionTitle>浏览器准备字段</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            <InfoBlock label="平台" value={structuredBrowserFields?.platform || ""} />
            <InfoBlock label="商品标题" value={structuredBrowserFields?.product_title || ""} />
            <InfoBlock label="短描述" value={structuredBrowserFields?.short_description || ""} />
            <InfoBlock label="行动引导" value={structuredBrowserFields?.cta_text || ""} />
            <InfoBlock
              label="标签"
              value={Array.isArray(structuredBrowserFields?.tags) ? structuredBrowserFields.tags.join(" / ") : ""}
            />
          </div>
        </div>
      ) : null}

      {Array.isArray(structuredCopyPack?.faq) && structuredCopyPack.faq.length > 0 ? (
        <div className={SECTION_CLASS}>
          <SectionTitle>FAQ</SectionTitle>
          <div className="space-y-2">
            {structuredCopyPack.faq.map((item, index) => (
              <div key={`${item?.question || "faq"}_${index}`} className="space-y-1">
                <div className="text-sm text-slate-800">Q：{item?.question || "-"}</div>
                <div className="text-sm leading-6 text-slate-600">A：{item?.answer || "-"}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {Array.isArray(structuredCopyPack?.chat_reply_templates) && structuredCopyPack.chat_reply_templates.length > 0 ? (
        <div className={SECTION_CLASS}>
          <SectionTitle>私聊回复</SectionTitle>
          <div className="space-y-2">
            {structuredCopyPack.chat_reply_templates.map((item, index) => (
              <div key={`${item}_${index}`} className="text-sm leading-6 text-slate-600">
                {index + 1}. {item}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className={SECTION_CLASS}>
        <SectionTitle>KPI 检查项</SectionTitle>
        <div className="space-y-2">
          {kpiChecklist.map((item, index) => (
            <div key={`${item}_${index}`} className="text-sm leading-6 text-slate-600">
              {index + 1}. {item}
            </div>
          ))}
        </div>
      </div>

      <div className={SECTION_CLASS}>
        <SectionTitle>风险提醒</SectionTitle>
        <div className="space-y-2">
          {riskNotes.map((item, index) => (
            <div key={`${item}_${index}`} className="text-sm leading-6 text-slate-600">
              {index + 1}. {item}
            </div>
          ))}
        </div>
      </div>

      {nextActions.length > 0 ? (
        <div className={SECTION_CLASS}>
          <SectionTitle>下一步</SectionTitle>
          <div className="space-y-2">
            {nextActions.map((item, index) => (
              <div key={`${item}_${index}`} className="text-sm leading-6 text-slate-600">
                {index + 1}. {item}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
