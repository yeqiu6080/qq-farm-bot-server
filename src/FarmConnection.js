/**
 * 农场连接类
 * 封装单个账号的WebSocket连接和游戏操作
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const { CONFIG, PlantPhase, PHASE_NAMES } = require('./config');
const { types } = require('./proto');
const { toLong, toNum, syncServerTime, sleep, log, logWarn } = require('./utils');
const { getPlantNameBySeedId, getPlantName, getPlantExp, getItemName } = require('./gameConfig');

class FarmConnection extends EventEmitter {
    constructor(account) {
        super();
        this.account = account;
        this.id = account.id;
        this.ws = null;
        this.clientSeq = 1;
        this.serverSeq = 0;
        this.heartbeatTimer = null;
        this.pendingCallbacks = new Map();
        
        // 用户状态
        this.userState = {
            gid: 0,
            name: '',
            level: 0,
            gold: 0,
            exp: 0,
        };

        // 运行状态
        this.isRunning = false;
        this.isConnected = false;
        this.connectionState = 'disconnected'; // disconnected, connecting, connected, reconnecting, error
        this.lastPingTime = 0;
        this.lastPongTime = 0;
        this.disconnectedAt = null;
        this.disconnectedReason = null;
        this.farmCheckTimer = null;
        this.friendCheckTimer = null;
        this.sellTimer = null;
        this.taskTimer = null;
        this.connectionMonitorTimer = null;

        // 统计数据
        this.stats = {
            harvests: 0,
            steals: 0,
            helps: 0,
            sells: 0,
            tasks: 0,
            startTime: null
        };

        // 日志
        this.logs = [];

        // 操作限制
        this.operationLimits = new Map();
        
        // 配置
        this.config = {
            farmCheckInterval: (account.config?.farmCheckInterval || 10) * 1000,
            friendCheckInterval: (account.config?.friendCheckInterval || 10) * 1000,
            forceLowestLevelCrop: account.config?.forceLowestLevelCrop || false,
            enableFriendHelp: account.config?.enableFriendHelp !== false,
            enableSteal: account.config?.enableSteal !== false,
            enableSell: account.config?.enableSell !== false,
            enableTask: account.config?.enableTask !== false,
        };
    }

    addLog(tag, message) {
        const entry = {
            time: new Date().toISOString(),
            tag,
            message
        };
        this.logs.push(entry);
        if (this.logs.length > 500) {
            this.logs.shift();
        }
        this.emit('log', entry);
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.connectionState = 'connecting';
            const url = `${CONFIG.serverUrl}?platform=${this.account.platform}&os=${CONFIG.os}&ver=${CONFIG.clientVersion}&code=${this.account.code}&openID=`;

            this.ws = new WebSocket(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13)',
                    'Origin': 'https://gate-obt.nqf.qq.com',
                },
            });

            this.ws.binaryType = 'arraybuffer';

            this.ws.on('open', () => {
                this.isConnected = true;
                this.connectionState = 'connected';
                this.disconnectedAt = null;
                this.disconnectedReason = null;
                this.lastPingTime = Date.now();
                this.lastPongTime = Date.now();
                this.addLog('连接', 'WebSocket已连接');
                this.startConnectionMonitor();
                this.sendLogin(resolve, reject);
            });

            this.ws.on('message', (data) => {
                this.lastPongTime = Date.now();
                this.handleMessage(Buffer.isBuffer(data) ? data : Buffer.from(data));
            });

            this.ws.on('close', (code, reason) => {
                this.isConnected = false;
                this.connectionState = 'disconnected';
                this.disconnectedAt = new Date().toISOString();
                this.disconnectedReason = `连接关闭 (code=${code})`;
                this.addLog('连接', this.disconnectedReason);
                this.cleanup();
                this.emit('disconnected', { code, reason, time: this.disconnectedAt });
            });

            this.ws.on('error', (err) => {
                this.connectionState = 'error';
                this.disconnectedReason = `WebSocket错误: ${err.message}`;
                this.addLog('错误', this.disconnectedReason);
                // 只有在连接尚未成功时才 reject，避免重复 reject
                if (!this.isConnected) {
                    reject(err);
                }
            });

            // 连接超时
            setTimeout(() => {
                if (!this.isConnected) {
                    this.connectionState = 'error';
                    reject(new Error('连接超时'));
                }
            }, 30000);
        });
    }

    /**
     * 启动连接状态监控
     */
    startConnectionMonitor() {
        if (this.connectionMonitorTimer) {
            clearInterval(this.connectionMonitorTimer);
        }
        
        // 每10秒检查一次连接状态
        this.connectionMonitorTimer = setInterval(() => {
            if (!this.isRunning || !this.isConnected) {
                return;
            }

            const now = Date.now();
            const lastPongAgo = now - this.lastPongTime;
            
            // 如果超过60秒没有收到消息，认为连接已断开
            if (lastPongAgo > 60000) {
                this.addLog('连接', `连接疑似断开，${Math.floor(lastPongAgo / 1000)}秒未收到响应`);
                this.connectionState = 'error';
                this.disconnectedAt = new Date().toISOString();
                this.disconnectedReason = '连接超时，长时间未收到服务器响应';
                
                // 触发断开事件
                this.emit('connectionLost', {
                    reason: this.disconnectedReason,
                    lastPongTime: this.lastPongTime,
                    disconnectedAt: this.disconnectedAt
                });
                
                // 关闭连接，触发重连逻辑
                if (this.ws) {
                    this.ws.terminate();
                }
            }
        }, 10000);
    }

    sendMsg(serviceName, methodName, bodyBytes, callback) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return false;
        }
        const seq = this.clientSeq;
        const msg = types.GateMessage.create({
            meta: {
                service_name: serviceName,
                method_name: methodName,
                message_type: 1,
                client_seq: toLong(seq),
                server_seq: toLong(this.serverSeq),
            },
            body: bodyBytes || Buffer.alloc(0),
        });
        const encoded = types.GateMessage.encode(msg).finish();
        
        if (callback) this.pendingCallbacks.set(seq, callback);
        this.ws.send(encoded);
        this.clientSeq++;
        return true;
    }

    sendMsgAsync(serviceName, methodName, bodyBytes, timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                // 记录连接断开错误
                if (this.isRunning && this.connectionState === 'connected') {
                    this.connectionState = 'error';
                    this.disconnectedAt = new Date().toISOString();
                    this.disconnectedReason = `连接未打开: ${methodName}`;
                }
                reject(new Error('连接未打开'));
                return;
            }

            const timer = setTimeout(() => {
                reject(new Error(`请求超时: ${methodName}`));
            }, timeout);

            const sent = this.sendMsg(serviceName, methodName, bodyBytes, (err, body, meta) => {
                clearTimeout(timer);
                if (err) reject(err);
                else resolve({ body, meta });
            });

            if (!sent) {
                clearTimeout(timer);
                reject(new Error(`发送失败: ${methodName}`));
            }
        });
    }

    handleMessage(data) {
        try {
            const msg = types.GateMessage.decode(data);
            const meta = msg.meta;
            if (!meta) return;

            if (meta.server_seq) {
                const seq = toNum(meta.server_seq);
                if (seq > this.serverSeq) this.serverSeq = seq;
            }

            const msgType = meta.message_type;

            if (msgType === 3) {
                this.handleNotify(msg);
                return;
            }

            if (msgType === 2) {
                const errorCode = toNum(meta.error_code);
                const clientSeqVal = toNum(meta.client_seq);

                const cb = this.pendingCallbacks.get(clientSeqVal);
                if (cb) {
                    this.pendingCallbacks.delete(clientSeqVal);
                    if (errorCode !== 0) {
                        cb(new Error(`${meta.service_name}.${meta.method_name} 错误: code=${errorCode}`));
                    } else {
                        cb(null, msg.body, meta);
                    }
                    return;
                }
            }
        } catch (err) {
            // 忽略解码错误
        }
    }

    handleNotify(msg) {
        if (!msg.body || msg.body.length === 0) return;
        try {
            const event = types.EventMessage.decode(msg.body);
            const type = event.message_type || '';
            const eventBody = event.body;

            if (type.includes('Kickout')) {
                this.addLog('系统', '被踢下线');
                this.stop();
                return;
            }

            if (type.includes('LandsNotify')) {
                const notify = types.LandsNotify.decode(eventBody);
                if (toNum(notify.host_gid) === this.userState.gid) {
                    this.emit('landsChanged', notify.lands);
                }
                return;
            }

            if (type.includes('BasicNotify')) {
                const notify = types.BasicNotify.decode(eventBody);
                if (notify.basic) {
                    const oldLevel = this.userState.level;
                    this.userState.level = toNum(notify.basic.level) || this.userState.level;
                    this.userState.gold = toNum(notify.basic.gold) || this.userState.gold;
                    this.userState.exp = toNum(notify.basic.exp) || this.userState.exp;
                    
                    if (this.userState.level !== oldLevel) {
                        this.addLog('升级', `Lv${oldLevel} → Lv${this.userState.level}`);
                    }
                    this.emit('stateChanged', { ...this.userState });
                }
                return;
            }

            if (type.includes('ItemNotify')) {
                const notify = types.ItemNotify.decode(eventBody);
                const items = notify.items || [];
                for (const chg of items) {
                    if (!chg.item) continue;
                    const id = toNum(chg.item.id);
                    const count = toNum(chg.item.count);
                    if (id === 1 || id === 1001) {
                        this.userState.gold = count;
                        this.emit('stateChanged', { ...this.userState });
                    }
                }
                return;
            }
        } catch (e) {}
    }

    sendLogin(resolve, reject) {
        const body = types.LoginRequest.encode(types.LoginRequest.create({
            sharer_id: toLong(0),
            sharer_open_id: '',
            device_info: CONFIG.device_info,
            share_cfg_id: toLong(0),
            scene_id: '1256',
            report_data: {
                callback: '', cd_extend_info: '', click_id: '', clue_token: '',
                minigame_channel: 'other', minigame_platid: 2, req_id: '', trackid: '',
            },
        })).finish();

        this.sendMsg('gamepb.userpb.UserService', 'Login', body, (err, bodyBytes) => {
            if (err) {
                reject(err);
                return;
            }
            try {
                const reply = types.LoginReply.decode(bodyBytes);
                if (reply.basic) {
                    this.userState.gid = toNum(reply.basic.gid);
                    this.userState.name = reply.basic.name || '未知';
                    this.userState.level = toNum(reply.basic.level);
                    this.userState.gold = toNum(reply.basic.gold);
                    this.userState.exp = toNum(reply.basic.exp);

                    if (reply.time_now_millis) {
                        syncServerTime(toNum(reply.time_now_millis));
                    }

                    this.addLog('登录', `成功 - ${this.userState.name} Lv${this.userState.level}`);
                    this.startHeartbeat();
                    this.isRunning = true;
                    this.stats.startTime = new Date().toISOString();
                    
                    // 启动各功能循环
                    this.startFarmCheckLoop();
                    this.startFriendCheckLoop();
                    if (this.config.enableSell) {
                        this.startSellLoop();
                    }
                    if (this.config.enableTask) {
                        this.startTaskLoop();
                    }

                    this.emit('connected', { ...this.userState });
                    resolve({ ...this.userState });
                } else {
                    reject(new Error('登录响应中没有用户信息，可能是登录码已过期'));
                }
            } catch (e) {
                reject(e);
            }
        });
    }

    startHeartbeat() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        
        this.heartbeatTimer = setInterval(() => {
            if (!this.userState.gid) return;
            
            const body = types.HeartbeatRequest.encode(types.HeartbeatRequest.create({
                gid: toLong(this.userState.gid),
                client_version: CONFIG.clientVersion,
            })).finish();
            
            this.sendMsg('gamepb.userpb.UserService', 'Heartbeat', body, (err, replyBody) => {
                if (!err && replyBody) {
                    try {
                        const reply = types.HeartbeatReply.decode(replyBody);
                        if (reply.server_time) syncServerTime(toNum(reply.server_time));
                    } catch (e) {}
                }
            });
        }, CONFIG.heartbeatInterval);
    }

    // ========== 农场操作 ==========

    async getAllLands() {
        const body = types.AllLandsRequest.encode(types.AllLandsRequest.create({})).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'AllLands', body);
        const reply = types.AllLandsReply.decode(replyBody);
        if (reply.operation_limits) {
            this.updateOperationLimits(reply.operation_limits);
        }
        return reply;
    }

    async harvest(landIds) {
        const body = types.HarvestRequest.encode(types.HarvestRequest.create({
            land_ids: landIds,
            host_gid: toLong(this.userState.gid),
            is_all: true,
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'Harvest', body);
        return types.HarvestReply.decode(replyBody);
    }

    async waterLand(landIds) {
        const body = types.WaterLandRequest.encode(types.WaterLandRequest.create({
            land_ids: landIds,
            host_gid: toLong(this.userState.gid),
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'WaterLand', body);
        return types.WaterLandReply.decode(replyBody);
    }

    async weedOut(landIds) {
        const body = types.WeedOutRequest.encode(types.WeedOutRequest.create({
            land_ids: landIds,
            host_gid: toLong(this.userState.gid),
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'WeedOut', body);
        return types.WeedOutReply.decode(replyBody);
    }

    async insecticide(landIds) {
        const body = types.InsecticideRequest.encode(types.InsecticideRequest.create({
            land_ids: landIds,
            host_gid: toLong(this.userState.gid),
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'Insecticide', body);
        return types.InsecticideReply.decode(replyBody);
    }

    async fertilize(landIds, fertilizerId = 1011) {
        let successCount = 0;
        for (const landId of landIds) {
            try {
                const body = types.FertilizeRequest.encode(types.FertilizeRequest.create({
                    land_ids: [toLong(landId)],
                    fertilizer_id: toLong(fertilizerId),
                })).finish();
                await this.sendMsgAsync('gamepb.plantpb.PlantService', 'Fertilize', body);
                successCount++;
            } catch (e) {
                break;
            }
            if (landIds.length > 1) await sleep(50);
        }
        return successCount;
    }

    async removePlant(landIds) {
        const body = types.RemovePlantRequest.encode(types.RemovePlantRequest.create({
            land_ids: landIds.map(id => toLong(id)),
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'RemovePlant', body);
        return types.RemovePlantReply.decode(replyBody);
    }

    async getShopInfo(shopId) {
        const body = types.ShopInfoRequest.encode(types.ShopInfoRequest.create({
            shop_id: toLong(shopId),
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.shoppb.ShopService', 'ShopInfo', body);
        return types.ShopInfoReply.decode(replyBody);
    }

    async buyGoods(goodsId, num, price) {
        const body = types.BuyGoodsRequest.encode(types.BuyGoodsRequest.create({
            goods_id: toLong(goodsId),
            num: toLong(num),
            price: toLong(price),
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.shoppb.ShopService', 'BuyGoods', body);
        return types.BuyGoodsReply.decode(replyBody);
    }

    async plantSeeds(seedId, landIds) {
        let successCount = 0;
        for (const landId of landIds) {
            try {
                const writer = require('protobufjs').Writer.create();
                const itemWriter = writer.uint32(18).fork();
                itemWriter.uint32(8).int64(seedId);
                const idsWriter = itemWriter.uint32(18).fork();
                idsWriter.int64(landId);
                idsWriter.ldelim();
                itemWriter.ldelim();
                const body = writer.finish();
                
                await this.sendMsgAsync('gamepb.plantpb.PlantService', 'Plant', body);
                successCount++;
            } catch (e) {}
            if (landIds.length > 1) await sleep(50);
        }
        return successCount;
    }

    updateOperationLimits(limits) {
        if (!limits) return;
        for (const limit of limits) {
            const id = toNum(limit.id);
            if (id > 0) {
                this.operationLimits.set(id, {
                    dayTimes: toNum(limit.day_times),
                    dayTimesLimit: toNum(limit.day_times_lt),
                    dayExpTimes: toNum(limit.day_exp_times),
                    dayExpTimesLimit: toNum(limit.day_ex_times_lt),
                });
            }
        }
    }

    // ========== 农场检查循环 ==========

    async startFarmCheckLoop() {
        while (this.isRunning) {
            try {
                await this.checkFarm();
            } catch (e) {
                this.addLog('农场', `检查失败: ${e.message}`);
            }
            await sleep(this.config.farmCheckInterval);
        }
    }

    async checkFarm() {
        const landsReply = await this.getAllLands();
        if (!landsReply.lands || landsReply.lands.length === 0) return;

        const lands = landsReply.lands;
        const status = this.analyzeLands(lands);
        const unlockedLandCount = lands.filter(land => land && land.unlocked).length;

        const actions = [];

        // 批量操作
        const batchOps = [];
        if (status.needWeed.length > 0) {
            batchOps.push(this.weedOut(status.needWeed).then(() => actions.push(`除草${status.needWeed.length}`)));
        }
        if (status.needBug.length > 0) {
            batchOps.push(this.insecticide(status.needBug).then(() => actions.push(`除虫${status.needBug.length}`)));
        }
        if (status.needWater.length > 0) {
            batchOps.push(this.waterLand(status.needWater).then(() => actions.push(`浇水${status.needWater.length}`)));
        }
        if (batchOps.length > 0) {
            await Promise.all(batchOps);
        }

        // 收获
        let harvestedLandIds = [];
        if (status.harvestable.length > 0) {
            try {
                await this.harvest(status.harvestable);
                actions.push(`收获${status.harvestable.length}`);
                harvestedLandIds = [...status.harvestable];
                this.stats.harvests += status.harvestable.length;
            } catch (e) {}
        }

        // 铲除+种植
        const allDeadLands = [...status.dead, ...harvestedLandIds];
        const allEmptyLands = [...status.empty];
        if (allDeadLands.length > 0 || allEmptyLands.length > 0) {
            await this.autoPlantEmptyLands(allDeadLands, allEmptyLands, unlockedLandCount);
            actions.push(`种植${allDeadLands.length + allEmptyLands.length}`);
        }

        if (actions.length > 0) {
            this.addLog('农场', actions.join('/'));
            this.emit('statsChanged', { ...this.stats });
        }
    }

    analyzeLands(lands) {
        const result = {
            harvestable: [], needWater: [], needWeed: [], needBug: [],
            growing: [], empty: [], dead: [],
        };

        const { getServerTimeSec, toTimeSec, toNum } = require('./utils');
        const nowSec = getServerTimeSec();

        for (const land of lands) {
            const id = toNum(land.id);
            if (!land.unlocked) continue;

            const plant = land.plant;
            if (!plant || !plant.phases || plant.phases.length === 0) {
                result.empty.push(id);
                continue;
            }

            let currentPhase = null;
            for (let i = plant.phases.length - 1; i >= 0; i--) {
                const beginTime = toTimeSec(plant.phases[i].begin_time);
                if (beginTime > 0 && beginTime <= nowSec) {
                    currentPhase = plant.phases[i];
                    break;
                }
            }
            if (!currentPhase) currentPhase = plant.phases[0];
            if (!currentPhase) continue;

            const phaseVal = currentPhase.phase;

            if (phaseVal === PlantPhase.DEAD) {
                result.dead.push(id);
                continue;
            }

            if (phaseVal === PlantPhase.MATURE) {
                result.harvestable.push(id);
                continue;
            }

            const dryNum = toNum(plant.dry_num);
            const dryTime = toTimeSec(currentPhase.dry_time);
            if (dryNum > 0 || (dryTime > 0 && dryTime <= nowSec)) {
                result.needWater.push(id);
            }

            const weedsTime = toTimeSec(currentPhase.weeds_time);
            if ((plant.weed_owners && plant.weed_owners.length > 0) || (weedsTime > 0 && weedsTime <= nowSec)) {
                result.needWeed.push(id);
            }

            const insectTime = toTimeSec(currentPhase.insect_time);
            if ((plant.insect_owners && plant.insect_owners.length > 0) || (insectTime > 0 && insectTime <= nowSec)) {
                result.needBug.push(id);
            }

            result.growing.push(id);
        }

        return result;
    }

    async autoPlantEmptyLands(deadLandIds, emptyLandIds, unlockedLandCount) {
        let landsToPlant = [...emptyLandIds];
        
        if (deadLandIds.length > 0) {
            try {
                await this.removePlant(deadLandIds);
                landsToPlant.push(...deadLandIds);
            } catch (e) {}
        }

        if (landsToPlant.length === 0) return;

        // 简化版种子选择 - 选择最低等级种子
        const SEED_SHOP_ID = 2;
        try {
            const shopReply = await this.getShopInfo(SEED_SHOP_ID);
            if (!shopReply.goods_list || shopReply.goods_list.length === 0) return;

            const available = [];
            for (const goods of shopReply.goods_list) {
                if (!goods.unlocked) continue;
                
                let requiredLevel = 0;
                const conds = goods.conds || [];
                let meetsConditions = true;
                for (const cond of conds) {
                    if (toNum(cond.type) === 1) {
                        requiredLevel = toNum(cond.param);
                        if (this.userState.level < requiredLevel) {
                            meetsConditions = false;
                            break;
                        }
                    }
                }
                if (!meetsConditions) continue;

                const limitCount = toNum(goods.limit_count);
                const boughtNum = toNum(goods.bought_num);
                if (limitCount > 0 && boughtNum >= limitCount) continue;

                available.push({
                    goods,
                    goodsId: toNum(goods.id),
                    seedId: toNum(goods.item_id),
                    price: toNum(goods.price),
                    requiredLevel,
                });
            }

            if (available.length === 0) return;

            // 选择策略
            if (this.config.forceLowestLevelCrop || this.userState.level <= 28) {
                available.sort((a, b) => a.requiredLevel - b.requiredLevel);
            } else {
                available.sort((a, b) => b.requiredLevel - a.requiredLevel);
            }
            
            const bestSeed = available[0];
            const seedName = getPlantNameBySeedId(bestSeed.seedId);

            // 购买
            const totalCost = bestSeed.price * landsToPlant.length;
            if (totalCost > this.userState.gold) {
                const canBuy = Math.floor(this.userState.gold / bestSeed.price);
                if (canBuy <= 0) return;
                landsToPlant = landsToPlant.slice(0, canBuy);
            }

            let actualSeedId = bestSeed.seedId;
            try {
                const buyReply = await this.buyGoods(bestSeed.goodsId, landsToPlant.length, bestSeed.price);
                if (buyReply.get_items && buyReply.get_items.length > 0) {
                    actualSeedId = toNum(buyReply.get_items[0].id);
                }
                if (buyReply.cost_items) {
                    for (const item of buyReply.cost_items) {
                        this.userState.gold -= toNum(item.count);
                    }
                }
            } catch (e) {
                return;
            }

            // 种植
            const planted = await this.plantSeeds(actualSeedId, landsToPlant);
            
            // 施肥
            if (planted > 0) {
                await this.fertilize(landsToPlant.slice(0, planted));
            }
        } catch (e) {}
    }

    // ========== 好友操作 ==========

    async startFriendCheckLoop() {
        while (this.isRunning) {
            try {
                await this.checkFriends();
            } catch (e) {}
            await sleep(this.config.friendCheckInterval);
        }
    }

    async checkFriends() {
        if (!this.config.enableFriendHelp && !this.config.enableSteal) return;

        const body = types.GetAllFriendsRequest.encode(types.GetAllFriendsRequest.create({})).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.friendpb.FriendService', 'GetAll', body);
        const friendsReply = types.GetAllFriendsReply.decode(replyBody);
        
        const friends = friendsReply.game_friends || [];
        if (friends.length === 0) return;

        let totalSteal = 0;
        let totalHelp = 0;

        for (const friend of friends) {
            const gid = toNum(friend.gid);
            if (gid === this.userState.gid) continue;

            const name = friend.remark || friend.name || `GID:${gid}`;
            const p = friend.plant;

            const stealNum = p ? toNum(p.steal_plant_num) : 0;
            const dryNum = p ? toNum(p.dry_num) : 0;
            const weedNum = p ? toNum(p.weed_num) : 0;
            const insectNum = p ? toNum(p.insect_num) : 0;

            const hasSteal = stealNum > 0;
            const hasHelp = dryNum > 0 || weedNum > 0 || insectNum > 0;

            if (!hasSteal && !hasHelp) continue;

            try {
                const enterBody = types.VisitEnterRequest.encode(types.VisitEnterRequest.create({
                    host_gid: toLong(gid),
                    reason: 2,
                })).finish();
                const { body: enterReplyBody } = await this.sendMsgAsync('gamepb.visitpb.VisitService', 'Enter', enterBody);
                const enterReply = types.VisitEnterReply.decode(enterReplyBody);

                const lands = enterReply.lands || [];
                if (lands.length === 0) {
                    await this.leaveFriendFarm(gid);
                    continue;
                }

                // 分析好友土地
                const stealable = [];
                const needWater = [];
                const needWeed = [];
                const needBug = [];

                for (const land of lands) {
                    const id = toNum(land.id);
                    const plant = land.plant;
                    if (!plant || !plant.phases || plant.phases.length === 0) continue;

                    const nowSec = require('./utils').getServerTimeSec();
                    let currentPhase = null;
                    for (let i = plant.phases.length - 1; i >= 0; i--) {
                        const beginTime = require('./utils').toTimeSec(plant.phases[i].begin_time);
                        if (beginTime > 0 && beginTime <= nowSec) {
                            currentPhase = plant.phases[i];
                            break;
                        }
                    }
                    if (!currentPhase) continue;

                    if (currentPhase.phase === PlantPhase.MATURE && plant.stealable) {
                        stealable.push(id);
                    }
                    if (toNum(plant.dry_num) > 0) needWater.push(id);
                    if (plant.weed_owners && plant.weed_owners.length > 0) needWeed.push(id);
                    if (plant.insect_owners && plant.insect_owners.length > 0) needBug.push(id);
                }

                const actions = [];

                // 帮助操作
                if (this.config.enableFriendHelp) {
                    if (needWeed.length > 0) {
                        try {
                            await this.helpWeed(gid, needWeed);
                            actions.push(`除草${needWeed.length}`);
                            totalHelp += needWeed.length;
                        } catch (e) {}
                    }
                    if (needBug.length > 0) {
                        try {
                            await this.helpInsecticide(gid, needBug);
                            actions.push(`除虫${needBug.length}`);
                            totalHelp += needBug.length;
                        } catch (e) {}
                    }
                    if (needWater.length > 0) {
                        try {
                            await this.helpWater(gid, needWater);
                            actions.push(`浇水${needWater.length}`);
                            totalHelp += needWater.length;
                        } catch (e) {}
                    }
                }

                // 偷菜
                if (this.config.enableSteal && stealable.length > 0) {
                    try {
                        await this.stealHarvest(gid, stealable);
                        actions.push(`偷${stealable.length}`);
                        totalSteal += stealable.length;
                        this.stats.steals += stealable.length;
                    } catch (e) {}
                }

                if (actions.length > 0) {
                    this.addLog('好友', `${name}: ${actions.join('/')}`);
                }

                await this.leaveFriendFarm(gid);
                await sleep(500);
            } catch (e) {}
        }

        if (totalSteal > 0 || totalHelp > 0) {
            this.emit('statsChanged', { ...this.stats });
        }
    }

    async leaveFriendFarm(friendGid) {
        const body = types.VisitLeaveRequest.encode(types.VisitLeaveRequest.create({
            host_gid: toLong(friendGid),
        })).finish();
        try {
            await this.sendMsgAsync('gamepb.visitpb.VisitService', 'Leave', body);
        } catch (e) {}
    }

    async helpWater(friendGid, landIds) {
        const body = types.WaterLandRequest.encode(types.WaterLandRequest.create({
            land_ids: landIds,
            host_gid: toLong(friendGid),
        })).finish();
        await this.sendMsgAsync('gamepb.plantpb.PlantService', 'WaterLand', body);
    }

    async helpWeed(friendGid, landIds) {
        const body = types.WeedOutRequest.encode(types.WeedOutRequest.create({
            land_ids: landIds,
            host_gid: toLong(friendGid),
        })).finish();
        await this.sendMsgAsync('gamepb.plantpb.PlantService', 'WeedOut', body);
    }

    async helpInsecticide(friendGid, landIds) {
        const body = types.InsecticideRequest.encode(types.InsecticideRequest.create({
            land_ids: landIds,
            host_gid: toLong(friendGid),
        })).finish();
        await this.sendMsgAsync('gamepb.plantpb.PlantService', 'Insecticide', body);
    }

    async stealHarvest(friendGid, landIds) {
        const body = types.HarvestRequest.encode(types.HarvestRequest.create({
            land_ids: landIds,
            host_gid: toLong(friendGid),
            is_all: true,
        })).finish();
        await this.sendMsgAsync('gamepb.plantpb.PlantService', 'Harvest', body);
    }

    // ========== 仓库操作 ==========

    async startSellLoop() {
        // 先执行一次
        await sleep(5000);
        await this.sellFruits();
        
        // 定时执行
        this.sellTimer = setInterval(async () => {
            if (this.isRunning) {
                await this.sellFruits();
            }
        }, 60000);
    }

    async sellFruits() {
        try {
            const body = types.BagRequest.encode(types.BagRequest.create({})).finish();
            const { body: replyBody } = await this.sendMsgAsync('gamepb.itempb.ItemService', 'Bag', body);
            const bagReply = types.BagReply.decode(replyBody);

            const items = bagReply.items || [];
            const fruitsToSell = [];

            for (const item of items) {
                const id = toNum(item.id);
                const count = toNum(item.count);
                // 果实ID范围
                if (id >= 1030000 && id < 1040000 && count > 0) {
                    fruitsToSell.push({ id, count });
                }
            }

            if (fruitsToSell.length === 0) return;

            let totalSold = 0;
            let totalGold = 0;

            for (const fruit of fruitsToSell) {
                try {
                    const sellBody = types.SellRequest.encode(types.SellRequest.create({
                        item_id: toLong(fruit.id),
                        count: toLong(fruit.count),
                    })).finish();
                    const { body: sellReplyBody } = await this.sendMsgAsync('gamepb.itempb.ItemService', 'Sell', sellBody);
                    const sellReply = types.SellReply.decode(sellReplyBody);
                    
                    if (sellReply.gold) {
                        totalSold += fruit.count;
                        totalGold += toNum(sellReply.gold);
                    }
                } catch (e) {}
            }

            if (totalSold > 0) {
                this.addLog('仓库', `出售 ${totalSold} 个果实，获得 ${totalGold} 金币`);
                this.stats.sells += totalSold;
                this.emit('statsChanged', { ...this.stats });
            }
        } catch (e) {}
    }

    // ========== 任务操作 ==========

    async startTaskLoop() {
        await sleep(10000);
        await this.claimTasks();
        
        this.taskTimer = setInterval(async () => {
            if (this.isRunning) {
                await this.claimTasks();
            }
        }, 300000); // 5分钟检查一次
    }

    async claimTasks() {
        try {
            const body = types.TaskInfoRequest.encode(types.TaskInfoRequest.create({})).finish();
            const { body: replyBody } = await this.sendMsgAsync('gamepb.taskpb.TaskService', 'TaskInfo', body);
            const taskReply = types.TaskInfoReply.decode(replyBody);

            const tasks = taskReply.tasks || [];
            const completableTasks = tasks.filter(t => t.status === 2); // 2 = 可领取

            if (completableTasks.length === 0) return;

            const taskIds = completableTasks.map(t => toNum(t.id));
            
            const claimBody = types.BatchClaimTaskRewardRequest.encode(types.BatchClaimTaskRewardRequest.create({
                task_ids: taskIds.map(id => toLong(id)),
            })).finish();
            
            await this.sendMsgAsync('gamepb.taskpb.TaskService', 'BatchClaimTaskReward', claimBody);
            
            this.addLog('任务', `领取 ${completableTasks.length} 个任务奖励`);
            this.stats.tasks += completableTasks.length;
            this.emit('statsChanged', { ...this.stats });
        } catch (e) {}
    }

    // ========== 停止和清理 ==========

    async stop() {
        this.isRunning = false;
        this.cleanup();
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.addLog('系统', '已停止');
        this.emit('stopped');
    }

    cleanup() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.sellTimer) {
            clearInterval(this.sellTimer);
            this.sellTimer = null;
        }
        if (this.taskTimer) {
            clearInterval(this.taskTimer);
            this.taskTimer = null;
        }
        if (this.connectionMonitorTimer) {
            clearInterval(this.connectionMonitorTimer);
            this.connectionMonitorTimer = null;
        }
        this.pendingCallbacks.clear();
    }

    // ========== 获取状态 ==========

    getStatus() {
        const now = Date.now();
        const lastPongAgo = this.lastPongTime ? now - this.lastPongTime : null;
        
        return {
            id: this.id,
            isRunning: this.isRunning,
            isConnected: this.isConnected,
            connectionState: this.connectionState,
            disconnectedAt: this.disconnectedAt,
            disconnectedReason: this.disconnectedReason,
            lastPongTime: this.lastPongTime,
            lastPongAgo: lastPongAgo,
            userState: { ...this.userState },
            stats: { ...this.stats },
            config: { ...this.config }
        };
    }

    getLogs(limit = 100) {
        return this.logs.slice(-limit);
    }
}

module.exports = FarmConnection;
