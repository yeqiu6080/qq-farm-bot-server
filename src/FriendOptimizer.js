/**
 * 好友智能预筛选模块
 * 根据好友列表摘要数据跳过无事可做的好友，减少无效请求
 */

const { toNum, sleep } = require('./utils');

class FriendOptimizer {
    constructor(farmConnection) {
        this.fc = farmConnection;
    }

    /**
     * 智能预筛选好友
     * 根据好友列表摘要数据，只访问有可偷或可帮忙的好友
     * 
     * @param {Array} friends - 好友列表
     * @param {Object} toggles - 功能开关
     * @returns {Array} 可访问的好友列表
     */
    prefilterFriends(friends, toggles = {}) {
        const {
            autoSteal = true,
            friendHelp = true,
        } = toggles;

        const friendsToVisit = [];
        const visitedGids = new Set();
        let skippedCount = 0;

        for (const f of friends) {
            const gid = toNum(f.gid);
            
            // 跳过自己和已访问的
            if (gid === this.fc.userState?.gid || visitedGids.has(gid)) {
                continue;
            }

            const name = f.remark || f.name || `GID:${gid}`;
            const p = f.plant;
            
            // 从好友摘要获取数据
            const stealNum = p ? toNum(p.steal_plant_num) : 0;
            const dryNum = p ? toNum(p.dry_num) : 0;
            const weedNum = p ? toNum(p.weed_num) : 0;
            const insectNum = p ? toNum(p.insect_num) : 0;

            // 根据开关决定是否有事可做
            const canSteal = autoSteal && stealNum > 0;
            const canHelp = friendHelp && (dryNum > 0 || weedNum > 0 || insectNum > 0);

            // 有可偷 或 有可帮忙 → 访问
            if (canSteal || canHelp) {
                friendsToVisit.push({
                    gid,
                    name,
                    level: toNum(f.level),
                    stealNum,
                    dryNum,
                    weedNum,
                    insectNum
                });
                visitedGids.add(gid);
            } else {
                skippedCount++;
            }
        }

        return {
            friendsToVisit,
            skippedCount,
            totalFriends: friends.length,
        };
    }

    /**
     * 生成好友访问摘要
     * @param {Array} friendsToVisit - 待访问好友列表
     * @returns {string} 摘要字符串
     */
    generateVisitSummary(friendsToVisit) {
        return friendsToVisit.map(f => {
            const parts = [];
            if (f.stealNum > 0) parts.push(`偷${f.stealNum}`);
            if (f.weedNum > 0) parts.push(`草${f.weedNum}`);
            if (f.insectNum > 0) parts.push(`虫${f.insectNum}`);
            if (f.dryNum > 0) parts.push(`水${f.dryNum}`);
            return `${f.name}(${parts.join('/')})`;
        }).join(', ');
    }

    /**
     * 分析好友土地
     * @param {Array} lands - 好友土地列表
     * @param {Object} options - 选项
     * @returns {Object} 分析结果
     */
    analyzeFriendLands(lands, options = {}) {
        const {
            skipStealRadish = true,  // 是否跳过白萝卜
            myGid = 0,
        } = options;

        // 白萝卜植物ID列表
        const RADISH_PLANT_IDS = [2020002, 1020002];

        const result = {
            stealable: [],
            stealableInfo: [],
            needWater: [],
            needWeed: [],
            needBug: [],
        };

        for (const land of lands) {
            const id = toNum(land.id);
            const plant = land.plant;

            if (!plant || !plant.phases || plant.phases.length === 0) continue;

            const currentPhase = this._getCurrentPhase(plant.phases);
            if (!currentPhase) continue;

            const phaseVal = currentPhase.phase;

            if (phaseVal === 3) { // MATURE - 成熟
                if (plant.stealable) {
                    const plantId = toNum(plant.id);
                    
                    // 跳过白萝卜
                    if (skipStealRadish && RADISH_PLANT_IDS.includes(plantId)) {
                        continue;
                    }

                    result.stealable.push(id);
                    result.stealableInfo.push({
                        landId: id,
                        plantId,
                        name: plant.name || '未知',
                    });
                }
                continue;
            }

            if (phaseVal === 4) continue; // DEAD - 枯萎

            // 需要帮助的操作
            if (toNum(plant.dry_num) > 0) result.needWater.push(id);
            if (plant.weed_owners && plant.weed_owners.length > 0) result.needWeed.push(id);
            if (plant.insect_owners && plant.insect_owners.length > 0) result.needBug.push(id);
        }

        return result;
    }

    /**
     * 获取当前阶段
     */
    _getCurrentPhase(phases) {
        if (!phases || phases.length === 0) return null;
        const nowSec = Math.floor(Date.now() / 1000);
        
        for (let i = phases.length - 1; i >= 0; i--) {
            const beginTime = this._toTimeSec(phases[i].begin_time);
            if (beginTime > 0 && beginTime <= nowSec) {
                return phases[i];
            }
        }
        return phases[0];
    }

    /**
     * 转换时间为秒
     */
    _toTimeSec(val) {
        const n = toNum(val);
        if (n <= 0) return 0;
        return n > 1e12 ? Math.floor(n / 1000) : n;
    }

    /**
     * 获取优化后的好友列表（带日志）
     * @param {Array} friends - 原始好友列表
     * @param {Object} toggles - 功能开关
     * @returns {Promise<Object>} 优化结果
     */
    async getOptimizedFriends(friends, toggles = {}) {
        const { friendsToVisit, skippedCount, totalFriends } = this.prefilterFriends(friends, toggles);

        if (friendsToVisit.length === 0) {
            this.fc.addLog('好友', `好友 ${totalFriends} 人，全部无事可做`);
            return { friendsToVisit: [], skippedCount, totalFriends };
        }

        // 打印待访问列表摘要
        const visitSummary = this.generateVisitSummary(friendsToVisit);
        this.fc.addLog('好友', `待访问 ${friendsToVisit.length}/${totalFriends} 人 (跳过${skippedCount}人): ${visitSummary}`);

        return { friendsToVisit, skippedCount, totalFriends };
    }
}

module.exports = FriendOptimizer;
