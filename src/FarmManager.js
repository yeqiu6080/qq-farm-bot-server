/**
 * 农场管理器
 * 管理多个农场连接的启动/停止/状态
 * 支持可选的多账号进程隔离（默认关闭）
 */

const { fork } = require('child_process');
const path = require('path');
const FarmConnection = require('./FarmConnection');
const { loadProto } = require('./proto');

class FarmManager {
    constructor(accountManager, options = {}) {
        this.accountManager = accountManager;
        this.connections = new Map(); // accountId -> FarmConnection (单进程模式)
        this.workers = new Map(); // accountId -> WorkerProcess (多进程模式)
        this.broadcastCallback = null;
        this.protoLoaded = false;
        
        // 进程隔离配置（默认关闭）
        this.useProcessIsolation = options.useProcessIsolation === true;
        this.maxWorkers = options.maxWorkers || 50; // 最大Worker数量限制
        
        // Worker 进程池（用于多进程模式）
        this.workerPool = new Map();
        
        // 全局配置存储
        this.globalConfig = {
            offlineReminder: null,
            useProcessIsolation: this.useProcessIsolation
        };
        
        // 日志存储（用于多进程模式）
        this.logs = new Map(); // accountId -> logs[]
        
        // 状态存储（用于多进程模式）
        this.statuses = new Map(); // accountId -> status
    }

    setBroadcastCallback(callback) {
        this.broadcastCallback = callback;
    }

    async ensureProtoLoaded() {
        if (!this.protoLoaded) {
            await loadProto();
            this.protoLoaded = true;
        }
    }

    /**
     * 设置是否使用进程隔离
     * @param {boolean} enabled 
     */
    setProcessIsolation(enabled) {
        this.useProcessIsolation = enabled === true;
        this.globalConfig.useProcessIsolation = this.useProcessIsolation;
        console.log(`[FarmManager] 进程隔离已${this.useProcessIsolation ? '启用' : '禁用'}`);
    }

    /**
     * 获取当前进程隔离状态
     */
    isProcessIsolationEnabled() {
        return this.useProcessIsolation;
    }

    /**
     * 启动单个账号
     */
    async startAccount(accountId) {
        if (this.useProcessIsolation) {
            return this.startAccountInWorker(accountId);
        } else {
            return this.startAccountInProcess(accountId);
        }
    }

    /**
     * 在单进程中启动账号（默认模式）
     */
    async startAccountInProcess(accountId) {
        await this.ensureProtoLoaded();

        const account = this.accountManager.getAccount(accountId);
        if (!account) {
            throw new Error('账号不存在');
        }

        // 如果已经在运行，先停止
        if (this.connections.has(accountId)) {
            await this.stopAccountInProcess(accountId);
        }

        const connection = new FarmConnection(account);
        
        // 设置事件监听
        this.setupConnectionListeners(accountId, connection);

        // 连接
        try {
            const loginState = await connection.connect();
            this.connections.set(accountId, connection);
            
            return {
                success: true,
                message: '启动成功',
                state: loginState,
                mode: 'in-process'
            };
        } catch (error) {
            throw new Error(`启动失败: ${error.message}`);
        }
    }

    /**
     * 在独立 Worker 进程中启动账号（进程隔离模式）
     */
    async startAccountInWorker(accountId) {
        const account = this.accountManager.getAccount(accountId);
        if (!account) {
            throw new Error('账号不存在');
        }

        // 检查Worker数量限制
        if (this.workers.size >= this.maxWorkers) {
            throw new Error(`已达到最大Worker数量限制 (${this.maxWorkers})`);
        }

        // 如果已经在运行，先停止
        if (this.workers.has(accountId)) {
            await this.stopAccountInWorker(accountId);
        }

        return new Promise((resolve, reject) => {
            try {
                // 创建 Worker 进程
                const workerPath = path.join(__dirname, 'FarmWorker.js');
                const worker = fork(workerPath, [], {
                    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
                    env: { 
                        ...process.env, 
                        FARM_ACCOUNT_ID: String(accountId),
                        FARM_WORKER: '1'
                    }
                });

                const workerData = {
                    process: worker,
                    accountId: accountId,
                    status: 'starting',
                    startTime: Date.now()
                };

                this.workers.set(accountId, workerData);

                // 监听 Worker 消息
                worker.on('message', (msg) => {
                    this.handleWorkerMessage(accountId, msg);
                });

                // 监听 Worker 退出
                worker.on('exit', (code, signal) => {
                    console.log(`[Worker] 账号 ${accountId} 进程退出 (code=${code}, signal=${signal || 'none'})`);
                    this.workers.delete(accountId);
                    this.broadcast(accountId, {
                        type: 'accountStopped',
                        accountId
                    });
                });

                worker.on('error', (err) => {
                    console.error(`[Worker] 账号 ${accountId} 进程错误:`, err);
                    reject(new Error(`Worker 进程启动失败: ${err.message}`));
                });

                // 等待 Worker 启动完成
                const timeout = setTimeout(() => {
                    reject(new Error('Worker 启动超时'));
                }, 30000);

                const checkStarted = (msg) => {
                    if (msg.type === 'started') {
                        clearTimeout(timeout);
                        worker.off('message', checkStarted);
                        resolve({
                            success: true,
                            message: '启动成功',
                            state: msg.data,
                            mode: 'worker'
                        });
                    } else if (msg.type === 'error') {
                        clearTimeout(timeout);
                        worker.off('message', checkStarted);
                        reject(new Error(msg.error));
                    }
                };

                worker.on('message', checkStarted);

                // 发送启动指令
                worker.send({
                    type: 'start',
                    account: account,
                    config: this.globalConfig
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 处理 Worker 进程消息
     */
    handleWorkerMessage(accountId, msg) {
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'status':
                this.statuses.set(accountId, msg.data);
                this.broadcast(accountId, {
                    type: 'stateChanged',
                    accountId,
                    data: msg.data
                });
                break;
            case 'log':
                // 存储日志
                if (!this.logs.has(accountId)) {
                    this.logs.set(accountId, []);
                }
                const logs = this.logs.get(accountId);
                logs.push(msg.data);
                if (logs.length > 1000) logs.shift();
                
                this.broadcast(accountId, {
                    type: 'log',
                    accountId,
                    data: msg.data
                });
                break;
            case 'connected':
                this.broadcast(accountId, {
                    type: 'accountConnected',
                    accountId,
                    data: msg.data
                });
                break;
            case 'disconnected':
                this.broadcast(accountId, {
                    type: 'accountDisconnected',
                    accountId,
                    data: msg.data
                });
                break;
            case 'connectionLost':
                this.broadcast(accountId, {
                    type: 'connectionLost',
                    accountId,
                    data: msg.data
                });
                break;
            case 'statsChanged':
                this.broadcast(accountId, {
                    type: 'statsChanged',
                    accountId,
                    data: msg.data
                });
                break;
        }
    }

    /**
     * 设置连接事件监听
     */
    setupConnectionListeners(accountId, connection) {
        connection.on('connected', (state) => {
            this.broadcast(accountId, {
                type: 'accountConnected',
                accountId,
                data: {
                    ...connection.getStatus(),
                    ...state
                }
            });
        });

        connection.on('disconnected', (data) => {
            this.broadcast(accountId, {
                type: 'accountDisconnected',
                accountId,
                data
            });
        });

        connection.on('connectionLost', (data) => {
            this.broadcast(accountId, {
                type: 'connectionLost',
                accountId,
                data
            });
        });

        connection.on('stateChanged', (state) => {
            this.broadcast(accountId, {
                type: 'stateChanged',
                accountId,
                data: state
            });
        });

        connection.on('statsChanged', (stats) => {
            this.broadcast(accountId, {
                type: 'statsChanged',
                accountId,
                data: stats
            });
        });

        connection.on('log', (logEntry) => {
            this.broadcast(accountId, {
                type: 'log',
                accountId,
                data: logEntry
            });
        });

        connection.on('stopped', () => {
            this.broadcast(accountId, {
                type: 'accountStopped',
                accountId
            });
        });
    }

    /**
     * 停止单个账号
     */
    async stopAccount(accountId) {
        if (this.useProcessIsolation && this.workers.has(accountId)) {
            return this.stopAccountInWorker(accountId);
        } else {
            return this.stopAccountInProcess(accountId);
        }
    }

    /**
     * 停止单进程模式的账号
     */
    async stopAccountInProcess(accountId) {
        const connection = this.connections.get(accountId);
        if (!connection) {
            return { success: false, message: '账号未运行' };
        }

        await connection.stop();
        this.connections.delete(accountId);
        
        return { success: true, message: '已停止' };
    }

    /**
     * 停止 Worker 模式的账号
     */
    async stopAccountInWorker(accountId) {
        const workerData = this.workers.get(accountId);
        if (!workerData) {
            return { success: false, message: '账号未运行' };
        }

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                // 超时强制终止
                try {
                    workerData.process.kill('SIGTERM');
                } catch (e) {}
                this.workers.delete(accountId);
                resolve({ success: true, message: '已停止（强制）' });
            }, 5000);

            workerData.process.once('exit', () => {
                clearTimeout(timeout);
                this.workers.delete(accountId);
                resolve({ success: true, message: '已停止' });
            });

            // 发送停止指令
            workerData.process.send({ type: 'stop' });
        });
    }

    /**
     * 获取账号连接状态
     */
    getConnectionState(accountId) {
        // 优先检查 Worker 模式
        if (this.workers.has(accountId)) {
            const workerData = this.workers.get(accountId);
            const status = this.statuses.get(accountId) || {};
            return {
                isRunning: true,
                isConnected: status.isConnected || false,
                connectionState: status.connectionState || 'connecting',
                mode: 'worker',
                message: 'Worker 模式运行中'
            };
        }

        // 检查单进程模式
        const connection = this.connections.get(accountId);
        if (!connection) {
            return {
                isRunning: false,
                isConnected: false,
                connectionState: 'stopped',
                message: '账号未运行'
            };
        }
        
        const status = connection.getStatus();
        return {
            isRunning: status.isRunning,
            isConnected: status.isConnected,
            connectionState: status.connectionState,
            disconnectedAt: status.disconnectedAt,
            disconnectedReason: status.disconnectedReason,
            lastPongAgo: status.lastPongAgo,
            userState: status.userState,
            mode: 'in-process'
        };
    }

    /**
     * 获取所有账号连接状态
     */
    getAllConnectionStates() {
        const states = {};
        
        // 单进程模式
        for (const [accountId, connection] of this.connections) {
            const status = connection.getStatus();
            states[accountId] = {
                isRunning: status.isRunning,
                isConnected: status.isConnected,
                connectionState: status.connectionState,
                disconnectedAt: status.disconnectedAt,
                disconnectedReason: status.disconnectedReason,
                lastPongAgo: status.lastPongAgo,
                userState: status.userState,
                mode: 'in-process'
            };
        }

        // Worker 模式
        for (const [accountId, workerData] of this.workers) {
            const status = this.statuses.get(accountId) || {};
            states[accountId] = {
                isRunning: true,
                isConnected: status.isConnected || false,
                connectionState: status.connectionState || 'connecting',
                mode: 'worker'
            };
        }

        return states;
    }

    /**
     * 清理已停止的连接
     */
    cleanupStoppedConnections() {
        // 清理单进程模式
        for (const [accountId, connection] of this.connections) {
            if (!connection.isRunning) {
                this.connections.delete(accountId);
            }
        }

        // 清理 Worker 模式（已退出的 Worker 会在 exit 事件中自动清理）
    }

    /**
     * 启动所有账号
     */
    async startAll() {
        const accounts = this.accountManager.getAllAccounts();
        const results = [];
        
        for (const account of accounts) {
            try {
                const result = await this.startAccount(account.id);
                results.push({ accountId: account.id, success: true, result });
                // 间隔2秒启动下一个，避免同时连接
                await new Promise(r => setTimeout(r, 2000));
            } catch (error) {
                results.push({ accountId: account.id, success: false, error: error.message });
            }
        }
        
        return results;
    }

    /**
     * 停止所有账号
     */
    async stopAll() {
        const promises = [];
        
        // 停止单进程模式
        for (const [accountId, connection] of this.connections) {
            promises.push(this.stopAccountInProcess(accountId));
        }

        // 停止 Worker 模式
        for (const [accountId, workerData] of this.workers) {
            promises.push(this.stopAccountInWorker(accountId));
        }

        await Promise.all(promises);
        return { success: true, message: '所有账号已停止' };
    }

    /**
     * 获取账号状态
     */
    getAccountStatus(accountId) {
        // 优先检查 Worker 模式
        if (this.workers.has(accountId)) {
            return this.statuses.get(accountId) || null;
        }

        // 检查单进程模式
        const connection = this.connections.get(accountId);
        if (!connection) return null;
        return connection.getStatus();
    }

    /**
     * 获取所有账号状态
     */
    getAllStatus() {
        const statuses = {};
        
        // 单进程模式
        for (const [accountId, connection] of this.connections) {
            statuses[accountId] = connection.getStatus();
        }

        // Worker 模式
        for (const [accountId, workerData] of this.workers) {
            const status = this.statuses.get(accountId);
            if (status) {
                statuses[accountId] = status;
            }
        }

        return statuses;
    }

    /**
     * 获取运行中的账号数量
     */
    getRunningCount() {
        return this.connections.size + this.workers.size;
    }

    /**
     * 获取日志
     */
    getLogs(accountId, limit = 100) {
        // 优先检查 Worker 模式
        if (this.workers.has(accountId)) {
            const logs = this.logs.get(accountId) || [];
            return logs.slice(-limit);
        }

        // 检查单进程模式
        const connection = this.connections.get(accountId);
        if (!connection) return [];
        return connection.getLogs(limit);
    }

    /**
     * 获取总收获数
     */
    getTotalHarvests() {
        let total = 0;
        
        // 单进程模式
        for (const connection of this.connections.values()) {
            total += connection.stats.harvests;
        }

        // Worker 模式（从状态中获取）
        for (const status of this.statuses.values()) {
            total += (status.stats && status.stats.harvests) || 0;
        }

        return total;
    }

    /**
     * 获取总偷取数
     */
    getTotalSteals() {
        let total = 0;
        
        // 单进程模式
        for (const connection of this.connections.values()) {
            total += connection.stats.steals;
        }

        // Worker 模式（从状态中获取）
        for (const status of this.statuses.values()) {
            total += (status.stats && status.stats.steals) || 0;
        }

        return total;
    }

    /**
     * 执行单次操作
     */
    async executeAction(accountId, action) {
        // 优先检查 Worker 模式
        if (this.workers.has(accountId)) {
            return this.executeActionInWorker(accountId, action);
        }

        // 检查单进程模式
        const connection = this.connections.get(accountId);
        if (!connection) {
            throw new Error('账号未运行');
        }

        switch (action) {
            case 'checkFarm':
                await connection.checkFarm();
                return { success: true, message: '农场检查完成' };
            case 'sellFruits':
                await connection.sellFruits();
                return { success: true, message: '出售完成' };
            case 'claimTasks':
                await connection.claimTasks();
                return { success: true, message: '任务领取完成' };
            default:
                throw new Error('未知操作');
        }
    }

    /**
     * 在 Worker 中执行操作
     */
    async executeActionInWorker(accountId, action) {
        const workerData = this.workers.get(accountId);
        if (!workerData) {
            throw new Error('账号未运行');
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('操作超时'));
            }, 30000);

            const handler = (msg) => {
                if (msg.type === 'actionResult' && msg.action === action) {
                    clearTimeout(timeout);
                    workerData.process.off('message', handler);
                    if (msg.success) {
                        resolve(msg.data);
                    } else {
                        reject(new Error(msg.error));
                    }
                }
            };

            workerData.process.on('message', handler);
            workerData.process.send({ type: 'action', action });
        });
    }

    /**
     * 广播消息
     */
    broadcast(accountId, message) {
        if (this.broadcastCallback) {
            this.broadcastCallback(accountId, message);
        }
    }

    /**
     * 设置离线提醒配置
     */
    setOfflineReminder(config) {
        this.globalConfig.offlineReminder = config;
        
        // 广播配置到所有 Worker
        for (const [accountId, workerData] of this.workers) {
            workerData.process.send({
                type: 'config',
                config: this.globalConfig
            });
        }
    }

    /**
     * 获取离线提醒配置
     */
    getOfflineReminder() {
        return this.globalConfig.offlineReminder;
    }

    /**
     * 获取统计信息
     */
    getStats() {
        return {
            totalConnections: this.connections.size,
            totalWorkers: this.workers.size,
            totalRunning: this.getRunningCount(),
            useProcessIsolation: this.useProcessIsolation,
            maxWorkers: this.maxWorkers
        };
    }
}

module.exports = FarmManager;
