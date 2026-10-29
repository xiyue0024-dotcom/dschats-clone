'use strict';

/**
 * 冒烟测试：起一个临时实例，跑一遍关键链路，然后退出。
 *   node scripts/smoke.js
 * CI 里也会跑这个。不依赖任何 npm 包。
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = Number(process.env.SMOKE_PORT || 5199);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');

const results = [];

function pass(name, extra = '') {
  results.push({ ok: true, name, extra });
  console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ''}`);
}

function fail(name, err) {
  results.push({ ok: false, name, extra: String(err) });
  console.log(`  ❌ ${name} — ${err}`);
}

async function req(pathname, opts = {}) {
  const resp = await fetch(BASE + pathname, opts);
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: resp.status, text, json, headers: resp.headers };
}

async function waitReady(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE + '/healthz');
      if (r.ok) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function main() {
  // 用临时 data 目录，避免污染仓库
  const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'dschats-smoke-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATA_DIR: tmpData,
      APP_SECRET: 'smoke-test-secret-0123456789abcdef',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d.toString(); });
  child.stderr.on('data', (d) => { bootLog += d.toString(); });

  const cleanup = () => {
    try { child.kill('SIGTERM'); } catch (_) {}
    try { fs.rmSync(tmpData, { recursive: true, force: true }); } catch (_) {}
  };

  console.log('\n冒烟测试开始\n');

  try {
    const ready = await waitReady();
    if (!ready) throw new Error(`服务 20s 内未就绪\n${bootLog}`);
    pass('服务启动');

    const hz = await req('/healthz');
    if (hz.status !== 200 || !hz.json || hz.json.ok !== true) throw new Error(`/healthz 异常: ${hz.text}`);
    pass('健康检查', `storage=${hz.json.storage.backend}`);

    const home = await req('/');
    if (home.status !== 200 || !/DSChats/.test(home.text)) throw new Error(`首页异常: ${home.status}`);
    pass('首页可访问');

    const auth = await req('/auth.html');
    if (auth.status !== 200) throw new Error(`登录页 ${auth.status}`);
    pass('登录页可访问');

    const email = `smoke_${Date.now()}@example.com`;
    const reg = await req('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'pass12345' })
    });
    if (reg.status !== 200 || !reg.json || reg.json.ok !== true) throw new Error(`注册失败: ${reg.text}`);
    const cookie = (reg.headers.get('set-cookie') || '').split(';')[0];
    if (!cookie.startsWith('dsc_session=')) throw new Error('未下发会话 Cookie');
    pass('注册并建立会话');

    const boot = await req('/api/bootstrap', { headers: { Cookie: cookie } });
    if (boot.status !== 200 || !boot.json || !boot.json.user) throw new Error('bootstrap 失败');
    if (!boot.json.llm || boot.json.llm.hasKey !== false) throw new Error('新用户不应有 Key');
    pass('bootstrap 正常', `engine=${boot.json.engine.engine}`);

    const llm = await req('/api/llm', { headers: { Cookie: cookie } });
    if (llm.status !== 200 || llm.json.llm.baseUrl !== 'https://api.groq.com/openai/v1') {
      throw new Error('模型配置默认值不对');
    }
    pass('模型配置默认值');

    const badBase = await req('/api/llm', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ baseUrl: 'ftp://x.com/v1' })
    });
    if (badBase.status !== 400) throw new Error(`非法 Base URL 应 400，实际 ${badBase.status}`);
    pass('非法 Base URL 被拒');

    const saveKey = await req('/api/llm', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ provider: 'groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'qwen/qwen3.8-27b', apiKey: 'gsk_smoke_000000000000000000000000000000' })
    });
    if (saveKey.status !== 200 || !saveKey.json.llm.hasKey) throw new Error('保存 Key 失败');
    if (saveKey.text.includes('gsk_smoke_000000000000000000000000000000')) throw new Error('接口回传了明文 Key！');
    pass('保存 Key（只回掩码）', saveKey.json.llm.keyMask);

    const clear = await req('/api/llm', { method: 'DELETE', headers: { Cookie: cookie } });
    if (clear.status !== 200 || clear.json.llm.hasKey) throw new Error('清除 Key 失败');
    pass('清除 Key');

    const noAuth = await req('/api/bootstrap');
    if (noAuth.status !== 401) throw new Error(`未登录应 401，实际 ${noAuth.status}`);
    pass('未登录被拦');

    const badJson = await req('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email":"x"'
    });
    if (badJson.status !== 400 && badJson.status !== 500) throw new Error('坏 JSON 未处理');
    pass('畸形请求被处理');

    console.log('\n全部通过\n');
    cleanup();
    process.exit(0);
  } catch (e) {
    fail('冒烟测试', e.message);
    console.log('\n启动日志:\n' + bootLog);
    cleanup();
    process.exit(1);
  }
}

main();
