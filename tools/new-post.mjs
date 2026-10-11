import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const slug=process.argv[2],title=process.argv.slice(3).join(' ') || '未命名文章';
if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || '')) {
 console.error('用法：npm run post -- my-first-post 我的第一篇文章（slug 使用小写英文、数字、中划线）');process.exit(1);
}
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const file=fileURLToPath(new URL(`../content/posts/${slug}.md`,import.meta.url));
await writeFile(file,`---\ntitle: ${title.replace(/[\r\n]/g,' ')}\ndate: ${date}\nslug: ${slug}\ntags: [随笔]\ndescription: 在这里写一句文章摘要。\ndraft: true\n---\n\n在这里开始写作。\n`,{flag:'wx'});
console.log(`已创建草稿：content/posts/${slug}.md。写好后将 draft 改为 false 再发布。`);
