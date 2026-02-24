/**
 * 基于 tools/seed-shop-merged-export.json 计算经验收益率
 *
 * 规则：
 * 1) 每次收获经验 = exp（新版已去除铲地+1经验）
 * 2) 种植速度：
 *    - 不施肥：2 秒种 18 块地 => 9 块/秒
 *    - 普通肥：2 秒种 12 块地 => 6 块/秒
 * 3) 普通肥：直接减少一个生长阶段（按 Plant.json 的 grow_phases 取首个非0阶段时长）
 *
 * 运行时调用：
 *   const { getPlantingRecommendation } = require('../tools/calc-exp-yield');
 *   const rec = getPlantingRecommendation(27, 18);
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_INPUT = path.join(__dirname, 'seed-shop-merged-export.json');
const PLANT_CONFIG_PATH = path.join(__dirname, '..', 'gameConfig', 'Plant.json');

const NO_FERT_PLANTS_PER_2_SEC = 18;
const NORMAL_FERT_PLANTS_PER_2_SEC = 12;
const NO_FERT_PLANT_SPEED_PER_SEC = NO_FERT_PLANTS_PER_2_SEC / 2; // 9 块/秒
const NORMAL_FERT_PLANT_SPEED_PER_SEC = NORMAL_FERT_PLANTS_PER_2_SEC / 2; // 6 块/秒

function toNum(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function parseGrowPhases(growPhases) {
    if (!growPhases || typeof growPhases !== 'string') return [];
    return growPhases
        .split(';')
        .map(x => x.trim())
        .filter(Boolean)
        .map(seg => {
            const parts = seg.split(':');
            return parts.length >= 2 ? toNum(parts[1], 0) : 0;
        })
        .filter(sec => sec > 0);
}

function loadSeedPhaseReduceMap() {
    try {
        const text = fs.readFileSync(PLANT_CONFIG_PATH, 'utf8');
        const rows = JSON.parse(text);
        if (!Array.isArray(rows)) {
            return new Map();
        }

        const map = new Map();
        for (const p of rows) {
            const seedId = toNum(p.seed_id, 0);
            if (seedId <= 0 || map.has(seedId)) continue;
            const phases = parseGrowPhases(p.grow_phases);
            if (phases.length === 0) continue;
            map.set(seedId, phases[0]); // 普通肥减少一个阶段：以首个阶段时长为准
        }
        return map;
    } catch (e) {
        return new Map();
    }
}

function calcEffectiveGrowTime(growSec, seedId, seedPhaseReduceMap) {
    const reduce = toNum(seedPhaseReduceMap.get(seedId), 0);
    if (reduce <= 0) return growSec;
    return Math.max(1, growSec - reduce);
}

function formatSec(sec) {
    const s = Math.max(0, Math.round(sec));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m < 60) return r > 0 ? `${m}m${r}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return r > 0 ? `${h}h${mm}m${r}s` : `${h}h${mm}m`;
}

function readSeeds(inputPath) {
    const text = fs.readFileSync(inputPath, 'utf8');
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.rows)) return data.rows;
    if (data && Array.isArray(data.seeds)) return data.seeds;
    throw new Error('无法识别输入数据格式，需要数组或 rows/seeds 字段');
}

function buildRows(rawSeeds, lands, seedPhaseReduceMap) {
    const plantSecondsNoFert = lands / NO_FERT_PLANT_SPEED_PER_SEC;
    const plantSecondsNormalFert = lands / NORMAL_FERT_PLANT_SPEED_PER_SEC;
    const rows = [];
    let skipped = 0;
    let missingPhaseReduceCount = 0;

    for (const s of rawSeeds) {
        const seedId = toNum(s.seedId || s.seed_id);
        const name = s.name || `seed_${seedId}`;
        const requiredLevel = toNum(s.requiredLevel || s.required_level || 1, 1);
        const price = toNum(s.price, 0);
        const expHarvest = toNum(s.exp, 0);
        const growTimeSec = toNum(s.growTimeSec || s.growTime || s.grow_time || 0, 0);

        if (seedId <= 0 || growTimeSec <= 0) {
            skipped++;
            continue;
        }

        const expPerCycle = expHarvest;
        const reduceSec = toNum(seedPhaseReduceMap.get(seedId), 0);
        if (reduceSec <= 0) missingPhaseReduceCount++;
        const growTimeNormalFert = calcEffectiveGrowTime(growTimeSec, seedId, seedPhaseReduceMap);

        // 整个农场一轮 = 生长时间 + 本轮全部地块种植耗时
        const cycleSecNoFert = growTimeSec + plantSecondsNoFert;
        const cycleSecNormalFert = growTimeNormalFert + plantSecondsNormalFert;

        const farmExpPerHourNoFert = (lands * expPerCycle / cycleSecNoFert) * 3600;
        const farmExpPerHourNormalFert = (lands * expPerCycle / cycleSecNormalFert) * 3600;
        const gainPercent = farmExpPerHourNoFert > 0
            ? ((farmExpPerHourNormalFert - farmExpPerHourNoFert) / farmExpPerHourNoFert) * 100
            : 0;
        const expPerGoldSeed = price > 0 ? expPerCycle / price : 0;

        rows.push({
            seedId,
            goodsId: toNum(s.goodsId || s.goods_id),
            plantId: toNum(s.plantId || s.plant_id),
            name,
            requiredLevel,
            unlocked: !!s.unlocked,
            price,
            expHarvest,
            expPerCycle,
            growTimeSec,
            growTimeStr: s.growTimeStr || formatSec(growTimeSec),
            normalFertReduceSec: reduceSec,
            growTimeNormalFert,
            growTimeNormalFertStr: formatSec(growTimeNormalFert),
            cycleSecNoFert,
            cycleSecNormalFert,
            farmExpPerHourNoFert,
            farmExpPerHourNormalFert,
            farmExpPerDayNoFert: farmExpPerHourNoFert * 24,
            farmExpPerDayNormalFert: farmExpPerHourNormalFert * 24,
            gainPercent,
            expPerGoldSeed,
            fruitId: toNum(s?.fruit?.id || s.fruitId),
            fruitCount: toNum(s?.fruit?.count || s.fruitCount),
        });
    }

    return { rows, skipped, plantSecondsNoFert, plantSecondsNormalFert, missingPhaseReduceCount };
}

function pickTop(rows, key, topN) {
    return [...rows]
        .sort((a, b) => b[key] - a[key])
        .slice(0, topN);
}

function analyzeExpYield(opts = {}) {
    const lands = Math.max(1, Math.floor(toNum(opts.lands, 18)));
    const level = opts.level == null ? null : Math.max(1, Math.floor(toNum(opts.level, 1)));
    const top = Math.max(1, Math.floor(toNum(opts.top, 20)));
    const input = opts.input || DEFAULT_INPUT;
    
    let inputAbs;
    try {
        inputAbs = path.resolve(input);
    } catch (e) {
        // 如果路径解析失败，使用默认路径
        inputAbs = DEFAULT_INPUT;
    }
    
    let rawSeeds;
    try {
        rawSeeds = readSeeds(inputAbs);
    } catch (e) {
        // 如果读取失败，返回空结果
        return {
            generatedAt: new Date().toISOString(),
            input: inputAbs,
            config: { lands },
            stats: { rawCount: 0, calculatedCount: 0, skippedCount: 0 },
            topNoFert: [],
            topNormalFert: [],
            bestByLevel: [],
            currentLevel: null,
            rows: []
        };
    }
    
    const seedPhaseReduceMap = loadSeedPhaseReduceMap();
    const { rows, skipped, plantSecondsNoFert, plantSecondsNormalFert, missingPhaseReduceCount } = buildRows(rawSeeds, lands, seedPhaseReduceMap);

    if (rows.length === 0) {
        return {
            generatedAt: new Date().toISOString(),
            input: inputAbs,
            config: { lands },
            stats: { rawCount: rawSeeds.length, calculatedCount: 0, skippedCount: skipped },
            topNoFert: [],
            topNormalFert: [],
            bestByLevel: [],
            currentLevel: null,
            rows: []
        };
    }

    const topNo = pickTop(rows, 'farmExpPerHourNoFert', top);
    const topFert = pickTop(rows, 'farmExpPerHourNormalFert', top);

    let currentLevel = null;
    if (level != null) {
        const availableRows = rows.filter(r => r.requiredLevel <= level);
        const bestNoFertRow = pickTop(availableRows, 'farmExpPerHourNoFert', 1)[0] || null;
        const bestNormalFertRow = pickTop(availableRows, 'farmExpPerHourNormalFert', 1)[0] || null;
        
        currentLevel = {
            level,
            bestNoFert: bestNoFertRow ? {
                seedId: bestNoFertRow.seedId,
                name: bestNoFertRow.name,
                expPerHour: Number(bestNoFertRow.farmExpPerHourNoFert.toFixed(2)),
            } : null,
            bestNormalFert: bestNormalFertRow ? {
                seedId: bestNormalFertRow.seedId,
                name: bestNormalFertRow.name,
                expPerHour: Number(bestNormalFertRow.farmExpPerHourNormalFert.toFixed(2)),
            } : null,
        };
    }

    return {
        generatedAt: new Date().toISOString(),
        input: inputAbs,
        config: {
            lands,
            plantSpeedPerSecNoFert: NO_FERT_PLANT_SPEED_PER_SEC,
            plantSpeedPerSecNormalFert: NORMAL_FERT_PLANT_SPEED_PER_SEC,
            plantSecondsNoFert,
            plantSecondsNormalFert,
        },
        stats: {
            rawCount: rawSeeds.length,
            calculatedCount: rows.length,
            skippedCount: skipped,
            missingPhaseReduceCount,
        },
        topNoFert: topNo.map(r => ({
            seedId: r.seedId,
            name: r.name,
            requiredLevel: r.requiredLevel,
            expPerHour: Number(r.farmExpPerHourNoFert.toFixed(4)),
        })),
        topNormalFert: topFert.map(r => ({
            seedId: r.seedId,
            name: r.name,
            requiredLevel: r.requiredLevel,
            expPerHour: Number(r.farmExpPerHourNormalFert.toFixed(4)),
            gainPercent: Number(r.gainPercent.toFixed(4)),
        })),
        currentLevel,
        rows,
    };
}

function getPlantingRecommendation(level, lands, opts = {}) {
    const safeLevel = Math.max(1, Math.floor(toNum(level, 1)));
    const payload = analyzeExpYield({
        input: opts.input || DEFAULT_INPUT,
        lands: lands == null ? 18 : lands,
        top: opts.top || 20,
        level: safeLevel,
    });

    const availableRows = payload.rows.filter(r => r.requiredLevel <= safeLevel);
    const bestNoFertRow = pickTop(availableRows, 'farmExpPerHourNoFert', 1)[0] || null;
    const bestNormalFertRow = pickTop(availableRows, 'farmExpPerHourNormalFert', 1)[0] || null;

    return {
        level: safeLevel,
        lands: payload.config.lands,
        input: payload.input,
        bestNoFert: bestNoFertRow ? {
            seedId: bestNoFertRow.seedId,
            name: bestNoFertRow.name,
            requiredLevel: bestNoFertRow.requiredLevel,
            expPerHour: Number(bestNoFertRow.farmExpPerHourNoFert.toFixed(4)),
        } : null,
        bestNormalFert: bestNormalFertRow ? {
            seedId: bestNormalFertRow.seedId,
            name: bestNormalFertRow.name,
            requiredLevel: bestNormalFertRow.requiredLevel,
            expPerHour: Number(bestNormalFertRow.farmExpPerHourNormalFert.toFixed(4)),
        } : null,
        candidatesNoFert: pickTop(availableRows, 'farmExpPerHourNoFert', opts.top || 20).map(r => ({
            seedId: r.seedId,
            name: r.name,
            requiredLevel: r.requiredLevel,
            expPerHour: Number(r.farmExpPerHourNoFert.toFixed(4)),
        })),
        candidatesNormalFert: pickTop(availableRows, 'farmExpPerHourNormalFert', opts.top || 20).map(r => ({
            seedId: r.seedId,
            name: r.name,
            requiredLevel: r.requiredLevel,
            expPerHour: Number(r.farmExpPerHourNormalFert.toFixed(4)),
            gainPercent: Number(r.gainPercent.toFixed(4)),
        })),
    };
}

module.exports = {
    analyzeExpYield,
    getPlantingRecommendation,
    DEFAULT_INPUT,
};
