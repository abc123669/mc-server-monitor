// MC Server Discovery Script
// Tests a curated list of well-known MC servers and adds online ones to the database

const Database = require('better-sqlite3');
const { status } = require('minecraft-server-util');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));

// Curated list of popular, well-known Minecraft servers
const CANDIDATES = [
  // === 大型综合服务器 ===
  { name: 'Hypixel', ip: 'mc.hypixel.net' },
  { name: 'Mineplex', ip: 'us.mineplex.com' },
  { name: 'CubeCraft', ip: 'cubecraft.net' },
  { name: 'HiveMC', ip: 'play.hivemc.com' },

  // === 小游戏 ===
  { name: 'BlocksMC', ip: 'blocksmc.com' },
  { name: 'PikaNetwork', ip: 'pika-network.net' },
  { name: 'JartexNetwork', ip: 'play.jartexnetwork.com' },
  { name: 'PvP Land', ip: 'pvp.land' },

  // === RPG / 特色 ===
  { name: 'Wynncraft', ip: 'play.wynncraft.com' },
  { name: 'ManaCube', ip: 'play.manacube.com' },

  // === 纯净生存 ===
  { name: '2b2t', ip: '2b2t.org' },
  { name: 'Vanillamc', ip: 'vanillamc.net' },

  // === PvP 服务器 ===
  { name: 'MinemenClub', ip: 'minemen.club' },
  { name: 'Badlion', ip: 'mc.badlion.net' },

  // === 小型但知名 ===
  { name: 'LemonCloud', ip: 'lemoncloud.org' },
  { name: 'Luminosity', ip: 'play.luminositymc.net' },
  { name: 'CosmicMC', ip: 'play.cosmicmc.com' },
  { name: 'PurplePrison', ip: 'purpleprison.net' },
  { name: 'OPBlocks', ip: 'play.opblocks.com' },
  { name: 'MC-Central', ip: 'mc-central.net' },
  { name: 'PulseMC', ip: 'play.pulsemc.net' },

  // === 中文/亚洲服务器（国内可连） ===
  { name: '花雨庭', ip: 'play.huayuting.cn' },
  { name: 'EaseCation', ip: 'easecation.net' },
  { name: '梦世界像素', ip: 'play.dreamworld.cn' },
  { name: 'StoneBound', ip: 'play.stonebound.cn' },
  { name: '心动小镇', ip: 'play.xdxz.net' },
  { name: '星云服务器', ip: 'play.xingyun.cc' },
  { name: 'IceCloud', ip: 'icecloudcn.com' },

  // === 其他知名 ===
  { name: 'Herobrine', ip: 'herobrine.org' },
  { name: 'GommeHD', ip: 'gommehd.net' },
  { name: 'Shotbow', ip: 'play.shotbow.net' },
  { name: 'MCSG', ip: 'mcsg.net' },
  { name: 'PrimeMC', ip: 'play.primemc.org' },
  { name: 'FunMC', ip: 'play.funmc.net' },
  { name: 'Hyperlands', ip: 'hyperlands.com' },
  { name: 'Brawl', ip: 'brawl.com' },
  { name: 'MCPEa', ip: 'mc.mcpea.net' },
];

// Get existing servers to skip duplicates
const existing = new Set();
db.prepare('SELECT ip, port FROM servers').all().forEach(s => {
  existing.add(`${s.ip}:${s.port}`);
});

async function discover() {
  console.log(`🔍 开始探测 ${CANDIDATES.length} 个候选服务器...\n留空=未尝试  ✅=在线  ❌=离线  ⏭=已收录\n`);

  const addStmt = db.prepare('INSERT INTO servers (name,ip,port,description) VALUES (?,?,?,?)');
  const results = { added: 0, online: 0, offline: 0, exists: 0 };

  for (const c of CANDIDATES) {
    const key = `${c.ip}:${c.port || 25565}`;
    if (existing.has(key)) {
      console.log(`⏭  ${c.name} (${c.ip}) — 已收录`);
      results.exists++;
      continue;
    }

    try {
      const result = await status(c.ip, c.port || 25565, { timeout: 6000 });
      if (result && result.version) {
        const desc = result.motd?.clean?.slice(0, 200) || `Minecraft ${result.version.name} · ${result.players.online}/${result.players.max} 在线`;
        addStmt.run(c.name, c.ip, c.port || 25565, desc);
        console.log(`✅  ${c.name} (${c.ip}) — ${result.players.online}/${result.players.max} 在线 · ${result.version.name}`);
        results.added++;
        results.online++;
        existing.add(key); // Prevent re-adding
      } else {
        console.log(`❌  ${c.name} (${c.ip}) — 无响应`);
        results.offline++;
      }
    } catch {
      console.log(`❌  ${c.name} (${c.ip}) — 无法连接`);
      results.offline++;
    }

    // Small delay between checks
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n📊 统计：`);
  console.log(`  新增收录: ${results.added}`);
  console.log(`  已有免查: ${results.exists}`);
  console.log(`  检测离线: ${results.offline}`);
  console.log(`\n现在共有 ${db.prepare('SELECT COUNT(*) as c FROM servers').get().c} 个服务器收录`);
}

discover().catch(console.error);
