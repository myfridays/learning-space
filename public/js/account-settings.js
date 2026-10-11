import { api } from './api.js';
import { esc } from './util.js';
export function accountSettings(root, user) {
 const section=document.createElement('section');section.className='pixel-panel settings-section account-settings';
 section.innerHTML=`<h2>我的账号</h2><p>${esc(user.username)}${user.role==='admin'?' · 管理员':''}</p>
 <details><summary>修改密码</summary><form id="password-form" class="entry-form"><label>当前密码<input type="password" name="currentPassword" autocomplete="current-password" required maxlength="200"></label><label>新密码<input type="password" name="password" autocomplete="new-password" minlength="10" maxlength="200" placeholder="至少 10 个字符" required></label><label>确认新密码<input type="password" name="confirm" autocomplete="new-password" minlength="10" maxlength="200" required></label><button class="btn" type="submit">保存密码</button><p class="inline-error" role="status"></p></form></details>
 ${user.role==='admin'?`<details id="account-admin"><summary>管理账号</summary><form id="create-account" class="entry-form"><label>账号<input name="username" autocomplete="off" minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" placeholder="字母、数字、下划线或短横线" required></label><label>初始密码<input type="password" name="password" autocomplete="new-password" minlength="10" maxlength="200" placeholder="至少 10 个字符" required></label><button class="btn" type="submit">创建账号</button><p class="inline-error" role="status"></p></form><div id="account-list"></div><p id="account-error" class="inline-error" role="alert"></p></details>`:''}`;
 root.querySelector('.life-page').prepend(section);
 // Keep the heading first, account controls immediately after it.
 root.querySelector('.pixel-heading').after(section);
 section.querySelector('#password-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.target,feedback=form.querySelector('[role=status]'),button=form.querySelector('button'),data=Object.fromEntries(new FormData(form));
  feedback.textContent='';if(data.password!==data.confirm){feedback.textContent='两次新密码不一致';return;}
  button.disabled=true;try{await api.changePassword(data);try{localStorage.setItem('space-session-change',String(Date.now()));}catch{}location.reload();}catch(err){feedback.textContent=err.message;}finally{button.disabled=false;}
 });
 if(user.role!=='admin')return;
 const list=section.querySelector('#account-list'),error=section.querySelector('#account-error');
 async function load(){try{const data=await api.accounts.list();list.innerHTML=data.users.map(u=>`<div class="account-row"><span>${esc(u.username)}${u.role==='admin'?' · 管理员':u.disabled?' · 已停用':''}</span>${u.role==='admin'?'':`<button type="button" class="btn" data-account="${esc(u.id)}" data-disabled="${u.disabled}">${u.disabled?'启用':'停用'}</button>`}</div>`).join('');error.textContent='';}catch(err){error.textContent=err.message;}}
 section.querySelector('#account-admin').addEventListener('toggle',e=>{if(e.target.open)load();});
 section.querySelector('#create-account').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.target,feedback=form.querySelector('[role=status]'),button=form.querySelector('button');button.disabled=true;feedback.textContent='';
  try{await api.accounts.create(Object.fromEntries(new FormData(form)));form.reset();feedback.textContent='账号已创建';await load();}catch(err){feedback.textContent=err.message;}finally{button.disabled=false;}
 });
 list.addEventListener('click',async e=>{const b=e.target.closest('[data-account]');if(!b)return;b.disabled=true;try{await api.accounts.setDisabled(b.dataset.account,b.dataset.disabled!=='true');await load();}catch(err){error.textContent=err.message;b.disabled=false;}});
}
