import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadDevVars } from './lib/env.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const base=process.env.BASE_URL||'http://127.0.0.1:8793',name='test_'+Date.now(),password='member-test-password';
let count=0,memberId,quoteId;const errors=[];
const adminContext=await browser.newContext({serviceWorkers:'block'}),memberContext=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
const admin=await adminContext.newPage(),member=await memberContext.newPage();
for(const p of [admin,member])p.on('pageerror',e=>errors.push(e.message));
function check(label,value){assert.ok(value,label);count++;console.log('✓ '+label);}
async function login(page,username,secret){await page.goto(base+'/admin.html');await page.locator('#username').fill(username);await page.locator('#password').fill(secret);await page.locator('#loginBtn').click();await page.locator('.village-map').waitFor();}
async function settings(page){await page.goto(base+'/admin.html#/settings');await page.locator('#password-form').waitFor({state:'attached'});}
try{
 await login(admin,'owner',loadDevVars(resolve('.')).APP_PASSWORD);await settings(admin);
 await admin.locator('#account-admin>summary').click();
 await admin.locator('#create-account [name=username]').fill(name);await admin.locator('#create-account [name=password]').fill(password);await admin.locator('#create-account button').click();
 await admin.locator('.account-row').filter({hasText:name}).waitFor();
 memberId=await admin.locator('.account-row').filter({hasText:name}).locator('button').getAttribute('data-account');
 check('管理员可从设置创建账号',Boolean(memberId));
 await login(member,name,password);await settings(member);
 check('普通账号只有个人设置，无管理入口',await member.locator('#account-admin').count()===0&&await member.locator('.account-settings').textContent().then(t=>t.includes(name)));
 await member.locator('#theme-choice').selectOption('light');
 await member.waitForResponse(r=>r.url().endsWith('/api/preferences')&&r.status()===200);
 await member.reload();await member.locator('#theme-choice').waitFor();
 check('账号偏好刷新后恢复',await member.locator('#theme-choice').inputValue()==='light');
 check('账号设置手机无横向溢出',await member.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await member.screenshot({path:'/tmp/member-settings.png',fullPage:true});
 await member.goto(base+'/admin.html#/mindfulness');await member.locator('[name=content]').fill('个人隔离测试 '+name);await member.locator('#life-form [type=submit]').click();
 const quote=member.locator('.quote-entry').filter({hasText:name});await quote.waitFor();quoteId=await quote.getAttribute('data-id');
 await member.locator('[name=content]').fill('不能带入其他账号的草稿');
 const memberStored=await memberContext.request.get(base+'/api/auth/me');check('偏好在服务端属于成员',(await memberStored.json()).preferences['theme-mode']==='light');
 // Changing the shared cookie must not let a stale tab submit into the new account.
 await memberContext.request.post(base+'/api/auth/login',{data:{username:'owner',password:loadDevVars(resolve('.')).APP_PASSWORD}});
 await member.locator('#life-form [type=submit]').click();
 await member.waitForFunction(()=>document.querySelector('[name=content]')?.value==='');
 check('旧标签页不能向新登录账号写入草稿',await member.locator('.quote-entry').filter({hasText:'不能带入其他账号的草稿'}).count()===0);
 check('切换账号后不显示上一账号记录',await member.locator('.quote-entry').filter({hasText:name}).count()===0);
 // Return to member; logout would invalidate all owner sessions, so replace the cookie directly here.
 const switchBack=await memberContext.request.post(base+'/api/auth/login',{data:{username:name,password}});assert.ok(switchBack.ok());await member.goto(base+'/admin.html#/settings');await member.reload();
 await member.locator('.account-settings details>summary').click();
 await member.locator('#password-form [name=currentPassword]').fill(password);await member.locator('#password-form [name=password]').fill('new-member-password');await member.locator('#password-form [name=confirm]').fill('different-password');
 await member.locator('#password-form button').click();await member.getByText('两次新密码不一致',{exact:true}).waitFor();check('修改密码检查二次确认',true);
 await member.locator('#password-form [name=confirm]').fill('new-member-password');await member.locator('#password-form button').click();await member.locator('#username').waitFor();
 await login(member,name,'new-member-password');
 check('修改密码后重新登录成功',await member.locator('.village-map').isVisible());
 await admin.locator('.account-row').filter({hasText:name}).locator('button').click();await admin.locator('.account-row').filter({hasText:name}).filter({hasText:'已停用'}).waitFor();
 await member.goto(base+'/admin.html#/mindfulness');await member.locator('#username').waitFor();
 check('停用账号不能继续进入私人页面',await member.locator('#loginForm').isVisible());
 check('无浏览器脚本错误',errors.length===0);
 console.log(`${count} account browser checks passed.`);
} finally {
 // Local-only test account stays disabled; remove its temporary record while authenticated as it.
 if(memberId){
  await adminContext.request.patch(base+'/api/accounts/'+memberId,{data:{disabled:false}});
  let response=await memberContext.request.post(base+'/api/auth/login',{data:{username:name,password:'new-member-password'}});
  if(!response.ok())response=await memberContext.request.post(base+'/api/auth/login',{data:{username:name,password}});
  if(response.ok()&&quoteId)await memberContext.request.delete(base+'/api/life/mindfulness/'+quoteId);
  await adminContext.request.patch(base+'/api/accounts/'+memberId,{data:{disabled:true}});
 }
 await browser.close();
}
