/**
 * LandManager.js 单元测试
 */

const LandManager = require('../src/LandManager');

describe('LandManager 测试', () => {
    let mockConnection;
    let landManager;

    beforeEach(() => {
        mockConnection = {
            sendMsgAsync: jest.fn(),
            addLog: jest.fn(),
            getCurrentPhase: jest.fn(),
            getServerTimeSec: jest.fn(() => Math.floor(Date.now() / 1000))
        };
        landManager = new LandManager(mockConnection);
    });

    describe('analyzeLands', () => {
        test('应该正确分析可解锁的土地', () => {
            const lands = [
                { id: 1, unlocked: false, could_unlock: true },
                { id: 2, unlocked: false, could_unlock: false },
                { id: 3, unlocked: true, could_upgrade: false },
            ];

            const result = landManager.analyzeLands(lands);
            expect(result.unlockable).toContain(1);
            expect(result.unlockable).not.toContain(2);
            expect(result.upgradable).toHaveLength(0);
        });

        test('应该正确分析可升级的土地', () => {
            const lands = [
                { id: 1, unlocked: true, could_upgrade: true },
                { id: 2, unlocked: true, could_upgrade: false },
                { id: 3, unlocked: false, could_unlock: true },
            ];

            const result = landManager.analyzeLands(lands);
            expect(result.upgradable).toContain(1);
            expect(result.upgradable).not.toContain(2);
            expect(result.unlockable).toContain(3);
        });

        test('空数组应该返回空结果', () => {
            const result = landManager.analyzeLands([]);
            expect(result.unlockable).toHaveLength(0);
            expect(result.upgradable).toHaveLength(0);
        });
    });

    describe('_getCurrentPhase', () => {
        test('应该返回当前阶段', () => {
            const now = Math.floor(Date.now() / 1000);
            const phases = [
                { phase: 0, begin_time: now - 100 },
                { phase: 1, begin_time: now - 50 },
                { phase: 2, begin_time: now + 50 },
            ];

            const result = landManager._getCurrentPhase(phases);
            expect(result.phase).toBe(1);
        });

        test('空数组应该返回 null', () => {
            const result = landManager._getCurrentPhase([]);
            expect(result).toBeNull();
        });

        test('null 应该返回 null', () => {
            const result = landManager._getCurrentPhase(null);
            expect(result).toBeNull();
        });
    });

    describe('_toTimeSec', () => {
        test('应该保持秒级时间戳不变', () => {
            expect(landManager._toTimeSec(100)).toBe(100);
            expect(landManager._toTimeSec(5000)).toBe(5000);
        });

        test('应该将毫秒级时间戳(>1e12)转换为秒', () => {
            const ms = Date.now();
            const expected = Math.floor(ms / 1000);
            expect(landManager._toTimeSec(ms)).toBe(expected);
        });

        test('应该处理负数', () => {
            expect(landManager._toTimeSec(-100)).toBe(0);
        });
    });

    describe('_getPhaseName', () => {
        test('应该返回正确的阶段名称', () => {
            expect(landManager._getPhaseName(0)).toBe('种子');
            expect(landManager._getPhaseName(1)).toBe('发芽');
            expect(landManager._getPhaseName(2)).toBe('生长');
            expect(landManager._getPhaseName(3)).toBe('成熟');
            expect(landManager._getPhaseName(4)).toBe('枯萎');
        });

        test('未知阶段应该返回 未知', () => {
            expect(landManager._getPhaseName(99)).toBe('未知');
        });
    });

    describe('autoUnlockLands', () => {
        test('没有可解锁土地时应该返回 0', async () => {
            const lands = [
                { id: 1, unlocked: true },
                { id: 2, unlocked: false, could_unlock: false },
            ];

            const result = await landManager.autoUnlockLands(lands);
            expect(result).toBe(0);
        });
    });

    describe('autoUpgradeLands', () => {
        test('没有可升级土地时应该返回 0', async () => {
            const lands = [
                { id: 1, unlocked: true, could_upgrade: false },
                { id: 2, unlocked: false },
            ];

            const result = await landManager.autoUpgradeLands(lands);
            expect(result).toBe(0);
        });
    });
});
