import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../public/js/markdown.js';
import { readPosts, escape as e } from './lib/blog.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function buildBlog({ source = root, out = join(root,'dist'), siteUrl = process.env.SITE_URL } = {}) {
  const config = JSON.parse(await readFile(join(source,'blog.config.json'),'utf8'));
  const base = (siteUrl || config.url || '').replace(/\/$/,'');
  if (base && (!/^https?:\/\/[^/]+$/.test(base) || new URL(base).username || new URL(base).password)) throw new Error('博客 url 必须是完整的域名地址，不带路径');
  const posts = await readPosts(join(source,'content/posts'));
  const tags = [...new Set(posts.flatMap(p => p.tags))].sort();
  // Validate before replacing generated output; never touch source posts or private data.
  await rm(out,{recursive:true,force:true}); await mkdir(out,{recursive:true});
  await cp(join(root,'public'),out,{recursive:true});
  async function save(path, content) { const target=join(out,path); await mkdir(dirname(target),{recursive:true}); await writeFile(target,content); }
  const tagPath = tag => `/tags/${encodeURIComponent(tag)}/`;
  const cards = list => list.length ? list.map(p => `<article class="post-card"><div class="post-meta"><time datetime="${p.date}">${p.date.replaceAll('-',' / ')}</time><span>${p.minutes} 分钟阅读</span></div><h2><a href="${p.path}">${e(p.title)}</a></h2><p>${e(p.description)}</p><div class="post-tags">${p.tags.map(t=>`<a href="${tagPath(t)}"># ${e(t)}</a>`).join('')}</div></article>`).join('') : '<div class="empty-posts"><span>✧</span><h2>文章正在酝酿</h2><p>这里会慢慢收集学习、生活和思考的片段。</p></div>';
  function layout(title, path, body, description=config.description, post=null) {
    const canonical=base ? `<link rel="canonical" href="${e(base+path)}"><meta property="og:url" content="${e(base+path)}">` : '';
    return `<!doctype html><html lang="zh-CN" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${e(title)}${title===config.title?'':` · ${e(config.title)}`}</title><meta name="description" content="${e(description)}"><meta name="theme-color" content="#080d24"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:type" content="${post?'article':'website'}">${canonical}${post?`<meta property="article:published_time" content="${post.date}">`:''}<link rel="icon" href="/icon.svg"><link rel="alternate" type="application/rss+xml" title="${e(config.title)}" href="/feed.xml"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/blog.css"></head><body class="blog"><a class="skip-link" href="#main">跳到正文</a><header class="blog-header"><a class="blog-brand" href="/"><span>✧</span>${e(config.title)}</a><nav aria-label="博客导航">${[['/','文章'],['/archive/','归档'],['/tags/','标签'],['/about/','关于']].map(([href,text])=>`<a href="${href}" ${path===href?'aria-current="page"':''}>${text}</a>`).join('')}<button id="blog-theme" aria-label="切换深浅色" title="切换深浅色">◐</button></nav></header><main id="main" class="blog-main">${body}</main><footer class="blog-footer"><div><strong>${e(config.author)}</strong><span>独立书写，慢慢生长。</span></div><nav><a href="/feed.xml">RSS 订阅 ↗</a><a href="/admin.html" rel="nofollow">私人工作台</a></nav></footer><script type="module" src="/js/blog.js"></script></body></html>`;
  }
  const intro=`<section class="blog-intro"><span class="eyebrow">A SMALL CORNER OF THE INTERNET</span><h1>把日子写下来<span>，</span><br>让想法有处可栖<span>。</span></h1><p>${e(config.description)}</p><div class="intro-links"><a href="/about/">关于 ${e(config.author)} ↗</a><a href="/feed.xml">订阅更新 ↗</a></div><span class="intro-orbit" aria-hidden="true">✧</span></section>`;
  await save('index.html', layout(config.title,'/',`${intro}<section aria-labelledby="latest"><div class="section-head"><h2 id="latest">最近的文字 <small>${posts.length.toString().padStart(2,'0')}</small></h2><a href="/archive/">全部归档 ↗</a></div><label class="search-label" for="blog-search">搜索文章</label><input id="blog-search" class="blog-search" type="search" placeholder="搜索标题、摘要或标签…" autocomplete="off"><p id="search-status" role="status"></p><div id="post-list">${cards(posts)}</div></section>`));
  const grouped = Map.groupBy(posts,p=>p.date.slice(0,4));
  await save('archive/index.html',layout('文章归档','/archive/',`<div class="page-heading"><span class="eyebrow">ARCHIVE</span><h1>沿着时间，慢慢翻阅</h1><p>共 ${posts.length} 篇文章，每一篇都是一个当时。</p></div>${[...grouped].map(([year,list])=>`<section class="archive-year"><h2>${year}</h2>${list.map(p=>`<a class="archive-item" href="${p.path}"><time>${p.date.slice(5)}</time><span>${e(p.title)}</span><span>↗</span></a>`).join('')}</section>`).join('') || cards([])}`));
  await save('tags/index.html',layout('文章标签','/tags/',`<div class="page-heading"><span class="eyebrow">TOPICS</span><h1>循着兴趣阅读</h1><p>那些反复思考，也持续记录的主题。</p></div><div class="tag-cloud">${tags.map(t=>`<a href="${tagPath(t)}"># ${e(t)} <small>${posts.filter(p=>p.tags.includes(t)).length}</small></a>`).join('') || '<p>发布文章后，标签会出现在这里。</p>'}</div>`));
  for (const tag of tags) await save(`tags/${tag}/index.html`,layout(`# ${tag}`,tagPath(tag),`<div class="page-heading"><a href="/tags/">← 所有标签</a><h1># ${e(tag)}</h1></div>${cards(posts.filter(p=>p.tags.includes(tag)))}`));
  const about=renderMarkdown(await readFile(join(source,'content/pages/about.md'),'utf8'));
  const links=(config.links || []).filter(l=>/^https:\/\//.test(l.url));
  await save('about/index.html',layout('关于','/about/',`<article class="blog-prose about-prose">${about}</article>${links.length?`<section class="friend-links"><h2>我的链接</h2>${links.map(l=>`<a href="${e(l.url)}" rel="noopener noreferrer">${e(l.title)} ↗</a>`).join('')}</section>`:''}`));
  for (let i=0;i<posts.length;i++) {
    const p=posts[i];
    await save(`posts/${p.slug}/index.html`,layout(p.title,p.path,`<div class="article-layout"><article><header class="article-header"><a class="back-link" href="/">← 返回文章列表</a><div class="post-meta"><time datetime="${p.date}">${p.date}</time><span>${e(config.author)}</span><span>${p.minutes} 分钟阅读</span></div><h1>${e(p.title)}</h1><p>${e(p.description)}</p><div class="post-tags">${p.tags.map(t=>`<a href="${tagPath(t)}"># ${e(t)}</a>`).join('')}</div></header><div class="blog-prose">${p.html}</div><div class="article-end">— 感谢读到这里 —</div><nav class="adjacent-posts">${[posts[i+1],posts[i-1]].filter(Boolean).map(q=>`<a href="${q.path}">${e(q.title)} ↗</a>`).join('')}</nav></article>${p.toc.length?`<aside class="article-toc"><strong>本文目录</strong>${p.toc.map(t=>`<a href="#${t.id}" class="toc-level-${t.level}">${t.title}</a>`).join('')}</aside>`:''}</div>`,p.description,p));
  }
  await save('404.html',layout('页面未找到','/404.html','<div class="page-heading"><span class="eyebrow">404</span><h1>这页文字还没写下</h1><p>文章可能已移动，或链接有误。</p><a href="/">回到首页 →</a></div>'));
  const origin=base || '__BLOG_ORIGIN__';
  await save('feed.xml',`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${e(config.title)}</title><link>${e(origin)}/</link><description>${e(config.description)}</description><language>zh-cn</language>${posts.map(p=>`<item><title>${e(p.title)}</title><link>${e(origin+p.path)}</link><guid isPermaLink="true">${e(origin+p.path)}</guid><pubDate>${new Date(p.date+'T00:00:00Z').toUTCString()}</pubDate><description>${e(p.description)}</description></item>`).join('')}</channel></rss>`);
  const paths=['/','/archive/','/tags/','/about/',...tags.map(tagPath),...posts.map(p=>p.path)];
  await save('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p=>`<url><loc>${e(origin+p)}</loc></url>`).join('')}</urlset>`);
  await save('robots.txt',`User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);
  await save('search.json',JSON.stringify(posts.map(({title,description,tags,path})=>({title,description,tags,path}))));
  console.log(`博客构建完成：${posts.length} 篇公开文章，${tags.length} 个标签。${base?'':'域名未配置，订阅链接将由 Worker 使用访问域名生成。'}`);
  return {posts,tags};
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await buildBlog();
