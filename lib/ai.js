'use strict';

/**
 * AI 回复引擎
 * - 每个用户使用自己在网页里配置的 API Key（OpenAI 兼容协议）
 * - 未配置 Key 时使用本地规则引擎（离线可用，用于演示记忆与语气效果）
 */

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'qwen/qwen3.8-27b';

function normalizeLlm(llm) {
  const rawBase = String((llm && llm.baseUrl) || '').trim().replace(/\/+$/, '');
  const apiKey = String((llm && llm.apiKey) || '').trim();
  const model = String((llm && llm.model) || '').trim() || DEFAULT_MODEL;
  return {
    baseUrl: rawBase || DEFAULT_BASE_URL,
    apiKey,
    model
  };
}

const TONE_LABEL = {
  warm: '温和体贴',
  neutral: '自然克制',
  playful: '轻松俏皮',
  concise: '简洁直接'
};

const TEMPLATES = {
  morning: {
    warm: ['早呀，今天也慢慢来，不用一睁眼就绷紧。', '早上好，昨晚睡得还行吗？', '早，先吃点东西再开始忙。'],
    neutral: ['早。', '早上好，今天什么安排？', '早呀，醒了吗？'],
    playful: ['早，太阳都晒到你这儿了才回我。', '早安，今日份的好心情已送达。'],
    concise: ['早。', '早安。']
  },
  night: {
    warm: ['晚安，今天辛苦了，剩下的事明天再说。', '早点睡吧，别又刷手机刷到很晚。', '晚安，做个好梦。'],
    neutral: ['晚安。', '早点休息。', '好，晚安。'],
    playful: ['晚安，梦里记得给我留个位置。', '去睡吧，熬夜扣分。'],
    concise: ['晚安。', '早点睡。']
  },
  tired: {
    warm: ['听起来今天真的把你耗得够呛。先别管别的，去倒杯水、伸个懒腰，剩下的慢慢说。', '辛苦你了，这种累不是睡一觉就能散的，今晚早点收工。', '嗯，我听着呢。要不先把手机放下十分钟，让脑子空一会儿？'],
    neutral: ['听着确实挺累的，先歇一会儿吧。', '辛苦了，今天到这儿就够了。', '那先别硬撑，休息一下。'],
    playful: ['收到，今日份的疲惫已记录。现在批准你原地躺平，谁叫都不许起来。', '这么累还来找我，是不是有点想我了？先去休息，我在这儿。'],
    concise: ['先休息，别硬扛。', '知道了，早点睡。']
  },
  work: {
    warm: ['汇报结束就该松口气了，你已经准备很久了，结果不会差。', '这件事你一直放在心上，现在总算落地了，晚上奖励自己一顿好的。', '忙完这阵记得停一下，别让工作把整天都占满。'],
    neutral: ['结束了就先放一放，等结果再说。', '嗯，这一步走完就轻松点了。', '听着进展还行，别太绷着。'],
    playful: ['汇报完的人最有资格摆烂，今晚你说了算。', '恭喜通关，下一关明天再开。'],
    concise: ['结束了就好，先歇着。', '嗯，等结果。']
  },
  food: {
    warm: ['到饭点了，别又随便对付。吃点热的，胃会舒服些。', '记得吃饭，忙起来最容易忘的就是这个。', '今天想吃什么？别说不饿。'],
    neutral: ['该吃饭了。', '吃了吗？', '先去吃饭吧。'],
    playful: ['吃饭这件事不许拖延，快去。', '再不吃饭我要生气了。'],
    concise: ['吃饭。', '别忘了吃。']
  },
  meet: {
    warm: ['好啊，你定时间，我这几天晚上都行。', '可以呀，你想去哪儿？我配合你。', '见面聊更好，文字说不清楚。'],
    neutral: ['行，你定时间。', '可以，提前说一声。', '这周有空，你安排。'],
    playful: ['终于想起来约我了？行吧，给你个机会。', '可以，但要选个好吃的店。'],
    concise: ['行，你定。', '可以。']
  },
  thanks: {
    warm: ['跟我还客气什么。', '不用谢，能帮上就好。', '小事，你别放在心上。'],
    neutral: ['不客气。', '没事。', '应该的。'],
    playful: ['谢就不用了，请我吃饭比较实在。', '记下了，下次还我。'],
    concise: ['不客气。', '没事。']
  },
  apology: {
    warm: ['没事的，我知道你不是故意的。', '不用道歉，说开就好了。', '我也有点急，别往心里去。'],
    neutral: ['没事，过去了。', '知道了，下次注意就好。', '不用道歉。'],
    playful: ['道歉接受，但要有点诚意。', '行吧，原谅你了。'],
    concise: ['没事。', '算了。']
  },
  upset: {
    warm: ['先别急着讲道理，你现在难受是真的。想说就说，我听着。', '这事换谁都会不舒服。你不用马上想明白。', '我在，你慢慢说。'],
    neutral: ['听起来确实让人不舒服。', '嗯，然后呢？', '先别想太多。'],
    playful: ['谁惹你了，报名字。', '别憋着，说出来会好点。'],
    concise: ['我在。', '说说看。']
  },
  price: {
    warm: ['价格我整理一下发你，别急，先确认你要的是哪一档。', '这个要看具体需求，我给你列清楚再报，免得后面有出入。', '我先跟你说清楚包含什么，你再决定。'],
    neutral: ['具体价格要看配置，我确认后回你。', '我先核对一下再报给你。', '这个得按需求算，稍等。'],
    playful: ['先别问价，先说你想要什么，我好给你算。', '价格好说，先对需求。'],
    concise: ['我核对后回你。', '按需求算。']
  },
  process: {
    warm: ['这一步我帮你对一下，材料齐了我们就往下走。', '别急，我按顺序跟你确认，缺什么我告诉你。', '你先看这一项，确认没问题我们再继续。'],
    neutral: ['先确认这一步，再往下。', '材料齐了就说一声。', '按流程来，我一步步告诉你。'],
    playful: ['跟着我走，不会乱。', '一步一来，别跳步。'],
    concise: ['先确认这一步。', '按顺序来。']
  },
  question: {
    warm: ['你这么一问我还真想了下。你自己更倾向哪种？', '这个我得确认一下再回你，别给你错的信息。', '我想想……你那边现在是什么情况？'],
    neutral: ['我确认一下再回你。', '看情况，你具体指哪个？', '这个要分情况。'],
    playful: ['考我呢？让我想想。', '这个问题有点难，容我想三秒。'],
    concise: ['我确认下。', '看情况。']
  },
  miss: {
    warm: ['我也在想你。', '刚还想给你发消息来着。', '嗯，在呢。'],
    neutral: ['在的。', '怎么了？', '嗯。'],
    playful: ['想我就直说。', '巧了，我也是。'],
    concise: ['在。', '嗯。']
  },
  default: {
    warm: ['嗯，我在听。你接着说。', '收到，我大概明白了。', '这事你更在意哪一部分？', '好，那我们按你说的来。'],
    neutral: ['嗯，知道了。', '好。', '然后呢？', '行，我记下了。'],
    playful: ['嗯哼，继续。', '有意思，说下去。', '收到。'],
    concise: ['嗯。', '好。', '知道了。']
  }
};

function detectIntent(text) {
  const t = String(text || '').toLowerCase();
  if (/晚安|睡了|困了|睡觉/.test(t)) return 'night';
  if (/早安|早上好|早呀|^早[，,。!！]?$/.test(t)) return 'morning';
  if (/累|疲惫|压力|加班|忙死|撑不住|好困/.test(t)) return 'tired';
  if (/汇报|会议|开会|项目|deadline|交付|方案|客户/.test(t)) return 'work';
  if (/吃|饭|午饭|晚饭|外卖|饿/.test(t)) return 'food';
  if (/见面|约|有空|什么时候见|出来/.test(t)) return 'meet';
  if (/谢谢|感谢|麻烦你|辛苦了/.test(t)) return 'thanks';
  if (/对不起|抱歉|不好意思|我错了/.test(t)) return 'apology';
  if (/生气|不开心|难过|烦|委屈|崩溃/.test(t)) return 'upset';
  if (/多少钱|价格|报价|费用|怎么收费/.test(t)) return 'price';
  if (/进度|材料|办理|审核|提交|流程|下一步/.test(t)) return 'process';
  if (/想你|想我|在吗|在不在/.test(t)) return 'miss';
  if (/[?？]|吗[。!！]?$|呢[。!！]?$/.test(t)) return 'question';
  return 'default';
}

function grams(text) {
  const clean = String(text || '').replace(/[\s\p{P}]/gu, '');
  const out = new Set();
  for (let i = 0; i < clean.length - 1; i++) out.add(clean.slice(i, i + 2));
  return out;
}

function scoreText(a, b) {
  const ga = grams(a);
  const gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit++;
  return hit / Math.sqrt(ga.size * gb.size);
}

function pickMemories(memories, text, limit = 2) {
  return (memories || [])
    .map((m) => ({ ...m, score: scoreText(m.text, text) }))
    .filter((m) => m.score > 0.06)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function seededPick(list, seed) {
  if (!list || !list.length) return '';
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return list[h % list.length];
}

function memoryLine(mem) {
  const text = String(mem.text || '').replace(/[。！？!?]+$/, '');
  const variants = [
    `我还记得你之前提过「${text}」。`,
    `你之前说过「${text}」，这次也算有个交代了。`,
    `说到这个，我想起你提过「${text}」。`
  ];
  return seededPick(variants, text);
}

function knowledgeHit(knowledge, text) {
  if (!knowledge || !knowledge.length) return null;
  let best = null;
  for (const k of knowledge) {
    const score = scoreText(`${k.title} ${k.content}`, text);
    if (!best || score > best.score) best = { ...k, score };
  }
  return best && best.score > 0.12 ? best : null;
}

function safetyCheck(text, forbidden) {
  const list = String(forbidden || '')
    .split(/[,，\n;；]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hit = list.filter((w) => text.includes(w));
  return hit;
}

function localDraft(ctx) {
  const { contact = {}, memories = [], history = [], knowledge = [], flow = null, assistantType = 'emotional' } = ctx;
  const lastInbound = [...history].reverse().find((m) => m.role === 'contact');
  const inbound = lastInbound ? lastInbound.content : '';
  const tone = TEMPLATES[detectIntent(inbound)] && contact.tone && TEMPLATES[detectIntent(inbound)][contact.tone]
    ? contact.tone
    : 'warm';
  const intent = detectIntent(inbound);
  const pool = (TEMPLATES[intent] && TEMPLATES[intent][tone]) || TEMPLATES[intent].warm || TEMPLATES.default.warm;
  let text = seededPick(pool, inbound + (contact.id || ''));

  const used = pickMemories(memories, inbound, 1);
  if (used.length && !/^嗯|^好|^早|^晚安/.test(text)) {
    text = `${memoryLine(used[0])}${text}`;
  }

  if (assistantType === 'process' && flow && flow.currentStep) {
    const step = flow.currentStep;
    const guide = `现在这一步是「${step.title}」${step.desc ? `：${step.desc}` : ''}。你确认后我们再往下走。`;
    text = inbound ? `${guide}` : guide;
    return { text, engine: 'local', usedMemories: used, intent };
  }

  if (intent === 'question') {
    const hit = knowledgeHit(knowledge, inbound);
    if (hit) {
      const brief = String(hit.content).replace(/\s+/g, ' ').slice(0, 80);
      text = `按你之前给的资料：${brief}${brief.length >= 80 ? '…' : ''} 你看这样回复可以吗？`;
    }
  }

  return { text, engine: 'local', usedMemories: used, intent };
}

function buildPrompt(ctx) {
  const { contact = {}, memories = [], history = [], knowledge = [], flow = null, assistantType, settings = {} } = ctx;
  const recent = history.slice(-12).map((m) => {
    const who = m.role === 'contact' ? (contact.name || '对方') : '我';
    return `${who}：${m.content}`;
  }).join('\n');

  const memoryText = memories.slice(0, 12).map((m) => `- ${m.text}`).join('\n') || '（暂无）';
  const knowledgeText = knowledge.slice(0, 6).map((k) => `- ${k.title}：${String(k.content).slice(0, 120)}`).join('\n') || '（暂无）';

  if (assistantType === 'process') {
    const step = flow && flow.currentStep;
    return [
      '你是一个业务办理流程助手，代替用户与对方沟通。',
      `联系人：${contact.name || '对方'}（渠道 ${contact.channel || '未知'}）`,
      `业务流程：${flow ? flow.name : '未绑定'}`,
      step ? `当前步骤：${step.title}${step.desc ? ` —— ${step.desc}` : ''}` : '当前无进行中的步骤',
      `业务资料：\n${knowledgeText}`,
      `最近对话：\n${recent || '（暂无）'}`,
      '要求：只输出一条可直接发送的中文回复，20-70 字；先回应当前问题，再明确下一步；不要编造资料中没有的承诺、价格或时限；不要提及你是 AI。'
    ].join('\n');
  }

  return [
    '你正在以用户本人的身份，起草一条发给私聊联系人的即时消息。',
    `联系人：${contact.name || '对方'}`,
    `语气设定：${TONE_LABEL[contact.tone] || '自然'}；称呼习惯：${contact.address || '不特别称呼'}；相处边界：${contact.boundaries || '无特殊限制'}；禁止话题：${settings.forbiddenTopics || '无'}`,
    `与该联系人的长期记忆（只使用相关条目，绝不编造）：\n${memoryText}`,
    `可参考的资料：\n${knowledgeText}`,
    `最近对话：\n${recent || '（暂无）'}`,
    '要求：只输出一条可直接发送的中文回复，不要解释、不要加引号、不要写“建议回复”；长度 15-60 字，符合即时通讯习惯；先共情再回应；不编造事实、行程或承诺；不提及你是 AI。'
  ].join('\n');
}

async function llmCall(messages, { temperature = 0.8, maxTokens = 220 } = {}, llm) {
  const cfg = normalizeLlm(llm);
  if (!cfg.apiKey) throw new Error('未配置 API Key');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    });
    if (!resp.ok) {
      const body = await resp.text();
      const err = new Error(`LLM ${resp.status}: ${body.slice(0, 200)}`);
      err.status = resp.status;
      throw err;
    }
    const data = await resp.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    return String(content || '').trim();
  } finally {
    clearTimeout(timer);
  }
}

async function llmComplete(messages, opts = {}, llm) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await llmCall(messages, opts, llm);
    } catch (e) {
      lastErr = e;
      const retryable = e.status === 429 || (e.status >= 500 && e.status < 600) || e.name === 'AbortError';
      if (!retryable || attempt === 1) break;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  throw lastErr || new Error('LLM 调用失败');
}

function cleanOutput(text) {
  return String(text || '')
    .replace(/[\s\S]*?<\/think>/gi, '')
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```\s*$/i, '')
    .replace(/^["“「]|["”」]$/g, '')
    .trim();
}

async function draftReply(ctx, llm) {
  const fallback = localDraft(ctx);
  const cfg = normalizeLlm(llm);
  if (!cfg.apiKey) return fallback;
  try {
    const text = await llmComplete([
      { role: 'system', content: buildPrompt(ctx) },
      { role: 'user', content: '请直接给出这一条回复。' }
    ], {}, cfg);
    if (!text) return fallback;
    return {
      text: cleanOutput(text),
      engine: 'llm',
      usedMemories: fallback.usedMemories,
      intent: fallback.intent
    };
  } catch (e) {
    console.warn('[ai] 模型调用失败，回退本地引擎:', e.message);
    return { ...fallback, engine: 'local', warning: e.message };
  }
}

const OFFLINE_DICT = [
  ['你好', 'Hello'], ['谢谢', 'Thank you'], ['再见', 'Goodbye'],
  ['晚安', 'Good night'], ['早上好', 'Good morning'], ['辛苦了', 'Thanks for your hard work'],
  ['没问题', 'No problem'], ['好的', 'Okay'], ['在吗', 'Are you there?'],
  ['多少钱', 'How much is it?'], ['明天见', 'See you tomorrow'], ['我想你', 'I miss you']
];

async function translate(text, target = 'en', llm) {
  const raw = String(text || '').trim();
  if (!raw) return { text: '', engine: 'none' };
  const cfg = normalizeLlm(llm);
  if (!cfg.apiKey) {
    let out = raw;
    for (const [zh, en] of OFFLINE_DICT) {
      if (target === 'en' && out.includes(zh)) out = out.split(zh).join(en);
      if (target === 'zh' && out.includes(en)) out = out.split(en).join(zh);
    }
    return {
      text: out,
      engine: out === raw ? 'offline' : 'dictionary',
      note: out === raw ? '未配置模型 API Key，返回原文' : undefined
    };
  }
  try {
    const out = await llmComplete([
      {
        role: 'system',
        content: `你是翻译引擎。把用户输入翻译成${target === 'en' ? '英文' : '简体中文'}，保留语气与口语感，只输出译文，不要解释。`
      },
      { role: 'user', content: raw }
    ], { temperature: 0.3, maxTokens: 400 }, cfg);
    return { text: cleanOutput(out) || raw, engine: 'llm' };
  } catch (e) {
    return { text: raw, engine: 'offline', note: e.message };
  }
}

function engineInfo(llm) {
  const cfg = normalizeLlm(llm);
  return {
    engine: cfg.apiKey ? 'llm' : 'local',
    model: cfg.apiKey ? cfg.model : '本地规则引擎',
    baseUrl: cfg.apiKey ? cfg.baseUrl : null,
    hasKey: Boolean(cfg.apiKey)
  };
}

/**
 * 用最小请求验证用户的 Key / 地址 / 模型是否可用
 * 成功返回 { ok:true, model, latencyMs, sample }
 */
async function testConnection(llm) {
  const cfg = normalizeLlm(llm);
  if (!cfg.apiKey) {
    return { ok: false, error: '还没填写 API Key' };
  }
  const started = Date.now();
  try {
    const text = await llmCall([
      { role: 'system', content: '你是一个连通性测试助手。' },
      { role: 'user', content: '只回复两个字：可用' }
    ], { temperature: 0, maxTokens: 16 }, cfg);
    return {
      ok: true,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      latencyMs: Date.now() - started,
      sample: cleanOutput(text).slice(0, 40)
    };
  } catch (e) {
    return {
      ok: false,
      status: e.status || null,
      latencyMs: Date.now() - started,
      error: friendlyError(e)
    };
  }
}

function friendlyError(e) {
  const msg = String((e && e.message) || e || '');
  const status = e && e.status;
  if (status === 401 || status === 403) return 'API Key 无效或没有权限（401/403），请检查是否复制完整';
  if (status === 404) return '接口地址或模型名不存在（404），请检查 Base URL 是否带 /v1、模型名是否拼写正确';
  if (status === 429) return '触发限流（429），Key 是有效的，稍后再试或换一个模型';
  if (status >= 500) return `模型服务端错误（${status}），稍后再试`;
  if (e && e.name === 'AbortError') return '请求超时（30s），请检查网络或接口地址';
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(msg)) return '无法连接该地址，请检查 Base URL 是否正确、服务器能否出网';
  return msg.slice(0, 200) || '未知错误';
}

/** 常见服务商预设，供前端下拉选择 */
const PRESETS = [
  {
    id: 'groq',
    label: 'Groq（推荐，速度快、有免费额度）',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'qwen/qwen3.8-27b',
    models: ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b'],
    keyUrl: 'https://console.groq.com/keys',
    keyPrefix: 'gsk_'
  },
  {
    id: 'openai',
    label: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek（国内直连，便宜）',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyPrefix: 'sk-'
  },
  {
    id: 'moonshot',
    label: 'Moonshot / Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k'],
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    keyPrefix: 'sk-'
  },
  {
    id: 'custom',
    label: '自定义（任意 OpenAI 兼容接口 / 本地 Ollama）',
    baseUrl: '',
    model: '',
    models: [],
    keyUrl: '',
    keyPrefix: ''
  }
];

module.exports = {
  draftReply,
  translate,
  safetyCheck,
  pickMemories,
  detectIntent,
  engineInfo,
  testConnection,
  normalizeLlm,
  friendlyError,
  PRESETS,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  TONE_LABEL
};
