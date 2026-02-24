# QQ农场共享版服务器 - 开发指南

## 文档信息

- **版本**: 1.0.0
- **最后更新**: 2026-02-24
- **目标读者**: 开发者、贡献者

---

## 目录

1. [环境搭建](#环境搭建)
2. [项目结构](#项目结构)
3. [代码规范](#代码规范)
4. [开发流程](#开发流程)
5. [如何添加新功能](#如何添加新功能)
6. [调试技巧](#调试技巧)
7. [测试指南](#测试指南)
8. [常见问题](#常见问题)

---

## 环境搭建

### 系统要求

- **操作系统**: Windows 10/11, macOS, Linux
- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0
- **Git**: 任意版本

### 安装步骤

#### 1. 克隆项目

```bash
git clone <repository-url>
cd qq-farm-server
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 启动开发服务器

```bash
# 方式1: 直接启动
npm run dev

# 方式2: 使用 node
node server.js
```

#### 4. 验证安装

打开浏览器访问 http://localhost:3456，应该能看到 Web 控制台界面。

### 开发环境配置

#### 推荐 IDE

- **VS Code** (推荐)
  - 安装插件: ESLint, Prettier, Node.js Extension Pack

#### VS Code 配置

创建 `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "files.exclude": {
    "node_modules/**": true
  }
}
```

创建 `.vscode/launch.json` 用于调试:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "启动服务器",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/server.js",
      "console": "integratedTerminal"
    }
  ]
}
```

---

## 项目结构

```
qq-farm-server/
├── src/                           # 源代码
│   ├── server.js                  # 服务器入口
│   ├── AccountManager.js          # 账号管理器
│   ├── FarmManager.js             # 农场管理器
│   ├── FarmConnection.js          # 农场连接（核心）
│   ├── proto.js                   # Protocol Buffer 加载
│   ├── gameConfig.js              # 游戏配置
│   ├── qqQrLogin.js               # 扫码登录
│   ├── config.js                  # 常量配置
│   └── utils.js                   # 工具函数
│
├── public/                        # Web 控制台
│   ├── index.html                 # 主页面
│   ├── app.js                     # 前端逻辑
│   └── style.css                  # 样式表
│
├── sdk/                           # Node.js SDK
│   ├── index.js                   # SDK 主文件
│   └── example.js                 # 使用示例
│
├── proto/                         # Protocol Buffer 定义
│   └── *.proto                    # 各种 proto 文件
│
├── gameConfig/                    # 游戏静态配置
│   ├── Plant.json                 # 作物配置
│   ├── RoleLevel.json             # 等级经验
│   └── ItemInfo.json              # 物品信息
│
├── tools/                         # 工具脚本
│   └── calc-exp-yield.js          # 经验收益计算
│
├── docs/                          # 文档
│   ├── api-reference.md           # API 参考
│   ├── architecture.md            # 架构文档
│   ├── development-guide.md       # 本文件
│   └── deployment-guide.md        # 部署文档
│
├── data/                          # 运行时数据（自动创建）
│   └── accounts.json              # 账号存储
│
├── logs/                          # 日志目录（PM2）
│
├── ecosystem.config.js            # PM2 配置
├── package.json                   # 项目配置
└── README.md                      # 项目说明
```

---

## 代码规范

### JavaScript 风格指南

项目遵循以下代码规范：

#### 1. 缩进和格式

- 使用 4 个空格缩进
- 使用单引号
- 语句末尾使用分号
- 最大行长度 120 字符

```javascript
// Good
function example() {
    const message = 'Hello World';
    console.log(message);
}

// Bad
function example(){
  const message = "Hello World"
  console.log(message)
}
```

#### 2. 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 类名 | PascalCase | `FarmConnection`, `AccountManager` |
| 方法名 | camelCase | `startAccount`, `getStatus` |
| 变量名 | camelCase | `accountId`, `isConnected` |
| 常量 | UPPER_SNAKE_CASE | `CONFIG`, `PlantPhase` |
| 私有方法 | 下划线前缀 | `_handleError`, `_sendWsMessage` |

#### 3. 注释规范

```javascript
/**
 * 类/方法说明
 * @param {string} param1 - 参数说明
 * @param {number} param2 - 参数说明
 * @returns {Promise<Object>} 返回值说明
 */
async function example(param1, param2) {
    // 单行注释：说明代码逻辑
    const result = await doSomething();
    
    /*
     * 多行注释：用于复杂逻辑说明
     * 1. 第一步做什么
     * 2. 第二步做什么
     */
    return result;
}
```

#### 4. 错误处理

```javascript
// Good: 使用 try-catch 并抛出有意义的错误
try {
    const result = await riskyOperation();
    return result;
} catch (error) {
    throw new Error(`操作失败: ${error.message}`);
}

// Good: 异步函数统一处理
async function handleRequest() {
    try {
        await processData();
    } catch (error) {
        console.error('处理请求失败:', error);
        // 返回友好的错误信息
        return { success: false, message: error.message };
    }
}
```

#### 5. 模块导入顺序

```javascript
// 1. 内置模块
const fs = require('fs');
const path = require('path');

// 2. 第三方模块
const express = require('express');
const WebSocket = require('ws');

// 3. 本地模块
const AccountManager = require('./src/AccountManager');
const { CONFIG } = require('./src/config');
```

---

## 开发流程

### 1. 创建功能分支

```bash
# 从 main 分支创建新分支
git checkout -b feature/your-feature-name
```

### 2. 开发规范

- 每个功能/修复应该独立提交
- 提交信息应该清晰描述变更
- 大型功能应该拆分为多个小提交

### 3. 提交信息规范

```
<type>: <subject>

<body>

<footer>
```

**Type 类型**:

- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档
- `style`: 格式（不影响代码运行的变动）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试
- `chore`: 构建过程或辅助工具的变动

**示例**:

```
feat: 添加自动施肥功能

- 在种植后自动使用普通肥料
- 支持配置是否启用自动施肥
- 添加相关 API 接口

Closes #123
```

### 4. 代码审查

- 提交 PR 前自我审查
- 确保所有测试通过
- 更新相关文档

---

## 如何添加新功能

### 场景1: 添加新的 API 端点

以添加"获取账号统计历史"API 为例：

#### 步骤1: 在 server.js 中添加路由

```javascript
// 在 RESTful API 区域添加
app.get('/api/accounts/:id/stats-history', (req, res) => {
    try {
        const history = farmManager.getStatsHistory(req.params.id);
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
```

#### 步骤2: 在 FarmManager 中实现方法

```javascript
// src/FarmManager.js

/**
 * 获取账号统计历史
 * @param {string} accountId - 账号ID
 * @returns {Array} 统计历史
 */
getStatsHistory(accountId) {
    const connection = this.connections.get(accountId);
    if (!connection) {
        throw new Error('账号未运行');
    }
    return connection.getStatsHistory();
}
```

#### 步骤3: 在 FarmConnection 中实现具体逻辑

```javascript
// src/FarmConnection.js

// 在 constructor 中初始化
this.statsHistory = [];

// 在 statsChanged 事件中记录历史
this.on('statsChanged', (stats) => {
    this.statsHistory.push({
        timestamp: new Date().toISOString(),
        ...stats
    });
    // 限制历史记录数量
    if (this.statsHistory.length > 1000) {
        this.statsHistory.shift();
    }
});

/**
 * 获取统计历史
 */
getStatsHistory() {
    return this.statsHistory;
}
```

#### 步骤4: 更新 API 文档

在 `docs/api-reference.md` 中添加新端点的文档。

---

### 场景2: 添加新的自动化操作

以添加"自动使用道具"功能为例：

#### 步骤1: 在 config.js 中添加配置项

```javascript
// src/config.js
const CONFIG = {
    // ... 现有配置
    enableAutoItem: true,  // 新增
    autoItemInterval: 300000,  // 5分钟
};
```

#### 步骤2: 在 FarmConnection 中添加循环

```javascript
// src/FarmConnection.js

// 在 constructor 中
this.itemTimer = null;

// 在 connect() 成功后启动
if (this.config.enableAutoItem) {
    this.startItemLoop();
}

// 实现循环
async startItemLoop() {
    await sleep(60000);  // 延迟1分钟开始
    
    this.itemTimer = setInterval(async () => {
        if (this.isRunning) {
            await this.useItems();
        }
    }, CONFIG.autoItemInterval);
}

// 实现道具使用逻辑
async useItems() {
    try {
        // 获取背包中的道具
        const items = await this.getBagItems();
        
        // 筛选可使用的道具
        const usableItems = items.filter(item => this.isUsableItem(item));
        
        for (const item of usableItems) {
            await this.useItem(item.id);
            await sleep(500);
        }
        
        if (usableItems.length > 0) {
            this.addLog('道具', `使用 ${usableItems.length} 个道具`);
        }
    } catch (e) {
        this.addLog('错误', `使用道具失败: ${e.message}`);
    }
}

// 在 cleanup 中清理定时器
if (this.itemTimer) {
    clearInterval(this.itemTimer);
    this.itemTimer = null;
}
```

#### 步骤3: 在 AccountManager 中添加配置支持

```javascript
// src/AccountManager.js

// 在 addAccount 中
config: {
    // ... 现有配置
    enableAutoItem: config.enableAutoItem !== false,
}
```

#### 步骤4: 在前端添加配置界面

在 `public/index.html` 和 `public/app.js` 中添加相应的配置选项。

---

### 场景3: 添加新的 WebSocket 消息类型

以添加"操作完成通知"为例：

#### 步骤1: 在 FarmConnection 中触发事件

```javascript
// src/FarmConnection.js

// 在 checkFarm 完成后
async checkFarm() {
    // ... 现有代码
    
    if (actions.length > 0) {
        this.addLog('农场', actions.join('/'));
        this.emit('statsChanged', { ...this.stats });
        
        // 新增：触发操作完成事件
        this.emit('operationsCompleted', {
            type: 'farm',
            actions: actions,
            timestamp: new Date().toISOString()
        });
    }
}
```

#### 步骤2: 在 FarmManager 中广播

```javascript
// src/FarmManager.js

// 在 startAccount 的事件监听中添加
connection.on('operationsCompleted', (data) => {
    this.broadcast(accountId, {
        type: 'operationsCompleted',
        accountId,
        data
    });
});
```

#### 步骤3: 在前端处理新消息类型

```javascript
// public/app.js

handleWebSocketMessage(data) {
    switch (data.type) {
        // ... 现有 case
        
        case 'operationsCompleted':
            this.handleOperationsCompleted(data);
            break;
    }
}

handleOperationsCompleted(data) {
    // 显示通知或更新界面
    console.log('操作完成:', data.data);
}
```

---

## 调试技巧

### 1. 使用 console.log 调试

```javascript
// 在关键位置添加日志
console.log('[调试] 当前状态:', this.connectionState);
console.log('[调试] 用户状态:', this.userState);
console.log('[调试] 收到消息:', msg);
```

### 2. 使用 VS Code 调试器

1. 在代码中设置断点（点击行号左侧）
2. 按 F5 启动调试
3. 使用调试工具栏：
   - F5: 继续
   - F10: 单步跳过
   - F11: 单步进入
   - Shift+F11: 单步跳出

### 3. 查看 WebSocket 消息

在浏览器开发者工具中：

1. 打开 Network 面板
2. 选择 WS (WebSocket) 标签
3. 点击连接
4. 查看 Messages 标签

### 4. 日志文件

使用 PM2 时查看日志：

```bash
# 查看实时日志
pm2 logs qq-farm-server

# 查看错误日志
tail -f logs/error.log

# 查看输出日志
tail -f logs/out.log
```

### 5. 调试 Protocol Buffer 消息

```javascript
// 打印原始消息
console.log('原始消息:', data.toString('hex'));

// 打印解码后的消息
const msg = types.GateMessage.decode(data);
console.log('解码消息:', JSON.stringify(msg, null, 2));
```

### 6. 网络抓包

使用 Wireshark 或 Fiddler 抓取 WebSocket 通信：

```bash
# 过滤 WebSocket 流量
websocket

# 过滤特定端口
tcp.port == 3456
```

---

## 测试指南

### 手动测试清单

#### 账号管理测试

- [ ] 添加 QQ 账号
- [ ] 添加微信账号
- [ ] 更新账号配置
- [ ] 删除账号
- [ ] 获取账号列表

#### 连接测试

- [ ] 启动单个账号
- [ ] 停止单个账号
- [ ] 启动所有账号
- [ ] 停止所有账号
- [ ] 断线重连

#### 功能测试

- [ ] 自动收获
- [ ] 自动种植
- [ ] 自动浇水
- [ ] 自动除草
- [ ] 自动除虫
- [ ] 自动偷菜
- [ ] 自动出售
- [ ] 自动领任务

#### WebSocket 测试

- [ ] 连接 WebSocket
- [ ] 订阅账号更新
- [ ] 取消订阅
- [ ] 接收实时日志
- [ ] 接收状态更新

#### 扫码登录测试

- [ ] 获取二维码
- [ ] 扫码成功流程
- [ ] 扫码过期处理

### API 测试示例

使用 curl 测试 API：

```bash
# 获取所有账号
curl http://localhost:3456/api/accounts

# 添加账号
curl -X POST http://localhost:3456/api/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试账号",
    "code": "test_code",
    "platform": "qq"
  }'

# 启动账号
curl -X POST http://localhost:3456/api/accounts/{id}/start

# 获取状态
curl http://localhost:3456/api/accounts/{id}/status

# 停止账号
curl -X POST http://localhost:3456/api/accounts/{id}/stop
```

---

## 常见问题

### Q1: 启动时提示 "Cannot find module"

**原因**: 依赖未安装或安装不完整

**解决**:

```bash
rm -rf node_modules
npm install
```

### Q2: WebSocket 连接失败

**排查步骤**:

1. 检查服务器是否运行
2. 检查防火墙设置
3. 检查端口是否被占用
4. 查看浏览器控制台错误信息

### Q3: 登录失败 "登录码已过期"

**原因**: QQ 授权码有效期有限

**解决**: 重新扫码获取新的登录码

### Q4: 农场操作没有执行

**排查步骤**:

1. 检查账号是否已启动
2. 检查连接状态是否为 connected
3. 查看日志是否有错误信息
4. 检查配置中的功能开关是否启用

### Q5: 如何修改默认端口

**方法1**: 环境变量

```bash
PORT=8080 node server.js
```

**方法2**: 修改 ecosystem.config.js

```javascript
env: {
    PORT: 8080,
    // ...
}
```

### Q6: 如何备份账号数据

账号数据存储在 `data/accounts.json`，直接备份该文件即可：

```bash
cp data/accounts.json backup/accounts-$(date +%Y%m%d).json
```

### Q7: 如何更新游戏配置

游戏配置文件在 `gameConfig/` 目录下：

1. 获取最新的游戏数据
2. 替换对应的 JSON 文件
3. 重启服务器

### Q8: 内存占用过高怎么办

**优化建议**:

1. 减少同时运行的账号数量
2. 增加检查间隔时间
3. 定期重启服务（使用 PM2 的 max_memory_restart）

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    max_memory_restart: '256M',  // 内存超过 256MB 自动重启
    // ...
  }]
};
```

---

## 贡献指南

### 提交 Issue

1. 使用清晰的标题描述问题
2. 提供复现步骤
3. 提供环境信息（Node.js 版本、操作系统）
4. 提供相关日志

### 提交 PR

1. Fork 项目
2. 创建功能分支
3. 提交变更
4. 确保测试通过
5. 更新文档
6. 提交 PR

---

## 参考资源

- [Node.js 文档](https://nodejs.org/docs/)
- [Express 文档](https://expressjs.com/)
- [Protocol Buffer 文档](https://developers.google.com/protocol-buffers)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Material Design 3](https://m3.material.io/)
