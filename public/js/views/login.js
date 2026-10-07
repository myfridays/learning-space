/** 登录页 */

import { api } from '../api.js';
import { esc } from '../util.js';

export function loginView(el, app) {
  el.innerHTML = `
    <div class="login-wrap">
      <form class="login" id="loginForm" autocomplete="on">
        <div class="login__mark">📚</div>
        <h1 class="login__title">学习空间</h1>
        <p class="login__sub">输入密码以访问你的笔记</p>

        <div id="loginError" hidden></div>

        <div class="field" style="margin-bottom:16px">
          <label class="field__label" for="password">密码</label>
          <input class="input" type="password" id="password" name="password"
                 autocomplete="current-password" placeholder="••••••••" required autofocus>
        </div>

        <button class="btn btn--primary btn--block" type="submit" id="loginBtn">进入</button>

        <p class="small muted" style="text-align:center;margin-top:18px;line-height:1.6">
          这是私人空间，数据保存在你自己的 Cloudflare 账号里
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
      await api.login(passwordInput.value);
      await app.start();
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
