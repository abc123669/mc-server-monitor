// MC Server Monitor - Search Page
let searchTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('searchInput');
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(doSearch, 300);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimer);
      doSearch();
    }
  });
  // Focus input
  input.focus();
});

async function doSearch() {
  const q = document.getElementById('searchInput').value.trim();
  const hint = document.getElementById('searchHint');
  const results = document.getElementById('searchResults');
  const grid = document.getElementById('resultGrid');
  const count = document.getElementById('resultCount');

  if (!q) {
    hint.style.display = 'block';
    results.style.display = 'none';
    return;
  }

  hint.style.display = 'none';
  results.style.display = 'block';
  grid.innerHTML = '<div class="loading"><div class="spinner"></div><p>搜索中...</p></div>';

  try {
    const res = await fetch(`/api/servers?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    renderSearchResults(data, q, grid, count);
  } catch (e) {
    grid.innerHTML = '<div class="search-page-empty"><h3>搜索出错了</h3><p>请检查网络后重试</p></div>';
  }
}

function renderSearchResults(list, query, grid, count) {
  if (!list || list.length === 0) {
    grid.innerHTML = `
      <div class="search-page-empty" style="grid-column:1/-1">
        <div class="hint-icon" style="margin-bottom:12px"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="8" y1="8" x2="14" y2="14"/></svg></div>
        <h3>没找到「${escHtml(query)}」相关的结果</h3>
        <p>试试其他关键词，或者去首页看看有哪些服务器</p>
      </div>`;
    count.textContent = '0 个结果';
    return;
  }

  count.textContent = `找到 ${list.length} 个服务器`;
  grid.innerHTML = list.map(s => {
    const isOnline = s.online === 1;
    const statusClass = s.online === null ? 'checking' : (isOnline ? 'online' : 'offline');
    const ipColon = s.port && s.port !== 25565 ? `${s.ip}:${s.port}` : s.ip;
    const isDormant = s.status === 'dormant';

    return `
      <div class="server-card" onclick="location.href='/'">
        <div class="top">
          <span class="name">${escHtml(s.name)}</span>
          ${isDormant ? '<span style="font-size:11px;color:#9aa0a6;background:#f1f3f4;padding:2px 8px;border-radius:10px">休眠</span>' : `<span class="status-dot ${statusClass}"></span>`}
        </div>
        <div class="ip-row">
          <span>${escHtml(ipColon)}</span>
          <button class="copy-btn" onclick="event.stopPropagation(); copyIp('${escHtml(ipColon)}')" title="复制IP">📋</button>
        </div>
        <div class="desc">${escHtml(s.description || '暂无简介')}</div>
        <div class="meta">
          <span>👤 <span class="online-count">${s.players_online ?? '-'}</span>/${s.max_players ?? '-'}</span>
          <span>⚡ ${s.latency >= 0 ? s.latency + 'ms' : '-'}</span>
          ${s.version ? `<span>📦 ${escHtml(shortVersion(s.version))}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

function copyIp(ip) {
  navigator.clipboard.writeText(ip).then(() => {
    const btn = event.target;
    btn.textContent = '✅';
    setTimeout(() => btn.textContent = '📋', 1500);
  }).catch(() => {});
}

function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function shortVersion(v) {
  const m = v.match(/([\d.]+)/);
  return m ? m[1] : v.slice(0, 12);
}
