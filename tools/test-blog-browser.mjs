import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildBlog } from './build-blog.mjs';
import { loadDevVars } from './lib/env.mjs';
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root=resolve('.'),tmp=await mkdtemp(join(tmpdir(),'blog-browser-'));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
let passed=0;
function check(name,value){assert.ok(value,name);passed++;console.log(`✓ ${name}`);}
try {
 await cp(join(root,'content'),join(tmp,'content'),{recursive:true});await cp(join(root,'blog.config.json'),join(tmp,'blog.config.json'));
 await writeFile(join(tmp,'content/posts/browser-fixture.md'),'---\ntitle: 让记录成为日常\ndate: 2026-10-11\nslug: browser-fixture\ntags: [随笔, 学习]\ndescription: 写下一点学习中的发现，也留下生活里细小而确定的光。\ndraft: false\n---\n\n## 从一段文字开始\n\n这是一篇仅用于验证排版的测试文章，不会写入正式内容目录。\n\n## 保持好奇\n\n记录问题、追问缘由，慢慢形成自己的答案。\n\n```js\nconsole.log("Hello, defineFlora");\n```');
 await buildBlog({source:tmp});
 const page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.BASE_URL || 'http://127.0.0.1:8788';
 await page.goto(base);await page.locator('.post-card').waitFor();
 check('公开首页无需登录且显示品牌',await page.title()==='defineFlora' && await page.locator('#loginForm').count()===0);
 await page.screenshot({path:'/tmp/defineflora-home.png',fullPage:true});
 await page.locator('#blog-search').fill('不存在的文字');check('搜索空结果',await page.locator('.post-card:visible').count()===0);
 await page.locator('#blog-search').fill('学习');check('按标签搜索',await page.locator('.post-card:visible').count()===1);
 await page.locator('.post-card h2 a').click();await page.reload();
 check('文章深链接刷新与目录',await page.locator('.blog-prose').textContent().then(t=>t.includes('记录问题')) && await page.locator('.article-toc>a').count()===2);
 const html=await (await page.request.get(base+'/posts/browser-fixture/')).text();check('无 JS 也可读取正文',html.includes('记录问题'));
 await page.locator('.article-toc>a').first().click();check('目录定位',new URL(page.url()).hash==='#section-1');
 await page.locator('.post-tags>a').first().click();check('中文标签页面可直接打开',await page.locator('h1').textContent().then(t=>t.includes('随笔')));
 await page.goto(base+'/archive/');check('归档文章',await page.locator('.archive-item').count()===1);
 await page.goto(base+'/');await page.locator('#blog-theme').click();check('切换浅色',await page.locator('html').getAttribute('data-theme')==='light');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
 check('移动端没有水平溢出',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/tmp/defineflora-mobile.png',fullPage:true});
 await page.goto(base+'/posts/browser-fixture/');check('移动文章没有水平溢出',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#space-pet[data-state="ready"]').waitFor();await page.locator('.space-pet__character').click();check('博客保留桌宠动作',await page.locator('#space-pet').getAttribute('data-pose')==='jump');
 check('草稿地址返回 404',(await page.request.get(base+'/posts/first-post/')).status()===404);
 check('RSS 使用正式域名',(await (await page.request.get(base+'/feed.xml')).text()).includes('https://hyh.dpdns.org/posts/browser-fixture/'));
 const me=await (await page.request.get(base+'/api/auth/me')).json();
 if(me.authEnabled) check('私人 API 仍需要登录',(await page.request.get(base+'/api/bootstrap')).status()===401);
 await page.goto(base+'/admin.html');
 if(me.authEnabled){await page.locator('#password').fill(loadDevVars(root).APP_PASSWORD);await page.locator('#loginBtn').click();}
 await page.locator('#view').waitFor();check('原私人工作台可登录并使用',await page.locator('#nav').count()===1);
 check('页面没有脚本错误',errors.length===0);
 console.log(`${passed} blog browser checks passed.`);
} finally {await browser.close();await buildBlog();await rm(tmp,{recursive:true,force:true});}
