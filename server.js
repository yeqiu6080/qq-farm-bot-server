/**
 * QQ农场共享版服务器
 * 支持多账号管理、RESTful API、WebSocket实时推送
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const AccountManager = require('./src/AccountManager');
const FarmManager = require('./src/FarmManager');


// 扫码登录状态存储
const qrLoginSessions = new Map();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 全局状态
const accountManager = new AccountManager();
const farmManager = new FarmManager(accountManager);

// WebSocket连接管理
const clients = new Map();

// 性能优化：批量广播队列
const broadcastQueue = [];
const BROADCAST_INTERVAL = 100; // 100ms批量发送一次

// 性能优化：定期清理已停止的连接
setInterval(() => {
    farmManager.cleanupStoppedConnections();
}, 60000); // 每分钟清理一次

// 批量广播处理
setInterval(() => {
    if (broadcastQueue.length === 0) return;
    
    const messages = broadcastQueue.splice(0);
    const msgStr = JSON.stringify({ type: 'batch', messages });
    
    clients.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN) {
            try {
                client.ws.send(msgStr);
            } catch (e) {
                // 发送失败，忽略
            }
        }
    });
}, BROADCAST_INTERVAL);

wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    clients.set(clientId, { ws, subscriptions: new Set() });
    
    console.log(`[WebSocket] 客户端连接: ${clientId}`);
    
    ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        message: '已连接到QQ农场服务器'
    }));
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleWebSocketMessage(clientId, data);
        } catch (e) {
            ws.send(JSON.stringify({ type: 'error', message: '消息格式错误' }));
        }
    });
    
    ws.on('close', () => {
        console.log(`[WebSocket] 客户端断开: ${clientId}`);
        clients.delete(clientId);
    });
});

// 处理WebSocket消息
function handleWebSocketMessage(clientId, data) {
    const client = clients.get(clientId);
    if (!client) return;
    
    switch (data.action) {
        case 'subscribe':
            // 订阅账号状态更新
            if (data.accountId) {
                client.subscriptions.add(data.accountId);
                client.ws.send(JSON.stringify({
                    type: 'subscribed',
                    accountId: data.accountId
                }));
            }
            break;
        case 'unsubscribe':
            if (data.accountId) {
                client.subscriptions.delete(data.accountId);
            }
            break;
        case 'getAccounts':
            client.ws.send(JSON.stringify({
                type: 'accounts',
                data: accountManager.getAllAccounts()
            }));
            break;
        case 'getStatus':
            client.ws.send(JSON.stringify({
                type: 'status',
                data: farmManager.getAllStatus()
            }));
            break;
    }
}

// 广播消息给订阅者（使用批量队列优化）
function broadcastToSubscribers(accountId, message) {
    broadcastQueue.push({ accountId, message, timestamp: Date.now() });
    
    // 如果是重要消息，立即发送
    if (message.type === 'accountConnected' || message.type === 'accountDisconnected') {
        const msgStr = JSON.stringify(message);
        clients.forEach((client) => {
            if (client.subscriptions.has(accountId) || client.subscriptions.has('all')) {
                if (client.ws.readyState === WebSocket.OPEN) {
                    try {
                        client.ws.send(msgStr);
                    } catch (e) {}
                }
            }
        });
    }
}

// 设置广播回调
farmManager.setBroadcastCallback(broadcastToSubscribers);

// ============ RESTful API ============

// 获取所有账号
app.get('/api/accounts', (req, res) => {
    res.json({
        success: true,
        data: accountManager.getAllAccounts()
    });
});

// 获取单个账号
app.get('/api/accounts/:id', (req, res) => {
    const account = accountManager.getAccount(req.params.id);
    if (!account) {
        return res.status(404).json({ success: false, message: '账号不存在' });
    }
    res.json({ success: true, data: account });
});

// 添加账号
app.post('/api/accounts', async (req, res) => {
    try {
        const { name, code, platform, config } = req.body;
        
        if (!name || !code) {
            return res.status(400).json({ 
                success: false, 
                message: '名称和登录码不能为空' 
            });
        }
        
        const account = await accountManager.addAccount({
            name,
            code,
            platform: platform || 'qq',
            config: config || {}
        });
        
        res.json({ success: true, data: account });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 更新账号
app.put('/api/accounts/:id', (req, res) => {
    try {
        const account = accountManager.updateAccount(req.params.id, req.body);
        if (!account) {
            return res.status(404).json({ success: false, message: '账号不存在' });
        }
        res.json({ success: true, data: account });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 删除账号
app.delete('/api/accounts/:id', (req, res) => {
    try {
        accountManager.deleteAccount(req.params.id);
        res.json({ success: true, message: '账号已删除' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 启动账号
app.post('/api/accounts/:id/start', async (req, res) => {
    try {
        const result = await farmManager.startAccount(req.params.id);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 停止账号
app.post('/api/accounts/:id/stop', async (req, res) => {
    try {
        const result = await farmManager.stopAccount(req.params.id);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取账号状态
app.get('/api/accounts/:id/status', (req, res) => {
    const status = farmManager.getAccountStatus(req.params.id);
    if (!status) {
        return res.status(404).json({ success: false, message: '账号未运行' });
    }
    res.json({ success: true, data: status });
});

// 获取所有账号状态
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        data: farmManager.getAllStatus()
    });
});

// 获取账号连接状态
app.get('/api/accounts/:id/connection', (req, res) => {
    const state = farmManager.getConnectionState(req.params.id);
    res.json({ success: true, data: state });
});

// 获取所有账号连接状态
app.get('/api/connections', (req, res) => {
    res.json({
        success: true,
        data: farmManager.getAllConnectionStates()
    });
});

// 清理已停止的连接
app.post('/api/cleanup', (req, res) => {
    farmManager.cleanupStoppedConnections();
    res.json({ success: true, message: '已清理已停止的连接' });
});

// 执行单次操作
app.post('/api/accounts/:id/action', async (req, res) => {
    try {
        const { action } = req.body;
        const result = await farmManager.executeAction(req.params.id, action);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取日志
app.get('/api/accounts/:id/logs', (req, res) => {
    const logs = farmManager.getLogs(req.params.id, parseInt(req.query.limit) || 100);
    res.json({ success: true, data: logs });
});

// 获取统计数据
app.get('/api/stats', (req, res) => {
    const memUsage = process.memoryUsage();
    res.json({
        success: true,
        data: {
            totalAccounts: accountManager.getAllAccounts().length,
            runningAccounts: farmManager.getRunningCount(),
            totalHarvests: farmManager.getTotalHarvests(),
            totalSteals: farmManager.getTotalSteals(),
            memory: {
                rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
                external: Math.round(memUsage.external / 1024 / 1024) + 'MB',
            },
            uptime: process.uptime(),
            wsClients: clients.size,
        }
    });
});

// 获取服务器健康状态
app.get('/api/health', (req, res) => {
    const memUsage = process.memoryUsage();
    res.json({
        success: true,
        data: {
            status: 'ok',
            timestamp: Date.now(),
            memory: {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
            },
            uptime: process.uptime(),
        }
    });
});

// 获取账号每日奖励状态
app.get('/api/accounts/:id/daily-rewards', (req, res) => {
    const status = farmManager.getAccountStatus(req.params.id);
    if (!status) {
        return res.status(404).json({ success: false, message: '账号未运行' });
    }
    res.json({
        success: true,
        data: status.dailyRewards || { dailyRewardState: {}, toggles: {} }
    });
});

// 触发每日奖励领取
app.post('/api/accounts/:id/daily-rewards/claim', async (req, res) => {
    try {
        const connection = farmManager.connections.get(req.params.id);
        if (!connection || !connection.dailyRewards) {
            return res.status(404).json({ success: false, message: '账号未运行' });
        }
        
        await connection.dailyRewards.runDailyRewards();
        res.json({ success: true, message: '每日奖励领取完成' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取土地详情
app.get('/api/accounts/:id/lands', async (req, res) => {
    try {
        const connection = farmManager.connections.get(req.params.id);
        if (!connection || !connection.landManager) {
            return res.status(404).json({ success: false, message: '账号未运行' });
        }
        
        const landStatus = await connection.landManager.getDetailedLandStatus();
        if (!landStatus) {
            return res.status(500).json({ success: false, message: '获取土地状态失败' });
        }
        
        res.json({ success: true, data: landStatus });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 解锁指定土地
app.post('/api/accounts/:id/lands/:landId/unlock', async (req, res) => {
    try {
        const connection = farmManager.connections.get(req.params.id);
        if (!connection || !connection.landManager) {
            return res.status(404).json({ success: false, message: '账号未运行' });
        }
        
        const landId = parseInt(req.params.landId);
        const result = await connection.landManager.unlockLand(landId);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 升级指定土地
app.post('/api/accounts/:id/lands/:landId/upgrade', async (req, res) => {
    try {
        const connection = farmManager.connections.get(req.params.id);
        if (!connection || !connection.landManager) {
            return res.status(404).json({ success: false, message: '账号未运行' });
        }
        
        const landId = parseInt(req.params.landId);
        const result = await connection.landManager.upgradeLand(landId);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 启动所有账号
app.post('/api/start-all', async (req, res) => {
    try {
        const results = await farmManager.startAll();
        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 停止所有账号
app.post('/api/stop-all', async (req, res) => {
    try {
        const results = await farmManager.stopAll();
        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ 扫码登录 API ============

// 获取扫码登录二维码
app.post('/api/qr-login', async (req, res) => {
    try {
        const sessionId = uuidv4();
        
        // 创建扫码会话，等待前端获取二维码URL
        qrLoginSessions.set(sessionId, {
            status: 'pending',
            timestamp: Date.now()
        });

        // 立即返回sessionId，客户端需要轮询状态
        res.json({
            success: true,
            data: {
                sessionId,
                status: 'pending',
                message: '请获取二维码并扫码'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取扫码登录二维码URL（用于前端显示）
app.get('/api/qr-login/:sessionId/url', async (req, res) => {
    try {
        const { loginCode, url } = await requestLoginCode();
        
        // 保存登录码到session
        qrLoginSessions.set(req.params.sessionId, {
            status: 'waiting',
            loginCode: loginCode,
            timestamp: Date.now()
        });
        
        res.json({
            success: true,
            data: { url, loginCode }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 查询扫码状态
app.get('/api/qr-login/:sessionId/status', async (req, res) => {
    try {
        const session = qrLoginSessions.get(req.params.sessionId);
        if (!session) {
            return res.status(404).json({ success: false, message: '会话不存在' });
        }

        // 如果还在等待获取二维码
        if (session.status === 'pending') {
            return res.json({
                success: true,
                data: { status: 'waiting', message: '等待获取二维码' }
            });
        }

        // 如果还在等待扫码，查询状态
        if (session.status === 'waiting' && session.loginCode) {
            const { queryScanStatus, getAuthCode } = require('./src/qqQrLogin');
            const status = await queryScanStatus(session.loginCode);

            console.log(`[扫码状态查询] sessionId=${req.params.sessionId}, loginCode=${session.loginCode}, status=${status.status}`);

            if (status.status === 'OK') {
                const code = await getAuthCode(status.ticket);
                session.status = 'success';
                session.code = code;
                qrLoginSessions.set(req.params.sessionId, session);
                console.log(`[扫码成功] sessionId=${req.params.sessionId}, code=${code}`);

                return res.json({
                    success: true,
                    data: { status: 'success', code: code }
                });
            } else if (status.status === 'Used') {
                session.status = 'expired';
                qrLoginSessions.set(req.params.sessionId, session);
                console.log(`[二维码过期] sessionId=${req.params.sessionId}`);
                return res.json({
                    success: true,
                    data: { status: 'expired', message: '二维码已过期' }
                });
            } else if (status.status === 'Wait') {
                // 等待扫码中
                return res.json({
                    success: true,
                    data: { status: 'waiting', message: '等待扫码' }
                });
            } else if (status.status === 'Error') {
                return res.json({
                    success: true,
                    data: { status: 'waiting', message: '等待扫码' }
                });
            }
        }

        res.json({
            success: true,
            data: session
        });
    } catch (error) {
        console.error(`[扫码状态查询错误] sessionId=${req.params.sessionId}, error=${error.message}`);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 辅助函数：获取登录码
async function requestLoginCode() {
    const axios = require('axios');
    const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const QUA = 'V1_HT5_QDT_0.70.2209190_x64_0_DEV_D';
    
    const response = await axios.get('https://q.qq.com/ide/devtoolAuth/GetLoginCode', {
        headers: {
            qua: QUA,
            host: 'q.qq.com',
            accept: 'application/json',
            'content-type': 'application/json',
            'user-agent': CHROME_UA,
        }
    });

    const { code, data } = response.data || {};
    if (+code !== 0 || !data || !data.code) {
        throw new Error('获取QQ扫码登录码失败');
    }

    return {
        loginCode: data.code,
        url: `https://h5.qzone.qq.com/qqq/code/${data.code}?_proxy=1&from=ide`,
    };
}

// 首页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
const PORT = process.env.PORT || 3456;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
    const addresses = getLocalAddresses();
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║              🌾 QQ农场共享版服务器已启动 🌾                  ║
║                                                              ║
║   本机访问: http://localhost:${PORT}                          ║
║   局域网访问: http://${addresses[0] || '本机IP'}:${PORT}                   ║
║   API文档: http://${addresses[0] || '本机IP'}:${PORT}/api/accounts        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});

// 获取本机局域网IP
function getLocalAddresses() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push(iface.address);
            }
        }
    }
    return addresses;
}

// 优雅退出
process.on('SIGINT', async () => {
    console.log('\n[服务器] 正在关闭...');
    await farmManager.stopAll();
    server.close(() => {
        console.log('[服务器] 已关闭');
        process.exit(0);
    });
});

module.exports = { app, server };
