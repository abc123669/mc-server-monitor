#!/bin/bash
# MC Server Monitor — Deploy Script
# Usage: bash deploy.sh
# 从 GitHub 拉取最新代码并重启服务

set -e

cd ~/mc-server-monitor || { echo "❌ 目录不存在"; exit 1; }

echo "📦 备份数据库..."
cp data.db data.db.backup.$(date +%Y%m%d%H%M%S) 2>/dev/null || true

echo "⬇️ 拉取最新代码..."
git stash 2>/dev/null || true
git pull origin main

echo "📦 安装依赖..."
npm install --production

echo "🚀 重启服务..."
# pm2 重启
if command -v pm2 &>/dev/null; then
  pm2 restart mc-monitor 2>/dev/null || pm2 start server.js --name mc-monitor
fi

# systemd 重启
if systemctl is-active mc-monitor &>/dev/null; then
  sudo systemctl restart mc-monitor
fi

echo "✅ 部署完成！"
echo "🌐 https://mcgw.lt123.cloud"
