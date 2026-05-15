// MC Server Monitor - Main Page
let page = 1;
let hasMore = true;
let loading = false;
let observer = null;
const serverMap = new Map(); // id -> server object

// ====== Init ======
document.addEventListener('DOMContentLoaded', () => {
  loadMore();
  loadStats();
  // 不自动刷新列表（用户需手动刷新页面），只刷新统计
  setInterval(loadStats, 30000);
  // 设置无限滚动监听
  setupInfiniteScroll();
});

function setupInfiniteScroll() {
  observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && hasMore && !loading) loadMore();
  }, { rootMargin: '200px' });
  const sentinel = document.getElementById('sentinel');
  if (sentinel) observer.observe(sentinel);
}

// ====== Load More（分页请求） ======
async function loadMore() {
  if (loading || !hasMore) return;
  loading = true;
  document.getElementById('sentinel').innerHTML = '<div class="sentinel-inner"><div class="sentinel-spin"></div>加载中...</div>';

  try {
    const res = await fetch(`/api/servers?page=${page}&limit=10`);
    const data = await res.json();
    const grid = document.getElementById('serverGrid');

    // 首次加载空状态
    if (page === 1 && (!data.servers || data.servers.length === 0)) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="icon">🏗️</div>
          <h3>还没有收录任何服务器</h3>
          <p>点击顶部「＋收录」或去管理后台添加第一个服务器</p>
        </div>`;
      document.getElementById('sentinel').textContent = '';
      loading = false;
      return;
    }

    // 追加卡片
    grid.insertAdjacentHTML('beforeend', renderCards(data.servers));
    // 缓存服务器数据
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
          <p>请检查网络连接或刷新重试</p>
        </div>`;
    }
    document.getElementById('sentinel').textContent = '加载失败，请刷新页面';
  }
  loading = false;
}

// ====== 重置列表（新增服务器后调用） ======
function resetList() {
  page = 1;
  hasMore = true;
  serverMap.clear();
  document.getElementById('serverGrid').innerHTML = '';
  loadMore();
}

// ====== Load Stats ======
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    document.getElementById('totalServers').textContent = stats.total;
    document.getElementById('onlineServers').textContent = stats.online;

    // Online rate bar
    const rate = stats.total > 0 ? Math.round(stats.online / stats.total * 100) : 0;
    const bar = document.getElementById('rateBar');
    const pct = document.getElementById('ratePercent');
    bar.style.width = rate + '%';
    bar.className = 'rate-bar-fill' + (rate < 30 ? ' low' : rate < 60 ? ' mid' : '');
    pct.textContent = rate + '%';
  } catch (e) {}
}

// ====== Render Cards（返回 HTML，不操作 DOM） ======
function renderCards(list) {
  if (!list || list.length === 0) return '';
  return list.map(s => {
    const isOnline = s.online === 1;
    const statusClass = s.online === null ? 'checking' : (isOnline ? 'online' : 'offline');
    const ipColon = s.port && s.port !== 25565 ? `${s.ip}:${s.port}` : s.ip;

    return `
      <div class="server-card" onclick="openDetail(${s.id})">
        <div class="top">
          <span class="name">${escHtml(s.name)}</span>
          <span class="status-dot ${statusClass}"></span>
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

  // Show loading state in chart
  document.getElementById('chartContainer').innerHTML = '<div class="chart-loading">⏳ 加载历史数据...</div>';

  // Show overlay FIRST so animation runs while data loads
  document.getElementById('detailOverlay').classList.add('active');

  // Load 24h history by default (after overlay shown to avoid blank flash)
  await loadHistory(id, '24h');
}

function closeDetail(e) {
  if (e && e.target !== document.getElementById('detailOverlay')) return;
  document.getElementById('detailOverlay').classList.remove('active');
  if (chartTimer) clearTimeout(chartTimer);
}

async function loadHistory(id, range) {
  // Update range button style
  document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.range-btn[data-range="${range}"]`)?.classList.add('active');

  try {
    const container = document.getElementById('chartContainer');
    container.innerHTML = '<div class="chart-loading">⏳ 加载中...</div>';

    const res = await fetch(`/api/servers/${id}/history?range=${range}`);
    const data = await res.json();

    document.getElementById('detailUptime').textContent = `${data.uptime}% (${data.online}/${data.total} 次在线)`;

    if (!data.rows || data.rows.length === 0) {
      container.innerHTML = '<div class="chart-loading" style="padding:24px">暂无数据 — 服务器刚收录，等待首次检测</div>';
      document.getElementById('peakPlayers').textContent = '-';
      document.getElementById('tlStart').textContent = '-';
      document.getElementById('tlEnd').textContent = '-';
      return;
    }

    // Calc peak players
    let peak = 0;
    data.rows.forEach(r => {
      if (r.online && r.players_online > peak) peak = r.players_online;
    });
    document.getElementById('peakPlayers').textContent = peak;

    // Subsample based on screen width (fewer bars on mobile)
    let barCount = window.innerWidth < 600 ? 80 : 180;
    let bars = data.rows;
    if (bars.length > barCount) {
      const step = Math.floor(bars.length / barCount);
      bars = bars.filter((_, i) => i % step === 0);
    }

    // Reverse: 最新时间在左，最早时间在右（从左往右显示当前→过去）
    bars = bars.reverse();

    // Time labels (reversed: first bar = newest, last bar = oldest)

    // Time labels
    const firstTime = data.rows[0].checked_at;
    const lastTime = data.rows[data.rows.length - 1].checked_at;
    // Bars reversed: 最新在左，最旧在右 → 左标签=lastTime(最新), 右标签=firstTime(最旧)
    document.getElementById('tlStart').textContent = formatTime(lastTime);
    document.getElementById('tlEnd').textContent = formatTime(firstTime);

    // Determine max height reference (cap at 30 players for scale, but at least 5)
    const maxH = Math.max(peak, 5);

    container.innerHTML = bars.map(b => {
      const isOnline = b.online === 1;
      // Height: proportional to players_online, capped, min 6px for online
      const pct = isOnline ? Math.max(8, (b.players_online / maxH) * 100) : 4;
      const tooltipText = isOnline
        ? `${b.players_online} 人在线 · ${formatTime(b.checked_at)}`
        : `离线 · ${formatTime(b.checked_at)}`;

      return `<div class="chart-bar ${isOnline ? 'online' : 'offline'}"
                   style="height:${pct}%"
                   title="">
                <span class="bar-tooltip">${escHtml(tooltipText)}</span>
              </div>`;
    }).join('');
  } catch (e) {
    document.getElementById('chartContainer').innerHTML = '<div class="chart-loading" style="color:var(--red)">⚠️ ' + escHtml(String(e.message || e)) + '</div>';
    console.error('History load failed:', e);
  }
}

// Setup range button listeners
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
  // Trim Minecraft version string like "Paper 1.21.4" or "1.21.1"
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

// ====== Public Add Server Modal ======
function openAddModal() {
  document.getElementById('addModalOverlay').classList.add('active');
  document.getElementById('addName').value = '';
  document.getElementById('addIp').value = '';
  document.getElementById('addPort').value = '25565';
  document.getElementById('addDesc').value = '';
  document.getElementById('addResult').style.display = 'none';
  document.getElementById('addSubmitBtn').disabled = false;
  document.getElementById('addSubmitBtn').textContent = '提交收录';
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

  if (!name) { resultEl.textContent = '❌ 请输入服务器名称'; resultEl.style.color = 'var(--red)'; return; }
  if (!ip) { resultEl.textContent = '❌ 请输入IP地址'; resultEl.style.color = 'var(--red)'; return; }

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
      resultEl.textContent = '✅ ' + (data.message || '收录成功！');
      resultEl.style.color = 'var(--green)';
      setTimeout(() => { closeAddModal(); resetList(); loadStats(); }, 1500);
    } else if (res.status === 409) {
      resultEl.textContent = '⚠️ ' + (data.error || '该服务器已被收录');
      resultEl.style.color = 'var(--orange)';
      btn.disabled = false;
      btn.textContent = '提交收录';
    } else {
      resultEl.textContent = '❌ ' + (data.error || '提交失败');
      resultEl.style.color = 'var(--red)';
      btn.disabled = false;
      btn.textContent = '提交收录';
    }
  } catch (e) {
    resultEl.textContent = '❌ 网络错误，请重试';
    resultEl.style.color = 'var(--red)';
    btn.disabled = false;
    btn.textContent = '提交收录';
  }
}
