/**
 * utils.js 单元测试
 */

const utils = require('../src/utils');

describe('utils.js 测试', () => {
    describe('toLong / toNum', () => {
        test('toLong 应该将数字转换为 Long 对象', () => {
            const result = utils.toLong(123);
            expect(result.toNumber()).toBe(123);
        });

        test('toNum 应该将 Long 对象转换为数字', () => {
            const long = utils.toLong(456);
            expect(utils.toNum(long)).toBe(456);
        });

        test('toNum 应该处理 null/undefined', () => {
            expect(utils.toNum(null)).toBe(0);
            expect(utils.toNum(undefined)).toBe(0);
        });

        test('toNum 应该直接返回普通数字', () => {
            expect(utils.toNum(789)).toBe(789);
        });
    });

    describe('now', () => {
        test('now 应该返回当前时间的字符串', () => {
            const result = utils.now();
            expect(typeof result).toBe('string');
            expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/);
        });
    });

    describe('getServerTimeSec / syncServerTime', () => {
        test('未同步时应该返回本地时间', () => {
            const before = Math.floor(Date.now() / 1000);
            const result = utils.getServerTimeSec();
            const after = Math.floor(Date.now() / 1000);
            expect(result).toBeGreaterThanOrEqual(before);
            expect(result).toBeLessThanOrEqual(after + 1);
        });

        test('同步后应该返回同步的时间', () => {
            const serverTime = Date.now();
            utils.syncServerTime(serverTime);
            const result = utils.getServerTimeSec();
            // 同步后的时间应该接近当前时间
            const now = Math.floor(Date.now() / 1000);
            expect(result).toBeGreaterThanOrEqual(now - 5);
            expect(result).toBeLessThanOrEqual(now + 5);
        });
    });

    describe('toTimeSec', () => {
        test('应该保持秒级时间戳不变', () => {
            expect(utils.toTimeSec(100)).toBe(100);
            expect(utils.toTimeSec(5000)).toBe(5000);
        });

        test('应该将毫秒级时间戳(>1e12)转换为秒', () => {
            const ms = Date.now();
            const expected = Math.floor(ms / 1000);
            expect(utils.toTimeSec(ms)).toBe(expected);
        });

        test('应该处理负数', () => {
            expect(utils.toTimeSec(-100)).toBe(0);
        });
    });

    describe('log / logWarn', () => {
        test('log 应该输出日志', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            utils.log('TEST', 'test message');
            expect(consoleSpy).toHaveBeenCalled();
            expect(consoleSpy.mock.calls[0][0]).toContain('[TEST]');
            expect(consoleSpy.mock.calls[0][0]).toContain('test message');
            consoleSpy.mockRestore();
        });

        test('logWarn 应该输出警告日志', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            utils.logWarn('TEST', 'warning message');
            expect(consoleSpy).toHaveBeenCalled();
            expect(consoleSpy.mock.calls[0][0]).toContain('[TEST]');
            expect(consoleSpy.mock.calls[0][0]).toContain('⚠');
            consoleSpy.mockRestore();
        });
    });

    describe('sleep', () => {
        test('sleep 应该等待指定时间', async () => {
            const start = Date.now();
            await utils.sleep(50);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(45);
            expect(elapsed).toBeLessThan(100);
        });
    });
});
