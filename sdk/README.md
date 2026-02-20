# QQ Farm SDK - Node.js 连接器

易用的 Node.js SDK，用于连接 QQ 农场服务器，管理账号、查询状态、扫码登录等。

## 安装

```bash
npm install axios ws
```

## 快速开始

```javascript
const QFarmSDK = require('./sdk');

// 创建 SDK 实例
const sdk = new QFarmSDK({
    baseURL: 'http://localhost:3001',
    timeout: 30000
});

// 获取所有账号
const accounts = await sdk.getAccounts();
console.log(accounts);
```

## API 文档

### 初始化

```javascript
const sdk = new QFarmSDK({
    baseURL: 'http://localhost:3001',  // 服务器地址
    timeout: 30000                      // 请求超时时间
});
```

### 账号管理

#### 获取所有账号
```javascript
const accounts = await sdk.getAccounts();
```

#### 获取单个账号
```javascript
const account = await sdk.getAccount(accountId);
```

#### 添加账号
```javascript
const account = await sdk.addAccount({
    name: '我的账号',
    code: '登录码',
    platform: 'qq',
    config: {
        farmCheckInterval: 10,
        friendCheckInterval: 10,
        enableSteal: true,
        enableFriendHelp: true
    }
});
```

#### 更新账号
```javascript
const updated = await sdk.updateAccount(accountId, {
    name: '新名称',
    config: { enableSteal: false }
});
```

#### 删除账号
```javascript
await sdk.deleteAccount(accountId);
```

### 账号控制

#### 启动账号
```javascript
await sdk.startAccount(accountId);
```

#### 停止账号
```javascript
await sdk.stopAccount(accountId);
```

#### 启动所有账号
```javascript
await sdk.startAll();
```

#### 停止所有账号
```javascript
await sdk.stopAll();
```

### 状态查询

#### 获取账号状态
```javascript
const status = await sdk.getAccountStatus(accountId);
```

#### 获取所有账号状态
```javascript
const allStatus = await sdk.getAllStatus();
```

#### 获取账号日志
```javascript
const logs = await sdk.getAccountLogs(accountId, 100);
```

#### 获取统计数据
```javascript
const stats = await sdk.getStats();
```

### 扫码登录

#### 完整流程（推荐）
```javascript
// 方式 1: 自动获取QQ昵称（推荐）
const result = await sdk.fullQrLogin({
    onStatus: (status) => {
        console.log(`[${status.stage}] ${status.message}`);
        if (status.qrUrl) {
            console.log('二维码URL:', status.qrUrl);
        }
    }
});
console.log('登录成功:', result.account.name);  // 自动获取的QQ昵称
console.log('等级:', result.status?.userState?.level);

// 方式 2: 自定义账号名称
const result = await sdk.fullQrLogin({
    accountName: '我的农场账号',  // 使用自定义名称
    onStatus: (status) => console.log(status.message)
});
```

#### 分步执行
```javascript
// 1. 开始扫码登录
const session = await sdk.startQrLogin();

// 2. 获取二维码URL
const qrInfo = await sdk.getQrLoginUrl(session.sessionId);
console.log('请扫码:', qrInfo.url);

// 3. 等待扫码完成
const result = await sdk.waitForQrLogin(session.sessionId);
console.log('登录码:', result.code);
```

### WebSocket 实时通信

```javascript
// 连接 WebSocket
await sdk.connectWebSocket();

// 订阅账号状态
sdk.subscribe(accountId);

// 监听事件
sdk.on('accountUpdate', (data) => {
    console.log('账号更新:', data);
});

sdk.on('wsMessage', (message) => {
    console.log('收到消息:', message);
});

// 断开连接
sdk.disconnectWebSocket();
```

### 便捷方法

#### 添加并启动账号
```javascript
const account = await sdk.addAndStart({
    name: '新账号',
    code: '登录码'
});
```

#### 重启账号
```javascript
await sdk.restartAccount(accountId);
```

#### 获取运行中的账号
```javascript
const running = await sdk.getRunningAccounts();
```

#### 批量执行操作
```javascript
const results = await sdk.batchExecute([id1, id2, id3], 'harvest');
```

## 事件监听

```javascript
// 请求事件
sdk.on('request', (config) => {
    console.log('发送请求:', config.url);
});

// 响应事件
sdk.on('response', (response) => {
    console.log('收到响应:', response.data);
});

// 错误事件
sdk.on('error', (error) => {
    console.error('发生错误:', error);
});

// WebSocket 事件
sdk.on('wsConnected', () => console.log('WebSocket 已连接'));
sdk.on('wsDisconnected', (data) => console.log('WebSocket 已断开'));
sdk.on('accountUpdate', (data) => console.log('账号更新:', data));
```

## 完整示例

```javascript
const QFarmSDK = require('./sdk');

async function main() {
    const sdk = new QFarmSDK();
    
    // 扫码登录
    const loginResult = await sdk.fullQrLogin({
        onStatus: (status) => console.log(status.message)
    });
    
    // 添加账号
    const account = await sdk.addAccount({
        name: '农场账号',
        code: loginResult.code
    });
    
    // 启动账号
    await sdk.startAccount(account.id);
    
    // 获取状态
    const status = await sdk.getAccountStatus(account.id);
    console.log('状态:', status);
    
    // 连接 WebSocket 实时监听
    await sdk.connectWebSocket();
    sdk.subscribe(account.id);
    
    sdk.on('accountUpdate', (data) => {
        console.log('更新:', data);
    });
}

main().catch(console.error);
```

## 运行示例

```bash
# 查看所有示例
node sdk/example.js

# 运行指定示例
node sdk/example.js 1  # 基础账号管理
node sdk/example.js 2  # 扫码登录
node sdk/example.js 3  # 账号控制
node sdk/example.js 4  # 批量操作
node sdk/example.js 5  # 状态查询
node sdk/example.js 6  # WebSocket 实时通信
node sdk/example.js 7  # 完整工作流
```
