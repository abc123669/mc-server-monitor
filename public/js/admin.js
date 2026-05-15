// MC Server Monitor - Admin Panel
let KEY = '';
let deleteTarget = null;

// ====== Login ======
async function verifyLogin() {
  const key = document.getElementById('adminKeyInput').value;
  const errEl = document.getElementById('loginError');
  if (!key) { errEl.textContent = '请输入管理密钥'; errEl.style.display = 'block'; return; }

  try {
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    if (data.valid) {
      KEY = key;
      document.getElementById('loginBox').style.display = 'none';
      document.getElementById('adminPanel').style.display = 'block';
      loadAdminServers();
    } else {
      errEl.textContent = '密钥错误，请重试';
      errEl.style.display = 'block';
    }
  } catch (e) {
    errEl.textContent = '网络错误，请检查连接';
    errEl.style.display = 'block';
  }
}

// ====== Load ======
async function loadAdminServers() {
  try {
    // Include all servers including dormant for admin view
    const res = await fetch('/api/servers?show=all');
    const list = await res.json();
    renderAdminTable(list);
  } catch (e) {
    document.getElementById('adminTbody').innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:var(--red);padding:32px">加载失败</td></tr>';
  }
}

function renderAdminTable(list) {
  const tbody = document.getElementById('adminTbody');
  if (!list || list.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:var(--text-tertiary);padding:32px">暂无服务器，点击右上角添加</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(s => {
    const isOnline = s.online === 1;
    const statusClass = s.online === null ? 'checking' : (isOnline ? 'online' : 'offline');
    const statusText = s.online === null ? '检测中' : (isOnline ? '在线' : '离线');
    const isDormant = s.status === 'dormant';
    const ipColon = s.port && s.port !== 25565 ? `${s.ip}:${s.port}` : s.ip;

    return `
      <tr${isDormant ? ' style="opacity:.55"' : ''}>
        <td><strong>${escHtml(s.name)}</strong>${isDormant ? ' <span style="font-size:11px;color:var(--text-tertiary)">💤休眠</span>' : ''}</td>
        <td style="font-family:'SF Mono','Fira Code',monospace;font-size:13px">${escHtml(ipColon)}</td>
        <td>${s.port || 25565}</td>
        <td><span class="status-dot ${statusClass}" style="display:inline-block;width:10px;height:10px;vertical-align:middle;margin-right:6px"></span>${statusText}</td>
        <td style="text-align:right">
          <div class="actions" style="justify-content:flex-end">
            <button class="edit-btn" onclick="openEditModal(${s.id})">编辑</button>
            <button class="del-btn" onclick="openDelModal(${s.id})">删除</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ====== Add / Edit Modal ======
function openAddModal() {
  document.getElementById('modalTitle').textContent = '添加服务器';
  document.getElementById('modalName').value = '';
  document.getElementById('modalIp').value = '';
  document.getElementById('modalPort').value = '25565';
  document.getElementById('modalDesc').value = '';
  document.getElementById('modalImage').value = '';
  document.getElementById('modalEditId').value = '';
  document.getElementById('modalSubmitBtn').textContent = '保存';
  document.getElementById('modalOverlay').classList.add('active');
}

async function openEditModal(id) {
  const s = await getServerById(id);
  if (!s) return;
  document.getElementById('modalTitle').textContent = '编辑服务器';
  document.getElementById('modalName').value = s.name;
  document.getElementById('modalIp').value = s.ip;
  document.getElementById('modalPort').value = s.port || 25565;
  document.getElementById('modalDesc').value = s.description || '';
  document.getElementById('modalImage').value = s.image_url || '';
  document.getElementById('modalEditId').value = id;
  document.getElementById('modalSubmitBtn').textContent = '更新';
  document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

async function submitModal() {
  const id = document.getElementById('modalEditId').value;
  const name = document.getElementById('modalName').value.trim();
  const ip = document.getElementById('modalIp').value.trim();
  const port = parseInt(document.getElementById('modalPort').value) || 25565;
  const desc = document.getElementById('modalDesc').value.trim();
  const image_url = document.getElementById('modalImage').value.trim();

  if (!name) { showToast('请输入服务器名称'); return; }
  if (!ip) { showToast('请输入IP地址'); return; }

  try {
    if (id) {
      // Edit
      await fetch(`/api/admin/servers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: KEY, name, ip, port, description: desc, image_url })
      });
      showToast('✅ 已更新');
    } else {
      // Add
      await fetch('/api/admin/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: KEY, name, ip, port, description: desc, image_url })
      });
      showToast('✅ 已添加');
    }
    closeModal();
    loadAdminServers();
  } catch (e) {
    showToast('❌ 操作失败');
  }
}

// ====== Delete ======
function openDelModal(id) {
  deleteTarget = id;
  const s = servers.find(x => x.id === id);
  document.getElementById('delModalName').textContent = `确定要删除「${s ? s.name : id}」吗？所有历史数据将被清除。`;
  document.getElementById('delModalOverlay').classList.add('active');
}

function closeDelModal() {
  deleteTarget = null;
  document.getElementById('delModalOverlay').classList.remove('active');
}

async function confirmDelete() {
  if (!deleteTarget) return;
  try {
    await fetch(`/api/admin/servers/${deleteTarget}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: KEY })
    });
    showToast('🗑️ 已删除');
    closeDelModal();
    loadAdminServers();
  } catch (e) {
    showToast('❌ 删除失败');
  }
}

// ====== Helpers ======
let servers = [];

async function getServerById(id) {
  try {
    const res = await fetch('/api/servers?show=all');
    servers = await res.json();
    return servers.find(s => s.id === id);
  } catch (e) {
    return null;
  }
}

function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}
