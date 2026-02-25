/**
 * 种植策略系统
 * 提供多种种植策略供用户选择
 *
 * 策略类型：
 * 1. preferred - 优先种植指定种子
 * 2. max_exp - 最大经验效率/小时
 * 3. max_fert_exp - 最大普通肥经验效率/小时
 * 4. max_profit - 最大净利润/小时
 * 5. max_fert_profit - 最大普通肥净利润/小时
 * 6. highest_level - 最高等级作物
 * 7. lowest_cost - 最低成本
 * 8. balanced - 平衡策略（经验+成本综合考虑）
 */

const { getPlantingRecommendation, analyzeExpYield } = require('../tools/calc-exp-yield');
const { toNum } = require('./utils');

class PlantingStrategy {
    constructor(farmConnection) {
        this.fc = farmConnection;
        this.strategy = farmConnection.account.config?.plantingStrategy || 'max_exp';
        this.preferredSeedId = farmConnection.account.config?.preferredSeedId || null;
        this.customSettings = farmConnection.account.config?.strategySettings || {};
    }

    /**
     * 设置种植策略
     * @param {string} strategy - 策略名称
     * @param {Object} settings - 额外设置
     */
    setStrategy(strategy, settings = {}) {
        this.strategy = strategy;
        if (settings.preferredSeedId !== undefined) {
            this.preferredSeedId = settings.preferredSeedId;
        }
        this.customSettings = { ...this.customSettings, ...settings };

        // 保存到账号配置
        this.fc.account.config.plantingStrategy = strategy;
        this.fc.account.config.preferredSeedId = this.preferredSeedId;
        this.fc.account.config.strategySettings = this.customSettings;

        this.fc.addLog('策略', `种植策略已切换为: ${this.getStrategyLabel(strategy)}`);
    }

    /**
     * 获取策略标签
     */
    getStrategyLabel(strategy) {
        const labels = {
            preferred: '指定种子优先',
            max_exp: '经验效率优先',
            max_fert_exp: '普通肥经验优先',
            max_profit: '利润优先',
            max_fert_profit: '普通肥利润优先',
            highest_level: '最高等级作物',
            lowest_cost: '最低成本',
            balanced: '平衡策略',
        };
        return labels[strategy] || strategy;
    }

    /**
     * 获取所有可用策略列表
     */
    getAvailableStrategies() {
        return [
            { id: 'preferred', label: '指定种子优先', desc: '优先种植用户指定的种子' },
            { id: 'max_exp', label: '经验效率优先', desc: '每小时经验收益最大化（不施肥）' },
            { id: 'max_fert_exp', label: '普通肥经验优先', desc: '使用普通肥后每小时经验收益最大化' },
            { id: 'max_profit', label: '利润优先', desc: '每小时净利润最大化（金币收益-种子成本）' },
            { id: 'max_fert_profit', label: '普通肥利润优先', desc: '使用普通肥后每小时净利润最大化' },
            { id: 'highest_level', label: '最高等级作物', desc: '种植当前等级可种的最高等级作物' },
            { id: 'lowest_cost', label: '最低成本', desc: '优先种植价格最低的种子' },
            { id: 'balanced', label: '平衡策略', desc: '综合考虑经验和成本的平衡选择' },
        ];
    }

    /**
     * 选择最佳种子
     * @param {Array} availableSeeds - 可用种子列表
     * @param {number} unlockedLandCount - 已解锁土地数量
     * @returns {Object|null} 最佳种子
     */
    selectBestSeed(availableSeeds, unlockedLandCount = 18) {
        if (!availableSeeds || availableSeeds.length === 0) {
            return null;
        }

        const level = this.fc.userState.level || 1;
        const lands = unlockedLandCount || 18;

        switch (this.strategy) {
            case 'preferred':
                return this.selectPreferredSeed(availableSeeds);
            case 'max_exp':
                return this.selectMaxExpSeed(availableSeeds, level, lands, false);
            case 'max_fert_exp':
                return this.selectMaxExpSeed(availableSeeds, level, lands, true);
            case 'max_profit':
                return this.selectMaxProfitSeed(availableSeeds, level, lands, false);
            case 'max_fert_profit':
                return this.selectMaxProfitSeed(availableSeeds, level, lands, true);
            case 'highest_level':
                return this.selectHighestLevelSeed(availableSeeds);
            case 'lowest_cost':
                return this.selectLowestCostSeed(availableSeeds);
            case 'balanced':
                return this.selectBalancedSeed(availableSeeds, level, lands);
            default:
                return this.selectMaxExpSeed(availableSeeds, level, lands, false);
        }
    }

    /**
     * 策略1: 指定种子优先
     */
    selectPreferredSeed(availableSeeds) {
        if (this.preferredSeedId) {
            const preferred = availableSeeds.find(s => s.seedId === this.preferredSeedId);
            if (preferred) {
                return preferred;
            }
            this.fc.addLog('策略', `指定种子 ${this.preferredSeedId} 不可用，使用备选策略`);
        }
        // 如果指定种子不可用，回退到经验优先
        return this.selectMaxExpSeed(availableSeeds, this.fc.userState.level, 18, false);
    }

    /**
     * 策略2/3: 经验效率优先
     */
    selectMaxExpSeed(availableSeeds, level, lands, useFertilizer) {
        try {
            const rec = getPlantingRecommendation(level, lands, { top: 50 });
            const candidates = useFertilizer
                ? rec.candidatesNormalFert
                : rec.candidatesNoFert;

            for (const candidate of candidates) {
                const hit = availableSeeds.find(s => s.seedId === candidate.seedId);
                if (hit) {
                    return hit;
                }
            }
        } catch (e) {
            this.fc.addLog('策略', `经验优先策略出错: ${e.message}`);
        }

        // 兜底策略
        return this.selectHighestLevelSeed(availableSeeds);
    }

    /**
     * 策略4/5: 利润优先
     */
    selectMaxProfitSeed(availableSeeds, level, lands, useFertilizer) {
        try {
            const analysis = analyzeExpYield({ level, lands, top: 100 });

            // 计算每个种子的利润效率
            const seedsWithProfit = availableSeeds.map(seed => {
                const row = analysis.rows.find(r => r.seedId === seed.seedId);
                if (!row) return { seed, profitPerHour: 0 };

                const cycleSec = useFertilizer ? row.cycleSecNormalFert : row.cycleSecNoFert;
                const cyclesPerHour = 3600 / cycleSec;

                // 简化计算：假设果实售价 = 种子价格 * 1.5
                const fruitRevenue = seed.price * 1.5 * cyclesPerHour;
                const seedCost = seed.price * cyclesPerHour;
                const profitPerHour = fruitRevenue - seedCost;

                return { seed, profitPerHour };
            });

            // 按利润排序
            seedsWithProfit.sort((a, b) => b.profitPerHour - a.profitPerHour);

            if (seedsWithProfit.length > 0 && seedsWithProfit[0].profitPerHour > 0) {
                return seedsWithProfit[0].seed;
            }
        } catch (e) {
            this.fc.addLog('策略', `利润优先策略出错: ${e.message}`);
        }

        // 兜底策略
        return this.selectMaxExpSeed(availableSeeds, level, lands, useFertilizer);
    }

    /**
     * 策略6: 最高等级作物
     */
    selectHighestLevelSeed(availableSeeds) {
        const sorted = [...availableSeeds].sort((a, b) => b.requiredLevel - a.requiredLevel);
        return sorted[0];
    }

    /**
     * 策略7: 最低成本
     */
    selectLowestCostSeed(availableSeeds) {
        const sorted = [...availableSeeds].sort((a, b) => a.price - b.price);
        return sorted[0];
    }

    /**
     * 策略8: 平衡策略
     */
    selectBalancedSeed(availableSeeds, level, lands) {
        try {
            const analysis = analyzeExpYield({ level, lands, top: 100 });

            // 计算综合得分：经验效率 / (价格/1000 + 1)
            const seedsWithScore = availableSeeds.map(seed => {
                const row = analysis.rows.find(r => r.seedId === seed.seedId);
                if (!row) return { seed, score: 0 };

                const expPerHour = row.farmExpPerHourNormalFert;
                const costFactor = seed.price / 1000 + 1;
                const score = expPerHour / costFactor;

                return { seed, score };
            });

            // 按得分排序
            seedsWithScore.sort((a, b) => b.score - a.score);

            if (seedsWithScore.length > 0) {
                return seedsWithScore[0].seed;
            }
        } catch (e) {
            this.fc.addLog('策略', `平衡策略出错: ${e.message}`);
        }

        // 兜底策略
        return this.selectMaxExpSeed(availableSeeds, level, lands, true);
    }

    /**
     * 获取当前策略状态
     */
    getStatus() {
        return {
            strategy: this.strategy,
            strategyLabel: this.getStrategyLabel(this.strategy),
            preferredSeedId: this.preferredSeedId,
            customSettings: this.customSettings,
            availableStrategies: this.getAvailableStrategies(),
        };
    }
}

module.exports = PlantingStrategy;
