// Local MC Server Detection + Sync to Cloud
// Runs the actual MC server checks from local machine (better connectivity)
// and pushes results to the cloud server via API.
//
// Usage: node sync-check.js

const Database = require('better-sqlite3');
const { status } = require('minecraft-server-util');
const path = require('path');
const https = require('https');
const http = require('http');

const CLOUD_URL = 'http://49.235.191.119:5001/api/sync/check_results';
const SYNC_SECRET = 'sync-mc-2026';
const TIMEOUT = 8000;
const BATCH_SIZE = 5;
const BATCH_DELAY = 800;

const db = new Database(path.join(__dirname, 'data.db'));

async function checkServer(server) {
  try {
    const result = await status(server.ip, server.port, { timeout: TIMEOUT });
    const data = {
      id: server.id,
      online: true,
      players_online: result.players.online || 0,
      max_players: result.players.max || 0,
      latency: Math.round(result.roundTripLatency || 0),
      version: result.version.name || '',
      motd: result.motd?.html || ''
    };
    console.log(`  ✅ ${server.name.padEnd(16)} ${result.players.online}/${result.players.max}人  ${Math.round(result.roundTripLatency || 0)}ms`);
    return data;
  } catch {
    console.log(`  ❌ ${server.name.padEnd(16)} offline`);
    return { id: server.id, online: false, players_online: 0, max_players: 0, latency: -1, version: '', motd: '' };
  }
}

async function runChecks() {
  // Check if status column exists
  const cols = db.prepare('PRAGMA table_info(servers)').all().map(c => c.name);
  let toCheck;
  if (cols.includes('status')) {
    toCheck = db.prepare("SELECT * FROM servers WHERE status='active'").all();
  } else {
    toCheck = db.prepare('SELECT * FROM servers').all();
  }

  console.log(`[${new Date().toLocaleString()}] 检测 ${toCheck.length} 台服务器...`);

  const results = [];
  for (let i = 0; i < toCheck.length; i += BATCH_SIZE) {
    const batch = toCheck.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(batch.map(s => checkServer(s)));
    results.push(...batchResults.filter(r => r.status === 'fulfilled').map(r => r.value));
    if (i + BATCH_SIZE < toCheck.length) await new Promise(r => setTimeout(r, BATCH_DELAY));
  }

  const online = results.filter(r => r.online).length;
  console.log(`检测完成: ${online}/${toCheck.length} 在线`);

  // Push to cloud
  console.log(`推送 ${results.length} 条结果到云端...`);
  await pushToCloud(results);
  console.log('✓ 推送完成');
}

function pushToCloud(results) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ results, secret: SYNC_SECRET });
    const url = new URL(CLOUD_URL);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 15000
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ ok: false, error: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

runChecks().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
