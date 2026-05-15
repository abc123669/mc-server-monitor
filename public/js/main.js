// MC Server Monitor - Apple Glassmorphism + Auth + Comments
let page = 1;
let hasMore = true;
let loading = false;
let observer = null;
const serverMap = new Map();
let detailId = null;
let isLoggedIn = false;
let currentUser = null;
let authMode = 'login';
let selectedRating = 0;

// SVG Icons
const ICONS = {
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  person: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  bolt: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  box: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34C759" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  star: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
};

// ====== Init ======
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  loadMore();
  loadStats();
  setInterval(loadStats, 30000);
  setupInfiniteScroll();
  setupTiltEffects();
  setupStarSelect();
});

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    isLoggedIn = data.loggedIn;
    currentUser = data.user;
    const btn = document.getElementById('userBtn');
    const name = document.getElementById('userName');
    if (isLoggedIn) {
      btn.onclick = logout;
      name.textContent = data.user.username;
      btn.classList.add('logged-in');
    } else {
      btn.onclick = openAuthModal;
      name.textContent = '登录';
      btn.classList.remove('logged-in');
    }
  } catch (e) {}
}

// ====== Captcha ======
async function loadCaptcha(target) {
  try {
    const res = await fetch('/api/captcha');
    const data = await res.json();
    const qEl = document.getElementById(target + 'CaptchaQuestion');
    const inputEl = document.getElementById(target + 'CaptchaInput');
    if (qEl) {
      qEl.textContent = data.a + ' + ' + data.b;
      qEl.dataset.token = data.token;
    }
    if (inputEl) { inputEl.value = ''; inputEl.focus(); }
  } catch (e) {}
}

function refreshAuthCaptcha() { loadCaptcha('auth'); }
function refreshAddCaptcha() { loadCaptcha('add'); }

function getCaptchaValue(target) {
  return document.getElementById(target + 'CaptchaInput')?.value || '';
}

// ====== Auth Modal ======
function openAuthModal() {
  authMode = 'login';
  document.getElementById('authTitle').textContent = '登录';
  document.getElementById('authToggle').textContent = '没有账号？注册';
  document.getElementById('authSubmitBtn').textContent = '登录';
  document.getElementById('authUser').value = '';
  document.getElementById('authPass').value = '';
  document.getElementById('authError').style.display = 'none';
  document.getElementById('authModalOverlay').classList.add('active');
  refreshAuthCaptcha();
  setTimeout(() => document.getElementById('authUser').focus(), 100);
}

function closeAuthModal() {
  document.getElementById('authModalOverlay').classList.remove('active');
}

function toggleAuthMode() {
  authMode = authMode === 'login' ? 'register' : 'login';
  document.getElementById('authTitle').textContent = authMode === 'login' ? '登录' : '注册';
  document.getElementById('authToggle').textContent = authMode === 'login' ? '没有账号？注册' : '已有账号？登录';
  document.getElementById('authSubmitBtn').textContent = authMode === 'login' ? '登录' : '注册';
  document.getElementById('authError').style.display = 'none';
}

async function submitAuth() {
  const username = document.getElementById('authUser').value.trim();
  const password = document.getElementById('authPass').value;
  const captcha = getCaptchaValue('auth');
  const errEl = document.getElementById('authError');

  if (!username || !password) {
    errEl.textContent = '请填写完整';
    errEl.style.display = 'block';
    return;
  }
  if (!captcha) {
    errEl.textContent = '请输入验证码';
    errEl.style.display = 'block';
    return;
  }

  const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = true;
  btn.textContent = authMode === 'login' ? '登录中...' : '注册中...';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, captcha })
    });
    const data = await res.json();
    if (res.ok) {
      closeAuthModal();
      await checkAuth();
    } else {
      errEl.textContent = data.error || '操作失败';
      errEl.style.display = 'block';
      if (data.error === '验证码错误') refreshAuthCaptcha();
      btn.disabled = false;
      btn.textContent = authMode === 'login' ? '登录' : '注册';
    }
  } catch (e) {
    errEl.textContent = '网络错误';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? '登录' : '注册';
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  isLoggedIn = false;
  currentUser = null;
  const btn = document.getElementById('userBtn');
  btn.onclick = openAuthModal;
  document.getElementById('userName').textContent = '登录';
  btn.classList.remove('logged-in');
}

function setupInfiniteScroll() {
  observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && hasMore && !loading) loadMore();
  }, { rootMargin: '200px' });
  const sentinel = document.getElementById('sentinel');
  if (sentinel) observer.observe(sentinel);
}

// ====== 3D Tilt (desktop only — disabled on touch) ======
function setupTiltEffects() {
  if ('ontouchstart' in window) return; // Skip on mobile/tablet
  document.addEventListener('mouseover', e => {
    const card = e.target.closest('.server-card');
    if (!card || card.dataset.tilt === 'done') return;
    card.dataset.tilt = 'done';
    card.classList.add('tilt-active');
    card.addEventListener('mousemove', ev => {
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
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">⛏</div><h3>还没收录服务器</h3><p>点击「+ 收录」分享你发现的服务器</p></div>';
      document.getElementById('sentinel').textContent = '';
      loading = false; return;
    }
    grid.insertAdjacentHTML('beforeend', renderCards(data.servers));
    data.servers.forEach(s => serverMap.set(s.id, s));
    page++;
    hasMore = data.hasMore;
    const s = document.getElementById('sentinel');
    if (hasMore) s.innerHTML = '<div class="sentinel-inner"><div class="sentinel-spin"></div>加载更多...</div>';
    else s.innerHTML = '<div class="sentinel-inner sentinel-end">— 已全部加载 —</div>';
  } catch (e) {
    if (page === 1) document.getElementById('serverGrid').innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">⚠️</div><h3>加载失败</h3><p>请刷新重试</p></div>';
    document.getElementById('sentinel').textContent = '加载失败';
  }
  loading = false;
}

function resetList() { page = 1; hasMore = true; serverMap.clear(); document.getElementById('serverGrid').innerHTML = ''; loadMore(); }

// ====== Stats ======
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    document.getElementById('totalServers').textContent = stats.total;
    document.getElementById('onlineServers').textContent = stats.online;
    const rate = stats.total > 0 ? Math.round(stats.online / stats.total * 100) : 0;
    const bar = document.getElementById('rateBar');
    document.getElementById('ratePercent').textContent = rate + '%';
    bar.style.width = rate + '%';
    bar.className = 'rate-bar-fill' + (rate < 30 ? ' low' : rate < 60 ? ' mid' : '');
  } catch (e) {}
}

// ====== Render Cards ======
function renderStars(rating) {
  const r = Math.round(rating || 1);
  return '<span class="stars-inline">' + '★'.repeat(r) + '☆'.repeat(5 - r) + '</span>';
}

function renderCards(list) {
  if (!list || list.length === 0) return '';
  return list.map(s => {
    const isOnline = s.online === 1;
    const statusClass = s.online === null ? 'checking' : (isOnline ? 'online' : 'offline');
    const ipColon = s.port && s.port !== 25565 ? `${s.ip}:${s.port}` : s.ip;
    const onlineLabel = isOnline ? (s.players_online ?? '-') : '0';
    const latencyLabel = s.latency >= 0 ? s.latency + 'ms' : '-';
    const versionLabel = s.version ? shortVersion(s.version) : '';
    const rating = s.avg_rating || 1.0;
    return `
      <div class="server-card" onclick="openDetail(${s.id})">
        ${s.image_url ? `<div class="card-banner"><img src="${escHtml(s.image_url)}" alt="" loading="lazy"></div>` : ''}
        <div class="top">
          <span class="name">${escHtml(s.name)}</span>
          <span class="status-dot ${statusClass}"></span>
        </div>
        <div class="ip-row">
          <span>${escHtml(ipColon)}</span>
          <button class="copy-btn" onclick="event.stopPropagation(); copyIp('${escHtml(ipColon)}')" title="复制 IP">${ICONS.copy}</button>
        </div>
        <div class="stars-row">${renderStars(rating)} <span class="rating-num">${rating.toFixed(1)}</span></div>
        <div class="desc">${escHtml(stripHtml(s.description || '暂无简介'))}</div>
        <div class="meta">
          <span>${ICONS.person} <span class="online-count">${onlineLabel}</span>/${s.max_players ?? '-'}</span>
          <span>${ICONS.bolt} ${latencyLabel}</span>
          ${versionLabel ? `<span>${ICONS.box} ${escHtml(versionLabel)}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

function stripHtml(s) { return s.replace(/<[^>]*>/g, ''); }

// ====== Detail ======
async function openDetail(id) {
  detailId = id;
  const s = serverMap.get(id);
  if (!s) return;

  const ipColon = s.port && s.port !== 25565 ? `${s.ip}:${s.port}` : s.ip;
  document.getElementById('detailName').textContent = s.name;
  document.getElementById('detailIp').textContent = ipColon;
  document.getElementById('detailDesc').innerHTML = s.description || '暂无简介';
  document.getElementById('detailOnline').textContent = s.players_online ?? '-';
  document.getElementById('detailLatency').textContent = s.latency >= 0 ? s.latency + 'ms' : '-';
  document.getElementById('detailVersion').textContent = s.version ? shortVersion(s.version) : '-';

  // Image
  const imgWrap = document.getElementById('detailImageWrap');
  const img = document.getElementById('detailImage');
  if (s.image_url) {
    imgWrap.style.display = 'block';
    img.src = s.image_url;
  } else {
    imgWrap.style.display = 'none';
  }

  // Stars
  const starsEl = document.getElementById('detailStars');
  const labelEl = document.getElementById('detailRatingLabel');
  const rating = s.avg_rating || 1.0;
  const count = s.comment_count || 0;
  starsEl.innerHTML = renderStars(rating);
  labelEl.textContent = `${rating.toFixed(1)} (${count} 评)`;

  document.getElementById('chartContainer').innerHTML = '<div class="chart-loading">加载中...</div>';
  document.getElementById('detailOverlay').classList.add('active');

  // Load comments
  loadComments(id);

  // Reset star select
  selectedRating = 0;
  document.querySelectorAll('#starSelect .star').forEach(el => el.className = 'star star-empty');
  document.getElementById('commentInput').value = '';
  document.getElementById('commentError').style.display = 'none';

  await loadHistory(id, '24h');
}

function closeDetail(e) {
  if (e && e.target !== document.getElementById('detailOverlay')) return;
  document.getElementById('detailOverlay').classList.remove('active');
  if (chartTimer) clearTimeout(chartTimer);
}

// ====== Comments ======
function setupStarSelect() {
  document.getElementById('starSelect')?.addEventListener('click', e => {
    const star = e.target.closest('.star');
    if (!star) return;
    const val = parseInt(star.dataset.val);
    selectedRating = val;
    document.querySelectorAll('#starSelect .star').forEach(el => {
      const v = parseInt(el.dataset.val);
      el.className = v <= val ? 'star star-filled' : 'star star-empty';
    });
  });
}

async function loadComments(serverId) {
  const listEl = document.getElementById('commentList');
  const countEl = document.getElementById('commentCount');
  const formEl = document.getElementById('commentForm');
  try {
    const res = await fetch(`/api/servers/${serverId}/comments`);
    const data = await res.json();
    countEl.textContent = data.count;

    // Show/hide form
    formEl.style.display = isLoggedIn ? 'block' : 'none';

    if (!data.comments || data.comments.length === 0) {
      listEl.innerHTML = '<div class="comment-empty">暂无评论</div>';
      return;
    }
    listEl.innerHTML = data.comments.map(c => `
      <div class="comment-item">
        <div class="comment-head">
          <span class="comment-user">${escHtml(c.username)}</span>
          <span class="comment-stars">${'★'.repeat(c.rating)}${'☆'.repeat(5-c.rating)}</span>
          <span class="comment-time">${formatTimeAgo(c.created_at)}</span>
        </div>
        <div class="comment-body">${escHtml(c.content)}</div>
      </div>
    `).join('');
  } catch (e) {
    listEl.innerHTML = '<div class="comment-empty">加载评论失败</div>';
  }
}

async function submitComment() {
  if (!isLoggedIn) { showCommentError('请先登录'); return; }
  const content = document.getElementById('commentInput').value.trim();
  if (!selectedRating) { showCommentError('请选择星级'); return; }
  if (!content) { showCommentError('请输入评论'); return; }

  const btn = document.getElementById('commentSubmitBtn');
  btn.disabled = true;
  btn.textContent = '发表中...';
  try {
    const res = await fetch(`/api/servers/${detailId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: selectedRating, content })
    });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('commentInput').value = '';
      selectedRating = 0;
      document.querySelectorAll('#starSelect .star').forEach(el => el.className = 'star star-empty');
      document.getElementById('commentError').style.display = 'none';
      loadComments(detailId);
      // Refresh server data for new rating
      const sRes = await fetch(`/api/servers?show=all&page=1&limit=1`);
      const sData = await sRes.json();
      if (sData.servers) sData.servers.forEach(s => serverMap.set(s.id, s));
    } else {
      showCommentError(data.error || '发表失败');
    }
  } catch (e) { showCommentError('网络错误'); }
  btn.disabled = false;
  btn.textContent = '发表';
}

function showCommentError(msg) {
  const el = document.getElementById('commentError');
  el.textContent = msg;
  el.style.display = 'block';
}

// Character count
document.addEventListener('input', e => {
  if (e.target.id === 'commentInput') {
    document.getElementById('charCount').textContent = e.target.value.length + '/500';
  }
});

// ====== History Chart ======
let chartTimer;

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
    data.rows.forEach(r => { if (r.online && r.players_online > peak) peak = r.players_online; });
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
      const tooltipText = isOnline ? `${b.players_online} 人在线 · ${formatTime(b.checked_at)}` : `离线 · ${formatTime(b.checked_at)}`;
      return `<div class="chart-bar ${isOnline ? 'online' : 'offline'}" style="height:${pct}%"><span class="bar-tooltip">${escHtml(tooltipText)}</span></div>`;
    }).join('');
  } catch (e) {
    document.getElementById('chartContainer').innerHTML = '<div class="chart-loading" style="color:var(--red)">加载失败</div>';
  }
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.range-btn');
  if (btn && detailId) loadHistory(detailId, btn.dataset.range);
});

// ====== Add Server Modal ======
function openAddModal() {
  if (!isLoggedIn) {
    openAuthModal();
    return;
  }
  document.getElementById('addModalOverlay').classList.add('active');
  document.getElementById('addName').value = '';
  document.getElementById('addIp').value = '';
  document.getElementById('addPort').value = '25565';
  document.getElementById('addDesc').value = '';
  document.getElementById('addImage').value = '';
  document.getElementById('addResult').style.display = 'none';
  document.getElementById('addSubmitBtn').disabled = false;
  document.getElementById('addSubmitBtn').textContent = '提交';
  refreshAddCaptcha();
}

function closeAddModal() {
  document.getElementById('addModalOverlay').classList.remove('active');
}

async function submitPublicAdd() {
  const name = document.getElementById('addName').value.trim();
  const ip = document.getElementById('addIp').value.trim();
  const port = parseInt(document.getElementById('addPort').value) || 25565;
  const desc = document.getElementById('addDesc').value.trim();
  const image_url = document.getElementById('addImage').value.trim();
  const captcha = getCaptchaValue('add');

  const resultEl = document.getElementById('addResult');
  resultEl.style.display = 'block';
  if (!name) { resultEl.textContent = '请输入名称'; resultEl.style.color = 'var(--red)'; return; }
  if (!ip) { resultEl.textContent = '请输入 IP'; resultEl.style.color = 'var(--red)'; return; }
  if (!captcha) { resultEl.textContent = '请输入验证码'; resultEl.style.color = 'var(--red)'; return; }

  const btn = document.getElementById('addSubmitBtn');
  btn.disabled = true; btn.textContent = '提交中...';
  try {
    const res = await fetch('/api/servers/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ip, port, description: desc, image_url, captcha })
    });
    const data = await res.json();
    if (res.ok) {
      resultEl.textContent = data.message || '收录成功！';
      resultEl.style.color = 'var(--green)';
      setTimeout(() => { closeAddModal(); resetList(); loadStats(); }, 1500);
    } else if (res.status === 409) {
      resultEl.textContent = data.error || '已被收录';
      resultEl.style.color = 'var(--orange)';
      btn.disabled = false; btn.textContent = '提交';
    } else {
      resultEl.textContent = data.error || '提交失败';
      resultEl.style.color = 'var(--red)';
      btn.disabled = false; btn.textContent = '提交';
      if (data.error === '验证码错误') refreshAddCaptcha();
    }
  } catch (e) {
    resultEl.textContent = '网络错误';
    resultEl.style.color = 'var(--red)';
    btn.disabled = false; btn.textContent = '提交';
  }
}

// ====== Utils ======
function copyIp(ip) {
  navigator.clipboard.writeText(ip).then(() => {
    const btn = event.target;
    btn.innerHTML = ICONS.check;
    setTimeout(() => btn.innerHTML = ICONS.copy, 1500);
  }).catch(() => {});
}

function escHtml(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function shortVersion(v) { const m = v.match(/([\d.]+)/); return m ? m[1] : v.slice(0, 12); }

function formatTime(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr.replace(' ', 'T'));
    if (isNaN(d.getTime())) return isoStr.slice(5, 16);
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  } catch (e) { return isoStr.slice(5, 16); }
}

function formatTimeAgo(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr.replace(' ', 'T'));
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff/60) + '分钟前';
    if (diff < 86400) return Math.floor(diff/3600) + '小时前';
    if (diff < 2592000) return Math.floor(diff/86400) + '天前';
    return isoStr.slice(5, 10);
  } catch (e) { return isoStr.slice(5, 16); }
}
