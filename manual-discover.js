// Discover more MC servers — comprehensive manual list
const Database = require('better-sqlite3');
const { status } = require('minecraft-server-util');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));
const TIMEOUT = 8000;
const BATCH = 5;
const DELAY = 800;

const servers = [
  // === 大型综合（国外知名） ===
  { name: 'Hypixel', ip: 'mc.hypixel.net', desc: '全球最大MC服务器 · 70+小游戏 · 万人同服' },
  { name: 'CubeCraft', ip: 'cubecraft.net', desc: '英国老牌小游戏服务器 · EggWars/SkyWars' },
  { name: 'Mineplex', ip: 'us.mineplex.com', desc: '北美大型小游戏网络 · Super Smash Mobs' },
  { name: 'HiveMC', ip: 'play.hivemc.com', desc: '英国小游戏服务器 · Hide and Seek/Treasure Wars' },
  { name: 'PikaNetwork', ip: 'pika-network.net', desc: '热门综合服务器 · Skyblock/Survival/EggWars' },
  { name: 'JartexNetwork', ip: 'play.jartexnetwork.com', desc: '欧洲综合 · Factions/Skyblock/KitPVP' },

  // === RPG / 冒险 ===
  { name: 'Wynncraft', ip: 'play.wynncraft.com', desc: 'MC最大MMORPG · 自定义世界·职业·副本' },
  { name: 'ManaCube', ip: 'play.manacube.com', desc: 'RPG/Skyblock/Survival 综合服' },
  { name: 'Loka', ip: 'play.loka.net', desc: 'RPG领土战争 · 自定义资源包 · 大型PVP' },

  // === 纯净生存/无政府 ===
  { name: '2b2t', ip: '2b2t.org', desc: '最古老无政府 · 无规则 · 原版生存' },
  { name: 'Vanillamc', ip: 'vanillamc.net', desc: '纯净生存 · 原版体验' },

  // === PvP / Practice ===
  { name: 'MinemenClub', ip: 'minemen.club', desc: '专业Practice PvP · Bridge/BuildUHC/GMG' },
  { name: 'PvP Land', ip: 'pvp.land', desc: 'PVP综合服务器 · 大型HCF/Practice' },
  { name: 'Badlion', ip: 'mc.badlion.net', desc: '知名Practice · 虽然已关服但偶尔在线' },
  { name: 'BlocksMC', ip: 'blocksmc.com', desc: 'BW/SW迷你小游戏PvP' },
  { name: 'MCSG', ip: 'mcsg.net', desc: '经典Survival Games服务器' },

  // === Skyblock ===
  { name: 'Skyblock.net', ip: 'play.skyblock.net', desc: '专注Skyblock · 多岛屿升级' },
  { name: 'LemonCloud', ip: 'lemoncloud.org', desc: 'Skyblock/Gens/OP Prison 综合' },
  { name: 'PurplePrison', ip: 'purpleprison.net', desc: '美国Prison服务器 · 排名系统' },
  { name: 'OPBlocks', ip: 'play.opblocks.com', desc: 'OP Prison/Skyblock · 快速升级' },
  { name: 'CosmicMC', ip: 'play.cosmicmc.com', desc: '特色Prison/Skyblock · 经济系统' },

  // === 小游戏 ===
  { name: 'MC-Central', ip: 'mc-central.net', desc: '英国小游戏网络 · 经典迷你游戏合集' },
  { name: 'PulseMC', ip: 'play.pulsemc.net', desc: 'BedWars/SkyWars/EggWars' },
  { name: 'FunMC', ip: 'play.funmc.net', desc: '美国小游戏服务器 · 氛围社区' },
  { name: 'Galaxite', ip: 'play.galaxite.net', desc: '创意小游戏·自制地图·Bedrock互通' },

  // === 欧洲 ===
  { name: 'GommeHD', ip: 'gommehd.net', desc: '德国最大MC服务器 · 50+小游戏' },
  { name: 'Shotbow', ip: 'play.shotbow.net', desc: '老牌综合 · Annihilation/MineZ经典模式' },
  { name: 'Cytooxien', ip: 'cytooxien.de', desc: '德国创意小游戏 · CityBuild/BedWars' },
  { name: 'Rewinside', ip: 'rewinside.de', desc: '德国综合服务器 · Survival Games' },

  // === 亚洲/中文 ===
  { name: '花雨庭', ip: 'play.huayuting.cn', desc: '中国大型MC服务器 · 小游戏/生存/RPG' },
  { name: 'EaseCation', ip: 'easecation.net', desc: '亚洲国际服务器 · Skyblock/MiniGames' },
  { name: 'StoneBound', ip: 'play.stonebound.cn', desc: '中国RPG服务器 · 副本/装备/等级系统' },

  // === Factions ===
  { name: 'AbyssalMC', ip: 'play.abyssal.net', desc: '大型Factions服务器 · 自定义附魔' },
  { name: 'VeltPvP', ip: 'play.veltpvp.com', desc: 'HCF/Factions/Practice PvP综合' },
  { name: 'Desteria', ip: 'play.desteria.com', desc: 'Towny/Factions生存 · 经济系统' },
  { name: 'ComplexGaming', ip: 'play.complexgaming.net', desc: '老牌Factions · 多世界' },

  // === 其他知名 ===
  { name: 'Luminosity', ip: 'play.luminositymc.net', desc: '美国综合 · Survival/Factions/Skyblock' },
  { name: 'PrimeMC', ip: 'play.primemc.org', desc: '小型精品 · 纯净生存/EggWars' },
  { name: 'Herobrine', ip: 'herobrine.org', desc: '老牌纯净生存 · 无政府风格' },
  { name: 'Hyperlands', ip: 'hyperlands.com', desc: '经典PvP · KitPVP/Survival Games' },
  { name: 'Brawl', ip: 'brawl.com', desc: 'PvP竞技场 · 1.8 PvP爱好者' },
  { name: 'PvPWars', ip: 'pvpwars.net', desc: 'Factions/Prison综合 · 活跃社区' },
  { name: 'Harbinger', ip: 'harbinger.gg', desc: '全新MC服务器 · 现代模组/小游戏' },
  { name: 'Ender', ip: 'play.ender.cc', desc: '综合PVP服务器 · KitPVP/BuildUHC' },
  { name: 'NetherGames', ip: 'play.nethergames.org', desc: 'Bedrock互通的跨平台服务器' },
  { name: 'EmortalMC', ip: 'emortalmc.com', desc: '综合 · Skyblock/Prison/Factions' },
  { name: 'Cosmos', ip: 'play.cosmos.network', desc: '纯净生存 · 社区氛围' },

  // === 补充 ===
  { name: 'PokeMC', ip: 'pokeserv.net', desc: '宝可梦主题MC服务器' },
  { name: 'GlacialMC', ip: 'glacialmc.com', desc: 'Skyblock/Factions综合服' },
  { name: 'Hoplite', ip: 'play.hoplite.gg', desc: '竞技场PvP · 排位系统' },
  { name: 'BrunchMC', ip: 'brunchmc.com', desc: '小型综合 · 迷你小游戏/Survival Games' },
];

async function check(srv) {
  try {
    const r = await status(srv.ip, 25565, { timeout: TIMEOUT });
    return { ok: true, name: r.host || srv.name, players: r.players.online, max: r.players.max, version: r.version.name, motd: r.motd.html };
  } catch {
    return { ok: false };
  }
}

async function main() {
  // Get existing IPs
  const existing = new Set(db.prepare('SELECT DISTINCT ip FROM servers').all().map(r => r.ip));

  console.log('共', servers.length, '个候选服务器...\n');

  const added = [];
  for (let i = 0; i < servers.length; i += BATCH) {
    const batch = servers.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(s => check(s)));

    for (let j = 0; j < batch.length; j++) {
      const srv = batch[j];
      const r = results[j].status === 'fulfilled' ? results[j].value : { ok: false };

      if (existing.has(srv.ip)) {
        console.log(`⏭ 已有  ${srv.name.padEnd(16)} ${srv.ip}`);
      } else if (r.ok) {
        console.log(`✅ 新增  ${srv.name.padEnd(16)} ${srv.ip}  ${r.players}/${r.max}人`);
        db.prepare('INSERT INTO servers (name,ip,port,description) VALUES (?,?,?,?)').run(srv.name, srv.ip, 25565, srv.desc);
        added.push({ name: srv.name, ip: srv.ip, players: r.players });
        existing.add(srv.ip);
      } else {
        console.log(`❌ 离线  ${srv.name.padEnd(16)} ${srv.ip}`);
      }
    }

    if (i + BATCH < servers.length) await new Promise(r => setTimeout(r, DELAY));
  }

  console.log(`\n📊 统计：新增 ${added.length} 个`);
  console.log(`现在共有 ${db.prepare('SELECT COUNT(*) as c FROM servers').get().c} 个服务器收录`);

  // Run sync-check to push to cloud
  if (added.length > 0) {
    console.log('\n🔄 运行 sync-check.js 推送到云端...');
    require('./sync-check');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
