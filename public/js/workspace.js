'use strict';

/* =========================================================
   DSChats 复刻 · 工作台
   ========================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const S = {
  user: null,
  contacts: [],
  settings: null,
  usage: { today: 0, limit: 1000, remaining: 1000 },
  stats: null,
  audit: [],
  engine: null,
  llm: null,
  presets: [],
  telegram: null,
  currentView: 'overview',
  currentContactId: null,
  thread: null,
  flows: [],
  knowledge: [],
  usageDays: [],
  auditFilter: 'all',
  search: '',
  currentFlowId: null,
  draftUsed: null,
  busy: false
};

const ICON = {
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  send: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  spark: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  chat: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.6-.7L3 21l1.8-4.8A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z"/></svg>',
  flow: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
  book: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>',
  shield: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>',
  user: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
  brain: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 0-4 12.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3A7 7 0 0 0 12 2Z"/><path d="M9 22h6"/></svg>'
};

const AUDIT_LABEL = {
  auth: '账号', contact: '联系人', memory: '记忆', ai: 'AI 生成',
  send: '发送', flow: '流程', settings: '设置', knowledge: '资料', system: '系统'
};
const AUDIT_BADGE = {
  auth: 'badge', contact: 'badge-cyan', memory: 'badge-indigo', ai: 'badge-indigo',
  send: 'badge-green', flow: 'badge-amber', settings: 'badge', knowledge: 'badge-cyan', system: 'badge'
};
const MODE_LABEL = { off: '关闭', draft: 'AI 草稿', auto: '自动发送' };
const CHANNEL_LABEL = { telegram: 'Telegram', whatsapp: 'WhatsApp', line: 'LINE', zalo: 'Zalo', signal: 'Signal', other: '其他' };
const TONE_LABEL = { warm: '温和体贴', neutral: '自然克制', playful: '轻松俏皮', concise: '简洁直接' };
const VIEW_META = {
  overview: ['概览', '工作区 / 概览'],
  chats: ['对话', '工作区 / 对话'],
  contacts: ['联系人', '工作区 / 联系人'],
  memory: ['记忆', '工作区 / 记忆'],
  flows: ['流程', '自动化 / 流程'],
  knowledge: ['知识库', '自动化 / 知识库'],
  audit: ['审计日志', '管理 / 审计日志'],
  settings: ['设置', '管理 / 设置']
};

/* ---------------- 基础 ---------------- */
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('登录已失效');
  }
  if (!res.ok || data.ok === false) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .2s, transform .2s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 220);
  }, 2600);
}

function rel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)} 分钟前`;
  if (diff < 864e5) return `${Math.floor(diff / 3600e3)} 小时前`;
  if (diff < 7 * 864e5) return `${Math.floor(diff / 864e5)} 天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function clock(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function avatar(name, color, cls = '') {
  const ch = String(name || '?').trim().slice(0, 1).toUpperCase();
  return `<span class="avatar ${cls}" style="background:${color || '#4f46e5'}">${esc(ch)}</span>`;
}

let modalClosable = true;
function openModal({ title, body, footer = '', onMount, closable = true }) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = body;
  $('#modal-foot').innerHTML = footer;
  $('#modal-mask').classList.add('show');
  $('#modal-close').style.display = closable ? '' : 'none';
  modalClosable = closable;
  if (onMount) onMount($('#modal-body'), $('#modal-foot'));
}
function closeModal() {
  if (!modalClosable) return;
  $('#modal-mask').classList.remove('show');
}
$('#modal-close').addEventListener('click', closeModal);
$('#modal-mask').addEventListener('click', (e) => {
  if (e.target === $('#modal-mask')) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

/* ---------------- 数据加载 ---------------- */
async function loadBootstrap() {
  const data = await api('/api/bootstrap');
  S.user = data.user;
  S.contacts = data.contacts;
  S.settings = data.settings;
  S.usage = data.usage;
  S.stats = data.stats;
  S.audit = data.audit;
  S.engine = data.engine;
  S.llm = data.llm || null;
  S.presets = data.presets || [];
  S.telegram = data.telegram;
  syncChrome();
}

function syncChrome() {
  if (!S.user) return;
  $('#ws-name').textContent = S.user.workspaceName;
  $('#ws-avatar').textContent = (S.user.workspaceName || 'W').slice(0, 1);
  $('#user-mail').textContent = S.user.email;
  $('#user-avatar').textContent = (S.user.email || 'U').slice(0, 1).toUpperCase();
  $('#nav-chat-count').textContent = String(S.contacts.length);
  const type = S.user.assistantType;
  $('#assistant-label').innerHTML = type
    ? `当前：<b>${type === 'emotional' ? '情感助手' : '流程助手'}</b>`
    : '助手未选择';
  $('#assistant-dot').style.background = type ? '#059669' : '#f59e0b';
}

async function loadThread(contactId) {
  const data = await api(`/api/contacts/${contactId}/messages`);
  S.thread = data;
}

/* ---------------- 视图：概览 ---------------- */
const views = {};

views.overview = {
  async load() {
    await loadBootstrap();
  },
  html() {
    const s = S.stats || {};
    const pct = Math.min(100, Math.round((S.usage.today / Math.max(1, S.usage.limit)) * 100));
    const type = S.user.assistantType || 'emotional';
    const isEmo = type === 'emotional';
    const audit = (S.audit || []).slice(0, 6).map((a) => `
      <div class="audit-mini">
        <span class="ai-icon">${AUDIT_LABEL[a.type] ? AUDIT_LABEL[a.type].slice(0, 1) : '·'}</span>
        <div>
          <div class="ai-text">${esc(a.detail)}</div>
          <div class="ai-time">${rel(a.createdAt)}</div>
        </div>
      </div>`).join('') || '<div class="empty"><h4>暂无动态</h4><p>发送第一条消息后，这里会出现记录。</p></div>';

    return `
      <div class="stat-grid">
        <div class="stat-card">
          <div class="s-label">${ICON.user} 联系人</div>
          <div class="s-value">${s.contacts || 0}</div>
          <div class="s-foot">每人独立记忆</div>
        </div>
        <div class="stat-card">
          <div class="s-label">${ICON.chat} 消息总数</div>
          <div class="s-value">${s.messages || 0}</div>
          <div class="s-foot">含对方与你的回复</div>
        </div>
        <div class="stat-card">
          <div class="s-label">${ICON.spark} AI 回复</div>
          <div class="s-value">${s.aiMessages || 0}</div>
          <div class="s-foot">人工发送 ${s.humanMessages || 0} 条</div>
        </div>
        <div class="stat-card">
          <div class="s-label">${ICON.brain} 记忆条目</div>
          <div class="s-value">${s.memories || 0}</div>
          <div class="s-foot">知识库 ${s.knowledge || 0} 条</div>
        </div>
      </div>

      <div class="grid-2">
        <div>
          <div class="assistant-hero" style="margin-bottom:16px">
            <div class="ah-label">${isEmo ? 'EMOTIONAL ASSISTANT' : 'PROCESS ASSISTANT'}</div>
            <h2>${isEmo ? '情感助手' : '流程助手'}</h2>
            <p>${isEmo ? '记住相处的细节，接住每次对话。回复默认以草稿形式给出。' : '把业务资料和办理步骤交给助手，关键进展由你亲自核实。'}</p>
            <div class="ah-actions">
              <a class="btn btn-sm" href="#/chats">${ICON.chat} 去对话</a>
              ${isEmo ? '<a class="btn btn-sm" href="#/memory">管理记忆</a>' : '<a class="btn btn-sm" href="#/flows">管理流程</a>'}
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <h3>最近动态</h3>
              <div class="spacer"></div>
              <a class="small muted" href="#/audit">查看全部</a>
            </div>
            <div class="panel-body tight" style="padding:8px 18px">${audit}</div>
          </div>
        </div>

        <div>
          <div class="panel" style="margin-bottom:16px">
            <div class="panel-head"><h3>今日用量</h3><div class="spacer"></div><span class="badge badge-indigo">${pct}%</span></div>
            <div class="panel-body">
              <div style="display:flex;align-items:baseline;gap:6px">
                <span style="font-size:28px;font-weight:730;letter-spacing:-.03em">${S.usage.today}</span>
                <span class="muted small">/ ${S.usage.limit} 条</span>
              </div>
              <div class="usage-bar"><i style="width:${pct}%"></i></div>
              <div class="kv" style="margin-top:10px"><span class="k">剩余额度</span><span class="v">${S.usage.remaining} 条</span></div>
              <div class="kv"><span class="k">AI 引擎</span><span class="v">${esc(S.engine.model)}</span></div>
              ${S.llm && !S.llm.hasKey ? '<a class="btn btn-ghost btn-block btn-sm" href="#/settings" style="margin-top:10px;border-color:#fcd34d;background:#fffbeb;color:#92400e">还没填模型 Key · 去设置里填一个</a>' : ''}
            </div>
          </div>

          <div class="panel" style="margin-bottom:16px">
            <div class="panel-head"><h3>自动化状态</h3><div class="spacer"></div>
              <span class="badge ${S.settings.automationPaused ? 'badge-amber' : 'badge-green'}">${S.settings.automationPaused ? '已暂停' : '运行中'}</span>
            </div>
            <div class="panel-body">
              <div class="kv"><span class="k">自动发送</span><span class="v">${S.settings.autoSendEnabled ? '已开启' : '未开启'}</span></div>
              <div class="kv"><span class="k">允许时段</span><span class="v">${esc(S.settings.timeWindowStart)} – ${esc(S.settings.timeWindowEnd)}</span></div>
              <div class="kv"><span class="k">Telegram</span><span class="v">${S.telegram.enabled ? (S.telegram.connected ? '@' + esc(S.telegram.username || '') : '已配置') : '未配置'}</span></div>
              <a class="btn btn-ghost btn-block btn-sm" href="#/settings" style="margin-top:12px">调整安全设置</a>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><h3>快速开始</h3></div>
            <div class="panel-body">
              <div class="quick-grid">
                <button class="quick" data-quick="chats">${ICON.chat} 打开对话</button>
                <button class="quick" data-quick="new-contact">${ICON.plus} 新建联系人</button>
                <button class="quick" data-quick="flows">${ICON.flow} 新建流程</button>
                <button class="quick" data-quick="knowledge">${ICON.book} 添加资料</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },
  bind() {
    $$('[data-quick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.quick;
        if (q === 'new-contact') return openContactModal();
        location.hash = `#/${q}`;
      });
    });
  }
};

/* ---------------- 视图：对话 ---------------- */
views.chats = {
  async load() {
    await loadBootstrap();
    if (!S.currentContactId && S.contacts.length) S.currentContactId = S.contacts[0].id;
    if (S.currentContactId) {
      const exists = S.contacts.some((c) => c.id === S.currentContactId);
      if (!exists) S.currentContactId = S.contacts[0] ? S.contacts[0].id : null;
    }
    if (S.currentContactId) await loadThread(S.currentContactId);
    else S.thread = null;
  },
  html() {
    const contacts = S.contacts.filter((c) => !S.search || c.name.includes(S.search) || (c.handle || '').includes(S.search));
    const rows = contacts.map((c) => `
      <div class="contact-row ${c.id === S.currentContactId ? 'active' : ''}" data-contact="${c.id}">
        ${avatar(c.name, c.color)}
        <div class="c-main">
          <div class="c-name">${esc(c.name)} ${c.replyMode === 'auto' ? '<span class="badge badge-amber" style="height:17px;font-size:10px">自动</span>' : ''}</div>
          <div class="c-preview">${c.lastMessage ? esc(c.lastMessage.content) : '暂无消息'}</div>
        </div>
        <div class="c-meta">
          <span class="c-time">${c.lastMessage ? rel(c.lastMessage.createdAt) : ''}</span>
          ${c.pendingDraft ? '<span class="c-dot"></span>' : ''}
        </div>
      </div>`).join('') || `<div class="empty" style="padding:30px 12px"><p>没有匹配的联系人</p></div>`;

    return `
      <div class="chat-layout">
        <div class="chat-col chat-list">
          <div class="chat-col-head">
            <h3>对话</h3>
            <span class="badge">${S.contacts.length}</span>
            <div class="spacer" style="flex:1"></div>
            <button class="btn btn-sm btn-ghost" id="btn-new-contact" title="新建联系人">${ICON.plus}</button>
          </div>
          <div class="chat-search"><input class="input" id="contact-search" placeholder="搜索联系人" value="${esc(S.search)}"></div>
          <div class="contact-list">${rows}</div>
        </div>
        <div class="chat-col">${this.threadHtml()}</div>
        <div class="chat-col chat-ctx">${this.ctxHtml()}</div>
      </div>`;
  },
  threadHtml() {
    const t = S.thread;
    if (!t) {
      return `<div class="empty" style="margin:auto">
        <div class="e-icon">${ICON.chat}</div>
        <h4>还没有联系人</h4>
        <p>先建一个联系人，再模拟对方发来一条消息。</p>
        <button class="btn btn-primary btn-sm" id="btn-empty-contact" style="margin-top:14px">新建联系人</button>
      </div>`;
    }
    const c = t.contact;
    const msgs = t.messages.map((m) => {
      const out = m.role !== 'contact';
      const flag = m.role === 'ai'
        ? `<span class="msg-flag">${m.meta && m.meta.mode === 'auto' ? 'AI 自动发送' : 'AI 回复'}</span>`
        : m.role === 'human' ? '<span class="msg-flag human">人工</span>' : '';
      const mems = m.meta && m.meta.usedMemories && m.meta.usedMemories.length
        ? `<span class="msg-meta">引用记忆：${esc(m.meta.usedMemories[0])}</span>` : '';
      return `<div class="msg ${out ? 'msg-out' : 'msg-in'} ${m.role === 'human' ? 'human' : ''}">
        <div class="msg-bubble">${esc(m.content)}</div>
        <div class="msg-meta">${clock(m.createdAt)} ${flag}</div>
        ${mems}
      </div>`;
    }).join('') || '<div class="empty" style="margin:auto"><p>还没有消息。点击右上角「模拟对方消息」开始。</p></div>';

    const draft = t.pendingDraft ? `
      <div class="draft-box">
        <div class="d-head">
          <span class="badge">${ICON.spark} AI 草稿</span>
          <span class="tiny muted">${t.pendingDraft.engine === 'llm' ? '模型生成' : '本地引擎'}</span>
          <div class="spacer"></div>
          <button class="btn btn-quiet btn-sm" id="draft-ignore" title="忽略">忽略</button>
        </div>
        <div class="draft-text">${esc(t.pendingDraft.content)}</div>
        ${t.pendingDraft.usedMemories && t.pendingDraft.usedMemories.length ? `<div class="draft-mems">${t.pendingDraft.usedMemories.map((m) => `<span class="chip"><b>记忆</b> ${esc(m.text)}</span>`).join('')}</div>` : ''}
        <div class="draft-actions">
          <button class="btn btn-primary btn-sm" id="draft-send">${ICON.send} 采用并发送</button>
          <button class="btn btn-ghost btn-sm" id="draft-fill">填入输入框</button>
          <button class="btn btn-ghost btn-sm" id="draft-regen">重新生成</button>
        </div>
      </div>` : '';

    return `
      <div class="thread">
        <div class="thread-head">
          ${avatar(c.name, c.color)}
          <div>
            <div class="t-name">${esc(c.name)} <span class="badge ${c.channel === 'telegram' ? 'badge-cyan' : 'badge'}">${CHANNEL_LABEL[c.channel] || c.channel}</span></div>
            <div class="t-sub">${esc(c.handle || '未填写账号')} · 回复方式：${MODE_LABEL[c.replyMode]}</div>
          </div>
          <div class="spacer" style="flex:1"></div>
          <button class="btn btn-sm btn-ghost" id="btn-inbound">模拟对方消息</button>
        </div>
        <div class="thread-body" id="thread-body">${msgs}</div>
        ${draft}
        <div class="composer">
          <textarea id="composer" placeholder="输入回复，或先让助手生成草稿…"></textarea>
          <div class="composer-row">
            <button class="btn btn-sm btn-ghost" id="btn-draft">${ICON.spark} 生成草稿</button>
            <button class="btn btn-sm btn-ghost" id="btn-translate">翻译</button>
            <span class="hint">${c.replyMode === 'auto' ? '该联系人已开启自动发送' : '发送前可自由修改'}</span>
            <button class="btn btn-sm btn-primary" id="btn-send">${ICON.send} 发送</button>
          </div>
        </div>
      </div>`;
  },
  ctxHtml() {
    const t = S.thread;
    if (!t) return '';
    const c = t.contact;
    const mems = (t.memories || []).map((m) => `
      <div class="mem-item" data-mem="${m.id}">
        <span class="m-dot"></span>
        <span class="m-text">${esc(m.text)}</span>
        <button class="m-del" data-del-mem="${m.id}" title="删除">${ICON.trash}</button>
      </div>`).join('') || '<div class="tiny muted" style="padding:6px 0">还没有记忆条目</div>';

    const flow = t.flow;
    const flowHtml = flow ? `
      <div class="flow-mini">
        <div class="fm-title">${esc(flow.name)}</div>
        <div class="fm-step">当前：${flow.currentStep ? esc(flow.currentStep.title) : '已全部完成'}（${Math.min(flow.stepIndex + 1, flow.total)}/${flow.total}）</div>
        <div class="fm-bar"><i style="width:${Math.round((flow.stepIndex / Math.max(1, flow.total)) * 100)}%"></i></div>
        <a class="btn btn-sm btn-ghost btn-block" href="#/flows" style="margin-top:10px">查看流程</a>
      </div>` : '<div class="tiny muted">尚未加入任何流程</div>';

    return `
      <div class="ctx-body">
        <div class="ctx-section">
          <div class="ctx-title">回复方式</div>
          <div class="segmented" id="mode-seg">
            <button data-mode="off" class="${c.replyMode === 'off' ? 'active' : ''}">关闭</button>
            <button data-mode="draft" class="${c.replyMode === 'draft' ? 'active' : ''}">AI 草稿</button>
            <button data-mode="auto" class="${c.replyMode === 'auto' ? 'active' : ''}">自动发送</button>
          </div>
          <div class="tiny muted" style="margin-top:7px">${c.replyMode === 'auto' ? '需同时开启全局自动发送，且处于允许时段。' : 'AI 只生成建议，不会自动发出。'}</div>
        </div>

        <div class="ctx-section">
          <div class="ctx-title">人设与边界</div>
          <div class="ctx-card">
            <label class="field" style="margin-bottom:10px">
              <span style="font-size:11.5px">称呼习惯</span>
              <input class="input" id="ctx-address" value="${esc(c.address || '')}" placeholder="例如：小林" style="height:34px;font-size:12.5px">
            </label>
            <div class="field" style="margin-bottom:10px">
              <span style="font-size:11.5px">语气</span>
              <div class="tone-grid" id="ctx-tone">
                ${Object.keys(TONE_LABEL).map((k) => `<button type="button" data-tone="${k}" class="${c.tone === k ? 'active' : ''}">${TONE_LABEL[k]}</button>`).join('')}
              </div>
            </div>
            <label class="field" style="margin-bottom:0">
              <span style="font-size:11.5px">相处边界</span>
              <textarea class="textarea" id="ctx-boundaries" placeholder="哪些话题不聊、什么时间不要打扰" style="min-height:64px;font-size:12.5px">${esc(c.boundaries || '')}</textarea>
            </label>
            <button class="btn btn-sm btn-ghost btn-block" id="ctx-save" style="margin-top:9px">保存设置</button>
          </div>
        </div>

        <div class="ctx-section">
          <div class="ctx-title">长期记忆 <span class="tiny muted">${(t.memories || []).length} 条</span></div>
          <div class="ctx-card">
            ${mems}
            <div class="mem-add">
              <input id="mem-input" placeholder="记一条细节…" maxlength="300">
              <button class="btn btn-sm btn-primary" id="mem-add">${ICON.plus}</button>
            </div>
          </div>
        </div>

        <div class="ctx-section">
          <div class="ctx-title">流程进度</div>
          ${flowHtml}
        </div>
      </div>`;
  },
  bind() {
    const rerender = async () => { await views.chats.load(); render(); };
    $$('[data-contact]').forEach((row) => {
      row.addEventListener('click', async () => {
        S.currentContactId = row.dataset.contact;
        S.draftUsed = null;
        await views.chats.load();
        render();
      });
    });
    const search = $('#contact-search');
    if (search) {
      search.addEventListener('input', () => {
        S.search = search.value.trim();
        const list = $('.contact-list');
        if (list) {
          const filtered = S.contacts.filter((c) => !S.search || c.name.includes(S.search) || (c.handle || '').includes(S.search));
          list.innerHTML = filtered.map((c) => `
            <div class="contact-row ${c.id === S.currentContactId ? 'active' : ''}" data-contact="${c.id}">
              ${avatar(c.name, c.color)}
              <div class="c-main">
                <div class="c-name">${esc(c.name)}</div>
                <div class="c-preview">${c.lastMessage ? esc(c.lastMessage.content) : '暂无消息'}</div>
              </div>
              <div class="c-meta"><span class="c-time">${c.lastMessage ? rel(c.lastMessage.createdAt) : ''}</span></div>
            </div>`).join('');
          $$('[data-contact]').forEach((row) => row.addEventListener('click', async () => {
            S.currentContactId = row.dataset.contact;
            await views.chats.load();
            render();
          }));
        }
      });
    }
    const newBtn = $('#btn-new-contact') || $('#btn-empty-contact');
    if (newBtn) newBtn.addEventListener('click', () => openContactModal());
    const inbound = $('#btn-inbound');
    if (inbound) inbound.addEventListener('click', openInboundModal);

    const body = $('#thread-body');
    if (body) body.scrollTop = body.scrollHeight;

    const draftBtn = $('#btn-draft');
    if (draftBtn) draftBtn.addEventListener('click', async () => {
      draftBtn.disabled = true;
      try {
        await api(`/api/contacts/${S.currentContactId}/draft`, { method: 'POST', body: {} });
        await rerender();
        toast('草稿已生成');
      } catch (e) { toast(e.message, 'err'); }
      finally { draftBtn.disabled = false; }
    });

    const sendBtn = $('#btn-send');
    if (sendBtn) sendBtn.addEventListener('click', async () => {
      const el = $('#composer');
      const content = el.value.trim();
      if (!content) return toast('先写点什么', 'err');
      const isDraft = S.draftUsed && S.draftUsed.content === content;
      sendBtn.disabled = true;
      try {
        await api(`/api/contacts/${S.currentContactId}/send`, {
          method: 'POST',
          body: {
            content,
            source: isDraft ? 'ai' : 'human',
            edited: isDraft ? false : true,
            usedMemories: isDraft ? S.draftUsed.usedMemories.map((m) => m.text) : []
          }
        });
        S.draftUsed = null;
        await rerender();
        toast('已发送');
      } catch (e) { toast(e.message, 'err'); }
      finally { sendBtn.disabled = false; }
    });

    const trBtn = $('#btn-translate');
    if (trBtn) trBtn.addEventListener('click', async () => {
      const el = $('#composer');
      const text = el.value.trim() || (S.thread && S.thread.pendingDraft ? S.thread.pendingDraft.content : '');
      if (!text) return toast('没有可翻译的内容', 'err');
      try {
        const data = await api(`/api/contacts/${S.currentContactId}/translate`, { method: 'POST', body: { text, target: /[\u4e00-\u9fa5]/.test(text) ? 'en' : 'zh' } });
        el.value = data.text;
        toast(data.note ? `翻译：${data.note}` : '已翻译');
      } catch (e) { toast(e.message, 'err'); }
    });

    const dSend = $('#draft-send');
    if (dSend) dSend.addEventListener('click', async () => {
      const d = S.thread.pendingDraft;
      if (!d) return;
      try {
        await api(`/api/contacts/${S.currentContactId}/send`, {
          method: 'POST',
          body: { content: d.content, source: 'ai', usedMemories: d.usedMemories.map((m) => m.text) }
        });
        await rerender();
        toast('已发送');
      } catch (e) { toast(e.message, 'err'); }
    });
    const dFill = $('#draft-fill');
    if (dFill) dFill.addEventListener('click', () => {
      const el = $('#composer');
      el.value = S.thread.pendingDraft.content;
      S.draftUsed = S.thread.pendingDraft;
      el.focus();
    });
    const dRegen = $('#draft-regen');
    if (dRegen) dRegen.addEventListener('click', async () => {
      try {
        await api(`/api/contacts/${S.currentContactId}/draft`, { method: 'POST', body: {} });
        await rerender();
        toast('已重新生成');
      } catch (e) { toast(e.message, 'err'); }
    });
    const dIgnore = $('#draft-ignore');
    if (dIgnore) dIgnore.addEventListener('click', async () => {
      try {
        await api(`/api/contacts/${S.currentContactId}/draft/clear`, { method: 'POST', body: {} });
        await rerender();
      } catch (e) { toast(e.message, 'err'); }
    });

    $$('#mode-seg button').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/api/contacts/${S.currentContactId}`, { method: 'PATCH', body: { replyMode: btn.dataset.mode } });
          await rerender();
          toast(`回复方式：${MODE_LABEL[btn.dataset.mode]}`);
        } catch (e) { toast(e.message, 'err'); }
      });
    });

    $$('#ctx-tone button').forEach((b) => b.addEventListener('click', () => {
      $$('#ctx-tone button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
    }));

    const save = $('#ctx-save');
    if (save) save.addEventListener('click', async () => {
      try {
        await api(`/api/contacts/${S.currentContactId}`, {
          method: 'PATCH',
          body: {
            address: $('#ctx-address').value,
            tone: (($('#ctx-tone .active') && $('#ctx-tone .active').dataset.tone) || 'warm'),
            boundaries: $('#ctx-boundaries').value
          }
        });
        await rerender();
        toast('联系人设置已保存');
      } catch (e) { toast(e.message, 'err'); }
    });

    const addMem = $('#mem-add');
    if (addMem) addMem.addEventListener('click', async () => {
      const input = $('#mem-input');
      const text = input.value.trim();
      if (!text) return;
      try {
        await api(`/api/contacts/${S.currentContactId}/memories`, { method: 'POST', body: { text } });
        await rerender();
        toast('记忆已保存');
      } catch (e) { toast(e.message, 'err'); }
    });
    const memInput = $('#mem-input');
    if (memInput) memInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const b = $('#mem-add'); if (b) b.click(); }
    });
    $$('[data-del-mem]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/api/memories/${btn.dataset.delMem}`, { method: 'DELETE' });
          await rerender();
          toast('记忆已删除');
        } catch (e) { toast(e.message, 'err'); }
      });
    });
  }
};

function openInboundModal() {
  openModal({
    title: '模拟对方发来的消息',
    body: `
      <p class="small muted" style="margin-bottom:12px">用于演示：这条消息会作为「对方」写入对话，并触发助手按当前回复方式处理。</p>
      <label class="field" style="margin-bottom:0">
        <span>消息内容</span>
        <textarea class="textarea" id="inbound-text" placeholder="例如：今天的汇报终于结束了，松了一口气。"></textarea>
      </label>`,
    footer: '<button class="btn btn-ghost" id="inbound-cancel">取消</button><button class="btn btn-primary" id="inbound-ok">写入并生成</button>',
    onMount() {
      const ta = $('#inbound-text');
      ta.focus();
      $('#inbound-cancel').addEventListener('click', closeModal);
      $('#inbound-ok').addEventListener('click', async () => {
        const content = ta.value.trim();
        if (!content) return toast('请输入消息内容', 'err');
        const btn = $('#inbound-ok');
        btn.disabled = true;
        try {
          const data = await api(`/api/contacts/${S.currentContactId}/messages`, { method: 'POST', body: { content } });
          closeModal();
          await views.chats.load();
          render();
          if (data.autoSent) toast('已按自动发送规则回复');
          else if (data.draft) toast('已生成 AI 草稿');
          else if (data.reasons && data.reasons.length) toast(data.reasons[0], 'err');
        } catch (e) {
          toast(e.message, 'err');
          btn.disabled = false;
        }
      });
    }
  });
}

function openContactModal(contact) {
  const editing = Boolean(contact);
  const c = contact || {};
  openModal({
    title: editing ? '编辑联系人' : '新建联系人',
    body: `
      <label class="field"><span>名称</span><input class="input" id="c-name" value="${esc(c.name || '')}" placeholder="例如：小林"></label>
      <label class="field"><span>账号 / 备注</span><input class="input" id="c-handle" value="${esc(c.handle || '')}" placeholder="Telegram 用户名或手机号"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label class="field"><span>渠道</span>
          <select class="select" id="c-channel">
            ${Object.keys(CHANNEL_LABEL).map((k) => `<option value="${k}" ${c.channel === k ? 'selected' : ''}>${CHANNEL_LABEL[k]}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>语气</span>
          <select class="select" id="c-tone">
            ${Object.keys(TONE_LABEL).map((k) => `<option value="${k}" ${c.tone === k ? 'selected' : ''}>${TONE_LABEL[k]}</option>`).join('')}
          </select>
        </label>
      </div>
      <label class="field"><span>回复方式</span>
        <select class="select" id="c-mode">
          <option value="off" ${c.replyMode === 'off' ? 'selected' : ''}>关闭（不生成）</option>
          <option value="draft" ${!c.replyMode || c.replyMode === 'draft' ? 'selected' : ''}>AI 草稿（需人工确认）</option>
          <option value="auto" ${c.replyMode === 'auto' ? 'selected' : ''}>自动发送（需开启全局开关）</option>
        </select>
      </label>
      <label class="field" style="margin-bottom:0"><span>相处边界</span><textarea class="textarea" id="c-bound" placeholder="例如：不追问家庭私事；对方忙时不要连续发消息" style="min-height:70px">${esc(c.boundaries || '')}</textarea></label>`,
    footer: `<button class="btn btn-ghost" id="c-cancel">取消</button><button class="btn btn-primary" id="c-ok">${editing ? '保存' : '创建'}</button>`,
    onMount() {
      $('#c-cancel').addEventListener('click', closeModal);
      $('#c-ok').addEventListener('click', async () => {
        const name = $('#c-name').value.trim();
        if (!name) return toast('请填写名称', 'err');
        const body = {
          name,
          handle: $('#c-handle').value,
          channel: $('#c-channel').value,
          tone: $('#c-tone').value,
          replyMode: $('#c-mode').value,
          boundaries: $('#c-bound').value
        };
        try {
          if (editing) await api(`/api/contacts/${contact.id}`, { method: 'PATCH', body });
          else {
            const data = await api('/api/contacts', { method: 'POST', body });
            S.currentContactId = data.contact.id;
          }
          closeModal();
          await views[S.currentView].load();
          render();
          toast(editing ? '已保存' : '联系人已创建');
        } catch (e) { toast(e.message, 'err'); }
      });
    }
  });
}

/* ---------------- 视图：联系人 ---------------- */
views.contacts = {
  async load() { await loadBootstrap(); },
  html() {
    if (!S.contacts.length) {
      return `<div class="empty"><div class="e-icon">${ICON.user}</div><h4>还没有联系人</h4><p>先建一个联系人，为它单独维护记忆与回复方式。</p></div>`;
    }
    const cards = S.contacts.map((c) => `
      <div class="contact-card">
        <div class="cc-head">
          ${avatar(c.name, c.color)}
          <div style="min-width:0">
            <div class="cc-name">${esc(c.name)}</div>
            <div class="cc-handle">${esc(c.handle || '未填写账号')}</div>
          </div>
        </div>
        <div class="cc-body">
          <div class="cc-row"><span>渠道</span><b>${CHANNEL_LABEL[c.channel] || c.channel}</b></div>
          <div class="cc-row"><span>回复方式</span><b>${MODE_LABEL[c.replyMode]}</b></div>
          <div class="cc-row"><span>记忆 / 消息</span><b>${c.memoryCount} / ${c.messageCount}</b></div>
          <div class="cc-row"><span>最近</span><b>${c.lastMessage ? rel(c.lastMessage.createdAt) : '—'}</b></div>
        </div>
        <div class="cc-actions">
          <button class="btn btn-sm btn-ghost" data-open="${c.id}">${ICON.chat} 对话</button>
          <button class="btn btn-sm btn-ghost" data-edit="${c.id}">${ICON.edit}</button>
          <button class="btn btn-sm btn-danger" data-del="${c.id}">${ICON.trash}</button>
        </div>
      </div>`).join('');
    return `<div class="contact-grid">${cards}</div>`;
  },
  bind() {
    $$('[data-open]').forEach((b) => b.addEventListener('click', () => {
      S.currentContactId = b.dataset.open;
      location.hash = '#/chats';
    }));
    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      openContactModal(S.contacts.find((c) => c.id === b.dataset.edit));
    }));
    $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const c = S.contacts.find((x) => x.id === b.dataset.del);
      if (!confirm(`删除联系人「${c.name}」及其全部消息和记忆？`)) return;
      try {
        await api(`/api/contacts/${c.id}`, { method: 'DELETE' });
        await views.contacts.load();
        render();
        toast('已删除');
      } catch (e) { toast(e.message, 'err'); }
    }));
  }
};

/* ---------------- 视图：记忆 ---------------- */
views.memory = {
  async load() {
    await loadBootstrap();
    const groups = [];
    for (const c of S.contacts) {
      const data = await api(`/api/contacts/${c.id}/memories`);
      groups.push({ contact: c, memories: data.memories });
    }
    S.memoryGroups = groups;
  },
  html() {
    const groups = S.memoryGroups || [];
    if (!groups.length) return `<div class="empty"><div class="e-icon">${ICON.brain}</div><h4>还没有联系人</h4><p>记忆依附于联系人，先创建一个联系人。</p></div>`;
    const blocks = groups.map((g) => `
      <div class="panel" style="margin-bottom:14px">
        <div class="panel-head">
          ${avatar(g.contact.name, g.contact.color)}
          <div>
            <h3>${esc(g.contact.name)}</h3>
            <div class="tiny muted">${g.memories.length} 条记忆 · 仅用于与这个人的对话</div>
          </div>
          <div class="spacer" style="flex:1"></div>
          <button class="btn btn-sm btn-ghost" data-add-mem="${g.contact.id}">${ICON.plus} 添加</button>
        </div>
        <div class="panel-body tight" style="padding:6px 18px 12px">
          ${g.memories.map((m) => `
            <div class="mem-item">
              <span class="m-dot"></span>
              <span class="m-text">${esc(m.text)}</span>
              <span class="tiny muted" style="white-space:nowrap">${rel(m.createdAt)}</span>
              <button class="m-del" data-del-mem="${m.id}" style="opacity:1">${ICON.trash}</button>
            </div>`).join('') || '<div class="tiny muted" style="padding:8px 0">暂无记忆</div>'}
        </div>
      </div>`).join('');
    return `<div class="view-narrow" style="max-width:900px">${blocks}</div>`;
  },
  bind() {
    $$('[data-add-mem]').forEach((b) => b.addEventListener('click', () => {
      const contactId = b.dataset.addMem;
      const c = S.contacts.find((x) => x.id === contactId);
      openModal({
        title: `为「${c.name}」添加记忆`,
        body: `<label class="field" style="margin-bottom:0"><span>记忆内容</span><textarea class="textarea" id="m-text" placeholder="例如：上周提到周三要做项目汇报"></textarea></label>`,
        footer: '<button class="btn btn-ghost" id="m-cancel">取消</button><button class="btn btn-primary" id="m-ok">保存</button>',
        onMount() {
          $('#m-cancel').addEventListener('click', closeModal);
          $('#m-ok').addEventListener('click', async () => {
            const text = $('#m-text').value.trim();
            if (!text) return toast('请输入内容', 'err');
            try {
              await api(`/api/contacts/${contactId}/memories`, { method: 'POST', body: { text } });
              closeModal();
              await views.memory.load();
              render();
              toast('记忆已保存');
            } catch (e) { toast(e.message, 'err'); }
          });
        }
      });
    }));
    $$('[data-del-mem]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api(`/api/memories/${b.dataset.delMem}`, { method: 'DELETE' });
        await views.memory.load();
        render();
      } catch (e) { toast(e.message, 'err'); }
    }));
  }
};

/* ---------------- 视图：流程 ---------------- */
views.flows = {
  async load() {
    await loadBootstrap();
    const data = await api('/api/flows');
    S.flows = data.flows;
    if (!S.currentFlowId && S.flows.length) S.currentFlowId = S.flows[0].id;
    if (S.currentFlowId && !S.flows.some((f) => f.id === S.currentFlowId)) {
      S.currentFlowId = S.flows[0] ? S.flows[0].id : null;
    }
  },
  html() {
    if (!S.flows.length) {
      return `<div class="empty"><div class="e-icon">${ICON.flow}</div><h4>还没有流程</h4><p>把业务办理步骤拆成流程，助手会按步骤引导对方。</p><button class="btn btn-primary btn-sm" id="empty-new-flow" style="margin-top:14px">新建流程</button></div>`;
    }
    const flow = S.flows.find((f) => f.id === S.currentFlowId) || S.flows[0];
    const list = S.flows.map((f) => `
      <div class="flow-item ${f.id === flow.id ? 'active' : ''}" data-flow="${f.id}">
        <div class="fi-name">${esc(f.name)}</div>
        <div class="fi-sub">${f.steps.length} 个步骤 · ${f.progress.length} 位联系人</div>
      </div>`).join('');

    const prog = flow.progress[0];
    const statuses = prog ? prog.statuses || {} : {};
    const steps = flow.steps.map((s, i) => {
      const st = statuses[s.id];
      const isCurrent = prog && prog.stepIndex === i;
      const cls = st === 'verified' ? 'done' : st === 'claimed' ? 'claimed' : isCurrent ? 'current' : '';
      return `<div class="step-node ${cls}">
        <div class="step-idx">${st === 'verified' ? '✓' : i + 1}</div>
        <div class="step-content">
          <div class="st-title">${esc(s.title)}</div>
          <div class="st-desc">${esc(s.desc || '')}</div>
          ${st === 'claimed' ? '<span class="badge badge-amber" style="margin-top:6px">对方自述完成 · 待核实</span>' : ''}
          ${st === 'verified' ? '<span class="badge badge-green" style="margin-top:6px">已核实</span>' : ''}
          ${isCurrent && !st ? '<span class="badge badge-indigo" style="margin-top:6px">当前步骤</span>' : ''}
        </div>
      </div>`;
    }).join('');

    const progressRows = flow.progress.map((p) => {
      const cur = p.currentStep;
      const st = p.statuses && cur ? p.statuses[cur.id] : null;
      return `<tr>
        <td><b>${esc(p.contactName)}</b></td>
        <td>${cur ? esc(cur.title) : '已完成'}</td>
        <td>${st === 'verified' ? '<span class="badge badge-green">已核实</span>' : st === 'claimed' ? '<span class="badge badge-amber">对方自述</span>' : '<span class="badge">待推进</span>'}</td>
        <td style="text-align:right;white-space:nowrap">
          ${cur ? `<button class="btn btn-sm btn-ghost" data-flow-act="claimed" data-contact="${p.contactId}" data-step="${cur.id}">对方自述</button>
          <button class="btn btn-sm btn-primary" data-flow-act="verified" data-contact="${p.contactId}" data-step="${cur.id}">已核实</button>` : ''}
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="4" class="muted small">还没有联系人进入此流程</td></tr>';

    const options = S.contacts.filter((c) => !flow.progress.some((p) => p.contactId === c.id))
      .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

    return `
      <div class="flow-layout">
        <div>
          <div class="flow-list">${list}</div>
          <button class="btn btn-ghost btn-block btn-sm" id="btn-new-flow" style="margin-top:10px">${ICON.plus} 新建流程</button>
        </div>
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>${esc(flow.name)}</h3>
              <div class="tiny muted">${esc(flow.description || '')}</div>
            </div>
            <div class="spacer" style="flex:1"></div>
            <button class="btn btn-sm btn-danger" id="btn-del-flow">删除流程</button>
          </div>
          <div class="panel-body">
            <div class="steps-timeline">${steps}</div>
            <div style="border-top:1px solid var(--line-2);margin:18px 0 14px"></div>
            <div class="ctx-title" style="font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted-2);margin-bottom:8px">联系人进度</div>
            <table class="progress-table">
              <tbody>${progressRows}</tbody>
            </table>
            ${options ? `<div style="display:flex;gap:8px;margin-top:14px">
              <select class="select" id="flow-add-contact" style="height:36px;font-size:12.5px">${options}</select>
              <button class="btn btn-sm btn-primary" id="flow-add-btn">加入流程</button>
            </div>` : ''}
          </div>
        </div>
      </div>`;
  },
  bind() {
    $$('[data-flow]').forEach((el) => el.addEventListener('click', () => {
      S.currentFlowId = el.dataset.flow;
      render();
    }));
    const nf = $('#btn-new-flow') || $('#empty-new-flow');
    if (nf) nf.addEventListener('click', openFlowModal);
    const del = $('#btn-del-flow');
    if (del) del.addEventListener('click', async () => {
      const flow = S.flows.find((f) => f.id === S.currentFlowId);
      if (!confirm(`删除流程「${flow.name}」？`)) return;
      try {
        await api(`/api/flows/${flow.id}`, { method: 'DELETE' });
        S.currentFlowId = null;
        await views.flows.load();
        render();
        toast('已删除');
      } catch (e) { toast(e.message, 'err'); }
    });
    $$('[data-flow-act]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api(`/api/flows/${S.currentFlowId}/advance`, {
          method: 'POST',
          body: { contactId: b.dataset.contact, stepId: b.dataset.step, state: b.dataset.flowAct }
        });
        await views.flows.load();
        render();
        toast(b.dataset.flowAct === 'verified' ? '已标记为核实' : '已记录对方自述');
      } catch (e) { toast(e.message, 'err'); }
    }));
    const addBtn = $('#flow-add-btn');
    if (addBtn) addBtn.addEventListener('click', async () => {
      const contactId = $('#flow-add-contact').value;
      try {
        await api(`/api/flows/${S.currentFlowId}/select`, { method: 'POST', body: { contactId } });
        await views.flows.load();
        render();
        toast('已加入流程');
      } catch (e) { toast(e.message, 'err'); }
    });
  }
};

function openFlowModal() {
  openModal({
    title: '新建流程',
    body: `
      <label class="field"><span>流程名称</span><input class="input" id="f-name" placeholder="例如：企业版开通流程"></label>
      <label class="field"><span>说明（可选）</span><input class="input" id="f-desc" placeholder="一句话描述这个流程"></label>
      <div class="field" style="margin-bottom:6px"><span>步骤（每行一个，可用「|」分隔标题与说明）</span>
        <textarea class="textarea" id="f-steps" style="min-height:110px" placeholder="确认需求与账号数|确认套餐档位与渠道&#10;提交主体资料|营业执照与开票信息&#10;资料审核&#10;开通与交付"></textarea>
      </div>
      <p class="tiny muted">提示：第一行是第一步。流程会按顺序引导对方。</p>`,
    footer: '<button class="btn btn-ghost" id="f-cancel">取消</button><button class="btn btn-primary" id="f-ok">创建</button>',
    onMount() {
      $('#f-cancel').addEventListener('click', closeModal);
      $('#f-ok').addEventListener('click', async () => {
        const name = $('#f-name').value.trim();
        if (!name) return toast('请填写流程名称', 'err');
        const steps = $('#f-steps').value.split('\n').map((line) => {
          const [title, ...rest] = line.split('|');
          return { title: title.trim(), desc: rest.join('|').trim() };
        }).filter((s) => s.title);
        if (!steps.length) return toast('至少需要一个步骤', 'err');
        try {
          const data = await api('/api/flows', { method: 'POST', body: { name, description: $('#f-desc').value, steps } });
          S.currentFlowId = data.flow.id;
          closeModal();
          await views.flows.load();
          render();
          toast('流程已创建');
        } catch (e) { toast(e.message, 'err'); }
      });
    }
  });
}

/* ---------------- 视图：知识库 ---------------- */
views.knowledge = {
  async load() {
    await loadBootstrap();
    const data = await api('/api/knowledge');
    S.knowledge = data.knowledge;
  },
  html() {
    if (!S.knowledge.length) {
      return `<div class="empty"><div class="e-icon">${ICON.book}</div><h4>知识库是空的</h4><p>把套餐说明、办理材料、常见问答放进来，助手回复时会引用。</p><button class="btn btn-primary btn-sm" id="empty-add-k" style="margin-top:14px">添加资料</button></div>`;
    }
    const rows = S.knowledge.map((k) => `
      <div class="list-row">
        <div class="lr-main">
          <div class="lr-title">${esc(k.title)}</div>
          <div class="lr-sub">${esc(k.content.slice(0, 160))}${k.content.length > 160 ? '…' : ''}</div>
          <div class="tiny muted" style="margin-top:5px">${rel(k.createdAt)}</div>
        </div>
        <div class="lr-actions"><button class="btn btn-sm btn-danger" data-del-k="${k.id}">${ICON.trash}</button></div>
      </div>`).join('');
    return `<div class="view-narrow" style="max-width:860px"><div class="list-card">${rows}</div></div>`;
  },
  bind() {
    $$('[data-del-k]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('删除这条资料？')) return;
      try {
        await api(`/api/knowledge/${b.dataset.delK}`, { method: 'DELETE' });
        await views.knowledge.load();
        render();
        toast('已删除');
      } catch (e) { toast(e.message, 'err'); }
    }));
    const add = $('#empty-add-k');
    if (add) add.addEventListener('click', openKnowledgeModal);
  }
};

function openKnowledgeModal() {
  openModal({
    title: '添加资料',
    body: `
      <label class="field"><span>标题</span><input class="input" id="k-title" placeholder="例如：企业版套餐与开票说明"></label>
      <label class="field" style="margin-bottom:0"><span>内容</span><textarea class="textarea" id="k-content" style="min-height:140px" placeholder="把事实写清楚：价格、包含项、时限、需要材料。助手只会引用这里的内容。"></textarea></label>`,
    footer: '<button class="btn btn-ghost" id="k-cancel">取消</button><button class="btn btn-primary" id="k-ok">保存</button>',
    onMount() {
      $('#k-cancel').addEventListener('click', closeModal);
      $('#k-ok').addEventListener('click', async () => {
        const title = $('#k-title').value.trim();
        const content = $('#k-content').value.trim();
        if (!title || !content) return toast('标题与内容都要填', 'err');
        try {
          await api('/api/knowledge', { method: 'POST', body: { title, content } });
          closeModal();
          await views.knowledge.load();
          render();
          toast('资料已保存');
        } catch (e) { toast(e.message, 'err'); }
      });
    }
  });
}

/* ---------------- 视图：审计 ---------------- */
views.audit = {
  async load() {
    const data = await api(`/api/audit?type=${encodeURIComponent(S.auditFilter)}`);
    S.auditAll = data.audit;
  },
  html() {
    const types = ['all', 'ai', 'send', 'memory', 'flow', 'settings', 'contact', 'auth'];
    const chips = types.map((t) => `<button class="btn btn-sm ${S.auditFilter === t ? 'btn-primary' : 'btn-ghost'}" data-filter="${t}">${t === 'all' ? '全部' : AUDIT_LABEL[t]}</button>`).join('');
    const rows = (S.auditAll || []).map((a) => `
      <tr>
        <td class="t-type"><span class="badge ${AUDIT_BADGE[a.type] || 'badge'}">${AUDIT_LABEL[a.type] || a.type}</span></td>
        <td>${esc(a.detail)}</td>
        <td class="muted small" style="white-space:nowrap">${rel(a.createdAt)}</td>
      </tr>`).join('') || '<tr><td colspan="3" class="muted small" style="padding:30px;text-align:center">暂无记录</td></tr>';
    return `
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:16px">${chips}</div>
      <div class="list-card">
        <table class="tbl">
          <thead><tr><th style="width:110px">类型</th><th>内容</th><th style="width:110px">时间</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },
  bind() {
    $$('[data-filter]').forEach((b) => b.addEventListener('click', async () => {
      S.auditFilter = b.dataset.filter;
      await views.audit.load();
      render();
    }));
  }
};

/* ---------------- 视图：设置 ---------------- */
/* ---------------- 设置：AI 模型面板 ---------------- */
function llmBadge() {
  const l = S.llm || {};
  if (!l.hasKey) return '<span class="badge">未配置 · 本地引擎</span>';
  if (l.lastTest && l.lastTest.ok) return '<span class="badge badge-green">连接正常</span>';
  if (l.lastTest && !l.lastTest.ok) return '<span class="badge badge-amber">上次测试失败</span>';
  return '<span class="badge badge-green">已配置 Key</span>';
}

function llmPanelHtml() {
  const l = S.llm || {};
  const presets = S.presets || [];
  const matched = presets.find((p) => p.baseUrl && l.baseUrl && p.baseUrl.replace(/\/+$/, '') === String(l.baseUrl).replace(/\/+$/, ''))
    || presets.find((p) => p.id === l.provider)
    || null;
  const opts = presets.map((p) => `<option value="${esc(p.id)}"${matched && matched.id === p.id ? ' selected' : ''}>${esc(p.label)}</option>`).join('');
  const modelList = ((matched && matched.models) || []).map((m) => `<option value="${esc(m)}"></option>`).join('');
  const keyUrl = matched && matched.keyUrl;
  const last = l.lastTest;

  return `
    <div class="panel">
      <div class="panel-head"><h3>AI 模型</h3><div class="spacer" style="flex:1"></div><span id="llm-badge-slot">${llmBadge()}</span></div>
      <div class="panel-body">
        <div class="tiny muted" style="line-height:1.8;margin-bottom:12px">
          填<b>你自己的</b>模型 Key。它只存在这台服务器的 <span class="mono">data/</span> 里（AES-256-GCM 加密），不会写进部署文件，也不会回传给浏览器。不填也能用，系统会退回本地规则引擎。
        </div>
        <label class="field" style="margin-bottom:10px"><span>服务商</span>
          <select class="input" id="llm-provider">${opts}</select>
        </label>
        <label class="field" style="margin-bottom:10px"><span>接口地址（Base URL）</span>
          <input class="input" id="llm-base" value="${esc(l.baseUrl || '')}" placeholder="https://api.groq.com/openai/v1">
        </label>
        <label class="field" style="margin-bottom:10px"><span>模型名</span>
          <input class="input" id="llm-model" value="${esc(l.model || '')}" list="llm-models" placeholder="qwen/qwen3.8-27b">
          <datalist id="llm-models">${modelList}</datalist>
        </label>
        <label class="field" style="margin-bottom:8px"><span>API Key</span>
          <input class="input" id="llm-key" type="password" autocomplete="new-password" spellcheck="false"
                 placeholder="${l.hasKey ? `已保存 ${esc(l.keyMask)} · 留空表示不修改` : '粘贴你的 API Key'}">
        </label>
        <div class="tiny muted" style="line-height:1.7;margin-bottom:12px">
          ${keyUrl ? `没有 Key？去 <a href="${esc(keyUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--indigo)">${esc(matched.label)}</a> 免费申请一个。` : '支持任意 OpenAI 兼容接口，包括本地 Ollama（如 http://127.0.0.1:11434/v1）。'}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="llm-save">保存</button>
          <button class="btn btn-ghost btn-sm" id="llm-test">测试连接</button>
          ${l.hasKey ? '<button class="btn btn-danger btn-sm" id="llm-clear">清除 Key</button>' : ''}
        </div>
        <div id="llm-result" style="margin-top:10px">
          ${last ? `<div class="tiny ${last.ok ? '' : 'muted'}" style="color:${last.ok ? 'var(--green)' : 'var(--red)'}">
            ${last.ok ? '上次测试通过' : '上次测试失败'} · ${esc(last.model || '')} · ${rel(last.at)}${last.ok ? '' : ` · ${esc(last.error || '')}`}
          </div>` : ''}
        </div>
      </div>
    </div>`;
}

function bindLlmPanel() {
  const provider = $('#llm-provider');
  const base = $('#llm-base');
  const model = $('#llm-model');
  const key = $('#llm-key');
  const result = $('#llm-result');
  if (!provider || !base || !model || !key) return;

  provider.addEventListener('change', () => {
    const p = (S.presets || []).find((x) => x.id === provider.value);
    if (!p || p.id === 'custom') return;
    base.value = p.baseUrl;
    model.value = p.model;
    const list = $('#llm-models');
    if (list) list.innerHTML = (p.models || []).map((m) => `<option value="${esc(m)}"></option>`).join('');
  });

  function payload() {
    return {
      provider: provider.value,
      baseUrl: base.value,
      model: model.value,
      apiKey: key.value.trim()
    };
  }

  function busy(on, label) {
    const btns = ['#llm-save', '#llm-test', '#llm-clear'].map((s) => $(s)).filter(Boolean);
    btns.forEach((b) => { b.disabled = on; });
    if (on && result) result.innerHTML = `<div class="tiny muted">${esc(label)}</div>`;
    return btns;
  }

  $('#llm-save').addEventListener('click', async () => {
    const btns = busy(true, '保存中…');
    try {
      const data = await api('/api/llm', { method: 'PATCH', body: payload() });
      S.llm = data.llm;
      S.engine = data.llm.engine;
      await loadBootstrap();
      render();
      toast('模型配置已保存');
    } catch (e) {
      toast(e.message, 'err');
      btns.forEach((b) => { b.disabled = false; });
      if (result) result.innerHTML = `<div class="tiny" style="color:var(--red)">${esc(e.message)}</div>`;
    }
  });

  $('#llm-test').addEventListener('click', async () => {
    busy(true, '正在请求模型，最多等 30 秒…');
    try {
      const r = await api('/api/llm/test', { method: 'POST', body: payload() });
      S.llm = (await api('/api/llm')).llm;
      if (r.ok) {
        result.innerHTML = `<div class="tiny" style="color:var(--green)">连接成功 · ${esc(r.model)} · ${r.latencyMs}ms · 返回「${esc(r.sample || '')}」</div>`;
        toast('连接成功');
      } else {
        result.innerHTML = `<div class="tiny" style="color:var(--red)">${esc(r.error || '连接失败')}</div>`;
        toast('连接失败', 'err');
      }
    } catch (e) {
      toast(e.message, 'err');
      result.innerHTML = `<div class="tiny" style="color:var(--red)">${esc(e.message)}</div>`;
    } finally {
      ['#llm-save', '#llm-test', '#llm-clear'].map((s) => $(s)).filter(Boolean).forEach((b) => { b.disabled = false; });
      const badge = $('#llm-badge-slot');
      if (badge) badge.innerHTML = llmBadge();
    }
  });

  const clear = $('#llm-clear');
  if (clear) clear.addEventListener('click', async () => {
    if (!confirm('清除后该账号会退回本地规则引擎，确定吗？')) return;
    try {
      const data = await api('/api/llm', { method: 'DELETE' });
      S.llm = data.llm;
      await loadBootstrap();
      render();
      toast('Key 已清除');
    } catch (e) { toast(e.message, 'err'); }
  });
}

views.settings = {
  async load() {
    await loadBootstrap();
    const u = await api('/api/usage');
    S.usageDays = u.days;
  },
  html() {
    const s = S.settings;
    const max = Math.max(1, ...S.usageDays.map((d) => d.count));
    const chart = S.usageDays.map((d) => `
      <div class="ucol">
        <div class="ubar" style="height:${Math.max(3, Math.round((d.count / max) * 100))}%" title="${d.count} 条"></div>
        <span>${d.date.slice(5)}</span>
      </div>`).join('');

    return `
      <div class="settings-grid">
        <div class="panel">
          <div class="panel-head"><h3>工作区</h3></div>
          <div class="panel-body">
            <label class="field" style="margin-bottom:10px"><span>工作区名称</span><input class="input" id="s-ws" value="${esc(S.user.workspaceName)}"></label>
            <label class="field" style="margin-bottom:0"><span>助手类型（不可更改）</span>
              <input class="input" value="${S.user.assistantType === 'process' ? '流程助手' : '情感助手'}" disabled style="background:#f8fafc;color:var(--muted)">
            </label>
          </div>
        </div>

        ${llmPanelHtml()}

        <div class="panel">
          <div class="panel-head"><h3>自动化与安全</h3><div class="spacer" style="flex:1"></div><span class="badge ${s.automationPaused ? 'badge-amber' : 'badge-green'}">${s.automationPaused ? '全局暂停' : '运行中'}</span></div>
          <div class="panel-body">
            <div class="setting-row">
              <div class="sr-main"><div class="sr-title">全局暂停</div><div class="sr-desc">打开后所有自动发送立即停止，草稿仍可生成。</div></div>
              <div class="sr-control"><button class="switch ${s.automationPaused ? 'on amber' : ''}" data-toggle="automationPaused" style="margin-left:auto"></button></div>
            </div>
            <div class="setting-row">
              <div class="sr-main"><div class="sr-title">允许自动发送</div><div class="sr-desc">总开关。只有联系人单独设为「自动发送」时才会真正发出。</div></div>
              <div class="sr-control"><button class="switch ${s.autoSendEnabled ? 'on' : ''}" data-toggle="autoSendEnabled" style="margin-left:auto"></button></div>
            </div>
            <div class="setting-row">
              <div class="sr-main"><div class="sr-title">允许发送时段</div><div class="sr-desc">时段外只生成草稿，不自动发送。</div></div>
              <div class="sr-control" style="display:flex;gap:6px">
                <input class="input" id="s-start" value="${esc(s.timeWindowStart)}" style="height:34px;font-size:12.5px">
                <input class="input" id="s-end" value="${esc(s.timeWindowEnd)}" style="height:34px;font-size:12.5px">
              </div>
            </div>
            <div class="setting-row">
              <div class="sr-main"><div class="sr-title">每日回复上限</div><div class="sr-desc">达到上限后停止自动发送，避免异常刷屏。</div></div>
              <div class="sr-control"><input class="input" id="s-limit" type="number" min="1" max="5000" value="${s.dailyLimit}" style="height:34px"></div>
            </div>
            <div class="setting-row">
              <div class="sr-main"><div class="sr-title">禁止话题</div><div class="sr-desc">用逗号分隔。命中后不生成也不发送，只留审计记录。</div></div>
              <div class="sr-control"><input class="input" id="s-forbidden" value="${esc(s.forbiddenTopics)}" placeholder="例如：借钱, 转账" style="height:34px;font-size:12.5px"></div>
            </div>
            <div class="setting-row">
              <div class="sr-main"><div class="sr-title">翻译</div><div class="sr-desc">允许在对话中一键翻译草稿或输入内容。</div></div>
              <div class="sr-control"><button class="switch ${s.translationEnabled ? 'on' : ''}" data-toggle="translationEnabled" style="margin-left:auto"></button></div>
            </div>
            <div class="setting-row">
              <div class="sr-main"><div class="sr-title">AI 辅助声明</div><div class="sr-desc">建议对私密关系保持开启，向对方说明有 AI 参与。</div></div>
              <div class="sr-control"><button class="switch ${s.discloseAI ? 'on' : ''}" data-toggle="discloseAI" style="margin-left:auto"></button></div>
            </div>
            <button class="btn btn-primary btn-sm" id="s-save" style="margin-top:14px">保存设置</button>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h3>近 7 日用量</h3><div class="spacer" style="flex:1"></div><span class="badge">上限 ${s.dailyLimit}/天</span></div>
          <div class="panel-body">
            <div class="usage-chart">${chart}</div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h3>运行环境</h3></div>
          <div class="panel-body">
            <div class="kv"><span class="k">AI 引擎</span><span class="v">${S.engine.engine === 'llm' ? esc(S.engine.model) : '本地规则引擎'}</span></div>
            <div class="kv"><span class="k">模型地址</span><span class="v tiny">${esc(S.engine.baseUrl || '未配置')}</span></div>
            <div class="kv"><span class="k">Key 来源</span><span class="v tiny">${S.llm && S.llm.hasKey ? '本账号自行填写（加密存储）' : '未填写'}</span></div>
            <div class="kv"><span class="k">Telegram 通道</span><span class="v">${S.telegram.enabled ? (S.telegram.connected ? '已连接 @' + esc(S.telegram.username || '') : '已配置，未连上') : '未配置'}</span></div>
            <div class="kv"><span class="k">通道模式</span><span class="v">Bot API（非个人号凭证）</span></div>
            <div class="panel" style="margin-top:14px;background:#fbfcfe;box-shadow:none">
              <div class="panel-body">
                <div class="tiny muted" style="line-height:1.8">
                  启用 Telegram：在 @BotFather 创建机器人，把 Token 写入项目根目录 <span class="mono">.env</span> 的 <span class="mono">TELEGRAM_BOT_TOKEN</span>，重启服务。机器人只会收到主动与它对话的用户消息，不会读取你的私人聊天。
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },
  bind() {
    bindLlmPanel();
    $$('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      const key = b.dataset.toggle;
      const next = !S.settings[key];
      b.classList.toggle('on', next);
      if (key === 'automationPaused') b.classList.toggle('amber', next);
      try {
        const data = await api('/api/settings', { method: 'PATCH', body: { [key]: next } });
        S.settings = data.settings;
        syncChrome();
        toast('已更新');
      } catch (e) {
        toast(e.message, 'err');
        b.classList.toggle('on', !next);
      }
    }));
    const save = $('#s-save');
    if (save) save.addEventListener('click', async () => {
      try {
        const [data] = await Promise.all([
          api('/api/settings', {
            method: 'PATCH',
            body: {
              timeWindowStart: $('#s-start').value,
              timeWindowEnd: $('#s-end').value,
              dailyLimit: Number($('#s-limit').value),
              forbiddenTopics: $('#s-forbidden').value
            }
          }),
          api('/api/workspace', { method: 'PATCH', body: { workspaceName: $('#s-ws').value } })
        ]);
        S.settings = data.settings;
        await loadBootstrap();
        toast('设置已保存');
      } catch (e) { toast(e.message, 'err'); }
    });
  }
};

/* ---------------- 助手选择引导 ---------------- */
function showAssistantOnboarding() {
  openModal({
    title: '先选一个助手',
    closable: false,
    body: `
      <p class="small muted" style="margin-bottom:16px">每个账号首次确认一种助手，之后不可更改。不同账号的资料与记忆独立管理。</p>
      <div style="display:grid;gap:10px">
        <button class="quick" data-pick="emotional" style="padding:16px;align-items:flex-start;text-align:left">
          <span style="width:34px;height:34px;border-radius:10px;background:#eef0ff;color:#4f46e5;display:grid;place-items:center;flex-shrink:0">${ICON.spark}</span>
          <span><b style="display:block;font-size:14px">情感助手</b><span class="tiny muted">记住共同经历与相处习惯，回复更像你本人。</span></span>
        </button>
        <button class="quick" data-pick="process" style="padding:16px;align-items:flex-start;text-align:left">
          <span style="width:34px;height:34px;border-radius:10px;background:#e6f7fb;color:#0891b2;display:grid;place-items:center;flex-shrink:0">${ICON.flow}</span>
          <span><b style="display:block;font-size:14px">流程助手</b><span class="tiny muted">按业务资料引导对方走完办理步骤，关键进展交你核实。</span></span>
        </button>
      </div>
      <p class="tiny muted" style="margin-top:14px">选好后会载入演示数据，你可以随时删除。</p>`,
    footer: '',
    onMount(body) {
      $$('[data-pick]', body).forEach((b) => b.addEventListener('click', async () => {
        try {
          await api('/api/workspace/assistant', { method: 'POST', body: { type: b.dataset.pick } });
          modalClosable = true;
          closeModal();
          await loadBootstrap();
          location.hash = '#/overview';
          render();
          toast('助手已启用');
        } catch (e) { toast(e.message, 'err'); }
      }));
    }
  });
}

/* ---------------- 顶栏动作 ---------------- */
function topbarActions() {
  switch (S.currentView) {
    case 'contacts':
      return '<button class="btn btn-sm btn-primary" data-tb="new-contact">新建联系人</button>';
    case 'flows':
      return '<button class="btn btn-sm btn-primary" data-tb="new-flow">新建流程</button>';
    case 'knowledge':
      return '<button class="btn btn-sm btn-primary" data-tb="new-knowledge">添加资料</button>';
    case 'chats':
      return '<button class="btn btn-sm btn-ghost" data-tb="new-contact">新建联系人</button>';
    case 'overview':
      return '<button class="btn btn-sm btn-ghost" data-tb="refresh">刷新</button>';
    default:
      return '';
  }
}

function bindTopbar() {
  $$('[data-tb]').forEach((b) => b.addEventListener('click', async () => {
    const a = b.dataset.tb;
    if (a === 'new-contact') openContactModal();
    if (a === 'new-flow') openFlowModal();
    if (a === 'new-knowledge') openKnowledgeModal();
    if (a === 'refresh') { await views.overview.load(); render(); toast('已刷新'); }
  }));
}

/* ---------------- 路由与渲染 ---------------- */
async function render() {
  const name = S.currentView;
  const view = views[name] || views.overview;
  const meta = VIEW_META[name] || VIEW_META.overview;
  $('#page-title').textContent = meta[0];
  $('#page-crumb').textContent = meta[1];
  $('#topbar-actions').innerHTML = topbarActions();
  bindTopbar();
  $$('.sb-item').forEach((el) => el.classList.toggle('active', el.dataset.view === name));
  try {
    await view.load();
    $('#view').innerHTML = view.html();
    if (view.bind) view.bind();
    syncChrome();
  } catch (e) {
    if (e.message !== '登录已失效') {
      $('#view').innerHTML = `<div class="empty"><h4>加载失败</h4><p>${esc(e.message)}</p></div>`;
    }
  }
}

function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'overview';
  S.currentView = views[h] ? h : 'overview';
  render();
}

window.addEventListener('hashchange', route);

$('#logout').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch (_) {}
  location.href = '/login';
});

(async function init() {
  try {
    await loadBootstrap();
    if (!S.user.assistantType) showAssistantOnboarding();
    route();
  } catch (e) {
    if (e.message !== '登录已失效') {
      $('#view').innerHTML = `<div class="empty"><h4>无法加载工作区</h4><p>${esc(e.message)}</p></div>`;
    }
  }
})();
