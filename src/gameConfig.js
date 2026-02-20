/**
 * 游戏配置数据模块
 */

const fs = require('fs');
const path = require('path');

let roleLevelConfig = null;
let levelExpTable = null;
let plantConfig = null;
let plantMap = new Map();
let seedToPlant = new Map();
let fruitToPlant = new Map();
let itemInfoConfig = null;
let itemInfoMap = new Map();

function loadConfigs() {
    const configDir = path.join(__dirname, '..', 'gameConfig');
    
    try {
        const roleLevelPath = path.join(configDir, 'RoleLevel.json');
        if (fs.existsSync(roleLevelPath)) {
            roleLevelConfig = JSON.parse(fs.readFileSync(roleLevelPath, 'utf8'));
            levelExpTable = [];
            for (const item of roleLevelConfig) {
                levelExpTable[item.level] = item.exp;
            }
        }
    } catch (e) {}
    
    try {
        const plantPath = path.join(configDir, 'Plant.json');
        if (fs.existsSync(plantPath)) {
            plantConfig = JSON.parse(fs.readFileSync(plantPath, 'utf8'));
            plantMap.clear();
            seedToPlant.clear();
            fruitToPlant.clear();
            for (const plant of plantConfig) {
                plantMap.set(plant.id, plant);
                if (plant.seed_id) {
                    seedToPlant.set(plant.seed_id, plant);
                }
                if (plant.fruit && plant.fruit.id) {
                    fruitToPlant.set(plant.fruit.id, plant);
                }
            }
        }
    } catch (e) {}

    try {
        const itemInfoPath = path.join(configDir, 'ItemInfo.json');
        itemInfoConfig = null;
        itemInfoMap.clear();
        if (fs.existsSync(itemInfoPath)) {
            itemInfoConfig = JSON.parse(fs.readFileSync(itemInfoPath, 'utf8'));
            for (const item of itemInfoConfig) {
                const id = Number(item.id) || 0;
                if (id > 0) itemInfoMap.set(id, item);
            }
        }
    } catch (e) {}
}

function getLevelExpProgress(level, totalExp) {
    if (!levelExpTable || level <= 0) return { current: 0, needed: 0 };
    
    const currentLevelStart = levelExpTable[level] || 0;
    const nextLevelStart = levelExpTable[level + 1] || (currentLevelStart + 100000);
    
    const currentExp = Math.max(0, totalExp - currentLevelStart);
    const neededExp = nextLevelStart - currentLevelStart;
    
    return { current: currentExp, needed: neededExp };
}

function getPlantById(plantId) {
    return plantMap.get(plantId);
}

function getPlantBySeedId(seedId) {
    return seedToPlant.get(seedId);
}

function getPlantName(plantId) {
    const plant = plantMap.get(plantId);
    return plant ? plant.name : `植物${plantId}`;
}

function getPlantNameBySeedId(seedId) {
    const plant = seedToPlant.get(seedId);
    return plant ? plant.name : `种子${seedId}`;
}

function getPlantGrowTime(plantId) {
    const plant = plantMap.get(plantId);
    if (!plant || !plant.grow_phases) return 0;
    
    const phases = plant.grow_phases.split(';').filter(p => p);
    let totalSeconds = 0;
    for (const phase of phases) {
        const match = phase.match(/:(\d+)/);
        if (match) {
            totalSeconds += parseInt(match[1]);
        }
    }
    return totalSeconds;
}

function formatGrowTime(seconds) {
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`;
}

function getPlantExp(plantId) {
    const plant = plantMap.get(plantId);
    return plant ? plant.exp : 0;
}

function getFruitName(fruitId) {
    const plant = fruitToPlant.get(fruitId);
    return plant ? plant.name : `果实${fruitId}`;
}

function getItemName(itemId) {
    const id = Number(itemId) || 0;
    const itemInfo = itemInfoMap.get(id);
    if (itemInfo && itemInfo.name) {
        return String(itemInfo.name);
    }
    const seedPlant = seedToPlant.get(id);
    if (seedPlant) return `${seedPlant.name}种子`;

    const fruitPlant = fruitToPlant.get(id);
    if (fruitPlant) return `${fruitPlant.name}果实`;

    return `未知物品`;
}

loadConfigs();

module.exports = {
    loadConfigs,
    getLevelExpProgress,
    getPlantById,
    getPlantBySeedId,
    getPlantName,
    getPlantNameBySeedId,
    getPlantGrowTime,
    formatGrowTime,
    getPlantExp,
    getFruitName,
    getItemName
};
