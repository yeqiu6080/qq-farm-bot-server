/**
 * 农场管理器
 * 管理多个农场连接的启动/停止/状态
 */

const FarmConnection = require('./FarmConnection');
const { loadProto } = require('./proto');

class FarmManager {
    constructor(accountManager) {
        this.accountManager = accountManager;
        this.connections = new Map(); // accountId -> FarmConnection
        this.broadcastCallback = null;
        this.protoLoaded = false;
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
     * 启动单个账号
     */
    async startAccount(accountId) {
        await this.ensureProtoLoaded();

        const account = this.accountManager.getAccount(accountId);
        if (!account) {
            throw new Error('账号不存在');
        }

        // 如果已经在运行，先停止
        if (this.connections.has(accountId)) {
            await this.stopAccount(accountId);
        }

        const connection = new FarmConnection(account);
        
        // 设置事件监听
        connection.on('connected', (state) => {
            this.broadcast(accountId, {
                type: 'accountConnected',
                accountId,
                data: state
            });
        });

        connection.on('disconnected', (data) => {
            this.broadcast(accountId, {
                type: 'accountDisconnected',
                accountId,
                data
            });
            // 不要立即删除连接，保留以显示断开状态
            // this.connections.delete(accountId);
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

        // 连接
        try {
            const loginState = await connection.connect();
            this.connections.set(accountId, connection);
            
            return {
                success: true,
                message: '启动成功',
                state: loginState
            };
        } catch (error) {
            throw new Error(`启动失败: ${error.message}`);
        }
    }

    /**
     * 停止单个账号
     */
    async stopAccount(accountId) {
        const connection = this.connections.get(accountId);
        if (!connection) {
            return { success: false, message: '账号未运行' };
        }

        await connection.stop();
        this.connections.delete(accountId);
        
        return { success: true, message: '已停止' };
    }

    /**
     * 获取账号连接状态
     */
    getConnectionState(accountId) {
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
            userState: status.userState
        };
    }

    /**
     * 获取所有账号连接状态
     */
    getAllConnectionStates() {
        const states = {};
        for (const [accountId, connection] of this.connections) {
            const status = connection.getStatus();
            states[accountId] = {
                isRunning: status.isRunning,
                isConnected: status.isConnected,
                connectionState: status.connectionState,
                disconnectedAt: status.disconnectedAt,
                disconnectedReason: status.disconnectedReason,
                lastPongAgo: status.lastPongAgo,
                userState: status.userState
            };
        }
        return states;
    }

    /**
     * 清理已停止的连接
     */
    cleanupStoppedConnections() {
        for (const [accountId, connection] of this.connections) {
            if (!connection.isRunning) {
                this.connections.delete(accountId);
            }
        }
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
        for (const [accountId, connection] of this.connections) {
            promises.push(this.stopAccount(accountId));
        }
        await Promise.all(promises);
        return { success: true, message: '所有账号已停止' };
    }

    /**
     * 获取账号状态
     */
    getAccountStatus(accountId) {
        const connection = this.connections.get(accountId);
        if (!connection) return null;
        return connection.getStatus();
    }

    /**
     * 获取所有账号状态
     */
    getAllStatus() {
        const statuses = {};
        for (const [accountId, connection] of this.connections) {
            statuses[accountId] = connection.getStatus();
        }
        return statuses;
    }

    /**
     * 获取运行中的账号数量
     */
    getRunningCount() {
        return this.connections.size;
    }

    /**
     * 获取日志
     */
    getLogs(accountId, limit = 100) {
        const connection = this.connections.get(accountId);
        if (!connection) return [];
        return connection.getLogs(limit);
    }

    /**
     * 获取总收获数
     */
    getTotalHarvests() {
        let total = 0;
        for (const connection of this.connections.values()) {
            total += connection.stats.harvests;
        }
        return total;
    }

    /**
     * 获取总偷取数
     */
    getTotalSteals() {
        let total = 0;
        for (const connection of this.connections.values()) {
            total += connection.stats.steals;
        }
        return total;
    }

    /**
     * 执行单次操作
     */
    async executeAction(accountId, action) {
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
     * 广播消息
     */
    broadcast(accountId, message) {
        if (this.broadcastCallback) {
            this.broadcastCallback(accountId, message);
        }
    }
}

module.exports = FarmManager;
