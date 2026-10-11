import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadDevVars } from './lib/env.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1360,height:1050},serviceWorkers:'block'});
const page=await context.newPage(),base=process.env.BASE_URL || 'http://127.0.0.1:8789';
const created=[],errors=[];let count=0;
function check(name,value){assert.ok(value,name);count++;console.log(`✓ ${name}`);}
page.on('pageerror',error=>errors.push(error.message));
page.on('response',async response=>{if(response.request().method()==='POST'&&response.status()===201){const path=new URL(response.url()).pathname;if(path.startsWith('/api/life/')||path==='/api/todos'){const d=await response.json();created.push({path,id:(d.item||d.todo).id});}}});
const stamp=String(Date.now()),quote='测试感悟 '+stamp,activity='测试慢跑 '+stamp,task='测试待办 '+stamp;
async function go(hash){await page.goto(base+'/admin.html'+hash);}
try{
 await go('#/');
 const me=await (await context.request.get(base+'/api/auth/me')).json();
 if(me.authEnabled){await page.locator('#password').fill(loadDevVars(resolve('.')).APP_PASSWORD);await page.locator('#loginBtn').click();}
 await page.locator('.village-map').waitFor();
 check('五栏导航与建筑入口',await page.locator('#nav a').allTextContents().then(a=>a.join(',')==='首页,正念,健身,待办,设置')&&await page.locator('.village-building').count()===5);
 check('首页时钟存在且没有星空循环',/\d{2}:\d{2}/.test(await page.locator('#village-time').textContent())&&await page.locator('#cosmos').count()===0);
 await page.screenshot({path:'/tmp/village-desktop.png',fullPage:true});
 await page.locator('.building-mindfulness').click();
 await page.locator('[name=content]').fill(quote);await page.locator('[name=content]').press('Enter');
 await page.getByText(quote,{exact:true}).waitFor();check('正念输入回车保存',await page.locator('.quote-entry').filter({hasText:quote}).count()===1);
 await page.reload();const card=page.locator('.quote-entry').filter({hasText:quote});await card.waitFor();check('刷新后正念持久保存',await card.count()===1);
 await card.locator('summary').click();await card.locator('[data-edit]').click();await page.locator('[name=content]').fill(quote+' 修改');await page.locator('#life-form [type=submit]').click();
 const edited=page.locator('.quote-entry').filter({hasText:quote+' 修改'});await edited.waitFor();check('正念编辑',await edited.count()===1);
 await edited.locator('summary').click();await edited.locator('[data-delete]').click();await page.locator('.undo-bar').waitFor();check('删除后消失',await page.locator('.quote-entry').filter({hasText:quote}).count()===0);
 await page.locator('.undo-bar button').click();await page.locator('.quote-entry').filter({hasText:quote}).waitFor();check('撤销恢复正念',true);
 await page.locator('[name=content]').fill('尚未保存的输入');
 await page.locator('#nav a[href="#/fitness"]').click();await page.locator('#new-entry').waitFor();
 await page.locator('#nav a[href="#/mindfulness"]').click();
 await page.locator('.quote-list').waitFor();
 check('栏目切换保留未提交输入',await page.locator('[name=content]').inputValue()==='尚未保存的输入');
 await page.route('**/api/life/mindfulness',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{error:'测试保存失败'}}):route.continue());
 await page.locator('#life-form [type=submit]').click();await page.locator('#life-form [role=alert]').filter({hasText:'测试保存失败'}).waitFor();
 check('保存失败不丢失输入',await page.locator('[name=content]').inputValue()==='尚未保存的输入');
 await page.unroute('**/api/life/mindfulness');await page.locator('[name=content]').fill('');
 await page.locator('#nav a[href="#/fitness"]').click();await page.locator('#new-entry').click();
 await page.locator('[name=content]').fill(activity);await page.locator('[name=duration]').fill('25');await page.locator('[name=distance]').fill('3');await page.locator('[name=note]').fill('轻松完成');
 await page.locator('#life-form [type=submit]').click();await page.locator('.workout-entry').filter({hasText:activity}).waitFor();
 check('健身按日期时间轴展示',await page.locator('.timeline-day').count()>0&&await page.locator('.workout-entry').filter({hasText:activity}).textContent().then(t=>t.includes('25 分钟')&&t.includes('3 公里')));
 await page.screenshot({path:'/tmp/village-fitness.png',fullPage:true});
 await page.locator('#nav a[href="#/todos"]').click();await page.locator('#today-title').fill(task);await page.locator('.todo-add button').click();
 const todo=page.locator('.today-task').filter({hasText:task});await todo.waitFor();await todo.locator('[data-done]').check();await page.locator('.task-group').filter({hasText:'已完成'}).waitFor();
 check('今日待办完成后归入折叠区',await page.locator('.today-task.is-done').filter({hasText:task}).count()===1);
 await page.locator('#nav a[href="#/settings"]').click();await page.locator('#theme-choice').selectOption('light');
 check('设置保留原入口',await page.locator('.legacy-links a').count()===4);
 await page.route('**/api/weather/cities?*',route=>route.fulfill({json:{cities:[{name:'杭州',region:'浙江 · 中国',latitude:30.27,longitude:120.15}]}}));
 await page.route('**/api/weather?*',route=>route.fulfill({json:{temperature:24,code:2}}));
 await page.locator('#city-search').fill('杭州');await page.locator('#city-form button').click();await page.locator('.city-option').click();
 await page.locator('#nav a[href="#/"]').click();await page.locator('#village-weather').filter({hasText:'杭州 · 多云 24°C'}).waitFor();check('选择城市后首页天气更新',true);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
 check('手机布局无水平溢出',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const bounds=await page.locator('.village-building').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width};}));
 check('手机建筑保持可点击尺寸',bounds.every(b=>b.x>=0&&b.right<=390&&b.width>=44));
 await page.screenshot({path:'/tmp/village-mobile.png',fullPage:true});
 await page.locator('.building-settings').click();
 await page.locator('#show-pet').uncheck();check('设置可收起桌宠',await page.locator('#space-pet').isHidden());
 await page.locator('#show-pet').check();check('设置可恢复桌宠',await page.locator('#space-pet').isVisible());
 await page.locator('#pet-audio').uncheck();check('设置可静音',await page.evaluate(()=>localStorage.getItem('pet-muted'))==='true');
 await page.locator('.legacy-links a[href="#/notes"]').click();await page.locator('#searchInput').waitFor();check('旧笔记页面可进入',true);
 await page.goto(base+'/');check('公开博客保持原入口',await page.locator('.blog-brand').textContent().then(t=>t.includes('defineFlora')));
 check('无脚本错误',errors.length===0);
 console.log(`${count} village browser checks passed.`);
}finally{
 for(const item of created)await context.request.delete(base+item.path+'/'+item.id).catch(()=>{});
 await browser.close();
}
