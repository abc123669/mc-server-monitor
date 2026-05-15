#!/usr/bin/env node
/**
 * MC Server Scanner v2 - 先DNS解析过滤，再ping存活服务器
 *
 * 用法:
 *   node scanner.js                    # 全量扫描
 *   node scanner.js --quick            # 快速扫描(仅前20个词)
 *   node scanner.js --stats            # 显示统计
 */

const { status } = require('minecraft-server-util');
const Database = require('better-sqlite3');
const dns = require('dns');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data.db');
const STATE_PATH = path.join(__dirname, '.scanner_state.json');

// ============== 域名词库 ==============
const WORDS = [
  'red','blue','green','gold','sky','dark','frost','flame','crystal',
  'cloud','star','moon','sun','ocean','mountain','forest','snow','wind','fire','ice','thunder',
  'craft','build','mine','block','world','pixel','sword','pearl','dragon',
  'phoenix','wizard','magic','knight','legend','myth','realm','kingdom',
  'soul','shadow','ghost','phantom','spirit','guardian','hero','epic',
  'play','fun','nova','prime','pro','hub','zone','land','city','island',
  'valley','peak','core','forge','haven','cove','ridge','gate','park',
  'yun','meng','xing','yue','hua','long','feng','lin','shan','hai',
  'yu','tian','kong','jin','mu','shui','huo','tu',
  'one','two','three','four','five','six','seven','eight','nine','ten',
];

const TLDS = ['.com', '.net', '.org', '.cn', '.fun', '.top', '.me'];

function generateCandidates(word) {
  const cands = [];
  for (const tld of TLDS) {
    cands.push(`${word}mc${tld}`, `mc${word}${tld}`, `mc.${word}${tld}`, `play.${word}${tld}`);
    if (word.length > 3) cands.push(`server.${word}${tld}`, `${word}server${tld}`);
  }
  return cands;
}

function getDB() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

// ============== Phase 1: DNS快速过滤 ==============
function resolveHost(host) {
  return Promise.race([
    new Promise(resolve => {
      dns.resolve4(host, (err, addresses) => {
        resolve(err ? null : (addresses && addresses.length > 0 ? addresses[0] : null));
      });
    }),
    new Promise(resolve => setTimeout(() => resolve(null), 2000))
  ]);
}

async function dnsFilter(candidates, concurrency = 100) {
  const resolved = [];
  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map(c => resolveHost(c.host)));
    for (let j = 0; j < batch.length; j++) {
      const ip = results[j].status === 'fulfilled' ? results[j].value : null;
      if (ip) resolved.push({ ...batch[j], ip });
    }
    const pct = Math.min(100, Math.round((i + batch.length) / candidates.length * 100));
    process.stdout.write(`\r   DNS扫描: ${i + batch.length}/${candidates.length} (${pct}%) → 发现 ${resolved.length} 个有效域名`);
  }
  process.stdout.write('\n');
  return resolved;
}

// ============== Phase 2: MC Ping ==============
async function pingServer(host, port, timeout = 4000) {
  try {
    const result = await status(host, port, { timeout });
    return {
      online: true, host, port,
      players: result.players?.online || 0,
      maxPlayers: result.players?.max || 0,
      version: result.version?.name || '',
    };
  } catch { return { online: false, host, port }; }
}

async function batchPing(entries, concurrency = 10) {
  const results = [];
  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(e => pingServer(e.host, e.port)));
    for (let j = 0; j < batch.length; j++) {
      const r = batchResults[j].status === 'fulfilled' ? batchResults[j].value : { online: false, host: batch[j].host, port: batch[j].port };
      if (r.online) results.push(r);
    }
    process.stdout.write(`\r   MC Ping: ${i + batch.length}/${entries.length} → 发现 ${results.length} 个MC服务器`);
  }
  process.stdout.write('\n');
  return results;
}

// ============== 主流程 ==============
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--stats')) {
    const db = getDB();
    const total = db.prepare('SELECT COUNT(*) as c FROM servers').get().c;
    const scanned = db.prepare('SELECT COUNT(*) as c FROM servers WHERE description LIKE ?').get('%自动扫描发现%').c;
    console.log(`📊 扫描统计:`);
    console.log(`   服务器总数: ${total}`);
    console.log(`   由扫描添加: ${scanned}`);
    db.close();
    return;
  }

  const quickMode = args.includes('--quick');
  const activeWords = quickMode ? WORDS.slice(0, 25) : WORDS;

  // 生成候选项
  const seen = new Set();
  const allCandidates = [];
  for (const word of activeWords) {
    for (const host of generateCandidates(word)) {
      const key = `${host}:25565`;
      if (!seen.has(key)) { seen.add(key); allCandidates.push({ word, host, port: 25565 }); }
    }
  }

  console.log(`🔍 MC Server Scanner v2`);
  console.log(`   词库: ${activeWords.length} 个关键词 → ${allCandidates.length} 个候选项`);
  console.log(`   阶段1: DNS快速过滤...\n`);

  const dnsResults = await dnsFilter(allCandidates);

  console.log(`\n✅ DNS阶段完成: ${allCandidates.length} → ${dnsResults.length} 个域名可解析`);
  console.log(`\n   阶段2: MC服务器探测...\n`);

  const mcServers = await batchPing(dnsResults);

  console.log(`\n✅ MC探测完成: 发现 ${mcServers.length} 个MC服务器\n`);

  // 收录到数据库
  const db = getDB();
  let added = 0, exists = 0;

  for (const s of mcServers) {
    const row = db.prepare('SELECT id FROM servers WHERE ip = ? AND port = ?').get(s.host, s.port);
    if (row) { exists++; continue; }

    const name = s.host.replace(/\.\w+$/, '').replace(/^mc\./, '').replace(/^play\./, '');
    const prettyName = name.charAt(0).toUpperCase() + name.slice(1).replace(/\./g, ' ');
    db.prepare('INSERT INTO servers (name, ip, port, description) VALUES (?, ?, ?, ?)').run(
      prettyName, s.host, s.port || 25565,
      `自动发现 · ${s.players}人在线 · ${s.version || ''}`
    );
    console.log(`   ✅ ${s.host}:${s.port || 25565} — ${s.players}人 — 已收录`);
    added++;
  }

  console.log(`\n📊 汇总:`);
  console.log(`   候选项: ${allCandidates.length}`);
  console.log(`   DNS可解析: ${dnsResults.length}`);
  console.log(`   MC服务器: ${mcServers.length}`);
  console.log(`   新收录: ${added}`);
  console.log(`   已存在: ${exists}`);
  db.close();
}

main().catch(e => { console.error('出错:', e); process.exit(1); });
