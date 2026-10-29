'use strict';

/**
 * 敏感字段加解密
 *
 * 用户的 API Key 不能明文躺在数据库里。这里用 AES-256-GCM 加密后存储。
 * 主密钥按以下优先级解析：
 *
 *   1. APP_SECRET 环境变量 —— 云平台推荐。值随意，建议 openssl rand -hex 32 生成。
 *   2. data/.secret 文件   —— 本地 / VPS / 有持久卷的容器，首次启动自动生成（0600）。
 *   3. 进程内随机         —— 前两者都不可用时的兜底，重启即失效（会打警告）。
 *
 * 无论哪种来源，都先 SHA-256 派生一次，保证长度合法且不直接暴露原始值。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 与 db.js 保持一致：DATA_DIR 可用环境变量覆盖
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const SECRET_FILE = path.join(DATA_DIR, '.secret');
const PREFIX = 'enc:v1:';
const MIN_SECRET_LEN = 16;

let masterKey = null;
let keySource = null;

function derive(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest();
}

function tryWriteSecretFile(value) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SECRET_FILE, value + '\n', { mode: 0o600 });
    return true;
  } catch (e) {
    return false;
  }
}

function loadMasterKey() {
  if (masterKey) return masterKey;

  // 1) 环境变量
  const fromEnv = String(process.env.APP_SECRET || '').trim();
  if (fromEnv) {
    if (fromEnv.length < MIN_SECRET_LEN) {
      console.warn(`[secret] APP_SECRET 太短（<${MIN_SECRET_LEN} 字符），建议用 openssl rand -hex 32 生成`);
    }
    masterKey = derive(fromEnv);
    keySource = 'env';
    return masterKey;
  }

  // 2) 本地文件
  let raw = '';
  try {
    raw = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch (_) {
    raw = '';
  }
  if (raw) {
    masterKey = derive(raw);
    keySource = 'file';
    return masterKey;
  }

  // 3) 生成并尝试持久化
  raw = crypto.randomBytes(32).toString('hex');
  const persisted = tryWriteSecretFile(raw);
  masterKey = derive(raw);
  keySource = persisted ? 'file' : 'ephemeral';
  if (!persisted) {
    console.warn('[secret] 无法写入 data/.secret，主密钥仅存在于内存，重启后已保存的 Key 会失效');
    console.warn('[secret] 云平台请设置 APP_SECRET 环境变量，或挂载持久磁盘');
  }
  return masterKey;
}

function encrypt(plain) {
  const text = String(plain == null ? '' : plain);
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadMasterKey(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload) {
  const raw = String(payload == null ? '' : payload);
  if (!raw) return '';
  if (!raw.startsWith(PREFIX)) return raw; // 兼容历史明文
  try {
    const buf = Buffer.from(raw.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', loadMasterKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('[secret] 解密失败（APP_SECRET 或 .secret 与写入时不一致）:', e.message);
    return '';
  }
}

function isEncrypted(value) {
  return String(value || '').startsWith(PREFIX);
}

/** 生成给前端看的掩码，例如 gsk_••••••••a1b2 */
function maskKey(key) {
  const k = String(key || '');
  if (!k) return '';
  if (k.length <= 10) return k.slice(0, 2) + '••••';
  return `${k.slice(0, 4)}••••••••${k.slice(-4)}`;
}

/**
 * 启动时主动初始化主密钥：
 * 提前创建 data/.secret 并把权限/环境问题暴露在启动日志里，
 * 而不是等用户点「保存」时才失败。
 */
function ensureReady() {
  loadMasterKey();
  return {
    ok: keySource !== 'ephemeral',
    source: keySource,
    file: SECRET_FILE
  };
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  maskKey,
  ensureReady,
  SECRET_FILE
};
