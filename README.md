# 🎮 MC Server Monitor

> 实时 Minecraft 服务器在线监测平台 | **51+ 服务器 · 5分钟自动检测 · 在线率统计 · 自动休眠**

🌐 **在线体验**: [mcgw.lt123.cloud](https://mcgw.lt123.cloud)

---

## ✨ 功能特性

- 🔍 **实时检测** — 每5分钟自动检测所有服务器在线状态
- 📊 **在线率统计** — 查看每台服务器的历史在线率
- 💤 **智能休眠** — 7天无人上线自动休眠，30天自动清理
- 📋 **排序搜索** — 按在线人数排序，关键词搜索
- 📱 **响应式设计** — Material Design，手机电脑都好看
- 🔐 **管理后台** — 添加/编辑/删除服务器

## 🛠 技术栈

- **前端**: 原生 HTML + CSS + JS (Material Design)
- **后端**: Node.js + Express
- **数据库**: SQLite (better-sqlite3)
- **部署**: systemd + cloudflared tunnel

## 🚀 快速部署

```bash
git clone https://github.com/abc123669/mc-server-monitor.git
cd mc-server-monitor
npm install
# 修改 server.js 中的 ADMIN_KEY
node server.js
```

## ⚙️ 配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 监听端口 | 5001 |
| `ADMIN_KEY` | 管理员密钥 | 需自行设置 |
| `SYNC_SECRET` | 同步密钥 | sync-mc-2026 |

## 📄 开源协议

MIT
