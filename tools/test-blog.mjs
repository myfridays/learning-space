import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBlog } from './build-blog.mjs';
import { parsePost } from './lib/blog.mjs';
import worker from '../worker/index.ts';
const root=await mkdtemp(join(tmpdir(),'blog-test-'));
const source=join(root,'source'),out=join(root,'dist');
let count=0;
function check(label,condition){assert.ok(condition,label);console.log(`✓ ${label}`);count++;}
const post=(slug,draft=false,body='## 第一节\n\n文章正文\n\n<script>alert(1)</script>')=>`---\ntitle: ${slug}\ndate: 2026-10-11\nslug: ${slug}\ntags: [随笔, 学习]\ndraft: ${draft}\n---\n${body}`;
try {
 await mkdir(join(source,'content/posts'),{recursive:true});await mkdir(join(source,'content/pages'),{recursive:true});
 await writeFile(join(source,'blog.config.json'),JSON.stringify({title:'测试博客',author:'测试作者',description:'测试',url:'https://blog.example.com'}));
 await writeFile(join(source,'content/pages/about.md'),'# 关于\n测试介绍');
 await writeFile(join(source,'content/posts/public.md'),post('public'));
 await writeFile(join(source,'content/posts/private.md'),post('private-draft',true,'secret-draft-body'));
 await buildBlog({source,out});
 const home=await readFile(join(out,'index.html'),'utf8');
 check('首页公开文章且无需登录脚本',home.includes('/posts/public/')&&!home.includes('/js/app.js'));
 const article=await readFile(join(out,'posts/public/index.html'),'utf8');
 check('文章直接包含可索引正文、目录与 canonical',article.includes('文章正文')&&article.includes('href="#section-1"')&&article.includes('https://blog.example.com/posts/public/'));
 check('正文脚本被转义',!article.includes('<script>alert(1)</script>')&&article.includes('&lt;script&gt;'));
 for(const path of ['index.html','archive/index.html','tags/index.html','feed.xml','sitemap.xml','search.json']) {
  const text=await readFile(join(out,path),'utf8');check(`${path} 不公开草稿`,!text.includes('private-draft')&&!text.includes('secret-draft-body'));
 }
 await assert.rejects(access(join(out,'posts/private-draft/index.html')));count++;
 const feed=await readFile(join(out,'feed.xml'),'utf8');check('RSS 包含绝对文章地址',feed.includes('<link>https://blog.example.com/posts/public/</link>'));
 await access(join(out,'tags/随笔/index.html'));count++;
 await writeFile(join(source,'content/posts/public.md'),post('public',true));await buildBlog({source,out});
 await assert.rejects(access(join(out,'posts/public/index.html')));check('撤回文章会移除旧页面',!(await readFile(join(out,'feed.xml'),'utf8')).includes('/posts/public/'));
 for(const invalid of [post('../escape'),post('ok').replace('tags: [随笔, 学习]','tags: [../../escape]'),post('ok').replace('2026-10-11','2026-02-31'),post('ok').replace('draft: false','draft: no')]) {assert.throws(()=>parsePost(invalid,'invalid.md'));count++;}
 await writeFile(join(source,'content/posts/dup.md'),post('public'));
 await assert.rejects(buildBlog({source,out}),/重复/);count++;
 const env={ASSETS:{fetch:async()=>new Response('<link>__BLOG_ORIGIN__/posts/test/</link>')}};
 const response=await worker.fetch(new Request('https://notes.example.com/feed.xml'),env);
 check('未配置域名时 RSS 使用实际二级域名',(await response.text()).includes('https://notes.example.com/posts/test/'));
 const admin=await readFile(join(out,'admin.html'),'utf8');check('私人工作台阻止索引且保留原应用',admin.includes('noindex,nofollow')&&admin.includes('/js/app.js'));
 console.log(`${count} blog checks passed.`);
} finally {await rm(root,{recursive:true,force:true});}
