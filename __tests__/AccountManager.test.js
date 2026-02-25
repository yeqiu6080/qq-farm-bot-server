/**
 * AccountManager.js 单元测试
 */

const fs = require('fs');
const path = require('path');
const AccountManager = require('../src/AccountManager');

// 使用临时测试数据目录
const TEST_DATA_DIR = path.join(__dirname, '..', 'test-data');
const TEST_ACCOUNTS_FILE = path.join(TEST_DATA_DIR, 'accounts.json');

describe('AccountManager 测试', () => {
    let manager;

    beforeEach(() => {
        // 创建临时数据目录
        if (!fs.existsSync(TEST_DATA_DIR)) {
            fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
        }
        // 清空测试数据文件
        if (fs.existsSync(TEST_ACCOUNTS_FILE)) {
            fs.unlinkSync(TEST_ACCOUNTS_FILE);
        }
        
        // 创建 AccountManager 实例
        manager = new AccountManager();
        // 覆盖数据文件路径
        manager.accountsFile = TEST_ACCOUNTS_FILE;
        manager.accounts.clear();
    });

    afterEach(() => {
        // 清理测试数据
        if (fs.existsSync(TEST_DATA_DIR)) {
            fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
        }
    });

    describe('addAccount', () => {
        test('应该成功添加账号', async () => {
            const account = await manager.addAccount({
                name: '测试账号',
                code: 'test_code_123',
                platform: 'qq'
            });

            expect(account).toBeDefined();
            expect(account.name).toBe('测试账号');
            expect(account.code).toBe('test_code_123');
            expect(account.platform).toBe('qq');
            expect(account.id).toBeDefined();
            expect(account.createdAt).toBeDefined();
            expect(account.updatedAt).toBeDefined();
        });

        test('应该使用默认配置', async () => {
            const account = await manager.addAccount({
                name: '测试账号',
                code: 'test_code'
            });

            expect(account.config).toBeDefined();
            expect(account.config.farmCheckInterval).toBe(10);
            expect(account.config.friendCheckInterval).toBe(10);
            expect(account.config.forceLowestLevelCrop).toBe(false);
            expect(account.config.enableFriendHelp).toBe(true);
            expect(account.config.enableSteal).toBe(true);
            expect(account.config.enableSell).toBe(true);
            expect(account.config.enableTask).toBe(true);
        });

        test('应该允许自定义配置', async () => {
            const account = await manager.addAccount({
                name: '测试账号',
                code: 'test_code',
                config: {
                    farmCheckInterval: 30,
                    enableSteal: false
                }
            });

            expect(account.config.farmCheckInterval).toBe(30);
            expect(account.config.enableSteal).toBe(false);
            expect(account.config.enableSell).toBe(true); // 其他配置保持默认
        });
    });

    describe('getAccount / getAllAccounts', () => {
        test('应该能获取单个账号', async () => {
            const added = await manager.addAccount({
                name: '测试账号',
                code: 'test_code'
            });

            const retrieved = manager.getAccount(added.id);
            expect(retrieved).toBeDefined();
            expect(retrieved.name).toBe('测试账号');
        });

        test('获取不存在的账号应该返回 undefined', () => {
            const account = manager.getAccount('non-existent-id');
            expect(account).toBeUndefined();
        });

        test('应该能获取所有账号', async () => {
            await manager.addAccount({ name: '账号1', code: 'code1' });
            await manager.addAccount({ name: '账号2', code: 'code2' });
            await manager.addAccount({ name: '账号3', code: 'code3' });

            const all = manager.getAllAccounts();
            expect(all).toHaveLength(3);
        });
    });

    describe('updateAccount', () => {
        test('应该能更新账号信息', async () => {
            const added = await manager.addAccount({
                name: '原名称',
                code: '原code'
            });
            
            // 等待一小段时间确保时间戳不同
            await new Promise(r => setTimeout(r, 50));

            const updated = manager.updateAccount(added.id, {
                name: '新名称',
                code: '新code'
            });

            expect(updated.name).toBe('新名称');
            expect(updated.code).toBe('新code');
            expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(added.updatedAt).getTime());
        });

        test('应该能更新配置', async () => {
            const added = await manager.addAccount({
                name: '测试账号',
                code: 'test_code'
            });

            const updated = manager.updateAccount(added.id, {
                config: { farmCheckInterval: 60 }
            });

            expect(updated.config.farmCheckInterval).toBe(60);
            expect(updated.config.enableSell).toBe(true); // 其他配置保持不变
        });

        test('更新不存在的账号应该返回 null', () => {
            const result = manager.updateAccount('non-existent', { name: '新名称' });
            expect(result).toBeNull();
        });
    });

    describe('deleteAccount', () => {
        test('应该能删除账号', async () => {
            const added = await manager.addAccount({
                name: '测试账号',
                code: 'test_code'
            });

            const deleted = manager.deleteAccount(added.id);
            expect(deleted).toBe(true);

            const retrieved = manager.getAccount(added.id);
            expect(retrieved).toBeUndefined();
        });

        test('删除不存在的账号应该返回 false', () => {
            const result = manager.deleteAccount('non-existent');
            expect(result).toBe(false);
        });
    });

    describe('updateCode', () => {
        test('应该能更新登录码', async () => {
            const added = await manager.addAccount({
                name: '测试账号',
                code: 'old_code'
            });

            const updated = manager.updateCode(added.id, 'new_code');
            expect(updated.code).toBe('new_code');
        });

        test('更新不存在账号的code应该返回 null', () => {
            const result = manager.updateCode('non-existent', 'new_code');
            expect(result).toBeNull();
        });
    });
});
