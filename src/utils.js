/**
 * 通用工具函数
 */

const Long = require('long');

let serverTimeMs = 0;
let localTimeAtSync = 0;

function toLong(val) {
    return Long.fromNumber(val);
}

function toNum(val) {
    if (Long.isLong(val)) return val.toNumber();
    return val || 0;
}

function now() {
    return new Date().toLocaleTimeString();
}

function getServerTimeSec() {
    if (!serverTimeMs) return Math.floor(Date.now() / 1000);
    const elapsed = Date.now() - localTimeAtSync;
    return Math.floor((serverTimeMs + elapsed) / 1000);
}

function syncServerTime(ms) {
    serverTimeMs = ms;
    localTimeAtSync = Date.now();
}

function toTimeSec(val) {
    const n = toNum(val);
    if (n <= 0) return 0;
    if (n > 1e12) return Math.floor(n / 1000);
    return n;
}

function log(tag, msg) {
    console.log(`[${now()}] [${tag}] ${msg}`);
}

function logWarn(tag, msg) {
    console.log(`[${now()}] [${tag}] ⚠ ${msg}`);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

module.exports = {
    toLong, toNum, now,
    getServerTimeSec, syncServerTime, toTimeSec,
    log, logWarn, sleep,
};
