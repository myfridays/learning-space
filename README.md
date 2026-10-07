# 📚 学习空间

一个自己用的学习记录站点：**笔记 · 待办 · 习惯打卡 · 文档阅读**，跑在 Cloudflare 上，手机和电脑打开都是同一份数据。

```
浏览器（手机 / 电脑）
        │
        ▼
Cloudflare Workers ──┬── Cloudflare D1（SQLite）  笔记 / 待办 / 习惯 / 打卡记录
   （前端 + 后端）    └── Cloudflare R2              PDF 等文件本体
```

---

## 它解决什么问题

| 需求 | 实现 |
|---|---|
| 记录学习笔记，类似博客 | Markdown 编辑器，实时预览，标签 + 全文搜索 |
| 存文档、限制总容量 | 文件进 R2，容量上限在数据库里卡（默认 8 GB，可改） |
| 手机和电脑看到同一份数据 | 数据存服务端，不是浏览器本地 |
| 记录习惯 | 每日打卡、连续天数、16 周热力图，支持补打卡 |
| 待办 | 优先级、截止日期、逾期提醒 |
| 后续继续扩展 | 零依赖、模块化，加功能不用动基础设施 |

---

## ⭐ 关于「数据会不会丢」

这是设计时最优先考虑的事，具体保障有四层：

| 层 | 机制 | 说明 |
|---|---|---|
| 1 | **服务端存储** | 数据存在 D1，浏览器只负责显示。换设备、换浏览器、清缓存都不影响 |
| 2 | **自动保存 + 状态提示** | 停止输入 1.2 秒自动保存，右上角明确显示「已保存 / 保存中 / 未保存 / 保存失败」 |
| 3 | **D1 Time Travel** | 免费版可恢复到**过去 7 天内的任意一分钟**，不额外收费，自动开启 |
| 4 | **一键导出** | 设置页可导出全部数据为 JSON，随时可以带走 |

已经验证过的场景（见 `tools/test-api.mjs` 与 `tools/test-http.mjs`）：

- ✅ 换一个全新的数据库连接，数据还在
- ✅ 服务进程被强杀、WAL 未落盘，重启后数据一字不差
- ✅ 会话 Cookie 被篡改会被签名校验拦下

---

## 技术栈

**刻意选择了零运行时依赖**——没有一个 npm 包，`npm install` 只装 wrangler（开发工具）。

| 层 | 选型 | 为什么 |
|---|---|---|
| 后端 | 原生 Cloudflare Workers Fetch API | 不需要框架，Workers 本身就够 |
| 数据库 | Cloudflare D1（SQLite） | 免费 5 GB，有 Time Travel |
| 文件存储 | Cloudflare R2 | 免费 10 GB，**出口流量永久免费** |
| 前端 | 原生 ES Module + 自己写的 Markdown 渲染器 | 没有构建步骤，改完刷新即生效 |
| 样式 | 手写 CSS（约 900 行） | 无 Tailwind 依赖，改配色只需动 CSS 变量 |
| 本地开发 | Node.js 内置的 `node:sqlite` + `node:http` | 不用装 wrangler 也能跑，启动几十毫秒 |

**为什么不要框架**：这套东西的规模用原生完全够，而且换来三个好处——部署快、没有构建步骤、没有供应链风险。以后真需要 React，前端目录是独立的，随时可以换。

---

## 快速开始

### 前置

只需要 **Node.js 22 或更高版本**（推荐 24）。

```bash
node -v
```

### 三步跑起来

```bash
cd learning-space

# 1. 配置本地环境（会创建一个带默认密码的配置文件）
cp .dev.vars.example .dev.vars
#    然后编辑 .dev.vars，把 APP_PASSWORD 改成你自己的密码

# 2. 初始化本地数据库（会自动执行 migrations/ 下的 SQL）
npm run migrate

# 3. 启动
npm run dev
```

打开 **http://127.0.0.1:8787** ，输入你设置的密码即可。

> 如果你懒得改密码，默认是 `change-me-please`。
> **部署到公网前务必改掉。**

### 验证一切正常

```bash
npm test          # 98 项接口断言（不需要启动服务）
npm run test:http # 34 项 HTTP 断言（需要先 npm run dev）
```

---

## 目录结构

```
learning-space/
├── wrangler.jsonc          Cloudflare 部署配置
├── migrations/             数据库结构（按文件名顺序执行）
│   ├── 0001_init.sql
│   └── 0002_seed.sql       可选的示例数据
│
├── worker/                 ── 后端（跑在 Cloudflare Workers 上）
│   ├── index.ts            入口：路由分发 + 认证网关 + 错误处理
│   ├── router.ts           极简路由器
│   ├── auth.ts             密码登录 + HMAC 签名 Cookie
│   ├── db.ts               ★ 所有 SQL 都在这里
│   ├── lib.ts              参数校验、JSON 响应、错误类型
│   ├── types.ts            手写的 D1 / R2 接口（为的是零依赖）
│   └── routes/
│       ├── notes.ts        笔记
│       ├── todos.ts        待办
│       ├── habits.ts       习惯打卡
│       ├── documents.ts    文件上传 / 下载 / Range
│       └── data.ts         首页聚合、统计、导出
│
├── public/                 ── 前端（无构建步骤，直接就是部署产物）
│   ├── index.html
│   ├── app.css             全部样式
│   ├── sw.js               Service Worker（接口永不缓存）
│   └── js/
│       ├── app.js          路由 + 外壳 + 主题
│       ├── api.js          接口封装
│       ├── markdown.js     自己写的 Markdown 渲染器
│       ├── util.js         日期、格式化、防抖、提示
│       ├── components.js   共用界面片段
│       └── views/          各页面
│           ├── login.js  dashboard.js  notes.js
│           ├── todos.js  habits.js     files.js  settings.js
│
├── tools/                  ── 本地开发工具（不部署）
│   ├── dev.mjs             本地服务器（模拟 Workers + D1 + R2）
│   ├── migrate.mjs         跑迁移
│   ├── test-api.mjs        直接调用 Worker 的接口测试
│   ├── test-http.mjs       通过真实 HTTP 的接口测试
│   └── lib/
│       ├── d1.mjs          用 node:sqlite 模拟 D1
│       ├── r2.mjs          用文件系统模拟 R2
│       └── env.mjs         读 .dev.vars
│
└── prototype/index.html    最早那个静态原型（留个纪念）
```

---

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动本地服务器（http://127.0.0.1:8787） |
| `npm run migrate` | 对本地数据库执行 migrations |
| `npm test` | 跑接口测试（98 项） |
| `npm run test:http` | 跑 HTTP 测试（34 项，需先启动 dev） |
| `npm run db:remote` | 对**线上**数据库执行迁移 |
| `npm run deploy` | 部署到 Cloudflare |
| `npm run logs` | 实时查看线上日志 |
| `npm run backup` | 导出线上数据库为 backup.sql |

---

## 部署

见 **[DEPLOY.md](./DEPLOY.md)** —— 从注册 Cloudflare 账号到绑定域名、配置国内访问优化，一步步都有。

---

## 已知限制

| 限制 | 说明 |
|---|---|
| 单个文件上传上限 **100 MB** | Cloudflare 免费版对请求体的硬限制。更大的文件需要改用 R2 预签名 URL 直传（见 DEPLOY.md） |
| Workers 免费版 **CPU 时间 10 ms/请求** | 本项目逻辑很轻，实测远低于此。但如果以后加了很重的服务端计算要留意 |
| Workers 免费版 **10 万请求/天** | 个人使用完全够（一个页面 ≈ 1 个请求 + 几个接口请求） |
| D1 免费版 **10 万行写入/天** | 单用户不可能撞到（一天正常约 160 行） |
| 全文搜索用的是 `LIKE` | 笔记量上千之后可以升级成 D1 的 FTS5 虚拟表（但导出时要先删掉虚拟表） |
| PDF 阅读用浏览器原生阅读器 | 用 `<iframe>` 加载，好处是手机上体验比自研阅读器好，代价是没法记录精确页码（目前靠手动填） |

---

## 后续可以扩展的方向

按投入产出比排序：

1. **Chrome 剪藏扩展** — 一键把网页存成笔记
2. **笔记双链** — `[[笔记名]]` 互相引用
3. **复习提醒** — 基于打卡记录做间隔重复
4. **全文搜索升级** — D1 FTS5 + jieba 分词
5. **图片粘贴上传** — 笔记里直接贴图
6. **移动端体验** — 已经做了响应式和 PWA，可以再加离线写入（要注意冲突处理）
7. **自动备份** — Cloudflare Cron Trigger + 定时导出到 R2

---

## 许可

自己用，随意。
