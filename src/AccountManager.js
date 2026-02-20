/**
 * 账号管理器
 * 管理多账号的增删改查
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const ACCOUNTS_FILE = path.join(__dirname, '..', 'data', 'accounts.json');

class AccountManager {
    constructor() {
        this.accounts = new Map();
        this.ensureDataDir();
        this.loadAccounts();
    }

    ensureDataDir() {
        const dataDir = path.join(__dirname, '..', 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    loadAccounts() {
        try {
            if (fs.existsSync(ACCOUNTS_FILE)) {
                const data = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
                for (const account of data) {
                    this.accounts.set(account.id, account);
                }
                console.log(`[账号管理] 已加载 ${this.accounts.size} 个账号`);
            }
        } catch (e) {
            console.warn('[账号管理] 加载账号失败:', e.message);
        }
    }

    saveAccounts() {
        try {
            const data = Array.from(this.accounts.values());
            fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2));
        } catch (e) {
            console.warn('[账号管理] 保存账号失败:', e.message);
        }
    }

    /**
     * 添加账号
     */
    async addAccount({ name, code, platform = 'qq', config = {} }) {
        const id = uuidv4();
        const account = {
            id,
            name,
            code,
            platform,
            config: {
                farmCheckInterval: config.farmCheckInterval || 10,
                friendCheckInterval: config.friendCheckInterval || 10,
                forceLowestLevelCrop: config.forceLowestLevelCrop || false,
                enableFriendHelp: config.enableFriendHelp !== false,
                enableSteal: config.enableSteal !== false,
                enableSell: config.enableSell !== false,
                enableTask: config.enableTask !== false,
                ...config
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.accounts.set(id, account);
        this.saveAccounts();
        
        console.log(`[账号管理] 添加账号: ${name} (${platform})`);
        return account;
    }

    /**
     * 更新账号
     */
    updateAccount(id, updates) {
        const account = this.accounts.get(id);
        if (!account) return null;

        if (updates.name) account.name = updates.name;
        if (updates.code) account.code = updates.code;
        if (updates.platform) account.platform = updates.platform;
        if (updates.config) {
            account.config = { ...account.config, ...updates.config };
        }
        
        account.updatedAt = new Date().toISOString();
        this.accounts.set(id, account);
        this.saveAccounts();
        
        console.log(`[账号管理] 更新账号: ${account.name}`);
        return account;
    }

    /**
     * 删除账号
     */
    deleteAccount(id) {
        const account = this.accounts.get(id);
        if (!account) return false;

        this.accounts.delete(id);
        this.saveAccounts();
        
        console.log(`[账号管理] 删除账号: ${account.name}`);
        return true;
    }

    /**
     * 获取单个账号
     */
    getAccount(id) {
        return this.accounts.get(id);
    }

    /**
     * 获取所有账号
     */
    getAllAccounts() {
        return Array.from(this.accounts.values());
    }

    /**
     * 更新账号登录码
     */
    updateCode(id, code) {
        const account = this.accounts.get(id);
        if (!account) return null;

        account.code = code;
        account.updatedAt = new Date().toISOString();
        this.accounts.set(id, account);
        this.saveAccounts();
        
        return account;
    }
}

module.exports = AccountManager;
