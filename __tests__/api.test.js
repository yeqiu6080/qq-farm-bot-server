/**
 * API 集成测试
 * 测试 Express 服务器的 RESTful API
 */

const request = require('supertest');
const express = require('express');
const cors = require('cors');
const path = require('path');

// 模拟服务器应用
function createTestApp() {
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    
    // 模拟账号管理器
    const mockAccounts = new Map();
    let accountIdCounter = 1;
    
    // 健康检查
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    
    // 获取所有账号
    app.get('/api/accounts', (req, res) => {
        const accounts = Array.from(mockAccounts.values());
        res.json({ success: true, data: accounts });
    });
    
    // 获取单个账号
    app.get('/api/accounts/:id', (req, res) => {
        const account = mockAccounts.get(req.params.id);
        if (!account) {
            return res.status(404).json({ success: false, error: '账号不存在' });
        }
        res.json({ success: true, data: account });
    });
    
    // 创建账号
    app.post('/api/accounts', (req, res) => {
        const { name, code, platform = 'qq', config = {} } = req.body;
        
        if (!name || !code) {
            return res.status(400).json({ success: false, error: '名称和登录码不能为空' });
        }
        
        const account = {
            id: `acc_${accountIdCounter++}`,
            name,
            code,
            platform,
            config: {
                farmCheckInterval: config.farmCheckInterval || 10,
                friendCheckInterval: config.friendCheckInterval || 10,
                ...config
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        mockAccounts.set(account.id, account);
        res.status(201).json({ success: true, data: account });
    });
    
    // 更新账号
    app.put('/api/accounts/:id', (req, res) => {
        const account = mockAccounts.get(req.params.id);
        if (!account) {
            return res.status(404).json({ success: false, error: '账号不存在' });
        }
        
        const { name, code, config } = req.body;
        if (name) account.name = name;
        if (code) account.code = code;
        if (config) account.config = { ...account.config, ...config };
        account.updatedAt = new Date().toISOString();
        
        res.json({ success: true, data: account });
    });
    
    // 删除账号
    app.delete('/api/accounts/:id', (req, res) => {
        const exists = mockAccounts.has(req.params.id);
        if (!exists) {
            return res.status(404).json({ success: false, error: '账号不存在' });
        }
        
        mockAccounts.delete(req.params.id);
        res.json({ success: true, message: '账号已删除' });
    });
    
    // 获取服务器状态
    app.get('/api/status', (req, res) => {
        res.json({
            success: true,
            data: {
                accounts: mockAccounts.size,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString()
            }
        });
    });
    
    return app;
}

describe('API 集成测试', () => {
    let app;
    
    beforeEach(() => {
        app = createTestApp();
    });
    
    describe('GET /api/health', () => {
        test('应该返回健康状态', async () => {
            const response = await request(app)
                .get('/api/health')
                .expect(200);
            
            expect(response.body.status).toBe('ok');
            expect(response.body.timestamp).toBeDefined();
        });
    });
    
    describe('GET /api/accounts', () => {
        test('初始状态应该返回空数组', async () => {
            const response = await request(app)
                .get('/api/accounts')
                .expect(200);
            
            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual([]);
        });
    });
    
    describe('POST /api/accounts', () => {
        test('应该创建新账号', async () => {
            const newAccount = {
                name: '测试账号',
                code: 'test_code_123',
                platform: 'qq'
            };
            
            const response = await request(app)
                .post('/api/accounts')
                .send(newAccount)
                .expect(201);
            
            expect(response.body.success).toBe(true);
            expect(response.body.data.name).toBe('测试账号');
            expect(response.body.data.code).toBe('test_code_123');
            expect(response.body.data.id).toBeDefined();
        });
        
        test('缺少必填字段应该返回 400', async () => {
            const response = await request(app)
                .post('/api/accounts')
                .send({ name: '测试账号' }) // 缺少 code
                .expect(400);
            
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('不能为空');
        });
        
        test('应该使用默认配置', async () => {
            const response = await request(app)
                .post('/api/accounts')
                .send({ name: '测试', code: 'test' })
                .expect(201);
            
            expect(response.body.data.config.farmCheckInterval).toBe(10);
            expect(response.body.data.config.friendCheckInterval).toBe(10);
        });
    });
    
    describe('GET /api/accounts/:id', () => {
        test('应该返回存在的账号', async () => {
            // 先创建账号
            const createRes = await request(app)
                .post('/api/accounts')
                .send({ name: '测试', code: 'test' });
            
            const accountId = createRes.body.data.id;
            
            // 再获取账号
            const response = await request(app)
                .get(`/api/accounts/${accountId}`)
                .expect(200);
            
            expect(response.body.success).toBe(true);
            expect(response.body.data.id).toBe(accountId);
        });
        
        test('不存在的账号应该返回 404', async () => {
            const response = await request(app)
                .get('/api/accounts/non-existent')
                .expect(404);
            
            expect(response.body.success).toBe(false);
        });
    });
    
    describe('PUT /api/accounts/:id', () => {
        test('应该更新账号信息', async () => {
            // 先创建账号
            const createRes = await request(app)
                .post('/api/accounts')
                .send({ name: '原名称', code: 'old_code' });
            
            const accountId = createRes.body.data.id;
            
            // 更新账号
            const response = await request(app)
                .put(`/api/accounts/${accountId}`)
                .send({ name: '新名称', code: 'new_code' })
                .expect(200);
            
            expect(response.body.success).toBe(true);
            expect(response.body.data.name).toBe('新名称');
            expect(response.body.data.code).toBe('new_code');
        });
        
        test('不存在的账号应该返回 404', async () => {
            const response = await request(app)
                .put('/api/accounts/non-existent')
                .send({ name: '新名称' })
                .expect(404);
            
            expect(response.body.success).toBe(false);
        });
    });
    
    describe('DELETE /api/accounts/:id', () => {
        test('应该删除账号', async () => {
            // 先创建账号
            const createRes = await request(app)
                .post('/api/accounts')
                .send({ name: '测试', code: 'test' });
            
            const accountId = createRes.body.data.id;
            
            // 删除账号
            const response = await request(app)
                .delete(`/api/accounts/${accountId}`)
                .expect(200);
            
            expect(response.body.success).toBe(true);
            
            // 验证已删除
            await request(app)
                .get(`/api/accounts/${accountId}`)
                .expect(404);
        });
        
        test('不存在的账号应该返回 404', async () => {
            const response = await request(app)
                .delete('/api/accounts/non-existent')
                .expect(404);
            
            expect(response.body.success).toBe(false);
        });
    });
    
    describe('GET /api/status', () => {
        test('应该返回服务器状态', async () => {
            const response = await request(app)
                .get('/api/status')
                .expect(200);
            
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('accounts');
            expect(response.body.data).toHaveProperty('uptime');
            expect(response.body.data).toHaveProperty('memory');
            expect(response.body.data).toHaveProperty('timestamp');
        });
    });
});
