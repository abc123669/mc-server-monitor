// MC Server Monitor — Apple Glassmorphism
let page = 1;
let hasMore = true;
let loading = false;
let observer = null;
const serverMap = new Map();
let detailId = null;
let chartTimer = null;

// SVG Icons
const ICONS = {
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  person: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  bolt: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  box: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  peak: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  chart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
};

// ====== Init ======
document.addEventListener('DOMContentLoaded', () => {
  loadMore();
  loadStats();
  setInterval(loadStats, 30000);
  setupInfiniteScroll();
  setupTiltEffects();
});

function setupInfiniteScroll() {
  observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && hasMore && !loading) loadMore();
  }, { rootMargin: '200px' });
  const sentinel = document.getElementById('sentinel');
  if (sentinel) observer.observe(sentinel);
}

// ====== 3D Tilt Effect ======
function setupTiltEffects() {
  document.addEventListener('mouseover', e => {
    const card = e.target.closest('.server-card');
    if (!card || card.dataset.tilt === 'done') return;
    card.dataset.tilt = 'done';
    card.classList.add('tilt-active');

    let timeout;
    card.addEventListener('mousemove', ev => {
      clearTimeout(timeout);
      const rect = card.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const rx = ((y - cy) / cy) * -15;
      const ry = ((x - cx) / cx) * 15;
      card.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.04,1.04,1.04)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
    });
  });
}

// ====== Load More ======
async function loadMore() {
  if (loading || !hasMore) return;
  loading = true;
  document.getElementById('sentinel').innerHTML = '<div class="sentinel-inner"><div class="sentinel-spin"></div>加载中...</div>';

  try {
    const res = await fetch(`/api/servers?page=${page}&limit=10`);
    const data = await res.json();
    const grid = document.getElementById('serverGrid');

    if (page === 1 && (!data.servers || data.servers.length === 0)) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="icon">⛏</div>
          <h3>还没收录服务器</h3>
          <p>点击顶部「+ 收录」分享你发现的服务器</p>
        </div>`;
      document.getElementById('sentinel').textContent = '';
      loading = false;
      return;
    }

    grid.insertAdjacentHTML('beforeend', renderCards(data.servers));
    data.servers.forEach(s => serverMap.set(s.id, s));
    page++;
    hasMore = data.hasMore;
    const sentinel = document.getElementById('sentinel');
    if (hasMore) sentinel.innerHTML = '<div class="sentinel-inner"><div class="sentinel-spin"></div>加载更多...</div>';
    else sentinel.innerHTML = '<div class="sentinel-inner sentinel-end">— 已全部加载 —</div>';
  } catch (e) {
    if (page === 1) {
      document.getElementById('serverGrid').innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="icon">⚠️</div>
          <h3>加载失败</h3>
          <p>请刷新重试</p>
        </div>`;
    }
    document.getElementById('sentinel').textContent = '加载失败，请刷新';
  }
  loading = false;
}

function resetList() {
  page = 1;
  hasMore = true;
  serverMap.clear();
  document.getElementById('serverGrid').innerHTML = '';
  loadMore();
}

// ====== Stats ======
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    document.getElementById('totalServers').textContent = stats.total;
    document.getElementById('onlineServers').textContent = stats.online;

    const rate = stats.total > 0 ? Math.round(stats.online / stats.total * 100) : 0;
    const bar = document.getElementById('rateBar');
    const pct = document.getElementById('ratePercent');
    bar.style.width = rate + '%';
    bar.className = 'rate-bar-fill' + (rate < 30 ? ' low' : rate < 60 ? ' mid' : '');
    pct.textContent = rate + '%';
  } catch (e) {}
}

// ====== Render Cards ======
function renderCards(list) {
  if (!list || list.length === 0) return '';
  return list.map(s => {
    const isOnline = s.online === 1;
    const statusClass = s.online === null ? 'checking' : (isOnline ? 'online' : 'offline');
    const ipColon = s.port && s.port !== 25565 ? `${s.ip}:${s.port}` : s.ip;
    const onlineLabel = isOnline ? (s.players_online ?? '-') : '0';
    const latencyLabel = s.latency >= 0 ? s.latency + 'ms' : '-';
    const versionLabel = s.version ? shortVersion(s.version) : '';

    return `
      <div class="server-card" onclick="openDetail(${s.id})">
        <div class="top">
          <span class="name">${escHtml(s.name)}</span>
          <span class="status-dot ${statusClass}"></span>
        </div>
        <div class="ip-row">
          <span>${escHtml(ipColon)}</span>
          <button class="copy-btn" onclick="event.stopPropagation(); copyIp('${escHtml(ipColon)}')" title="复制 IP">${ICONS.copy}</button>
        </div>
        <div class="desc">${escHtml(s.description || '暂无简介')}</div>
        <div class="meta">
          <span>${ICONS.person} <span class="online-count">${onlineLabel}</span>/${s.max_players ?? '-'}</span>
          <span>${ICONS.bolt} ${latencyLabel}</span>
          ${versionLabel ? `<span>${ICONS.box} ${escHtml(versionLabel)}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ====== Detail ======
async function openDetail(id) {
  detailId = id;
  const s = serverMap.get(id);
  if (!s) return;

  const ipColon = s.port && s.port !== 25565 ? `${s.ip}:${s.port}` : s.ip;
  document.getElementById('detailName').textContent = s.name;
  document.getElementById('detailIp').textContent = ipColon;
  document.getElementById('detailDesc').textContent = s.description || '暂无简介';
  document.getElementById('detailOnline').textContent = s.players_online ?? '-';
  document.getElementById('detailLatency').textContent = s.latency >= 0 ? s.latency + 'ms' : '-';
  document.getElementById('detailVersion').textContent = s.version ? shortVersion(s.version) : '-';

  document.getElementById('chartContainer').innerHTML = '<div class="chart-loading">加载中...</div>';
  document.getElementById('detailOverlay').classList.add('active');

  await loadHistory(id, '24h');
}

function closeDetail(e) {
  if (e && e.target !== document.getElementById('detailOverlay')) return;
  document.getElementById('detailOverlay').classList.remove('active');
  if (chartTimer) clearTimeout(chartTimer);
}

async function loadHistory(id, range) {
  document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.range-btn[data-range="${range}"]`)?.classList.add('active');

  try {
    const container = document.getElementById('chartContainer');
    container.innerHTML = '<div class="chart-loading">加载中...</div>';

    const res = await fetch(`/api/servers/${id}/history?range=${range}`);
    const data = await res.json();

    document.getElementById('detailUptime').textContent = `${data.uptime}% (${data.online}/${data.total})`;

    if (!data.rows || data.rows.length === 0) {
      container.innerHTML = '<div class="chart-loading">暂无数据</div>';
      document.getElementById('peakPlayers').textContent = '-';
      document.getElementById('tlStart').textContent = '-';
      document.getElementById('tlEnd').textContent = '-';
      return;
    }

    let peak = 0;
    data.rows.forEach(r => {
      if (r.online && r.players_online > peak) peak = r.players_online;
    });
    document.getElementById('peakPlayers').textContent = peak;

    let barCount = window.innerWidth < 600 ? 80 : 180;
    let bars = data.rows;
    if (bars.length > barCount) {
      const step = Math.floor(bars.length / barCount);
      bars = bars.filter((_, i) => i % step === 0);
    }

    bars = bars.reverse();

    const firstTime = data.rows[0].checked_at;
    const lastTime = data.rows[data.rows.length - 1].checked_at;
    document.getElementById('tlStart').textContent = formatTime(lastTime);
    document.getElementById('tlEnd').textContent = formatTime(firstTime);

    const maxH = Math.max(peak, 5);

    container.innerHTML = bars.map(b => {
      const isOnline = b.online === 1;
      const pct = isOnline ? Math.max(8, (b.players_online / maxH) * 100) : 4;
      const tooltipText = isOnline
        ? `${b.players_online} 人在线 · ${formatTime(b.checked_at)}`
        : `离线 · ${formatTime(b.checked_at)}`;

      return `<div class="chart-bar ${isOnline ? 'online' : 'offline'}"
                   style="height:${pct}%">
                <span class="bar-tooltip">${escHtml(tooltipText)}</span>
              </div>`;
    }).join('');
  } catch (e) {
    document.getElementById('chartContainer').innerHTML = `<div class="chart-loading" style="color:var(--red)">加载失败</div>`;
  }
}

// Range button listeners
document.addEventListener('click', e => {
  const btn = e.target.closest('.range-btn');
  if (btn && detailId) {
    loadHistory(detailId, btn.dataset.range);
  }
});

// ====== Utils ======
function copyIp(ip) {
  navigator.clipboard.writeText(ip).then(() => {
    const btn = event.target;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34C759" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(() => btn.innerHTML = ICONS.copy, 1500);
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

function formatTime(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr.replace(' ', 'T'));
    if (isNaN(d.getTime())) return isoStr.slice(5, 16);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch (e) { return isoStr.slice(5, 16); }
}

// ====== Add Server Modal ======
function openAddModal() {
  document.getElementById('addModalOverlay').classList.add('active');
  document.getElementById('addName').value = '';
  document.getElementById('addIp').value = '';
  document.getElementById('addPort').value = '25565';
  document.getElementById('addDesc').value = '';
  document.getElementById('addResult').style.display = 'none';
  document.getElementById('addSubmitBtn').disabled = false;
  document.getElementById('addSubmitBtn').textContent = '提交';
}

function closeAddModal() {
  document.getElementById('addModalOverlay').classList.remove('active');
}

async function submitPublicAdd() {
  const name = document.getElementById('addName').value.trim();
  const ip = document.getElementById('addIp').value.trim();
  const port = parseInt(document.getElementById('addPort').value) || 25565;
  const desc = document.getElementById('addDesc').value.trim();

  const resultEl = document.getElementById('addResult');
  resultEl.style.display = 'block';

  if (!name) { resultEl.textContent = '请输入名称'; resultEl.style.color = 'var(--red)'; return; }
  if (!ip) { resultEl.textContent = '请输入 IP'; resultEl.style.color = 'var(--red)'; return; }

  const btn = document.getElementById('addSubmitBtn');
  btn.disabled = true;
  btn.textContent = '提交中...';

  try {
    const res = await fetch('/api/servers/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ip, port, description: desc })
    });
    const data = await res.json();
    if (res.ok) {
      resultEl.textContent = data.message || '收录成功！';
      resultEl.style.color = 'var(--green)';
      setTimeout(() => { closeAddModal(); resetList(); loadStats(); }, 1500);
    } else if (res.status === 409) {
      resultEl.textContent = data.error || '已被收录';
      resultEl.style.color = 'var(--orange)';
      btn.disabled = false;
      btn.textContent = '提交';
    } else {
      resultEl.textContent = data.error || '提交失败';
      resultEl.style.color = 'var(--red)';
      btn.disabled = false;
      btn.textContent = '提交';
    }
  } catch (e) {
    resultEl.textContent = '网络错误，请重试';
    resultEl.style.color = 'var(--red)';
    btn.disabled = false;
    btn.textContent = '提交';
  }
}
