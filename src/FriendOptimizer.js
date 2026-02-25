/**
 * 好友智能预筛选模块
 * 根据好友列表摘要数据跳过无事可做的好友，减少无效请求
 * 支持静默时段控制
 */

const { toNum, sleep } = require('./utils');

class FriendOptimizer {
    constructor(farmConnection) {
        this.fc = farmConnection;
        // 静默时段配置
        this.quietHours = {
            enabled: false,
            startHour: 23,  // 默认23点开始
            endHour: 7,     // 默认7点结束
        };
        // 好友访问统计
        this.visitStats = new Map(); // gid -> { lastVisit, visitCount, successCount }
        // 上次检查时间
        this.lastCheckTime = null;
    }

    /**
     * 设置静默时段
     * @param {Object} config - 静默时段配置
     * @param {boolean} config.enabled - 是否启用
     * @param {number} config.startHour - 开始时间(0-23)
     * @param {number} config.endHour - 结束时间(0-23)
     */
    setQuietHours(config) {
        this.quietHours = {
            enabled: config.enabled ?? this.quietHours.enabled,
            startHour: config.startHour ?? this.quietHours.startHour,
            endHour: config.endHour ?? this.quietHours.endHour,
        };
        this.fc.addLog('好友', `静默时段设置: ${this.quietHours.enabled ? `${this.quietHours.startHour}:00-${this.quietHours.endHour}:00` : '未启用'}`);
    }

    /**
     * 检查当前是否在静默时段
     * @returns {boolean}
     */
    isInQuietHours() {
        if (!this.quietHours.enabled) return false;
        
        const now = new Date();
        const currentHour = now.getHours();
        const { startHour, endHour } = this.quietHours;
        
        // 处理跨天的情况，如 23:00 - 07:00
        if (startHour > endHour) {
            return currentHour >= startHour || currentHour < endHour;
        }
        // 不跨天的情况，如 01:00 - 05:00
        return currentHour >= startHour && currentHour < endHour;
    }

    /**
     * 获取静默时段状态
     * @returns {Object}
     */
    getQuietHoursStatus() {
        const now = new Date();
        const currentHour = now.getHours();
        const { startHour, endHour, enabled } = this.quietHours;
        
        let remainingMinutes = 0;
        if (enabled && this.isInQuietHours()) {
            // 计算剩余静默时间（分钟）
            if (startHour > endHour) {
                // 跨天情况
                if (currentHour >= startHour) {
                    // 当前在 startHour 到 23:59 之间
                    remainingMinutes = (24 - currentHour + endHour) * 60 - now.getMinutes();
                } else {
                    // 当前在 00:00 到 endHour 之间
                    remainingMinutes = (endHour - currentHour) * 60 - now.getMinutes();
                }
            } else {
                // 不跨天
                remainingMinutes = (endHour - currentHour) * 60 - now.getMinutes();
            }
        }
        
        return {
            enabled,
            startHour,
            endHour,
            isInQuietHours: this.isInQuietHours(),
            currentHour,
            remainingMinutes: Math.max(0, remainingMinutes),
        };
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
     * 根据优先级排序好友
     * 优先访问高价值好友
     * @param {Array} friendsToVisit - 待访问好友列表
     * @returns {Array} 排序后的列表
     */
    sortFriendsByPriority(friendsToVisit) {
        return friendsToVisit.sort((a, b) => {
            // 计算优先级分数
            const scoreA = this.calculateFriendPriority(a);
            const scoreB = this.calculateFriendPriority(b);
            return scoreB - scoreA; // 降序排列
        });
    }

    /**
     * 计算好友优先级分数
     * @param {Object} friend - 好友信息
     * @returns {number}
     */
    calculateFriendPriority(friend) {
        let score = 0;
        
        // 可偷作物加分（权重最高）
        score += friend.stealNum * 10;
        
        // 需要帮助的操作加分
        score += friend.weedNum * 3;
        score += friend.insectNum * 3;
        score += friend.dryNum * 2;
        
        // 等级高的好友可能有更好的作物
        score += friend.level * 0.1;
        
        // 根据历史访问成功率调整
        const stats = this.visitStats.get(friend.gid);
        if (stats) {
            const successRate = stats.visitCount > 0 ? stats.successCount / stats.visitCount : 0.5;
            score *= (0.5 + successRate); // 成功率高的好友获得加成
        }
        
        return score;
    }

    /**
     * 记录好友访问
     * @param {number} gid - 好友GID
     * @param {boolean} success - 是否成功获取资源
     */
    recordVisit(gid, success = true) {
        const stats = this.visitStats.get(gid) || {
            lastVisit: null,
            visitCount: 0,
            successCount: 0,
        };
        
        stats.lastVisit = Date.now();
        stats.visitCount++;
        if (success) {
            stats.successCount++;
        }
        
        this.visitStats.set(gid, stats);
        
        // 清理过期的统计数据（保留最近100个好友的记录）
        if (this.visitStats.size > 100) {
            const oldestEntries = Array.from(this.visitStats.entries())
                .sort((a, b) => (a[1].lastVisit || 0) - (b[1].lastVisit || 0))
                .slice(0, this.visitStats.size - 100);
            for (const [key] of oldestEntries) {
                this.visitStats.delete(key);
            }
        }
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
        // 检查静默时段
        if (this.isInQuietHours()) {
            const status = this.getQuietHoursStatus();
            this.fc.addLog('好友', `静默时段中，跳过好友检查 (剩余${status.remainingMinutes}分钟)`);
            return { friendsToVisit: [], skippedCount: friends.length, totalFriends: friends.length, quietHours: true };
        }

        const { friendsToVisit, skippedCount, totalFriends } = this.prefilterFriends(friends, toggles);

        if (friendsToVisit.length === 0) {
            this.fc.addLog('好友', `好友 ${totalFriends} 人，全部无事可做`);
            return { friendsToVisit: [], skippedCount, totalFriends };
        }

        // 按优先级排序
        const sortedFriends = this.sortFriendsByPriority(friendsToVisit);

        // 打印待访问列表摘要
        const visitSummary = this.generateVisitSummary(sortedFriends);
        this.fc.addLog('好友', `待访问 ${sortedFriends.length}/${totalFriends} 人 (跳过${skippedCount}人): ${visitSummary}`);

        return { friendsToVisit: sortedFriends, skippedCount, totalFriends };
    }

    /**
     * 获取优化器状态
     * @returns {Object}
     */
    getStatus() {
        return {
            quietHours: this.getQuietHoursStatus(),
            visitStats: {
                trackedFriends: this.visitStats.size,
                totalVisits: Array.from(this.visitStats.values()).reduce((sum, s) => sum + s.visitCount, 0),
                totalSuccess: Array.from(this.visitStats.values()).reduce((sum, s) => sum + s.successCount, 0),
            },
        };
    }

    /**
     * 清除访问统计
     */
    clearStats() {
        this.visitStats.clear();
        this.fc.addLog('好友', '访问统计数据已清除');
    }
}

module.exports = FriendOptimizer;
