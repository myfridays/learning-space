# 部署指南

从零到线上可访问，全程大约 **30 分钟**，**不需要花一分钱**。

---

## 目录

1. [成本总览](#一成本总览)
2. [前置准备](#二前置准备)
3. [创建 D1 数据库](#三创建-d1-数据库)
4. [创建 R2 存储桶](#四创建-r2-存储桶)
5. [填写部署配置](#五填写部署配置)
6. [设置密码和密钥](#六设置密码和密钥)
7. [部署](#七部署)
8. [初始化线上数据库](#八初始化线上数据库)
9. [绑定自定义域名](#九绑定自定义域名)
10. [国内访问优化（优选 IP）](#十国内访问优化优选-ip)
11. [日常维护](#十一下日常维护备份恢复更新)
12. [额度与超支](#十二额度与超支)
13. [常见问题](#十三常见问题)

---

## 一、成本总览

| 项目 | 免费额度 | 超出后 |
|---|---|---|
| **Workers**（跑后端 + 前端） | 10 万请求/天 | 升级 Paid $5/月 |
| **D1**（数据库） | 5 GB 存储<br>500 万行读/天<br>10 万行写/天 | 读 $0.001/百万行<br>写 $1.00/百万行<br>存储 $0.75/GB-月 |
| **R2**（文件） | 10 GB 存储<br>100 万次写/月<br>1000 万次读/月 | $0.015/GB-月<br>写 $4.50/百万次<br>读 $0.36/百万次 |
| **R2 出口流量** | **永久免费，不限量** ⭐ | 永远 ¥0 |
| 域名（可选） | 先用 `*.workers.dev` | 约 ¥75/年 |

> 数据来源：[R2 定价](https://developers.cloudflare.com/r2/pricing/)、[D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)、[Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)

**结论：个人使用 ¥0。** 就算存到 100 GB 文件，也只要约 $1.35/月。

⚠️ 但 **Cloudflare 免费版的 Workers 走的是境外节点**，国内访问速度取决于你分配到的 IP（见[第十节](#十国内访问优化优选-ip)）。

---

## 二、前置准备

```bash
node -v          # 必须 22 或更高
cd learning-space
npm install      # 只装 wrangler 这一个开发工具
```

登录 Cloudflare：

```bash
npx wrangler login
```

会自动打开浏览器，点授权即可。

> 没有 Cloudflare 账号的话先去 https://dash.cloudflare.com/sign-up 注册，免费。

---

## 三、创建 D1 数据库

```bash
npx wrangler d1 create learning-space
```

输出类似这样：

```
✅ Successfully created DB 'learning-space' in region WEUR
Created your new D1 database.

[[d1_databases]]
binding = "DB"
database_name = "learning-space"
database_id = "a1b2c3d4-5e6f-7890-abcd-ef1234567890"
```

**把 `database_id` 抄下来**，下一步要用。

---

## 四、创建 R2 存储桶

```bash
npx wrangler r2 bucket create learning-space-files
```

> **注意**：第一次使用 R2 需要在 Cloudflare Dashboard 里手动开通一次
> （Workers & Pages → R2 → 会提示你开通）。开通 R2 本身是免费的，
> 可能要求绑定支付方式作为身份验证，但 10 GB 以内不会扣费。

---

## 五、填写部署配置

打开 `wrangler.jsonc`，把上一步的 `database_id` 填进去：

```jsonc
{
  "name": "learning-space",
  "main": "worker/index.ts",
  "compatibility_date": "2025-09-01",   // ← 建议改成你部署当天的日期

  "assets": {
    "directory": "./public",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  },

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "learning-space",
      "database_id": "把这里换成你的 database_id"   // ← 改这里
    }
  ],

  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "learning-space-files"
    }
  ],

  "vars": {
    "STORAGE_QUOTA_BYTES": "8589934592"   // 8 GiB，想改容量就改这个
  }
}
```

---

## 六、设置密码和密钥

**这一步不能省**。部署到公网而没设密码，等于把笔记公开。

```bash
# 登录密码（会提示你输入，输入时看不见字符是正常的）
npx wrangler secret put APP_PASSWORD

# 会话签名密钥，先生成一串随机字符
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
npx wrangler secret put AUTH_SECRET
```

确认一下：

```bash
npx wrangler secret list
```

应该看到 `APP_PASSWORD` 和 `AUTH_SECRET` 两项。

> 想改密码：重新执行一次 `npx wrangler secret put APP_PASSWORD` 即可。
> 改完 AUTH_SECRET 会让所有已登录的设备失效（需要重新登录）。

---

## 七、部署

```bash
npx wrangler deploy
```

成功后会输出访问地址：

```
Uploaded learning-space (1.23 sec)
Deployed learning-space triggers (0.45 sec)
  https://learning-space.你的子域.workers.dev
```

---

## 八、初始化线上数据库

**这一步千万不能忘**，否则打开网站会报「表不存在」。

```bash
# 建表
npx wrangler d1 execute learning-space --remote --file=./migrations/0001_init.sql

# 可选：插入示例数据（一篇欢迎笔记 + 3 个默认习惯）
npx wrangler d1 execute learning-space --remote --file=./migrations/0002_seed.sql
```

验证：

```bash
npx wrangler d1 execute learning-space --remote --command="SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name"
```

应该看到 `documents / habit_logs / habits / notes / settings / todos` 六张表。

现在打开那个 `workers.dev` 地址，输入密码就能用了 🎉

---

## 九、绑定自定义域名

`*.workers.dev` 在国内的可达性不稳定，**强烈建议绑自己的域名**。

### 9.1 买域名

- 国外：Cloudflare Registrar（成本价，约 $10/年）、Namecheap
- 国内：阿里云 / 腾讯云（需要域名实名认证，这是实名，不是备案）
- **白嫖**：有学校邮箱的话去 [GitHub Student Developer Pack](https://education.github.com/pack) 领 Namecheap 免费 `.me` 域名一年

### 9.2 把域名接入 Cloudflare

1. Cloudflare Dashboard → **Add a site** → 输入域名 → 选择 **Free 计划**
2. 按提示去你的域名注册商，把 **Nameserver 改成 Cloudflare 给的两个**
3. 等生效（几分钟到几小时）

### 9.3 给 Worker 绑定域名

**方式 A：Custom Domain（最简单，推荐先这样）**

在 `wrangler.jsonc` 里加：

```jsonc
"routes": [
  { "pattern": "notes.你的域名.com", "custom_domain": true }
]
```

然后重新部署：

```bash
npx wrangler deploy
```

Cloudflare 会自动创建 DNS 记录并签发 SSL 证书。

**方式 B：Worker Route（想做优选 IP 时用这个）**

```jsonc
"routes": [
  { "pattern": "notes.你的域名.com/*", "zone_name": "你的域名.com" }
]
```

然后在 Cloudflare 的 DNS 页面**自己**建一条记录指向这个域名。区别在于：方式 B 的 DNS 记录你可以自己调整类型和值，方式 A 是 Cloudflare 全权管理。

---

## 十、国内访问优化（优选 IP）

### 10.1 先搞清楚问题在哪

**Cloudflare 免费版拿不到中国大陆节点。** 官方文档明确写了，中国大陆节点属于
**Enterprise 企业版 + 单独订阅 China Network 套餐**，还要求持有 ICP 备案号并把域名内容交给京东云审核——个人用户不用考虑。

所以免费用户实际连的是**香港 / 日本 / 韩国 / 美西**的节点。

但 Cloudflare 用 Anycast：**同一个域名，不同 IP 的路由质量差别巨大**。社区实测数据是：

| | 延迟 | 体验 |
|---|---|---|
| 默认分配的 IP | 200–300 ms，偶有丢包 | 打开要等好几秒 |
| 优选 IP 之后 | **30–80 ms** | 基本跟国内站点差不多 |

有人实测过「Ping 280ms → 45ms，首屏 5.2 秒 → 1.1 秒」。
参考：[Cloudflare 优选 IP 教程](https://eastondev.com/blog/zh/posts/dev/20251201-cloudflare-speedtest-guide/)

### 10.2 ⚠️ 但先做这三件事，再决定要不要折腾

按顺序做，很多人做完第 1、2 步就够用了：

**第 1 步：必须用自定义域名，别用 `*.workers.dev`**

社区反馈里 `workers.dev` 是**被墙的**，`pages.dev` 也不稳。用免费子域名，怎么优化都没用。

**第 2 步：用手机流量实测**

关掉 WiFi，用手机数据网络打开你的网址，测这几件事：

```bash
# 或者电脑上直接 ping 测延迟
ping notes.你的域名.com
```

- 首屏几秒出来？
- 连续刷新 10 次，有几次打不开？
- 打开一个 PDF 卡不卡？

**如果 3 秒内能开、基本不失败 → 直接用，不用折腾了。**

**第 3 步：还是慢，再往下做优选 IP**

### 10.3 优选 IP 操作步骤

> ⚠️ 说明：这是**社区方案**，Cloudflare 官方不支持也不保证。原理是
> 「绕开默认的节点分配，手动把流量指向对你这条线路最快的 Cloudflare 节点」。
> 因为 Cloudflare 的边缘节点是靠 SNI 判断该返回哪个站点的内容，
> 所以即使连接的是「别人的」优选 IP，来的还是你自己的网站。
> **具体生效方式跟你的 DNS 托管方式有关，需要实测确认。**

**① 下载测速工具**

[CloudflareSpeedTest](https://github.com/XIU2/CloudflareSpeedTest/releases)（GitHub 上 2 万多 star）

- Windows：下载 `CloudflareST_windows_amd64.zip`，解压后双击 `CloudflareST.exe`
- macOS：下载 `CloudflareST_darwin_arm64.tar.gz`（M 系列芯片）
- Linux：下载 `CloudflareST_linux_amd64.tar.gz`，`chmod +x CloudflareST` 后运行

**② 测速**

```bash
# 基础用法（跑 5-15 分钟）
./CloudflareST

# 更精确：只测香港、东京、新加坡节点，多测几个
./CloudflareST -cfcolo HKG,NRT,SIN -n 500 -t 10 -dn 20
```

**⚠️ 测速前一定要关掉代理软件**，否则结果完全不准（会测出 0.3ms 这种假数据）。

**③ 看结果选 IP**

跑完会生成 `result.csv`，用 Excel 打开，看四列：

| 列 | 要求 |
|---|---|
| IP 地址 | 这是要填进 DNS 的 |
| 平均延迟 | **< 100 ms**，越靠前越好 |
| 下载速度 | **> 5 MB/s** |
| 丢包率 | **必须是 0%**，有丢包的直接跳过 |

建议**取前 3 个备用**，第一个失效就换下一个。

**④ 配置到 DNS**

在 Cloudflare 的 DNS 页面（或你用第三方 DNS 就在那边）：

```
类型     名称              内容                  代理状态
CNAME    notes            time.cloudflare.com   仅 DNS（灰云）
```

或者直接用测出来的 IP：

```
类型     名称              内容              代理状态
A        notes            104.16.x.x        仅 DNS（灰云）
```

几个常用作 CNAME 目标的域名（都是大公司的 Cloudflare 站点，节点质量通常较好）：
`time.cloudflare.com`、`www.visa.com`、`shopify.com`、`icook.hk`

**⑤ 验证有没有效果**

```bash
ping notes.你的域名.com
```

- 优化前：一般 200–300 ms
- 优化后：理想 30–80 ms

也可以去 [站长之家多地 Ping](http://ping.chinaz.com) 或 [17CE](https://www.17ce.com) 看全国各地的表现。

**⑥ 补充：分运营商解析（进阶）**

电信、联通、移动的最优 IP 不一样。如果你的 DNS 支持分线路解析（DNSPod、阿里云 DNS 支持，Cloudflare 免费版 DNS **不支持**），可以给三家分别配不同的优选 IP，效果最好但最麻烦。

### 10.4 ⚠️ 优选 IP 不是一劳永逸的

这是它最大的缺点，你必须知道：

- Cloudflare 会调整路由
- GFW 会封特定 IP
- 高峰期会拥堵

**维护成本：建议每月重测一次。** 也有人在用自动化工具（比如 `GetCFipToDns`）定期测速并自动更新 DNS。

### 10.5 如果不想维护

三个备选，按推荐度排序：

| 方案 | 大陆延迟 | 成本 | 维护 |
|---|---|---|---|
| **香港轻量服务器** ⭐ | 30–80 ms 稳定 | ¥99–360/年 | 服务器运维 |
| 国内服务器 + ICP 备案 | 10–30 ms | ¥120+/年 | 备案 7–20 工作日 |
| 家里电脑 + Cloudflare Tunnel | 看家宽 | ¥0（电费） | 电脑要常开 |

**代码不用改**。因为用的是标准 Cloudflare Workers + D1 + R2，搬到香港服务器只需要把 D1 换成 SQLite 文件、把 R2 换成本地目录——数据层已经全部隔离在 `worker/db.ts` 里了。

> ⚠️ 一个常见误操作：**别为了提速去接国内 CDN 节点**。一旦接入中国大陆的 CDN/加速节点，就必须先办 ICP 备案，否则不合规。

---

## 十一、日常维护：备份、恢复、更新

### 11.1 D1 Time Travel（最省心的后悔药）

免费版可以**恢复到过去 7 天内的任意一分钟**，自动开启，不额外收费。

```bash
# 查看当前 bookmark
npx wrangler d1 time-travel info learning-space

# 查看某个时间点的 bookmark
npx wrangler d1 time-travel info learning-space --timestamp="2026-10-06T03:00:00+08:00"

# 恢复到某个时间点（⚠️ 会覆盖当前数据库）
npx wrangler d1 time-travel restore learning-space --timestamp=1759708800

# 或者用 bookmark 恢复
npx wrangler d1 time-travel restore learning-space --bookmark=00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683
```

**恢复操作本身还能撤销**——执行恢复后它会返回一个旧 bookmark，你可以再倒回去：

```bash
npx wrangler d1 time-travel restore learning-space --bookmark=<上一步返回的旧 bookmark>
```

官方文档：[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)

### 11.2 定期导出备份

Time Travel 只保留 7 天，长期备份靠自己：

```bash
# 导出整个数据库为 SQL
npm run backup
# 等价于：npx wrangler d1 export learning-space --remote --output=./backup.sql

# 只导数据不导结构
npx wrangler d1 export learning-space --remote --output=./data.sql --no-schema
```

或者用网页上的按钮：**设置页 → 导出全部数据（JSON）**。

### 11.3 从备份恢复

```bash
# 从 SQL 文件恢复到线上
npx wrangler d1 execute learning-space --remote --file=./backup.sql
```

### 11.4 更新代码后重新部署

```bash
git add -A && git commit -m "更新"
npx wrangler deploy
```

如果改了数据库结构，需要新建一个迁移文件（比如 `migrations/0003_xxx.sql`），然后：

```bash
npx wrangler d1 execute learning-space --remote --file=./migrations/0003_xxx.sql
```

### 11.5 看日志排错

```bash
npm run logs
# 等价于：npx wrangler tail
```

会实时显示线上请求的日志，包括未处理异常的堆栈。

### 11.6 设置自动备份（可选）

本地写个脚本 + 系统定时任务，或者用 GitHub Actions：

```yaml
# .github/workflows/backup.yml
name: 每周备份 D1
on:
  schedule:
    - cron: '0 3 * * 0'   # 每周日凌晨 3 点
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npx wrangler d1 export learning-space --remote --output=./backup.sql
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - uses: actions/upload-artifact@v4
        with:
          name: d1-backup-${{ github.run_number }}
          path: backup.sql
          retention-days: 90
```

需要在 GitHub 仓库 Secrets 里配置 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`
（API Token 在 Cloudflare Dashboard → My Profile → API Tokens 创建，权限选 D1 Edit）。

---

## 十二、额度与超支

### 免费额度够用吗？算一笔账

假设你每天：写 20 条笔记（每条自动保存 5 次）、勾 50 次待办、打 10 次卡：

```
写入行数 ≈ 20×5 + 50 + 10 = 160 行/天
D1 免费额度 = 100,000 行/天

160 / 100000 = 0.16%   ← 用了不到千分之二
```

存储方面：一年约 6 万行纯文本笔记，也就几十 MB，5 GB 够用几十年。
文件方面：10 GB 免费，超出后 $0.015/GB-月（即 100 GB 才约 ¥10/月）。

**结论：单用户不可能撞到免费额度上限。**

### 需要留意的地方

| 项目 | 限制 | 影响 |
|---|---|---|
| Workers 请求数 | 10 万/天 | 一个页面打开 ≈ 1 页面请求 + 2~3 个接口请求。个人用不到 1% |
| Workers CPU 时间 | **10 ms/请求** | 本项目逻辑很轻，远低于此 |
| 请求体大小 | **100 MB** | 单个文件上传上限。更大需要改预签名直传 |
| 静态资源文件数 | 20,000 个 | 本项目只有十几个文件 |

### 大文件上传（超过 100 MB）

Cloudflare 免费版对请求体有 100 MB 硬限制，超过会返回 `413`。
解决办法是让浏览器**直接传到 R2**，不经过 Worker：

1. Worker 提供一个接口，用 R2 的 S3 API 生成**预签名 URL**（需要配置 R2 的 Access Key）
2. 前端拿到 URL 后 `PUT` 文件到 R2
3. 上传完再调一个接口，把元数据写进 D1

这样文件完全不经过 Worker，也就没有大小限制（R2 单对象上限 5 TB）。
本项目目前没做这一步，需要的话可以按这个思路扩展 `worker/routes/documents.ts`。

---

## 十三、常见问题

**Q：打开网站报「表不存在」或 500 错误**

线上数据库没初始化。执行：

```bash
npx wrangler d1 execute learning-space --remote --file=./migrations/0001_init.sql
```

**Q：登录一直提示密码不正确**

```bash
npx wrangler secret list          # 确认 APP_PASSWORD 存在
npx wrangler secret put APP_PASSWORD   # 重新设置一次
```

**Q：上传文件报 413**

文件超过 100 MB（免费版请求体上限），或者超过了你设置的容量上限。
后者会返回明确的错误信息（用了多少 / 上限多少），去设置页看看用量。

**Q：部署时报 `Compatibility date ... is not supported`**

`wrangler.jsonc` 里的 `compatibility_date` 比你装的 wrangler 版本还新。
改成早一点的日期，或者升级 wrangler：`npm i -D wrangler@latest`。

**Q：本地开发时写的数据，线上看不到**

这是**正常的**，两者是独立的数据库：

- `npm run dev` 用的是本地 `.local/db.sqlite`
- 线上是 Cloudflare 的 D1

要让本地连线上数据库，用 `npx wrangler dev --remote`。

**Q：手机打开是白屏**

1. 确认用的是自定义域名（免费子域名可能被墙）
2. 检查手机浏览器控制台有没有报错
3. 如果是 iOS Safari，试试把「阻止跨站跟踪」临时关掉，看是不是 Cookie 被拦了

**Q：忘记密码了，数据还在吗？**

**在。** 密码只是登录凭证，跟数据无关。重新 `wrangler secret put APP_PASSWORD` 设一个新密码即可。

**Q：怎么把数据搬到别的平台？**

```bash
# 导数据库
npx wrangler d1 export learning-space --remote --output=./backup.sql

# 导全部数据（含笔记正文）为 JSON
# 网页上：设置页 → 导出全部数据

# 文件：到「文档」页逐个下载，或者用 rclone 整桶同步 R2
```

数据格式是标准 SQLite / JSON，不锁定任何平台。

**Q：想在本地看看线上长什么样，又不想污染线上数据？**

```bash
npm run dev      # 本地开发，用本地数据库
```

线上和本地完全隔离。

---

## 附：完整的首次部署命令清单

```bash
# 0. 准备
cd learning-space
npm install
npx wrangler login

# 1. 创建资源
npx wrangler d1 create learning-space          # 记下 database_id
npx wrangler r2 bucket create learning-space-files

# 2. 编辑 wrangler.jsonc，填入 database_id     ← 手动

# 3. 设置密钥
npx wrangler secret put APP_PASSWORD           # 输入你的密码
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
npx wrangler secret put AUTH_SECRET            # 粘贴上面的输出

# 4. 部署
npx wrangler deploy

# 5. 初始化数据库（别忘！）
npx wrangler d1 execute learning-space --remote --file=./migrations/0001_init.sql
npx wrangler d1 execute learning-space --remote --file=./migrations/0002_seed.sql

# 6. 打开输出的 workers.dev 地址，用密码登录
```

搞定 🎉
