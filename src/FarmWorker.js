/**
 * Farm Worker 进程
 * 在独立进程中运行单个农场账号
 * 用于多账号进程隔离模式
 */

const FarmConnection = require('./FarmConnection');
const { loadProto } = require('./proto');

// Worker 状态
let connection = null;
let account = null;
let isRunning = false;
let globalConfig = {};

// 加载 protobuf
async function init() {
    try {
        await loadProto();
        console.log(`[Worker ${process.env.FARM_ACCOUNT_ID}] Protobuf 加载完成`);
    } catch (error) {
        console.error(`[Worker ${process.env.FARM_ACCOUNT_ID}] Protobuf 加载失败:`, error);
        process.exit(1);
    }
}

// 启动账号
async function start(data) {
    if (isRunning) {
        sendMessage('error', { error: '账号已在运行' });
        return;
    }

    try {
        account = data.account;
        globalConfig = data.config || {};

        connection = new FarmConnection(account);
        
        // 设置事件监听
        setupEventListeners();

        // 连接
        const loginState = await connection.connect();
        isRunning = true;

        sendMessage('started', { 
            accountId: account.id,
            loginState,
            mode: 'worker'
        });

        console.log(`[Worker ${account.id}] 启动成功`);

    } catch (error) {
        console.error(`[Worker ${account?.id}] 启动失败:`, error);
        sendMessage('error', { error: error.message });
        process.exit(1);
    }
}

// 停止账号
async function stop() {
    if (!connection) {
        process.exit(0);
        return;
    }

    try {
        isRunning = false;
        await connection.stop();
        console.log(`[Worker ${account?.id}] 已停止`);
    } catch (error) {
        console.error(`[Worker ${account?.id}] 停止时出错:`, error);
    }

    process.exit(0);
}

// 设置事件监听
function setupEventListeners() {
    connection.on('connected', (state) => {
        sendMessage('connected', { state });
    });

    connection.on('disconnected', (data) => {
        sendMessage('disconnected', { data });
    });

    connection.on('connectionLost', (data) => {
        sendMessage('connectionLost', { data });
    });

    connection.on('stateChanged', (state) => {
        sendMessage('status', state);
    });

    connection.on('statsChanged', (stats) => {
        sendMessage('statsChanged', { stats });
    });

    connection.on('log', (logEntry) => {
        sendMessage('log', logEntry);
    });

    connection.on('stopped', () => {
        sendMessage('stopped', {});
        process.exit(0);
    });
}

// 执行操作
async function executeAction(action) {
    if (!connection) {
        sendMessage('actionResult', { 
            action, 
            success: false, 
            error: '账号未运行' 
        });
        return;
    }

    try {
        let result;
        switch (action) {
            case 'checkFarm':
                await connection.checkFarm();
                result = { message: '农场检查完成' };
                break;
            case 'sellFruits':
                await connection.sellFruits();
                result = { message: '出售完成' };
                break;
            case 'claimTasks':
                await connection.claimTasks();
                result = { message: '任务领取完成' };
                break;
            default:
                throw new Error('未知操作');
        }

        sendMessage('actionResult', { 
            action, 
            success: true, 
            data: result 
        });
    } catch (error) {
        sendMessage('actionResult', { 
            action, 
            success: false, 
            error: error.message 
        });
    }
}

// 更新配置
function updateConfig(config) {
    globalConfig = { ...globalConfig, ...config };
    console.log(`[Worker ${account?.id}] 配置已更新`);
}

// 发送消息到主进程
function sendMessage(type, data) {
    if (process.send) {
        process.send({ type, ...data });
    }
}

// 定期发送状态更新
function startStatusReporter() {
    setInterval(() => {
        if (connection && isRunning) {
            const status = connection.getStatus();
            sendMessage('status', status);
        }
    }, 5000); // 每5秒报告一次状态
}

// 处理主进程消息
process.on('message', async (msg) => {
    if (!msg || !msg.type) return;

    switch (msg.type) {
        case 'start':
            await init();
            await start(msg);
            startStatusReporter();
            break;
        case 'stop':
            await stop();
            break;
        case 'action':
            await executeAction(msg.action);
            break;
        case 'config':
            updateConfig(msg.config);
            break;
    }
});

// 处理进程信号
process.on('SIGTERM', async () => {
    console.log(`[Worker ${account?.id}] 收到 SIGTERM 信号`);
    await stop();
});

process.on('SIGINT', async () => {
    console.log(`[Worker ${account?.id}] 收到 SIGINT 信号`);
    await stop();
});

// 错误处理
process.on('uncaughtException', (error) => {
    console.error(`[Worker ${account?.id}] 未捕获的异常:`, error);
    sendMessage('error', { error: error.message });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`[Worker ${account?.id}] 未处理的 Promise 拒绝:`, reason);
});

console.log(`[Worker ${process.env.FARM_ACCOUNT_ID}] 进程已启动，等待指令...`);
