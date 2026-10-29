'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- 环境变量（必须在加载业务模块之前）----------
(function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
})();

const db = require('./lib/db');
const { hashPassword, verifyPassword, newToken } = require('./lib/auth');
const ai = require('./lib/ai');
const secret = require('./lib/secret');
const telegram = require('./lib/telegram');

const PORT = Number(process.env.PORT || 5173);
// 容器/PaaS 会给 PORT，此时必须监听 0.0.0.0；本地默认只监听回环
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_DAYS = 7;
const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version || '0.0.0';
  } catch (_) {
    return '0.0.0';
  }
})();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

// ---------- 基础工具 ----------
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function ok(res, data = {}) {
  sendJson(res, 200, { ok: true, ...data });
}

function fail(res, status, message, extra = {}) {
  sendJson(res, status, { ok: false, error: message, ...extra });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 512 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(new Error('JSON 解析失败'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/** 反向代理后面走 HTTPS 时，Cookie 要带 Secure */
function isSecureReq(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (proto === 'https') return true;
  return Boolean(req.socket && req.socket.encrypted);
}

function cookieAttrs(req) {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (isSecureReq(req)) parts.push('Secure');
  return parts;
}

function setCookie(req, res, name, value, maxAge) {
  const parts = [`${name}=${encodeURIComponent(value)}`, ...cookieAttrs(req), `Max-Age=${maxAge}`];
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearCookie(req, res, name) {
  res.setHeader('Set-Cookie', [`${name}=`, ...cookieAttrs(req), 'Max-Age=0'].join('; '));
}

function sessionUser(req) {
  const token = parseCookies(req).dsc_session;
  if (!token) return null;
  const data = db.load();
  const session = data.sessions[token];
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    delete data.sessions[token];
    db.save();
    return null;
  }
  return data.users.find((u) => u.id === session.userId) || null;
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    workspaceName: u.workspaceName,
    assistantType: u.assistantType,
    createdAt: u.createdAt
  };
}

function audit(userId, type, detail, meta = {}) {
  db.mutate((d) => {
    d.audit.unshift({
      id: db.id(),
      userId,
      type,
      detail,
      meta,
      createdAt: db.now()
    });
    if (d.audit.length > 2000) d.audit.length = 2000;
  });
}

function getSettings(userId) {
  const data = db.load();
  let s = data.settings.find((x) => x.userId === userId);
  if (!s) {
    s = {
      userId,
      automationPaused: true,
      autoSendEnabled: false,
      timeWindowStart: '08:00',
      timeWindowEnd: '23:00',
      dailyLimit: 1000,
      forbiddenTopics: '',
      translationEnabled: true,
      discloseAI: true,
      replyLanguage: 'zh-CN',
      updatedAt: db.now()
    };
    data.settings.push(s);
    db.save();
  }
  return s;
}

function getUsage(userId) {
  const data = db.load();
  const day = db.today();
  let row = data.usage.find((u) => u.userId === userId && u.date === day);
  if (!row) {
    row = { userId, date: day, count: 0 };
    data.usage.push(row);
    db.save();
  }
  return row;
}

/**
 * 读取该用户自己的模型配置（内部使用，含解密后的 Key）
 * 没有配置时 apiKey 为空，引擎会自动降级到本地规则引擎
 */
function getLlm(userId) {
  const data = db.load();
  const row = data.llmConfigs.find((x) => x.userId === userId);
  if (!row) return ai.normalizeLlm(null);
  return ai.normalizeLlm({
    baseUrl: row.baseUrl,
    model: row.model,
    apiKey: secret.decrypt(row.apiKeyEnc)
  });
}

/** 返回给前端的版本：只给掩码，绝不返回明文 Key */
function publicLlm(userId) {
  const data = db.load();
  const row = data.llmConfigs.find((x) => x.userId === userId);
  const cfg = getLlm(userId);
  return {
    provider: (row && row.provider) || 'groq',
    baseUrl: (row && row.baseUrl) || ai.DEFAULT_BASE_URL,
    model: (row && row.model) || ai.DEFAULT_MODEL,
    hasKey: Boolean(cfg.apiKey),
    keyMask: secret.maskKey(cfg.apiKey),
    updatedAt: (row && row.updatedAt) || null,
    lastTest: (row && row.lastTest) || null,
    engine: ai.engineInfo(cfg)
  };
}

function inWindow(settings) {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = String(settings.timeWindowStart || '00:00').split(':').map(Number);
  const [eh, em] = String(settings.timeWindowEnd || '23:59').split(':').map(Number);
  const start = sh * 60 + (sm || 0);
  const end = eh * 60 + (em || 0);
  if (start === end) return true;
  if (start < end) return cur >= start && cur <= end;
  return cur >= start || cur <= end;
}

const byTime = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

function contactOut(c, data) {
  const memories = data.memories.filter((m) => m.contactId === c.id);
  const messages = data.messages.filter((m) => m.contactId === c.id).sort(byTime);
  const last = messages[messages.length - 1];
  return {
    ...c,
    memoryCount: memories.length,
    messageCount: messages.length,
    lastMessage: last ? { content: last.content, role: last.role, createdAt: last.createdAt } : null
  };
}

function flowContext(userId, contactId) {
  const data = db.load();
  const prog = data.progress.find((p) => p.userId === userId && p.contactId === contactId);
  if (!prog) return null;
  const flow = data.flows.find((f) => f.id === prog.flowId);
  if (!flow) return null;
  return {
    id: flow.id,
    name: flow.name,
    currentStep: flow.steps[prog.stepIndex] || null,
    stepIndex: prog.stepIndex,
    total: flow.steps.length,
    statuses: prog.statuses || {}
  };
}

// ---------- 路由 ----------
const routes = [];
function route(method, pattern, handler) {
  routes.push({ method, segments: pattern.split('/').filter(Boolean), handler });
}

function matchRoute(method, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method) continue;
    if (r.segments.length !== parts.length) continue;
    const params = {};
    let hit = true;
    for (let i = 0; i < r.segments.length; i++) {
      const seg = r.segments[i];
      if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]);
      else if (seg !== parts[i]) { hit = false; break; }
    }
    if (hit) return { handler: r.handler, params };
  }
  return null;
}

function requireUser(req, res) {
  const user = sessionUser(req);
  if (!user) {
    fail(res, 401, '请先登录');
    return null;
  }
  return user;
}

// ---- 认证 ----
const loginAttempts = new Map();

route('POST', '/api/auth/register', async (req, res, params, body) => {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, '邮箱格式不正确');
  if (password.length < 8) return fail(res, 400, '密码至少 8 位');
  if (password.length > 128) return fail(res, 400, '密码过长');

  const data = db.load();
  if (data.users.some((u) => u.email === email)) return fail(res, 409, '该邮箱已注册');

  const userId = db.id();
  const user = {
    id: userId,
    email,
    passwordHash: hashPassword(password),
    workspaceName: String(body.workspaceName || '').trim().slice(0, 40) || '我的工作区',
    assistantType: null,
    createdAt: db.now()
  };
  data.users.push(user);
  data.settings.push({
    userId,
    automationPaused: true,
    autoSendEnabled: false,
    timeWindowStart: '08:00',
    timeWindowEnd: '23:00',
    dailyLimit: 1000,
    forbiddenTopics: '',
    translationEnabled: true,
    discloseAI: true,
    replyLanguage: 'zh-CN',
    updatedAt: db.now()
  });
  db.save();

  seedDemo(userId);
  audit(userId, 'auth', '账号注册成功', { email });

  const token = newToken();
  data.sessions[token] = {
    userId,
    createdAt: db.now(),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5).toISOString()
  };
  db.save();
  setCookie(req, res, 'dsc_session', token, SESSION_DAYS * 86400);
  ok(res, { user: publicUser(user) });
});

route('POST', '/api/auth/login', async (req, res, params, body) => {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const ip = req.socket.remoteAddress || 'unknown';
  const rec = loginAttempts.get(ip) || { count: 0, resetAt: Date.now() + 10 * 60 * 1000 };
  if (Date.now() > rec.resetAt) { rec.count = 0; rec.resetAt = Date.now() + 10 * 60 * 1000; }
  if (rec.count >= 20) return fail(res, 429, '尝试过于频繁，请 10 分钟后再试');

  const data = db.load();
  const user = data.users.find((u) => u.email === email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    rec.count++;
    loginAttempts.set(ip, rec);
    return fail(res, 401, '邮箱或密码不正确');
  }
  loginAttempts.delete(ip);

  const token = newToken();
  data.sessions[token] = {
    userId: user.id,
    createdAt: db.now(),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5).toISOString()
  };
  db.save();
  setCookie(req, res, 'dsc_session', token, SESSION_DAYS * 86400);
  audit(user.id, 'auth', '登录成功');
  ok(res, { user: publicUser(user) });
});

route('POST', '/api/auth/logout', async (req, res) => {
  const token = parseCookies(req).dsc_session;
  if (token) {
    db.mutate((d) => { delete d.sessions[token]; });
  }
  clearCookie(req, res, 'dsc_session');
  ok(res);
});

route('GET', '/api/auth/me', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  ok(res, { user: publicUser(user) });
});

// ---- 工作区 ----
route('GET', '/api/bootstrap', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  const settings = getSettings(user.id);
  const usage = getUsage(user.id);
  const contacts = data.contacts.filter((c) => c.userId === user.id).map((c) => contactOut(c, data));
  const messages = data.messages.filter((m) => m.userId === user.id);
  const aiCount = messages.filter((m) => m.role === 'ai').length;
  const humanCount = messages.filter((m) => m.role === 'human').length;
  const flows = data.flows.filter((f) => f.userId === user.id);

  ok(res, {
    user: publicUser(user),
    contacts,
    settings,
    usage: { today: usage.count, limit: settings.dailyLimit, remaining: Math.max(0, settings.dailyLimit - usage.count) },
    stats: {
      contacts: contacts.length,
      messages: messages.length,
      aiMessages: aiCount,
      humanMessages: humanCount,
      memories: data.memories.filter((m) => m.userId === user.id).length,
      flows: flows.length,
      knowledge: data.knowledge.filter((k) => k.userId === user.id).length
    },
    audit: data.audit.filter((a) => a.userId === user.id).slice(0, 8),
    engine: ai.engineInfo(getLlm(user.id)),
    llm: publicLlm(user.id),
    presets: ai.PRESETS,
    storage: db.status(),
    version: VERSION,
    telegram: telegram.status()
  });
});

route('PATCH', '/api/workspace', async (req, res, params, body) => {
  const user = requireUser(req, res);
  if (!user) return;
  const name = String(body.workspaceName || '').trim().slice(0, 40);
  if (!name) return fail(res, 400, '工作区名称不能为空');
  db.mutate((d) => {
    const u = d.users.find((x) => x.id === user.id);
    u.workspaceName = name;
  });
  ok(res, { workspaceName: name });
});

route('POST', '/api/workspace/assistant', async (req, res, params, body) => {
  const user = requireUser(req, res);
  if (!user) return;
  if (user.assistantType) return fail(res, 409, '助手类型已确定，不可更改');
  const type = String(body.type || '');
  if (!['emotional', 'process'].includes(type)) return fail(res, 400, '助手类型不合法');
  db.mutate((d) => {
    d.users.find((x) => x.id === user.id).assistantType = type;
  });
  audit(user.id, 'settings', `选择${type === 'emotional' ? '情感助手' : '流程助手'}`);
  ok(res, { assistantType: type });
});

// ---- 联系人 ----
route('GET', '/api/contacts', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  ok(res, { contacts: data.contacts.filter((c) => c.userId === user.id).map((c) => contactOut(c, data)) });
});

route('POST', '/api/contacts', async (req, res, params, body) => {
  const user = requireUser(req, res);
  if (!user) return;
  const name = String(body.name || '').trim().slice(0, 40);
  if (!name) return fail(res, 400, '请填写联系人名称');
  const contact = {
    id: db.id(),
    userId: user.id,
    name,
    handle: String(body.handle || '').trim().slice(0, 60),
    channel: ['telegram', 'whatsapp', 'line', 'zalo', 'signal', 'other'].includes(body.channel) ? body.channel : 'other',
    tone: ['warm', 'neutral', 'playful', 'concise'].includes(body.tone) ? body.tone : 'warm',
    address: String(body.address || '').trim().slice(0, 20),
    boundaries: String(body.boundaries || '').trim().slice(0, 300),
    replyMode: ['off', 'draft', 'auto'].includes(body.replyMode) ? body.replyMode : 'draft',
    color: ['#4f46e5', '#0891b2', '#db2777', '#ea580c', '#059669', '#7c3aed'][Math.floor(Math.random() * 6)],
    createdAt: db.now()
  };
  db.mutate((d) => { d.contacts.push(contact); });
  audit(user.id, 'contact', `新增联系人「${name}」`, { contactId: contact.id });
  ok(res, { contact: contactOut(contact, db.load()) });
});

route('PATCH', '/api/contacts/:id', async (req, res, params, body) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  const contact = data.contacts.find((c) => c.id === params.id && c.userId === user.id);
  if (!contact) return fail(res, 404, '联系人不存在');
  const allowed = ['name', 'handle', 'channel', 'tone', 'address', 'boundaries', 'replyMode'];
  db.mutate((d) => {
    const c = d.contacts.find((x) => x.id === params.id);
    for (const key of allowed) {
      if (body[key] !== undefined) c[key] = String(body[key]).slice(0, key === 'boundaries' ? 300 : 60);
    }
  });
  if (body.replyMode) {
    audit(user.id, 'settings', `「${contact.name}」回复方式改为 ${{ off: '关闭', draft: 'AI 草稿', auto: '自动发送' }[body.replyMode] || body.replyMode}`, { contactId: contact.id });
  }
  ok(res, { contact: contactOut(db.load().contacts.find((x) => x.id === params.id), db.load()) });
});

route('DELETE', '/api/contacts/:id', async (req, res, params) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  const contact = data.contacts.find((c) => c.id === params.id && c.userId === user.id);
  if (!contact) return fail(res, 404, '联系人不存在');
  db.mutate((d) => {
    d.contacts = d.contacts.filter((c) => c.id !== params.id);
    d.messages = d.messages.filter((m) => m.contactId !== params.id);
    d.memories = d.memories.filter((m) => m.contactId !== params.id);
    d.progress = d.progress.filter((p) => p.contactId !== params.id);
    d.flowEvents = d.flowEvents.filter((e) => e.contactId !== params.id);
  });
  audit(user.id, 'contact', `删除联系人「${contact.name}」`);
  ok(res);
});

// ---- 记忆 ----
route('GET', '/api/contacts/:id/memories', async (req, res, params) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  const contact = data.contacts.find((c) => c.id === params.id && c.userId === user.id);
  if (!contact) return fail(res, 404, '联系人不存在');
  ok(res, { memories: data.memories.filter((m) => m.contactId === params.id) });
});

route('POST', '/api/contacts/:id/memories', async (req, res, params, body) => {
  const user = requireUser(req, res);
  if (!user) return;
  const text = String(body.text || '').trim().slice(0, 300);
  if (!text) return fail(res, 400, '记忆内容不能为空');
  const data = db.load();
  const contact = data.contacts.find((c) => c.id === params.id && c.userId === user.id);
  if (!contact) return fail(res, 404, '联系人不存在');
  const memory = {
    id: db.id(),
    userId: user.id,
    contactId: params.id,
    text,
    source: body.source === 'chat' ? 'chat' : 'manual',
    createdAt: db.now()
  };
  db.mutate((d) => { d.memories.push(memory); });
  audit(user.id, 'memory', `为「${contact.name}」新增记忆：${text.slice(0, 40)}`, { contactId: contact.id });
  ok(res, { memory });
});

route('DELETE', '/api/memories/:id', async (req, res, params) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  const memory = data.memories.find((m) => m.id === params.id && m.userId === user.id);
  if (!memory) return fail(res, 404, '记忆不存在');
  db.mutate((d) => { d.memories = d.memories.filter((m) => m.id !== params.id); });
  audit(user.id, 'memory', `删除记忆：${memory.text.slice(0, 40)}`);
  ok(res);
});

// ---- 消息与 AI ----
route('GET', '/api/contacts/:id/messages', async (req, res, params) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  const contact = data.contacts.find((c) => c.id === params.id && c.userId === user.id);
  if (!contact) return fail(res, 404, '联系人不存在');
  const messages = data.messages.filter((m) => m.contactId === params.id).sort(byTime);
  ok(res, {
    messages,
    pendingDraft: contact.pendingDraft || null,
    memories: data.memories.filter((m) => m.contactId === params.id),
    flow: flowContext(user.id, params.id),
    contact: contactOut(contact, data)
  });
});

function buildDraftContext(user, contact) {
  const data = db.load();
  return {
    assistantType: user.assistantType || 'emotional',
    contact,
    memories: data.memories.filter((m) => m.contactId === contact.id),
    history: data.messages.filter((m) => m.contactId === contact.id).sort(byTime).slice(-20),
    knowledge: data.knowledge.filter((k) => k.userId === user.id),
    flow: flowContext(user.id, contact.id),
    settings: getSettings(user.id)
  };
}

async function generateAndStore(user, contact) {
  const ctx = buildDraftContext(user, contact);
  const result = await ai.draftReply(ctx, getLlm(user.id));
  const draft = {
    content: result.text,
    engine: result.engine,
    usedMemories: result.usedMemories || [],
    intent: result.intent || null,
    createdAt: db.now()
  };
  db.mutate((d) => {
    const c = d.contacts.find((x) => x.id === contact.id);
    if (c) c.pendingDraft = draft;
  });
  audit(user.id, 'ai', `为「${contact.name}」生成回复草稿`, {
    contactId: contact.id,
    engine: result.engine,
    usedMemories: draft.usedMemories.map((m) => m.text)
  });
  return draft;
}

route('POST', '/api/contacts/:id/messages', async (req, res, params, body) => {
  const user = requireUser(req, res);
  if (!user) return;
  const content = String(body.content || '').trim().slice(0, 4000);
  if (!content) return fail(res, 400, '消息内容不能为空');
  const data = db.load();
  const contact = data.contacts.find((c) => c.id === params.id && c.userId === user.id);
  if (!contact) return fail(res, 404, '联系人不存在');

  const inbound = {
    id: db.id(),
    userId: user.id,
    contactId: contact.id,
    role: 'contact',
    content,
    meta: { channel: contact.channel },
    createdAt: db.now()
  };
  db.mutate((d) => { d.messages.push(inbound); });

  const settings = getSettings(user.id);
  const usage = getUsage(user.id);
  const forbidden = ai.safetyCheck(content, settings.forbiddenTopics);
  const reasons = [];

  if (forbidden.length) reasons.push(`命中禁止话题：${forbidden.join('、')}`);
  if (contact.replyMode === 'off') reasons.push('该联系人回复方式为「关闭」');
  if (settings.automationPaused) reasons.push('全局自动化已暂停');
  if (!settings.autoSendEnabled) reasons.push('未开启自动发送开关');
  if (contact.replyMode !== 'auto') reasons.push('该联系人未开启自动发送');
  if (!inWindow(settings)) reasons.push('不在允许发送时段');
  if (usage.count >= settings.dailyLimit) reasons.push('已达当日回复上限');

  const canAuto = reasons.length === 0;
  let draft = null;
  let autoSent = false;

  if (contact.replyMode !== 'off' && !forbidden.length) {
    draft = await generateAndStore(user, contact);
    if (canAuto) {
      const outbound = {
        id: db.id(),
        userId: user.id,
        contactId: contact.id,
        role: 'ai',
        content: draft.content,
        meta: { source: 'ai', mode: 'auto', usedMemories: draft.usedMemories.map((m) => m.text) },
        createdAt: db.now()
      };
      db.mutate((d) => {
        d.messages.push(outbound);
        const c = d.contacts.find((x) => x.id === contact.id);
        if (c) c.pendingDraft = null;
      });
      usage.count++;
      db.save();
      audit(user.id, 'send', `自动回复「${contact.name}」`, { contactId: contact.id, preview: draft.content.slice(0, 50) });
      autoSent = true;
      telegram.push(contact, draft.content);
    }
  }

  ok(res, {
    message: inbound,
    draft: autoSent ? null : draft,
    autoSent,
    reasons,
    usage: { today: usage.count, limit: settings.dailyLimit }
  });
});

route('POST', '/api/contacts/:id/draft', async (req, res, params) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  const contact = data.contacts.find((c) => c.id === params.id && c.userId === user.id);
  if (!contact) return fail(res, 404, '联系人不存在');
  const draft = await generateAndStore(user, contact);
  ok(res, { draft });
});

route('POST', '/api/contacts/:id/draft/clear', async (req, res, params) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  const contact = data.contacts.find((c) => c.id === params.id && c.userId === user.id);
  if (!contact) return fail(res, 404, '联系人不存在');
  db.mutate((d) => {
    const c = d.contacts.find((x) => x.id === params.id);
    if (c) c.pendingDraft = null;
  });
  ok(res);
});

route('POST', '/api/contacts/:id/send', async (req, res, params, body) => {
  const user = requireUser(req, res);
  if (!user) return;
  const content = String(body.content || '').trim().slice(0, 4000);
  if (!content) return fail(res, 400, '消息内容不能为空');
  const source = body.source === 'human' ? 'human' : 'ai';
  const data = db.load();
  const contact = data.contacts.find((c) => c.id === params.id && c.userId === user.id);
  if (!contact) return fail(res, 404, '联系人不存在');

  const message = {
    id: db.id(),
    userId: user.id,
    contactId: contact.id,
    role: source,
    content,
    meta: {
      source,
      translated: Boolean(body.translated),
      edited: Boolean(body.edited),
      usedMemories: Array.isArray(body.usedMemories) ? body.usedMemories.slice(0, 5) : []
    },
    createdAt: db.now()
  };
  db.mutate((d) => {
    d.messages.push(message);
    const c = d.contacts.find((x) => x.id === contact.id);
    if (c) c.pendingDraft = null;
  });
  if (source === 'ai') {
    const usage = getUsage(user.id);
    usage.count++;
    db.save();
  }
  audit(user.id, 'send', `${source === 'human' ? '人工' : 'AI'}回复「${contact.name}」`, {
    contactId: contact.id,
    preview: content.slice(0, 50)
  });
  telegram.push(contact, content);
  ok(res, { message });
});

route('POST', '/api/contacts/:id/translate', async (req, res, params, body) => {
  const user = requireUser(req, res);
  if (!user) return;
  const settings = getSettings(user.id);
  if (!settings.translationEnabled) return fail(res, 403, '翻译功能已关闭');
  const text = String(body.text || '').slice(0, 4000);
  const target = body.target === 'zh' ? 'zh' : 'en';
  const result = await ai.translate(text, target, getLlm(user.id));
  ok(res, result);
});

// ---- 流程 ----
route('GET', '/api/flows', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  const flows = data.flows.filter((f) => f.userId === user.id).map((f) => ({
    ...f,
    progress: data.progress.filter((p) => p.flowId === f.id).map((p) => {
      const c = data.contacts.find((x) => x.id === p.contactId);
      return {
        ...p,
        contactName: c ? c.name : '已删除联系人',
        currentStep: f.steps[p.stepIndex] || null
      };
    })
  }));
  ok(res, { flows });
});

route('POST', '/api/flows', async (req, res, params, body) => {
  const user = requireUser(req, res);
  if (!user) return;
  const name = String(body.name || '').trim().slice(0, 60);
  if (!name) return fail(res, 400, '请填写流程名称');
  const steps = (Array.isArray(body.steps) ? body.steps : [])
    .map((s) => ({
      id: db.id(),
      title: String(s.title || '').trim().slice(0, 60),
      desc: String(s.desc || '').trim().slice(0, 200)
    }))
    .filter((s) => s.title);
  if (!steps.length) return fail(res, 400, '至少需要一个步骤');
  const flow = {
    id: db.id(),
    userId: user.id,
    name,
    description: String(body.description || '').trim().slice(0, 200),
    steps,
    createdAt: db.now()
  };
  db.mutate((d) => { d.flows.push(flow); });
  audit(user.id, 'flow', `新建流程「${name}」（${steps.length} 步）`);
  ok(res, { flow });
});

route('DELETE', '/api/flows/:id', async (req, res, params) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  const flow = data.flows.find((f) => f.id === params.id && f.userId === user.id);
  if (!flow) return fail(res, 404, '流程不存在');
  db.mutate((d) => {
    d.flows = d.flows.filter((f) => f.id !== params.id);
    d.progress = d.progress.filter((p) => p.flowId !== params.id);
    d.flowEvents = d.flowEvents.filter((e) => e.flowId !== params.id);
  });
  audit(user.id, 'flow', `删除流程「${flow.name}」`);
  ok(res);
});

route('POST', '/api/flows/:id/select', async (req, res, params, body) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  const flow = data.flows.find((f) => f.id === params.id && f.userId === user.id);
  if (!flow) return fail(res, 404, '流程不存在');
  const contact = data.contacts.find((c) => c.id === body.contactId && c.userId === user.id);
  if (!contact) return fail(res, 404, '联系人不存在');

  let prog = data.progress.find((p) => p.flowId === flow.id && p.contactId === contact.id);
  if (!prog) {
    prog = {
      id: db.id(),
      userId: user.id,
      flowId: flow.id,
      contactId: contact.id,
      stepIndex: 0,
      statuses: {},
      updatedAt: db.now()
    };
    db.mutate((d) => { d.progress.push(prog); });
  }
  audit(user.id, 'flow', `「${contact.name}」进入流程「${flow.name}」`, { contactId: contact.id, flowId: flow.id });
  ok(res, { progress: prog, currentStep: flow.steps[prog.stepIndex] || null });
});

route('POST', '/api/flows/:id/advance', async (req, res, params, body) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  const flow = data.flows.find((f) => f.id === params.id && f.userId === user.id);
  if (!flow) return fail(res, 404, '流程不存在');
  const prog = data.progress.find((p) => p.flowId === flow.id && p.contactId === body.contactId);
  if (!prog) return fail(res, 404, '该联系人尚未进入此流程');
  const stepId = String(body.stepId || '');
  const state = body.state === 'verified' ? 'verified' : body.state === 'claimed' ? 'claimed' : '';
  if (!state) return fail(res, 400, '状态不合法');
  const step = flow.steps.find((s) => s.id === stepId);
  if (!step) return fail(res, 400, '步骤不存在');

  db.mutate((d) => {
    const p = d.progress.find((x) => x.id === prog.id);
    p.statuses = p.statuses || {};
    p.statuses[stepId] = state;
    p.updatedAt = db.now();
    if (state === 'verified') {
      const idx = flow.steps.findIndex((s) => s.id === stepId);
      if (idx === p.stepIndex) p.stepIndex = Math.min(p.stepIndex + 1, flow.steps.length);
    }
    d.flowEvents.unshift({
      id: db.id(),
      userId: user.id,
      flowId: flow.id,
      contactId: body.contactId,
      stepId,
      type: state,
      detail: state === 'verified' ? `已核实：${step.title}` : `对方自述完成：${step.title}`,
      createdAt: db.now()
    });
  });
  const c = data.contacts.find((x) => x.id === body.contactId);
  audit(user.id, 'flow', `${state === 'verified' ? '已核实' : '对方自述'}「${step.title}」`, {
    contactId: body.contactId,
    flowId: flow.id
  });
  ok(res, { progress: db.load().progress.find((p) => p.id === prog.id) });
});

route('GET', '/api/flows/:id/events', async (req, res, params) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  ok(res, { events: data.flowEvents.filter((e) => e.flowId === params.id && e.userId === user.id).slice(0, 100) });
});

// ---- 知识库 ----
route('GET', '/api/knowledge', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  ok(res, { knowledge: data.knowledge.filter((k) => k.userId === user.id) });
});

route('POST', '/api/knowledge', async (req, res, params, body) => {
  const user = requireUser(req, res);
  if (!user) return;
  const title = String(body.title || '').trim().slice(0, 80);
  const content = String(body.content || '').trim().slice(0, 5000);
  if (!title || !content) return fail(res, 400, '标题与内容都不能为空');
  const item = { id: db.id(), userId: user.id, title, content, createdAt: db.now() };
  db.mutate((d) => { d.knowledge.push(item); });
  audit(user.id, 'knowledge', `新增资料「${title}」`);
  ok(res, { item });
});

route('DELETE', '/api/knowledge/:id', async (req, res, params) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  const item = data.knowledge.find((k) => k.id === params.id && k.userId === user.id);
  if (!item) return fail(res, 404, '资料不存在');
  db.mutate((d) => { d.knowledge = d.knowledge.filter((k) => k.id !== params.id); });
  audit(user.id, 'knowledge', `删除资料「${item.title}」`);
  ok(res);
});

// ---- 审计 / 用量 / 设置 ----
route('GET', '/api/audit', async (req, res, params, body, query) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  let list = data.audit.filter((a) => a.userId === user.id);
  const type = query.get('type');
  if (type && type !== 'all') list = list.filter((a) => a.type === type);
  ok(res, { audit: list.slice(0, 300) });
});

route('GET', '/api/usage', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const settings = getSettings(user.id);
  const usage = getUsage(user.id);
  const data = db.load();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5);
    const p = (n) => String(n).padStart(2, '0');
    const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const row = data.usage.find((u) => u.userId === user.id && u.date === key);
    days.push({ date: key, count: row ? row.count : 0 });
  }
  ok(res, { today: usage.count, limit: settings.dailyLimit, days });
});

route('PATCH', '/api/settings', async (req, res, params, body) => {
  const user = requireUser(req, res);
  if (!user) return;
  const allowed = ['automationPaused', 'autoSendEnabled', 'timeWindowStart', 'timeWindowEnd', 'dailyLimit', 'forbiddenTopics', 'translationEnabled', 'discloseAI', 'replyLanguage'];
  db.mutate((d) => {
    const s = d.settings.find((x) => x.userId === user.id);
    for (const key of allowed) {
      if (body[key] === undefined) continue;
      if (['automationPaused', 'autoSendEnabled', 'translationEnabled', 'discloseAI'].includes(key)) s[key] = Boolean(body[key]);
      else if (key === 'dailyLimit') s.dailyLimit = Math.max(1, Math.min(5000, Number(body[key]) || 1000));
      else s[key] = String(body[key]).slice(0, 500);
    }
    s.updatedAt = db.now();
  });
  audit(user.id, 'settings', '更新自动化与安全设置');
  ok(res, { settings: getSettings(user.id) });
});

route('GET', '/api/telegram/status', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  ok(res, telegram.status());
});

// ---- 用户自己的模型配置（Key 由用户在网页里填写，不入部署文件）----
function sanitizeBaseUrl(input) {
  const raw = String(input || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (/^(169\.254\.169\.254|metadata\.google\.internal)$/i.test(url.hostname)) return null;
  return raw.slice(0, 200);
}

route('GET', '/api/llm', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  ok(res, { llm: publicLlm(user.id), presets: ai.PRESETS });
});

route('PATCH', '/api/llm', async (req, res, params, body) => {
  const user = requireUser(req, res);
  if (!user) return;
  const data = db.load();
  const row = data.llmConfigs.find((x) => x.userId === user.id);

  const nextBase = body.baseUrl === undefined
    ? (row ? row.baseUrl : '')
    : sanitizeBaseUrl(body.baseUrl);
  if (nextBase === null) return fail(res, 400, 'Base URL 不合法，需要以 http:// 或 https:// 开头');

  const nextModel = body.model === undefined
    ? (row ? row.model : '')
    : String(body.model).trim().slice(0, 80);

  // Key 只有在前端显式提交时才更新；留空表示保持原值（前端拿不到明文，无法回填）
  let keyEnc = row ? row.apiKeyEnc : '';
  let keyChanged = false;
  if (body.clearKey) {
    keyEnc = '';
    keyChanged = true;
  } else if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
    keyEnc = secret.encrypt(body.apiKey.trim());
    keyChanged = true;
  }

  const provider = body.provider === undefined
    ? ((row && row.provider) || '')
    : String(body.provider).slice(0, 30);
  const stamp = db.now();

  db.mutate((d) => {
    const payload = {
      userId: user.id,
      provider,
      baseUrl: nextBase || ai.DEFAULT_BASE_URL,
      model: nextModel || ai.DEFAULT_MODEL,
      apiKeyEnc: keyEnc,
      updatedAt: stamp
    };
    const idx = d.llmConfigs.findIndex((x) => x.userId === user.id);
    if (idx >= 0) d.llmConfigs[idx] = { ...d.llmConfigs[idx], ...payload };
    else d.llmConfigs.push({ ...payload, lastTest: null });
  });

  audit(user.id, 'settings', keyChanged
    ? (keyEnc ? '更新了自己的模型 API 配置' : '清空了模型 API Key')
    : '更新了自己的模型名称 / 接口地址');
  ok(res, { llm: publicLlm(user.id) });
});

route('DELETE', '/api/llm', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  db.mutate((d) => {
    const row = d.llmConfigs.find((x) => x.userId === user.id);
    if (row) {
      row.apiKeyEnc = '';
      row.lastTest = null;
      row.updatedAt = db.now();
    }
  });
  audit(user.id, 'settings', '删除了自己的模型 API Key');
  ok(res, { llm: publicLlm(user.id) });
});

route('POST', '/api/llm/test', async (req, res, params, body) => {
  const user = requireUser(req, res);
  if (!user) return;
  const saved = getLlm(user.id);

  let baseUrl = saved.baseUrl;
  if (body.baseUrl !== undefined && String(body.baseUrl).trim()) {
    const parsed = sanitizeBaseUrl(body.baseUrl);
    if (parsed === null) return fail(res, 400, 'Base URL 不合法，需要以 http:// 或 https:// 开头');
    baseUrl = parsed;
  }

  const typedKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const candidate = ai.normalizeLlm({
    baseUrl,
    model: body.model || saved.model,
    apiKey: typedKey || saved.apiKey
  });
  if (!candidate.apiKey) return fail(res, 400, '请先填写 API Key 再测试连接');

  const result = await ai.testConnection(candidate);

  db.mutate((d) => {
    const row = d.llmConfigs.find((x) => x.userId === user.id);
    if (row) {
      row.lastTest = {
        ok: result.ok,
        model: candidate.model,
        latencyMs: result.latencyMs || null,
        error: result.ok ? '' : String(result.error || '').slice(0, 200),
        at: db.now()
      };
    }
  });

  audit(user.id, 'settings', result.ok ? '测试模型连接成功' : `测试模型连接失败：${String(result.error || '').slice(0, 80)}`);
  ok(res, result);
});

// ---------- 演示数据 ----------
function seedDemo(userId) {
  const c1 = {
    id: db.id(),
    userId,
    name: '小林',
    handle: '@xiaolin_demo',
    channel: 'telegram',
    tone: 'warm',
    address: '小林',
    boundaries: '不追问家庭私事；对方忙时不要连续发消息',
    replyMode: 'draft',
    color: '#4f46e5',
    createdAt: db.now()
  };
  const c2 = {
    id: db.id(),
    userId,
    name: '陈先生',
    handle: '+65 8xxx 2210',
    channel: 'whatsapp',
    tone: 'neutral',
    address: '陈先生',
    boundaries: '只谈业务，不闲聊',
    replyMode: 'off',
    color: '#0891b2',
    createdAt: db.now()
  };
  const mem1 = ['上周提到周三要做项目汇报', '不太喜欢别人追问私事', '喜欢喝美式，不加糖', '最近在考虑换工作'];
  const mem2 = ['咨询企业版五账号套餐', '需要开票，抬头待确认', '希望按年付并给折扣'];
  const flow = {
    id: db.id(),
    userId,
    name: '企业版开通流程',
    description: '从需求确认到开通的标准四步',
    steps: [
      { id: db.id(), title: '确认需求与账号数', desc: '确认套餐档位、使用人数与渠道' },
      { id: db.id(), title: '提交主体资料', desc: '营业执照、开票信息、联系人' },
      { id: db.id(), title: '资料审核', desc: '1 个工作日内完成审核' },
      { id: db.id(), title: '开通与交付', desc: '开通账号并发送使用指引' }
    ],
    createdAt: db.now()
  };
  db.mutate((d) => {
    d.contacts.push(c1, c2);
    for (const text of mem1) d.memories.push({ id: db.id(), userId, contactId: c1.id, text, source: 'manual', createdAt: db.now() });
    for (const text of mem2) d.memories.push({ id: db.id(), userId, contactId: c2.id, text, source: 'manual', createdAt: db.now() });
    d.messages.push(
      { id: db.id(), userId, contactId: c1.id, role: 'contact', content: '今天的汇报终于结束了，松了一口气。', meta: { channel: 'telegram' }, createdAt: new Date(Date.now() - 36e5).toISOString() },
      { id: db.id(), userId, contactId: c1.id, role: 'ai', content: '我还记得你之前提过「上周提到周三要做项目汇报」。结束了就先放一放，晚上奖励自己一顿好的。', meta: { source: 'ai', mode: 'draft' }, createdAt: new Date(Date.now() - 35e5).toISOString() },
      { id: db.id(), userId, contactId: c2.id, role: 'contact', content: '你好，那个五账号的套餐还能按年付吗？', meta: { channel: 'whatsapp' }, createdAt: new Date(Date.now() - 2 * 864e5).toISOString() }
    );
    d.flows.push(flow);
    d.progress.push({
      id: db.id(),
      userId,
      flowId: flow.id,
      contactId: c2.id,
      stepIndex: 0,
      statuses: {},
      updatedAt: db.now()
    });
    d.knowledge.push({
      id: db.id(),
      userId,
      title: '企业版套餐与开票说明',
      content: '五账号套餐 $260/月，按年付可享 9 折。支持开具增值税普通发票，需提供公司名称、税号与接收邮箱。审核通常在 1 个工作日内完成。',
      createdAt: db.now()
    });
    d.audit.unshift({ id: db.id(), userId, type: 'system', detail: '工作区已创建，并载入演示数据', meta: {}, createdAt: db.now() });
  });
}

// ---------- Telegram 入站 ----------
async function handleTelegramInbound(msg) {
  const chatId = String(msg.chat.id);
  const data = db.load();
  let contact = data.contacts.find((c) => c.channel === 'telegram' && c.handle === chatId);

  if (!contact) {
    const owner = data.users[0];
    if (!owner) return;
    contact = {
      id: db.id(),
      userId: owner.id,
      name: (msg.from && (msg.from.first_name || msg.from.username)) || 'Telegram 用户',
      handle: chatId,
      channel: 'telegram',
      tone: 'warm',
      address: '',
      boundaries: '',
      replyMode: 'draft',
      color: '#4f46e5',
      createdAt: db.now()
    };
    db.mutate((d) => { d.contacts.push(contact); });
    audit(owner.id, 'contact', `Telegram 新联系人「${contact.name}」`, { contactId: contact.id });
  }

  const user = db.load().users.find((u) => u.id === contact.userId);
  if (!user) return;

  db.mutate((d) => {
    d.messages.push({
      id: db.id(),
      userId: user.id,
      contactId: contact.id,
      role: 'contact',
      content: String(msg.text).slice(0, 4000),
      meta: { channel: 'telegram' },
      createdAt: db.now()
    });
  });

  const settings = getSettings(user.id);
  const usage = getUsage(user.id);
  const forbidden = ai.safetyCheck(msg.text, settings.forbiddenTopics);
  if (contact.replyMode === 'off' || forbidden.length) return;

  const draft = await generateAndStore(user, contact);
  const canAuto = !settings.automationPaused
    && settings.autoSendEnabled
    && contact.replyMode === 'auto'
    && inWindow(settings)
    && usage.count < settings.dailyLimit;

  if (canAuto) {
    const result = await telegram.push(contact, draft.content);
    if (result.sent) {
      db.mutate((d) => {
        d.messages.push({
          id: db.id(),
          userId: user.id,
          contactId: contact.id,
          role: 'ai',
          content: draft.content,
          meta: { source: 'ai', mode: 'auto', channel: 'telegram' },
          createdAt: db.now()
        });
        const c = d.contacts.find((x) => x.id === contact.id);
        if (c) c.pendingDraft = null;
      });
      usage.count++;
      db.save();
      audit(user.id, 'send', `Telegram 自动回复「${contact.name}」`, {
        contactId: contact.id,
        preview: draft.content.slice(0, 50)
      });
    }
  }
}

// ---------- 静态文件 ----------
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel === '/app' || rel === '/workspace') rel = '/workspace.html';
  if (rel === '/login' || rel === '/register') rel = '/auth.html';
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- 服务器 ----------
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '));

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // 平台健康检查（Render / Railway / Fly / K8s 都打这个）
  if (url.pathname === '/healthz') {
    const st = db.status();
    return sendJson(res, st.ok ? 200 : 503, {
      ok: st.ok,
      uptime: Math.round(process.uptime()),
      storage: st,
      version: VERSION
    });
  }

  if (url.pathname.startsWith('/api/')) {
    const matched = matchRoute(req.method, url.pathname);
    if (!matched) return fail(res, 404, '接口不存在');
    try {
      const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : {};
      await matched.handler(req, res, matched.params, body, url.searchParams);
    } catch (e) {
      console.error('[api]', req.method, url.pathname, e);
      if (!res.headersSent) fail(res, 500, e.message || '服务器错误');
    }
    return;
  }

  serveStatic(req, res, url.pathname);
});

async function main() {
  // 先把数据装载进内存，再对外提供服务（云端后端尤其重要）
  await db.hydrate();

  const vault = secret.ensureReady();

  server.listen(PORT, HOST, () => {
    const data = db.load();
    const configured = data.llmConfigs.filter((x) => x.apiKeyEnc).length;
    const st = db.status();
    console.log('');
    console.log(`  DSchats 复刻版 v${VERSION} 已启动`);
    console.log(`  地址:   http://${HOST}:${PORT}`);
    console.log(`  存储:   ${st.backend === 'upstash' ? `Upstash (${st.target})` : '本地文件 data/db.json'}`);
    console.log(`  AI:     用户自填 Key（OpenAI 兼容）· 已配置 ${configured}/${data.users.length} 个账号`);
    console.log(`  降级:   未填 Key 的用户自动使用本地规则引擎`);
    if (vault.source === 'env') {
      console.log('  密钥库: APP_SECRET 环境变量');
    } else if (vault.ok) {
      console.log('  密钥库: data/.secret 文件');
    } else {
      console.log('  密钥库: ⚠️ 仅内存，重启后已保存的 Key 会失效（请设 APP_SECRET）');
    }
    console.log(`  Telegram: ${telegram.status().enabled ? '已启用' : '未配置（可选）'}`);
    console.log('');
    telegram.start(handleTelegramInbound);
  });
}

main().catch((e) => {
  console.error('[boot] 启动失败:', e);
  process.exit(1);
});
