// Run on server: node /home/ubuntu/mc-server-monitor/seed.js
const Database = require('better-sqlite3');
const db = new Database('/home/ubuntu/mc-server-monitor/data.db');

const servers = [
  ['云栖小站', 'sz.frp.one', 60354, '生存服 · Paper 1.21.11 · 精品商店'],
  ['Hypixel', 'mc.hypixel.net', 25565, '全球最大小游戏服务器 · SkyBlock · BedWars'],
  ['Wynncraft', 'play.wynncraft.com', 25565, '最大MMORPG服务器 · 开放世界 · 职业系统'],
  ['JartexNetwork', 'play.jartexnetwork.com', 25565, '国际小游戏服务器 · FFA · SkyWars'],
  ['2b2t', '2b2t.org', 25565, '最古老无政府服务器 · 无规则 · 原版生存'],
  ['Pixelmon Realms', 'mc.pixelmonrealms.com', 25565, '宝可梦MOD服务器 · 捕捉精灵 · 道馆挑战'],
  ['PvP Land', 'pvp.land', 25565, 'PvP练习服务器 · 竞技场 · 排位赛'],
  ['ManaCube', 'play.manacube.com', 25565, '经典生存/小游戏服务器'],
  ['ArchMC', 'mc.archmc.com', 25565, '大型生存服务器'],
  ['DesertCraft', 'play.desertcraft.net', 25565, '沙漠主题生存服'],
  ['OldMinecraft', 'connect.oldminecraft.com', 25565, '怀旧版本生存服'],
  ['Azisurvival', 'play.azisurvival.net', 25565, '纯净生存服务器'],
  ['VanillaTW', 'mc.vanillatw.com', 25565, '台湾原版生存服务器'],
  ['CenturyMC', 'mc.centurymc.net', 25565, '小游戏/生存服务器'],
  ['LBSG', 'play.lbsg.net', 25565, '小游戏服务器'],
  ['GotPvP', 'play.gotpvp.com', 25565, 'PvP竞技服务器'],
  ['CosmosMC', 'play.cosmosmc.net', 25565, 'Cosmos网络'],
];

const stmt = db.prepare('INSERT OR IGNORE INTO servers (name, ip, port, description) VALUES (?, ?, ?, ?)');
let count = 0;
for (const s of servers) {
  const existing = db.prepare('SELECT id FROM servers WHERE ip=? AND port=?').get(s[1], s[2]);
  if (!existing) {
    stmt.run(s[0], s[1], s[2], s[3]);
    count++;
    console.log('+ ' + s[0] + ' (' + s[1] + ':' + s[2] + ')');
  } else {
    console.log('= ' + s[0] + ' (已存在)');
  }
}
console.log('新增: ' + count + '/' + servers.length);
console.log('总计: ' + db.prepare('SELECT COUNT(*) as c FROM servers').get().c);
db.close();
