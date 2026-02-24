/**
 * 每日奖励系统
 * 实现8个每日奖励功能：
 * 1. 商城免费礼包
 * 2. 分享奖励
 * 3. 月卡奖励
 * 4. 邮箱奖励
 * 5. QQ会员奖励
 * 6. 图鉴奖励
 * 7. 点券购买化肥
 * 8. 使用化肥礼包
 */

const { types } = require('./proto');
const { toLong, toNum, sleep } = require('./utils');
const { getItemName } = require('./gameConfig');

class DailyRewards {
    constructor(farmConnection) {
        this.fc = farmConnection;
        
        // 每日奖励状态追踪
        this.dailyRewardState = {
            freeGifts: '',        // 商城免费礼包完成日期
            share: '',            // 分享奖励完成日期
            monthCard: '',        // 月卡奖励完成日期
            email: '',            // 邮箱奖励完成日期
            vipGift: '',          // QQ会员奖励完成日期
            illustrated: '',      // 图鉴奖励完成日期
            fertilizerBuy: '',    // 化肥购买完成日期
            fertilizerUse: '',    // 化肥礼包使用完成日期
        };
        
        // 上次购买化肥时间
        this.lastFertilizerBuyAt = 0;
        
        // 每日任务定时器
        this.dailyRoutineTimer = null;
        
        // 功能开关
        this.toggles = {
            autoFreeGifts: true,
            autoShareReward: true,
            autoMonthCard: true,
            autoEmailReward: true,
            autoVipGift: true,
            autoIllustrated: true,
            autoFertilizerBuy: false,
            autoFertilizerUse: false,
        };
    }

    /**
     * 启动每日奖励系统
     */
    start() {
        // 首次执行延迟8秒
        setTimeout(() => this.runDailyRewards(), 8000);
        // 每小时检查一次
        this.dailyRoutineTimer = setInterval(() => this.runDailyRewards(), 60 * 60 * 1000);
        this.fc.addLog('每日奖励', '每日奖励系统已启动');
    }

    /**
     * 停止每日奖励系统
     */
    stop() {
        if (this.dailyRoutineTimer) {
            clearInterval(this.dailyRoutineTimer);
            this.dailyRoutineTimer = null;
        }
    }

    /**
     * 设置功能开关
     */
    setToggles(toggles) {
        Object.assign(this.toggles, toggles);
    }

    /**
     * 获取日期键
     */
    _getDateKey() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * 检查今天是否已完成
     */
    _isDoneToday(key) {
        return this.dailyRewardState[key] === this._getDateKey();
    }

    /**
     * 标记今天已完成
     */
    _markDoneToday(key) {
        this.dailyRewardState[key] = this._getDateKey();
    }

    /**
     * 格式化奖励摘要
     */
    _getRewardSummary(items) {
        if (!items || items.length === 0) return '无奖励';
        const parts = [];
        for (const item of items) {
            const id = toNum(item.id);
            const count = toNum(item.count);
            if (count <= 0) continue;
            if (id === 1 || id === 1001) parts.push(`💰金币+${count}`);
            else if (id === 2 || id === 1101) parts.push(`⭐经验+${count}`);
            else if (id === 1002) parts.push(`💎点券+${count}`);
            else parts.push(`${getItemName(id)}×${count}`);
        }
        return parts.join(' | ') || '无奖励';
    }

    /**
     * 执行每日奖励领取
     */
    async runDailyRewards() {
        if (!this.fc.isRunning || !this.fc.isConnected) return;
        
        this.fc.addLog('每日奖励', '开始检查每日奖励...');
        
        try {
            if (this.toggles.autoFreeGifts) await this.claimFreeGifts();
            await sleep(500);
            
            if (this.toggles.autoShareReward) await this.claimShareReward();
            await sleep(500);
            
            if (this.toggles.autoMonthCard) await this.claimMonthCard();
            await sleep(500);
            
            if (this.toggles.autoEmailReward) await this.claimEmailRewards();
            await sleep(500);
            
            if (this.toggles.autoVipGift) await this.claimVipGift();
            await sleep(500);
            
            if (this.toggles.autoIllustrated) await this.claimIllustratedRewards();
            await sleep(500);
            
            if (this.toggles.autoFertilizerUse) await this.useFertilizerGiftPacks();
            await sleep(500);
            
            if (this.toggles.autoFertilizerBuy) await this.buyOrganicFertilizer();
        } catch (e) {
            this.fc.addLog('每日奖励', `检查出错: ${e.message}`);
        }
    }

    // ========== 1. 商城免费礼包 ==========
    async claimFreeGifts(force = false) {
        if (!force && this._isDoneToday('freeGifts')) return 0;
        
        try {
            const reqBody = types.GetMallListBySlotTypeRequest.encode(
                types.GetMallListBySlotTypeRequest.create({ slot_type: 1 })
            ).finish();
            
            const { body: replyBody } = await this.fc.sendMsgAsync(
                'gamepb.mallpb.MallService', 'GetMallListBySlotType', reqBody
            );
            
            const reply = types.GetMallListBySlotTypeResponse.decode(replyBody);
            const goodsList = reply.goods_list || [];

            let claimed = 0;
            for (const goodsBytes of goodsList) {
                try {
                    const goods = types.MallGoods.decode(goodsBytes);
                    if (goods.is_free && goods.goods_id > 0) {
                        const purchaseReq = types.PurchaseRequest.encode(
                            types.PurchaseRequest.create({ goods_id: goods.goods_id, count: 1 })
                        ).finish();
                        await this.fc.sendMsgAsync('gamepb.mallpb.MallService', 'Purchase', purchaseReq);
                        claimed++;
                        await sleep(200);
                    }
                } catch (e) { /* 单个商品失败继续 */ }
            }

            if (claimed > 0) {
                this.fc.addLog('每日奖励', `🎁 领取免费礼包 ×${claimed}`);
            }
            this._markDoneToday('freeGifts');
            return claimed;
        } catch (e) {
            this._markDoneToday('freeGifts');
            return 0;
        }
    }

    // ========== 2. 分享奖励 ==========
    async claimShareReward(force = false) {
        if (!force && this._isDoneToday('share')) return false;

        try {
            // 检查是否可以分享
            const checkReq = types.CheckCanShareRequest.encode(
                types.CheckCanShareRequest.create({})
            ).finish();
            const { body: checkBody } = await this.fc.sendMsgAsync(
                'gamepb.sharepb.ShareService', 'CheckCanShare', checkReq
            );
            const checkReply = types.CheckCanShareReply.decode(checkBody);
            
            if (!checkReply.can_share) {
                this._markDoneToday('share');
                return false;
            }

            // 上报分享
            const reportReq = types.ReportShareRequest.encode(
                types.ReportShareRequest.create({ shared: true })
            ).finish();
            await this.fc.sendMsgAsync('gamepb.sharepb.ShareService', 'ReportShare', reportReq);
            await sleep(300);

            // 领取奖励
            const claimReq = types.ClaimShareRewardRequest.encode(
                types.ClaimShareRewardRequest.create({ claimed: true })
            ).finish();
            const { body: claimBody } = await this.fc.sendMsgAsync(
                'gamepb.sharepb.ShareService', 'ClaimShareReward', claimReq
            );
            const claimReply = types.ClaimShareRewardReply.decode(claimBody);

            if (claimReply.success || claimReply.items?.length > 0) {
                this.fc.addLog('每日奖励', `📤 分享奖励: ${this._getRewardSummary(claimReply.items)}`);
                this._markDoneToday('share');
                return true;
            }
            this._markDoneToday('share');
            return false;
        } catch (e) {
            this._markDoneToday('share');
            return false;
        }
    }

    // ========== 3. 月卡奖励 ==========
    async claimMonthCard(force = false) {
        if (!force && this._isDoneToday('monthCard')) return false;

        try {
            const infoReq = types.GetMonthCardInfosRequest.encode(
                types.GetMonthCardInfosRequest.create({})
            ).finish();
            const { body: infoBody } = await this.fc.sendMsgAsync(
                'gamepb.mallpb.MallService', 'GetMonthCardInfos', infoReq
            );
            const infoReply = types.GetMonthCardInfosReply.decode(infoBody);
            const infos = infoReply.infos || [];

            const claimable = infos.filter(x => x.can_claim && x.goods_id > 0);
            if (claimable.length === 0) {
                this._markDoneToday('monthCard');
                return false;
            }

            let claimed = 0;
            for (const info of claimable) {
                try {
                    const claimReq = types.ClaimMonthCardRewardRequest.encode(
                        types.ClaimMonthCardRewardRequest.create({ goods_id: info.goods_id })
                    ).finish();
                    const { body: claimBody } = await this.fc.sendMsgAsync(
                        'gamepb.mallpb.MallService', 'ClaimMonthCardReward', claimReq
                    );
                    const claimReply = types.ClaimMonthCardRewardReply.decode(claimBody);
                    this.fc.addLog('每日奖励', `📅 月卡奖励: ${this._getRewardSummary(claimReply.items)}`);
                    claimed++;
                    await sleep(300);
                } catch (e) { }
            }

            this._markDoneToday('monthCard');
            return claimed > 0;
        } catch (e) {
            this._markDoneToday('monthCard');
            return false;
        }
    }

    // ========== 4. 邮箱奖励 ==========
    async claimEmailRewards(force = false) {
        if (!force && this._isDoneToday('email')) return { claimed: 0 };

        try {
            const emails = [];
            // 获取两个邮箱的邮件
            for (const boxType of [1, 2]) {
                try {
                    const req = types.GetEmailListRequest.encode(
                        types.GetEmailListRequest.create({ box_type: boxType })
                    ).finish();
                    const { body: replyBody } = await this.fc.sendMsgAsync(
                        'gamepb.emailpb.EmailService', 'GetEmailList', req
                    );
                    const reply = types.GetEmailListReply.decode(replyBody);
                    for (const email of (reply.emails || [])) {
                        if (email.has_reward && !email.claimed) {
                            emails.push({ ...email, boxType });
                        }
                    }
                } catch (e) { }
            }

            if (emails.length === 0) {
                this._markDoneToday('email');
                return { claimed: 0 };
            }

            let claimed = 0;
            let totalRewards = [];

            for (const email of emails) {
                try {
                    // 先尝试批量领取
                    const batchReq = types.BatchClaimEmailRequest.encode(
                        types.BatchClaimEmailRequest.create({ box_type: email.boxType, email_id: email.id })
                    ).finish();
                    const { body: batchBody } = await this.fc.sendMsgAsync(
                        'gamepb.emailpb.EmailService', 'BatchClaimEmail', batchReq
                    );
                    const batchReply = types.BatchClaimEmailReply.decode(batchBody);
                    if (batchReply.items) totalRewards.push(...batchReply.items);
                    claimed++;
                } catch (e) {
                    // 批量失败，尝试单个领取
                    try {
                        const singleReq = types.ClaimEmailRequest.encode(
                            types.ClaimEmailRequest.create({ box_type: email.boxType, email_id: email.id })
                        ).finish();
                        const { body: singleBody } = await this.fc.sendMsgAsync(
                            'gamepb.emailpb.EmailService', 'ClaimEmail', singleReq
                        );
                        const singleReply = types.ClaimEmailReply.decode(singleBody);
                        if (singleReply.items) totalRewards.push(...singleReply.items);
                        claimed++;
                    } catch (e2) { }
                }
                await sleep(100);
            }

            if (claimed > 0) {
                this.fc.addLog('每日奖励', `📧 邮箱奖励 ×${claimed}: ${this._getRewardSummary(totalRewards)}`);
            }
            this._markDoneToday('email');
            return { claimed };
        } catch (e) {
            this._markDoneToday('email');
            return { claimed: 0 };
        }
    }

    // ========== 5. QQ会员奖励 ==========
    async claimVipGift(force = false) {
        if (!force && this._isDoneToday('vipGift')) return false;

        try {
            const statusReq = types.GetDailyGiftStatusRequest.encode(
                types.GetDailyGiftStatusRequest.create({})
            ).finish();
            const { body: statusBody } = await this.fc.sendMsgAsync(
                'gamepb.qqvippb.QQVipService', 'GetDailyGiftStatus', statusReq
            );
            const statusReply = types.GetDailyGiftStatusReply.decode(statusBody);

            if (!statusReply.can_claim) {
                this._markDoneToday('vipGift');
                return false;
            }

            const claimReq = types.ClaimDailyGiftRequest.encode(
                types.ClaimDailyGiftRequest.create({})
            ).finish();
            const { body: claimBody } = await this.fc.sendMsgAsync(
                'gamepb.qqvippb.QQVipService', 'ClaimDailyGift', claimReq
            );
            const claimReply = types.ClaimDailyGiftReply.decode(claimBody);

            if (claimReply.items?.length > 0) {
                this.fc.addLog('每日奖励', `👑 QQ会员奖励: ${this._getRewardSummary(claimReply.items)}`);
                this._markDoneToday('vipGift');
                return true;
            }
            this._markDoneToday('vipGift');
            return false;
        } catch (e) {
            this._markDoneToday('vipGift');
            return false;
        }
    }

    // ========== 6. 图鉴奖励 ==========
    async claimIllustratedRewards(force = false) {
        if (!force && this._isDoneToday('illustrated')) return false;

        try {
            const claimReq = types.ClaimAllRewardsV2Request.encode(
                types.ClaimAllRewardsV2Request.create({ only_claimable: true })
            ).finish();
            const { body: claimBody } = await this.fc.sendMsgAsync(
                'gamepb.illustratedpb.IllustratedService', 'ClaimAllRewardsV2', claimReq
            );
            const claimReply = types.ClaimAllRewardsV2Reply.decode(claimBody);

            const allItems = [...(claimReply.items || []), ...(claimReply.bonus_items || [])];
            if (allItems.length > 0) {
                this.fc.addLog('每日奖励', `📖 图鉴奖励: ${this._getRewardSummary(allItems)}`);
                this._markDoneToday('illustrated');
                return true;
            }
            this._markDoneToday('illustrated');
            return false;
        } catch (e) {
            this._markDoneToday('illustrated');
            return false;
        }
    }

    // ========== 7. 点券购买化肥 ==========
    async buyOrganicFertilizer(force = false) {
        const COOLDOWN_MS = 10 * 60 * 1000; // 10分钟冷却
        const now = Date.now();
        
        if (!force && now - this.lastFertilizerBuyAt < COOLDOWN_MS) return 0;
        if (!force && this._isDoneToday('fertilizerBuy')) return 0;

        try {
            const reqBody = types.GetMallListBySlotTypeRequest.encode(
                types.GetMallListBySlotTypeRequest.create({ slot_type: 1 })
            ).finish();
            const { body: replyBody } = await this.fc.sendMsgAsync(
                'gamepb.mallpb.MallService', 'GetMallListBySlotType', reqBody
            );
            const reply = types.GetMallListBySlotTypeResponse.decode(replyBody);
            const goodsList = reply.goods_list || [];

            // 查找有机化肥商品 (goods_id = 1002)
            let fertilizerGoods = null;
            for (const goodsBytes of goodsList) {
                try {
                    const goods = types.MallGoods.decode(goodsBytes);
                    if (goods.goods_id === 1002) {
                        fertilizerGoods = goods;
                        break;
                    }
                } catch (e) { }
            }

            if (!fertilizerGoods) {
                this._markDoneToday('fertilizerBuy');
                return 0;
            }

            let totalBought = 0;
            const MAX_ROUNDS = 100;
            const BUY_PER_ROUND = 10;

            for (let i = 0; i < MAX_ROUNDS; i++) {
                try {
                    const purchaseReq = types.PurchaseRequest.encode(
                        types.PurchaseRequest.create({ goods_id: fertilizerGoods.goods_id, count: BUY_PER_ROUND })
                    ).finish();
                    await this.fc.sendMsgAsync('gamepb.mallpb.MallService', 'Purchase', purchaseReq);
                    totalBought += BUY_PER_ROUND;
                    await sleep(100);
                } catch (e) {
                    // 余额不足或其他错误
                    if (e.message.includes('余额不足') || e.message.includes('点券不足') || 
                        e.message.includes('1000019') || e.message.includes('不足')) {
                        break;
                    }
                    break;
                }
            }

            if (totalBought > 0) {
                this.fc.addLog('每日奖励', `🧪 点券购买有机化肥 ×${totalBought}`);
                this.lastFertilizerBuyAt = now;
            }
            
            return totalBought;
        } catch (e) {
            return 0;
        }
    }

    // ========== 8. 自动使用化肥礼包 ==========
    async useFertilizerGiftPacks(force = false) {
        if (!force && this._isDoneToday('fertilizerUse')) return 0;

        const FERTILIZER_GIFT_IDS = new Set([100003, 100004]); // 化肥礼包ID
        const FERTILIZER_ITEM_IDS = new Map([
            [80001, { type: 'normal', hours: 1 }],
            [80002, { type: 'normal', hours: 4 }],
            [80003, { type: 'normal', hours: 8 }],
            [80004, { type: 'normal', hours: 12 }],
            [80011, { type: 'organic', hours: 1 }],
            [80012, { type: 'organic', hours: 4 }],
            [80013, { type: 'organic', hours: 8 }],
            [80014, { type: 'organic', hours: 12 }],
        ]);
        const CONTAINER_LIMIT_HOURS = 990;
        const NORMAL_CONTAINER_ID = 1011;
        const ORGANIC_CONTAINER_ID = 1012;

        try {
            // 获取背包
            const bagReq = types.BagRequest.encode(types.BagRequest.create({})).finish();
            const { body: bagBody } = await this.fc.sendMsgAsync(
                'gamepb.itempb.ItemService', 'Bag', bagReq
            );
            const bagReply = types.BagReply.decode(bagBody);
            const items = bagReply.item_bag?.items || bagReply.items || [];

            // 获取当前容器时长
            let normalSec = 0, organicSec = 0;
            for (const it of items) {
                const id = toNum(it.id);
                const count = toNum(it.count);
                if (id === NORMAL_CONTAINER_ID) normalSec = count;
                if (id === ORGANIC_CONTAINER_ID) organicSec = count;
            }
            const containerHours = {
                normal: normalSec / 3600,
                organic: organicSec / 3600,
            };

            // 收集可使用的化肥道具
            const toUse = [];
            for (const it of items) {
                const id = toNum(it.id);
                const count = toNum(it.count);
                if (count <= 0) continue;
                
                // 先使用化肥礼包
                if (FERTILIZER_GIFT_IDS.has(id)) {
                    toUse.push({ id, count, isGift: true });
                }
                // 使用化肥道具
                else if (FERTILIZER_ITEM_IDS.has(id)) {
                    const info = FERTILIZER_ITEM_IDS.get(id);
                    const currentHours = info.type === 'normal' ? containerHours.normal : containerHours.organic;
                    if (currentHours < CONTAINER_LIMIT_HOURS) {
                        const remainHours = CONTAINER_LIMIT_HOURS - currentHours;
                        const maxCount = Math.floor(remainHours / info.hours);
                        const useCount = Math.min(count, maxCount);
                        if (useCount > 0) {
                            toUse.push({ id, count: useCount, isGift: false, type: info.type, hours: info.hours });
                        }
                    }
                }
            }

            if (toUse.length === 0) {
                this._markDoneToday('fertilizerUse');
                return 0;
            }

            let used = 0;
            for (const item of toUse) {
                try {
                    // 使用物品
                    const useReq = types.UseRequest.encode(
                        types.UseRequest.create({ item_id: toLong(item.id), count: toLong(item.count) })
                    ).finish();
                    await this.fc.sendMsgAsync('gamepb.itempb.ItemService', 'Use', useReq);
                    used += item.count;
                    
                    // 更新容器计数
                    if (!item.isGift && item.type && item.hours) {
                        if (item.type === 'normal') containerHours.normal += item.count * item.hours;
                        else containerHours.organic += item.count * item.hours;
                    }
                } catch (e) {
                    // 容器已满
                    if (e.message.includes('1003002') || e.message.includes('上限')) {
                        continue;
                    }
                }
                await sleep(100);
            }

            if (used > 0) {
                this.fc.addLog('每日奖励', `🧴 使用化肥道具 ×${used}`);
            }
            this._markDoneToday('fertilizerUse');
            return used;
        } catch (e) {
            this._markDoneToday('fertilizerUse');
            return 0;
        }
    }

    /**
     * 获取每日奖励状态
     */
    getStatus() {
        return {
            dailyRewardState: { ...this.dailyRewardState },
            toggles: { ...this.toggles },
            lastFertilizerBuyAt: this.lastFertilizerBuyAt,
        };
    }
}

module.exports = DailyRewards;
