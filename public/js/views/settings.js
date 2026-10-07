/** 设置与数据管理 */

import { api } from '../api.js';
import { card, kv } from '../components.js';
import { confirmAction, esc, formatBytes, localToday, toast } from '../util.js';

export async function settingsView(el, app) {
  const stats = await api.stats();
  const me = await api.me();

  el.innerHTML = `
    <div class="page page--narrow">
      <div class="page__head">
        <div>
          <h1 class="page__title">⚙️ 设置</h1>
          <p class="page__sub">数据管理 · 备份 · 界面</p>
        </div>
      </div>

      <div class="stack">
        ${card({
          icon: '💾',
          title: '数据备份（最重要）',
          body: `
            <div class="notice notice--info" style="margin-bottom:16px">
              <span>🛡️</span>
              <div>
                你的笔记存在 <b>Cloudflare D1</b>，文档存在 <b>R2</b>。
                D1 自带 Time Travel，可以恢复到<b>过去 7 天内的任意一分钟</b>，
                所以手滑删错也不用怕。但为了万无一失，建议定期导出备份。
              </div>
            </div>

            <div class="row row--wrap" style="gap:10px">
              <a class="btn btn--primary" href="${api.exportUrl()}" download>⬇️ 导出全部数据（JSON）</a>
              <button class="btn" id="copyBackupCmd">📋 复制命令行备份命令</button>
            </div>

            <p class="small muted" style="margin-top:14px;line-height:1.7">
              导出的 JSON 包含：笔记（含正文）、待办、习惯、所有打卡记录、文档元数据。<br>
              文档的文件本体不包含在内（体积太大），请到「文档」页单独下载。
            </p>
          `,
        })}

        ${card({
          icon: '📊',
          title: '数据统计',
          body: `
            ${kv('笔记', `${stats.notes.total} 篇 · ${stats.notes.tags} 个标签`)}
            ${kv('待办', `${stats.todos.total} 项（未完成 ${stats.todos.open}）`)}
            ${kv('习惯', `${stats.habits.total} 个（启用 ${stats.habits.active}）`)}
            ${kv('文档', `${stats.documents.total} 个`)}
            ${kv(
              '存储用量',
              `${formatBytes(stats.documents.usedBytes)} / ${formatBytes(stats.documents.quotaBytes)}`,
            )}
          `,
        })}

        ${
          stats.notes.tagList.length
            ? card({
                icon: '🏷️',
                title: '全部标签',
                body: `<div class="row row--wrap" style="gap:7px">${stats.notes.tagList
                  .map(
                    (t) =>
                      `<a class="tag" href="#/notes"># ${esc(t.tag)} <span class="muted">${t.count}</span></a>`,
                  )
                  .join('')}</div>`,
              })
            : ''
        }

        ${card({
          icon: '🎨',
          title: '界面',
          body: `
            <div class="row row--between">
              <div>
                <div style="font-weight:600">主题</div>
                <div class="small muted">跟随系统，或手动固定为浅色 / 深色</div>
              </div>
              <div class="row" style="gap:6px">
                <button class="btn btn--sm" data-theme-set="auto">跟随系统</button>
                <button class="btn btn--sm" data-theme-set="light">☀️ 浅色</button>
                <button class="btn btn--sm" data-theme-set="dark">🌙 深色</button>
              </div>
            </div>
          `,
        })}

        ${card({
          icon: '🔐',
          title: '账号与安全',
          body: `
            ${kv('登录保护', me.authEnabled ? '已开启' : '⚠️ 未开启（APP_PASSWORD 未设置）')}
            ${
              !me.authEnabled
                ? `<div class="notice notice--warn" style="margin-top:12px">
                     <span>⚠️</span>
                     <div>当前没有设置密码，任何人都能访问。部署到公网前请务必设置环境变量
                     <code class="mono">APP_PASSWORD</code>。</div>
                   </div>`
                : ''
            }
            <div class="row" style="margin-top:16px;gap:10px">
              <button class="btn btn--danger" id="logoutBtn">退出登录</button>
            </div>
          `,
        })}

        ${card({
          icon: '🩺',
          title: '系统状态',
          body: `
            ${kv('今天（浏览器本地日期）', localToday())}
            ${kv('前端版本', '0.1.0')}
            ${kv('数据存储', 'Cloudflare D1（SQLite）')}
            ${kv('文件存储', 'Cloudflare R2')}
          `,
        })}
      </div>
    </div>`;

  /* ── 交互 ── */

  el.querySelector('#copyBackupCmd').addEventListener('click', async () => {
    const cmd = 'npx wrangler d1 export learning-space --remote --output=./backup.sql';
    try {
      await navigator.clipboard.writeText(cmd);
      toast('命令已复制，在项目目录执行即可', 'success');
    } catch {
      toast(cmd, 'info');
    }
  });

  el.querySelectorAll('[data-theme-set]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.themeSet;
      app.setThemeMode(mode);
      toast(
        mode === 'auto' ? '已切换为跟随系统' : mode === 'light' ? '已切换为浅色' : '已切换为深色',
        'success',
      );
    });
  });

  el.querySelector('#logoutBtn').addEventListener('click', async () => {
    const yes = await confirmAction('确定要退出登录吗？需要重新输入密码。');
    if (!yes) return;
    try {
      await api.logout();
      location.hash = '';
      location.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
