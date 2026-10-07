/**
 * API 封装
 * ------------------------------------------------------------------
 * 所有请求都带 credentials: 'same-origin'，会话 Cookie 会自动带上。
 * 失败时抛出的 Error 上带 status / code，方便界面区分处理。
 */

async function request(method, path, options = {}) {
  const headers = new Headers();
  let payload;

  if (options.formData) {
    payload = options.formData;
  } else if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
    payload = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
    });
  } catch (networkError) {
    const err = new Error('网络连接失败，请检查网络后重试');
    err.code = 'network_error';
    err.cause = networkError;
    throw err;
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const err = new Error(data?.error || `请求失败（HTTP ${response.status}）`);
    err.status = response.status;
    err.code = data?.code;
    err.detail = data?.detail;
    throw err;
  }

  return data;
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, { body });
const patch = (path, body) => request('PATCH', path, { body });
const del = (path) => request('DELETE', path);

export const api = {
  health: () => get('/api/health'),

  /* 认证 */
  me: () => get('/api/auth/me'),
  login: (password) => post('/api/auth/login', { password }),
  logout: () => post('/api/auth/logout', {}),

  /* 聚合 */
  bootstrap: () => get(`/api/bootstrap?today=${encodeURIComponent(localToday())}`),
  stats: () => get('/api/data/stats'),

  /* 笔记 */
  notes: {
    list: (params = {}) => {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.tag) qs.set('tag', params.tag);
      if (params.limit) qs.set('limit', String(params.limit));
      if (params.offset) qs.set('offset', String(params.offset));
      const suffix = qs.toString();
      return get(`/api/notes${suffix ? '?' + suffix : ''}`);
    },
    tags: () => get('/api/notes/tags'),
    get: (id) => get(`/api/notes/${encodeURIComponent(id)}`),
    create: (body) => post('/api/notes', body),
    update: (id, body) => patch(`/api/notes/${encodeURIComponent(id)}`, body),
    remove: (id) => del(`/api/notes/${encodeURIComponent(id)}`),
    /** 批量删除。比循环调用 remove() 少很多请求 */
    removeMany: (ids) => post('/api/notes/batch-delete', { ids }),
  },

  /* 待办 */
  todos: {
    list: () => get('/api/todos'),
    create: (body) => post('/api/todos', body),
    update: (id, body) => patch(`/api/todos/${encodeURIComponent(id)}`, body),
    remove: (id) => del(`/api/todos/${encodeURIComponent(id)}`),
  },

  /* 习惯 */
  habits: {
    list: (days = 112) =>
      get(`/api/habits?today=${encodeURIComponent(localToday())}&days=${days}`),
    create: (body) => post('/api/habits', body),
    update: (id, body) => patch(`/api/habits/${encodeURIComponent(id)}`, body),
    remove: (id) => del(`/api/habits/${encodeURIComponent(id)}`),
    check: (id, day, checked) => {
      const body = { day };
      if (checked !== undefined) body.checked = checked;
      return post(`/api/habits/${encodeURIComponent(id)}/check`, body);
    },
  },

  /* 文档 */
  documents: {
    list: () => get('/api/documents'),
    upload: (file, onProgress) => uploadWithProgress(file, onProgress),
    update: (id, body) => patch(`/api/documents/${encodeURIComponent(id)}`, body),
    remove: (id) => del(`/api/documents/${encodeURIComponent(id)}`),
    fileUrl: (id) => `/api/documents/${encodeURIComponent(id)}/file`,
    /**
     * 下载到本地。因为文件接口需要登录 Cookie，
     * 不能直接用 <a download>（那样拿不到正确的文件名），
     * 所以先 fetch 成 Blob 再触发保存。
     */
    download: async (id, name) => {
      const res = await fetch(`/api/documents/${encodeURIComponent(id)}/file`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`下载失败（HTTP ${res.status}）`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  },

  /* 导出：直接用浏览器下载，Cookie 会自动带上 */
  exportUrl: () => '/api/data/export',
};

/** 带上传进度的上传。Fetch 本身没有进度事件，用 XHR 实现 */
function uploadWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/documents');
    xhr.withCredentials = true;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        const err = new Error(data?.error || `上传失败（HTTP ${xhr.status}）`);
        err.status = xhr.status;
        err.code = data?.code;
        reject(err);
      }
    });

    xhr.addEventListener('error', () => {
      const err = new Error('上传失败：网络中断');
      err.code = 'network_error';
      reject(err);
    });

    xhr.addEventListener('abort', () => {
      const err = new Error('上传已取消');
      err.code = 'aborted';
      reject(err);
    });

    xhr.send(form);
  });
}

/* 这里复制一份本地日期函数，避免 api.js 依赖 util.js 造成循环引用 */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
