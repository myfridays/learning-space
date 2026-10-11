/** 登录页 */

import { api } from '../api.js';
import { esc } from '../util.js';

export function loginView(el, app) {
  el.innerHTML = `
    <div class="login-wrap">
      <form class="login" id="loginForm" autocomplete="on">
        <img class="pixel-login-house" src="/village/buildings/square.png" alt="">
        <h1 class="login__title">生活村庄</h1>
        <p class="login__sub">登录账号，回到自己的小天地</p>

        <div id="loginError" hidden></div>
        <div class="field" style="margin-bottom:16px"><label class="field__label" for="username">账号</label><input class="input" id="username" name="username" autocomplete="username" maxlength="32" value="owner" required></div>

        <div class="field" style="margin-bottom:16px">
          <label class="field__label" for="password">密码</label>
          <input class="input" type="password" id="password" name="password"
                 autocomplete="current-password" placeholder="••••••••" required autofocus>
        </div>

        <button class="btn btn--primary btn--block" type="submit" id="loginBtn">进入</button>

        <p class="small muted" style="text-align:center;margin-top:18px;line-height:1.6">
          账号由管理员创建，个人记录独立保存
        </p>
      </form>
    </div>`;

  const form = el.querySelector('#loginForm');
  const errorBox = el.querySelector('#loginError');
  const button = el.querySelector('#loginBtn');
  const passwordInput = el.querySelector('#password');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    button.disabled = true;
    button.textContent = '验证中…';

    try {
      await api.login(passwordInput.value, el.querySelector('#username').value);
      try { localStorage.setItem('space-session-change',String(Date.now())); } catch {}
      location.reload();
    } catch (err) {
      errorBox.hidden = false;
      errorBox.className = 'login__error';
      errorBox.textContent = err.message || '登录失败';
      passwordInput.select();
    } finally {
      button.disabled = false;
      button.textContent = '进入';
    }
  });

  passwordInput.focus();
}
