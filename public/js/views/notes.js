/** 笔记：列表 + 编辑器（带自动保存） */

import { api } from '../api.js';
import { emptyState } from '../components.js';
import { renderMarkdown } from '../markdown.js';
import {
  confirmAction,
  debounce,
  esc,
  localToday,
  parseTagsInput,
  readStored,
  relativeTime,
  tagsToInput,
  toast,
  writeStored,
} from '../util.js';

/* ══════════════════════════════════════════════════════════
   列表页
   ══════════════════════════════════════════════════════════ */

export async function notesListView(el, app) {
  const first = await api.notes.list({ limit: 200 });
  const tagList = await api.notes.tags();

  let query = '';
  let activeTag = '';

  el.innerHTML = `
    <div class="page">
      <div class="page__head">
        <div>
          <h1 class="page__title">📝 笔记</h1>
          <p class="page__sub" id="noteCount">共 ${first.total} 篇</p>
        </div>
        <div class="row">
          <button class="btn btn--primary" id="newNote">＋ 新建笔记</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card__body">
          <div class="row row--wrap" style="gap:12px">
            <input class="input" id="searchInput" type="search" placeholder="搜索标题和正文…"
                   style="flex:1;min-width:200px" autocomplete="off">
            <button class="btn btn--ghost btn--sm" id="clearFilters" hidden>清除筛选</button>
          </div>
          <div class="row row--wrap" style="margin-top:14px;gap:7px" id="tagBar"></div>
        </div>
      </div>

      <div class="card">
        <div class="selection-bar" id="selectionBar">
          <label class="selection-bar__all">
            <input type="checkbox" class="note-check" id="selectAll">
            <span>全选</span>
          </label>
          <span class="selection-bar__info" id="selectionInfo"></span>
          <span class="spacer"></span>
          <button class="btn btn--sm btn--danger" id="deleteSelected" disabled>删除选中</button>
        </div>
        <div class="card__body card__body--flush" id="noteList"></div>
      </div>
    </div>`;

  const listBox = el.querySelector('#noteList');
  const countBox = el.querySelector('#noteCount');
  const searchInput = el.querySelector('#searchInput');
  const clearBtn = el.querySelector('#clearFilters');
  const tagBar = el.querySelector('#tagBar');
  const selectionInfo = el.querySelector('#selectionInfo');
  const selectAllBox = el.querySelector('#selectAll');
  const deleteBtn = el.querySelector('#deleteSelected');

  /** 当前列表里的笔记（用来做全选、以及判断选中项是否还在） */
  let currentNotes = [];
  /** 已勾选的笔记 id */
  const selected = new Set();

  /** 同步「已选 N 篇」「全选」的勾选状态、删除按钮的可用性 */
  function updateSelectionUI() {
    const total = currentNotes.length;
    const picked = selected.size;

    deleteBtn.disabled = picked === 0;
    deleteBtn.textContent = picked > 0 ? `删除选中（${picked}）` : '删除选中';

    if (total === 0) {
      selectionInfo.textContent = '';
    } else if (picked === 0) {
      selectionInfo.textContent = `共 ${total} 篇`;
    } else {
      selectionInfo.textContent = `已选 ${picked} / ${total} 篇`;
    }

    selectAllBox.checked = total > 0 && picked === total;
    selectAllBox.indeterminate = picked > 0 && picked < total;
    selectAllBox.disabled = total === 0;

    listBox.querySelectorAll('.note-item').forEach((node) => {
      node.classList.toggle('is-selected', selected.has(node.dataset.id));
    });
  }

  function renderTagBar() {
    if (!tagList.length) {
      tagBar.innerHTML = '';
      return;
    }
    const chips = [
      `<button class="tag${activeTag === '' ? ' is-active' : ''}" data-tag="">全部</button>`,
      ...tagList
        .slice(0, 14)
        .map(
          (t) =>
            `<button class="tag${activeTag === t.tag ? ' is-active' : ''}" data-tag="${esc(
              t.tag,
            )}"># ${esc(t.tag)} <span class="muted">${t.count}</span></button>`,
        ),
    ];
    tagBar.innerHTML = chips.join('');
  }

  function renderList(notes) {
    currentNotes = notes;

    // 把已经不在当前列表里的选中项清掉（比如搜索之后被筛掉的）
    const visible = new Set(notes.map((n) => n.id));
    for (const id of [...selected]) {
      if (!visible.has(id)) selected.delete(id);
    }

    if (!notes.length) {
      listBox.innerHTML = emptyState({
        icon: query || activeTag ? '🔍' : '📝',
        title: query || activeTag ? '没有匹配的笔记' : '还没有笔记',
        hint: query || activeTag ? '换个关键词或标签试试' : '点右上角「新建笔记」开始记录',
      });
      updateSelectionUI();
      return;
    }

    listBox.innerHTML = notes
      .map((note) => {
        const tags = note.tags
          .slice(0, 4)
          .map((t) => `<span class="tag tag--static"># ${esc(t)}</span>`)
          .join(' ');
        const isSelected = selected.has(note.id);

        return `<div class="note-item${isSelected ? ' is-selected' : ''}" data-id="${esc(note.id)}">
          <div class="note-item__check">
            <input type="checkbox" class="note-check" data-check="${esc(note.id)}"
                   ${isSelected ? 'checked' : ''}
                   aria-label="选中「${esc(note.title || '无标题')}」">
          </div>
          <div class="note-item__body">
            <div class="note-item__title">
              ${note.pinned ? '<span title="已置顶">📌</span>' : ''}
              ${esc(note.title || '无标题')}
            </div>
            <div class="note-item__meta">
              ${tags}${tags ? '<span class="dot"></span>' : ''}
              <span>${esc(relativeTime(note.updatedAt))}</span>
            </div>
            ${note.excerpt ? `<div class="note-item__excerpt">${esc(note.excerpt)}</div>` : ''}
          </div>
        </div>`;
      })
      .join('');

    updateSelectionUI();
  }

  async function load() {
    try {
      const data = await api.notes.list({ q: query, tag: activeTag, limit: 200 });
      renderList(data.notes);
      countBox.textContent =
        query || activeTag
          ? `筛选出 ${data.notes.length} 篇 · 共 ${data.total} 篇`
          : `共 ${data.total} 篇`;
      clearBtn.hidden = !query && !activeTag;
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const searchNow = debounce(load, 260);
  searchInput.addEventListener('input', () => {
    query = searchInput.value.trim();
    searchNow();
  });

  tagBar.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-tag]');
    if (!chip) return;
    activeTag = chip.dataset.tag;
    renderTagBar();
    load();
  });

  clearBtn.addEventListener('click', () => {
    query = '';
    activeTag = '';
    searchInput.value = '';
    renderTagBar();
    load();
  });

  el.querySelector('#newNote').addEventListener('click', async () => {
    try {
      const { note } = await api.notes.create({ title: '无标题', content: '', tags: [] });
      app.invalidate();
      app.navigate(`#/notes/${note.id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  /* ── 勾选与批量删除 ── */

  // 勾选 / 取消勾选某一篇
  listBox.addEventListener('change', (event) => {
    const box = event.target.closest('[data-check]');
    if (!box) return;
    const id = box.dataset.check;
    if (box.checked) selected.add(id);
    else selected.delete(id);
    updateSelectionUI();
  });

  // 点整行进入编辑器；点复选框区域不跳转
  listBox.addEventListener('click', (event) => {
    if (event.target.closest('.note-item__check')) return;
    const item = event.target.closest('[data-id]');
    if (item) app.navigate(`#/notes/${item.dataset.id}`);
  });

  // 全选 / 取消全选
  selectAllBox.addEventListener('change', () => {
    if (selectAllBox.checked) {
      for (const note of currentNotes) selected.add(note.id);
    } else {
      selected.clear();
    }
    listBox.querySelectorAll('[data-check]').forEach((box) => {
      box.checked = selected.has(box.dataset.check);
    });
    updateSelectionUI();
  });

  // 删除选中
  deleteBtn.addEventListener('click', async () => {
    const ids = [...selected];
    if (ids.length === 0) return;

    const yes = await confirmAction(
      `确定删除选中的 ${ids.length} 篇笔记吗？\n\n删除后在界面上无法恢复，\n但 7 天内可以用 D1 Time Travel 找回（命令见 DEPLOY.md）。`,
      { danger: true },
    );
    if (!yes) return;

    deleteBtn.disabled = true;
    deleteBtn.textContent = '删除中…';

    try {
      const result = await api.notes.removeMany(ids);
      selected.clear();
      app.invalidate();
      toast(`已删除 ${result?.deleted ?? ids.length} 篇笔记`, 'success');
      await load();
    } catch (err) {
      toast(err.message, 'error');
      updateSelectionUI();
    }
  });

  renderTagBar();
  renderList(first.notes);
}

/* ══════════════════════════════════════════════════════════
   编辑器（自动保存）
   ══════════════════════════════════════════════════════════ */

const SAVE_DELAY = 1200;

export async function noteEditorView(el, app, noteId) {
  // 防御性写法：接口成功但没返回 note（或返回了 null）时，
  // 也要走「笔记不存在」这条路，而不是在 note.title 上崩掉
  let note = null;
  try {
    const result = await api.notes.get(noteId);
    note = result && typeof result === 'object' ? result.note ?? null : null;
  } catch {
    note = null;
  }

  if (!note || typeof note !== 'object') {
    el.innerHTML = `<div class="page">${emptyState({
      icon: '🔍',
      title: '笔记不存在',
      hint: '它可能已经被删除了',
    })}<div style="text-align:center"><a class="btn" href="#/notes">← 返回笔记列表</a></div></div>`;
    return;
  }

  // 编辑状态
  const current = {
    title: note.title,
    content: note.content,
    tags: tagsToInput(note.tags),
    pinned: note.pinned,
  };
  const saved = { ...current };
  let status = 'saved'; // saved | saving | dirty | error
  let viewMode = readStored('editor-view', 'split');
  let lastError = '';

  el.innerHTML = `
    <div class="page">
      <div class="page__head">
        <div class="row row--wrap">
          <a class="btn btn--ghost btn--sm" href="#/notes">← 返回</a>
          <span class="save-status save-status--saved" id="saveStatus">
            <span class="save-status__dot"></span><span id="saveText">已保存</span>
          </span>
        </div>
        <div class="row">
          <button class="btn btn--sm" id="pinBtn" title="置顶">${note.pinned ? '📌 已置顶' : '📍 置顶'}</button>
          <button class="btn btn--sm" id="modeBtn" title="切换视图">${
            viewMode === 'split' ? '◫ 分栏' : viewMode === 'write' ? '✎ 只写' : '👁 只读'
          }</button>
          <button class="btn btn--sm btn--danger" id="deleteBtn">删除</button>
        </div>
      </div>

      <div class="card">
        <div class="card__body" style="padding-bottom:10px">
          <input class="input input--title" id="titleInput" placeholder="标题"
                 value="${esc(note.title)}" maxlength="300">
          <div class="row row--wrap" style="margin-top:6px;gap:10px">
            <input class="input input--flush small" id="tagsInput" placeholder="标签，用逗号分隔"
                   value="${esc(tagsToInput(note.tags))}" style="flex:1;min-width:160px;max-width:420px">
            <span class="small muted" id="metaInfo">
              创建于 ${esc(relativeTime(note.createdAt))} · 更新于 ${esc(relativeTime(note.updatedAt))}
            </span>
          </div>
        </div>

        <div class="editor__toolbar">
          <span class="small muted">Markdown 语法 · Ctrl/⌘ + S 立即保存</span>
          <span class="spacer"></span>
          <span class="small muted" id="charCount"></span>
        </div>

        <div class="editor__split" id="split">
          <div class="editor__pane editor__pane--write" id="writePane">
            <textarea class="editor__textarea" id="contentArea" spellcheck="false"
                      placeholder="开始写点什么…">${esc(note.content)}</textarea>
          </div>
          <div class="editor__pane" id="previewPane">
            <div class="editor__preview md" id="previewBox"></div>
          </div>
        </div>
      </div>
    </div>`;

  const titleInput = el.querySelector('#titleInput');
  const tagsInput = el.querySelector('#tagsInput');
  const contentArea = el.querySelector('#contentArea');
  const previewBox = el.querySelector('#previewBox');
  const statusEl = el.querySelector('#saveStatus');
  const statusText = el.querySelector('#saveText');
  const charCount = el.querySelector('#charCount');
  const writePane = el.querySelector('#writePane');
  const previewPane = el.querySelector('#previewPane');
  const split = el.querySelector('#split');

  /* ── 视图模式 ── */

  function applyViewMode() {
    writePane.hidden = viewMode === 'preview';
    previewPane.hidden = viewMode === 'write';
    split.style.gridTemplateColumns = viewMode === 'split' ? '' : '1fr';
  }
  applyViewMode();

  el.querySelector('#modeBtn').addEventListener('click', (event) => {
    viewMode = viewMode === 'split' ? 'write' : viewMode === 'write' ? 'preview' : 'split';
    writeStored('editor-view', viewMode);
    event.currentTarget.textContent =
      viewMode === 'split' ? '◫ 分栏' : viewMode === 'write' ? '✎ 只写' : '👁 只读';
    applyViewMode();
  });

  /* ── 预览 ── */

  const renderPreview = debounce(() => {
    previewBox.innerHTML = renderMarkdown(current.content);
  }, 180);
  renderPreview();

  function updateCharCount() {
    const chars = current.content.length;
    charCount.textContent = `${chars} 字`;
  }
  updateCharCount();

  /* ── 保存状态 ── */

  function setStatus(next, message = '') {
    status = next;
    lastError = next === 'error' ? message : '';
    const map = {
      saved: ['save-status--saved', '已保存'],
      saving: ['save-status--saving', '保存中…'],
      dirty: ['save-status--dirty', '未保存'],
      error: ['save-status--error', '保存失败，点此重试'],
    };
    const [cls, text] = map[next];
    statusEl.className = `save-status ${cls}`;
    statusText.textContent = text;
    statusEl.title = next === 'error' ? message : '';
    statusEl.style.cursor = next === 'error' ? 'pointer' : 'default';
  }

  function diffPatch() {
    const patch = {};
    if (current.title !== saved.title) patch.title = current.title;
    if (current.content !== saved.content) patch.content = current.content;
    if (current.tags !== saved.tags) patch.tags = parseTagsInput(current.tags);
    if (current.pinned !== saved.pinned) patch.pinned = current.pinned;
    return patch;
  }

  function isDirty() {
    return Object.keys(diffPatch()).length > 0;
  }

  let saving = false;

  async function saveNow() {
    if (saving) return; // 正在保存，结束后会自动再检查一遍
    const patch = diffPatch();
    if (Object.keys(patch).length === 0) {
      setStatus('saved');
      return;
    }

    saving = true;
    setStatus('saving');

    try {
      const { note: updated } = await api.notes.update(noteId, patch);
      saved.title = updated.title;
      saved.content = updated.content;
      saved.tags = tagsToInput(updated.tags);
      saved.pinned = updated.pinned;
      app.invalidate();

      const meta = el.querySelector('#metaInfo');
      if (meta) meta.textContent = `创建于 ${relativeTime(updated.createdAt)} · 刚刚更新`;

      setStatus(isDirty() ? 'dirty' : 'saved');
    } catch (err) {
      setStatus('error', err.message);
    } finally {
      saving = false;
      // 保存期间用户又改了内容 → 立刻再存一次
      if (status === 'dirty') scheduleSave();
    }
  }

  const scheduleSave = debounce(saveNow, SAVE_DELAY);

  function onEdit() {
    setStatus('dirty');
    scheduleSave();
  }

  titleInput.addEventListener('input', () => {
    current.title = titleInput.value;
    onEdit();
  });

  tagsInput.addEventListener('input', () => {
    current.tags = tagsInput.value;
    onEdit();
  });

  contentArea.addEventListener('input', () => {
    current.content = contentArea.value;
    updateCharCount();
    renderPreview();
    onEdit();
  });

  // 出错后点击状态条重试
  statusEl.addEventListener('click', () => {
    if (status === 'error') {
      toast('正在重试保存…');
      saveNow();
    }
  });

  document.addEventListener('keydown', function onKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      scheduleSave.cancel();
      saveNow();
    }
  });

  /* ── 置顶 ── */

  el.querySelector('#pinBtn').addEventListener('click', async (event) => {
    current.pinned = !current.pinned;
    event.currentTarget.textContent = current.pinned ? '📌 已置顶' : '📍 置顶';
    try {
      await api.notes.update(noteId, { pinned: current.pinned });
      saved.pinned = current.pinned;
      app.invalidate();
      toast(current.pinned ? '已置顶' : '已取消置顶', 'success');
    } catch (err) {
      current.pinned = !current.pinned;
      toast(err.message, 'error');
    }
  });

  /* ── 删除 ── */

  el.querySelector('#deleteBtn').addEventListener('click', async () => {
    const { confirmAction } = await import('../util.js');
    const yes = await confirmAction(
      `确定要删除「${current.title || '无标题'}」吗？删除后无法在界面上恢复（但 7 天内可以用 D1 Time Travel 找回）。`,
      { danger: true },
    );
    if (!yes) return;
    try {
      await api.notes.remove(noteId);
      app.invalidate();
      app.clearLeaveGuard();
      toast('已删除', 'success');
      app.navigate('#/notes');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  /* ── 离开保护 ── */

  // 关闭/刷新页面时提醒
  const beforeUnload = (event) => {
    if (status === 'dirty' || status === 'saving') {
      event.preventDefault();
      event.returnValue = '';
      return '';
    }
    return undefined;
  };
  window.addEventListener('beforeunload', beforeUnload);

  // 站内跳转时先把没存的存掉
  app.setLeaveGuard(async () => {
    scheduleSave.cancel();
    if (isDirty()) await saveNow();
    window.removeEventListener('beforeunload', beforeUnload);
  });

  contentArea.focus();
  setStatus('saved');
}
