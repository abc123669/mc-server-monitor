const express = require('express');
const Database = require('better-sqlite3');
const { status } = require('minecraft-server-util');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5001;
const CHECK_INTERVAL = 5 * 60 * 1000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'yqadmin123669';
const SYNC_SECRET = process.env.SYNC_SECRET || 'sync-mc-2026';

// Database
const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, ip TEXT NOT NULL, port INTEGER DEFAULT 25565,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'active', dormancy_started_at DATETIME, last_online_at DATETIME,
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    updated_at DATETIME DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS check_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL, online INTEGER DEFAULT 0,
    players_online INTEGER DEFAULT 0, max_players INTEGER DEFAULT 0,
    latency INTEGER DEFAULT -1, version TEXT DEFAULT '', motd TEXT DEFAULT '',
    checked_at DATETIME DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (server_id) REFERENCES servers(id)
  );
  CREATE INDEX IF NOT EXISTS idx_check_server ON check_logs(server_id);
  CREATE INDEX IF NOT EXISTS idx_check_time ON check_logs(checked_at);
`);
try { db.exec("ALTER TABLE servers ADD COLUMN status TEXT DEFAULT 'active'"); } catch(e) {}
try { db.exec("ALTER TABLE servers ADD COLUMN dormancy_started_at DATETIME"); } catch(e) {}
try { db.exec("ALTER TABLE servers ADD COLUMN last_online_at DATETIME"); } catch(e) {}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== API: 获取服务器列表（支持分页） =====
app.get('/api/servers', (req, res) => {
  const { q, show, page, limit } = req.query;
  let where = "s.status = 'active'";
  if (show === 'all') where = "s.status IN ('active','dormant')";
  if (q && q.trim()) {
    const s = q.trim();
    where = `(s.status='active' OR s.status='dormant') AND (s.name LIKE '%${s}%' OR s.ip LIKE '%${s}%' OR s.description LIKE '%${s}%')`;
  }
  const baseQuery = `SELECT s.*,cl.online,cl.players_online,cl.max_players,cl.latency,cl.version,cl.checked_at FROM servers s LEFT JOIN (SELECT server_id,online,players_online,max_players,latency,version,checked_at FROM check_logs WHERE id IN (SELECT MAX(id) FROM check_logs GROUP BY server_id)) cl ON s.id=cl.server_id WHERE ${where}`;

  // 分页模式：?page=1&limit=10
  if (page) {
    const p = Math.max(1, parseInt(page) || 1);
    const l = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const offset = (p - 1) * l;
    const total = db.prepare(`SELECT COUNT(*) as c FROM servers s WHERE ${where}`).get().c;
    const rows = db.prepare(`${baseQuery} ORDER BY cl.online DESC, cl.players_online DESC LIMIT ? OFFSET ?`).all(l, offset);
    return res.json({ servers: rows, total, page: p, hasMore: offset + l < total });
  }

  // 旧模式（搜索页使用）：返回完整数组
  res.json(db.prepare(`${baseQuery} ORDER BY cl.online DESC, cl.players_online DESC`).all());
});

// ===== API: 历史记录 =====
app.get('/api/servers/:id/history', (req, res) => {
  const { range } = req.query;
  let hours = 24; if (range === '7d') hours = 168; if (range === '30d') hours = 720;
  const rows = db.prepare(`SELECT online,players_online,latency,checked_at FROM check_logs WHERE server_id=? AND checked_at>=datetime('now','localtime','-${hours} hours') ORDER BY checked_at ASC`).all(req.params.id);
  const total = rows.length;
  const onlineCount = rows.filter(r => r.online).length;
  res.json({ rows, uptime: total > 0 ? (onlineCount / total * 100).toFixed(1) : 0, total, online: onlineCount });
});

// ===== API: 管理员添加 =====
app.post('/api/admin/servers', (req, res) => {
  const { key, name, ip, port, description } = req.body;
  if (key !== ADMIN_KEY) return res.status(403).json({ error: '密钥错误' });
  if (!name || !ip) return res.status(400).json({ error: '名称和IP不能为空' });
  const r = db.prepare('INSERT INTO servers (name,ip,port,description) VALUES (?,?,?,?)').run(name, ip, port || 25565, description || '');
  res.json({ id: r.lastInsertRowid });
});

// ===== API: 公开添加（需在线验证） =====
app.post('/api/servers/add', async (req, res) => {
  const { name, ip, port, description } = req.body;
  if (!name || !ip) return res.status(400).json({ error: '名称和IP不能为空' });
  if (name.length > 50 || ip.length > 200) return res.status(400).json({ error: '参数过长' });
  try {
    const result = await status(ip.trim(), port || 25565, { timeout: 8000 });
    if (!result || !result.version) return res.status(400).json({ error: '无法连接该服务器' });
  } catch { return res.status(400).json({ error: '检测失败：服务器不在线或无法连接' }); }
  if (db.prepare('SELECT id FROM servers WHERE ip=? AND port=?').get(ip.trim(), port || 25565))
    return res.status(409).json({ error: '该服务器已被收录过了！' });
  const r = db.prepare('INSERT INTO servers (name,ip,port,description) VALUES (?,?,?,?)').run(name.trim(), ip.trim(), port || 25565, (description || '').trim());
  res.json({ id: r.lastInsertRowid, message: '✅ 收录成功！已开始持续监控。' });
});

// ===== API: 编辑 =====
app.put('/api/admin/servers/:id', (req, res) => {
  const { key, name, ip, port, description } = req.body;
  if (key !== ADMIN_KEY) return res.status(403).json({ error: '密钥错误' });
  db.prepare('UPDATE servers SET name=?,ip=?,port=?,description=?,updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(name, ip, port || 25565, description || '', req.params.id);
  res.json({ ok: true });
});

// ===== API: 删除 =====
app.delete('/api/admin/servers/:id', (req, res) => {
  const { key } = req.body;
  if (key !== ADMIN_KEY) return res.status(403).json({ error: '密钥错误' });
  db.prepare('DELETE FROM check_logs WHERE server_id=?').run(req.params.id);
  db.prepare('DELETE FROM servers WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ===== API: 验证管理员 =====
app.post('/api/admin/verify', (req, res) => {
  res.json({ valid: req.body.key === ADMIN_KEY });
});

// ===== API: 统计（仅统计15分钟内检测过的服务器） =====
app.get('/api/stats', (req, res) => {
  const total = db.prepare("SELECT COUNT(*) as c FROM servers WHERE status='active'").get();
  const online = db.prepare("SELECT COUNT(*) as c FROM servers s JOIN check_logs cl ON cl.id=(SELECT MAX(id) FROM check_logs WHERE server_id=s.id AND checked_at>=datetime('now','localtime','-15 minutes')) WHERE s.status='active' AND cl.online=1").get();
  res.json({ total: total.c, online: online.c });
});

// ==========================================
// MC 服务器检测服务
// ==========================================

// ===== API: 同步检测结果（从本地推送到云端） =====
app.post('/api/sync/check_results', (req, res) => {
  const { results, secret } = req.body;
  if (secret !== SYNC_SECRET) return res.status(403).json({ error: 'invalid' });

  const insertLog = db.prepare('INSERT INTO check_logs (server_id,online,players_online,max_players,latency,version,motd) VALUES (?,?,?,?,?,?,?)');
  const updateOnline = db.prepare("UPDATE servers SET last_online_at=datetime('now','localtime') WHERE id=?");

  const tx = db.transaction(() => {
    for (const r of results) {
      insertLog.run(r.id, r.online ? 1 : 0, r.players_online || 0, r.max_players || 0, r.latency || -1, r.version || '', r.motd || '');
      if (r.online) updateOnline.run(r.id);
    }
  });
  tx();

  res.json({ ok: true, count: results.length });
});

async function checkServer(server) {
  try {
    const result = await status(server.ip, server.port, { timeout: 8000 });
    db.prepare('INSERT INTO check_logs (server_id,online,players_online,max_players,latency,version,motd) VALUES (?,1,?,?,?,?,?)').run(server.id, result.players.online || 0, result.players.max || 0, Math.round(result.roundTripLatency || 0), result.version.name || '', result.motd.html || '');
    db.prepare("UPDATE servers SET last_online_at=datetime('now','localtime') WHERE id=?").run(server.id);
    return { id: server.id, online: true, players: result.players.online };
  } catch {
    db.prepare('INSERT INTO check_logs (server_id,online) VALUES (?,0)').run(server.id);
    return { id: server.id, online: false };
  }
}

// 休眠检测
function checkDormancy() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().replace('T',' ').slice(0,19);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().replace('T',' ').slice(0,19);

  // 标记休眠：服务器创建>7天且最近7天无活跃
  const toDormant = db.prepare(`SELECT s.id,s.name FROM servers s WHERE s.status='active' AND s.created_at<? AND (s.last_online_at IS NULL OR s.last_online_at<?)`).all(sevenDaysAgo, sevenDaysAgo);
  for (const s of toDormant) {
    if (!db.prepare('SELECT 1 FROM check_logs WHERE server_id=? AND online=1 AND players_online>0 AND checked_at>=? LIMIT 1').get(s.id, sevenDaysAgo)) {
      db.prepare("UPDATE servers SET status='dormant',dormancy_started_at=datetime('now','localtime') WHERE id=?").run(s.id);
      console.log(`💤 "${s.name}" 已休眠`);
    }
  }

  // 恢复：休眠服务器最近7天有活跃
  const toRestore = db.prepare(`SELECT s.id,s.name FROM servers s WHERE s.status='dormant' AND s.last_online_at>=?`).all(sevenDaysAgo);
  for (const s of toRestore) {
    if (db.prepare('SELECT 1 FROM check_logs WHERE server_id=? AND online=1 AND players_online>0 AND checked_at>=? LIMIT 1').get(s.id, sevenDaysAgo)) {
      db.prepare("UPDATE servers SET status='active',dormancy_started_at=NULL WHERE id=?").run(s.id);
      console.log(`🔄 "${s.name}" 已恢复`);
    }
  }

  // 清理：休眠超过30天
  const toDelete = db.prepare('SELECT id,name FROM servers WHERE status=\'dormant\' AND dormancy_started_at<?').all(thirtyDaysAgo);
  for (const s of toDelete) {
    db.prepare('DELETE FROM check_logs WHERE server_id=?').run(s.id);
    db.prepare('DELETE FROM servers WHERE id=?').run(s.id);
    console.log(`🗑️ "${s.name}" 已删除（休眠超30天）`);
  }
}

async function checkAllServers() {
  const servers = db.prepare("SELECT * FROM servers WHERE status='active'").all();
  console.log(`[${new Date().toLocaleString()}] 检测 ${servers.length} 台服务器（分批并发5）...`);
  const results = [];
  for (let i = 0; i < servers.length; i += 5) {
    const batch = servers.slice(i, i + 5);
    results.push(...(await Promise.allSettled(batch.map(s => checkServer(s)))));
    if (i + 5 < servers.length) await new Promise(r => setTimeout(r, 800));
  }
  const online = results.filter(r => r.status === 'fulfilled' && r.value.online).length;
  console.log(`检测完成: ${online}/${servers.length} 在线`);
  checkDormancy();
}

// 启动
setTimeout(checkAllServers, 3000);
// 禁用云端检测——使用本地 sync-check.js 推送更准确的结果
// setInterval(checkAllServers, CHECK_INTERVAL);
setInterval(() => {
  // 仅保留: 清理旧日志 + 休眠检测
  db.prepare("DELETE FROM check_logs WHERE checked_at<datetime('now','localtime','-30 days')").run();
  checkDormancy();
}, 3600000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MC Server Monitor :${PORT}`);
  console.log(`📊 检测: ${CHECK_INTERVAL/1000}s · 并发5 · 超时8s`);
});
