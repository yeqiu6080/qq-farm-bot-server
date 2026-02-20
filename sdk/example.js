/**
 * QQ Farm SDK 使用示例
 */

const QFarmSDK = require('./index');

// 创建 SDK 实例
const sdk = new QFarmSDK({
    baseURL: 'http://localhost:3001',
    timeout: 30000
});

// 监听事件
sdk.on('error', (error) => {
    console.error('SDK 错误:', error.message);
});

sdk.on('wsConnected', () => {
    console.log('WebSocket 已连接');
});

sdk.on('wsDisconnected', (data) => {
    console.log('WebSocket 已断开:', data);
});

sdk.on('accountUpdate', (data) => {
    console.log('账号状态更新:', data);
});

// ==================== 示例 1: 基础账号管理 ====================
async function example1_BasicAccountManagement() {
    console.log('\n=== 示例 1: 基础账号管理 ===\n');
    
    try {
        // 获取所有账号
        const accounts = await sdk.getAccounts();
        console.log('当前账号列表:', accounts);

        // 添加新账号（使用已有登录码）
        // const newAccount = await sdk.addAccount({
        //     name: '我的农场账号',
        //     code: 'your_login_code_here',
        //     platform: 'qq',
        //     config: {
        //         farmCheckInterval: 10,
        //         friendCheckInterval: 10,
        //         enableSteal: true,
        //         enableFriendHelp: true
        //     }
        // });
        // console.log('添加账号成功:', newAccount);

    } catch (error) {
        console.error('操作失败:', error.message);
    }
}

// ==================== 示例 2: 扫码登录 ====================
async function example2_QrLogin() {
    console.log('\n=== 示例 2: 扫码登录 ===\n');
    
    try {
        // 方式 1: 自动获取QQ昵称（推荐）
        // 不填 accountName，会自动从服务器获取QQ昵称
        const result = await sdk.fullQrLogin({
            onStatus: (status) => {
                console.log(`[${status.stage}] ${status.message}`);
                if (status.qrUrl) {
                    console.log('二维码URL:', status.qrUrl);
                }
            }
        });
        console.log('登录成功!');
        console.log('账号ID:', result.account.id);
        console.log('账号名称:', result.account.name);  // 这是QQ昵称
        console.log('等级:', result.status?.userState?.level);

        // 方式 2: 自定义账号名称
        // const result = await sdk.fullQrLogin({
        //     accountName: '我的农场账号',  // 使用自定义名称
        //     onStatus: (status) => console.log(status.message)
        // });

        // 方式 3: 分步执行（更灵活）
        // const session = await sdk.startQrLogin();
        // console.log('会话ID:', session.sessionId);
        // 
        // const qrInfo = await sdk.getQrLoginUrl(session.sessionId);
        // console.log('二维码URL:', qrInfo.url);
        // 
        // // 等待用户扫码
        // const loginResult = await sdk.waitForQrLogin(session.sessionId, {
        //     interval: 3000,  // 每3秒检查一次
        //     timeout: 120000  // 2分钟超时
        // });
        // console.log('登录码:', loginResult.code);

    } catch (error) {
        console.error('扫码登录失败:', error.message);
    }
}

// ==================== 示例 3: 账号控制 ====================
async function example3_AccountControl() {
    console.log('\n=== 示例 3: 账号控制 ===\n');
    
    try {
        // 获取所有账号
        const accounts = await sdk.getAccounts();
        if (accounts.length === 0) {
            console.log('没有账号，请先添加账号');
            return;
        }

        const accountId = accounts[0].id;

        // 启动账号
        const startResult = await sdk.startAccount(accountId);
        console.log('启动结果:', startResult);

        // 等待几秒
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 获取账号状态
        const status = await sdk.getAccountStatus(accountId);
        console.log('账号状态:', status);

        // 停止账号
        // const stopResult = await sdk.stopAccount(accountId);
        // console.log('停止结果:', stopResult);

    } catch (error) {
        console.error('操作失败:', error.message);
    }
}

// ==================== 示例 4: 批量操作 ====================
async function example4_BatchOperations() {
    console.log('\n=== 示例 4: 批量操作 ===\n');
    
    try {
        // 启动所有账号
        // const results = await sdk.startAll();
        // console.log('批量启动结果:', results);

        // 获取运行中的账号
        const running = await sdk.getRunningAccounts();
        console.log('运行中的账号:', running);

        // 批量执行操作
        // const accountIds = running.map(acc => acc.id);
        // const batchResults = await sdk.batchExecute(accountIds, 'harvest');
        // console.log('批量操作结果:', batchResults);

    } catch (error) {
        console.error('操作失败:', error.message);
    }
}

// ==================== 示例 5: 状态查询 ====================
async function example5_StatusQuery() {
    console.log('\n=== 示例 5: 状态查询 ===\n');
    
    try {
        // 获取统计数据
        const stats = await sdk.getStats();
        console.log('统计数据:', stats);

        // 获取所有账号状态
        const allStatus = await sdk.getAllStatus();
        console.log('所有账号状态:', allStatus);

        // 获取账号日志
        const accounts = await sdk.getAccounts();
        if (accounts.length > 0) {
            const logs = await sdk.getAccountLogs(accounts[0].id, 10);
            console.log('最近日志:', logs);
        }

    } catch (error) {
        console.error('查询失败:', error.message);
    }
}

// ==================== 示例 6: WebSocket 实时通信 ====================
async function example6_WebSocket() {
    console.log('\n=== 示例 6: WebSocket 实时通信 ===\n');
    
    try {
        // 连接 WebSocket
        await sdk.connectWebSocket();
        console.log('WebSocket 连接成功');

        // 获取账号列表
        sdk.wsGetAccounts();

        // 监听账号列表更新
        sdk.once('accountsUpdate', (accounts) => {
            console.log('收到账号列表:', accounts);
            
            // 订阅第一个账号的状态更新
            if (accounts.length > 0) {
                sdk.subscribe(accounts[0].id);
            }
        });

        // 等待几秒接收事件
        await new Promise(resolve => setTimeout(resolve, 10000));

        // 断开连接
        sdk.disconnectWebSocket();
        console.log('WebSocket 已断开');

    } catch (error) {
        console.error('WebSocket 错误:', error.message);
    }
}

// ==================== 示例 7: 完整工作流 ====================
async function example7_FullWorkflow() {
    console.log('\n=== 示例 7: 完整工作流 ===\n');
    
    try {
        // 1. 扫码登录获取登录码
        console.log('步骤 1: 开始扫码登录...');
        const loginResult = await sdk.fullQrLogin({
            onStatus: (status) => {
                console.log(`  [${status.stage}] ${status.message}`);
            }
        });
        console.log('登录码获取成功');

        // 2. 添加账号
        console.log('\n步骤 2: 添加账号...');
        const account = await sdk.addAccount({
            name: `农场账号_${Date.now()}`,
            code: loginResult.code,
            config: {
                enableSteal: true,
                enableFriendHelp: true
            }
        });
        console.log('账号添加成功:', account.id);

        // 3. 启动账号
        console.log('\n步骤 3: 启动账号...');
        await sdk.startAccount(account.id);
        console.log('账号已启动');

        // 4. 获取状态
        console.log('\n步骤 4: 获取账号状态...');
        const status = await sdk.getAccountStatus(account.id);
        console.log('账号状态:', {
            name: status.userState?.name,
            level: status.userState?.level,
            gold: status.userState?.gold,
            isRunning: status.isRunning
        });

        // 5. 连接 WebSocket 实时监听
        console.log('\n步骤 5: 连接 WebSocket...');
        await sdk.connectWebSocket();
        sdk.subscribe(account.id);
        
        sdk.on('accountUpdate', (data) => {
            console.log('实时更新:', data);
        });

        // 运行一段时间后停止
        console.log('\n账号运行中，10秒后停止...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // 6. 停止账号
        console.log('\n步骤 6: 停止账号...');
        await sdk.stopAccount(account.id);
        sdk.disconnectWebSocket();
        console.log('工作流完成');

    } catch (error) {
        console.error('工作流失败:', error.message);
    }
}

// ==================== 主程序 ====================
async function main() {
    // 选择要运行的示例
    const examples = {
        1: example1_BasicAccountManagement,
        2: example2_QrLogin,
        3: example3_AccountControl,
        4: example4_BatchOperations,
        5: example5_StatusQuery,
        6: example6_WebSocket,
        7: example7_FullWorkflow
    };

    const choice = process.argv[2] || '1';
    const example = examples[choice];

    if (example) {
        await example();
    } else {
        console.log('可用示例:');
        console.log('  1 - 基础账号管理');
        console.log('  2 - 扫码登录');
        console.log('  3 - 账号控制');
        console.log('  4 - 批量操作');
        console.log('  5 - 状态查询');
        console.log('  6 - WebSocket 实时通信');
        console.log('  7 - 完整工作流');
        console.log('\n使用方法: node example.js [1-7]');
    }

    process.exit(0);
}

main().catch(console.error);
