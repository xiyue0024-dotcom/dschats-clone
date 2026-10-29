# DSChats 复刻版

> 依据 [dschats.com](https://dschats.com) 公开功能整理的复刻实现：**情感助手 + 流程助手**，双状态流程追踪、分级记忆、三档回复模式、审计日志。
>
> **零 npm 依赖**（只用 Node 内置模块），克隆下来 `node server.js` 就能跑。
> 大模型 Key 由每个用户自己在网页里填，仓库里不含任何密钥。

<p>
  <a href="https://render.com/deploy?repo=https://github.com/YOURNAME/dschats-clone">
    <img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" height="36">
  </a>
  &nbsp;
  <a href="https://railway.app/new/template?template=https://github.com/YOURNAME/dschats-clone">
    <img src="https://railway.app/button.svg" alt="Deploy on Railway" height="36">
  </a>
</p>

> 上面两个按钮里的 `YOURNAME` 换成你的 GitHub 用户名（或用仓库的实际地址），点一下就能在你自己的账号下开出实例。

---

## 一分钟跑起来

### 方式 A：本地 / 自己的服务器

```bash
git clone https://github.com/YOURNAME/dschats-clone.git
cd dschats-clone
node server.js
# → http://127.0.0.1:5173
```

需要 Node.js ≥ 18。**不用 `npm install`**，因为一个依赖都没有。

### 方式 B：Docker

```bash
docker compose up -d
# → http://localhost:3000
```

或者手动：

```bash
docker build -t dschats .
docker run -d -p 3000:3000 -v dschats-data:/app/data --name dschats dschats
```

### 方式 C：云平台（拿到公网链接）

| 平台 | 一键 / 命令 | 持久化 |
|---|---|---|
| **Render** | 上面的 Deploy 按钮，或 Blueprint 导入 `render.yaml` | 免费套餐无磁盘 → 用 Upstash；付费套餐挂 `/app/data` |
| **Railway** | New Project → Deploy from GitHub（自动读 `railway.json`） | 加一个 Volume 挂到 `/app/data` |
| **Fly.io** | 见下方命令 | Volume 挂 `/app/data`，开箱持久 |
| **Zeabur / Koyeb / 群晖** | 识别 `Dockerfile` 直接部署 | 挂 `/app/data` 或用 Upstash |

Fly.io 最省事（默认就带持久卷）：

```bash
fly launch --no-deploy --copy-config
fly volumes create dschats_data --size 1 --region hkg
fly secrets set APP_SECRET=$(openssl rand -hex 32)
fly deploy
fly open
```

---

## ⚠️ 部署前必看：数据存在哪

这是唯一容易踩的坑。本应用**需要持久化**，否则每次重启用户和 Key 都会没。

两种存储后端，自动选择：

| 条件 | 后端 | 说明 |
|---|---|---|
| 没设 `UPSTASH_REDIS_REST_URL` | **file** | 写 `data/db.json`。必须有持久磁盘/卷 |
| 设了 Upstash 两个变量 | **upstash** | 存到 Upstash Redis（纯 HTTP）。适合无盘平台 |

**选型建议**

- VPS、Docker、Fly、Railway（加了 Volume）→ 用 **file**，什么都不用配
- Render 免费套餐、Vercel 这类无盘环境 → 用 **upstash**，否则重启丢数据

Upstash 免费额度（256MB / 每天 1 万次命令）对这个应用绰绰有余：写入是防抖合并的，一次操作通常只产生 1 次命令。

配置方式：在 [console.upstash.com](https://console.upstash.com/redis) 建一个 Redis，复制 REST URL 和 Token，填进环境变量即可。

启动日志会明确告诉你当前用的是哪种：

```
  存储:   本地文件 data/db.json
  # 或
  存储:   Upstash (upstash:dschats:db)
```

---

## 环境变量

全部可选。

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `5173` | 监听端口。云平台会自动注入 |
| `HOST` | `127.0.0.1`（有 `PORT` 时自动变 `0.0.0.0`） | 监听地址 |
| `APP_SECRET` | 自动生成 | **加密用户模型 Key 的主密钥**。无盘平台必须显式设置 |
| `UPSTASH_REDIS_REST_URL` | 空 | 设了就启用云端存储 |
| `UPSTASH_REDIS_REST_TOKEN` | 空 | 同上 |
| `UPSTASH_KEY` | `dschats:db` | 数据在 Redis 里的键名 |
| `TELEGRAM_BOT_TOKEN` | 空 | 可选，启用 Telegram 通道 |
| `DATA_DIR` | `./data` | 数据目录，容器挂载/测试隔离用 |

生成 `APP_SECRET`：

```bash
openssl rand -hex 32
```

> `APP_SECRET` 一旦设定就别再改。改了之后用户已保存的模型 Key 会解不开（其它数据不受影响，会优雅降级到本地引擎）。

---

## 功能

| 模块 | 能力 |
|---|---|
| **两种助手** | 情感助手（关系维护）、流程助手（业务办理），注册时二选一，不可更改 |
| **分级记忆** | 每条记忆带来源与置信度；草稿只引用相关条目，不编造 |
| **人设边界** | 每个联系人可设语气、称呼习惯、相处边界、禁止话题 |
| **三档回复** | 关闭 / AI 草稿 / 自动发送；自动发送还有全局暂停、总开关、时段、日限额四道闸 |
| **双状态流程** | 每一步区分「对方自述」与「已核实」，避免把客户的话当结论 |
| **知识库** | 业务资料作为草稿依据，减少胡编 |
| **审计日志** | AI 生成、AI 发送、人工发送、流程变更、设置修改全部留痕 |
| **翻译** | 草稿或输入内容一键中英互译 |
| **模型自选** | 每个用户填自己的 Key，支持 Groq / OpenAI / DeepSeek / Moonshot / 任意 OpenAI 兼容接口 |
| **Telegram** | Bot API 长轮询，不用个人号凭证 |

**没填模型 Key 也能用**：自动走内置的本地规则引擎（意图识别 + 语气模板 + 记忆注入），完整流程都能演示。

---

## 用户怎么填模型 Key

1. 注册 / 登录 → 左侧「设置」
2. 「AI 模型」面板选服务商（Groq / OpenAI / DeepSeek / Moonshot / 自定义），Base URL 和模型名会自动填好
3. 粘贴自己的 API Key → 点「测试连接」→ 看到「连接成功」再点「保存」

Key 用 **AES-256-GCM** 加密后存进数据库，接口只返回掩码（`gsk_••••••••OfH2`），明文不会回传到浏览器，也不会出现在仓库或任何部署文件里。

| 服务商 | Base URL | 默认模型 | 申请 |
|---|---|---|---|
| Groq | `https://api.groq.com/openai/v1` | `qwen/qwen3.8-27b` | [console.groq.com/keys](https://console.groq.com/keys) |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | [platform.moonshot.cn](https://platform.moonshot.cn/console/api-keys) |

本地 Ollama 也可以：Base URL 填 `http://127.0.0.1:11434/v1`，Key 随便填一个非空值。

---

## 目录结构

```
.
├── server.js              # HTTP 服务、路由、业务逻辑
├── lib/
│   ├── db.js              # 存储层：file / upstash 双后端
│   ├── auth.js            # scrypt 哈希、会话令牌
│   ├── secret.js          # API Key 的 AES-256-GCM 加解密
│   ├── ai.js              # 提示词、LLM 调用、本地规则引擎、翻译
│   └── telegram.js        # Bot API 长轮询
├── public/
│   ├── index.html         # 落地页
│   ├── auth.html          # 登录 / 注册
│   ├── workspace.html     # 工作台
│   ├── css/{base,landing,app}.css
│   └── js/{auth,workspace}.js
├── scripts/smoke.js       # 冒烟测试
├── data/                  # 运行时数据（git 忽略）
├── Dockerfile
├── docker-entrypoint.sh   # 修正挂载卷属主后降权运行
├── docker-compose.yml
├── render.yaml            # Render Blueprint
├── railway.json
├── fly.toml
└── .github/workflows/ci.yml
```

---

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | 健康检查（含存储后端状态） |
| POST | `/api/auth/register` `/login` `/logout` | 账号 |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/bootstrap` | 工作区初始化数据 |
| GET/PATCH/DELETE | `/api/llm` | 自己的模型配置（只回掩码） |
| POST | `/api/llm/test` | 测试模型连接 |
| GET/POST | `/api/contacts` | 联系人 |
| GET/POST | `/api/contacts/:id/messages` | 消息与草稿 |
| POST | `/api/contacts/:id/draft` `/draft/clear` `/send` `/translate` | 草稿与发送 |
| GET/POST | `/api/flows` | 流程 |
| POST | `/api/flows/:id/select` `/advance` | 流程状态 |
| GET/POST | `/api/knowledge` | 知识库 |
| GET | `/api/audit` `/api/usage` | 审计与用量 |
| PATCH | `/api/settings` | 自动化与安全设置 |

---

## 安全设计

- **默认不自动发送**：`automationPaused=true`、`autoSendEnabled=false`、联系人默认 `draft`
- **四道闸才自动发**：全局开关 + 联系人设为 `auto` + 在允许时段 + 未超日限额
- **禁止话题**：命中后既不生成也不发送，只记审计
- **密码**：scrypt + 随机盐，`timingSafeEqual` 校验
- **会话**：`HttpOnly` + `SameSite=Lax`，反代 HTTPS 下自动加 `Secure`
- **响应头**：CSP、`X-Frame-Options: DENY`、`nosniff`、`no-referrer`、`Permissions-Policy`
- **密钥**：AES-256-GCM 加密存储，接口只回掩码
- **多租户**：所有查询按 `userId` 过滤，越权访问返回 404

---

## 开发

```bash
npm run check   # 语法检查
npm run smoke   # 起临时实例跑一遍关键链路
```

CI（`.github/workflows/ci.yml`）在每次 push / PR 时自动跑这两步，外加 Docker 构建与容器探活。

---

## 边界

1. **不做个人号接管**。需要 MTProto 会话凭证，违反 Telegram / WhatsApp 条款，泄露即等于账号被接管。这里只用官方 Bot API。
2. **不含支付**。没有套餐与付费墙，注册即用。
3. **单进程**。文件存储靠内存缓存 + 延迟落盘，多进程会互相覆盖。云平台请设 `numReplicas: 1`。
4. **不含邮件验证**。生产环境需自行接 SMTP 并加频率限制。
5. **Telegram 入站默认归属最早创建的用户**。生产多租户需要做 bot ↔ 工作区绑定。

---

## 免责声明

本项目是依据公开信息做的功能复刻，**与 dschats.com 官方无任何关联**，不包含其任何代码或数据。仅用于功能验证与二次开发参考。

用于真实社交场景前请自行评估当地法规（多地要求 AI 交互标识），并尊重对话对方的知情权。

## License

[MIT](LICENSE)
