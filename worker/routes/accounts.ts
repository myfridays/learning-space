import type { Account, Env } from '../types.ts';
import type { Router } from '../router.ts';
import { HttpError, badRequest, bool, json, newId, notFound, nowIso, ok, readJson, str } from '../lib.ts';
import { checkPassword, clearedSessionCookie, createSessionToken, currentUser, hashPassword, isSecureRequest, publicAccount, sessionCookie, verifyPassword } from '../auth.ts';

function password(value: unknown) {
 const p=str(value,'password',{required:true,max:200});
 if(p.length<10)throw badRequest('密码至少 10 个字符');
 return p;
}
function username(value: unknown) {
 const name=str(value,'username',{required:true,max:32}).trim().toLowerCase();
 if(!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(name))throw badRequest('账号使用 3–32 位字母、数字、下划线或短横线');
 return name;
}
function admin(env: Env) { if(env.USER?.role!=='admin')throw new HttpError(403,'仅管理员可管理账号','forbidden'); }
async function throttle(env: Env, key: string, max: number) {
 const now=Date.now();
 const row=await env.DB.prepare(`INSERT INTO auth_attempts(key,count,expires) VALUES (?,1,?)
 ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,
 expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING count`).bind(key,now+15*60*1000,now,now).first<{count:number}>();
 if(row!.count>max)throw new HttpError(429,'尝试过于频繁，请稍后再试','rate_limited');
}
export function registerAccounts(r: Router) {
 r.get('/api/auth/me',async({request,env})=>{
  const user=await currentUser(request,env);
  return ok({authEnabled:true,authenticated:Boolean(user),user:user?publicAccount(user):null,preferences:user?JSON.parse(user.preferences):{}});
 },{auth:false});
 r.post('/api/auth/login',async({request,env})=>{
  const body=await readJson(request),name=username(body.username??'owner'),submitted=str(body.password,'password',{required:true,max:200});
  await env.DB.prepare('DELETE FROM auth_attempts WHERE expires < ?').bind(Date.now()).run();
  await throttle(env,`ip:${request.headers.get('CF-Connecting-IP')||'local'}`,60);
  await throttle(env,`user:${name}`,15);
  let user=await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(name).first<Account>();
  let valid=false;
  if(user?.id==='owner'&&!user.password_hash&&!user.disabled&&await checkPassword(env,submitted)) {
   const hashed=await hashPassword(submitted);
   await env.DB.prepare("UPDATE users SET password_hash=? WHERE id='owner' AND password_hash=''").bind(hashed).run();
   user=await env.DB.prepare("SELECT * FROM users WHERE id='owner'").first<Account>();
  }
  if(user?.password_hash)valid=await verifyPassword(submitted,user.password_hash);
  else await hashPassword(submitted);
  if(!user||user.disabled||!valid)throw new HttpError(401,'账号或密码不正确','bad_credentials');
  const token=await createSessionToken(env,user);
  await env.DB.prepare('DELETE FROM auth_attempts WHERE key=?').bind(`user:${name}`).run();
  return json({ok:true,authenticated:true,authEnabled:true,user:publicAccount(user)},{headers:{'set-cookie':sessionCookie(env,token,isSecureRequest(request))}});
 },{auth:false});
 r.post('/api/auth/logout',async({request,env})=>{
  const user=await currentUser(request,env);
  if(user)await env.DB.prepare('UPDATE users SET session_version=session_version+1 WHERE id=?').bind(user.id).run();
  return json({ok:true},{headers:{'set-cookie':clearedSessionCookie(isSecureRequest(request))}});
 },{auth:false});
 r.post('/api/auth/password',async({request,env})=>{
  const body=await readJson(request),old=str(body.currentPassword,'currentPassword',{required:true,max:200}),next=password(body.password);
  await throttle(env,`password:${env.USER!.id}`,10);
  if(!await verifyPassword(old,env.USER!.password_hash))throw badRequest('当前密码不正确');
  const hashed=await hashPassword(next);
  await env.DB.prepare('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=? AND password_hash=?').bind(hashed,env.USER!.id,env.USER!.password_hash).run();
  return json({ok:true},{headers:{'set-cookie':clearedSessionCookie(isSecureRequest(request))}});
 });
 r.get('/api/accounts',async({env})=>{admin(env);const rows=await env.DB.prepare('SELECT id,username,role,disabled FROM users ORDER BY created_at,id').all<Account>();return ok({users:rows.results.map(publicAccount)});});
 r.post('/api/accounts',async({request,env})=>{
  admin(env);const body=await readJson(request),name=username(body.username),p=password(body.password);
  if(await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(name).first())throw badRequest('账号已存在');
  const id=newId('user_'),hash=await hashPassword(p);
  try {await env.DB.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES (?,?,?,?)').bind(id,name,hash,nowIso()).run();}
  catch(err){if(await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(name).first())throw badRequest('账号已存在');throw err;}
  return json({user:{id,username:name,role:'member',disabled:false}},{status:201});
 });
 r.patch('/api/accounts/:id',async({request,env,params})=>{
  admin(env);const body=await readJson(request);
  if(typeof body.disabled!=='boolean')throw badRequest('请指定账号启用状态');
  const disabled=bool(body.disabled,'disabled');
  const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(params.id).first<Account>();
  if(!user)throw notFound();
  if(user.role==='admin'||user.id===env.USER!.id)throw badRequest('不能停用主账号');
  await env.DB.prepare('UPDATE users SET disabled=?,session_version=session_version+1 WHERE id=?').bind(disabled?1:0,user.id).run();
  return ok({ok:true});
 });
 r.patch('/api/preferences',async({request,env})=>{
  const body=await readJson(request),updates=[];
  for(const [key,value] of Object.entries(body)) {
   if(!['theme-mode','pet-hidden','pet-muted','weather-city'].includes(key))throw badRequest('未知偏好设置');
   if(typeof value!=='string'||value.length>1000)throw badRequest('偏好设置无效');
   if(key==='theme-mode'&&!['light','dark','auto'].includes(value))throw badRequest('主题无效');
   if(['pet-hidden','pet-muted'].includes(key)&&!['true','false'].includes(value))throw badRequest('开关值无效');
   if(key==='weather-city') {let city;try{city=JSON.parse(value);}catch{throw badRequest('城市无效');}if(city!==null&&(!city||typeof city.name!=='string'||typeof city.latitude!=='number'||!Number.isFinite(city.latitude)||Math.abs(city.latitude)>90||typeof city.longitude!=='number'||!Number.isFinite(city.longitude)||Math.abs(city.longitude)>180))throw badRequest('城市无效');}
   updates.push(env.DB.prepare('UPDATE users SET preferences=json_set(preferences,?,?) WHERE id=?').bind(`$."${key}"`,value,env.USER!.id));
  }
  if(updates.length)await env.DB.batch(updates);
  const row=await env.DB.prepare('SELECT preferences FROM users WHERE id=?').bind(env.USER!.id).first<{preferences:string}>();
  return ok({preferences:JSON.parse(row!.preferences)});
 });
}
