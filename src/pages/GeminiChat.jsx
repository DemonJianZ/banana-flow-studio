import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useMemberInfo, formatMemberPoints } from '../hooks/useMemberInfo';
import './GeminiChat.css';

const SSO_LOGIN_URL = 'http://test.dayukeji-inc.cn/aigc_test/#/dashboard?app=photographer';

function generateThreadId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderMarkdown(text) {
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) =>
      `<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

async function* parseSSE(reader) {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try { yield JSON.parse(line.slice(6)); } catch { /* skip malformed */ }
    }
  }
}

const TOOL_LABELS = {
  get_current_time: '查询时间',
  calculate: '计算',
};

const TOOL_ICONS = {
  get_current_time: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>`,
  calculate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>`,
  _default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/></svg>`,
};

const LogoSvg = () => (
  <svg viewBox="0 0 40 40" fill="none" className="gc-sidebar-logo-svg">
    <defs>
      <linearGradient id="gc-grad-logo" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stopColor="#4285F4"/>
        <stop offset="33%"  stopColor="#EA4335"/>
        <stop offset="66%"  stopColor="#FBBC04"/>
        <stop offset="100%" stopColor="#34A853"/>
      </linearGradient>
    </defs>
    <path d="M20 4C20 4 21.5 14 28 20C21.5 26 20 36 20 36C20 36 18.5 26 12 20C18.5 14 20 4 20 4Z" fill="url(#gc-grad-logo)"/>
    <path d="M4 20C4 20 14 21.5 20 28C26 21.5 36 20 36 20C36 20 26 18.5 20 12C14 18.5 4 20 4 20Z" fill="url(#gc-grad-logo)" opacity="0.85"/>
  </svg>
);

const AvatarSvg = () => (
  <svg viewBox="0 0 40 40" fill="none">
    <defs>
      <linearGradient id="gc-grad-msg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stopColor="#4285F4"/>
        <stop offset="50%"  stopColor="#EA4335"/>
        <stop offset="100%" stopColor="#34A853"/>
      </linearGradient>
    </defs>
    <path d="M20 6C20 6 21 13 26 20C21 27 20 34 20 34C20 34 19 27 14 20C19 13 20 6 20 6Z" fill="url(#gc-grad-msg)"/>
    <path d="M6 20C6 20 13 21 20 26C27 21 34 20 34 20C34 20 27 19 20 14C13 19 6 20 6 20Z" fill="url(#gc-grad-msg)" opacity="0.8"/>
  </svg>
);

function ToolPill({ name, done }) {
  const icon = TOOL_ICONS[name] || TOOL_ICONS._default;
  const label = TOOL_LABELS[name] || name;
  return (
    <div className={`gc-tool-pill ${done ? 'gc-tool-pill--done' : 'gc-tool-pill--running'}`}>
      <span dangerouslySetInnerHTML={{ __html: icon }} />
      <span>{label}</span>
    </div>
  );
}

function AssistantMessage({ msg }) {
  const showThinking = msg.isStreaming && msg.content === '' && !msg.error;
  return (
    <div className="gc-msg gc-msg--assistant">
      <div className="gc-msg-avatar"><AvatarSvg /></div>
      <div className="gc-msg-bubble">
        {msg.tools.map((t, i) => (
          <ToolPill key={i} name={t.name} done={t.done} />
        ))}
        {showThinking ? (
          <div className="gc-thinking-dots">
            <span /><span /><span />
          </div>
        ) : msg.error ? (
          <span className="gc-msg-error">{msg.error}</span>
        ) : (
          <>
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
            {msg.isStreaming && <span className="gc-cursor" />}
          </>
        )}
      </div>
    </div>
  );
}

function SsoRedirectOverlay({ onLogin }) {
  return (
    <div className="gc-auth-overlay">
      <div className="gc-auth-card">
        <div className="gc-auth-logo"><LogoSvg /></div>
        <h2 className="gc-auth-title">AI 小禹智能体</h2>
        <p className="gc-auth-sub">请先登录以开始创作</p>
        <button className="gc-auth-btn" onClick={onLogin}>
          前往登录
        </button>
      </div>
    </div>
  );
}

// ── 剧本输入弹窗 ──────────────────────────────────────────────────────────────

function ScriptInputModal({ onClose, onSubmit }) {
  const [text, setText] = useState('');
  const taRef = useRef(null);

  useEffect(() => { taRef.current?.focus(); }, []);

  const handleBackdrop = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  return (
    <div className="gc-script-modal" onClick={handleBackdrop} onKeyDown={handleKeyDown}>
      <div className="gc-script-modal-card">
        <div className="gc-script-modal-header">
          <svg className="gc-script-modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="8" y1="13" x2="16" y2="13"/>
            <line x1="8" y1="17" x2="13" y2="17"/>
          </svg>
          <div>
            <h3 className="gc-script-modal-title">粘贴剧本内容</h3>
            <p className="gc-script-modal-hint">支持中英文剧本，系统将自动识别场景边界</p>
          </div>
        </div>
        <textarea
          ref={taRef}
          className="gc-script-textarea"
          placeholder="在此粘贴剧本全文…"
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <div className="gc-script-modal-footer">
          <span className="gc-script-char-count">{text.length} 字</span>
          <div className="gc-script-modal-actions">
            <button className="gc-script-btn-cancel" onClick={onClose}>取消</button>
            <button
              className="gc-script-btn-submit"
              onClick={() => onSubmit(text)}
              disabled={!text.trim()}
            >
              开始分析
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 画布：场景分析结果 ────────────────────────────────────────────────────────

const TIME_COLOR = {
  '日':          { bg: 'rgba(251,188,4,0.12)',  text: '#b48a00' },
  '夜':          { bg: 'rgba(91,158,244,0.12)', text: '#4a7fc0' },
  '黄昏':        { bg: 'rgba(234,115,53,0.12)', text: '#c05a1f' },
  '清晨':        { bg: 'rgba(52,168,83,0.12)',  text: '#1d7a3e' },
  '室内不分昼夜': { bg: 'rgba(160,160,180,0.1)', text: '#7a7a9a' },
  '未指定':      { bg: 'rgba(160,160,180,0.1)', text: '#7a7a9a' },
};

const ROLE_COLOR = {
  '主角': { bg: 'rgba(99,102,241,0.14)', text: '#8890d8' },
  '配角': { bg: 'rgba(52,168,83,0.12)',  text: '#2d8a4e' },
  '群演': { bg: 'rgba(160,160,180,0.1)', text: '#7a7a9a' },
};

const CANVAS_NAV_LABELS = {
  scenes:     '场景列表',
  characters: '角色档案',
  storyboard: '分镜表',
  prompts:    '提示词',
};

const SHOT_TYPE_COLOR = {
  '特写': { bg: 'rgba(234,67,53,0.12)',   text: '#c0392b' },
  '近景': { bg: 'rgba(251,188,4,0.12)',   text: '#b48a00' },
  '中景': { bg: 'rgba(52,168,83,0.12)',   text: '#1d7a3e' },
  '全景': { bg: 'rgba(91,158,244,0.12)',  text: '#4a7fc0' },
  '远景': { bg: 'rgba(160,160,180,0.1)',  text: '#7a7a9a' },
};

function SceneCanvas({ state, onExtractCharacters, onGenerateStoryboard, onOptimizePrompts }) {
  if (state.type === 'analyzing') {
    return (
      <div className="gc-canvas-analyzing">
        <div className="gc-canvas-analyzing-header">
          <div className="gc-thinking-dots"><span /><span /><span /></div>
          <span className="gc-canvas-status-text">{state.statusMsg || '正在分析…'}</span>
        </div>
        <div className="gc-canvas-thinking-scroll">
          <pre className="gc-canvas-thinking-pre">{state.thinkingText}</pre>
        </div>
      </div>
    );
  }

  if (state.type === 'scenes') {
    return (
      <div className="gc-canvas-scenes">
        <div className="gc-canvas-scenes-header">
          <div className="gc-canvas-scenes-header-left">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z"/>
              <line x1="7" y1="9" x2="13" y2="9"/><line x1="7" y1="13" x2="11" y2="13"/>
            </svg>
            <span>共 <strong>{state.scenes.length}</strong> 个场景</span>
          </div>
          {onExtractCharacters && (
            <button className="gc-canvas-next-btn" onClick={onExtractCharacters}>
              提取角色
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          )}

        </div>
        <div className="gc-canvas-scenes-list">
          {state.scenes.map(scene => {
            const tc = TIME_COLOR[scene.time] || TIME_COLOR['未指定'];
            return (
              <div key={scene.scene_id} className="gc-scene-card">
                <div className="gc-scene-card-meta">
                  <span className="gc-scene-badge">场景 {scene.scene_id}</span>
                  <span className="gc-scene-time" style={{ background: tc.bg, color: tc.text }}>
                    {scene.time}
                  </span>
                  <span className="gc-scene-location">{scene.location}</span>
                </div>
                <p className="gc-scene-summary">{scene.summary}</p>
              </div>
            );
          })}
          <div style={{ height: 24, flexShrink: 0 }} />
        </div>
      </div>
    );
  }

  if (state.type === 'characters') {
    return (
      <div className="gc-canvas-scenes">
        <div className="gc-canvas-scenes-header">
          <div className="gc-canvas-scenes-header-left">
            {state.prev && (
              <button
                className="gc-canvas-back-btn"
                onClick={() => state.onBack && state.onBack()}
                title="返回场景列表"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
            )}
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="8" cy="7" r="3"/><path d="M2 17a6 6 0 0 1 12 0"/>
              <circle cx="15" cy="8" r="2.5"/><path d="M15 13.5a5 5 0 0 1 3 4.5"/>
            </svg>
            <span>共 <strong>{state.characters.length}</strong> 个角色</span>
          </div>
          {onGenerateStoryboard && (
            <button className="gc-canvas-next-btn" onClick={onGenerateStoryboard}>
              生成分镜
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          )}
        </div>
        <div className="gc-canvas-scenes-list">
          {state.characters.map((char, idx) => {
            const rc = ROLE_COLOR[char.role_type] || ROLE_COLOR['群演'];
            return (
              <div key={idx} className="gc-scene-card gc-char-card">
                <div className="gc-scene-card-meta">
                  <span className="gc-char-name">{char.name}</span>
                  <span className="gc-scene-time" style={{ background: rc.bg, color: rc.text }}>
                    {char.role_type}
                  </span>
                  <span className="gc-scene-location">
                    出场{char.scenes.length}个场景
                  </span>
                </div>
                {char.appearance !== '未定义' && (
                  <p className="gc-char-field">
                    <span className="gc-char-label">外貌</span>{char.appearance}
                  </p>
                )}
                <p className="gc-char-field">
                  <span className="gc-char-label">性格</span>{char.personality}
                </p>
                <p className="gc-char-field">
                  <span className="gc-char-label">弧线</span>{char.emotion_arc}
                </p>
              </div>
            );
          })}
          <div style={{ height: 24, flexShrink: 0 }} />
        </div>
      </div>
    );
  }

  if (state.type === 'storyboard') {
    // 按 scene_id 分组
    const byScene = state.shots.reduce((acc, shot) => {
      (acc[shot.scene_id] = acc[shot.scene_id] || []).push(shot);
      return acc;
    }, {});
    const sceneIds = Object.keys(byScene).map(Number).sort((a, b) => a - b);

    return (
      <div className="gc-canvas-scenes">
        <div className="gc-canvas-scenes-header">
          <div className="gc-canvas-scenes-header-left">
            {state.prev && (
              <button
                className="gc-canvas-back-btn"
                onClick={() => state.onBack && state.onBack()}
                title="返回角色档案"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
            )}
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/>
              <rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/>
            </svg>
            <span>共 <strong>{state.shots.length}</strong> 个镜头</span>
          </div>
          {onOptimizePrompts && (
            <button className="gc-canvas-next-btn" onClick={onOptimizePrompts}>
              优化提示词
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          )}
        </div>
        <div className="gc-canvas-scenes-list">
          {sceneIds.map(sceneId => (
            <div key={sceneId} className="gc-storyboard-scene-group">
              <div className="gc-storyboard-scene-label">场景 {sceneId}</div>
              {byScene[sceneId].map(shot => {
                const tc = SHOT_TYPE_COLOR[shot.shot_type] || SHOT_TYPE_COLOR['远景'];
                return (
                  <div key={shot.shot_id} className="gc-scene-card gc-shot-card">
                    <div className="gc-scene-card-meta">
                      <span className="gc-scene-badge">镜头 {shot.shot_index}</span>
                      <span className="gc-scene-time" style={{ background: tc.bg, color: tc.text }}>
                        {shot.shot_type}
                      </span>
                      <span className="gc-scene-location">{shot.camera_movement} · {shot.duration}s</span>
                    </div>
                    <p className="gc-scene-summary">{shot.content}</p>
                    <p className="gc-char-field" style={{ marginTop: 6 }}>
                      <span className="gc-char-label">情绪</span>{shot.mood}
                    </p>
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ height: 24, flexShrink: 0 }} />
        </div>
      </div>
    );
  }

  if (state.type === 'prompts') {
    const byScene = state.prompts.reduce((acc, p) => {
      (acc[p.scene_id] = acc[p.scene_id] || []).push(p);
      return acc;
    }, {});
    const sceneIds = Object.keys(byScene).map(Number).sort((a, b) => a - b);

    const copyText = (text) => navigator.clipboard?.writeText(text);

    const copyAllEn = () => {
      const all = state.prompts.map(p => `// 场景${p.scene_id} 镜头${p.shot_index}\n${p.prompt_en}`).join('\n\n');
      copyText(all);
    };

    return (
      <div className="gc-canvas-scenes">
        <div className="gc-canvas-scenes-header">
          <div className="gc-canvas-scenes-header-left">
            {state.prev && (
              <button
                className="gc-canvas-back-btn"
                onClick={() => state.onBack && state.onBack()}
                title="返回分镜列表"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
            )}
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M13 2H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
              <line x1="7" y1="8" x2="13" y2="8"/><line x1="7" y1="12" x2="11" y2="12"/>
            </svg>
            <span>共 <strong>{state.prompts.length}</strong> 条提示词</span>
          </div>
          <button className="gc-canvas-next-btn" onClick={copyAllEn} title="复制全部英文提示词">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            复制全部
          </button>
        </div>
        <div className="gc-canvas-scenes-list">
          {sceneIds.map(sceneId => (
            <div key={sceneId} className="gc-storyboard-scene-group">
              <div className="gc-storyboard-scene-label">场景 {sceneId}</div>
              {byScene[sceneId].map(p => (
                <div key={p.shot_id} className="gc-scene-card gc-prompt-card">
                  <div className="gc-scene-card-meta">
                    <span className="gc-scene-badge">镜头 {p.shot_index}</span>
                  </div>
                  <div className="gc-prompt-block">
                    <div className="gc-prompt-lang-row">
                      <span className="gc-prompt-lang">中</span>
                      <p className="gc-prompt-text">{p.prompt_zh}</p>
                      <button className="gc-prompt-copy-btn" onClick={() => copyText(p.prompt_zh)} title="复制">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                      </button>
                    </div>
                    <div className="gc-prompt-lang-row">
                      <span className="gc-prompt-lang gc-prompt-lang--en">EN</span>
                      <p className="gc-prompt-text gc-prompt-text--en">{p.prompt_en}</p>
                      <button className="gc-prompt-copy-btn" onClick={() => copyText(p.prompt_en)} title="复制">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                      </button>
                    </div>
                    <div className="gc-prompt-neg-row">
                      <span className="gc-prompt-neg-label">负向</span>
                      <p className="gc-prompt-neg-text">{p.negative_prompt}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div style={{ height: 24, flexShrink: 0 }} />
        </div>
      </div>
    );
  }

  if (state.type === 'error') {
    return (
      <div className="gc-canvas-analyzing">
        <div className="gc-canvas-analyzing-header" style={{ color: '#e57373' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" width="18" height="18">
            <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/>
          </svg>
          <span>{state.message}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="gc-canvas-placeholder">
      <svg className="gc-canvas-icon" viewBox="0 0 48 48" fill="none">
        <rect x="6" y="6" width="36" height="36" rx="8" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M14 34 L20 24 L26 30 L32 18 L38 28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="20" cy="16" r="3" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
      <p className="gc-canvas-label">灵动画布</p>
      <p className="gc-canvas-hint">画布内容即将呈现</p>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export default function GeminiChat() {
  const { apiFetch, user } = useAuth();
  const {
    memberInfo, memberInfoLoading, memberInfoLoginUrl, navigateToMemberLogin,
    memberLabel, memberAvatar, memberPoint, memberTotalPoint,
    userAuthsLoading, isAdminUser,
  } = useMemberInfo(apiFetch, user?.email || '');

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [inChatMode, setInChatMode] = useState(false);
  const [threadId, setThreadId] = useState(generateThreadId);

  // + 按钮菜单
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const plusMenuRef = useRef(null);

  // 剧本输入弹窗
  const [showScriptModal, setShowScriptModal] = useState(false);

  // 当前剧本原文 + 各节点结果（供后续节点复用）
  const [currentScript, setCurrentScript] = useState('');
  const [currentScenes, setCurrentScenes] = useState([]);
  const [currentCharacters, setCurrentCharacters] = useState([]);
  const [currentShots, setCurrentShots] = useState([]);

  // msgId → canvasState 快照，点击消息可跳回对应画布视图
  const msgCanvasMap = useRef({});

  // 画布状态
  const [canvasState, setCanvasState] = useState({ type: 'placeholder' });

  const chatListRef = useRef(null);
  const textareaRef = useRef(null);

  // 点击外部关闭 + 菜单
  useEffect(() => {
    if (!showPlusMenu) return;
    const handler = (e) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPlusMenu]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatListRef.current) {
        chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // ── 普通聊天 ────────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    if (memberInfoLoading || (!memberInfo && memberInfoLoginUrl)) return;
    const text = inputText.trim();
    if (!text || isLoading) return;

    setIsLoading(true);
    setInputText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    if (!inChatMode) setInChatMode(true);

    const currentThreadId = threadId;

    setMessages(prev => [
      ...prev,
      { id: Date.now(), role: 'user', content: text },
      { id: Date.now() + 1, role: 'assistant', content: '', tools: [], isStreaming: true, error: null },
    ]);

    try {
      const resp = await apiFetch('/api/gemini-chat/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, thread_id: currentThreadId }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

      for await (const event of parseSSE(resp.body.getReader())) {
        if (event.type === 'token') {
          setMessages(prev => {
            const next = [...prev];
            const last = { ...next[next.length - 1] };
            last.content += event.content;
            next[next.length - 1] = last;
            return next;
          });
        } else if (event.type === 'tool_start') {
          setMessages(prev => {
            const next = [...prev];
            const last = { ...next[next.length - 1] };
            last.tools = [...(last.tools || []), { name: event.tool, done: false }];
            next[next.length - 1] = last;
            return next;
          });
        } else if (event.type === 'tool_end') {
          setMessages(prev => {
            const next = [...prev];
            const last = { ...next[next.length - 1] };
            let marked = false;
            last.tools = (last.tools || []).map(t => {
              if (!marked && t.name === event.tool && !t.done) {
                marked = true;
                return { ...t, done: true };
              }
              return t;
            });
            next[next.length - 1] = last;
            return next;
          });
        } else if (event.type === 'error') {
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], error: event.content, isStreaming: false };
            return next;
          });
        } else if (event.type === 'done') {
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], isStreaming: false };
            return next;
          });
        }
      }
    } catch (err) {
      setMessages(prev => {
        const next = [...prev];
        if (next.length > 0 && next[next.length - 1].role === 'assistant') {
          next[next.length - 1] = { ...next[next.length - 1], error: `连接失败：${err.message}`, isStreaming: false };
        }
        return next;
      });
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }, [inputText, isLoading, inChatMode, threadId, memberInfoLoading, memberInfo, memberInfoLoginUrl, apiFetch]);

  // ── 剧本分析 ────────────────────────────────────────────────────────────────

  const handleScreenplayAnalysis = useCallback(async (script) => {
    setShowScriptModal(false);
    setCurrentScript(script);
    if (!inChatMode) setInChatMode(true);

    const preview = script.slice(0, 60) + (script.length > 60 ? '…' : '');
    const msgId1 = Date.now();
    setMessages(prev => [
      ...prev,
      { id: msgId1,     role: 'user',      content: `[分析剧本]\n${preview}` },
      { id: msgId1 + 1, role: 'assistant', content: '', tools: [], isStreaming: true, error: null },
    ]);
    setCanvasState({ type: 'analyzing', statusMsg: '正在分析剧本结构…', thinkingText: '' });

    try {
      const resp = await apiFetch('/api/screenplay/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

      for await (const event of parseSSE(resp.body.getReader())) {
        if (event.type === 'status') {
          setCanvasState(prev => ({ ...prev, statusMsg: event.content }));
        } else if (event.type === 'token') {
          setCanvasState(prev => ({
            ...prev,
            thinkingText: (prev.thinkingText || '') + event.content,
          }));
        } else if (event.type === 'result') {
          setCurrentScenes(event.data);
          const snap1 = { type: 'scenes', scenes: event.data };
          setCanvasState(snap1);
          msgCanvasMap.current[msgId1]     = snap1;
          msgCanvasMap.current[msgId1 + 1] = snap1;
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = {
              ...next[next.length - 1],
              content: `场景分析完成，共识别 **${event.total}** 个场景。结果已展示在右侧画布中。\n\n点击画布右上角 **"提取角色"** 继续下一步分析。`,
              isStreaming: false,
            };
            return next;
          });
        } else if (event.type === 'error') {
          setCanvasState({ type: 'error', message: event.content });
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], error: event.content, isStreaming: false };
            return next;
          });
        }
      }
    } catch (err) {
      setCanvasState({ type: 'error', message: `连接失败：${err.message}` });
      setMessages(prev => {
        const next = [...prev];
        if (next.length > 0 && next[next.length - 1].role === 'assistant') {
          next[next.length - 1] = { ...next[next.length - 1], error: `连接失败：${err.message}`, isStreaming: false };
        }
        return next;
      });
    }
  }, [inChatMode, apiFetch]);

  // ── Node 2：角色提取 ────────────────────────────────────────────────────────

  const handleCharacterExtract = useCallback(async () => {
    if (canvasState.type !== 'scenes') return;
    const scenes = canvasState.scenes;
    const prevState = canvasState;

    const msgId2 = Date.now();
    setMessages(prev => [
      ...prev,
      { id: msgId2,     role: 'user',      content: '[提取角色]' },
      { id: msgId2 + 1, role: 'assistant', content: '', tools: [], isStreaming: true, error: null },
    ]);
    setCanvasState({ type: 'analyzing', statusMsg: '正在提取角色信息…', thinkingText: '' });

    try {
      const resp = await apiFetch('/api/screenplay/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: currentScript, scenes }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

      for await (const event of parseSSE(resp.body.getReader())) {
        if (event.type === 'status') {
          setCanvasState(prev => ({ ...prev, statusMsg: event.content }));
        } else if (event.type === 'token') {
          setCanvasState(prev => ({
            ...prev,
            thinkingText: (prev.thinkingText || '') + event.content,
          }));
        } else if (event.type === 'result') {
          setCurrentCharacters(event.data);
          const snap2 = { type: 'characters', characters: event.data, prev: prevState, onBack: () => setCanvasState(prevState) };
          setCanvasState(snap2);
          msgCanvasMap.current[msgId2]     = snap2;
          msgCanvasMap.current[msgId2 + 1] = snap2;
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = {
              ...next[next.length - 1],
              content: `角色提取完成，共识别 **${event.total}** 个角色。角色档案已展示在右侧画布中。\n\n点击画布右上角 **"生成分镜"** 继续下一步分析。`,
              isStreaming: false,
            };
            return next;
          });
        } else if (event.type === 'error') {
          setCanvasState({ type: 'error', message: event.content });
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], error: event.content, isStreaming: false };
            return next;
          });
        }
      }
    } catch (err) {
      setCanvasState({ type: 'error', message: `连接失败：${err.message}` });
      setMessages(prev => {
        const next = [...prev];
        if (next.length > 0 && next[next.length - 1].role === 'assistant') {
          next[next.length - 1] = { ...next[next.length - 1], error: `连接失败：${err.message}`, isStreaming: false };
        }
        return next;
      });
    }
  }, [canvasState, currentScript, apiFetch]);

  // ── Node 3：分镜生成 ─────────────────────────────────────────────────────────

  const handleStoryboardGenerate = useCallback(async () => {
    if (canvasState.type !== 'characters') return;
    const prevState = canvasState;

    const msgId4 = Date.now();
    setMessages(prev => [
      ...prev,
      { id: msgId4,     role: 'user',      content: '[生成分镜]' },
      { id: msgId4 + 1, role: 'assistant', content: '', tools: [], isStreaming: true, error: null },
    ]);
    setCanvasState({ type: 'analyzing', statusMsg: '正在生成分镜序列…', thinkingText: '' });

    try {
      const resp = await apiFetch('/api/screenplay/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: currentScript,
          scenes: currentScenes,
          characters: currentCharacters,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

      for await (const event of parseSSE(resp.body.getReader())) {
        if (event.type === 'status') {
          setCanvasState(prev => ({ ...prev, statusMsg: event.content }));
        } else if (event.type === 'token') {
          setCanvasState(prev => ({
            ...prev,
            thinkingText: (prev.thinkingText || '') + event.content,
          }));
        } else if (event.type === 'result') {
          setCurrentShots(event.data);
          const snap4 = { type: 'storyboard', shots: event.data, prev: prevState, onBack: () => setCanvasState(prevState) };
          setCanvasState(snap4);
          msgCanvasMap.current[msgId4]     = snap4;
          msgCanvasMap.current[msgId4 + 1] = snap4;
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = {
              ...next[next.length - 1],
              content: `分镜生成完成，共 **${event.total}** 个镜头。分镜表已展示在右侧画布中。\n\n点击画布右上角 **"优化提示词"** 生成可直接用于图像生成的提示词。`,
              isStreaming: false,
            };
            return next;
          });
        } else if (event.type === 'error') {
          setCanvasState({ type: 'error', message: event.content });
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], error: event.content, isStreaming: false };
            return next;
          });
        }
      }
    } catch (err) {
      setCanvasState({ type: 'error', message: `连接失败：${err.message}` });
      setMessages(prev => {
        const next = [...prev];
        if (next.length > 0 && next[next.length - 1].role === 'assistant') {
          next[next.length - 1] = { ...next[next.length - 1], error: `连接失败：${err.message}`, isStreaming: false };
        }
        return next;
      });
    }
  }, [canvasState, currentScript, currentScenes, currentCharacters, apiFetch]);

  // ── Node 5：提示词优化 ───────────────────────────────────────────────────────

  const handlePromptOptimize = useCallback(async () => {
    if (canvasState.type !== 'storyboard') return;
    const prevState = canvasState;

    const msgId5 = Date.now();
    setMessages(prev => [
      ...prev,
      { id: msgId5,     role: 'user',      content: '[优化提示词]' },
      { id: msgId5 + 1, role: 'assistant', content: '', tools: [], isStreaming: true, error: null },
    ]);
    setCanvasState({ type: 'analyzing', statusMsg: '正在优化图像生成提示词…', thinkingText: '' });

    try {
      const resp = await apiFetch('/api/screenplay/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shots: currentShots,
          characters: currentCharacters,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

      for await (const event of parseSSE(resp.body.getReader())) {
        if (event.type === 'status') {
          setCanvasState(prev => ({ ...prev, statusMsg: event.content }));
        } else if (event.type === 'token') {
          setCanvasState(prev => ({
            ...prev,
            thinkingText: (prev.thinkingText || '') + event.content,
          }));
        } else if (event.type === 'result') {
          const snap5 = { type: 'prompts', prompts: event.data, prev: prevState, onBack: () => setCanvasState(prevState) };
          setCanvasState(snap5);
          msgCanvasMap.current[msgId5]     = snap5;
          msgCanvasMap.current[msgId5 + 1] = snap5;
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = {
              ...next[next.length - 1],
              content: `提示词优化完成，共 **${event.total}** 条提示词（中英双语）。\n\n提示词已展示在右侧画布中，点击每条提示词右侧的复制按钮可直接使用。`,
              isStreaming: false,
            };
            return next;
          });
        } else if (event.type === 'error') {
          setCanvasState({ type: 'error', message: event.content });
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], error: event.content, isStreaming: false };
            return next;
          });
        }
      }
    } catch (err) {
      setCanvasState({ type: 'error', message: `连接失败：${err.message}` });
      setMessages(prev => {
        const next = [...prev];
        if (next.length > 0 && next[next.length - 1].role === 'assistant') {
          next[next.length - 1] = { ...next[next.length - 1], error: `连接失败：${err.message}`, isStreaming: false };
        }
        return next;
      });
    }
  }, [canvasState, currentShots, currentCharacters, apiFetch]);

  // ── 其他 handlers ───────────────────────────────────────────────────────────

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInChatMode(false);
    setThreadId(generateThreadId());
    setCanvasState({ type: 'placeholder' });
    setCurrentScript('');
    setCurrentScenes([]);
    setCurrentCharacters([]);
    setCurrentShots([]);
  }, []);

  const handleInputChange = useCallback((e) => {
    setInputText(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const hasText = inputText.trim().length > 0;

  // ── 鉴权 ────────────────────────────────────────────────────────────────────

  if (memberInfoLoading) {
    return (
      <div className="gc-auth-overlay">
        <div className="gc-thinking-dots"><span /><span /><span /></div>
      </div>
    );
  }
  if (!memberInfo && memberInfoLoginUrl) {
    return (
      <SsoRedirectOverlay onLogin={() => navigateToMemberLogin(SSO_LOGIN_URL)} />
    );
  }

  // ── 渲染 ─────────────────────────────────────────────────────────────────────

  return (
    <div className="gc-root">
      {showScriptModal && (
        <ScriptInputModal
          onClose={() => setShowScriptModal(false)}
          onSubmit={handleScreenplayAnalysis}
        />
      )}

      <div className={`gc-bg-glow ${inChatMode ? 'gc-bg-glow--chat' : ''}`} />
      <div className={`gc-app ${inChatMode ? 'gc-app--split' : ''}`}>

        {/* Sidebar */}
        <aside className="gc-sidebar">
          <div className="gc-sidebar-top">
            <div className="gc-sidebar-logo" onClick={handleNewChat} title="回到首页">
              <LogoSvg />
            </div>
            <div className="gc-sidebar-icon" onClick={handleNewChat} title="新对话">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
            <div className="gc-sidebar-icon" title="搜索">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <div className="gc-sidebar-icon" title="应用">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="8" r="2.5"/>
                <circle cx="8" cy="16" r="2.5"/><circle cx="16" cy="16" r="2.5"/>
              </svg>
            </div>
          </div>
          <div className="gc-sidebar-bottom">
            <div className="gc-sidebar-icon" title="设置">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </div>
            <details className="gc-member-details">
              <summary className="gc-member-summary" title={memberLabel}>
                {memberAvatar ? (
                  <img src={memberAvatar} alt={memberLabel} className="gc-member-avatar-img" />
                ) : (
                  <span className="gc-member-avatar-letter">
                    {String(memberLabel || 'G').slice(0, 1).toUpperCase()}
                  </span>
                )}
              </summary>
              <div className="gc-member-popup">
                <div className="gc-member-popup-header">
                  <div className="gc-member-popup-thumb">
                    {memberAvatar ? (
                      <img src={memberAvatar} alt={memberLabel} className="gc-member-avatar-img" />
                    ) : (
                      <span className="gc-member-avatar-letter">
                        {String(memberLabel || 'G').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="gc-member-popup-info">
                    <div className="gc-member-popup-name">{memberLabel}</div>
                    <div className="gc-member-popup-sub">
                      {memberInfoLoginUrl ? '会员未登录' : '会员信息'}
                    </div>
                    <span className={`gc-member-badge ${isAdminUser ? 'gc-member-badge--admin' : ''}`}>
                      {userAuthsLoading ? '权限加载中' : isAdminUser ? '管理员' : '普通成员'}
                    </span>
                  </div>
                </div>
                <div className="gc-member-points">
                  <div className="gc-member-points-item">
                    <div className="gc-member-points-label">当前积分</div>
                    <div className="gc-member-points-value gc-member-points-value--current">
                      {formatMemberPoints(memberPoint)}
                    </div>
                  </div>
                  <div className="gc-member-points-item">
                    <div className="gc-member-points-label">累计积分</div>
                    <div className="gc-member-points-value gc-member-points-value--total">
                      {formatMemberPoints(memberTotalPoint)}
                    </div>
                  </div>
                </div>
                {memberInfoLoginUrl ? (
                  <button
                    className="gc-member-login-btn"
                    onClick={() => navigateToMemberLogin(memberInfoLoginUrl)}
                  >
                    前往会员登录
                  </button>
                ) : null}
              </div>
            </details>
          </div>
        </aside>

        {/* Main chat panel */}
        <main className={`gc-main ${inChatMode ? 'gc-main--narrow' : ''}`}>
          <div className="gc-main-top-action">
            <button className="gc-btn-dashed" onClick={handleNewChat} title="新建对话">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>

          {!inChatMode && (
            <div className="gc-welcome">
              <h1 className="gc-welcome-headline">随时准备好，只等你需要</h1>
            </div>
          )}

          {inChatMode && (
            <div className="gc-chat-list" ref={chatListRef}>
              {messages.map(msg => {
                const canvasSnap = msgCanvasMap.current[msg.id];
                return (
                  <React.Fragment key={msg.id}>
                    {msg.role === 'user' ? (
                      <div className="gc-msg gc-msg--user">
                        <div
                          className="gc-msg-bubble gc-msg-bubble--user"
                          dangerouslySetInnerHTML={{ __html: escapeHtml(msg.content).replace(/\n/g, '<br>') }}
                        />
                      </div>
                    ) : (
                      <AssistantMessage msg={msg} />
                    )}
                    {canvasSnap && (
                      <div className={`gc-canvas-nav-row ${msg.role === 'user' ? 'gc-canvas-nav-row--user' : 'gc-canvas-nav-row--assistant'}`}>
                        <button
                          className="gc-msg-canvas-nav"
                          onClick={() => setCanvasState(canvasSnap)}
                        >
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="1" y="1" width="14" height="14" rx="3"/>
                            <polyline points="5 8 8 5 11 8"/>
                            <line x1="8" y1="5" x2="8" y2="11"/>
                          </svg>
                          {CANVAS_NAV_LABELS[canvasSnap.type] || '画布'}
                        </button>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
              <div className="gc-chat-spacer" />
            </div>
          )}

          {/* Input */}
          <div className="gc-input-area">
            <div className={`gc-input-bar ${isLoading ? 'gc-input-bar--loading' : ''}`}>

              {/* + 按钮 & 菜单 */}
              <div className="gc-plus-menu-wrap" ref={plusMenuRef}>
                <button
                  className="gc-btn-plus"
                  title="添加内容"
                  onClick={() => setShowPlusMenu(v => !v)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
                {showPlusMenu && (
                  <div className="gc-plus-menu">
                    <button
                      className="gc-plus-menu-item"
                      onClick={() => { setShowPlusMenu(false); setShowScriptModal(true); }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="8" y1="13" x2="16" y2="13"/>
                        <line x1="8" y1="17" x2="13" y2="17"/>
                      </svg>
                      分析剧本
                    </button>
                  </div>
                )}
              </div>

              <textarea
                ref={textareaRef}
                className="gc-input-field"
                placeholder="问问 AI 小禹"
                rows={1}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                autoComplete="off"
                spellCheck={false}
              />
              <div className="gc-input-actions">
                <button className="gc-btn-model">
                  Flash
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div className="gc-divider" />
                {hasText ? (
                  <button className="gc-btn-send" onClick={handleSend} title="发送">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <line x1="12" y1="19" x2="12" y2="5"/>
                      <polyline points="5 12 12 5 19 12"/>
                    </svg>
                  </button>
                ) : (
                  <button className="gc-btn-mic" title="语音输入">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                      <rect x="9" y="2" width="6" height="12" rx="3"/>
                      <path d="M5 10a7 7 0 0 0 14 0"/>
                      <line x1="12" y1="19" x2="12" y2="22"/>
                      <line x1="8" y1="22" x2="16" y2="22"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* 灵动画布 */}
        <div className={`gc-canvas ${inChatMode ? 'gc-canvas--visible' : ''}`}>
          <div className="gc-canvas-inner">
            <SceneCanvas
              state={canvasState}
              onExtractCharacters={canvasState.type === 'scenes' ? handleCharacterExtract : null}
              onGenerateStoryboard={canvasState.type === 'characters' ? handleStoryboardGenerate : null}
              onOptimizePrompts={canvasState.type === 'storyboard' ? handlePromptOptimize : null}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
