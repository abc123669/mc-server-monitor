const express = require('express');
const Database = require('better-sqlite3');
const { status } = require('minecraft-server-util');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = process.env.PORT || 5001;
const CHECK_INTERVAL = 5 * 60 * 1000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'yqadmin123669';
const SYNC_SECRET = process.env.SYNC_SECRET || 'sync-mc-2026';

// Database
const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

// Add composite index for check_logs (critical for fast MAX(id) queries)
db.exec("CREATE INDEX IF NOT EXISTS idx_check_server_id ON check_logs(server_id, id)");
try { db.exec("ALTER TABLE servers ADD COLUMN comments_count INTEGER DEFAULT 0"); } catch(e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, ip TEXT NOT NULL, port INTEGER DEFAULT 25565,
    description TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    rating REAL DEFAULT 1.0,
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
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    content TEXT DEFAULT '',
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (server_id) REFERENCES servers(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_check_server ON check_logs(server_id);
  CREATE INDEX IF NOT EXISTS idx_check_time ON check_logs(checked_at);
  CREATE INDEX IF NOT EXISTS idx_comments_server ON comments(server_id);
`);
try { db.exec("ALTER TABLE servers ADD COLUMN status TEXT DEFAULT 'active'"); } catch(e) {}
try { db.exec("ALTER TABLE servers ADD COLUMN dormancy_started_at DATETIME"); } catch(e) {}
try { db.exec("ALTER TABLE servers ADD COLUMN last_online_at DATETIME"); } catch(e) {}
try { db.exec("ALTER TABLE servers ADD COLUMN image_url TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE servers ADD COLUMN rating REAL DEFAULT 1.0"); } catch(e) {}

// Session
app.use(express.json({ limit: '10mb' }));
app.use(session({
  store: new SQLiteStore({ dir: __dirname, db: 'sessions.db' }),
  secret: 'mc-monitor-secret-2026',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

// ===== Auth Helpers =====
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.pbkdf2Sync(pw, salt, 100000, 64, 'sha512').toString('hex');
  return salt + ':' + key;
}

function verifyPassword(pw, stored) {
  const [salt, key] = stored.split(':');
  const hash = crypto.pbkdf2Sync(pw, salt, 100000, 64, 'sha512').toString('hex');
  return key === hash;
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: '请先登录' });
  next();
}

// ===== Captcha =====
app.get('/api/captcha', (req, res) => {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  req.session.captchaAnswer = a + b;
  res.json({ a, b, token: req.session.id });
});

function requireCaptcha(req, res, next) {
  const { captcha } = req.body;
  if (!captcha || parseInt(captcha) !== req.session.captchaAnswer) {
    return res.status(400).json({ error: '验证码错误' });
  }
  req.session.captchaAnswer = null; // one-time use
  next();
}

// ===== Auth Routes =====
app.post('/api/auth/register', requireCaptcha, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.length < 2 || password.length < 4)
    return res.status(400).json({ error: '用户名至少2位，密码至少4位' });
  if (username.length > 20) return res.status(400).json({ error: '用户名最长20位' });
  try {
    const r = db.prepare('INSERT INTO users (username,password_hash) VALUES (?,?)').run(username, hashPassword(password));
    req.session.userId = r.lastInsertRowid;
    req.session.username = username;
    res.json({ ok: true, username });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: '用户名已存在' });
    res.status(500).json({ error: '注册失败' });
  }
});

app.post('/api/auth/login', requireCaptcha, (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!user || !verifyPassword(password, user.password_hash))
    return res.status(401).json({ error: '用户名或密码错误' });
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ ok: true, username: user.username });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (req.session.userId) {
    const user = db.prepare('SELECT id, username, created_at FROM users WHERE id=?').get(req.session.userId);
    res.json({ loggedIn: true, user });
  } else {
    res.json({ loggedIn: false });
  }
});

// ===== Servers API =====
app.get('/api/servers', (req, res) => {
  const { q, show, page, limit } = req.query;
  let where = "s.status = 'active'";
  if (show === 'all') where = "s.status IN ('active','dormant')";

  if (q && q.trim()) {
    const sq = q.trim();
    where = `(s.status='active' OR s.status='dormant') AND (s.name LIKE '%${sq}%' OR s.ip LIKE '%${sq}%' OR s.description LIKE '%${sq}%')`;
  }

  // Efficient latest-check CTE: anti-join pattern (fast with composite index)
  const baseQuery = `SELECT s.*,lc.online,lc.players_online,lc.max_players,lc.latency,lc.version,lc.checked_at,
    COALESCE(s.rating, 1.0) as avg_rating,
    s.comments_count as comment_count
    FROM servers s
    LEFT JOIN check_logs lc ON lc.id=(
      SELECT MAX(cl2.id) FROM check_logs cl2 WHERE cl2.server_id=s.id
    )
    WHERE ${where}`;

  if (page) {
    const p = Math.max(1, parseInt(page) || 1);
    const l = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const offset = (p - 1) * l;
    const total = db.prepare(`SELECT COUNT(*) as c FROM servers s WHERE ${where}`).get().c;
    // Sort: online first, then (players_online * rating)
    const qSort = "lc.online DESC, (lc.players_online * COALESCE(s.rating, 1.0)) DESC";
    const rows = db.prepare(`${baseQuery} ORDER BY ${qSort} LIMIT ? OFFSET ?`).all(l, offset);
    return res.json({ servers: rows, total, page: p, hasMore: offset + l < total });
  }

  res.json(db.prepare(`${baseQuery} ORDER BY lc.online DESC, (lc.players_online * COALESCE(s.rating, 1.0)) DESC`).all());
});

// ===== Comments API =====
app.get('/api/servers/:id/comments', (req, res) => {
  const rows = db.prepare('SELECT c.id,c.user_id,c.username,c.rating,c.content,c.created_at FROM comments c WHERE c.server_id=? ORDER BY c.created_at DESC').all(req.params.id);
  const avg = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM comments WHERE server_id=?').get(req.params.id);
  res.json({ comments: rows, avgRating: avg.avg ? Math.round(avg.avg * 10) / 10 : 1.0, count: avg.count });
});

app.post('/api/servers/:id/comments', requireAuth, (req, res) => {
  const { rating, content } = req.body;
  const r = parseInt(rating);
  if (!r || r < 1 || r > 5) return res.status(400).json({ error: '请选择1-5星' });
  if (!content || content.length > 500) return res.status(400).json({ error: '评论内容1-500字' });

  // Update server avg rating
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO comments (server_id,user_id,username,rating,content) VALUES (?,?,?,?,?)').run(
      req.params.id, req.session.userId, req.session.username, r, content.trim()
    );
    const avg = db.prepare('SELECT AVG(rating) as a FROM comments WHERE server_id=?').get(req.params.id);
    db.prepare('UPDATE servers SET rating=?, comments_count=(SELECT COUNT(*) FROM comments WHERE server_id=?) WHERE id=?').run(avg.a || 1.0, req.params.id, req.params.id);
  });
  tx();

  const row = db.prepare('SELECT c.id,c.user_id,c.username,c.rating,c.content,c.created_at FROM comments c WHERE c.id=last_insert_rowid()').get();
  res.json({ ok: true, comment: row });
});

// ===== History =====
app.get('/api/servers/:id/history', (req, res) => {
  const { range } = req.query;
  let hours = 24; if (range === '7d') hours = 168; if (range === '30d') hours = 720;
  const rows = db.prepare(`SELECT online,players_online,latency,checked_at FROM check_logs WHERE server_id=? AND checked_at>=datetime('now','localtime','-${hours} hours') ORDER BY checked_at ASC`).all(req.params.id);
  const total = rows.length;
  const onlineCount = rows.filter(r => r.online).count;
  res.json({ rows, uptime: total > 0 ? (onlineCount / total * 100).toFixed(1) : 0, total, online: onlineCount });
});

// ===== Admin Routes =====
app.post('/api/admin/servers', (req, res) => {
  const { key, name, ip, port, description, image_url } = req.body;
  if (key !== ADMIN_KEY) return res.status(403).json({ error: '密钥错误' });
  if (!name || !ip) return res.status(400).json({ error: '名称和IP不能为空' });
  const r = db.prepare('INSERT INTO servers (name,ip,port,description,image_url) VALUES (?,?,?,?,?)').run(name, ip, port || 25565, description || '', image_url || '');
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/admin/servers/:id', (req, res) => {
  const { key, name, ip, port, description, image_url } = req.body;
  if (key !== ADMIN_KEY) return res.status(403).json({ error: '密钥错误' });
  db.prepare("UPDATE servers SET name=?,ip=?,port=?,description=?,image_url=?,updated_at=datetime('now','localtime') WHERE id=?").run(name, ip, port || 25565, description || '', image_url || '', req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/servers/:id', (req, res) => {
  const { key } = req.body;
  if (key !== ADMIN_KEY) return res.status(403).json({ error: '密钥错误' });
  db.prepare('DELETE FROM comments WHERE server_id=?').run(req.params.id);
  db.prepare('DELETE FROM check_logs WHERE server_id=?').run(req.params.id);
  db.prepare('DELETE FROM servers WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/verify', (req, res) => {
  res.json({ valid: req.body.key === ADMIN_KEY });
});

// ===== Public Add Server (requires auth + captcha) =====
app.post('/api/servers/add', requireAuth, requireCaptcha, async (req, res) => {
  const { name, ip, port, description, image_url } = req.body;
  if (!name || !ip) return res.status(400).json({ error: '名称和IP不能为空' });
  if (name.length > 50 || ip.length > 200) return res.status(400).json({ error: '参数过长' });
  try {
    const result = await status(ip.trim(), port || 25565, { timeout: 8000 });
    if (!result || !result.version) return res.status(400).json({ error: '无法连接该服务器' });
  } catch { return res.status(400).json({ error: '检测失败：服务器不在线或无法连接' }); }
  if (db.prepare('SELECT id FROM servers WHERE ip=? AND port=?').get(ip.trim(), port || 25565))
    return res.status(409).json({ error: '该服务器已被收录过了！' });
  const r = db.prepare('INSERT INTO servers (name,ip,port,description,image_url) VALUES (?,?,?,?,?)').run(name.trim(), ip.trim(), port || 25565, (description || '').trim(), image_url || '');
  res.json({ id: r.lastInsertRowid, message: '收录成功！已开始监控。' });
});

// ===== Stats =====
app.get('/api/stats', (req, res) => {
  const total = db.prepare("SELECT COUNT(*) as c FROM servers WHERE status='active'").get();
  // Use the same efficient pattern with composite index
  const online = db.prepare("SELECT COUNT(*) as c FROM servers s WHERE s.status='active' AND (SELECT online FROM check_logs WHERE server_id=s.id ORDER BY id DESC LIMIT 1)=1").get();
  res.json({ total: total.c, online: online.c });
});

// ===== Sync =====
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

// ===== Server Detection =====
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

function checkDormancy() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().replace('T',' ').slice(0,19);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().replace('T',' ').slice(0,19);
  const toDormant = db.prepare(`SELECT s.id,s.name FROM servers s WHERE s.status='active' AND s.created_at<? AND (s.last_online_at IS NULL OR s.last_online_at<?)`).all(sevenDaysAgo, sevenDaysAgo);
  for (const s of toDormant) {
    if (!db.prepare('SELECT 1 FROM check_logs WHERE server_id=? AND online=1 AND players_online>0 AND checked_at>=? LIMIT 1').get(s.id, sevenDaysAgo)) {
      db.prepare("UPDATE servers SET status='dormant',dormancy_started_at=datetime('now','localtime') WHERE id=?").run(s.id);
      console.log(`💤 "${s.name}" 已休眠`);
    }
  }
  const toRestore = db.prepare(`SELECT s.id,s.name FROM servers s WHERE s.status='dormant' AND s.last_online_at>=?`).all(sevenDaysAgo);
  for (const s of toRestore) {
    if (db.prepare('SELECT 1 FROM check_logs WHERE server_id=? AND online=1 AND players_online>0 AND checked_at>=? LIMIT 1').get(s.id, sevenDaysAgo)) {
      db.prepare("UPDATE servers SET status='active',dormancy_started_at=NULL WHERE id=?").run(s.id);
      console.log(`🔄 "${s.name}" 已恢复`);
    }
  }
  // 清理：休眠超过30天
  const toDelete = db.prepare("SELECT id,name FROM servers WHERE status='dormant' AND dormancy_started_at<?").all(thirtyDaysAgo);
  for (const s of toDelete) {
    db.prepare('DELETE FROM comments WHERE server_id=?').run(s.id);
    db.prepare('DELETE FROM check_logs WHERE server_id=?').run(s.id);
    db.prepare('DELETE FROM servers WHERE id=?').run(s.id);
    console.log(`🗑️ "${s.name}" 已删除（休眠超30天）`);
  }
}

async function checkAllServers() {
  const servers = db.prepare("SELECT * FROM servers WHERE status='active'").all();
  console.log(`[${new Date().toLocaleString()}] 检测 ${servers.length} 台服务器...`);
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

setTimeout(checkAllServers, 3000);
setInterval(() => {
  db.prepare("DELETE FROM check_logs WHERE checked_at<datetime('now','localtime','-30 days')").run();
  checkDormancy();
}, 3600000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MC Server Monitor :${PORT}`);
});

