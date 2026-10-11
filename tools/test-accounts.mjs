import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createD1, applyMigrations } from './lib/d1.mjs';
import { createR2 } from './lib/r2.mjs';
import worker from '../worker/index.ts';
const dir=mkdtempSync(join(tmpdir(),'accounts-')),db=createD1(join(dir,'db.sqlite'));
const env={DB:db,BUCKET:createR2(join(dir,'r2')),APP_PASSWORD:'original-owner-password',AUTH_SECRET:'test-accounts-secret'};
let count=0;
function check(name,value){assert.ok(value,name);count++;console.log('✓ '+name);}
async function call(method,path,body,cookie='',headers={},bindings=env){
 const response=await worker.fetch(new Request('https://local'+path,{method,headers:{...(body instanceof FormData?{}:{'content-type':'application/json'}),...headers,...(cookie?{cookie}:{})},...(body!==undefined?{body:body instanceof FormData?body:JSON.stringify(body)}:{})}),bindings);
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
 return {status:response.status,data,headers:response.headers};
}
async function login(username,password){const r=await call('POST','/api/auth/login',{username,password});assert.equal(r.status,200,JSON.stringify(r.data));return r.headers.get('set-cookie').split(';')[0];}
try {
 for(const f of ['0001_init.sql','0002_seed.sql','0003_life_entries.sql'])db.native.exec(readFileSync(resolve('migrations',f),'utf8'));
 db.native.exec("INSERT INTO notes(id,title,content,created_at,updated_at) VALUES ('legacy','旧记录','主账号原数据','2026','2026')");
 await env.BUCKET.put('legacy-file','old private file');
 db.native.exec("INSERT INTO documents(id,name,r2_key,created_at,size_bytes) VALUES ('legacy-doc','old.txt','legacy-file','2026',16)");
 applyMigrations(db,resolve('migrations'));applyMigrations(db,resolve('migrations'));
 check('旧数据迁移归主账号且本地迁移可重复执行',db.native.prepare("SELECT user_id FROM notes WHERE id='legacy'").get().user_id==='owner');
 check('未设置共享密码也不会开放访问',(await call('GET','/api/notes',undefined,'',{}, {...env,APP_PASSWORD:undefined})).status===401);
 let owner=await login('owner',env.APP_PASSWORD);
 check('主账号沿用旧密码首次登录',(await call('GET','/api/notes/legacy',undefined,owner)).status===200);
 check('初始化后仅存加盐哈希',db.native.prepare("SELECT password_hash FROM users WHERE id='owner'").get().password_hash.startsWith('pbkdf2$'));
 const a=(await call('POST','/api/accounts',{username:'alice',password:'alice-password',role:'admin'},owner)).data.user;
 const b=(await call('POST','/api/accounts',{username:'bob',password:'bob-password'},owner)).data.user;
 check('新账号不能通过请求体提升权限',a.role==='member');
 check('重复账号忽略大小写',(await call('POST','/api/accounts',{username:'ALICE',password:'another-password'},owner)).status===400);
 let alice=await login('alice','alice-password'),bob=await login('bob','bob-password');
 check('旧文档保留原对象键且只归主账号',(await call('GET','/api/documents/legacy-doc/file',undefined,owner)).data==='old private file'&&(await call('GET','/api/documents/legacy-doc/file',undefined,alice)).status===404);
 check('普通用户不能列出或创建账号',(await call('GET','/api/accounts',undefined,alice)).status===403&&(await call('POST','/api/accounts',{username:'evil',password:'another-password'},alice)).status===403);
 check('普通账号不能停用他人',(await call('PATCH','/api/accounts/'+b.id,{disabled:true},alice)).status===403);
 check('管理员不能停用主账号',(await call('PATCH','/api/accounts/owner',{disabled:true},owner)).status===400);
 const note=(await call('POST','/api/notes',{title:'Alice笔记',content:'private',tags:['alice-only'],user_id:b.id},alice)).data.note;
 check('服务端忽略伪造用户归属',db.native.prepare('SELECT user_id FROM notes WHERE id=?').get(note.id).user_id===a.id);
 for(const [method,body] of [['GET',undefined],['PATCH',{title:'hacked'}],['DELETE',undefined]])check('跨账号笔记 '+method,(await call(method,'/api/notes/'+note.id,body,bob)).status===404);
 check('笔记搜索和数量隔离',(await call('GET','/api/notes?q=private',undefined,bob)).data.total===0);
 check('标签隔离',(await call('GET','/api/notes/tags',undefined,bob)).data.tags.length===0);
 check('批量删除不可删除其他账号笔记',(await call('POST','/api/notes/batch-delete',{ids:[note.id]},bob)).data.deleted===0);
 const todo=(await call('POST','/api/todos',{title:'Alice待办'},alice)).data.todo;
 check('待办列表隔离',(await call('GET','/api/todos',undefined,bob)).data.todos.length===0);
 for(const method of ['PATCH','DELETE'])check('跨账号待办 '+method,(await call(method,'/api/todos/'+todo.id,method==='PATCH'?{done:true}:undefined,bob)).status===404);
 const habit=(await call('POST','/api/habits',{name:'Alice习惯'},alice)).data.habit;
 await call('POST','/api/habits/'+habit.id+'/check',{day:'2026-10-11'},alice);
 for(const [method,path,body] of [['POST','/check',{day:'2026-10-11'}],['PATCH','',{name:'hacked'}],['DELETE','',undefined]])check('跨账号习惯 '+method,(await call(method,'/api/habits/'+habit.id+path,body,bob)).status===404);
 const habits=(await call('GET','/api/habits?today=2026-10-11',undefined,bob)).data;
 check('打卡和连续天数隔离',habits.habits.length===0&&habits.logs.length===0);
 for(const kind of ['mindfulness','fitness']){
  const item=(await call('POST','/api/life/'+kind,{content:'Alice '+kind,day:'2026-10-11'},alice)).data.item;
  check(kind+' 列表隔离',(await call('GET','/api/life/'+kind,undefined,bob)).data.items.length===0);
  for(const [method,body] of [['PATCH',{content:'hacked'}],['PATCH',{restore:true}],['DELETE',undefined]])check('跨账号 '+kind+' '+method,(await call(method,'/api/life/'+kind+'/'+item.id,body,bob)).status===404);
 }
 const form=new FormData();form.append('file',new File(['private file'],'alice.txt',{type:'text/plain'}));
 const upload=await call('POST','/api/documents',form,alice);assert.equal(upload.status,201,JSON.stringify(upload.data));const doc=upload.data.document;
 check('R2 按账号分区',db.native.prepare('SELECT r2_key FROM documents WHERE id=?').get(doc.id).r2_key.startsWith('users/'+a.id+'/'));
 check('文件列表与容量隔离',(await call('GET','/api/documents',undefined,bob)).data.storage.usedBytes===0);
 check('禁止越权下载文件及 Range 读取',(await call('GET','/api/documents/'+doc.id+'/file',undefined,bob)).status===404&&(await call('GET','/api/documents/'+doc.id+'/file',undefined,bob,{range:'bytes=0-3'})).status===404);
 for(const method of ['PATCH','DELETE'])check('跨账号文件 '+method,(await call(method,'/api/documents/'+doc.id,method==='PATCH'?{name:'hacked'}:undefined,bob)).status===404);
 const file=await call('GET','/api/documents/'+doc.id+'/file',undefined,alice);
 check('自己的文件可读且不缓存',file.data==='private file'&&file.headers.get('cache-control')==='no-store');
 const boot=(await call('GET','/api/bootstrap',undefined,bob)).data;
 check('首页聚合不泄漏其他用户数据',boot.notes.total===0&&boot.todos.total===0&&boot.habits.items.length===0&&boot.documents.usedBytes===0);
 const stats=(await call('GET','/api/data/stats',undefined,bob)).data;
 check('统计隔离',stats.notes.total===0&&stats.documents.total===0);
 const exported=(await call('GET','/api/data/export',undefined,bob)).data;
 check('导出隔离且不含用户密码',Object.values(exported.counts).every(n=>n===0)&&!JSON.stringify(exported).includes('password_hash'));
 check('主账号管理权不包含查看成员记录',(await call('GET','/api/notes/'+note.id,undefined,owner)).status===404);
 await call('PATCH','/api/preferences',{'theme-mode':'light','pet-hidden':'true'},alice);
 check('个人偏好隔离',(await call('GET','/api/auth/me',undefined,bob)).data.preferences['theme-mode']===undefined&&(await call('GET','/api/auth/me',undefined,alice)).data.preferences['theme-mode']==='light');
 check('导出只含自己的账号偏好',(await call('GET','/api/data/export',undefined,alice)).data.preferences['theme-mode']==='light'&&(await call('GET','/api/data/export',undefined,bob)).data.preferences['theme-mode']===undefined);
 check('跨站修改拒绝',(await call('POST','/api/todos',{title:'evil'},alice,{origin:'https://evil.test'})).status===403);
 check('旧标签页账号不匹配拒绝写入',(await call('POST','/api/todos',{title:'stale'},bob,{'X-Space-User':a.id})).status===409);
 await call('PATCH','/api/accounts/'+a.id,{disabled:true},owner);
 check('停用立即撤销旧会话',(await call('GET','/api/notes',undefined,alice)).status===401);
 check('停用后密码正确也不能登录',(await call('POST','/api/auth/login',{username:'alice',password:'alice-password'})).status===401);
 await call('PATCH','/api/accounts/'+a.id,{disabled:false},owner);
 check('重新启用不会恢复旧会话',(await call('GET','/api/notes',undefined,alice)).status===401);
 alice=await login('alice','alice-password');
 check('修改密码需要原密码',(await call('POST','/api/auth/password',{currentPassword:'wrong',password:'new-alice-password'},alice)).status===400);
 await call('POST','/api/auth/password',{currentPassword:'alice-password',password:'new-alice-password'},alice);
 check('改密撤销旧会话',(await call('GET','/api/notes',undefined,alice)).status===401);
 check('旧密码不能再次登录',(await call('POST','/api/auth/login',{username:'alice',password:'alice-password'})).status===401);
 alice=await login('alice','new-alice-password');
 check('改密后数据仍保留',(await call('GET','/api/notes/'+note.id,undefined,alice)).status===200);
 await call('POST','/api/auth/logout',{},alice);
 check('退出后旧令牌不能重用',(await call('GET','/api/notes',undefined,alice)).status===401);
 check('缺少签名密钥无法登录',(await call('POST','/api/auth/login',{username:'bob',password:'bob-password'},'',{}, {...env,AUTH_SECRET:undefined})).status===503);
 for(let i=0;i<16;i++){const r=await call('POST','/api/auth/login',{username:'nobody',password:'incorrect-password'});if(i===15)check('登录限速生效',r.status===429);}
 console.log(`${count} account isolation checks passed.`);
}finally{db.close();rmSync(dir,{recursive:true,force:true});}
