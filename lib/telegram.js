'use strict';

/**
 * Telegram Bot 通道
 * 使用官方 Bot API 长轮询，不使用个人账号会话凭证。
 * 需要在 .env 中配置 TELEGRAM_BOT_TOKEN。
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
let offset = 0;
let running = false;
let me = null;
let lastUpdateAt = null;
let onMessage = null;

function status() {
  return {
    enabled: Boolean(TOKEN),
    connected: Boolean(me),
    username: me ? me.username : null,
    lastUpdateAt,
    mode: 'bot-api'
  };
}

async function api(method, payload = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.description || 'Telegram API 调用失败');
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loop() {
  while (running) {
    try {
      const updates = await api('getUpdates', {
        offset,
        timeout: 25,
        allowed_updates: ['message']
      });
      for (const update of updates || []) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg || !msg.text) continue;
        lastUpdateAt = new Date().toISOString();
        if (onMessage) {
          try {
            await onMessage(msg);
          } catch (e) {
            console.warn('[telegram] 处理消息失败:', e.message);
          }
        }
      }
    } catch (e) {
      console.warn('[telegram] 轮询中断，3 秒后重试:', e.message);
      await sleep(3000);
    }
  }
}

function start(handler) {
  if (!TOKEN) return;
  if (running) return;
  onMessage = handler;
  running = true;
  api('getMe')
    .then((info) => {
      me = info;
      console.log(`[telegram] 已连接 @${info.username}`);
    })
    .catch((e) => console.warn('[telegram] 获取机器人信息失败:', e.message));
  loop();
}

async function push(contact, text) {
  if (!TOKEN || !contact || contact.channel !== 'telegram') return { skipped: true };
  const chatId = contact.handle;
  if (!chatId || !/^-?\d+$/.test(String(chatId))) return { skipped: true, reason: 'handle 不是 chat_id' };
  try {
    await api('sendMessage', { chat_id: chatId, text: String(text).slice(0, 4000) });
    return { sent: true };
  } catch (e) {
    console.warn('[telegram] 发送失败:', e.message);
    return { sent: false, error: e.message };
  }
}

module.exports = { status, start, push };
