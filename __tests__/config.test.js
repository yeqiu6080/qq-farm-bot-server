/**
 * config.js 单元测试
 */

const { CONFIG, PlantPhase, PHASE_NAMES } = require('../src/config');

describe('config.js 测试', () => {
    describe('CONFIG', () => {
        test('CONFIG 应该包含必要的配置项', () => {
            expect(CONFIG.serverUrl).toBeDefined();
            expect(CONFIG.clientVersion).toBeDefined();
            expect(CONFIG.platform).toBeDefined();
            expect(CONFIG.os).toBeDefined();
            expect(CONFIG.heartbeatInterval).toBeDefined();
            expect(CONFIG.farmCheckInterval).toBeDefined();
            expect(CONFIG.device_info).toBeDefined();
        });

        test('serverUrl 应该是有效的 WebSocket URL', () => {
            expect(CONFIG.serverUrl).toMatch(/^wss?:\/\//);
        });

        test('clientVersion 应该符合版本格式', () => {
            expect(CONFIG.clientVersion).toMatch(/^\d+\.\d+\.\d+/);
        });

        test('platform 应该是 qq', () => {
            expect(CONFIG.platform).toBe('qq');
        });

        test('interval 应该是正数', () => {
            expect(CONFIG.heartbeatInterval).toBeGreaterThan(0);
            expect(CONFIG.farmCheckInterval).toBeGreaterThan(0);
        });

        test('device_info 应该包含必要字段', () => {
            expect(CONFIG.device_info.client_version).toBeDefined();
            expect(CONFIG.device_info.sys_software).toBeDefined();
            expect(CONFIG.device_info.network).toBeDefined();
            expect(CONFIG.device_info.memory).toBeDefined();
            expect(CONFIG.device_info.device_id).toBeDefined();
        });
    });

    describe('PlantPhase', () => {
        test('PlantPhase 应该包含所有生长阶段', () => {
            expect(PlantPhase.UNKNOWN).toBe(0);
            expect(PlantPhase.SEED).toBe(1);
            expect(PlantPhase.GERMINATION).toBe(2);
            expect(PlantPhase.SMALL_LEAVES).toBe(3);
            expect(PlantPhase.LARGE_LEAVES).toBe(4);
            expect(PlantPhase.BLOOMING).toBe(5);
            expect(PlantPhase.MATURE).toBe(6);
            expect(PlantPhase.DEAD).toBe(7);
        });
    });

    describe('PHASE_NAMES', () => {
        test('PHASE_NAMES 应该包含 8 个阶段名称', () => {
            expect(PHASE_NAMES).toHaveLength(8);
        });

        test('PHASE_NAMES 应该与 PlantPhase 对应', () => {
            expect(PHASE_NAMES[PlantPhase.UNKNOWN]).toBe('未知');
            expect(PHASE_NAMES[PlantPhase.SEED]).toBe('种子');
            expect(PHASE_NAMES[PlantPhase.GERMINATION]).toBe('发芽');
            expect(PHASE_NAMES[PlantPhase.SMALL_LEAVES]).toBe('小叶');
            expect(PHASE_NAMES[PlantPhase.LARGE_LEAVES]).toBe('大叶');
            expect(PHASE_NAMES[PlantPhase.BLOOMING]).toBe('开花');
            expect(PHASE_NAMES[PlantPhase.MATURE]).toBe('成熟');
            expect(PHASE_NAMES[PlantPhase.DEAD]).toBe('枯死');
        });
    });
});
