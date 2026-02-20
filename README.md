# QQ农场共享版服务器

基于 [qq-farm-bot](https://github.com/linguo2625469/qq-farm-bot) 改造的多账号共享版服务器，支持通过 RESTful API 和 WebUI 管理多个 QQ/微信农场账号。

## ✨ 特性

- 🌾 **多账号管理** - 同时管理多个 QQ/微信农场账号
- 🚀 **RESTful API** - 完整的 API 接口，支持第三方集成
- 🎨 **极简 WebUI** - 深色主题，青绿色/橙色点缀，不用紫色
- 📊 **实时监控** - WebSocket 实时推送账号状态和日志
- ⚙️ **独立配置** - 每个账号可单独配置功能开关和检查间隔
- 🔄 **自动功能** - 自动收获、种植、施肥、除草、除虫、浇水、偷菜、出售、领任务

## 🚀 快速开始

### 安装

```bash
cd qq-farm-server
npm install
```

### 启动

```bash
npm start
```

服务器将在 http://localhost:3000 启动

## 📖 使用指南

### 1. 添加账号

1. 打开 WebUI: http://localhost:3000
2. 点击"账号管理" → "添加账号"
3. 填写账号信息：
   - **名称**: 给账号起个名字
   - **登录码**: 从小程序抓包获取 WebSocket 连接中的 `code` 参数
   - **平台**: QQ 或 微信
   - **检查间隔**: 农场和好友检查间隔（秒）
   - **功能开关**: 偷菜、帮助好友、自动出售

### 2. 获取登录码 (Code)

使用抓包工具（如 Fiddler、Charles、mitmproxy 等）抓取小程序 WebSocket 连接 URL 中的 `code` 参数。

QQ平台支持扫码登录，微信需要手动抓包。

### 3. 启动挂机

- 单个账号：在账号列表中点击"启动"
- 全部启动：点击顶部"启动全部"按钮

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

### 添加账号示例

```bash
curl -X POST http://localhost:3000/api/accounts \
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

## 🎨 WebUI 截图

- **深色主题** - 保护眼睛
- **青绿色点缀** - 代表生长和活力
- **橙色点缀** - 代表收获和成果
- **实时日志** - 带颜色区分的标签
- **统计卡片** - 直观的数据展示

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
├── src/
│   ├── AccountManager.js  # 账号管理
│   ├── FarmManager.js     # 农场管理器
│   ├── FarmConnection.js  # 单个农场连接
│   ├── config.js          # 配置常量
│   ├── proto.js           # Protobuf 定义
│   ├── utils.js           # 工具函数
│   ├── gameConfig.js      # 游戏配置
│   └── qqQrLogin.js       # QQ扫码登录
├── proto/                 # Protobuf 文件
├── gameConfig/            # 游戏配置数据
├── public/                # WebUI 静态文件
│   ├── index.html
│   ├── style.css
│   └── app.js
└── data/                  # 数据存储目录
    └── accounts.json      # 账号数据
```

## ⚠️ 免责声明

本项目仅供学习和研究用途。使用本脚本可能违反游戏服务条款，由此产生的一切后果由使用者自行承担。

## 📄 License

MIT
