/* =========================================================
   部落字典（Tribe Dictionary）
   =========================================================
   架构约定（全项目唯一）：
     · 每个部落 = 一个**纯数据字典**，只记录「它现在有什么」，
       不含任何规则/判定逻辑。
     · 所有效果、判定、结算都放在 engine.js 的框架函数里，
       引擎只读写字典，不关心具体是哪个部落。

   字典的「栏目」（每局每部落一份，见 makeTribeDict）：
     money          肥力币
     pos            赛道格索引
     seeds          种子栏目  { cropId: 张数 }← 种什么由它决定
     hand           改良栏目  [ improveId ]      ← 持有即增益
     weatherCards   气象栏目  [ weatherId ]      ← 延时卡，下一次种植发动
     lands          土地栏目  { trackIndex: { soilId, crops } }
     freeLandCards  免费买地卡
     skipTurns      监狱服刑剩余回合
     extraRollLeft  本回合可追加掷骰次数（琵琶追风）
     extraRollCd    追加掷骰冷却计数
     harvestedThisTurn 本回合已收获过的地块（防刷钱）

   为什么这样切：
     ① 规则只写一遍 —— 「没有种子不能种」在 plant() 里，
        四个部落自动都遵守，不需要给每个部落各写一遍。
     ② 新增一个「读字典」的函数就能派生新玩法（AI、图鉴、回放）。
     ③ 存档/回放只需序列化字典，不含函数，天然可序列化。
   ========================================================= */

/** 部落静态信息（名字 / 颜色 / 纹样 / 特长） */
import { TRIBE_TRAITS, RULES } from './data.js';
import { TRIBES, svgToDataUri } from './motifs.js';

/**
 * 新建一个空字典（开局状态）。
 * 引擎只通过这个函数造字典，之后一律读写返回的对象。
 *
 * @param {string} tid 部落 id
 * @param {number} money 初始肥力币
 * @returns {object} 该部落的字典
 */
export function makeTribeDict(tid, money) {
  const t = TRIBES.find(x => x.id === tid);
  return {
    /* ---- 身份（静态，不可变） ---- */
    tid: t.id,
    name: t.name,
    color: t.color,
    motif: t.motif,
    icon: svgToDataUri(t.svg),
    initialCrop: t.initialCrop,
    trait: TRIBE_TRAITS[tid] || null,

    /* ---- 栏目（每局变化） ---- */
    money,                 // 肥力币
    pos: 0,                // 赛道格索引，0 = 起点
    seeds: {},             // 种子栏目：{ cropId: 张数 }
    seedDrawn: [],         // 开局抽到的候选种子卡（仅用于日志展示）
    hand: [],              // 改良栏目：[ improveId ]，持有即收获 +6%
    weatherCards: [],      // 气象栏目：[ weatherId ]，下一次种植时自动发动
    lands: {},             // 土地栏目：{ trackIndex: { soilId, crops: [] } }
    freeLandCards: RULES.freeLandCards,
    skipTurns: 0,          // 监狱服刑剩余回合
    extraRollLeft: 0,      // 本回合剩余「追加掷骰」次数
    extraRollCd: 0,        // 「追加掷骰」冷却计数
    harvestedThisTurn: {},// trackIndex -> true，本回合已收获过（防刷钱）
    bankrupt: false,       // 破产退出本局（欠款超过 RULES.debtLimit）
    log: []                // 该部落相关日志
  };
}

/* =========================================================
   字典栏目的读写器 —— 引擎与 UI 都只用这几个函数碰字典
   ---------------------------------------------------------
   把「怎么存」和「怎么用」分开：
     将来换存储结构（比如改成 Map、或者做多套卡组）
     只需要改这一小段，引擎其余部分不用动。
   ========================================================= */

/* ---------- 种子栏目 ---------- */
export function seedCount(dict, cropId) {
  return (dict.seeds && dict.seeds[cropId]) || 0;
}
export function addSeed(dict, cropId, n = 1) {
  if (!dict.seeds) dict.seeds = {};
  dict.seeds[cropId] = (dict.seeds[cropId] || 0) + n;
  return dict.seeds[cropId];
}
export function takeSeed(dict, cropId, n = 1) {
  const have = seedCount(dict, cropId);
  const use = Math.min(have, n);
  if (use > 0) dict.seeds[cropId] = have - use;
  return use;
}
/** 该部落目前能种的作物（手里有种子的） */
export function plantableCrops(dict) {
  return Object.keys(dict.seeds || {}).filter(id => dict.seeds[id] > 0);
}
export function hasAnySeed(dict) {
  return Object.values(dict.seeds || {}).some(n => n > 0);
}

/* ---------- 改良栏目 ---------- */
export function addImprove(dict, improveId) {
  if (!dict.hand) dict.hand = [];
  dict.hand.push(improveId);
  return dict.hand.length;
}
export function dropImprove(dict, improveId) {
  const i = (dict.hand || []).indexOf(improveId);
  if (i < 0) return false;
  dict.hand.splice(i, 1);
  return true;
}
/** 改良卡上限：超过 cap 张的部分没有增益，需要弃掉。返回被弃的 id 列表。 */
export function dropImproveTo(dict, cap) {
  const hand = dict.hand || [];
  const over = hand.length - cap;
  if (over <= 0) return [];
  return hand.splice(0, over);      // 弃掉最前面的若干张
}

/* ---------- 气象栏目（延时卡） ---------- */
export function addWeather(dict, weatherId) {
  if (!dict.weatherCards) dict.weatherCards = [];
  dict.weatherCards.push(weatherId);
  return dict.weatherCards.length;
}
/** 取出一张待发气象卡（一次性，用掉即消失）；没有则返回 null */
export function shiftWeather(dict) {
  return (dict.weatherCards && dict.weatherCards.length) ? dict.weatherCards.shift() : null;
}
export function weatherCount(dict) {
  return (dict.weatherCards || []).length;
}

/* ---------- 土地栏目 ---------- */
export function addLand(dict, trackIndex, soilId) {
  dict.lands[trackIndex] = { soilId, crops: [] };
  return dict.lands[trackIndex];
}
export function getLand(dict, trackIndex) {
  return dict.lands[trackIndex] || null;
}
export function countLands(dict) {
  return Object.keys(dict.lands || {}).length;
}
/** 本回合是否已在这块地收获过（每回合每地只能种一轮） */
export function harvestedThisTurn(dict, trackIndex) {
  return !!(dict.harvestedThisTurn && dict.harvestedThisTurn[trackIndex]);
}
export function markHarvested(dict, trackIndex) {
  if (!dict.harvestedThisTurn) dict.harvestedThisTurn = {};
  dict.harvestedThisTurn[trackIndex] = true;
}
/** 回合开始：清空「已收获」标记 */
export function clearHarvestMarks(dict) {
  dict.harvestedThisTurn = {};
}

/** 字典的「栏目总览」，用于图鉴/手牌弹层展示与调试 */
export function dictSummary(dict) {
  return {
    tid: dict.tid, name: dict.name,
    money: dict.money,
    seeds: Object.keys(dict.seeds || {}).length,
    seedCards: Object.values(dict.seeds || {}).reduce((a, b) => a + b, 0),
    improves: (dict.hand || []).length,
    weathers: (dict.weatherCards || []).length,
    lands: countLands(dict)
  };
}