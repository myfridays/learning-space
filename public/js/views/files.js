/** 文档：上传、列表、阅读 */

import { api } from '../api.js';
import { emptyState } from '../components.js';
import { confirmAction, esc, formatBytes, relativeTime, toast } from '../util.js';

const ACCEPT = '.pdf,.epub,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.zip,.doc,.docx,.ppt,.pptx,.xls,.xlsx';

function iconFor(contentType, name) {
  const lower = (name || '').toLowerCase();
  if (contentType.includes('pdf') || lower.endsWith('.pdf')) return '📕';
  if (contentType.startsWith('image/')) return '🖼️';
  if (lower.endsWith('.epub')) return '📗';
  if (lower.endsWith('.zip')) return '🗜️';
  if (/\.(docx?|pptx?|xlsx?)$/.test(lower)) return '📘';
  if (/\.(md|txt)$/.test(lower)) return '📄';
  return '📄';
}

export async function filesView(el, app, openId) {
  let data = await api.documents.list();

  el.innerHTML = `
    <div class="page">
      <div class="page__head">
        <div>
          <h1 class="page__title">📄 文档</h1>
          <p class="page__sub" id="fileSub"></p>
        </div>
        <button class="btn btn--primary" id="uploadBtn">＋ 上传文件</button>
      </div>

      <input type="file" id="fileInput" accept="${ACCEPT}" hidden>

      <section class="card" style="margin-bottom:20px">
        <div class="card__body">
          <div class="upload-zone" id="dropZone">
            <div class="upload-zone__icon">📤</div>
            <div style="font-weight:600;color:var(--text)">点击选择文件，或把文件拖到这里</div>
            <div class="small muted" style="margin-top:6px">
              支持 PDF / 图片 / 文本 / Office 文档，单个文件建议不超过 100 MB
            </div>
          </div>
          <div id="uploadProgress" hidden style="margin-top:16px">
            <div class="row row--between small" style="margin-bottom:6px">
              <span id="uploadName" class="muted">上传中…</span>
              <span id="uploadPct" class="muted">0%</span>
            </div>
            <div class="bar"><i class="bar__fill" id="uploadBar" style="width:0%"></i></div>
          </div>
        </div>
      </section>

      <section class="card" style="margin-bottom:20px">
        <div class="card__body">
          <div class="row row--between small" style="margin-bottom:8px">
            <span style="font-weight:600">存储用量</span>
            <span class="muted" id="storageText"></span>
          </div>
          <div class="bar" id="storageBar"><i class="bar__fill" style="width:0%"></i></div>
        </div>
      </section>

      <div class="card">
        <div class="card__body card__body--flush" id="docList"></div>
      </div>
    </div>`;

  const docList = el.querySelector('#docList');
  const sub = el.querySelector('#fileSub');
  const storageText = el.querySelector('#storageText');
  const storageBar = el.querySelector('#storageBar');
  const fileInput = el.querySelector('#fileInput');
  const dropZone = el.querySelector('#dropZone');
  const progressBox = el.querySelector('#uploadProgress');
  const progressName = el.querySelector('#uploadName');
  const progressPct = el.querySelector('#uploadPct');
  const progressBar = el.querySelector('#uploadBar');

  /* ── 渲染 ── */

  function renderStorage() {
    const s = data.storage;
    storageText.textContent = `${formatBytes(s.usedBytes)} / ${formatBytes(s.quotaBytes)}（${
      s.percent
    }%）`;
    storageBar.className = `bar${s.percent >= 90 ? ' bar--danger' : s.percent >= 70 ? ' bar--warn' : ''}`;
    storageBar.querySelector('.bar__fill').style.width = `${Math.max(s.percent, 0.5)}%`;
    sub.textContent = `共 ${data.documents.length} 个文件 · 已用 ${formatBytes(s.usedBytes)}，剩余 ${formatBytes(
      s.remainingBytes,
    )}`;
  }

  function renderList() {
    if (!data.documents.length) {
      docList.innerHTML = emptyState({
        icon: '📄',
        title: '还没有文档',
        hint: '上传一个 PDF，就能在浏览器里直接阅读',
      });
      return;
    }

    docList.innerHTML = data.documents
      .map((doc) => {
        const pct =
          doc.totalPages && doc.totalPages > 0
            ? Math.min(100, Math.round((doc.lastPage / doc.totalPages) * 100))
            : null;
        return `<div class="doc-row" data-id="${esc(doc.id)}">
          <div class="doc-row__cover">${iconFor(doc.contentType, doc.name)}</div>
          <div class="doc-row__main">
            <div class="doc-row__name" title="${esc(doc.name)}">${esc(doc.name)}</div>
            <div class="doc-row__meta">
              ${formatBytes(doc.sizeBytes)} · 上传于 ${esc(relativeTime(doc.createdAt))}
              ${doc.openedAt ? ` · 最近打开 ${esc(relativeTime(doc.openedAt))}` : ''}
            </div>
            ${
              pct !== null
                ? `<div class="bar"><i class="bar__fill" style="width:${pct}%"></i></div>
                   <div class="doc-row__foot"><span>读到第 ${doc.lastPage} / ${doc.totalPages} 页</span><span class="pct">${pct}%</span></div>`
                : ''
            }
          </div>
          <div class="doc-row__actions">
            <button class="btn btn--sm" data-act="open" title="在线阅读">阅读</button>
            <button class="btn btn--ghost btn--sm" data-act="download" title="下载到本地">下载</button>
            <button class="btn btn--ghost btn--sm" data-act="rename" title="重命名">✎</button>
            <button class="btn btn--ghost btn--sm" data-act="delete" title="删除">✕</button>
          </div>
        </div>`;
      })
      .join('');
  }

  async function reload() {
    data = await api.documents.list();
    app.invalidate();
    renderStorage();
    renderList();
  }

  /* ── 上传 ── */

  async function upload(file) {
    if (!file) return;
    progressBox.hidden = false;
    progressName.textContent = file.name;
    progressPct.textContent = '0%';
    progressBar.style.width = '0%';

    try {
      await api.documents.upload(file, (pct) => {
        progressPct.textContent = `${pct}%`;
        progressBar.style.width = `${pct}%`;
      });
      toast('上传成功', 'success');
      await reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setTimeout(() => {
        progressBox.hidden = true;
      }, 600);
      fileInput.value = '';
    }
  }

  el.querySelector('#uploadBtn').addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => upload(fileInput.files?.[0]));

  ['dragenter', 'dragover'].forEach((type) => {
    dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      dropZone.classList.add('is-drag');
    });
  });
  ['dragleave', 'drop'].forEach((type) => {
    dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      dropZone.classList.remove('is-drag');
    });
  });
  dropZone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) upload(file);
  });

  /* ── 列表操作 ── */

  docList.addEventListener('click', async (event) => {
    const row = event.target.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const doc = data.documents.find((d) => d.id === id);
    if (!doc) return;

    const act = event.target.closest('[data-act]')?.dataset.act;

    if (act === 'open') {
      openReader(doc);
      return;
    }

    if (act === 'download') {
      try {
        toast('正在下载…');
        await api.documents.download(id, doc.name);
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }

    if (act === 'rename') {
      const nameEl = row.querySelector('.doc-row__name');
      const input = document.createElement('input');
      input.className = 'input';
      input.value = doc.name;
      input.style.fontSize = '14px';
      nameEl.replaceWith(input);
      input.focus();
      input.setSelectionRange(0, doc.name.replace(/\.[^.]+$/, '').length);

      let settled = false;
      const commit = async () => {
        if (settled) return;
        settled = true;
        const next = input.value.trim();
        if (!next || next === doc.name) {
          renderList();
          return;
        }
        try {
          await api.documents.update(id, { name: next });
          toast('已重命名', 'success');
          await reload();
        } catch (err) {
          toast(err.message, 'error');
          renderList();
        }
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (keyEvent) => {
        if (keyEvent.key === 'Enter') commit();
        if (keyEvent.key === 'Escape') {
          settled = true;
          renderList();
        }
      });
      return;
    }

    if (act === 'delete') {
      const yes = await confirmAction(
        `确定删除「${doc.name}」吗？文件会从存储中一起删除，无法恢复。`,
        { danger: true },
      );
      if (!yes) return;
      try {
        await api.documents.remove(id);
        toast('已删除', 'success');
        await reload();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });

  /* ── 阅读器 ── */

  function openReader(doc) {
    const overlay = document.createElement('div');
    overlay.className = 'reader-overlay';
    overlay.innerHTML = `
      <div class="reader-bar">
        <span class="reader-bar__name" title="${esc(doc.name)}">${iconFor(
          doc.contentType,
          doc.name,
        )} ${esc(doc.name)}</span>
        <span class="spacer"></span>
        <label class="small muted row" style="gap:6px">
          共
          <input class="input" id="totalPages" type="number" min="1" placeholder="?"
                 value="${doc.totalPages ?? ''}" style="width:70px;padding:4px 8px;font-size:12.5px">
          页，读到
          <input class="input" id="lastPage" type="number" min="1"
                 value="${doc.lastPage}" style="width:70px;padding:4px 8px;font-size:12.5px">
        </label>
        <button class="btn btn--sm" id="readerDownload">下载</button>
        <button class="btn btn--sm" id="readerNewTab">新标签打开</button>
        <button class="btn btn--ghost btn--sm" id="readerClose">✕ 关闭</button>
      </div>
      <iframe class="reader-frame" src="${api.documents.fileUrl(doc.id)}" title="${esc(doc.name)}"></iframe>`;

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (location.hash.startsWith('#/files/')) app.navigate('#/files');
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);

    overlay.querySelector('#readerClose').addEventListener('click', close);
    overlay.querySelector('#readerNewTab').addEventListener('click', () => {
      window.open(api.documents.fileUrl(doc.id), '_blank', 'noopener');
    });
    overlay.querySelector('#readerDownload').addEventListener('click', async () => {
      try {
        await api.documents.download(doc.id, doc.name);
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    const lastPageInput = overlay.querySelector('#lastPage');
    const totalPagesInput = overlay.querySelector('#totalPages');
    const saveProgress = async () => {
      const lastPage = Number(lastPageInput.value) || 1;
      const totalPages = totalPagesInput.value ? Number(totalPagesInput.value) : null;
      try {
        await api.documents.update(doc.id, { lastPage, totalPages, opened: true });
        await reload();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    lastPageInput.addEventListener('blur', saveProgress);
    totalPagesInput.addEventListener('blur', saveProgress);

    document.body.appendChild(overlay);

    // 记一次「最近打开」
    api.documents.update(doc.id, { opened: true }).catch(() => {});
  }

  renderStorage();
  renderList();

  // 直接访问 #/files/:id 时自动打开阅读器
  if (openId) {
    const doc = data.documents.find((d) => d.id === openId);
    if (doc) openReader(doc);
    else {
      toast('文档不存在', 'error');
      app.navigate('#/files');
    }
  }
}
