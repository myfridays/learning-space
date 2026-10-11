# 写博客与更新网站

## 第一次设置

修改根目录 `blog.config.json`：`title` 是博客名，`author` 是署名，`description` 是首页介绍，`url` 是完整二级域名，例如 `https://blog.example.com`，不要加路径。`links` 可放 `{"title":"GitHub","url":"https://github.com/你的用户名"}`。

编辑 `content/pages/about.md` 写自己的介绍。现有占位介绍和模板不代表作者履历。无需购买顶级域名，已有二级域名可以继续绑定当前 Worker。

若暂未填写 url，Worker 会按访问域名生成 RSS、sitemap 和 robots 的绝对地址；填写后，文章会同时生成 canonical 与分享 URL。静态文件需要通过本项目 Worker 提供服务，不能把未配置域名的 dist 单独托管后期待动态替换生效。

## 日常写作

```sh
npm run post -- my-first-post 我的第一篇文章
```

编辑生成的 `content/posts/my-first-post.md`：

```markdown
---
title: 我的第一篇文章
date: 2026-10-11
slug: my-first-post
tags: [随笔, 学习]
description: 一句话告诉读者，这篇文章写了什么。
draft: true
---

正文从这里开始。

## 小标题

支持 Markdown、代码块、表格、链接和图片。
```

这是一种刻意简化的头信息格式，不支持完整 YAML（多行值、嵌套结构、时刻等）。日期使用 YYYY-MM-DD，slug 只用小写英文、数字和中划线，发布后保持不变以免分享链接失效。标签支持文字、数字、空格、下划线和中划线。

将图片放进 `public/images/`，正文使用 `![图片说明](/images/photo.jpg)`。不要把本机路径或私人文档下载地址当成博客图片链接。

`draft: true` 不会进入网页、搜索、归档、标签、RSS 或 sitemap，但 **GitHub 仓库里仍然能看到 Markdown 文件**；公开仓库不要提交私密草稿。网站不会自动发布未来日期文章；`draft: false` 即公开，日期仅用于排序。

## 本地检查

```sh
npm ci
npm run build
npm run dev
npm run test:all
```

Node.js 24。`npm run dev` 会先构建到 `dist/`，同时运行原有 Worker / D1 / R2 的本地模拟服务。改文章、样式或脚本后重新运行 `npm run build`，刷新浏览器即可；修改 Worker 后需要重启服务。草稿不会在开发首页展示，预览时临时改为 false，发布前自行决定保留或恢复 true。

## 发布

写完后将 `draft` 改为 `false`，提交并推送到 main。仓库附带 GitHub Actions 检查，但 **仅推送 GitHub 不会凭空产生部署连接**。

推荐使用 Cloudflare Workers 的 Git 集成：在现有 Worker 的 Settings → Builds 中连接这个 GitHub 仓库，生产分支选 main，根目录为仓库根目录，构建命令 `npm run build`，部署命令 `npm run deploy`，Node 版本使用 24。保留原 Worker 的 D1、R2、APP_PASSWORD、AUTH_SECRET 和二级域名绑定。连接一次后，后续 main 推送即可自动构建和部署；站点数据与文章发布彼此独立。

手动发布也支持 `npm run deploy`，它会先自动构建。直接使用 `npx wrangler deploy` 时必须先 `npm run build`。本次重构没有修改远端 Cloudflare 配置或执行部署。

删掉文章源文件或将其改回 draft: true，重新构建部署后，原文章页面会移除。公开页面不使用 Service Worker 离线回退，避免撤回后继续显示旧缓存；他人下载的副本和搜索引擎历史快照不会随之自动消失。

## 页面结构

- `/`：公开文章、摘要搜索。
- `/posts/slug/`：文章正文、目录、相邻文章。
- `/archive/`、`/tags/`：归档与标签。
- `/about/`：作者介绍。
- `/feed.xml`、`/sitemap.xml`：RSS 与站点地图。
- `/admin.html`：原学习空间，原笔记、待办、习惯和文档保持原有登录控制，绝不从这些数据自动生成博客文章。部署到互联网前保留 APP_PASSWORD 与 AUTH_SECRET；旧应用未配置密码时会允许访问。

## 设计依据

阅读了 [中文独立博客目录](https://github.com/timqian/chinese-independent-blogs)，提取独立域名、写作主体、时间归档、主题标签和 RSS 订阅等共同要素。参考目录里的生活、技术和个人记录类别确定阅读结构；部分外部博客站点受当前网络限制未能直接访问，没有复制其版式、文章、品牌或素材。保留本项目已有的星空背景与可收起桌宠，将文章排版放在中心。
