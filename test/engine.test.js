/*
*
 * 引擎自测：不依赖 DOM / three，直接 node 跑。
 * 校验规则正确性 + 数值平衡（各局时长、胜出率）。
 */
import {
  initGame, playTurn, aiDecide, buyLand, plant, harvest,
  cellAt, landById, soilMatch, plantingProfit,
  stepRoll, stepExtraRoll, stepMove, stepEnd,
  buyCrop, seedCount, marketCrops, dealSeedCards,
  drawWeather, improveBonus, improveCardRate, rollDice, diceTotal,
  checkBankrupt, activePlayers
} from '../src/engine.js';
import { RULES, LANDS, CROPS, TRIBES, TRACK, cropByName, cropById, plotsFor, improveById, START_BONUS } from '../src/data.js';
import { CELL_POS } from '../src/cellPositions.js';

/* 把当前行动者强制设为某个座位。
   turn 现在是 order 里的「第几位」，不是座位号 ——
   写 g.turn = 2 会指到别人，必须先在 order 里定位。 */
function setActorSeat(g, seat) {
  const k = g.order.indexOf(seat);
  if (k < 0) throw new Error('order 里没有座位 ' + seat);
  g.turn = k;
  return g.players[seat];
}

let fails = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`);
  if (!cond) fails++;
};

console.log('===== 1. 数据完整性 =====');
check('土地 11 种', LANDS.length === 11, `${LANDS.length}`);
check('作物 10 种', CROPS.length === 10, `${CROPS.length}`);
check('赛道格数 = 32（与 board_full.png 外圈实测一致）', TRACK.length === 32, `${TRACK.length}`);
check('赛道格数与格子贴图数一致',
  TRACK.length === CELL_POS.length, `TRACK=${TRACK.length} coords=${CELL_POS.length}`);
check('赛道起点在 index 0', TRACK[0].kind === 'start');
check('赛道含全部 5 类站点',
  ['start', 'qixiang', 'nongji', 'zhongzi', 'jianyu']
    .every(k => TRACK.some(c => c.kind === k)));
check('赛道土地格全部有 soilId',
  TRACK.filter(c => c.kind === 'land').every(c => landById(c.soilId)));

console.log('\n===== 2. 肥力 → 种植片数 =====');
const fertTest = [['低', 1], ['中', 2], ['中高', 3], ['高', 3]];
for (const [f, n] of fertTest) {
  check(`${f}肥力 → ${n}片`, plotsFor(f) === n, `实际 ${plotsFor(f)}`);
}

console.log('\n===== 3. 土壤适配与收益 =====');
// 沙土种马铃薯 = 高收（卡面：沙土 35 / 黏土壤土 20）
const potato = cropByName('马铃薯');
const shatu = LANDS.find(l => l.texture === '砂土');
const nítu = LANDS.find(l => l.texture === '黏土');
console.log('  马铃薯 x', shatu.name, '=>', soilMatch(potato, shatu),
  JSON.stringify(plantingProfit(potato, shatu)));
console.log('  马铃薯 x', nítu.name, '=>', soilMatch(potato, nítu),
  JSON.stringify(plantingProfit(potato, nítu)));
check('马铃薯在砂土为高收', soilMatch(potato, shatu) === 'good');
check('马铃薯在黏土为低收', soilMatch(potato, nítu) === 'bad');
check('砂土可种 1 片', plantingProfit(potato, shatu).plots === 1);

// 中等沙土种 2 片土豆（规则原文示例）：成本 15*2=30，收益 35*2=70
// 用引擎里真实的沙土地块，并临时把肥力设为「中」来复现规则原文示例
const midSand = { ...LANDS.find(l => l.id === 'xibei'), fertility: '中' };
const p2 = plantingProfit(potato, midSand);
check('中等沙土 2 片：成本 30', p2.cost === 30, `${p2.cost}`);
check('中等沙土 2 片：收益 70', p2.income === 70, `${p2.income}`);

console.log('\n===== 4. 过路费 = 地价 50% =====');
let g = initGame(4);
const landCellIdx = TRACK.findIndex(c => c.kind === 'land');
const land0 = landById(cellAt(landCellIdx).soilId);
const fee = Math.round(land0.price * RULES.passRate);
check(`${land0.name} 地价 ${land0.price} → 过路费 ${fee}`, fee === Math.round(land0.price * RULES.passRate));

console.log('\n===== 5. 买地 / 种植 / 收获闭环 =====');
g = initGame(4);
const A = g.players[0];
const B = g.players[1];
A.pos = landCellIdx;          // 部落必须先站在该格
const moneyBefore = A.money;
const br = buyLand(g, A, landCellIdx, false);
check('买地成功', br.ok, br.msg || '');
check('扣款正确', A.money === moneyBefore - land0.price, `${A.money} vs ${moneyBefore - land0.price}`);
check('土地归属已记录', g.landOwners[landCellIdx] === 'A');

//新规则：没有种子就不能种 —— 先给一张马铃薯种子
A.seeds = { [potato.id]: 1 };
const pr = plant(g, A, landCellIdx, potato.id);
check('种植成功', pr.ok, pr.msg || '');
check('地里有 1 片作物', A.lands[landCellIdx].crops.length === 1);
check('种植消耗了 1 张种子', A.seeds[potato.id] === 0,
  JSON.stringify(A.seeds));
const hr = harvest(g, A, landCellIdx);
check('收获成功', hr.ok);
check('收获后地块清空', A.lands[landCellIdx].crops.length === 0);

check('（过路费在回合流程中结算，见下）', true);

console.log('\n===== 6. 监狱惩罚 =====');
g = initGame(4);
const k6 = g.order.indexOf(0);      // 行动者所在的次序（order 每局随机）
const P = setActorSeat(g, 0);       // order 是随机的，必须指定行动者
P.skipTurns = 1;
const t1 = playTurn(g, aiDecide);
check('囚犯回合被跳过', t1.skipped === true);
// 换手按 order 推进：从第 k6 位推到第 (k6+1) 位，不是固定 turn===1
check('回合推进到下一玩家', g.turn === (k6 + 1) % g.order.length,
  `turn=${g.turn} order=${g.order}`);

console.log('\n===== 7. 起点奖励 =====');
g = initGame(4);
const Q = setActorSeat(g, 0);       // order 是随机的，必须指定行动者
// 只看起点奖励：记录经过起点前后的差值（AI 决策会改动钱，改为直接检查引擎行为）
Q.pos = TRACK.length - 1;
const before = Q.money;
playTurn(g, () => []);       // 禁用 AI，避免干扰
const bonusLine = g.log.filter(l => l.msg.includes('经过起点')).pop();
check('产生「经过起点」日志', !!bonusLine, bonusLine ? bonusLine.msg : '(无)');
check('起点奖励为 +50', bonusLine && /\+50/.test(bonusLine.msg),
  bonusLine ? bonusLine.msg : '(无)');
// 起点可能不是落点，经过时结算，检查钱确实增加或已记录事件
const passedStart = Q.money > before || (bonusLine && /\+50/.test(bonusLine.msg));
check('起点奖励已结算', passedStart, `money ${before} -> ${Q.money}`);

console.log('\n===== 8. 数值平衡：50 局 AI 自动对战 =====');
const results = { turns: [], winners: {} };
for (let i = 0; i < 50; i++) {
  const gg = initGame(4);
  let guard = 0;
  while (!gg.over && guard++ < 2000) {
    playTurn(gg, aiDecide);
  }
  if (!gg.over) continue;   // 未结束 = 平局
  results.turns.push(guard);
  results.winners[gg.winner.name] = (results.winners[gg.winner.name] || 0) + 1;
}
const avg = results.turns.reduce((a, b) => a + b, 0) / results.turns.length;
const maxT = Math.max(...results.turns);
const minT = Math.min(...results.turns);
console.log(`  局长: 平均 ${avg.toFixed(1)} 回合 (${minT}~${maxT})`);
console.log('  胜出分布:', results.winners);
check('有胜负结果', Object.keys(results.winners).length > 0);
// 下限从 20 放宽到 16：开局每人发 2 张基础种子卡（省 2 次种子钱，
// 约合开局多 20~40% 购买力），局长从 ~27 回落到 ~20，这是机制的必然结果。
check('平均局长在 16~200 回合（可玩）', avg >= 16 && avg < 200, avg.toFixed(1));
check('无超长局（<400 回合）', maxT < 400, String(maxT));

console.log('\n===== 9. 四部落胜率均衡性 =====');
const w = results.winners;
const vals = TRIBES.map(t => w[t.name] || 0);
const total = vals.reduce((a, b) => a + b, 0);
if (total > 0) {
  const spread = (Math.max(...vals) - Math.min(...vals)) / total;
  console.log('  各部落胜率:', vals.map((v, i) => `${TRIBES[i].name} ${(v / total * 100).toFixed(0)}%`).join(' / '));
  check('胜率不过分集中（差值<50%）', spread < 0.5, `spread=${(spread * 100).toFixed(0)}%`);
}

console.log('\n===== 10. 起始配置 =====');
g = initGame(4);
/* 先手补偿按「行动次序」发：order 第 k 位拿 START_BONUS[k]。
   order 每局随机，断言必须按 order 位置算，不能按座位号。 */
check('初始资金 = 150 + 先手补偿（按行动次序）',
  g.order.every((seat, k) => g.players[seat].money === RULES.startMoney + (START_BONUS[k] || 0)),
  g.order.map((seat, k) => `${g.players[seat].name}:${g.players[seat].money}`).join(' '));
check('先手（order 第 0 位）无补偿',
  g.players[g.order[0]].money === RULES.startMoney,
  `${g.players[g.order[0]].name} ${g.players[g.order[0]].money}`);
check('每人 1 张免费买地卡', g.players.every(p => p.freeLandCards === 1));
check('全在起点', g.players.every(p => p.pos === 0));
check('胜利线 260', RULES.winMoney === 260);
check('自定义初始金额生效',
  (() => {
    const gg = initGame(4, { startMoney: [500, 400, 300, 200] });
    return gg.players.map(p => p.money).join('/') === '500/400/300/200';
  })(), (() => initGame(4, { startMoney: [500, 400, 300, 200] }).players.map(p => p.money).join('/'))());

console.log('\n===== 11. 部落特长 =====');
g = initGame(4);
g.players.forEach(p => { p.trait = { ...p.trait }; });   // 测试里克隆一份，避免污染模块级对象

/* A 华表：在山东棕壤收获 +90% */
{
  const a = g.players[0];
  const sd = TRACK.findIndex(c => c.kind === 'land' && c.soilId === 'shandong');
  if (sd >= 0) {
    a.lands[sd] = { soilId: 'shandong', crops: [{ cropId: 'yumi', match: 'good', profit: 100 }] };
    const before = a.money;
    const h = harvest(g, a, sd);
    check('A 华表·华北平原收获 +90%', h.total === 190 && a.money - before === 190,
      `100 -> ${h.total}`);
  } else check('A 华表·华北平原收获 +90%', false, '赛道上没有山东棕壤');

  const other = TRACK.findIndex(c => c.kind === 'land' && c.soilId === 'heilitu');
  if (other >= 0) {
    a.lands[other] = { soilId: 'heilitu', crops: [{ cropId: 'yumi', match: 'good', profit: 100 }] };
    const h2 = harvest(g, a, other);
    check('A 华表·其他土壤无加成', h2.total === 100, `100 -> ${h2.total}`);
  }
}

/* B 三星堆：水稻种子买卡减半 + 收获 +25%
   注意：新规则下种植环节 cost 恒为 0（种子钱在**买卡**时付），
   所以「种子减半」体现在 buyCrop 的价格上，不在 plant 上。 */
{
  const b = g.players[1];
  const jn = TRACK.findIndex(c => c.kind === 'land' && c.soilId === 'jiangnan');
  if (jn >= 0) {
    b.money = 1000;
    b.lands[jn] = { soilId: 'jiangnan', crops: [] };
    b.pos = jn;                       // 新规则：只能站在该格才能种
    b.seeds = { shuidao: 9 };
    /* 按片种满整块地：期望值用的是「整块地收益 ×1.25」，
       plant() 默认只种 1 片（片数自选），所以这里显式传满容量。 */
    const capB = plotsFor(landById('jiangnan').fertility);
    const r = plant(g, b, jn, 'shuidao', capB);
    check('B 三星堆·种植不另扣种子钱（买卡时已付）', r.ok && r.cost === 0,
      r.ok ? `cost=${r.cost}` : r.msg);
    const raw = plantingProfit(cropById('shuidao'), landById('jiangnan'));
    const before = b.money;
    const h = harvest(g, b, jn);
    // 利润 = (原利润 + 种子成本) × 1.25
    const expect = Math.round((raw.profit + raw.cost) * 1.25);
    check('B 三星堆·水稻收获 +25%', h.total === expect, `${h.total} = ${expect}`);
  } else check('B 三星堆·水稻', false, '赛道上没有江南水稻土');
}

/* C 琵琶：每 2 回合一次追风，追加骰 1~3 点 */
{
  setActorSeat(g, 2);
  const c = g.players[2];
  stepRoll(g);
  check('C 琵琶·回合开始获得追风机会', c.extraRollLeft === 1, `left=${c.extraRollLeft}`);
  const ex = stepExtraRoll(g);
  check('C 琵琶·追风骰为 1~3 点', ex.ok && ex.dice[0] >= 1 && ex.dice[0] <= 3,
    `骰子 ${ex.dice.join('+')} = ${ex.steps} 步`);
  check('C 琵琶·追风次数已用完', c.extraRollLeft === 0);
  check('C 琵琶·冷却计数 = 1', c.extraRollCd === 1, `cd=${c.extraRollCd}`);
  // 下一回合不应该再有追风
  stepEnd(g); setActorSeat(g, 2);              // 按 order 转回 C 再走一次
  stepRoll(g);
  check('C 琵琶·冷却期内无追风', c.extraRollLeft === 0 && c.extraRollCd === 0,
    `left=${c.extraRollLeft} cd=${c.extraRollCd}`);
}

/* D 彩陶骆驼：经过起点 +50+15 */
{
  const g2 = initGame(4);
  const d = g2.players[3];
  setActorSeat(g2, 3);
  const startIdx = TRACK.findIndex(c => c.kind === 'start');
  stepRoll(g2);                                  // 刷新 extraRoll 等
  d.pos = startIdx - 1;                          // 站到起点前一格
  const before = d.money;
  stepMove(g2, 1);                               // 走 1 步正好过起点
  check('D 彩陶骆驼·经过起点 +65', d.money - before === 65, `+${d.money - before}`);
  const g3 = initGame(4);
  const a3 = setActorSeat(g3, 0);
  stepRoll(g3);
  a3.pos = startIdx - 1;
  const b3 = a3.money;
  stepMove(g3, 1);
  check('其他部落经过起点仍是 +50', a3.money - b3 === 50, `+${a3.money - b3}`);
}

console.log('\n===== 12. 种子集市闭环 =====');
{
  const gg = initGame(4);
  const p = gg.players[0];
  const goods = marketCrops(gg);
  check('集市有在售作物卡', goods.length === RULES.marketSize, `${goods.length} 种`);

  p.money = 1000;
  const m0 = p.money;
  /* 必须挑一张「手上没有」的作物：开局 dealSeedCards 已经发 2 张基础卡，
     如果goods[0] 恰好是其中之一，seedCount 起点就是 1，
     断言「买 1 张后手中 ×1」会因为起点不是 0 而误判 FAIL。 */
  const target = goods.find(c => seedCount(p, c.id) === 0) || goods[0];
  const r0 = buyCrop(gg, p, target.id);
  check('买卡扣钱并入手牌',
    r0.ok && p.money === m0 - target.cost && seedCount(p, target.id) === 1,
    `${target.name}：−${m0 - p.money} 币，手中 ×${seedCount(p, target.id)}`);

  let guard = 0;
  while (seedCount(p, target.id) < RULES.seedMaxPerType && guard++ < 10) buyCrop(gg, p, target.id);
  const over = buyCrop(gg, p, target.id);
  check('单一作物囤积上限生效', !over.ok, over.msg || '—');

  // 拿到一块地，用手牌种植：不应再扣钱，且利润把省下的种子成本算回去
  const li = TRACK.findIndex(c => c.kind === 'land');
  p.lands[li] = { soilId: TRACK[li].soilId, crops: [] };
  gg.landOwners[li] = p.tid;
  p.pos = li;                        // 新规则：只能站在该格才能种
  const stockBefore = seedCount(p, target.id);
  const moneyBefore = p.money;
  const pr0 = plantingProfit(cropById(target.id), landById(TRACK[li].soilId));
  const rp = plant(gg, p, li, target.id);
  check('用手牌种植不重复扣钱', rp.ok && rp.fromStock === true && p.money === moneyBefore,
    `钱 ${moneyBefore} → ${p.money}`);
  check('手牌数量 −1', seedCount(p, target.id) === stockBefore - 1,
    `${stockBefore} → ${seedCount(p, target.id)}`);
  check('利润含省下的种子成本', rp.profit === pr0.profit + pr0.cost,
    `原 ${pr0.profit} + 成本 ${pr0.cost} = ${rp.profit}`);

  /* 新规则：**没有种子就不能种**（不管钱多不多）。
     这条原来是「无手牌时照常扣钱」，现在语义完全变了：
     清空种子后种植必须被拒绝，且不能扣钱。 */
  const other = goods.find(c => c.id !== target);
  const li2 = TRACK.findIndex((c, i) => i !== li && c.kind === 'land');
  p.lands[li2] = { soilId: TRACK[li2].soilId, crops: [] };
  gg.landOwners[li2] = p.tid;
  p.pos = li2;                       // 新规则：只能站在该格才能种
  const savedSeeds = { ...p.seeds };
  p.seeds = {};                 // 一张种子都没有
  const mBefore = p.money;
  const rp2 = plant(gg, p, li2, other.id);
  check('没有种子时拒绝种植', !rp2.ok && rp2.noSeed === true,
    rp2.msg || '(竟然种成功了)');
  check('被拒绝时不扣钱', p.money === mBefore, `${mBefore} → ${p.money}`);
  check('地里没有长出作物', (p.lands[li2].crops || []).length === 0,
    (p.lands[li2].crops || []).length + ' 片');
  p.seeds = savedSeeds;      // 还原，避免影响后续用例
}

console.log('\n===== 13. 开局基础种子卡 =====');
{
  // 发牌机制：抽 3 张候选，取其中 2 张入库
  const d = dealSeedCards();
  const keptIds = Object.keys(d.hand);
  check('每局发 seedKeep 张基础种子卡', keptIds.length === RULES.seedKeep,
    `${keptIds.length} 张（seedKeep=${RULES.seedKeep}）`);
  check('候选池抽了 seedDraw 张', d.drawn.length === RULES.seedDraw,
    `${d.drawn.length} 张（seedDraw=${RULES.seedDraw}）`);
  check('入库的都在候选里', keptIds.every(id => d.drawn.includes(id)),
    keptIds.join('/') + ' ⊆ ' + d.drawn.join('/'));
  check('入库的是候选的前 seedKeep 张',
    keptIds.every((id, i) => id === d.drawn[i]), d.drawn.join(' → '));
  check('每种作物各 1 张（无重复）', new Set(keptIds).size === keptIds.length,
    keptIds.join('、'));
  check('都是真实作物 id', keptIds.every(id => CROPS.some(c => c.id === id)));

  // 每个部落开局都拿到 2 张
  g = initGame(4);
  check('四个部落开局各 2 张基础种子卡',
    g.players.every(p => Object.keys(p.seeds).length === RULES.seedKeep),
    g.players.map(p => Object.keys(p.seeds).length).join('/'));
  check('记录了抽到的候选（含未入库）',
    g.players.every(p => Array.isArray(p.seedDrawn) && p.seedDrawn.length === RULES.seedDraw));

  // 随机性：多局之间不应完全一样
  const samples = [];
  for (let i = 0; i < 40; i++) samples.push(Object.keys(initGame(4).players[0].seeds).sort().join(','));
  check('各局基础种子卡是随机的', new Set(samples).size >= 4,
    `${new Set(samples).size} 种不同组合 / 40 局`);

  // 抽到的两张必须是不同作物
  check('同一部落两张不重复',
    g.players.every(p => new Set(Object.keys(p.seeds)).size === Object.keys(p.seeds).length));

  // 用掉基础种子卡后：种子钱已在买卡/发牌时付过，种植时不再扣
  const s2 = initGame(1);
  const pp = s2.players[0];
  const seedId = Object.keys(pp.seeds)[0];
  const landIdx = TRACK.findIndex((c, i) => c.kind === 'land');
  pp.lands[landIdx] = { soilId: TRACK[landIdx].soilId, crops: [] };
  s2.landOwners[landIdx] = pp.tid;
  pp.pos = landIdx;                  // 新规则：只能站在该格才能种
  const mb = pp.money;
  const nSeed0 = pp.seeds[seedId];
  const rr = plant(s2, pp, landIdx, seedId);
  check('用基础种子卡种植不扣钱', rr.ok && rr.cost === 0 && pp.money === mb,
    `${mb} → ${pp.money}（cost=${rr.cost}）`);
  check('种植记录了 fromStock', rr.fromStock === true, String(rr.fromStock));
  check('种子卡 −1', pp.seeds[seedId] === nSeed0 - 1,
    `${nSeed0} → ${pp.seeds[seedId]}`);
}

console.log('\n===== 14. 每回合每块地只能种一轮 =====');
{
  g = initGame(1);
  const p = g.players[0];
  const li = TRACK.findIndex(c => c.kind === 'land' && landById(c.soilId).fertility === '低');
  p.lands[li] = { soilId: TRACK[li].soilId, crops: [] };
  g.landOwners[li] = p.tid;
  p.pos = li;                        // 新规则：只能站在该格才能种
  const crop = CROPS.find(c => !c.soilMap[TRACK[li].soilId]);   // 任一作物
  p.money = 500;
  // 新规则：必须有种子才能种
  p.seeds = { [crop.id]: 4 };

  const r1 = plant(g, p, li, crop.id);
  check('第一轮种植成功', r1.ok, `${crop.name} ${r1.plots} 片`);
  const h1 = harvest(g, p, li);
  check('收获成功', h1.ok, h1.total >= 0 ? '+' + h1.total : '' + h1.total);
  check('本回合标记为已收获', p.harvestedThisTurn[li] === true);

  const r2 = plant(g, p, li, crop.id);
  check('同回合不能再种（防刷钱）', !r2.ok && /已经收获过/.test(r2.msg || ''),
    r2.msg || '(竟然成功了)');

  // 新回合开始 -> 清空标记 -> 可以再种
  stepRoll(g);
  const r3 = plant(g, p, li, crop.id);
  check('下个回合可以再种', r3.ok, r3.ok ? crop.name + ' ' + r3.plots + ' 片' : r3.msg);
}

console.log('\n===== 15. 延时气象卡 =====');
{
  g = initGame(1);
  const p = g.players[0];
  check('开局没有气象卡', (p.weatherCards || []).length === 0,
    (p.weatherCards || []).length + ' 张');
  const li = TRACK.findIndex(c => c.kind === 'land');
  p.lands[li] = { soilId: TRACK[li].soilId, crops: [] };
  g.landOwners[li] = p.tid;
  p.pos = li;                        // 新规则：只能站在该格才能种
  p.money = 500;

  // 直接调 drawWeather 模拟落到气象站
  const w = drawWeather(g, p);
  check('气象站发出延时卡', p.weatherCards.length === 1, p.weatherCards.join(','));
  check('发卡时不立即结算', w.delayed === true && typeof w.total === 'number',
    'total=' + w.total);
  const moneyAfterDraw = p.money;

  const crop = CROPS.find(c => !c.soilMap[TRACK[li].soilId]);
  p.seeds = { [crop.id]: 4 };// 新规则：必须有种子（后面还要种第二次）
  const pr0 = plantingProfit(crop, landById(TRACK[li].soilId));
  const rp = plant(g, p, li, crop.id);
  check('种植时自动发动气象卡', !!rp.weather, rp.weather ? rp.weather.name : '(未触发)');
  check('发动后卡被消耗', p.weatherCards.length === 0, p.weatherCards.length + ' 张');
  /* 利润口径：新规则下种植 cost=0，所以 profit = plantingProfit.profit + 原种子成本，
     气象值再叠加在上面。 */
  check('气象值计入那片作物利润', rp.profit === pr0.profit + pr0.cost + w.total,
    `${pr0.profit} + ${pr0.cost}(种子已付) + ${w.total} = ${rp.profit}`);
  // 气象卡是一次性的：第二片地再种时不应该再有卡可发动
  check('第二次种植不再触发气象',
    (plant(g, p, li, crop.id).weather || null) === null);
  check('未种植时卡会一直留着（延时语义）',
    (() => { const g2 = initGame(1); const q = g2.players[0];
      drawWeather(g2, q); drawWeather(g2, q); return q.weatherCards.length === 2; })());
}

console.log('\n===== 16. 改良卡持有增益 =====');
{
  g = initGame(1);
  const p = g.players[0];
  check('开局无改良卡', p.hand.length === 0);
  check('无卡时增益 0%', improveBonus(p).rate === 0, improveBonus(p).rate);
  /* 单卡增益按**面值折算**：（value ÷ 最高面值 20）× 6%。
     nongyao 面值 20 → +6%；dimo 面值 5 → +1.5%；diguan 面值 10 → +3%。 */
  check('单卡面值折算：面值 20 -> +6%',
    Math.abs(improveCardRate(improveById('nongyao')) - 0.06) < 1e-9,
    (improveCardRate(improveById('nongyao')) * 100).toFixed(1) + '%');
  check('单卡面值折算：面值 5 -> +1.5%',
    Math.abs(improveCardRate(improveById('dimo')) - 0.015) < 1e-9,
    (improveCardRate(improveById('dimo')) * 100).toFixed(1) + '%');
  p.hand = ['nongyao'];
  check('1 张（面值20）-> +6%', Math.abs(improveBonus(p).rate - 0.06) < 1e-9,
    (improveBonus(p).rate * 100).toFixed(1) + '%');
  p.hand = ['dimo', 'diguan', 'nongyao'];        // 5+10+20 = 35/20 → +10.5%
  check('3 张（面值合计折算）-> +10.5%', Math.abs(improveBonus(p).rate - 0.105) < 1e-9,
    (improveBonus(p).rate * 100).toFixed(1) + '%');
  p.hand = new Array(9).fill('nongyao');         // 9×6% = 54% → 封顶 48%
  check('上限 +48%（面值20 ×9 封顶）', Math.abs(improveBonus(p).rate - 0.48) < 1e-9,
    (improveBonus(p).rate * 100).toFixed(0) + '%');

  // 收获时确实吃到增益
  g = initGame(1);
  const q = g.players[0];
  q.hand = ['dimo', 'diguan'];            // 面值 5+10 = 15/20 → +4.5%
  const li = TRACK.findIndex(c => c.kind === 'land');
  q.lands[li] = { soilId: TRACK[li].soilId, crops: [] };
  g.landOwners[li] = q.tid;
  q.pos = li;                        // 新规则：只能站在该格才能种
  q.money = 500;
  const crop = CROPS.find(c => !c.soilMap[TRACK[li].soilId]);
  q.seeds = { [crop.id]: 1 };                 // 新规则：必须有种子
  const r = plant(g, q, li, crop.id);
  const rawP = r.profit;
  const hh = harvest(g, q, li);
  const expectGain = Math.round(rawP * 1.045);   // 改良增益取整：0.06 倍数是浮点数，必须 round
  check('收获金额含改良卡增益（增益取整）',
    hh.total === expectGain,
    `原 ${rawP} × 1.045 → ${hh.total}（期望 ${expectGain}）`);
  check('结果回报了增益率', hh.improveBonus > 0, (hh.improveBonus * 100).toFixed(0) + '%');
  check('不种作物就没有增益（无地可收）',
    harvest(g, q, li).ok === false);
}

/* =========================================================
   17. 架构：部落字典 + 框架函数
   ---------------------------------------------------------
   约定（src/tribes.js 的文件头写了同样的内容）：
     · 4 个部落 = 4 个**纯数据字典**，只记录「有什么」
     · 所有规则/判定/结算 = engine.js 的框架函数，只读写字典
   这一节把该约定变成可执行的断言，防止以后又写回「
   在initGame 里手搓玩家对象」或「在规则里直接改player.seeds」。
   ========================================================= */
console.log('\n===== 17. 部落字典架构 =====');
{
  const tri = await import('../src/tribes.js');
  const { makeTribeDict, seedCount, addSeed, takeSeed, plantableCrops,
    addImprove, dropImprove, dropImproveTo, addWeather, shiftWeather, weatherCount,
    addLand, getLand, countLands, markHarvested, harvestedThisTurn,
    clearHarvestMarks, dictSummary } = tri;

  /* ---- 字典的「栏目」齐全 ---- */
  const d = makeTribeDict('A', 150);
  const FIELDS = ['money', 'pos', 'seeds', 'seedDrawn', 'hand', 'weatherCards',
    'lands', 'freeLandCards', 'skipTurns', 'extraRollLeft', 'extraRollCd',
    'harvestedThisTurn', 'log'];
  const missing = FIELDS.filter(k => !(k in d));
  check('字典包含全部栏目', missing.length === 0,
    missing.length ? '缺 ' + missing.join(',') : FIELDS.length + ' 个栏目');
  check('字典含静态身份（tid/name/color/trait）',
    d.tid === 'A' && !!d.name && !!d.color && !!d.icon,
    `${d.tid} ${d.name}`);

  /* ---- 字典是纯数据：可以 JSON 序列化（存档/回放的前提）---- */
  let json = '';
  try { json = JSON.stringify(d); } catch (e) { /* 下面断言会失败 */ }
  check('字典可JSON 序列化（不含函数）', json.length > 10, json.slice(0, 46) + '…');
  const back = JSON.parse(json || '{}');
  check('序列化后能还原栏目', back.tid === 'A' && back.money === 150,
    `还原 ${back.tid} ${back.money}`);

  /* ---- 种子栏目的读写器 ---- */
  const d2 = makeTribeDict('B', 200);
  addSeed(d2, 'yumi', 3);
  check('addSeed 累加', seedCount(d2, 'yumi') === 3, 'yumi=' + seedCount(d2, 'yumi'));
  check('plantableCrops 只列有种子的',
    plantableCrops(d2).join() === 'yumi', plantableCrops(d2).join());
  check('takeSeed 扣减', takeSeed(d2, 'yumi', 2) === 2 && seedCount(d2, 'yumi') === 1,
    '剩 ' + seedCount(d2, 'yumi'));
  check('takeSeed 不会扣成负数', takeSeed(d2, 'yumi', 99) === 1 && seedCount(d2, 'yumi') === 0,
    '剩 ' + seedCount(d2, 'yumi'));

  /* ---- 改良 / 气象 / 土地栏目 ---- */
  addImprove(d2, 'dimo'); addImprove(d2, 'cetu');
  check('改良栏目 +2', improveBonus(d2).count === 2, improveBonus(d2).count + ' 张');
  check('dropImprove 移除一张', dropImprove(d2, 'dimo') && improveBonus(d2).count === 1);
  d2.hand = ['a', 'b', 'c', 'd'];
  check('dropImproveTo 保留上限内', dropImproveTo(d2, 2).length === 2 && d2.hand.length === 2,
    JSON.stringify(d2.hand));

  addWeather(d2, 'w1'); addWeather(d2, 'w2');
  check('气象栏目 +2', weatherCount(d2) === 2, weatherCount(d2) + ' 张');
  check('shiftWeather 取出并移除（一次性）',
    shiftWeather(d2) === 'w1' && weatherCount(d2) === 1,
    '取出 w1，剩 ' + weatherCount(d2));
  check('空栏目 shiftWeather 返回 null', shiftWeather(makeTribeDict('C', 1)) === null);

  addLand(d2, 5, 'heilitu');
  check('土地栏目写入', getLand(d2, 5)?.soilId === 'heilitu' && countLands(d2) === 1);
  check('未拥有的地返回 null', getLand(d2, 6) === null);
  markHarvested(d2, 5);
  check('本回合已收获标记', harvestedThisTurn(d2, 5) === true);
  clearHarvestMarks(d2);
  check('回合开始清空标记', harvestedThisTurn(d2, 5) === false);

  /* ---- 汇总视图 ---- */
  const sum = dictSummary(d);
  check('dictSummary 汇总各栏目',
    sum.seeds === 0 && sum.improves === 0 && sum.lands === 0 && sum.money === 150,
    JSON.stringify(sum));

  /* ---- 规则只写一遍：四个部落共用同一个 plant ---- */
  const g2 = initGame(4);
  const landIdx = TRACK.findIndex(c => c.kind === 'land');
  g2.players.forEach((pl, i) => {
    pl.pos = landIdx;
    pl.lands[landIdx] = { soilId: TRACK[landIdx].soilId, crops: [] };
    g2.landOwners[landIdx] = pl.tid;
  });
  // 只给 A 部落种子，其余三个都没有 —— 同一个 plant() 应该只放行 A
  g2.players[0].seeds = { yumi: 1 };
  g2.players.slice(1).forEach(pl => { pl.seeds = {}; });
  const rA = plant(g2, g2.players[0], landIdx, 'yumi');
  const rB = plant(g2, g2.players[1], landIdx, 'yumi');
  check('同一条规则：有种子的部落能种', rA.ok, rA.msg || '');
  check('同一条规则：没种子的部落不能种', !rB.ok && rB.noSeed === true,
    rB.msg || '(竟然种成功了)');
}

console.log('\n===== 18. 按片种植：片数自选（1~剩余空位）=====');
{
  /* 用户实测诉求：中高/高肥力（3 片）的地，只想种 2 片 —— 应能自选片数。
     同时堵住旧实现的刷钱漏洞：一次调用按「整块地」结算收益、却只压 1 条记录，
     连点 3 次 = 3 倍收益。现在 n 片 = n 张种子 = n 条记录，每条只记单片利润。 */
  const mk = () => {
    const gg = initGame(1);
    const p = gg.players[0];
    const li = TRACK.findIndex(c => c.kind === 'land' && landById(c.soilId).fertility === '中高');
    p.lands[li] = { soilId: TRACK[li].soilId, crops: [] };
    gg.landOwners[li] = p.tid;
    p.pos = li;                       // 新规则：只能站在该格才能种
    p.money = 1000;
    const crop = CROPS[0];
    p.seeds = { [crop.id]: 9 };
    return { gg, p, li, crop, land: landById(TRACK[li].soilId) };
  };

  const A = mk();
  const inc = plantingProfit(A.crop, A.land).income;    // 整块地（3 片）应得的总收益
  const per = Math.round(inc / 3);                      // 单片利润
  const r2 = plant(A.gg, A.p, A.li, A.crop.id, 2);
  check('可只种 2 片（不强制种满 3 片）', r2.ok && r2.plots === 2, `plots=${r2.plots}`);
  check('种 2 片 = 2 条作物记录', A.p.lands[A.li].crops.length === 2,
    A.p.lands[A.li].crops.length + ' 片');
  check('种 2 片 = 消耗 2 张种子（一片一张）', A.p.seeds[A.crop.id] === 7,
    A.p.seeds[A.crop.id] + ' 张');
  check('单片利润 = 整块地收益 ÷ 片数', A.p.lands[A.li].crops.every(c => c.profit === per),
    JSON.stringify(A.p.lands[A.li].crops.map(c => c.profit)));
  const h2 = harvest(A.gg, A.p, A.li);
  check('收 2 片 = 整块地收益的 2/3（不重复计整块）', h2.total === per * 2,
    `${h2.total} vs ${per * 2}`);

  const B = mk();
  plant(B.gg, B.p, B.li, B.crop.id, 2);
  const over = plant(B.gg, B.p, B.li, B.crop.id, 2);
  check('剩余空位不足时拒绝多出的片数', !over.ok && /空位/.test(over.msg), over.msg);

  const C = mk();
  C.p.seeds = { [C.crop.id]: 1 };
  const few = plant(C.gg, C.p, C.li, C.crop.id, 3);
  check('种子不足时拒绝（一片一张）', !few.ok && few.noSeed === true, few.msg);
  const one = plant(C.gg, C.p, C.li, C.crop.id, 1);
  check('把片数降到 1 就能种下', one.ok && one.plots === 1, one.msg || '');

  const D = mk();
  for (let k = 0; k < 3; k++) plant(D.gg, D.p, D.li, D.crop.id, 1);
  const hD = harvest(D.gg, D.p, D.li);
  check('分 3 次各 1 片，总收益 = 整块地收益（旧实现会 ×3）', hD.total === inc,
    `${hD.total} vs ${inc}`);
}

console.log('\n===== 19. 过路费只在落点收 · 只能站在自己脚下的地种植 =====');
{
  /* Bug2：路过他人土地**不收费**，只有「落在」那一格才收。
     早先对 passed 里每一块土地都收费（走两步经过别人的地也要交钱）。 */
  const gB = initGame(4);
  const aB = setActorSeat(gB, 0);
  const other = gB.players[1];
  const L = TRACK.findIndex((c, i) => i >= 1 && i <= 30 && c.kind === 'land');
  gB.landOwners[L] = other.tid;
  aB.pos = (L - 1 + TRACK.length) % TRACK.length;
  const am = aB.money, bm = other.money;
  const mv = stepMove(gB, 2);                 // 第 1 步路过 L，第 2 步落到 L+1
  check('路过他人土地不收费',
    aB.pos === (L + 1) % TRACK.length && aB.money === am && other.money === bm,
    `pos=${aB.pos}  A ${am}→${aB.money}  B ${bm}→${other.money}`);
  check('路过不产生过路费事件', !mv.events.some(e => e.kind === 'pass'));

  const gB2 = initGame(4);
  const aB2 = setActorSeat(gB2, 0);
  const other2 = gB2.players[1];
  gB2.landOwners[L] = other2.tid;
  aB2.pos = (L - 1 + TRACK.length) % TRACK.length;
  const am2 = aB2.money, bm2 = other2.money;
  const feeL = Math.round(landById(cellAt(L).soilId).price * RULES.passRate);
  const mv2 = stepMove(gB2, 1);               // 正好落在 L
  check('落在他人土地才收费（地价 × 50%）',
    aB2.pos === L && aB2.money === am2 - feeL && other2.money === bm2 + feeL
    && mv2.events.some(e => e.kind === 'pass'),
    `A ${am2}→${aB2.money}（应 −${feeL}）`);

  /* Bug4：只能给**自己当前所在**的那块地种植。
     站在 a 地时，哪怕 b 地也是自己的，也不能隔着两块地种。 */
  const gP = initGame(1);
  const pp = gP.players[0];
  const liA = TRACK.findIndex(c => c.kind === 'land');
  const liB = TRACK.findIndex((c, i) => i !== liA && c.kind === 'land');
  pp.lands[liA] = { soilId: TRACK[liA].soilId, crops: [] };
  pp.lands[liB] = { soilId: TRACK[liB].soilId, crops: [] };
  gP.landOwners[liA] = pp.tid;
  gP.landOwners[liB] = pp.tid;
  pp.seeds = { yumi: 5 };
  pp.pos = liA;                                // 站在 a 地
  check('站在 a 地：给脚下的 a 地种植可成功', plant(gP, pp, liA, 'yumi').ok === true);
  const rFar = plant(gP, pp, liB, 'yumi');     // 想给远方的 b 地种
  check('站在 a 地：不能给 b 地种植', !rFar.ok && /当前所在/.test(rFar.msg || ''), rFar.msg);
  check('被拒后 b 地没有长出作物', pp.lands[liB].crops.length === 0,
    pp.lands[liB].crops.length + ' 片');
}

console.log('\n===== 20. 骰子公平性（用户质疑「开局总落在种子集市」）=====');
{
  /* rollDice = 每颗 Math.floor(Math.random()*6)+1，2 颗求和（2~12 三角分布）。
     容差取 0.6pp：理论 σ≈0.08pp，0.6pp ≈ 7σ，正常永不误报；
     但足以抓住任何系统性偏移（RNG 写错、被改成固定值等）。
     注意：不能用「多回合模拟」测落点 —— 监狱的 skipTurns 会跨局残留，
     那是探针自己的污染（真实对局里每局独立，不存在的假象）。 */
  const N = 200000;
  const sums = new Array(13).fill(0);
  const faces = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) {
    const d = rollDice();
    sums[diceTotal(d)]++;
    faces[d[0] - 1]++;
    faces[d[1] - 1]++;
  }
  const theoSum = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1].map(v => v / 36);
  let maxDev = 0;
  for (let s = 2; s <= 12; s++) {
    const dev = Math.abs(sums[s] / N - theoSum[s]);
    if (dev > maxDev) maxDev = dev;
  }
  check('2d6 总点分布贴合理论（最大偏差 < 0.6pp）', maxDev < 0.006,
    `最大偏差 ${(maxDev * 100).toFixed(3)}pp`);
  let maxFace = 0;
  for (const f of faces) maxFace = Math.max(maxFace, Math.abs(f / (2 * N) - 1 / 6));
  check('单骰六面均匀（最大偏差 < 0.4%）', maxFace < 0.004,
    `最大偏差 ${(maxFace * 100).toFixed(3)}%`);
  /* 「开局落在种子集市」的概率：集市在格 3、9（首圈可及），2/36 + 4/36 = 1/6 */
  const pMarket = theoSum[3] + theoSum[9];
  check('首掷命中种子集市的理论概率 = 1/6（16.7%），并非必中',
    Math.abs(pMarket - 1 / 6) < 1e-9, `P = ${(pMarket * 100).toFixed(1)}%`);
}

console.log('\n===== 21. 破产（欠款上限）与「最后幸存者获胜」=====');
{
  /* 规则：允许部落欠款，下限 = −RULES.debtLimit（默认 50）。
     欠款**超过**上限即破产、退出本局；其他部落继续，
     直到只剩 1 个未破产部落由它获胜（或有人达到胜利线）。 */
  check('RULES.debtLimit 默认 50', RULES.debtLimit === 50, `${RULES.debtLimit}`);

  // ① 欠款正好到上限（−50）不算破产
  const g1 = initGame(4);
  const p1 = g1.players[0];
  p1.money = -RULES.debtLimit;
  check('欠款 = 上限（−50）不破产',
    checkBankrupt(g1, p1) === false && p1.bankrupt === false, `money=${p1.money}`);

  // ② 欠款越过上限（−51）即破产；名下土地回归无主
  const g2 = initGame(4);
  const p2 = g2.players[0];
  const li = TRACK.findIndex(c => c.kind === 'land');
  p2.lands[li] = { soilId: TRACK[li].soilId, crops: [] };
  g2.landOwners[li] = p2.tid;
  p2.money = -RULES.debtLimit - 1;
  check('欠款 > 上限（−51）即破产',
    checkBankrupt(g2, p2) === true && p2.bankrupt === true, `money=${p2.money}`);
  check('破产后名下土地回归无主',
    !g2.landOwners[li] && Object.keys(p2.lands).length === 0);
  check('破产只生效一次（重复调用返回 false）',
    checkBankrupt(g2, p2) === false);
  check('activePlayers 排除破产者', activePlayers(g2).length === 3,
    `${activePlayers(g2).length} 个未破产`);

  // ③ 过路费把钱包打到越线 -> 当场破产（实际对局里唯一的负钱途径）
  const g3 = initGame(4);
  const a3 = setActorSeat(g3, 0);
  const owner3 = g3.players[1];
  const L3 = TRACK.findIndex((c, i) => i >= 1 && i <= 30 && c.kind === 'land');
  g3.landOwners[L3] = owner3.tid;
  a3.pos = (L3 - 1 + TRACK.length) % TRACK.length;
  a3.money = -RULES.debtLimit;          // −50：交完过路费必越线
  stepMove(g3, 1);                      // 落在 L3，付过路费
  check('过路费使欠款越线 -> 当场破产', a3.bankrupt === true, `money=${a3.money}`);

  // ④ 换手跳过破产部落
  const g4 = initGame(4);
  g4.turn = g4.order.length - 1;        // 让下一次换手正好轮回到 order[0]
  g4.players[g4.order[0]].bankrupt = true;
  stepEnd(g4);
  check('换手跳过破产部落',
    g4.turn === 1 && !g4.players[g4.order[1]].bankrupt, `turn=${g4.turn}`);

  // ⑤ 只剩 1 个未破产部落 -> 由它获胜，游戏结束
  const g5 = initGame(4);
  const survivorSeat = g5.order[0];
  for (const s of g5.order) if (s !== survivorSeat) g5.players[s].bankrupt = true;
  setActorSeat(g5, survivorSeat);
  const se5 = stepEnd(g5);
  check('只剩 1 个未破产部落 -> 最后幸存者获胜',
    g5.over === true && g5.winner === g5.players[survivorSeat],
    `winner=${g5.winner && g5.winner.name}`);
  check('幸存者获胜事件被抛出', se5.events.some(e => e.kind === 'win'));

  // ⑥ 达到胜利线即游戏结束（原有规则）
  const g6 = initGame(4);
  const w6 = setActorSeat(g6, g6.order[0]);
  w6.money = RULES.winMoney;
  stepEnd(g6);
  check('达到胜利线即游戏结束',
    g6.over === true && g6.winner === w6, `winner=${g6.winner && g6.winner.name}`);

  // ⑦ 全员破产 -> 无人获胜
  const g7 = initGame(4);
  for (const s of g7.order) g7.players[s].bankrupt = true;
  setActorSeat(g7, g7.order[0]);
  stepEnd(g7);
  check('全员破产 -> 无人获胜',
    g7.over === true && g7.winner === null, `winner=${g7.winner}`);
}

console.log(`\n===== 结果：${fails === 0 ? '全部通过 ✓' : fails + ' 项失败 ✗'} =====`);
process.exit(fails === 0 ? 0 : 1);