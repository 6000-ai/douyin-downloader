/* Douyin DL front-end */

const $ = (sel) => document.querySelector(sel);

const input = $('#input');
const form = $('#parse-form');
const btnParse = $('#btn-parse');
const btnPaste = $('#btn-paste');
const btnClear = $('#btn-clear');
const errorEl = $('#error');
const resultSection = $('#result-section');
const historySection = $('#history-section');
const historyList = $('#history-list');
const historyEmpty = $('#history-empty');

let currentData = null;

function setBusy(busy) {
  btnParse.disabled = busy;
  btnParse.querySelector('.btn-label').textContent = busy ? '正在解析…' : '解析并下载';
  btnParse.querySelector('.spinner').hidden = !busy;
}

function showError(msg) {
  if (!msg) {
    errorEl.hidden = true;
    errorEl.textContent = '';
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = msg;
}

function formatDuration(sec) {
  if (!sec || sec < 0) return '—';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function proxyImage(url) {
  if (!url) return '';
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

function coverUrlForDownload(item) {
  // 优先走代理，避免防盗链
  return `/api/proxy?url=${encodeURIComponent(item.cover)}`;
}

function videoDownloadUrl(item) {
  return `/api/download?src=${encodeURIComponent(item.videoUrl)}&filename=${encodeURIComponent(item.title || item.id)}`;
}

function renderResult(item) {
  currentData = item;
  const img = $('#cover');
  img.classList.remove('is-on');
  img.onload = () => img.classList.add('is-on');
  img.onerror = () => img.classList.add('is-on');
  img.src = item.cover ? proxyImage(item.cover) : '';

  $('#title').textContent = item.title || '未命名视频';
  $('#author').textContent = '@' + (item.author || '未知作者');
  $('#duration').textContent = formatDuration(item.duration);
  $('#vid').textContent = item.id ? `ID ${item.id}` : '';

  const coverLink = $('#btn-cover');
  coverLink.href = coverUrlForDownload(item);
  coverLink.setAttribute('download', `${(item.title || 'cover').slice(0, 40)}-cover.jpg`);

  const videoLink = $('#btn-video');
  videoLink.href = videoDownloadUrl(item);

  resultSection.hidden = false;
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderHistory(items) {
  historyList.innerHTML = '';
  const list = Array.isArray(items) ? items : [];
  historyEmpty.hidden = list.length > 0;
  btnClear.hidden = list.length === 0;

  for (const item of list) {
    const li = document.createElement('li');

    const img = document.createElement('img');
    img.className = 'h-cover';
    img.alt = '';
    img.loading = 'lazy';
    img.src = item.cover ? proxyImage(item.cover) : '';

    const body = document.createElement('div');
    body.className = 'h-body';
    const t = document.createElement('p');
    t.className = 'h-title';
    t.textContent = item.title || '未命名视频';
    const s = document.createElement('p');
    s.className = 'h-sub';
    s.textContent = `${item.author ? '@' + item.author + ' · ' : ''}${formatDuration(item.duration)} · ${item.id || ''}`;
    body.append(t, s);

    const act = document.createElement('button');
    act.type = 'button';
    act.className = 'h-act';
    act.textContent = '重新解析';
    act.addEventListener('click', () => {
      input.value = item.id
        ? `https://www.douyin.com/video/${item.id}`
        : '';
      form.requestSubmit();
    });

    li.append(img, body, act);
    historyList.append(li);
  }
}

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const json = await res.json();
    if (json.ok) renderHistory(json.data);
  } catch {
    renderHistory([]);
  }
}

async function doParse(raw) {
  const text = (raw ?? input.value).trim();
  showError('');
  if (!text) {
    showError('请先粘贴抖音分享口令或链接');
    input.focus();
    return;
  }

  setBusy(true);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text }),
      signal: controller.signal,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      showError('服务返回异常，请确认已通过 npm start 启动后端');
      return;
    }
    if (!json.ok) {
      showError(json.error || '解析失败，请重试');
      return;
    }
    renderResult(json.data);
    await loadHistory();
  } catch (err) {
    if (err && err.name === 'AbortError') {
      showError('解析超时，请重试或检查链接是否公开可见');
    } else if (err instanceof TypeError) {
      showError('无法连接服务器，请确认服务已启动，或稍后重试');
    } else {
      showError('网络异常，请稍后重试');
    }
  } finally {
    clearTimeout(timer);
    setBusy(false);
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  doParse();
});

btnPaste.addEventListener('click', async () => {
  showError('');
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      showError('剪贴板为空');
      return;
    }
    input.value = text.trim();
    input.focus();
    doParse();
  } catch {
    showError('无法读取剪贴板，请手动粘贴（Ctrl/⌘ + V）');
    input.focus();
  }
});

btnClear.addEventListener('click', async () => {
  try {
    await fetch('/api/history', { method: 'DELETE' });
    await loadHistory();
  } catch {
    showError('清空失败');
  }
});

// 键盘：Cmd/Ctrl + Enter 提交
input.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    doParse();
  }
});

// 自动识别：输入后停顿 400ms 且像链接则自动解析
let autoTimer = null;
input.addEventListener('input', () => {
  showError('');
  clearTimeout(autoTimer);
  const v = input.value.trim();
  if (!/https?:\/\//i.test(v) && !/^\d{6,}$/.test(v)) return;
  autoTimer = setTimeout(() => doParse(), 600);
});

// 平台提示：mac / win 键帽
if (/Mac|iPhone|iPad/.test(navigator.platform || '')) {
  btnPaste.querySelector('kbd').textContent = '⌘V';
} else {
  btnPaste.querySelector('kbd').textContent = 'Ctrl+V';
}

// 走公网访问时，在页脚加一行说明
(function markPublic() {
  const host = location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  if (isLocal) return;
  const tip = document.createElement('p');
  tip.style.marginTop = '8px';
  tip.textContent = `当前为公开访问：${location.origin}`;
  const foot = document.querySelector('.foot p');
  if (foot) foot.after(tip);
})();

loadHistory();
