# QQ农场共享版服务器 - 部署文档

## 文档信息

- **版本**: 1.0.0
- **最后更新**: 2026-02-24
- **目标读者**: 运维人员、系统管理员

---

## 目录

1. [环境要求](#环境要求)
2. [生产环境部署步骤](#生产环境部署步骤)
3. [PM2 配置说明](#pm2-配置说明)
4. [环境变量配置](#环境变量配置)
5. [日志管理](#日志管理)
6. [监控与告警](#监控与告警)
7. [备份与恢复](#备份与恢复)
8. [故障排查](#故障排查)
9. [安全建议](#安全建议)

---

## 环境要求

### 服务器配置

| 配置项 | 最低要求 | 推荐配置 |
|--------|----------|----------|
| CPU | 1 核 | 2 核及以上 |
| 内存 | 512 MB | 1 GB 及以上 |
| 磁盘 | 1 GB | 5 GB 及以上 |
| 带宽 | 1 Mbps | 5 Mbps 及以上 |
| 操作系统 | Linux/Windows/macOS | Ubuntu 20.04+ / Windows Server 2019+ |

### 软件依赖

| 软件 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 18.0.0 | 运行环境 |
| npm | >= 8.0.0 | 包管理器 |
| PM2 | >= 5.0.0 | 进程管理器（推荐） |
| Git | 任意版本 | 代码管理 |

---

## 生产环境部署步骤

### 方式一：使用 PM2 部署（推荐）

#### 1. 安装 Node.js

**Ubuntu/Debian:**

```bash
# 使用 NodeSource 安装 Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node -v
npm -v
```

**CentOS/RHEL:**

```bash
# 使用 NodeSource 安装 Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 验证安装
node -v
npm -v
```

**Windows:**

1. 下载 Node.js 安装包: https://nodejs.org/
2. 运行安装程序，选择 LTS 版本
3. 验证安装:

```powershell
node -v
npm -v
```

#### 2. 安装 PM2

```bash
npm install -g pm2

# 验证安装
pm2 --version
```

#### 3. 部署应用

```bash
# 创建应用目录
mkdir -p /opt/qq-farm-server
cd /opt/qq-farm-server

# 克隆代码（或上传代码）
git clone <repository-url> .
# 或者使用 scp/rsync 上传代码

# 安装依赖
npm install --production

# 创建必要的目录
mkdir -p data logs

# 启动应用
pm2 start ecosystem.config.js

# 保存 PM2 配置
pm2 save

# 设置开机自启
pm2 startup
# 按照提示执行生成的命令
```

#### 4. 配置防火墙

**Ubuntu (UFW):**

```bash
# 允许应用端口
sudo ufw allow 3456/tcp

# 如果需要外部访问 Web 控制台
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 启用防火墙
sudo ufw enable
```

**CentOS (firewalld):**

```bash
# 允许应用端口
sudo firewall-cmd --permanent --add-port=3456/tcp

# 如果需要外部访问 Web 控制台
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp

# 重载防火墙
sudo firewall-cmd --reload
```

**Windows 防火墙:**

```powershell
# 允许端口
New-NetFirewallRule -DisplayName "QQ Farm Server" -Direction Inbound -Protocol TCP -LocalPort 3456 -Action Allow
```

---

### 方式二：使用 Docker 部署

#### 1. 创建 Dockerfile

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN npm install --production

# 复制应用代码
COPY . .

# 创建数据目录
RUN mkdir -p data logs

# 暴露端口
EXPOSE 3456

# 启动命令
CMD ["node", "server.js"]
```

#### 2. 创建 docker-compose.yml

```yaml
version: '3.8'

services:
  qq-farm-server:
    build: .
    container_name: qq-farm-server
    restart: unless-stopped
    ports:
      - "3456:3456"
    environment:
      - NODE_ENV=production
      - PORT=3456
      - HOST=0.0.0.0
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3456/api/accounts"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

#### 3. 构建并运行

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

---

### 方式三：使用 systemd 部署（Linux）

#### 1. 创建 systemd 服务文件

```bash
sudo nano /etc/systemd/system/qq-farm-server.service
```

添加以下内容：

```ini
[Unit]
Description=QQ Farm Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/qq-farm-server
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3456
Environment=HOST=0.0.0.0

[Install]
WantedBy=multi-user.target
```

#### 2. 启动服务

```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start qq-farm-server

# 设置开机自启
sudo systemctl enable qq-farm-server

# 查看状态
sudo systemctl status qq-farm-server

# 查看日志
sudo journalctl -u qq-farm-server -f
```

---

## PM2 配置说明

### ecosystem.config.js 详解

```javascript
module.exports = {
  apps: [{
    // 应用名称
    name: 'qq-farm-server',
    
    // 入口文件
    script: './server.js',
    
    // 实例数量（1 表示单实例，'max' 表示根据 CPU 核心数）
    instances: 1,
    
    // 自动重启
    autorestart: true,
    
    // 文件变更监控（开发环境可开启）
    watch: false,
    
    // 内存限制，超过自动重启
    max_memory_restart: '256M',
    
    // 生产环境变量
    env: {
      NODE_ENV: 'production',
      PORT: 3456,
      HOST: '0.0.0.0'
    },
    
    // 开发环境变量
    env_development: {
      NODE_ENV: 'development',
      PORT: 3456,
      HOST: '0.0.0.0'
    },
    
    // 日志文件
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    
    // 日志日期格式
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // 合并日志
    merge_logs: true,
    
    // 优雅退出超时
    kill_timeout: 5000,
    
    // 监听超时
    listen_timeout: 10000,
    
    // 日志轮转
    log_rotate: true,
    log_max_size: '10M',
    log_retention: '7d'
  }]
};
```

### 常用 PM2 命令

```bash
# 启动应用
pm2 start ecosystem.config.js

# 开发模式启动（带监控）
pm2 start ecosystem.config.js --env development

# 查看状态
pm2 status
pm2 list

# 查看日志
pm2 logs qq-farm-server
pm2 logs qq-farm-server --lines 100

# 实时监控
pm2 monit

# 重启应用
pm2 restart qq-farm-server

# 重载应用（零停机）
pm2 reload qq-farm-server

# 停止应用
pm2 stop qq-farm-server

# 删除应用
pm2 delete qq-farm-server

# 保存当前配置
pm2 save

# 设置开机自启
pm2 startup

# 取消开机自启
pm2 unstartup

# 查看应用信息
pm2 describe qq-farm-server

# 查看应用指标
pm2 show qq-farm-server
```

### PM2 日志管理

```bash
# 清空日志
pm2 flush

# 日志轮转配置
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
```

---

## 环境变量配置

### 支持的环境变量

| 变量名 | 默认值 | 说明 | 示例 |
|--------|--------|------|------|
| `NODE_ENV` | `development` | 运行环境 | `production`, `development` |
| `PORT` | `3456` | 服务端口 | `8080` |
| `HOST` | `0.0.0.0` | 监听地址 | `127.0.0.1`, `0.0.0.0` |

### 配置方式

#### 方式1：命令行传入

```bash
NODE_ENV=production PORT=8080 node server.js
```

#### 方式2：.env 文件

创建 `.env` 文件：

```env
NODE_ENV=production
PORT=3456
HOST=0.0.0.0
```

安装 dotenv 包（如需使用）：

```bash
npm install dotenv
```

在 server.js 顶部添加：

```javascript
require('dotenv').config();
```

#### 方式3：PM2 配置

在 `ecosystem.config.js` 中配置：

```javascript
module.exports = {
  apps: [{
    env: {
      NODE_ENV: 'production',
      PORT: 3456,
      HOST: '0.0.0.0'
    }
  }]
};
```

#### 方式4：系统环境变量

**Linux/macOS:**

```bash
export NODE_ENV=production
export PORT=3456
export HOST=0.0.0.0
```

**Windows (PowerShell):**

```powershell
$env:NODE_ENV = "production"
$env:PORT = "3456"
$env:HOST = "0.0.0.0"
```

**Windows (CMD):**

```cmd
set NODE_ENV=production
set PORT=3456
set HOST=0.0.0.0
```

---

## 日志管理

### 日志文件结构

```
logs/
├── combined.log    # 合并日志（stdout + stderr）
├── out.log         # 标准输出日志
├── error.log       # 错误日志
└── archived/       # 归档日志（配置轮转后）
    ├── out-2026-02-24.log.gz
    └── error-2026-02-24.log.gz
```

### 日志格式

```
2026-02-24 14:30:00 +0800: [农场] 收获3/浇水2/除草1
2026-02-24 14:30:05 +0800: [好友] 小明: 偷2/除草1
2026-02-24 14:30:10 +0800: [系统] 账号启动成功
```

### 日志分析

```bash
# 查看实时日志
tail -f logs/combined.log

# 查看错误日志
tail -f logs/error.log

# 搜索特定关键词
grep "错误" logs/combined.log

# 统计日志行数
wc -l logs/combined.log

# 查看最近100行
 tail -n 100 logs/combined.log

# 按日期筛选
awk '/2026-02-24/ {print}' logs/combined.log

# 统计错误数量
grep -c "错误" logs/error.log
```

### 日志轮转

使用 logrotate（Linux）:

创建 `/etc/logrotate.d/qq-farm-server`:

```
/opt/qq-farm-server/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 www-data www-data
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

测试配置：

```bash
sudo logrotate -d /etc/logrotate.d/qq-farm-server
```

手动执行轮转：

```bash
sudo logrotate -f /etc/logrotate.d/qq-farm-server
```

---

## 监控与告警

### PM2 监控

```bash
# 启动 PM2 监控面板
pm2 monit

# 查看应用指标
pm2 show qq-farm-server
```

### 健康检查端点

应用提供以下健康检查端点：

```bash
# 基础健康检查
curl http://localhost:3456/api/accounts

# 检查服务是否响应
if curl -sf http://localhost:3456/api/accounts > /dev/null; then
    echo "服务正常"
else
    echo "服务异常"
fi
```

### 使用 PM2 Plus（可选）

PM2 Plus 提供 Web 监控面板：

```bash
# 注册并登录
pm2 plus

# 按照提示完成配置
# 访问 https://app.pm2.io/ 查看监控面板
```

### 自定义监控脚本

创建 `monitor.sh`:

```bash
#!/bin/bash

# 配置
APP_NAME="qq-farm-server"
WEBHOOK_URL="https://your-webhook-url"
CHECK_INTERVAL=60

# 检查服务状态
check_service() {
    if ! pm2 describe $APP_NAME > /dev/null 2>&1; then
        send_alert "PM2 进程不存在"
        return 1
    fi
    
    STATUS=$(pm2 jlist | jq -r ".[] | select(.name==\"$APP_NAME\") | .pm2_env.status")
    if [ "$STATUS" != "online" ]; then
        send_alert "服务状态异常: $STATUS"
        return 1
    fi
    
    # 检查 HTTP 响应
    if ! curl -sf http://localhost:3456/api/accounts > /dev/null 2>&1; then
        send_alert "HTTP 服务无响应"
        return 1
    fi
    
    return 0
}

# 发送告警
send_alert() {
    MESSAGE="[QQ农场服务器告警] $1"
    echo "$(date): $MESSAGE"
    
    # 发送 webhook（如有）
    if [ -n "$WEBHOOK_URL" ]; then
        curl -s -X POST -H "Content-Type: application/json" \
            -d "{\"message\":\"$MESSAGE\"}" \
            $WEBHOOK_URL
    fi
    
    # 发送邮件（可选）
    # echo "$MESSAGE" | mail -s "服务器告警" admin@example.com
}

# 主循环
while true; do
    check_service
    sleep $CHECK_INTERVAL
done
```

运行监控脚本：

```bash
chmod +x monitor.sh
nohup ./monitor.sh > monitor.log 2>&1 &
```

---

## 备份与恢复

### 备份策略

#### 1. 账号数据备份

账号数据存储在 `data/accounts.json`。

**手动备份:**

```bash
# 创建备份目录
mkdir -p /backup/qq-farm-server

# 备份账号数据
cp data/accounts.json /backup/qq-farm-server/accounts-$(date +%Y%m%d_%H%M%S).json

# 备份整个应用目录
tar -czf /backup/qq-farm-server/backup-$(date +%Y%m%d_%H%M%S).tar.gz \
    data/ logs/ package.json ecosystem.config.js
```

**自动备份脚本:**

创建 `backup.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/backup/qq-farm-server"
APP_DIR="/opt/qq-farm-server"
RETENTION_DAYS=30

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份账号数据
cp $APP_DIR/data/accounts.json $BACKUP_DIR/accounts-$(date +%Y%m%d_%H%M%S).json

# 清理旧备份
find $BACKUP_DIR -name "accounts-*.json" -mtime +$RETENTION_DAYS -delete

echo "备份完成: $(date)"
```

添加到 crontab:

```bash
# 每天凌晨 3 点执行备份
0 3 * * * /opt/qq-farm-server/backup.sh >> /var/log/qq-farm-backup.log 2>&1
```

#### 2. 配置备份

```bash
# 备份关键配置文件
cp ecosystem.config.js /backup/qq-farm-server/
cp package.json /backup/qq-farm-server/
```

### 恢复步骤

#### 恢复账号数据

```bash
# 停止服务
pm2 stop qq-farm-server

# 恢复账号数据
cp /backup/qq-farm-server/accounts-20260224_120000.json data/accounts.json

# 重启服务
pm2 restart qq-farm-server
```

#### 完整恢复

```bash
# 1. 停止并删除现有服务
pm2 stop qq-farm-server
pm2 delete qq-farm-server

# 2. 恢复应用目录
cd /opt
tar -xzf /backup/qq-farm-server/backup-20260224_120000.tar.gz

# 3. 安装依赖
cd qq-farm-server
npm install --production

# 4. 启动服务
pm2 start ecosystem.config.js
pm2 save
```

---

## 故障排查

### 常见问题及解决方案

#### 1. 服务无法启动

**症状**: PM2 状态显示 `errored`

**排查步骤**:

```bash
# 查看错误日志
pm2 logs qq-farm-server --lines 50

# 检查端口占用
netstat -tlnp | grep 3456
# 或
lsof -i :3456

# 检查权限
ls -la data/
ls -la logs/

# 手动运行查看错误
cd /opt/qq-farm-server
node server.js
```

**常见原因**:
- 端口被占用
- 权限不足（无法创建 data/logs 目录）
- 依赖未安装
- 配置文件错误

#### 2. 内存占用过高

**症状**: 服务被 PM2 频繁重启

**排查步骤**:

```bash
# 查看内存使用
pm2 show qq-farm-server

# 查看 Node.js 内存使用
ps aux | grep node

# 生成堆快照（需要安装 heapdump）
kill -USR2 <pid>
```

**解决方案**:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    max_memory_restart: '512M',  // 增加内存限制
    // 或减少账号数量
    // 或增加检查间隔
  }]
};
```

#### 3. WebSocket 连接断开

**症状**: 账号频繁掉线

**排查步骤**:

```bash
# 检查网络连接
ping gate-obt.nqf.qq.com

# 检查 WebSocket 连接
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Host: gate-obt.nqf.qq.com" \
  -H "Origin: https://gate-obt.nqf.qq.com" \
  https://gate-obt.nqf.qq.com/
```

**解决方案**:
- 检查网络稳定性
- 检查防火墙设置
- 调整心跳间隔（config.js）

#### 4. 登录失败

**症状**: 启动账号时提示 "登录码已过期"

**排查步骤**:

```bash
# 检查账号配置
cat data/accounts.json | jq '.[] | {name, platform}'

# 测试扫码登录
curl -X POST http://localhost:3456/api/qr-login
```

**解决方案**:
- 重新扫码获取登录码
- 检查系统时间是否正确

### 调试模式

启动调试模式获取更多信息：

```bash
# 设置调试环境变量
DEBUG=* node server.js

# 或只查看特定模块
DEBUG=express:* node server.js
```

### 联系支持

如果以上方法无法解决问题：

1. 收集以下信息：
   - 错误日志（logs/error.log）
   - 应用状态（`pm2 show qq-farm-server`）
   - 系统信息（`uname -a`, `node -v`）

2. 提交 Issue 到项目仓库

---

## 安全建议

### 1. 网络安全

- **不要**将服务直接暴露在公网（如需外网访问，使用 VPN 或反向代理）
- 使用防火墙限制访问 IP
- 考虑使用 Nginx 反向代理并启用 HTTPS

### 2. 账号安全

- 定期更换登录码
- 不要将账号数据提交到 Git
- 备份文件设置适当的权限

```bash
# 设置文件权限
chmod 600 data/accounts.json
chmod 700 data/
```

### 3. 系统安全

- 及时更新 Node.js 和依赖包
- 使用非 root 用户运行服务
- 定期审查日志文件

### 4. Nginx 反向代理配置（可选）

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用 HTTPS:

```bash
# 使用 Certbot 获取 SSL 证书
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 更新与维护

### 更新应用

```bash
# 1. 备份数据
cp data/accounts.json /backup/accounts-$(date +%Y%m%d).json

# 2. 拉取最新代码
git pull origin main

# 3. 更新依赖
npm install --production

# 4. 重启服务
pm2 reload qq-farm-server

# 5. 验证更新
curl http://localhost:3456/api/accounts
```

### 定期维护任务

| 任务 | 频率 | 命令 |
|------|------|------|
| 更新依赖 | 每月 | `npm update` |
| 清理日志 | 每周 | `pm2 flush` |
| 备份数据 | 每天 | 自动脚本 |
| 检查磁盘空间 | 每周 | `df -h` |
| 检查内存使用 | 每天 | `pm2 show qq-farm-server` |

---

## 参考资源

- [PM2 官方文档](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Node.js 部署最佳实践](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [systemd 服务配置](https://www.freedesktop.org/software/systemd/man/systemd.service.html)
- [Docker 文档](https://docs.docker.com/)
