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
  "data