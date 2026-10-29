'use strict';

/**
 * 数据存储层
 *
 * 两套后端，自动选择，业务代码完全无感：
 *
 * 1. file    —— 默认。写 data/db.json（原子写入：临时文件 + rename）。
 *               适合 VPS、Docker + 持久卷、本地开发。
 *
 * 2. upstash —— 设了 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 时启用。
 *               纯 HTTP，零 npm 依赖，适合 Render / Railway / Vercel 这类
 *               文件系统不持久的平台。整库存成一个 JSON 字符串。
 *
 * 读操作永远是同步的（命中内存缓存），只有启动时 hydrate() 和落盘是异步的。
 */

const fs = require('fs');
const path = require('path');

// DATA_DIR 可用环境变量覆盖（测试隔离、容器挂载都靠它）
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const UPSTASH_URL = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
const UPSTASH_TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
const DB_KEY = String(process.env.UPSTASH_KEY || 'dschats:db').trim();

const BACKEND = UPSTASH_URL && UPSTASH_TOKEN ? 'upstash' : 'file';

const WRITE_DEBOUNCE_MS = 40;
const REMOTE_TIMEOUT_MS = 15000;

function emptyDb() {
  return {
    users: [],
    sessions: {},
    contacts: [],
    messages: [],
    memories: [],
    flows: [],
    progress: [],
    flowEvents: [],
    knowledge: [],
    settings: [],
    llmConfigs: [],
    usage: [],
    audit: [],
    meta: { createdAt: new Date().toISOString() }
  };
}

let cache = null;
let writeTimer = null;
let remoteBusy = false;
let remoteDirty = false;
let lastError = null;
let lastSyncAt = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function backfill(db) {
  const base = emptyDb();
  for (const key of Object.keys(base)) {
    if (db[key] === undefined) db[key] = base[key];
  }
  return db;
}

// ---------- 远端（Upstash REST） ----------

async function remoteGet() {
  const resp = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(DB_KEY)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    signal: AbortSignal.timeout(8000)
  });
  if (!resp.ok) throw new Error(`读取失败 HTTP ${resp.status}`);
  const data = await resp.json();
  if (data && data.error) throw new Error(data.error);
  return data ? data.result : null;
}

async function remoteSet(payload) {
  const resp = await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(DB_KEY)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'text/plain'
    },
    body: payload,
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS)
  });
  if (!resp.ok) {
    const text = String(await resp.text()).slice(0, 160);
    throw new Error(`写入失败 HTTP ${resp.status} ${text}`);
  }
  lastSyncAt = new Date().toISOString();
}

async function pushRemote() {
  if (BACKEND !== 'upstash' || !cache) return;
  if (remoteBusy) {
    remoteDirty = true;
    return;
  }
  remoteBusy = true;
  remoteDirty = false;
  try {
    await remoteSet(JSON.stringify(cache));
    lastError = null;
  } catch (e) {
    lastError = e.message;
    remoteDirty = true;
    console.error('[db] 远端写入失败:', e.message);
  } finally {
    remoteBusy = false;
    if (remoteDirty) setTimeout(() => { pushRemote(); }, 2000);
  }
}

// ---------- 启动装载 ----------

async function hydrate() {
  if (cache) return cache;

  if (BACKEND === 'upstash') {
    try {
      const raw = await remoteGet();
      cache = raw ? JSON.parse(raw) : emptyDb();
      console.log('[db] 已从 Upstash 载入数据');
    } catch (e) {
      lastError = e.message;
      console.error('[db] Upstash 载入失败，本次以空库启动:', e.message);
      cache = emptyDb();
    }
  } else {
    ensureDir();
    try {
      cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      cache = emptyDb();
    }
  }

  return backfill(cache);
}

function load() {
  if (cache) return cache;
  if (BACKEND === 'file') {
    ensureDir();
    try {
      cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      cache = emptyDb();
    }
    return backfill(cache);
  }
  console.warn('[db] 尚未 hydrate()，返回空库（服务端应在 listen 前 await hydrate）');
  cache = emptyDb();
  return cache;
}

// ---------- 落盘 ----------

function writeFileNow() {
  const db = load();
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  const payload = JSON.stringify(db, null, 2);
  try {
    fs.writeFileSync(tmp, payload, 'utf8');
    try {
      fs.renameSync(tmp, DB_FILE);
    } catch (e) {
      fs.writeFileSync(DB_FILE, payload, 'utf8');
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
    lastSyncAt = new Date().toISOString();
    lastError = null;
  } catch (e) {
    lastError = e.message;
    console.error('[db] 写入失败:', e.message);
  }
}

function flush() {
  if (BACKEND === 'upstash') {
    pushRemote();
    return;
  }
  writeFileNow();
}

function save() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flush();
  }, WRITE_DEBOUNCE_MS);
}

function mutate(fn) {
  const db = load();
  const result = fn(db);
  save();
  return result;
}

// ---------- 收尾 ----------

let shuttingDown = false;

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  try {
    if (BACKEND === 'upstash') {
      if (cache) await remoteSet(JSON.stringify(cache));
    } else {
      writeFileNow();
    }
  } catch (e) {
    console.error('[db] 退出前落盘失败:', e.message);
  }
  process.exit(exitCode);
}

process.on('exit', () => {
  if (BACKEND === 'file' && cache) {
    try { writeFileNow(); } catch (_) {}
  }
});
process.on('SIGINT', () => { shutdown(0); });
process.on('SIGTERM', () => { shutdown(0); });

// ---------- 工具 ----------

function id() {
  return require('crypto').randomUUID();
}

function now() {
  return new Date().toISOString();
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function status() {
  return {
    backend: BACKEND,
    ok: !lastError,
    error: lastError,
    lastSyncAt,
    target: BACKEND === 'upstash' ? `upstash:${DB_KEY}` : 'data/db.json'
  };
}

module.exports = {
  hydrate,
  load,
  save,
  mutate,
  flush,
  shutdown,
  id,
  now,
  today,
  status,
  backend: BACKEND,
  DB_FILE
};
