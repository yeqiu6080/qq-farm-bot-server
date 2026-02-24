# QQ农场共享版服务器 - API 参考文档

## 文档信息

- **版本**: 1.0.0
- **最后更新**: 2026-02-24
- **服务器地址**: `http://localhost:3456` (默认)

---

## 目录

1. [概述](#概述)
2. [RESTful API](#restful-api)
3. [WebSocket API](#websocket-api)
4. [扫码登录 API](#扫码登录-api)
5. [错误码说明](#错误码说明)
6. [数据模型](#数据模型)

---

## 概述

QQ农场共享版服务器提供两套 API 接口：

- **RESTful API**: 用于账号管理、状态查询、操作执行等请求-响应式操作
- **WebSocket API**: 用于实时状态推送、日志订阅等实时通信场景

### 基础 URL

```
http://localhost:3456
```

### 通用响应格式

所有 RESTful API 响应均遵循以下格式：

```json
{
  "success": true,      // 请求是否成功
  "data": {},           // 响应数据（成功时）
  "message": "错误信息"  // 错误信息（失败时）
}
```

### HTTP 状态码

| 状态码 | 含义 | 说明 |
|--------|------|------|
| 200 | OK | 请求成功 |
| 400 | Bad Request | 请求参数错误 |
| 404 | Not Found | 资源不存在 |
| 500 | Internal Server Error | 服务器内部错误 |

---

## RESTful API

### 账号管理

#### 1. 获取所有账号

获取系统中所有已配置的账号列表。

**请求**

```http
GET /api/accounts
```

**响应示例**

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "QQ账号1",
      "code": "xxx...",
      "platform": "qq",
      "config": {
        "farmCheckInterval": 10,
        "friendCheckInterval": 10,
        "forceLowestLevelCrop": false,
        "enableFriendHelp": true,
        "enableSteal": true,
        "enableSell": true,
        "enableTask": true
      },
      "createdAt": "2026-02-24T10:00:00.000Z",
      "updatedAt": "2026-02-24T10:00:00.000Z"
    }
  ]
}
```

---

#### 2. 获取单个账号

根据账号 ID 获取详细信息。

**请求**

```http
GET /api/accounts/:id
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 账号 UUID |

**响应示例**

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "QQ账号1",
    "code": "xxx...",
    "platform": "qq",
    "config": { ... },
    "createdAt": "2026-02-24T10:00:00.000Z",
    "updatedAt": "2026-02-24T10:00:00.000Z"
  }
}
```

**错误响应**

```json
{
  "success": false,
  "message": "账号不存在"
}
```

---

#### 3. 添加账号

添加一个新的农场账号。

**请求**

```http
POST /api/accounts
Content-Type: application/json
```

**请求体参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| name | string | 是 | - | 账号名称 |
| code | string | 是 | - | 登录授权码 |
| platform | string | 否 | "qq" | 平台类型: "qq" 或 "wx" |
| config | object | 否 | {} | 账号配置选项 |

**config 配置项**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| farmCheckInterval | number | 10 | 农场检查间隔（秒） |
| friendCheckInterval | number | 10 | 好友检查间隔（秒） |
| forceLowestLevelCrop | boolean | false | 强制种植最低等级作物 |
| enableFriendHelp | boolean | true | 启用帮助好友功能 |
| enableSteal | boolean | true | 启用偷菜功能 |
| enableSell | boolean | true | 启用自动出售果实 |
| enableTask | boolean | true | 启用自动领取任务奖励 |

**请求示例**

```json
{
  "name": "我的QQ农场",
  "code": "auth_code_from_qq_scan",
  "platform": "qq",
  "config": {
    "farmCheckInterval": 10,
    "friendCheckInterval": 30,
    "enableSteal": true,
    "enableSell": true
  }
}
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "我的QQ农场",
    "code": "auth_code_from_qq_scan",
    "platform": "qq",
    "config": { ... },
    "createdAt": "2026-02-24T10:00:00.000Z",
    "updatedAt": "2026-02-24T10:00:00.000Z"
  }
}
```

**错误响应**

```json
{
  "success": false,
  "message": "名称和登录码不能为空"
}
```

---

#### 4. 更新账号

更新指定账号的信息。

**请求**

```http
PUT /api/accounts/:id
Content-Type: application/json
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 账号 UUID |

**请求体参数**

支持更新以下字段：

| 参数 | 类型 | 说明 |
|------|------|------|
| name | string | 账号名称 |
| code | string | 登录授权码 |
| platform | string | 平台类型 |
| config | object | 配置选项（部分更新） |

**请求示例**

```json
{
  "name": "新的账号名称",
  "config": {
    "enableSteal": false
  }
}
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "新的账号名称",
    "code": "xxx...",
    "platform": "qq",
    "config": { ... },
    "updatedAt": "2026-02-24T12:00:00.000Z"
  }
}
```

---

#### 5. 删除账号

删除指定的账号配置。

**请求**

```http
DELETE /api/accounts/:id
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 账号 UUID |

**响应示例**

```json
{
  "success": true,
  "message": "账号已删除"
}
```

---

### 账号控制

#### 6. 启动账号

启动指定账号的农场连接。

**请求**

```http
POST /api/accounts/:id/start
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 账号 UUID |

**响应示例（成功）**

```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "启动成功",
    "state": {
      "gid": 123456789,
      "name": "QQ昵称",
      "level": 30,
      "gold": 10000,
      "exp": 50000
    }
  }
}
```

**响应示例（失败）**

```json
{
  "success": false,
  "message": "启动失败: 登录码已过期"
}
```

---

#### 7. 停止账号

停止指定账号的农场连接。

**请求**

```http
POST /api/accounts/:id/stop
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 账号 UUID |

**响应示例**

```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "已停止"
  }
}
```

---

#### 8. 启动所有账号

批量启动所有已配置的账号。

**请求**

```http
POST /api/start-all
```

**响应示例**

```json
{
  "success": true,
  "data": [
    {
      "accountId": "550e8400-e29b-41d4-a716-446655440000",
      "success": true,
      "result": { ... }
    },
    {
      "accountId": "550e8400-e29b-41d4-a716-446655440001",
      "success": false,
      "error": "登录码已过期"
    }
  ]
}
```

---

#### 9. 停止所有账号

批量停止所有运行中的账号。

**请求**

```http
POST /api/stop-all
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "所有账号已停止"
  }
}
```

---

### 状态查询

#### 10. 获取账号状态

获取指定账号的详细运行状态。

**请求**

```http
GET /api/accounts/:id/status
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 账号 UUID |

**响应示例**

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "isRunning": true,
    "isConnected": true,
    "connectionState": "connected",
    "userState": {
      "gid": 123456789,
      "name": "QQ昵称",
      "level": 30,
      "gold": 10000,
      "exp": 50000,
      "expProgress": {
        "current": 5000,
        "needed": 10000,
        "percent": 50
      }
    },
    "stats": {
      "harvests": 100,
      "steals": 50,
      "helps": 200,
      "sells": 30,
      "tasks": 10,
      "startTime": "2026-02-24T10:00:00.000Z"
    },
    "config": { ... }
  }
}
```

---

#### 11. 获取所有账号状态

获取所有运行中账号的状态。

**请求**

```http
GET /api/status
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "550e8400-e29b-41d4-a716-446655440000": { ... },
    "550e8400-e29b-41d4-a716-446655440001": { ... }
  }
}
```

---

#### 12. 获取账号连接状态

获取指定账号的连接状态信息。

**请求**

```http
GET /api/accounts/:id/connection
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "isConnected": true,
    "connectionState": "connected",
    "disconnectedAt": null,
    "disconnectedReason": null,
    "lastPongAgo": 5000,
    "userState": { ... }
  }
}
```

---

#### 13. 获取所有账号连接状态

获取所有账号的连接状态。

**请求**

```http
GET /api/connections
```

---

#### 14. 清理已停止的连接

清理已停止的连接实例。

**请求**

```http
POST /api/cleanup
```

**响应示例**

```json
{
  "success": true,
  "message": "已清理已停止的连接"
}
```

---

### 操作执行

#### 15. 执行单次操作

对指定账号执行单次操作。

**请求**

```http
POST /api/accounts/:id/action
Content-Type: application/json
```

**请求体参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | 操作名称 |

**支持的 action 值**

| action | 说明 |
|--------|------|
| checkFarm | 立即检查农场状态 |
| sellFruits | 立即出售仓库果实 |
| claimTasks | 立即领取任务奖励 |

**请求示例**

```json
{
  "action": "checkFarm"
}
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "农场检查完成"
  }
}
```

---

### 日志与统计

#### 16. 获取账号日志

获取指定账号的最近日志。

**请求**

```http
GET /api/accounts/:id/logs?limit=100
```

**查询参数**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| limit | number | 100 | 返回日志条数上限 |

**响应示例**

```json
{
  "success": true,
  "data": [
    {
      "time": "2026-02-24T12:00:00.000Z",
      "tag": "农场",
      "message": "收获3/浇水2/除草1"
    },
    {
      "time": "2026-02-24T11:59:00.000Z",
      "tag": "好友",
      "message": "小明: 偷2/除草1"
    }
  ]
}
```

---

#### 17. 获取统计数据

获取服务器整体统计数据。

**请求**

```http
GET /api/stats
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "totalAccounts": 5,
    "runningAccounts": 3,
    "totalHarvests": 500,
    "totalSteals": 200
  }
}
```

---

## WebSocket API

WebSocket 用于实时通信，服务器会主动推送账号状态更新、日志等信息。

### 连接

```javascript
const ws = new WebSocket('ws://localhost:3456');
```

### 消息格式

所有 WebSocket 消息均为 JSON 格式：

```json
{
  "type": "messageType",
  "accountId": "uuid",
  "data": { ... }
}
```

### 客户端发送的消息

#### 订阅账号更新

```json
{
  "action": "subscribe",
  "accountId": "550e8400-e29b-41d4-a716-446655440000"
}
```

使用 `"all"` 订阅所有账号：

```json
{
  "action": "subscribe",
  "accountId": "all"
}
```

#### 取消订阅

```json
{
  "action": "unsubscribe",
  "accountId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 获取账号列表

```json
{
  "action": "getAccounts"
}
```

#### 获取状态

```json
{
  "action": "getStatus"
}
```

### 服务器推送的消息

#### 连接确认

```json
{
  "type": "connected",
  "clientId": "uuid",
  "message": "已连接到QQ农场服务器"
}
```

#### 账号列表

```json
{
  "type": "accounts",
  "data": [ ... ]
}
```

#### 状态更新

```json
{
  "type": "status",
  "data": { ... }
}
```

#### 账号连接成功

```json
{
  "type": "accountConnected",
  "accountId": "uuid",
  "data": { ... }
}
```

#### 账号断开连接

```json
{
  "type": "accountDisconnected",
  "accountId": "uuid",
  "data": {
    "code": 1000,
    "reason": "",
    "time": "2026-02-24T12:00:00.000Z"
  }
}
```

#### 连接丢失

```json
{
  "type": "connectionLost",
  "accountId": "uuid",
  "data": {
    "reason": "连接超时，长时间未收到服务器响应",
    "lastPongTime": 1708771200000,
    "disconnectedAt": "2026-02-24T12:00:00.000Z"
  }
}
```

#### 账号停止

```json
{
  "type": "accountStopped",
  "accountId": "uuid"
}
```

#### 状态变更

```json
{
  "type": "stateChanged",
  "accountId": "uuid",
  "data": {
    "level": 31,
    "gold": 15000,
    "exp": 55000
  }
}
```

#### 统计变更

```json
{
  "type": "statsChanged",
  "accountId": "uuid",
  "data": {
    "harvests": 101,
    "steals": 51
  }
}
```

#### 日志推送

```json
{
  "type": "log",
  "accountId": "uuid",
  "data": {
    "time": "2026-02-24T12:00:00.000Z",
    "tag": "农场",
    "message": "收获3/浇水2"
  }
}
```

---

## 扫码登录 API

QQ 平台支持通过扫码方式获取登录授权码。

### 流程概述

1. 创建扫码会话 (`POST /api/qr-login`)
2. 获取二维码 URL (`GET /api/qr-login/:sessionId/url`)
3. 轮询扫码状态 (`GET /api/qr-login/:sessionId/status`)

### API 端点

#### 1. 创建扫码会话

**请求**

```http
POST /api/qr-login
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "sessionId": "session-uuid",
    "status": "pending",
    "message": "请获取二维码并扫码"
  }
}
```

---

#### 2. 获取二维码 URL

**请求**

```http
GET /api/qr-login/:sessionId/url
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "url": "https://h5.qzone.qq.com/qqq/code/xxx",
    "loginCode": "xxx"
  }
}
```

---

#### 3. 查询扫码状态

**请求**

```http
GET /api/qr-login/:sessionId/status
```

**响应示例 - 等待中**

```json
{
  "success": true,
  "data": {
    "status": "waiting",
    "message": "等待扫码"
  }
}
```

**响应示例 - 扫码成功**

```json
{
  "success": true,
  "data": {
    "status": "success",
    "code": "auth_code_for_farm_login"
  }
}
```

**响应示例 - 二维码过期**

```json
{
  "success": true,
  "data": {
    "status": "expired",
    "message": "二维码已过期"
  }
}
```

### 状态说明

| 状态 | 说明 |
|------|------|
| pending | 等待获取二维码 |
| waiting | 等待用户扫码 |
| success | 扫码成功，返回登录码 |
| expired | 二维码已过期 |

---

## 错误码说明

### HTTP 错误

| 错误码 | 说明 | 处理建议 |
|--------|------|----------|
| 400 | 请求参数错误 | 检查请求体参数是否完整、格式是否正确 |
| 404 | 资源不存在 | 检查账号 ID 是否正确 |
| 500 | 服务器内部错误 | 查看服务器日志，检查配置是否正确 |

### 业务错误

| 错误信息 | 说明 | 处理建议 |
|----------|------|----------|
| 账号不存在 | 指定的账号 ID 未找到 | 检查账号 ID 是否正确 |
| 名称和登录码不能为空 | 添加账号时必填字段缺失 | 确保 name 和 code 字段已提供 |
| 登录码已过期 | QQ 授权码已失效 | 重新扫码获取新的登录码 |
| 连接超时 | WebSocket 连接超时 | 检查网络连接，稍后重试 |
| 账号未运行 | 对未启动的账号执行操作 | 先调用启动接口 |
| 未知操作 | action 参数值不支持 | 检查 action 值是否在支持列表中 |

---

## 数据模型

### Account（账号）

```typescript
interface Account {
  id: string;              // UUID
  name: string;            // 账号名称
  code: string;            // 登录授权码
  platform: 'qq' | 'wx';   // 平台类型
  config: AccountConfig;   // 账号配置
  createdAt: string;       // ISO 8601 时间
  updatedAt: string;       // ISO 8601 时间
}
```

### AccountConfig（账号配置）

```typescript
interface AccountConfig {
  farmCheckInterval: number;      // 农场检查间隔（秒）
  friendCheckInterval: number;    // 好友检查间隔（秒）
  forceLowestLevelCrop: boolean;  // 强制种植最低等级作物
  enableFriendHelp: boolean;      // 启用帮助好友
  enableSteal: boolean;           // 启用偷菜
  enableSell: boolean;            // 启用自动出售
  enableTask: boolean;            // 启用自动领任务
}
```

### AccountStatus（账号状态）

```typescript
interface AccountStatus {
  id: string;
  isRunning: boolean;           // 是否正在运行
  isConnected: boolean;         // 是否已连接
  connectionState: string;      // 连接状态
  disconnectedAt: string | null; // 断开时间
  disconnectedReason: string | null; // 断开原因
  lastPongTime: number;         // 最后收到消息时间
  lastPongAgo: number | null;   // 距最后消息时间（毫秒）
  userState: UserState;         // 用户游戏状态
  stats: Stats;                 // 统计数据
  config: AccountConfig;        // 配置
}
```

### UserState（用户状态）

```typescript
interface UserState {
  gid: number;          // 游戏用户ID
  name: string;         // 用户昵称
  level: number;        // 等级
  gold: number;         // 金币
  exp: number;          // 经验值
  expProgress?: {       // 经验进度（计算字段）
    current: number;
    needed: number;
    percent: number;
  };
}
```

### Stats（统计数据）

```typescript
interface Stats {
  harvests: number;     // 收获次数
  steals: number;       // 偷菜次数
  helps: number;        // 帮助次数
  sells: number;        // 出售次数
  tasks: number;        // 完成任务数
  startTime: string;    // 启动时间
}
```

### LogEntry（日志条目）

```typescript
interface LogEntry {
  time: string;     // ISO 8601 时间
  tag: string;      // 标签（农场/好友/系统/连接/错误等）
  message: string;  // 日志内容
}
```

---

## SDK 使用示例

项目提供了 Node.js SDK 简化 API 调用：

```javascript
const QFarmSDK = require('./sdk');

const sdk = new QFarmSDK({
  baseURL: 'http://localhost:3456'
});

// 添加并启动账号
async function main() {
  // 添加账号
  const account = await sdk.addAccount({
    name: '我的农场',
    code: 'auth_code',
    platform: 'qq'
  });
  
  // 启动账号
  await sdk.startAccount(account.id);
  
  // 获取状态
  const status = await sdk.getAccountStatus(account.id);
  console.log('等级:', status.userState.level);
  
  // 连接 WebSocket 接收实时更新
  await sdk.connectWebSocket();
  sdk.subscribe('all');
  
  sdk.on('accountUpdate', (msg) => {
    console.log('收到更新:', msg);
  });
}

main().catch(console.error);
```

更多 SDK 用法请参考 [sdk/index.js](../sdk/index.js) 和 [sdk/example.js](../sdk/example.js)。
