/**
 * gameConfig.js 单元测试
 */

const gameConfig = require('../src/gameConfig');

describe('gameConfig.js 测试', () => {
    describe('getLevelExpProgress', () => {
        test('应该正确计算等级进度', () => {
            const result = gameConfig.getLevelExpProgress(1, 150);
            expect(result).toHaveProperty('current');
            expect(result).toHaveProperty('needed');
        });

        test('无效等级应该返回 0', () => {
            const result = gameConfig.getLevelExpProgress(0, 100);
            expect(result.current).toBe(0);
            expect(result.needed).toBe(0);
        });
    });

    describe('getPlantById', () => {
        test('应该返回植物信息', () => {
            const plant = gameConfig.getPlantById(1);
            if (plant) {
                expect(plant).toHaveProperty('id');
                expect(plant).toHaveProperty('name');
            }
        });

        test('不存在的植物应该返回 undefined', () => {
            const plant = gameConfig.getPlantById(999999);
            expect(plant).toBeUndefined();
        });
    });

    describe('getPlantBySeedId', () => {
        test('应该根据种子ID返回植物', () => {
            const plant = gameConfig.getPlantBySeedId(1);
            if (plant) {
                expect(plant).toHaveProperty('seed_id');
            }
        });
    });

    describe('getPlantName', () => {
        test('应该返回植物名称', () => {
            const name = gameConfig.getPlantName(1);
            expect(typeof name).toBe('string');
        });

        test('不存在的植物应该返回默认名称', () => {
            const name = gameConfig.getPlantName(999999);
            expect(name).toContain('植物');
        });
    });

    describe('getPlantNameBySeedId', () => {
        test('应该返回种子对应的植物名称', () => {
            const name = gameConfig.getPlantNameBySeedId(1);
            expect(typeof name).toBe('string');
        });

        test('不存在的种子应该返回默认名称', () => {
            const name = gameConfig.getPlantNameBySeedId(999999);
            expect(name).toContain('种子');
        });
    });

    describe('getPlantGrowTime', () => {
        test('应该返回生长时间', () => {
            const time = gameConfig.getPlantGrowTime(1);
            expect(typeof time).toBe('number');
            expect(time).toBeGreaterThanOrEqual(0);
        });
    });

    describe('formatGrowTime', () => {
        test('应该正确格式化秒数', () => {
            expect(gameConfig.formatGrowTime(30)).toBe('30秒');
        });

        test('应该正确格式化分钟', () => {
            expect(gameConfig.formatGrowTime(300)).toBe('5分钟');
        });

        test('应该正确格式化小时', () => {
            expect(gameConfig.formatGrowTime(7200)).toBe('2小时');
        });

        test('应该正确格式化小时和分钟', () => {
            expect(gameConfig.formatGrowTime(7500)).toBe('2小时5分');
        });
    });

    describe('getPlantExp', () => {
        test('应该返回植物经验值', () => {
            const exp = gameConfig.getPlantExp(1);
            expect(typeof exp).toBe('number');
        });
    });

    describe('getFruitName', () => {
        test('应该返回果实名称', () => {
            const name = gameConfig.getFruitName(1);
            expect(typeof name).toBe('string');
        });
    });

    describe('getItemName', () => {
        test('应该返回物品名称', () => {
            const name = gameConfig.getItemName(1);
            expect(typeof name).toBe('string');
        });

        test('应该识别种子', () => {
            const name = gameConfig.getItemName(1);
            expect(typeof name).toBe('string');
        });
    });
});
