/**
 * 土地管理模块
 * 实现土地解锁和升级功能
 */

const { types } = require('./proto');
const { toLong, toNum, sleep } = require('./utils');

class LandManager {
    constructor(farmConnection) {
        this.fc = farmConnection;
    }

    /**
     * 升级土地
     * @param {number} landId - 要升级的土地ID
     * @returns {Promise<Object>} 升级后的土地信息
     */
    async upgradeLand(landId) {
        const body = types.UpgradeLandRequest.encode(types.UpgradeLandRequest.create({
            land_id: toLong(landId),
        })).finish();
        const { body: replyBody } = await this.fc.sendMsgAsync('gamepb.plantpb.PlantService', 'UpgradeLand', body);
        return types.UpgradeLandReply.decode(replyBody);
    }

    /**
     * 解锁土地（开拓新土地）
     * @param {number} landId - 要解锁的土地ID
     * @param {boolean} doShared - 是否选择共享土地
     * @returns {Promise<Object>} 解锁后的土地信息
     */
    async unlockLand(landId, doShared = false) {
        const body = types.UnlockLandRequest.encode(types.UnlockLandRequest.create({
            land_id: toLong(landId),
            do_shared: !!doShared,
        })).finish();
        const { body: replyBody } = await this.fc.sendMsgAsync('gamepb.plantpb.PlantService', 'UnlockLand', body);
        return types.UnlockLandReply.decode(replyBody);
    }

    /**
     * 分析土地，找出可解锁和可升级的土地
     * @param {Array} lands - 土地列表
     * @returns {Object} 分析结果
     */
    analyzeLands(lands) {
        const result = {
            unlockable: [],     // 可解锁（开拓）的土地
            upgradable: [],     // 可升级的土地
        };

        for (const land of lands) {
            const id = toNum(land.id);
            
            // 未解锁的土地 → 检查是否可以解锁
            if (!land.unlocked) {
                if (land.could_unlock) {
                    result.unlockable.push(id);
                }
                continue;
            }
            
            // 已解锁的土地 → 检查是否可以升级
            if (land.could_upgrade) {
                result.upgradable.push(id);
            }
        }
        
        return result;
    }

    /**
     * 自动解锁所有可解锁的土地
     * @param {Array} lands - 土地列表
     * @returns {Promise<number>} 解锁的土地数量
     */
    async autoUnlockLands(lands) {
        const analysis = this.analyzeLands(lands);
        
        if (analysis.unlockable.length === 0) {
            return 0;
        }

        let unlocked = 0;
        for (const landId of analysis.unlockable) {
            try {
                await this.unlockLand(landId, false);
                this.fc.addLog('土地', `土地#${landId} 解锁成功`);
                unlocked++;
            } catch (e) {
                this.fc.addLog('土地', `土地#${landId} 解锁失败: ${e.message}`);
            }
            await sleep(200);
        }
        
        return unlocked;
    }

    /**
     * 自动升级所有可升级的土地
     * @param {Array} lands - 土地列表
     * @returns {Promise<number>} 升级的土地数量
     */
    async autoUpgradeLands(lands) {
        const analysis = this.analyzeLands(lands);
        
        if (analysis.upgradable.length === 0) {
            return 0;
        }

        let upgraded = 0;
        for (const landId of analysis.upgradable) {
            try {
                const reply = await this.upgradeLand(landId);
                const newLevel = reply.land ? toNum(reply.land.level) : '?';
                this.fc.addLog('土地', `土地#${landId} 升级成功 → 等级${newLevel}`);
                upgraded++;
            } catch (e) {
                this.fc.addLog('土地', `土地#${landId} 升级失败: ${e.message}`);
            }
            await sleep(200);
        }
        
        return upgraded;
    }

    /**
     * 获取详细的土地状态
     * @returns {Promise<Object>} 土地详情
     */
    async getDetailedLandStatus() {
        try {
            const body = types.AllLandsRequest.encode(types.AllLandsRequest.create({})).finish();
            const { body: replyBody } = await this.fc.sendMsgAsync(
                'gamepb.plantpb.PlantService', 'AllLands', body
            );
            const reply = types.AllLandsReply.decode(replyBody);
            
            if (!reply.lands) return null;
            
            const lands = reply.lands;
            const analysis = this.analyzeLands(lands);
            const totalLands = lands.length;
            const unlockedCount = lands.filter(l => l && l.unlocked).length;
            const lockedCount = totalLands - unlockedCount;

            // 构建每块地的详细信息
            const landDetails = lands.map(land => {
                const id = toNum(land.id);
                const unlocked = !!land.unlocked;
                const detail = { 
                    id, 
                    unlocked, 
                    soilType: toNum(land.soil_type) || 0,
                    couldUnlock: !!land.could_unlock,
                    couldUpgrade: !!land.could_upgrade,
                    level: toNum(land.level) || 0,
                };
                
                if (!unlocked) return detail;

                const plant = land.plant;
                if (!plant || !plant.phases || plant.phases.length === 0) {
                    detail.status = 'empty';
                    return detail;
                }

                // 获取当前阶段
                const currentPhase = this.fc.getCurrentPhase ? 
                    this.fc.getCurrentPhase(plant.phases) : 
                    this._getCurrentPhase(plant.phases);
                    
                const phaseVal = currentPhase ? currentPhase.phase : 0;
                const plantId = toNum(plant.id);
                
                detail.plantId = plantId;
                detail.phase = phaseVal;
                detail.phaseName = this._getPhaseName(phaseVal);

                if (phaseVal === 4) { // DEAD
                    detail.status = 'dead';
                } else if (phaseVal === 3) { // MATURE
                    detail.status = 'harvestable';
                } else {
                    detail.status = 'growing';
                    // 计算剩余时间
                    const maturePhase = plant.phases.find(p => p.phase === 3);
                    if (maturePhase) {
                        const nowSec = this.fc.getServerTimeSec ? 
                            this.fc.getServerTimeSec() : 
                            Math.floor(Date.now() / 1000);
                        const matureBegin = this._toTimeSec(maturePhase.begin_time);
                        if (matureBegin > nowSec) {
                            detail.timeLeftSec = matureBegin - nowSec;
                        }
                    }
                }

                // 需要处理项
                detail.needWater = toNum(plant.dry_num) > 0;
                detail.needWeed = plant.weed_owners && plant.weed_owners.length > 0;
                detail.needBug = plant.insect_owners && plant.insect_owners.length > 0;
                
                return detail;
            });

            return {
                totalLands,
                unlockedCount,
                lockedCount,
                unlockable: analysis.unlockable.length,
                upgradable: analysis.upgradable.length,
                lands: landDetails,
                updatedAt: Date.now(),
            };
        } catch (err) {
            this.fc.addLog('土地', `获取土地状态失败: ${err.message}`);
            return null;
        }
    }

    /**
     * 获取当前阶段（辅助方法）
     */
    _getCurrentPhase(phases) {
        if (!phases || phases.length === 0) return null;
        const nowSec = Math.floor(Date.now() / 1000);
        for (let i = phases.length - 1; i >= 0; i--) {
            const beginTime = this._toTimeSec(phases[i].begin_time);
            if (beginTime > 0 && beginTime <= nowSec) return phases[i];
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
     * 获取阶段名称
     */
    _getPhaseName(phase) {
        const names = {
            0: '种子',
            1: '发芽',
            2: '生长',
            3: '成熟',
            4: '枯萎',
        };
        return names[phase] || '未知';
    }
}

module.exports = LandManager;
