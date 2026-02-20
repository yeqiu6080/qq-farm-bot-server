# QQ农场共享版服务器

基于 [qq-farm-bot](https://github.com/linguo2625469/qq-farm-bot) 改造的多账号共享版服务器，支持通过 RESTful API 和 WebUI 管理多个 QQ/微信农场账号。

## ✨ 特性

- 🌾 **多账号管理** - 同时管理多个 QQ/微信农场账号
- 🚀 **RESTful API** - 完整的 API 接口，支持第三方集成
- 📦 **Node.js SDK** - 提供易用的 SDK 进行二次开发
- 🎨 **极简 WebUI** - 深色主题，青绿色/橙色点缀，不用紫色
- 📊 **实时监控** - WebSocket 实时推送账号状态和日志
- ⚙️ **独立配置** - 每个账号可单独配置功能开关和检查间隔
- 🔄 **自动功能** - 自动收获、种植、施肥、除草、除虫、浇水、偷菜、出售、领任务
- 📱 **扫码登录** - 支持 QQ 扫码登录，自动获取账号信息

## 🚀 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm >= 8.0.0

### 安装

```bash
cd qq-farm-server
npm install
```

### 启动

**开发模式：**
```bash
npm run dev
# 或
npm run sv
```

**生产模式（使用 PM2）：**
```bash
npm start
```

服务器将在 http://localhost:3456 启动

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务器端口 | 3456 |
| `HOST` | 服务器主机 | 0.0.0.0 |
| `NODE_ENV` | 运行环境 | development |

## 📖 使用指南

### 1. 添加账号

#### 方式一：WebUI 添加

1. 打开 WebUI: http://localhost:3456
2. 点击"账号管理" → "添加账号"
3. 选择登录方式：
   - **扫码登录**（推荐）：QQ 扫码自动获取登录码
   - **手动输入**：填写抓包获取的登录码

#### 方式二：API 添加

```bash
curl -X POST http://localhost:3456/api/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "主号",
    "code": "your_code_here",
    "platform": "qq",
    "config": {
      "farmCheckInterval": 10,
      "friendCheckInterval": 10,
      "enableSteal": true,
      "enableFriendHelp": true,
      "enableSell": true
    }
  }'
```

### 2. 获取登录码 (Code)

**QQ 平台（推荐扫码登录）：**
- 使用 WebUI 的扫码登录功能
- 或手动抓包获取 WebSocket 连接中的 `code` 参数

**微信平台：**
- 使用抓包工具（如 Fiddler、Charles、mitmproxy 等）抓取小程序 WebSocket 连接 URL 中的 `code` 参数

### 3. 启动挂机

- **单个账号**：在账号列表中点击"启动"
- **全部启动**：点击顶部"启动全部"按钮
- **API 方式**：`POST /api/start-all`

## 🔌 API 接口

### 账号管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/accounts` | 获取所有账号 |
| GET | `/api/accounts/:id` | 获取单个账号 |
| POST | `/api/accounts` | 添加账号 |
| PUT | `/api/accounts/:id` | 更新账号 |
| DELETE | `/api/accounts/:id` | 删除账号 |

### 控制接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/accounts/:id/start` | 启动账号 |
| POST | `/api/accounts/:id/stop` | 停止账号 |
| GET | `/api/accounts/:id/status` | 获取账号状态 |
| GET | `/api/accounts/:id/logs` | 获取账号日志 |
| POST | `/api/start-all` | 启动所有账号 |
| POST | `/api/stop-all` | 停止所有账号 |

### 连接状态

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 获取所有账号状态 |
| GET | `/api/accounts/:id/connection` | 获取账号连接状态 |
| GET | `/api/connections` | 获取所有连接状态 |
| POST | `/api/cleanup` | 清理已停止的连接 |

### 扫码登录

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/qr-login` | 创建扫码登录会话 |
| GET | `/api/qr-login/:sessionId/url` | 获取二维码 URL |
| GET | `/api/qr-login/:sessionId/status` | 查询扫码状态 |

### 统计数据

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stats` | 获取服务器统计信息 |

### 操作执行

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/accounts/:id/action` | 执行单次操作 |

## 📦 SDK 使用

项目包含一个易用的 Node.js SDK，位于 `sdk/` 目录。

### 快速开始

```javascript
const QFarmSDK = require('./sdk');

// 创建 SDK 实例
const sdk = new QFarmSDK({
    baseURL: 'http://localhost:3456',
    timeout: 30000
});

// 扫码登录并添加账号
const result = await sdk.fullQrLogin({
    onStatus: (status) => console.log(status.message)
});

// 启动账号
await sdk.startAccount(result.account.id);
```

更多 SDK 用法请参考 [sdk/README.md](./sdk/README.md)

## 🎨 WebUI 特性

- **深色主题** - 保护眼睛
- **青绿色点缀** - 代表生长和活力
- **橙色点缀** - 代表收获和成果
- **实时日志** - 带颜色区分的标签
- **统计卡片** - 直观的数据展示
- **扫码登录** - 支持 QQ 扫码快速添加账号

## ⚙️ 配置说明

每个账号可以独立配置：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `farmCheckInterval` | 农场检查间隔（秒） | 10 |
| `friendCheckInterval` | 好友检查间隔（秒） | 10 |
| `forceLowestLevelCrop` | 强制种植最低等级作物 | false |
| `enableFriendHelp` | 启用帮助好友 | true |
| `enableSteal` | 启用偷菜 | true |
| `enableSell` | 自动出售果实 | true |
| `enableTask` | 自动领取任务 | true |

## 📁 项目结构

```
qq-farm-server/
├── server.js              # 服务器入口
├── package.json
├── ecosystem.config.js    # PM2 配置文件
├── src/
│   ├── AccountManager.js  # 账号管理
│   ├── FarmManager.js     # 农场管理器
│   ├── FarmConnection.js  # 单个农场连接
│   ├── config.js          # 配置常量
│   ├── proto.js           # Protobuf 定义
│   ├── utils.js           # 工具函数
│   ├── gameConfig.js      # 游戏配置
│   └── qqQrLogin.js       # QQ扫码登录
├── sdk/                   # Node.js SDK
│   ├── index.js           # SDK 主文件
│   ├── example.js         # 使用示例
│   └── README.md          # SDK 文档
├── proto/                 # Protobuf 文件
├── gameConfig/            # 游戏配置数据
│   ├── ItemInfo.json      # 物品信息
│   ├── Plant.json         # 作物信息
│   └── RoleLevel.json     # 等级信息
├── public/                # WebUI 静态文件
│   ├── index.html
│   ├── style.css
│   └── app.js
└── data/                  # 数据存储目录
    └── accounts.json      # 账号数据
```

## 🔧 PM2 管理

```bash
# 启动
pm2 start ecosystem.config.js

# 停止
pm2 stop qq-farm-server

# 重启
pm2 restart qq-farm-server

# 查看日志
pm2 logs qq-farm-server

# 监控
pm2 monit
```

## 🌐 WebSocket 实时通信

服务器支持 WebSocket 实时推送：

```javascript
const ws = new WebSocket('ws://localhost:3456');

// 订阅账号更新
ws.send(JSON.stringify({
    action: 'subscribe',
    accountId: 'account-id'
}));

// 监听消息
ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log(message.type, message.data);
};
```

### 消息类型

- `connected` - 连接成功
- `accountConnected` - 账号已连接
- `accountDisconnected` - 账号已断开
- `connectionLost` - 连接丢失
- `stateChanged` - 状态变更
- `statsChanged` - 统计数据变更
- `log` - 日志消息

## ⚠️ 免责声明

本项目仅供学习和研究用途。使用本脚本可能违反游戏服务条款，由此产生的一切后果由使用者自行承担。

## 📄 License

MIT
