# QQ农场共享版服务器 - 架构文档

## 文档信息

- **版本**: 1.0.0
- **最后更新**: 2026-02-24
- **架构风格**: 分层架构 + 事件驱动

---

## 目录

1. [系统概述](#系统概述)
2. [系统架构图](#系统架构图)
3. [核心模块](#核心模块)
4. [数据流说明](#数据流说明)
5. [技术选型](#技术选型)
6. [目录结构](#目录结构)
7. [关键设计决策](#关键设计决策)

---

## 系统概述

QQ农场共享版服务器是一个多账号农场游戏自动化管理服务器，支持：

- **多账号管理**: 同时管理多个 QQ/微信农场账号
- **自动化操作**: 自动收获、种植、浇水、除草、除虫、偷菜
- **实时通信**: WebSocket 实时推送账号状态和日志
- **扫码登录**: 支持 QQ 扫码获取登录授权码
- **Web 控制台**: 基于 Material Design 3 的响应式管理界面

---

## 系统架构图

### 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              客户端层 (Client Layer)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐ │
│  │   Web 控制台    │    │   Node.js SDK   │    │      第三方客户端        │ │
│  │  (public/)      │    │   (sdk/)        │    │                         │ │
│  │                 │    │                 │    │                         │ │
│  │  - index.html   │    │  - 程序化控制    │    │  - 自定义脚本            │ │
│  │  - app.js       │    │  - 自动化集成    │    │  - 定时任务              │ │
│  │  - style.css    │    │  - 状态监控      │    │                         │ │
│  └────────┬────────┘    └────────┬────────┘    └────────────┬────────────┘ │
│           │                      │                          │              │
│           │ HTTP/WebSocket       │ HTTP/WebSocket           │ HTTP         │
│           │                      │                          │              │
└───────────┼──────────────────────┼──────────────────────────┼──────────────┘
            │                      │                          │
            ▼                      ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API 网关层 (API Gateway)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                         ┌─────────────────┐                                 │
│                         │   Express App   │                                 │
│                         │   (server.js)   │                                 │
│                         └────────┬────────┘                                 │
│                                  │                                          │
│              ┌───────────────────┼───────────────────┐                      │
│              │                   │                   │                      │
│              ▼                   ▼                   ▼                      │
│    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐             │
│    │  RESTful API    │ │  WebSocket API  │ │   静态文件服务   │             │
│    │                 │ │                 │ │                 │             │
│    │  /api/accounts  │ │  ws://host      │ │  /index.html    │             │
│    │  /api/status    │ │                 │ │  /app.js        │             │
│    │  /api/qr-login  │ │  实时推送       │ │  /style.css     │             │
│    └────────┬────────┘ └────────┬────────┘ └─────────────────┘             │
│             │                   │                                           │
└─────────────┼───────────────────┼───────────────────────────────────────────┘
              │                   │
              ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          业务逻辑层 (Business Logic)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────┐    ┌─────────────────────────────────────────┐│
│  │     FarmManager         │◄───│         AccountManager                  ││
│  │    (FarmManager.js)     │    │        (AccountManager.js)              ││
│  │                         │    │                                         ││
│  │  - 多连接管理            │    │  - 账号 CRUD                            ││
│  │  - 生命周期管理          │    │  - 数据持久化                            ││
│  │  - 事件广播              │    │  - 配置管理                              ││
│  │  - 批量操作              │    │                                         ││
│  └───────────┬─────────────┘    └─────────────────────────────────────────┘│
│              │                                                              │
│              │ 管理多个 FarmConnection 实例                                 │
│              ▼                                                              │
│  ┌─────────────────────────┐                                               │
│  │    FarmConnection       │                                               │
│  │   (FarmConnection.js)   │                                               │
│  │                         │                                               │
│  │  - WebSocket 连接        │                                               │
│  │  - 游戏协议通信          │                                               │
│  │  - 自动化操作循环        │                                               │
│  │  - 状态管理              │                                               │
│  └───────────┬─────────────┘                                               │
│              │                                                              │
└──────────────┼──────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          协议层 (Protocol Layer)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────┐    ┌─────────────────────────────────────────┐ │
│  │     Proto Loader        │    │          QQ QR Login                   │ │
│  │      (proto.js)         │    │        (qqQrLogin.js)                  │ │
│  │                         │    │                                         │ │
│  │  - Protocol Buffer      │    │  - 扫码登录流程                          │ │
│  │    消息编解码            │    │  - 状态轮询                              │ │
│  │  - 消息类型定义          │    │  - 授权码获取                            │ │
│  │  - 网关消息封装          │    │                                         │ │
│  └─────────────────────────┘    └─────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        外部服务层 (External Services)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────┐    ┌─────────────────────────────────────────┐ │
│  │   QQ Farm WebSocket     │    │        QQ OAuth API                    │ │
│  │   (wss://gate-obt...)   │    │   (q.qq.com / h5.qzone.qq.com)         │ │
│  │                         │    │                                         │ │
│  │  - 游戏服务器连接        │    │  - 扫码登录接口                          │ │
│  │  - 实时游戏数据          │    │  - 授权码换取                            │ │
│  │  - 操作指令下发          │    │                                         │ │
│  └─────────────────────────┘    └─────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 模块依赖关系

```
server.js (入口)
    │
    ├── AccountManager ───┐
    │       │             │
    │       ▼             │
    │   data/accounts.json (文件存储)
    │                     │
    ├── FarmManager ──────┤
    │       │             │
    │       ▼             │
    │   FarmConnection ◄──┘
    │       │
    │       ├── proto.js (Protocol Buffer)
    │       │
    │       ├── gameConfig.js (游戏配置)
    │       │
    │       ├── utils.js (工具函数)
    │       │
    │       └── calc-exp-yield.js (种植推荐算法)
    │
    ├── qqQrLogin.js (扫码登录)
    │
    └── public/ (Web 控制台静态文件)
```

---

## 核心模块

### 1. server.js - 服务器入口

**职责**: HTTP 服务器和 WebSocket 服务器的创建与配置

**主要功能**:
- Express 应用配置（中间件、路由）
- WebSocket 服务器创建
- RESTful API 路由定义
- 全局状态管理（AccountManager、FarmManager 实例）
- 优雅退出处理

**关键代码**:
```javascript
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 全局状态
const accountManager = new AccountManager();
const farmManager = new FarmManager(accountManager);
```

---

### 2. AccountManager - 账号管理器

**文件**: `src/AccountManager.js`

**职责**: 管理账号的增删改查和持久化

**主要功能**:
- 账号 CRUD 操作
- 数据持久化到 JSON 文件
- 配置管理

**数据结构**:
```javascript
{
  id: "uuid",
  name: "账号名称",
  code: "登录授权码",
  platform: "qq|wx",
  config: { ... },
  createdAt: "ISO时间",
  updatedAt: "ISO时间"
}
```

**存储位置**: `data/accounts.json`

---

### 3. FarmManager - 农场管理器

**文件**: `src/FarmManager.js`

**职责**: 管理多个农场连接的生命周期和状态

**主要功能**:
- 启动/停止单个或多个账号
- 管理 FarmConnection 实例集合
- 事件广播（通过 WebSocket 推送到客户端）
- 批量操作
- 连接状态监控

**核心方法**:
- `startAccount(accountId)`: 启动单个账号
- `stopAccount(accountId)`: 停止单个账号
- `startAll()`: 启动所有账号
- `stopAll()`: 停止所有账号
- `getAllStatus()`: 获取所有账号状态

---

### 4. FarmConnection - 农场连接

**文件**: `src/FarmConnection.js`

**职责**: 封装单个账号的 WebSocket 连接和游戏操作

**主要功能**:
- 与 QQ 农场服务器建立 WebSocket 连接
- Protocol Buffer 消息编解码
- 自动化操作循环（农场检查、好友检查、出售、任务）
- 状态管理和事件触发
- 日志记录

**自动化循环**:

```
┌─────────────────────────────────────────────────────────────┐
│                      FarmConnection                         │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ 农场检查循环  │  │ 好友检查循环  │  │    出售循环       │  │
│  │              │  │              │  │                  │  │
│  │ 每10秒执行   │  │ 每10秒执行   │  │ 每60秒执行       │  │
│  │              │  │              │  │                  │  │
│  │ - 检查土地   │  │ - 获取好友   │  │ - 检查仓库       │  │
│  │ - 收获作物   │  │ - 访问农场   │  │ - 出售果实       │  │
│  │ - 浇水除草   │  │ - 偷取作物   │  │                  │  │
│  │ - 铲除枯萎   │  │ - 帮助好友   │  │                  │  │
│  │ - 自动种植   │  │              │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │   任务循环    │  │  心跳检测    │                        │
│  │              │  │              │                        │
│  │ 每5分钟执行  │  │ 每25秒发送   │                        │
│  │              │  │              │                        │
│  │ - 检查任务   │  │ - 保持连接   │                        │
│  │ - 领取奖励   │  │ - 同步时间   │                        │
│  └──────────────┘  └──────────────┘                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 5. Proto Loader - 协议加载器

**文件**: `src/proto.js`

**职责**: 加载和初始化 Protocol Buffer 消息类型

**主要功能**:
- 加载 `.proto` 文件
- 创建消息编解码器
- 提供消息类型定义

**加载的 Proto 文件**:
- `game.proto` - 网关消息格式
- `userpb.proto` - 用户相关（登录、心跳）
- `plantpb.proto` - 农场操作（种植、收获、浇水等）
- `shoppb.proto` - 商店操作
- `friendpb.proto` - 好友系统
- `visitpb.proto` - 访问好友农场
- `itempb.proto` - 背包/仓库
- `taskpb.proto` - 任务系统
- `notifypb.proto` - 服务器推送通知

---

### 6. GameConfig - 游戏配置

**文件**: `src/gameConfig.js`

**职责**: 加载和查询游戏静态数据

**数据来源**:
- `gameConfig/Plant.json` - 作物配置
- `gameConfig/RoleLevel.json` - 等级经验配置
- `gameConfig/ItemInfo.json` - 物品信息

**主要功能**:
- 作物名称查询
- 经验进度计算
- 生长时间计算

---

### 7. QQ QR Login - 扫码登录

**文件**: `src/qqQrLogin.js`

**职责**: 实现 QQ 扫码登录流程

**流程**:
1. 调用 `GetLoginCode` 获取登录码和二维码 URL
2. 展示二维码给用户
3. 轮询 `syncScanSateGetTicket` 检查扫码状态
4. 扫码成功后调用 `login` 换取农场授权码

---

## 数据流说明

### 1. 账号启动流程

```
用户操作 (Web/API)
    │
    ▼
POST /api/accounts/:id/start
    │
    ▼
FarmManager.startAccount(accountId)
    │
    ├──► 从 AccountManager 获取账号配置
    │
    ├──► 创建 FarmConnection 实例
    │         │
    │         ├──► 设置事件监听器
    │         │         - connected
    │         │         - disconnected
    │         │         - stateChanged
    │         │         - statsChanged
    │         │         - log
    │         │
    │         └──► 调用 connect()
    │                   │
    │                   ├──► 建立 WebSocket 连接
    │                   │         wss://gate-obt.nqf.qq.com
    │                   │
    │                   ├──► 发送 Login 请求
    │                   │         (Protocol Buffer)
    │                   │
    │                   ├──► 接收登录响应
    │                   │         获取 gid, name, level, gold, exp
    │                   │
    │                   ├──► 启动心跳定时器 (25秒)
    │                   │
    │                   ├──► 启动农场检查循环 (10秒)
    │                   │
    │                   ├──► 启动好友检查循环 (10秒)
    │                   │
    │                   ├──► 启动出售循环 (60秒)
    │                   │
    │                   └──► 启动任务循环 (5分钟)
    │
    └──► 保存连接实例
              connections.set(accountId, connection)
```

### 2. 农场操作数据流

```
FarmConnection.checkFarm()
    │
    ├──► 发送 AllLands 请求
    │         gamepb.plantpb.PlantService.AllLands
    │
    ├──► 接收土地数据
    │         lands: [{id, plant, unlocked, ...}]
    │
    ├──► analyzeLands(lands)
    │         │
    │         ├──► 判断每块土地状态
    │         │         - 成熟可收获
    │         │         - 需要浇水
    │         │         - 需要除草
    │         │         - 需要除虫
    │         │         - 枯萎需铲除
    │         │         - 空地可种植
    │         │
    │         └──► 返回操作列表
    │                   {harvestable, needWater, needWeed, needBug, dead, empty}
    │
    ├──► 批量执行操作
    │         │
    │         ├──► weedOut(needWeed)     除草
    │         ├──► insecticide(needBug)  除虫
    │         ├──► waterLand(needWater)  浇水
    │         ├──► harvest(harvestable)  收获
    │         └──► autoPlantEmptyLands() 铲除枯萎并种植
    │
    └──► 记录日志并触发事件
              emit('log', {tag: '农场', message: '收获3/浇水2'})
              emit('statsChanged', stats)
```

### 3. WebSocket 实时推送流程

```
FarmConnection 事件触发
    │
    ├──► connected
    │         │
    │         └──► FarmManager.broadcast(accountId, {
    │                   type: 'accountConnected',
    │                   accountId,
    │                   data: {...}
    │               })
    │
    ├──► log
    │         │
    │         └──► FarmManager.broadcast(accountId, {
    │                   type: 'log',
    │                   accountId,
    │                   data: {time, tag, message}
    │               })
    │
    └──► stateChanged
              │
              └──► FarmManager.broadcast(accountId, {
                        type: 'stateChanged',
                        accountId,
                        data: {level, gold, exp}
                    })

FarmManager.broadcast()
    │
    └──► broadcastCallback(accountId, message)
              │
              └──► server.js::broadcastToSubscribers()
                        │
                        └──► 遍历所有 WebSocket 客户端
                                  │
                                  ├──► 检查客户端是否订阅了该账号
                                  │         client.subscriptions.has(accountId)
                                  │
                                  └──► 发送消息
                                            ws.send(JSON.stringify(message))
```

### 4. 扫码登录数据流

```
用户请求扫码登录
    │
    ▼
POST /api/qr-login
    │
    ├──► 生成 sessionId (UUID)
    │
    └──► 保存会话状态
              qrLoginSessions.set(sessionId, {
                  status: 'pending',
                  timestamp: Date.now()
              })

用户获取二维码
    │
    ▼
GET /api/qr-login/:sessionId/url
    │
    ├──► 调用 requestLoginCode()
    │         │
    │         └──► HTTP GET https://q.qq.com/ide/devtoolAuth/GetLoginCode
    │
    ├──► 获取 {loginCode, url}
    │
    └──► 更新会话状态
              qrLoginSessions.set(sessionId, {
                  status: 'waiting',
                  loginCode,
                  timestamp: Date.now()
              })

用户轮询扫码状态
    │
    ▼
GET /api/qr-login/:sessionId/status
    │
    ├──► 调用 queryScanStatus(loginCode)
    │         │
    │         └──► HTTP GET https://q.qq.com/ide/devtoolAuth/syncScanSateGetTicket
    │
    ├──► 检查返回状态
    │         - Wait: 继续等待
    │         - OK: 扫码成功
    │         - Used: 二维码过期
    │
    └──► 如果扫码成功
              │
              ├──► 调用 getAuthCode(ticket)
              │         │
              │         └──► HTTP POST https://q.qq.com/ide/login
              │
              ├──► 获取农场授权码 code
              │
              └──► 更新会话状态
                        qrLoginSessions.set(sessionId, {
                            status: 'success',
                            code
                        })
```

---

## 技术选型

### 后端技术栈

| 技术 | 版本 | 用途 | 选型理由 |
|------|------|------|----------|
| Node.js | >= 18 | 运行时 | 事件驱动、非阻塞 I/O，适合高并发连接 |
| Express | ^4.18.2 | Web 框架 | 简洁、成熟、生态丰富 |
| WebSocket (ws) | ^8.19.0 | 实时通信 | 轻量、性能优秀、API 简洁 |
| Protocol Buffer | ^8.0.0 | 协议编解码 | 与游戏服务器通信的标准格式 |
| Axios | ^1.13.5 | HTTP 客户端 | 功能完善、支持拦截器 |
| UUID | ^9.0.0 | 唯一标识生成 | 标准 UUID v4 实现 |
| Long | ^5.3.2 | 64位整数处理 | Protocol Buffer 需要 |

### 前端技术栈

| 技术 | 用途 | 选型理由 |
|------|------|----------|
| 原生 JavaScript (ES6+) | 逻辑实现 | 无需构建工具，轻量快速 |
| Material Design 3 | UI 设计系统 | 现代化、一致性、响应式 |
| Material Symbols | 图标字体 | 官方图标库，风格统一 |
| CSS Variables | 主题管理 | 支持动态主题切换 |

### 数据存储

| 存储 | 用途 | 选型理由 |
|------|------|----------|
| JSON 文件 | 账号配置持久化 | 简单场景无需数据库，易于备份和版本控制 |
| 内存 Map | 运行时状态 | 快速访问，适合临时状态 |

---

## 目录结构

```
qq-farm-server/
├── docs/                          # 文档目录
│   ├── api-reference.md           # API 参考文档
│   ├── architecture.md            # 架构文档
│   ├── development-guide.md       # 开发指南
│   └── deployment-guide.md        # 部署文档
│
├── src/                           # 源代码
│   ├── server.js                  # 服务器入口
│   ├── AccountManager.js          # 账号管理器
│   ├── FarmManager.js             # 农场管理器
│   ├── FarmConnection.js          # 农场连接
│   ├── proto.js                   # Protocol Buffer 加载
│   ├── gameConfig.js              # 游戏配置
│   ├── qqQrLogin.js               # 扫码登录
│   ├── config.js                  # 常量配置
│   └── utils.js                   # 工具函数
│
├── public/                        # Web 控制台静态文件
│   ├── index.html                 # 主页面
│   ├── app.js                     # 前端逻辑
│   └── style.css                  # 样式表
│
├── sdk/                           # Node.js SDK
│   ├── index.js                   # SDK 主文件
│   ├── example.js                 # 使用示例
│   └── README.md                  # SDK 说明
│
├── proto/                         # Protocol Buffer 定义
│   ├── game.proto                 # 网关消息
│   ├── userpb.proto               # 用户服务
│   ├── plantpb.proto              # 种植服务
│   ├── shoppb.proto               # 商店服务
│   ├── friendpb.proto             # 好友服务
│   ├── visitpb.proto              # 访问服务
│   ├── itempb.proto               # 背包服务
│   ├── taskpb.proto               # 任务服务
│   ├── notifypb.proto             # 通知服务
│   └── corepb.proto               # 核心类型
│
├── gameConfig/                    # 游戏静态配置
│   ├── Plant.json                 # 作物配置
│   ├── RoleLevel.json             # 等级经验
│   └── ItemInfo.json              # 物品信息
│
├── tools/                         # 工具脚本
│   ├── calc-exp-yield.js          # 经验收益计算
│   └── seed-shop-merged-export.json # 种子商店数据
│
├── data/                          # 运行时数据（自动创建）
│   └── accounts.json              # 账号存储
│
├── logs/                          # 日志目录（PM2）
│   ├── combined.log
│   ├── out.log
│   └── error.log
│
├── ecosystem.config.js            # PM2 配置
├── package.json                   # 项目配置
├── package-lock.json              # 依赖锁定
└── README.md                      # 项目说明
```

---

## 关键设计决策

### 1. 为什么选择文件存储而非数据库？

**决策**: 使用 JSON 文件存储账号配置

**理由**:
- 数据量小（账号数量通常 < 100）
- 结构简单，无需复杂查询
- 易于备份和版本控制
- 零依赖，部署简单
- 账号数据不涉及敏感信息（code 需要定期更新）

**权衡**:
- 并发写入可能存在竞争（当前通过单进程模型避免）
- 不适合大规模数据

### 2. 为什么使用 Protocol Buffer？

**决策**: 使用 protobufjs 与游戏服务器通信

**理由**:
- QQ 农场服务器使用 Protocol Buffer 作为通信格式
- 二进制格式，节省带宽
- 强类型，减少解析错误
- 支持向前/向后兼容

### 3. 为什么采用事件驱动架构？

**决策**: FarmConnection 继承 EventEmitter

**理由**:
- 松耦合，FarmManager 无需了解连接内部细节
- 支持多个监听器（日志、状态更新、WebSocket 推送）
- 符合 Node.js 异步编程模型

### 4. 为什么使用双 API（REST + WebSocket）？

**决策**: 同时提供 RESTful API 和 WebSocket API

**理由**:
- RESTful: 适合请求-响应模式（CRUD 操作）
- WebSocket: 适合实时推送（状态更新、日志）
- 两者互补，满足不同场景需求

### 5. 自动化操作的循环间隔设计

| 循环 | 间隔 | 理由 |
|------|------|------|
| 农场检查 | 10秒 | 平衡实时性和服务器压力 |
| 好友检查 | 10秒 | 与农场检查同步，避免并发峰值 |
| 出售果实 | 60秒 | 不需要太频繁，减少 API 调用 |
| 领取任务 | 5分钟 | 任务刷新频率较低 |
| 心跳 | 25秒 | 保持连接，避免被服务器断开 |

### 6. 连接状态监控设计

**决策**: 每 10 秒检查一次连接状态，60 秒无响应判定为断开

**理由**:
- 心跳间隔 25 秒，60 秒可以容忍 2 次心跳丢失
- 避免过于敏感的断线检测
- 及时发现问题连接

### 7. 种子选择算法

**决策**: 使用经验效率算法 + 兜底策略

**算法流程**:
1. 优先使用 `calc-exp-yield.js` 计算的经验效率排名
2. 如果算法失败，使用兜底策略：
   - 28级以下：种植白萝卜（最低等级）
   - 28级以上：种植当前最高等级可用作物

**理由**:
- 经验效率算法考虑种植速度、生长时间、经验收益
- 兜底策略确保算法失败时仍有合理行为
