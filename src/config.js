/**
 * 配置常量与枚举定义
 */

const CONFIG = {
    serverUrl: 'wss://gate-obt.nqf.qq.com/prod/ws',
    clientVersion: '1.6.0.14_20251224',
    platform: 'qq',
    os: 'iOS',
    heartbeatInterval: 25000,
    farmCheckInterval: 10000,
    friendCheckInterval: 10000,
    forceLowestLevelCrop: false,
    device_info: {
        client_version: "1.6.0.14_20251224",
        sys_software: 'iOS 26.2.1',
        network: 'wifi',
        memory: '7672',
        device_id: 'iPhone X<iPhone18,3>',
    }
};

// 生长阶段枚举
const PlantPhase = {
    UNKNOWN: 0,
    SEED: 1,
    GERMINATION: 2,
    SMALL_LEAVES: 3,
    LARGE_LEAVES: 4,
    BLOOMING: 5,
    MATURE: 6,
    DEAD: 7,
};

const PHASE_NAMES = ['未知', '种子', '发芽', '小叶', '大叶', '开花', '成熟', '枯死'];

module.exports = {
    CONFIG,
    PlantPhase,
    PHASE_NAMES,
};
