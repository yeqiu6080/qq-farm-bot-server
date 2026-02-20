/**
 * QQ Farm SDK - Node.js 连接器
 * 封装连接服务器、查询账号状态、添加/登录账号等功能
 */

const axios = require('axios');
const EventEmitter = require('events');
const WebSocket = require('ws');

class QFarmSDK extends EventEmitter {
    /**
     * 创建 QQ Farm SDK 实例
     * @param {Object} options - 配置选项
     * @param {string} options.baseURL - 服务器地址，默认 http://localhost:3001
     * @param {number} options.timeout - 请求超时时间，默认 30000ms
     */
    constructor(options = {}) {
        super();
        this.baseURL = options.baseURL || 'http://localhost:3001';
        this.timeout = options.timeout || 30000;
        this.ws = null;
        this.wsClientId = null;
        this.subscriptions = new Set();
        
        // 创建 axios 实例
        this.http = axios.create({
            baseURL: this.baseURL,
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // 请求拦截器
        this.http.interceptors.request.use(
            config => {
                this.emit('request', config);
                return config;
            },
            error => {
                this.emit('error', error);
                return Promise.reject(error);
            }
        );

        // 响应拦截器
        this.http.interceptors.response.use(
            response => {
                this.emit('response', response);
                return response.data;
            },
            error => {
                this.emit('error', error);
                return Promise.reject(this._handleError(error));
            }
        );
    }

    /**
     * 统一处理错误
     * @private
     */
    _handleError(error) {
        if (error.response) {
            const { status, data } = error.response;
            return {
                code: status,
                message: data?.message || `HTTP ${status} 错误`,
                data: data
            };
        } else if (error.request) {
            return {
                code: 'NETWORK_ERROR',
                message: '网络请求失败，请检查服务器是否运行'
            };
        } else {
            return {
                code: 'UNKNOWN_ERROR',
                message: error.message || '未知错误'
            };
        }
    }

    // ==================== 账号管理 API ====================

    /**
     * 获取所有账号
     * @returns {Promise<Array>} 账号列表
     */
    async getAccounts() {
        const result = await this.http.get('/api/accounts');
        return result.data || [];
    }

    /**
     * 获取单个账号
     * @param {string} accountId - 账号ID
     * @returns {Promise<Object>} 账号信息
     */
    async getAccount(accountId) {
        const result = await this.http.get(`/api/accounts/${accountId}`);
        return result.data;
    }

    /**
     * 添加账号
     * @param {Object} account - 账号信息
     * @param {string} account.name - 账号名称
     * @param {string} account.code - 登录码
     * @param {string} [account.platform='qq'] - 平台类型
     * @param {Object} [account.config={}] - 账号配置
     * @returns {Promise<Object>} 创建的账号
     */
    async addAccount(account) {
        if (!account.name || !account.code) {
            throw new Error('账号名称和登录码不能为空');
        }
        
        const result = await this.http.post('/api/accounts', {
            name: account.name,
            code: account.code,
            platform: account.platform || 'qq',
            config: account.config || {}
        });
        return result.data;
    }

    /**
     * 更新账号
     * @param {string} accountId - 账号ID
     * @param {Object} updates - 更新内容
     * @returns {Promise<Object>} 更新后的账号
     */
    async updateAccount(accountId, updates) {
        const result = await this.http.put(`/api/accounts/${accountId}`, updates);
        return result.data;
    }

    /**
     * 删除账号
     * @param {string} accountId - 账号ID
     * @returns {Promise<Object>} 删除结果
     */
    async deleteAccount(accountId) {
        const result = await this.http.delete(`/api/accounts/${accountId}`);
        return result;
    }

    // ==================== 账号控制 API ====================

    /**
     * 启动账号
     * @param {string} accountId - 账号ID
     * @returns {Promise<Object>} 启动结果
     */
    async startAccount(accountId) {
        const result = await this.http.post(`/api/accounts/${accountId}/start`);
        return result.data;
    }

    /**
     * 停止账号
     * @param {string} accountId - 账号ID
     * @returns {Promise<Object>} 停止结果
     */
    async stopAccount(accountId) {
        const result = await this.http.post(`/api/accounts/${accountId}/stop`);
        return result.data;
    }

    /**
     * 启动所有账号
     * @returns {Promise<Object>} 启动结果
     */
    async startAll() {
        const result = await this.http.post('/api/start-all');
        return result.data;
    }

    /**
     * 停止所有账号
     * @returns {Promise<Object>} 停止结果
     */
    async stopAll() {
        const result = await this.http.post('/api/stop-all');
        return result.data;
    }

    // ==================== 状态查询 API ====================

    /**
     * 获取账号状态
     * @param {string} accountId - 账号ID
     * @returns {Promise<Object>} 账号状态
     */
    async getAccountStatus(accountId) {
        const result = await this.http.get(`/api/accounts/${accountId}/status`);
        return result.data;
    }

    /**
     * 获取所有账号状态
     * @returns {Promise<Object>} 所有账号状态
     */
    async getAllStatus() {
        const result = await this.http.get('/api/status');
        return result.data;
    }

    /**
     * 获取账号日志
     * @param {string} accountId - 账号ID
     * @param {number} [limit=100] - 日志条数限制
     * @returns {Promise<Array>} 日志列表
     */
    async getAccountLogs(accountId, limit = 100) {
        const result = await this.http.get(`/api/accounts/${accountId}/logs?limit=${limit}`);
        return result.data || [];
    }

    /**
     * 获取统计数据
     * @returns {Promise<Object>} 统计数据
     */
    async getStats() {
        const result = await this.http.get('/api/stats');
        return result.data;
    }

    /**
     * 获取账号连接状态
     * @param {string} accountId - 账号ID
     * @returns {Promise<Object>} 连接状态
     */
    async getConnectionState(accountId) {
        const result = await this.http.get(`/api/accounts/${accountId}/connection`);
        return result.data;
    }

    /**
     * 获取所有账号连接状态
     * @returns {Promise<Object>} 所有账号连接状态
     */
    async getAllConnectionStates() {
        const result = await this.http.get('/api/connections');
        return result.data;
    }

    /**
     * 清理已停止的连接
     * @returns {Promise<Object>} 清理结果
     */
    async cleanupConnections() {
        const result = await this.http.post('/api/cleanup');
        return result;
    }

    // ==================== 操作 API ====================

    /**
     * 执行账号操作
     * @param {string} accountId - 账号ID
     * @param {string} action - 操作名称
     * @returns {Promise<Object>} 操作结果
     */
    async executeAction(accountId, action) {
        const result = await this.http.post(`/api/accounts/${accountId}/action`, { action });
        return result.data;
    }

    // ==================== 扫码登录 API ====================

    /**
     * 开始扫码登录
     * @returns {Promise<Object>} 会话信息
     */
    async startQrLogin() {
        const result = await this.http.post('/api/qr-login');
        return result.data;
    }

    /**
     * 获取扫码登录二维码URL
     * @param {string} sessionId - 会话ID
     * @returns {Promise<Object>} 二维码信息
     */
    async getQrLoginUrl(sessionId) {
        const result = await this.http.get(`/api/qr-login/${sessionId}/url`);
        return result.data;
    }

    /**
     * 查询扫码状态
     * @param {string} sessionId - 会话ID
     * @returns {Promise<Object>} 扫码状态
     */
    async queryQrStatus(sessionId) {
        const result = await this.http.get(`/api/qr-login/${sessionId}/status`);
        return result.data;
    }

    /**
     * 等待扫码完成（轮询方式）
     * @param {string} sessionId - 会话ID
     * @param {Object} options - 选项
     * @param {number} [options.interval=3000] - 轮询间隔(ms)
     * @param {number} [options.timeout=120000] - 超时时间(ms)
     * @returns {Promise<Object>} 登录结果
     */
    async waitForQrLogin(sessionId, options = {}) {
        const interval = options.interval || 3000;
        const timeout = options.timeout || 120000;
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const check = async () => {
                try {
                    const status = await this.queryQrStatus(sessionId);
                    
                    if (status.status === 'success') {
                        resolve(status);
                        return;
                    }
                    
                    if (status.status === 'expired') {
                        reject(new Error('二维码已过期'));
                        return;
                    }

                    if (Date.now() - startTime > timeout) {
                        reject(new Error('扫码登录超时'));
                        return;
                    }

                    this.emit('qrStatus', status);
                    setTimeout(check, interval);
                } catch (error) {
                    reject(error);
                }
            };

            check();
        });
    }

    // ==================== WebSocket 实时通信 ====================

    /**
     * 连接 WebSocket
     * @returns {Promise<void>}
     */
    connectWebSocket() {
        return new Promise((resolve, reject) => {
            const wsUrl = this.baseURL.replace(/^http/, 'ws');
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.on('open', () => {
                this.emit('wsConnected');
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this._handleWsMessage(message);
                } catch (e) {
                    this.emit('wsError', e);
                }
            });

            this.ws.on('close', (code, reason) => {
                this.ws = null;
                this.wsClientId = null;
                this.emit('wsDisconnected', { code, reason });
            });

            this.ws.on('error', (error) => {
                this.emit('wsError', error);
                reject(error);
            });

            // 等待连接确认
            this.once('connected', (data) => {
                this.wsClientId = data.clientId;
                resolve(data);
            });

            // 连接超时
            setTimeout(() => {
                if (!this.wsClientId) {
                    reject(new Error('WebSocket 连接超时'));
                }
            }, 10000);
        });
    }

    /**
     * 处理 WebSocket 消息
     * @private
     */
    _handleWsMessage(message) {
        this.emit('wsMessage', message);

        switch (message.type) {
            case 'connected':
                this.emit('connected', message);
                break;
            case 'subscribed':
                this.emit('subscribed', message);
                break;
            case 'accounts':
                this.emit('accountsUpdate', message.data);
                break;
            case 'status':
                this.emit('statusUpdate', message.data);
                break;
            default:
                // 账号状态更新
                if (message.accountId || message.type?.includes('Update')) {
                    this.emit('accountUpdate', message);
                }
        }
    }

    /**
     * 发送 WebSocket 消息
     * @private
     */
    _sendWsMessage(data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket 未连接');
        }
        this.ws.send(JSON.stringify(data));
    }

    /**
     * 订阅账号状态更新
     * @param {string} accountId - 账号ID，传入 'all' 订阅所有账号
     */
    subscribe(accountId) {
        this._sendWsMessage({
            action: 'subscribe',
            accountId: accountId
        });
        this.subscriptions.add(accountId);
    }

    /**
     * 取消订阅账号状态更新
     * @param {string} accountId - 账号ID
     */
    unsubscribe(accountId) {
        this._sendWsMessage({
            action: 'unsubscribe',
            accountId: accountId
        });
        this.subscriptions.delete(accountId);
    }

    /**
     * 通过 WebSocket 获取账号列表
     */
    wsGetAccounts() {
        this._sendWsMessage({ action: 'getAccounts' });
    }

    /**
     * 通过 WebSocket 获取状态
     */
    wsGetStatus() {
        this._sendWsMessage({ action: 'getStatus' });
    }

    /**
     * 断开 WebSocket 连接
     */
    disconnectWebSocket() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    // ==================== 便捷方法 ====================

    /**
     * 快速添加并启动账号
     * @param {Object} account - 账号信息
     * @returns {Promise<Object>} 启动后的账号信息
     */
    async addAndStart(account) {
        const newAccount = await this.addAccount(account);
        await this.startAccount(newAccount.id);
        return newAccount;
    }

    /**
     * 重启账号
     * @param {string} accountId - 账号ID
     * @returns {Promise<Object>} 重启结果
     */
    async restartAccount(accountId) {
        await this.stopAccount(accountId);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await this.startAccount(accountId);
    }

    /**
     * 获取运行中的账号
     * @returns {Promise<Array>} 运行中的账号列表
     */
    async getRunningAccounts() {
        const allStatus = await this.getAllStatus();
        return Object.entries(allStatus)
            .filter(([_, status]) => status.isRunning)
            .map(([id, status]) => ({ id, ...status }));
    }

    /**
     * 批量执行操作
     * @param {Array<string>} accountIds - 账号ID列表
     * @param {string} action - 操作名称
     * @returns {Promise<Array>} 操作结果列表
     */
    async batchExecute(accountIds, action) {
        const promises = accountIds.map(id => 
            this.executeAction(id, action)
                .then(result => ({ id, success: true, result }))
                .catch(error => ({ id, success: false, error: error.message }))
        );
        return await Promise.all(promises);
    }

    /**
     * 完整的扫码登录流程
     * @param {Object} options - 选项
     * @param {string} [options.accountName] - 账号名称（可选，不提供则自动获取QQ昵称）
     * @param {Function} [options.onStatus] - 状态回调
     * @param {boolean} [options.autoAdd=true] - 扫码成功后是否自动添加账号
     * @returns {Promise<Object>} 登录结果
     */
    async fullQrLogin(options = {}) {
        const { accountName, onStatus, autoAdd = true } = options;
        
        // 1. 开始扫码登录
        const session = await this.startQrLogin();
        
        // 2. 获取二维码URL
        const qrInfo = await this.getQrLoginUrl(session.sessionId);
        
        if (onStatus) {
            onStatus({
                stage: 'waiting',
                message: '请使用QQ扫码',
                qrUrl: qrInfo.url
            });
        }

        // 3. 等待扫码完成
        const loginResult = await this.waitForQrLogin(session.sessionId, {
            interval: 3000,
            timeout: 120000
        });

        if (onStatus) {
            onStatus({
                stage: 'success',
                message: '扫码成功，正在获取账号信息...',
                code: loginResult.code
            });
        }

        // 4. 自动添加账号
        if (autoAdd) {
            // 如果没有提供账号名，先添加一个临时账号用于登录获取昵称
            const tempName = accountName || `账号_${Date.now()}`;
            
            const account = await this.addAccount({
                name: tempName,
                code: loginResult.code
            });

            // 启动账号以获取真实昵称
            if (onStatus) {
                onStatus({
                    stage: 'fetching',
                    message: '正在获取QQ昵称...',
                    accountId: account.id
                });
            }

            try {
                await this.startAccount(account.id);
                
                // 等待获取状态
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const status = await this.getAccountStatus(account.id);
                const qqNickname = status?.userState?.name;
                
                // 如果获取到昵称且用户没自定义名称，则更新账号名
                if (qqNickname && !accountName) {
                    await this.updateAccount(account.id, { name: qqNickname });
                    account.name = qqNickname;
                }

                if (onStatus) {
                    onStatus({
                        stage: 'completed',
                        message: `登录成功: ${account.name}`,
                        account: account,
                        status: status
                    });
                }

                return { 
                    ...loginResult, 
                    account,
                    nickname: qqNickname,
                    status 
                };
            } catch (error) {
                // 启动失败也返回账号信息
                return { 
                    ...loginResult, 
                    account,
                    error: error.message 
                };
            }
        }

        return loginResult;
    }
}

module.exports = QFarmSDK;
