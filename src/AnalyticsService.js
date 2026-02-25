/**
 * 数据分析服务
 * 提供种植效率排行榜、收益分析等功能
 */

const { analyzeExpYield, getPlantingRecommendation } = require('../tools/calc-exp-yield');
const { toNum } = require('./utils');

class AnalyticsService {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5分钟缓存
    }

    /**
     * 获取种植效率排行榜
     * @param {Object} options - 查询选项
     * @param {number} options.lands - 土地数量
     * @param {number} options.level - 用户等级
     * @param {string} options.sortBy - 排序方式: exp_per_hour, profit_per_hour, exp_per_gold
     * @param {string} options.fertilizer - 施肥方式: none, normal, organic
     * @param {number} options.limit - 返回数量
     * @returns {Object} 排行榜数据
     */
    getPlantingLeaderboard(options = {}) {
        const lands = Math.max(1, toNum(options.lands, 18));
        const level = toNum(options.level, 100);
        const sortBy = options.sortBy || 'exp_per_hour';
        const fertilizer = options.fertilizer || 'none';
        const limit = Math.min(100, Math.max(1, toNum(options.limit, 20)));

        const cacheKey = `leaderboard_${lands}_${level}_${sortBy}_${fertilizer}_${limit}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        const analysis = analyzeExpYield({
            lands,
            level,
            top: 100, // 获取更多数据用于排序
        });

        if (!analysis.rows || analysis.rows.length === 0) {
            return { success: false, message: '无法获取种子数据' };
        }

        // 根据等级筛选可种植的种子
        let availableSeeds = analysis.rows.filter(r => r.requiredLevel <= level);

        // 根据排序方式排序
        switch (sortBy) {
            case 'exp_per_hour':
                availableSeeds = fertilizer === 'normal'
                    ? availableSeeds.sort((a, b) => b.farmExpPerHourNormalFert - a.farmExpPerHourNormalFert)
                    : availableSeeds.sort((a, b) => b.farmExpPerHourNoFert - a.farmExpPerHourNoFert);
                break;
            case 'profit_per_hour':
                // 计算每小时利润（金币收益 - 种子成本）
                availableSeeds = availableSeeds.map(s => {
                    const cyclesPerHour = 3600 / (fertilizer === 'normal' ? s.cycleSecNormalFert : s.cycleSecNoFert);
                    const revenue = (s.fruitCount || 0) * cyclesPerHour * 10; // 假设果实单价10金币
                    const cost = s.price * cyclesPerHour;
                    s.profitPerHour = revenue - cost;
                    return s;
                }).sort((a, b) => b.profitPerHour - a.profitPerHour);
                break;
            case 'exp_per_gold':
                availableSeeds = availableSeeds.sort((a, b) => b.expPerGoldSeed - a.expPerGoldSeed);
                break;
            case 'grow_time':
                availableSeeds = availableSeeds.sort((a, b) => a.growTimeSec - b.growTimeSec);
                break;
            default:
                break;
        }

        // 截取前N个
        const topSeeds = availableSeeds.slice(0, limit);

        const result = {
            success: true,
            data: {
                config: {
                    lands,
                    level,
                    sortBy,
                    fertilizer,
                },
                stats: {
                    totalSeeds: analysis.rows.length,
                    availableSeeds: availableSeeds.length,
                },
                rankings: topSeeds.map((s, index) => ({
                    rank: index + 1,
                    seedId: s.seedId,
                    name: s.name,
                    requiredLevel: s.requiredLevel,
                    price: s.price,
                    expPerHarvest: s.expHarvest,
                    growTime: fertilizer === 'normal' ? s.growTimeNormalFertStr : s.growTimeStr,
                    growTimeSec: fertilizer === 'normal' ? s.growTimeNormalFert : s.growTimeSec,
                    expPerHour: fertilizer === 'normal'
                        ? Math.round(s.farmExpPerHourNormalFert)
                        : Math.round(s.farmExpPerHourNoFert),
                    expPerDay: fertilizer === 'normal'
                        ? Math.round(s.farmExpPerDayNormalFert)
                        : Math.round(s.farmExpPerDayNoFert),
                    expPerGold: Number(s.expPerGoldSeed.toFixed(2)),
                    profitPerHour: Math.round(s.profitPerHour || 0),
                    gainPercent: fertilizer === 'normal' ? Number(s.gainPercent.toFixed(1)) : null,
                })),
                generatedAt: new Date().toISOString(),
            },
        };

        this._setCache(cacheKey, result);
        return result;
    }

    /**
     * 获取种植推荐
     * @param {number} level - 用户等级
     * @param {number} lands - 土地数量
     * @param {string} strategy - 策略: exp, profit, balanced
     * @returns {Object} 推荐结果
     */
    getRecommendation(level, lands = 18, strategy = 'exp') {
        const safeLevel = Math.max(1, toNum(level, 1));
        const safeLands = Math.max(1, toNum(lands, 18));

        const cacheKey = `recommendation_${safeLevel}_${safeLands}_${strategy}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        const recommendation = getPlantingRecommendation(safeLevel, safeLands, { top: 10 });

        let suggestedSeed = null;
        let reason = '';

        switch (strategy) {
            case 'exp':
                suggestedSeed = recommendation.bestNormalFert || recommendation.bestNoFert;
                reason = '经验效率最高';
                break;
            case 'profit':
                // 简单利润计算
                suggestedSeed = recommendation.candidatesNormalFert
                    .map(s => ({ ...s, profitScore: s.expPerHour * 0.5 - s.requiredLevel * 10 }))
                    .sort((a, b) => b.profitScore - a.profitScore)[0];
                reason = '综合收益最佳';
                break;
            case 'balanced':
                // 平衡选择：经验/成本比
                suggestedSeed = recommendation.candidatesNormalFert
                    .sort((a, b) => (b.expPerHour / Math.max(1, b.requiredLevel)) - (a.expPerHour / Math.max(1, a.requiredLevel)))[0];
                reason = '性价比最高';
                break;
            default:
                suggestedSeed = recommendation.bestNormalFert || recommendation.bestNoFert;
        }

        const result = {
            success: true,
            data: {
                level: safeLevel,
                lands: safeLands,
                strategy,
                recommendation: {
                    seedId: suggestedSeed?.seedId,
                    name: suggestedSeed?.name,
                    requiredLevel: suggestedSeed?.requiredLevel,
                    expPerHour: suggestedSeed?.expPerHour,
                    reason,
                },
                alternatives: recommendation.candidatesNormalFert.slice(1, 6).map(s => ({
                    seedId: s.seedId,
                    name: s.name,
                    expPerHour: s.expPerHour,
                })),
            },
        };

        this._setCache(cacheKey, result);
        return result;
    }

    /**
     * 获取种子详情
     * @param {number} seedId - 种子ID
     * @returns {Object} 种子详情
     */
    getSeedDetail(seedId) {
        const analysis = analyzeExpYield({ lands: 18, top: 200 });
        const seed = analysis.rows.find(r => r.seedId === seedId);

        if (!seed) {
            return { success: false, message: '种子不存在' };
        }

        return {
            success: true,
            data: {
                seedId: seed.seedId,
                name: seed.name,
                requiredLevel: seed.requiredLevel,
                price: seed.price,
                expHarvest: seed.expHarvest,
                growTime: {
                    noFert: seed.growTimeStr,
                    normalFert: seed.growTimeNormalFertStr,
                    reducedBy: seed.normalFertReduceSec,
                },
                efficiency: {
                    expPerHourNoFert: Math.round(seed.farmExpPerHourNoFert),
                    expPerHourNormalFert: Math.round(seed.farmExpPerHourNormalFert),
                    expPerDayNoFert: Math.round(seed.farmExpPerDayNoFert),
                    expPerDayNormalFert: Math.round(seed.farmExpPerDayNormalFert),
                    expPerGold: Number(seed.expPerGoldSeed.toFixed(2)),
                    gainPercent: Number(seed.gainPercent.toFixed(1)),
                },
                cycle: {
                    noFert: Math.round(seed.cycleSecNoFert),
                    normalFert: Math.round(seed.cycleSecNormalFert),
                },
            },
        };
    }

    /**
     * 比较多个种子
     * @param {number[]} seedIds - 种子ID数组
     * @returns {Object} 比较结果
     */
    compareSeeds(seedIds) {
        if (!Array.isArray(seedIds) || seedIds.length < 2) {
            return { success: false, message: '请提供至少2个种子ID' };
        }

        const analysis = analyzeExpYield({ lands: 18, top: 200 });
        const seeds = seedIds.map(id => analysis.rows.find(r => r.seedId === id)).filter(Boolean);

        if (seeds.length < 2) {
            return { success: false, message: '找不到足够的种子数据' };
        }

        return {
            success: true,
            data: {
                comparison: seeds.map(s => ({
                    seedId: s.seedId,
                    name: s.name,
                    requiredLevel: s.requiredLevel,
                    price: s.price,
                    growTime: s.growTimeStr,
                    expPerHour: Math.round(s.farmExpPerHourNormalFert),
                    expPerDay: Math.round(s.farmExpPerDayNormalFert),
                    expPerGold: Number(s.expPerGoldSeed.toFixed(2)),
                })),
                winner: {
                    expPerHour: seeds.reduce((a, b) => a.farmExpPerHourNormalFert > b.farmExpPerHourNormalFert ? a : b).name,
                    expPerGold: seeds.reduce((a, b) => a.expPerGoldSeed > b.expPerGoldSeed ? a : b).name,
                },
            },
        };
    }

    /**
     * 获取缓存
     */
    _getCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        if (Date.now() - cached.timestamp > this.cacheExpiry) {
            this.cache.delete(key);
            return null;
        }
        return cached.data;
    }

    /**
     * 设置缓存
     */
    _setCache(key, data) {
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.cache.clear();
    }
}

// 单例实例
let instance = null;

function getAnalyticsService() {
    if (!instance) {
        instance = new AnalyticsService();
    }
    return instance;
}

module.exports = {
    AnalyticsService,
    getAnalyticsService,
};
