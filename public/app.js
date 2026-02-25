/**
 * QQ农场共享版控制台前端 - Material Design 3
 */

class FarmApp {
    constructor() {
        this.ws = null;
        this.accounts = [];
        this.runningAccounts = new Map();
        this.logs = [];
        this.currentFilter = 'all';
        this.currentAccountId = null;
        this.reconnectTimer = null;
        this.qrSessionId = null;
        this.qrPollTimer = null;
        this.navOpen = false;
        
        this.init();
    }

    init() {
        this.connectWebSocket();
        this.bindEvents();
        this.loadAccounts();
        this.initMobileNav();
    }

    // ===== Mobile Navigation =====
    
    initMobileNav() {
        const navToggle = document.getElementById('navToggle');
        const navDrawer = document.getElementById('navDrawer');
        const bottomNav = document.getElementById('bottomNav');
        
        if (navToggle) {
            navToggle.addEventListener('click', () => {
                this.navOpen = !this.navOpen;
                navDrawer.classList.toggle('open', this.navOpen);
            });
        }
        
        // Close drawer when clicking outside
        document.addEventListener('click', (e) => {
            if (this.navOpen && !navDrawer.contains(e.target) && !navToggle.contains(e.target)) {
                this.navOpen = false;
                navDrawer.classList.remove('open');
            }
        });
        
        // Sync bottom nav with sidebar
        if (bottomNav) {
            bottomNav.querySelectorAll('.bottom-nav-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const page = item.dataset.page;
                    this.switchPage(page);
                });
            });
        }
    }

    // ===== WebSocket =====

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('[WebSocket] 已连接');
            this.updateConnectionStatus(true);

            // 订阅所有账号
            this.ws.send(JSON.stringify({
                action: 'subscribe',
                accountId: 'all'
            }));

            // 请求账号列表
            this.ws.send(JSON.stringify({
                action: 'getAccounts'
            }));

            // 请求运行中账号的状态
            this.ws.send(JSON.stringify({
                action: 'getStatus'
            }));
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            } catch (e) {
                console.error('[WebSocket] 消息解析失败:', e);
            }
        };
        
        this.ws.onclose = () => {
            console.log('[WebSocket] 连接关闭');
            this.updateConnectionStatus(false);
            this.reconnectTimer = setTimeout(() => this.connectWebSocket(), 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('[WebSocket] 错误:', error);
        };
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'connected':
                this.addLog('系统', data.message);
                break;
                
            case 'accounts':
                this.accounts = data.data;
                this.renderAccountsTable();
                this.updateStats();
                break;

            case 'status':
                // 初始化运行中账号的状态
                if (data.data) {
                    for (const [accountId, status] of Object.entries(data.data)) {
                        this.runningAccounts.set(accountId, status);
                    }
                    this.renderAccountsTable();
                    this.updateRunningAccounts();
                    this.updateStats();
                }
                break;

            case 'accountConnected': {
                const existingData = this.runningAccounts.get(data.accountId) || {};
                this.runningAccounts.set(data.accountId, {
                    ...existingData,
                    ...data.data,
                    isRunning: true,
                    isConnected: true,
                    connectionState: 'connected'
                });
                this.renderAccountsTable();
                this.updateRunningAccounts();
                this.updateStats();
                break;
            }
                
            case 'accountDisconnected': {
                if (this.runningAccounts.has(data.accountId)) {
                    const account = this.runningAccounts.get(data.accountId);
                    account.isConnected = false;
                    account.connectionState = 'disconnected';
                    account.disconnectedAt = data.data?.time || new Date().toISOString();
                    account.disconnectedReason = data.data?.reason || '连接断开';
                    this.runningAccounts.set(data.accountId, account);
                }
                this.updateRunningAccounts();
                this.updateStats();
                break;
            }

            case 'connectionLost': {
                if (this.runningAccounts.has(data.accountId)) {
                    const account = this.runningAccounts.get(data.accountId);
                    account.isConnected = false;
                    account.connectionState = 'error';
                    account.disconnectedReason = data.data?.reason || '连接丢失';
                    this.runningAccounts.set(data.accountId, account);
                }
                this.updateRunningAccounts();
                this.addLog('连接', `账号连接丢失: ${data.data?.reason}`, data.accountId);
                break;
            }

            case 'accountStopped':
                this.runningAccounts.delete(data.accountId);
                this.updateRunningAccounts();
                this.updateStats();
                break;

            case 'stateChanged': {
                if (this.runningAccounts.has(data.accountId)) {
                    const account = this.runningAccounts.get(data.accountId);
                    account.userState = { ...account.userState, ...data.data };
                    this.runningAccounts.set(data.accountId, account);
                    this.renderAccountsTable();
                    this.updateRunningAccounts();
                    if (this.currentAccountId === data.accountId) {
                        this.updateAccountDetail();
                    }
                }
                break;
            }

            case 'statsChanged': {
                if (this.runningAccounts.has(data.accountId)) {
                    const account = this.runningAccounts.get(data.accountId);
                    account.stats = { ...account.stats, ...data.data };
                    this.runningAccounts.set(data.accountId, account);
                    this.renderAccountsTable();
                    this.updateRunningAccounts();
                    this.updateStats();
                }
                break;
            }

            case 'log':
                this.addLog(data.data.tag, data.data.message, data.accountId);
                break;
        }
    }

    updateConnectionStatus(connected) {
        const indicator = document.getElementById('wsStatus');
        const text = document.getElementById('wsStatusText');
        
        if (connected) {
            indicator.classList.add('connected');
            indicator.classList.remove('error');
            text.textContent = '已连接';
        } else {
            indicator.classList.remove('connected');
            indicator.classList.add('error');
            text.textContent = '断开连接';
        }
    }

    // ===== Event Binding =====

    bindEvents() {
        // 导航切换
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.switchPage(page);
                
                // Close mobile nav drawer
                this.navOpen = false;
                document.getElementById('navDrawer').classList.remove('open');
            });
        });

        // 日志过滤器
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.currentFilter = chip.dataset.filter;
                this.renderLogs();
            });
        });
    }

    switchPage(page) {
        // 更新侧边栏导航
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === page) {
                item.classList.add('active');
            }
        });

        // 更新底部导航
        document.querySelectorAll('.bottom-nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === page) {
                item.classList.add('active');
            }
        });

        // 更新页面
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`page-${page}`).classList.add('active');

        // 更新标题
        const titles = {
            dashboard: '控制台总览',
            accounts: '账号管理',
            analytics: '数据分析',
            logs: '实时日志'
        };
        document.getElementById('pageTitle').textContent = titles[page];

        // 页面特定初始化
        if (page === 'analytics') {
            this.loadAnalytics();
        }
    }

    // ===== Analytics =====

    async loadAnalytics() {
        // 加载推荐
        await this.loadRecommendation();
        // 加载排行榜
        await this.loadLeaderboard();
    }

    async loadRecommendation() {
        try {
            // 获取最高等级账号的等级
            let maxLevel = 30;
            this.runningAccounts.forEach(status => {
                if (status.userState?.level > maxLevel) {
                    maxLevel = status.userState.level;
                }
            });

            const response = await fetch(`/api/analytics/recommendation?level=${maxLevel}&lands=18&strategy=exp`);
            const result = await response.json();

            if (result.success) {
                const rec = result.data.recommendation;
                document.getElementById('recommendSeedName').textContent = rec.name || '-';
                document.getElementById('recommendSeedReason').textContent = rec.reason || '';
                document.getElementById('recommendExpPerHour').textContent = rec.expPerHour ? rec.expPerHour.toLocaleString() : '-';
                document.getElementById('recommendExpPerDay').textContent = rec.expPerHour ? (rec.expPerHour * 24).toLocaleString() : '-';
            }
        } catch (error) {
            console.error('加载推荐失败:', error);
        }
    }

    async loadLeaderboard() {
        const tbody = document.getElementById('leaderboardTableBody');
        const level = document.getElementById('leaderboardLevel').value || 30;
        const lands = document.getElementById('leaderboardLands').value || 18;
        const sortBy = document.getElementById('leaderboardSort').value || 'exp_per_hour';
        const fertilizer = document.getElementById('leaderboardFertilizer').value || 'none';

        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center;padding:48px;">
                    <span class="material-symbols-rounded" style="font-size:48px;opacity:0.5;display:block;margin-bottom:16px;">refresh</span>
                    加载中...
                </td>
            </tr>
        `;

        try {
            const response = await fetch(`/api/analytics/leaderboard?level=${level}&lands=${lands}&sortBy=${sortBy}&fertilizer=${fertilizer}&limit=20`);
            const result = await response.json();

            if (!result.success) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align:center;padding:48px;color:var(--md-sys-color-error)">
                            <span class="material-symbols-rounded" style="font-size:48px;display:block;margin-bottom:16px;">error</span>
                            ${result.message || '加载失败'}
                        </td>
                    </tr>
                `;
                return;
            }

            const rankings = result.data.rankings;

            if (rankings.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align:center;padding:48px;">
                            <span class="material-symbols-rounded" style="font-size:48px;opacity:0.5;display:block;margin-bottom:16px;">inbox</span>
                            暂无数据
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = rankings.map((item, index) => `
                <tr>
                    <td>${item.rank}</td>
                    <td><strong>${this.escapeHtml(item.name)}</strong></td>
                    <td>Lv${item.requiredLevel}</td>
                    <td>${item.price.toLocaleString()}</td>
                    <td>${item.growTime}</td>
                    <td style="color:var(--md-sys-color-primary);font-weight:500">${item.expPerHour.toLocaleString()}</td>
                    <td>${item.expPerDay.toLocaleString()}</td>
                    <td>${item.expPerGold}</td>
                </tr>
            `).join('');

        } catch (error) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center;padding:48px;color:var(--md-sys-color-error)">
                        <span class="material-symbols-rounded" style="font-size:48px;display:block;margin-bottom:16px;">error</span>
                        加载失败: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    // ===== Account Management =====

    async loadAccounts() {
        try {
            const response = await fetch('/api/accounts');
            const result = await response.json();
            if (result.success) {
                this.accounts = result.data;
                this.renderAccountsTable();
                this.updateStats();
            }
        } catch (e) {
            console.error('加载账号失败:', e);
        }
    }

    renderAccountsTable() {
        const tbody = document.getElementById('accountsTableBody');
        if (!tbody) return;

        if (this.accounts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;padding:48px;color:var(--md-sys-color-on-surface-variant)">
                        <span class="material-symbols-rounded" style="font-size:48px;opacity:0.5;display:block;margin-bottom:16px;">inbox</span>
                        暂无账号，点击右上角添加
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.accounts.map(account => {
            const running = this.runningAccounts.has(account.id);
            const status = running ? this.runningAccounts.get(account.id) : null;
            
            // 判断连接状态
            let connectionStatus = 'stopped';
            let statusText = '已停止';
            let statusClass = 'stopped';
            let indicatorClass = '';
            
            if (running) {
                const isConnected = status?.isConnected !== false && status?.connectionState !== 'disconnected' && status?.connectionState !== 'error';
                if (isConnected) {
                    connectionStatus = 'connected';
                    statusText = '在线';
                    statusClass = 'running';
                    indicatorClass = 'connected';
                } else {
                    connectionStatus = 'disconnected';
                    statusText = '掉线';
                    statusClass = 'error';
                    indicatorClass = 'error';
                }
            }
            
            return `
                <tr>
                    <td><strong>${this.escapeHtml(account.name)}</strong></td>
                    <td><span class="account-platform">${account.platform.toUpperCase()}</span></td>
                    <td>
                        <span class="status-badge ${statusClass}" title="${status?.disconnectedReason || ''}">
                            <span class="status-indicator ${indicatorClass}"></span>
                            ${statusText}
                        </span>
                    </td>
                    <td>${running ? (status.userState?.level || '-') : '-'}</td>
                    <td>${running ? (status.userState?.gold?.toLocaleString() || '-') : '-'}</td>
                    <td>${running ? (status.stats?.harvests || 0) : '-'}</td>
                    <td>
                        <div style="display:flex;gap:8px">
                            ${running 
                                ? `<button class="btn btn-tonal" onclick="app.stopAccount('${account.id}')">
                                    <span class="material-symbols-rounded">stop</span>
                                    停止
                                   </button>`
                                : `<button class="btn btn-filled" onclick="app.startAccount('${account.id}')">
                                    <span class="material-symbols-rounded">play_arrow</span>
                                    启动
                                   </button>`
                            }
                            <button class="btn btn-text" onclick="app.showAccountDetail('${account.id}')">
                                <span class="material-symbols-rounded">info</span>
                                详情
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    updateRunningAccounts() {
        const grid = document.getElementById('runningAccountsGrid');
        if (!grid) return;

        if (this.runningAccounts.size === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <span class="material-symbols-rounded empty-icon">sleep</span>
                    <p class="body-large">暂无运行中的账号</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = Array.from(this.runningAccounts.entries()).map(([id, status]) => {
            const account = this.accounts.find(a => a.id === id);
            const name = account ? account.name : '未知账号';
            const platform = account ? account.platform.toUpperCase() : '-';
            
            const level = status.userState?.level || 0;
            const exp = status.userState?.exp || 0;
            const gold = status.userState?.gold || 0;
            
            // 计算经验进度
            const expProgress = this.calculateExpProgress(level, exp);
            
            // 判断连接状态
            const isConnected = status?.isConnected !== false && status?.connectionState !== 'disconnected' && status?.connectionState !== 'error';
            const connectionBadge = isConnected 
                ? `<span class="status-badge running" style="font-size:11px;padding:2px 8px;"><span class="status-indicator connected"></span>在线</span>`
                : `<span class="status-badge error" style="font-size:11px;padding:2px 8px;" title="${status?.disconnectedReason || '连接断开'}"><span class="status-indicator error"></span>掉线</span>`;
            
            // 显示断开时间
            let disconnectInfo = '';
            if (!isConnected && status?.disconnectedAt) {
                const disconnectTime = new Date(status.disconnectedAt).toLocaleTimeString();
                disconnectInfo = `<div class="disconnect-info">断开时间: ${disconnectTime}</div>`;
            }
            
            return `
                <div class="account-card ${!isConnected ? 'disconnected' : ''}">
                    <div class="account-card-header">
                        <span class="account-name">${this.escapeHtml(name)}</span>
                        <div style="display:flex;align-items:center;gap:8px;">
                            ${connectionBadge}
                            <span class="account-platform">${platform}</span>
                        </div>
                    </div>
                    <div class="account-stats">
                        <div class="account-stat">
                            <span class="account-stat-value">Lv${level}</span>
                            <span class="account-stat-label">等级</span>
                        </div>
                        <div class="account-stat">
                            <span class="account-stat-value">${gold.toLocaleString()}</span>
                            <span class="account-stat-label">金币</span>
                        </div>
                        <div class="account-stat">
                            <span class="account-stat-value">${status.stats?.harvests || 0}</span>
                            <span class="account-stat-label">收获</span>
                        </div>
                    </div>
                    <div class="account-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${expProgress.percent}%"></div>
                        </div>
                        <div class="progress-text">EXP: ${expProgress.current}/${expProgress.needed}</div>
                    </div>
                    ${disconnectInfo}
                    <div class="account-actions">
                        <button class="btn btn-tonal" onclick="app.stopAccount('${id}')">
                            <span class="material-symbols-rounded">stop</span>
                            停止
                        </button>
                        <button class="btn btn-text" onclick="app.showAccountDetail('${id}')">
                            <span class="material-symbols-rounded">info</span>
                            详情
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    calculateExpProgress(level, totalExp) {
        // 简化的经验计算
        const levelExp = [0, 0, 50, 150, 300, 500, 800, 1200, 1700, 2300, 3000,
            4000, 5000, 6000, 7000, 8000, 9000, 10000, 12000, 14000, 16000,
            18000, 20000, 22000, 24000, 26000, 28000, 30000, 32000, 34000, 36000];
        
        const currentLevelStart = levelExp[level] || 0;
        const nextLevelStart = levelExp[level + 1] || (currentLevelStart + 10000);
        
        const current = Math.max(0, totalExp - currentLevelStart);
        const needed = nextLevelStart - currentLevelStart;
        const percent = needed > 0 ? (current / needed * 100) : 0;
        
        return { current, needed, percent: Math.min(percent, 100) };
    }

    // ===== Statistics =====

    updateStats() {
        document.getElementById('statTotalAccounts').textContent = this.accounts.length;
        document.getElementById('statRunningAccounts').textContent = this.runningAccounts.size;
        
        let totalHarvests = 0;
        let totalSteals = 0;
        this.runningAccounts.forEach(status => {
            totalHarvests += status.stats?.harvests || 0;
            totalSteals += status.stats?.steals || 0;
        });
        
        document.getElementById('statTotalHarvests').textContent = totalHarvests.toLocaleString();
        document.getElementById('statTotalSteals').textContent = totalSteals.toLocaleString();
    }

    // ===== Actions =====

    async startAccount(accountId) {
        try {
            const response = await fetch(`/api/accounts/${accountId}/start`, {
                method: 'POST'
            });
            const result = await response.json();
            if (result.success) {
                this.addLog('系统', `账号启动成功`);
            } else {
                this.showSnackbar('启动失败: ' + result.message);
            }
        } catch (e) {
            this.showSnackbar('启动失败: ' + e.message);
        }
    }

    async stopAccount(accountId) {
        try {
            const response = await fetch(`/api/accounts/${accountId}/stop`, {
                method: 'POST'
            });
            const result = await response.json();
            if (result.success) {
                this.addLog('系统', `账号已停止`);
            }
        } catch (e) {
            this.showSnackbar('停止失败: ' + e.message);
        }
    }

    async startAll() {
        try {
            const response = await fetch('/api/start-all', {
                method: 'POST'
            });
            const result = await response.json();
            this.addLog('系统', `批量启动完成: ${result.data.filter(r => r.success).length}/${result.data.length} 成功`);
        } catch (e) {
            this.showSnackbar('启动失败: ' + e.message);
        }
    }

    async stopAll() {
        try {
            const response = await fetch('/api/stop-all', {
                method: 'POST'
            });
            const result = await response.json();
            this.addLog('系统', '所有账号已停止');
        } catch (e) {
            this.showSnackbar('停止失败: ' + e.message);
        }
    }

    // ===== Add Account =====

    showAddAccountModal() {
        document.getElementById('addAccountModal').classList.add('active');
    }

    hideAddAccountModal() {
        document.getElementById('addAccountModal').classList.remove('active');
        document.getElementById('addAccountForm').reset();
    }

    async submitAddAccount() {
        const form = document.getElementById('addAccountForm');
        const formData = new FormData(form);

        const platform = formData.get('platform');
        const code = formData.get('code');

        // 自动生成账号名称：平台 + 序号
        const platformName = platform === 'qq' ? 'QQ' : '微信';
        const existingCount = this.accounts.filter(a => a.platform === platform).length;
        const name = `${platformName}账号${existingCount + 1}`;

        const data = {
            name: name,
            code: code,
            platform: platform,
            config: {
                farmCheckInterval: parseInt(formData.get('farmInterval')),
                friendCheckInterval: parseInt(formData.get('friendInterval')),
                enableSteal: formData.get('enableSteal') === 'on',
                enableFriendHelp: formData.get('enableHelp') === 'on',
                enableSell: formData.get('enableSell') === 'on'
            }
        };

        try {
            const response = await fetch('/api/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            if (result.success) {
                const accountId = result.data.id;
                this.hideAddAccountModal();
                await this.loadAccounts();
                this.addLog('系统', `账号 "${data.name}" 添加成功，正在启动...`);
                this.showSnackbar('账号添加成功，正在启动...');

                // 自动启动账号
                await this.startAccount(accountId);

                // 监听登录成功事件，获取到用户名后更新账号名称
                this.waitForUserNameAndRename(accountId);
            } else {
                this.showSnackbar('添加失败: ' + result.message);
            }
        } catch (e) {
            this.showSnackbar('添加失败: ' + e.message);
        }
    }

    // 等待获取用户名并更新账号名称
    async waitForUserNameAndRename(accountId) {
        const checkInterval = 500; // 每500ms检查一次
        const maxAttempts = 60; // 最多检查60次（30秒）
        let attempts = 0;

        const checkUserName = async () => {
            attempts++;
            const status = this.runningAccounts.get(accountId);

            // 检查是否获取到了用户名
            if (status && status.userState && status.userState.name && status.userState.name !== '未知') {
                const newName = status.userState.name;

                // 更新账号名称
                try {
                    const response = await fetch(`/api/accounts/${accountId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: newName })
                    });

                    const result = await response.json();
                    if (result.success) {
                        // 更新本地数据
                        const account = this.accounts.find(a => a.id === accountId);
                        if (account) {
                            account.name = newName;
                        }
                        this.renderAccountsTable();
                        this.updateRunningAccounts();
                        this.addLog('系统', `账号名称已更新为: ${newName}`);
                        this.showSnackbar(`账号名称已更新为: ${newName}`);
                    }
                } catch (e) {
                    console.error('更新账号名称失败:', e);
                }
                return;
            }

            // 继续检查
            if (attempts < maxAttempts) {
                setTimeout(checkUserName, checkInterval);
            }
        };

        // 开始检查
        setTimeout(checkUserName, 1000); // 延迟1秒后开始检查
    }

    // ===== Account Detail =====

    showAccountDetail(accountId) {
        this.currentAccountId = accountId;
        const account = this.accounts.find(a => a.id === accountId);
        if (!account) return;

        document.getElementById('detailAccountName').textContent = account.name;
        this.updateAccountDetail();
        this.bindDetailTabs();
        document.getElementById('accountDetailModal').classList.add('active');

        // 默认加载概览数据
        this.switchDetailTab('overview');
    }

    bindDetailTabs() {
        const tabs = document.querySelectorAll('#accountDetailTabs .tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchDetailTab(tabName);
            });
        });
    }

    switchDetailTab(tabName) {
        // 更新标签按钮状态
        document.querySelectorAll('#accountDetailTabs .tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // 更新内容区域
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`tab-${tabName}`).classList.add('active');

        // 加载对应数据
        switch(tabName) {
            case 'overview':
                this.updateAccountDetail();
                break;
            case 'lands':
                this.loadLands();
                break;
            case 'tasks':
                this.loadTasks();
                break;
            case 'logs':
                this.updateAccountDetailLogs();
                break;
        }
    }

    updateAccountDetail() {
        if (!this.currentAccountId) return;

        const account = this.accounts.find(a => a.id === this.currentAccountId);
        const status = this.runningAccounts.get(this.currentAccountId);

        const content = document.getElementById('accountDetailContent');

        if (status) {
            content.innerHTML = `
                <div class="detail-item">
                    <div class="detail-label">状态</div>
                    <div class="detail-value" style="color:var(--md-sys-color-success)">运行中</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">等级</div>
                    <div class="detail-value">Lv${status.userState?.level || 0}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">金币</div>
                    <div class="detail-value">${(status.userState?.gold || 0).toLocaleString()}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">经验</div>
                    <div class="detail-value">${(status.userState?.exp || 0).toLocaleString()}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">总收获</div>
                    <div class="detail-value">${status.stats?.harvests || 0}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">总偷取</div>
                    <div class="detail-value">${status.stats?.steals || 0}</div>
                </div>
            `;
        } else {
            content.innerHTML = `
                <div class="detail-item">
                    <div class="detail-label">状态</div>
                    <div class="detail-value" style="color:var(--md-sys-color-on-surface-variant)">已停止</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">平台</div>
                    <div class="detail-value">${account.platform.toUpperCase()}</div>
                </div>
            `;
        }
    }

    updateAccountDetailLogs() {
        const logsList = document.getElementById('detailLogsList');
        if (!this.currentAccountId) {
            logsList.innerHTML = '<div style="color:var(--md-sys-color-on-surface-variant)">账号未运行</div>';
            return;
        }

        const accountLogs = this.logs.filter(l => l.accountId === this.currentAccountId).slice(-50);
        logsList.innerHTML = accountLogs.map(l => `
            <div style="padding:4px 0;border-bottom:1px solid var(--md-sys-color-outline-variant)">
                <span style="color:var(--md-sys-color-on-surface-variant)">${l.time}</span>
                <span style="color:var(--md-sys-color-primary)">[${l.tag}]</span>
                ${this.escapeHtml(l.message)}
            </div>
        `).join('') || '<div style="color:var(--md-sys-color-on-surface-variant)">暂无日志</div>';
    }

    hideAccountDetailModal() {
        document.getElementById('accountDetailModal').classList.remove('active');
        this.currentAccountId = null;
    }

    async deleteCurrentAccount() {
        if (!this.currentAccountId) return;
        if (!confirm('确定要删除这个账号吗？')) return;

        try {
            const response = await fetch(`/api/accounts/${this.currentAccountId}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (result.success) {
                this.hideAccountDetailModal();
                this.loadAccounts();
                this.addLog('系统', '账号已删除');
                this.showSnackbar('账号已删除');
            }
        } catch (e) {
            this.showSnackbar('删除失败: ' + e.message);
        }
    }

    // ===== Logs =====

    addLog(tag, message, accountId = null) {
        const time = new Date().toLocaleTimeString();
        this.logs.push({ time, tag, message, accountId });
        
        // 限制日志数量
        if (this.logs.length > 500) {
            this.logs.shift();
        }
        
        this.renderLogs();
        
        // 如果详情页打开，更新详情页日志
        if (this.currentAccountId === accountId) {
            this.updateAccountDetail();
        }
    }

    renderLogs() {
        const container = document.getElementById('logsContainer');
        if (!container) return;

        const filteredLogs = this.currentFilter === 'all' 
            ? this.logs 
            : this.logs.filter(l => l.tag === this.currentFilter);

        const lastLogs = filteredLogs.slice(-100);
        
        container.innerHTML = lastLogs.map(log => `
            <div class="log-entry">
                <span class="log-time label-small">${log.time}</span>
                <span class="log-tag tag-${log.tag}">${log.tag}</span>
                <span class="log-message body-medium">${this.escapeHtml(log.message)}</span>
            </div>
        `).join('');

        // 自动滚动到底部
        container.scrollTop = container.scrollHeight;
    }

    clearLogs() {
        this.logs = [];
        this.renderLogs();
    }

    // ===== QR Login =====

    async showQrLogin() {
        document.getElementById('qrLoginModal').classList.add('active');
        await this.refreshQrCode();
    }

    hideQrLoginModal() {
        document.getElementById('qrLoginModal').classList.remove('active');
        this.stopQrLoginPolling();
    }

    async refreshQrCode() {
        const display = document.getElementById('qrCodeDisplay');
        const status = document.getElementById('qrStatus');
        
        display.innerHTML = `
            <div class="qr-loading">
                <span class="material-symbols-rounded">refresh</span>
                <span>正在获取二维码...</span>
            </div>
        `;
        status.textContent = '请使用QQ手机版扫描二维码';
        status.className = 'qr-status title-medium';
        
        try {
            // 创建新的扫码会话
            const response = await fetch('/api/qr-login', {
                method: 'POST'
            });
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message);
            }
            
            this.qrSessionId = result.data.sessionId;
            
            // 获取二维码URL
            const urlResponse = await fetch(`/api/qr-login/${this.qrSessionId}/url`);
            const urlResult = await urlResponse.json();
            
            if (!urlResult.success) {
                throw new Error(urlResult.message);
            }
            
            // 显示二维码
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(urlResult.data.url)}`;
            display.innerHTML = `<img src="${qrUrl}" alt="扫码登录">`;
            
            // 开始轮询状态
            this.startQrLoginPolling();
            
        } catch (error) {
            display.innerHTML = `
                <div class="qr-loading">
                    <span class="material-symbols-rounded" style="color:var(--md-sys-color-error)">error</span>
                    <span style="color:var(--md-sys-color-error)">获取失败: ${error.message}</span>
                </div>
            `;
        }
    }

    startQrLoginPolling() {
        this.stopQrLoginPolling();
        
        let pollCount = 0;
        const maxPolls = 90; // 3分钟 (每2秒轮询一次)
        
        this.qrPollTimer = setInterval(async () => {
            pollCount++;
            if (pollCount > maxPolls) {
                this.stopQrLoginPolling();
                document.getElementById('qrStatus').textContent = '二维码已过期，请刷新';
                document.getElementById('qrStatus').className = 'qr-status title-medium error';
                return;
            }
            
            try {
                const response = await fetch(`/api/qr-login/${this.qrSessionId}/status`);
                const result = await response.json();
                
                if (!result.success) return;
                
                const data = result.data;
                const statusEl = document.getElementById('qrStatus');
                
                if (data.status === 'success') {
                    // 扫码成功，获取到code
                    this.stopQrLoginPolling();
                    statusEl.textContent = '扫码成功！';
                    statusEl.className = 'qr-status title-medium success';
                    
                    // 填充到输入框
                    document.getElementById('qrCodeInput').value = data.code;
                    
                    // 关闭弹窗
                    setTimeout(() => {
                        this.hideQrLoginModal();
                        this.addLog('系统', '扫码登录成功，登录码已填充');
                        this.showSnackbar('扫码登录成功');
                    }, 1000);
                    
                } else if (data.status === 'expired') {
                    this.stopQrLoginPolling();
                    statusEl.textContent = '二维码已过期，请刷新';
                    statusEl.className = 'qr-status title-medium error';
                } else if (data.status === 'waiting') {
                    statusEl.textContent = '等待扫码...';
                }
            } catch (e) {
                console.error('轮询扫码状态失败:', e);
            }
        }, 2000);
    }

    stopQrLoginPolling() {
        if (this.qrPollTimer) {
            clearInterval(this.qrPollTimer);
            this.qrPollTimer = null;
        }
    }

    // ===== Snackbar =====
    showSnackbar(message) {
        // Remove existing snackbar
        const existing = document.querySelector('.snackbar');
        if (existing) existing.remove();
        
        const snackbar = document.createElement('div');
        snackbar.className = 'snackbar';
        snackbar.innerHTML = `
            <span class="snackbar-text">${this.escapeHtml(message)}</span>
        `;
        document.body.appendChild(snackbar);
        
        // Trigger animation
        requestAnimationFrame(() => {
            snackbar.classList.add('show');
        });
        
        // Remove after delay
        setTimeout(() => {
            snackbar.classList.remove('show');
            setTimeout(() => snackbar.remove(), 300);
        }, 3000);
    }

    // ===== Lands =====

    async loadLands() {
        if (!this.currentAccountId) return;

        const grid = document.getElementById('landsGrid');
        const stats = document.getElementById('landsStats');

        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <span class="material-symbols-rounded empty-icon">refresh</span>
                <p class="body-large">加载土地信息中...</p>
            </div>
        `;

        try {
            const response = await fetch(`/api/accounts/${this.currentAccountId}/lands`);
            const result = await response.json();

            if (!result.success) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <span class="material-symbols-rounded empty-icon">error</span>
                        <p class="body-large">${result.message || '加载失败'}</p>
                    </div>
                `;
                return;
            }

            const data = result.data;

            // 更新统计
            const harvestableCount = data.lands.filter(l => l.status === 'harvestable').length;
            const needWaterCount = data.lands.filter(l => l.needWater).length;
            const needWeedCount = data.lands.filter(l => l.needWeed).length;
            const needBugCount = data.lands.filter(l => l.needBug).length;

            stats.innerHTML = `
                <span class="lands-stat">总土地: <strong>${data.totalLands}</strong></span>
                <span class="lands-stat">已解锁: <strong>${data.unlockedCount}</strong></span>
                <span class="lands-stat">可收获: <strong style="color:var(--md-sys-color-success)">${harvestableCount}</strong></span>
                <span class="lands-stat">需浇水: <strong style="color:var(--md-sys-color-primary)">${needWaterCount}</strong></span>
                <span class="lands-stat">需除草: <strong style="color:var(--md-sys-color-warning)">${needWeedCount}</strong></span>
                <span class="lands-stat">需除虫: <strong style="color:var(--md-sys-color-error)">${needBugCount}</strong></span>
            `;

            // 渲染土地网格
            if (data.lands.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <span class="material-symbols-rounded empty-icon">grid_off</span>
                        <p class="body-large">暂无土地数据</p>
                    </div>
                `;
                return;
            }

            grid.innerHTML = data.lands.map(land => this.renderLandCell(land)).join('');

        } catch (error) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <span class="material-symbols-rounded empty-icon">error</span>
                    <p class="body-large">加载失败: ${error.message}</p>
                </div>
            `;
        }
    }

    renderLandCell(land) {
        const id = land.id;
        const unlocked = land.unlocked;
        const level = land.level || 0;

        if (!unlocked) {
            return `
                <div class="land-cell land-locked" title="土地#${id} - 未解锁">
                    <span class="land-cell-number">${id}</span>
                    <span class="material-symbols-rounded land-cell-icon" style="color:var(--md-sys-color-outline)">lock</span>
                    <span class="land-cell-status">未解锁</span>
                </div>
            `;
        }

        const status = land.status;
        const needWater = land.needWater;
        const needWeed = land.needWeed;
        const needBug = land.needBug;

        let icon = 'grass';
        let statusText = '空地';
        let extraClass = 'land-empty';

        if (status === 'harvestable') {
            icon = 'agriculture';
            statusText = '可收获';
            extraClass = 'land-harvestable';
        } else if (status === 'growing') {
            icon = 'spa';
            statusText = land.phaseName || '生长中';
            extraClass = '';
        } else if (status === 'dead') {
            icon = 'delete_forever';
            statusText = '枯萎';
            extraClass = 'land-dead';
        }

        const levelClass = `land-level-${level}`;
        const needWaterClass = needWater ? 'land-need-water' : '';
        const needWeedClass = needWeed ? 'land-need-weed' : '';
        const needBugClass = needBug ? 'land-need-bug' : '';

        const timeText = land.timeLeftSec ? this.formatTime(land.timeLeftSec) : '';

        return `
            <div class="land-cell ${levelClass} ${extraClass} ${needWaterClass} ${needWeedClass} ${needBugClass}"
                 title="土地#${id} - ${statusText}${needWater ? ' (需浇水)' : ''}${needWeed ? ' (需除草)' : ''}${needBug ? ' (需除虫)' : ''}">
                <span class="land-cell-number">${id}</span>
                <span class="material-symbols-rounded land-cell-icon">${icon}</span>
                <span class="land-cell-status">${statusText}</span>
                ${timeText ? `<span class="land-cell-time">${timeText}</span>` : ''}
            </div>
        `;
    }

    formatTime(seconds) {
        if (seconds < 60) return `${seconds}秒`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}分`;
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}时${mins}分`;
    }

    async refreshLands() {
        await this.loadLands();
        this.showSnackbar('土地信息已刷新');
    }

    async harvestAllLands() {
        if (!this.currentAccountId) return;

        try {
            const response = await fetch(`/api/accounts/${this.currentAccountId}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'harvestAll' })
            });
            const result = await response.json();
            if (result.success) {
                this.showSnackbar('一键收获指令已发送');
                setTimeout(() => this.loadLands(), 1000);
            } else {
                this.showSnackbar('收获失败: ' + result.message);
            }
        } catch (error) {
            this.showSnackbar('收获失败: ' + error.message);
        }
    }

    // ===== Tasks =====

    async loadTasks() {
        if (!this.currentAccountId) return;

        const growthList = document.getElementById('growthTasksList');
        const dailyList = document.getElementById('dailyTasksList');

        growthList.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded empty-icon">refresh</span><p class="body-large">加载中...</p></div>';
        dailyList.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded empty-icon">refresh</span><p class="body-large">加载中...</p></div>';

        try {
            const response = await fetch(`/api/accounts/${this.currentAccountId}/tasks`);
            const result = await response.json();

            if (!result.success) {
                growthList.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded empty-icon">error</span><p class="body-large">${result.message}</p></div>`;
                dailyList.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded empty-icon">error</span><p class="body-large">${result.message}</p></div>`;
                return;
            }

            const data = result.data;

            // 渲染成长任务
            if (data.growthTasks && data.growthTasks.length > 0) {
                growthList.innerHTML = data.growthTasks.map(task => this.renderTaskItem(task, 'growth')).join('');
            } else {
                growthList.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded empty-icon">task_alt</span><p class="body-large">暂无成长任务</p></div>';
            }

            // 渲染每日任务
            if (data.dailyTasks && data.dailyTasks.length > 0) {
                dailyList.innerHTML = data.dailyTasks.map(task => this.renderTaskItem(task, 'daily')).join('');
            } else {
                dailyList.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded empty-icon">task_alt</span><p class="body-large">暂无每日任务</p></div>';
            }

        } catch (error) {
            growthList.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded empty-icon">error</span><p class="body-large">加载失败</p></div>`;
            dailyList.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded empty-icon">error</span><p class="body-large">加载失败</p></div>`;
        }
    }

    renderTaskItem(task, type) {
        const isCompleted = task.current >= task.target;
        const progress = Math.min(100, (task.current / task.target) * 100);

        const icons = {
            growth: 'trending_up',
            daily: 'today',
            harvest: 'agriculture',
            plant: 'spa',
            friend: 'people',
            sell: 'shopping_cart',
            level: 'stars'
        };

        const icon = icons[task.type] || icons[type] || 'task';

        return `
            <div class="task-item ${isCompleted ? 'completed' : ''}">
                <div class="task-icon">
                    <span class="material-symbols-rounded">${icon}</span>
                </div>
                <div class="task-content">
                    <div class="task-title">${task.name}</div>
                    <div class="task-desc">${task.desc || ''}</div>
                </div>
                <div class="task-progress">
                    <div class="task-progress-bar">
                        <div class="task-progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="task-progress-text">${task.current}/${task.target}</div>
                </div>
                <div class="task-reward">
                    <span class="material-symbols-rounded">monetization_on</span>
                    ${task.reward || ''}
                </div>
                ${isCompleted ? `
                    <div class="task-action">
                        <button class="btn btn-filled" onclick="app.claimTaskReward('${task.id}')">
                            领取
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    async claimTaskReward(taskId) {
        if (!this.currentAccountId) return;

        try {
            const response = await fetch(`/api/accounts/${this.currentAccountId}/tasks/${taskId}/claim`, {
                method: 'POST'
            });
            const result = await response.json();
            if (result.success) {
                this.showSnackbar('奖励领取成功');
                this.loadTasks();
            } else {
                this.showSnackbar('领取失败: ' + result.message);
            }
        } catch (error) {
            this.showSnackbar('领取失败: ' + error.message);
        }
    }

    async claimAllTaskRewards() {
        if (!this.currentAccountId) return;

        try {
            const response = await fetch(`/api/accounts/${this.currentAccountId}/tasks/claim-all`, {
                method: 'POST'
            });
            const result = await response.json();
            if (result.success) {
                this.showSnackbar(`成功领取 ${result.data?.claimed || 0} 个奖励`);
                this.loadTasks();
            } else {
                this.showSnackbar('领取失败: ' + result.message);
            }
        } catch (error) {
            this.showSnackbar('领取失败: ' + error.message);
        }
    }

    // ===== Utilities =====

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app
const app = new FarmApp();
