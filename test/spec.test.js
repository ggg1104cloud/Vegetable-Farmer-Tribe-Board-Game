/*
 * SPEC 一致性测试：逐条验证 SPEC.md 里写死的规则。
 * 不依赖 DOM，node 直接跑：node test/spec.test.js
 *
 * 与 engine.test.js 的分工：
 *   engine.test.js   —— 引擎的「行为」回归（数值、闭环、架构）
 *   spec.test.js     —— SPEC.md 的「契约」验证（前置条件、状态机、精确数值）
 * 有少量重叠是故意的：SPEC 是唯一事实来源，测试守住它。
 */
import {
  initGame, buyLand, plant, harvest, cellAt, payPass, curPlayer,
  stepRoll, stepExtraRoll, stepMove, stepSettle, stepEnd,
  buyCrop, marketCrops, drawWeather, improveBonus, improveCardRate, drawImprove,
  traitSeedCost, traitHarvestBonus, traitStartBonus, plantingProfit
} from '../src/engine.js';
import {
  RULES, CROPS, TRACK, START_BONUS, landById, cropById, plotsFor
} from '../src/data.js';

let fails = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`);
  if (!cond) fails++;
};
const firstLand = (pred = () => true) => TRACK.findIndex(c => c.kind === 'land' && pred(c));
/** 把当前行动者设成某个座位（turn 是 order 序号，不是座位号） */
const setActor = (g, seat) => { g.turn = g.order.indexOf(seat); return g.players[seat]; };

/* =========================================================
   §0 状态模型
   ========================================================= */
console.log('===== §0 状态模型 =====');
{
  const g = initGame(4);
  check('order 是座位号 [0..3] 的排列',
    [...g.order].sort().join() === '0,1,2,3', g.order.join(','));
  check('当前行动者 = players[order[turn]]',
    curPlayer(g) === g.players[g.order[g.turn]]);
  const samples = new Set();
  for (let i = 0; i < 30; i++) samples.add(initGame(4).order.join(''));
  check('行动顺序每局随机', samples.size >= 4, `${samples.size} 种 / 30 局`);

  const FIELDS = ['money', 'pos', 'seeds', 'hand', 'weatherCards', 'lands',
    'freeLandCards', 'skipTurns', 'extraRollLeft', 'extraRollCd', 'harvestedThisTurn', 'log'];
  const miss = FIELDS.filter(k => !(k in g.players[0]));
  check('部落字典栏目齐全', miss.length === 0,
    miss.length ? '缺 ' + miss.join(',') : FIELDS.length + ' 个栏目');
}

/* =========================================================
   §1 开局
   ========================================================= */
console.log('\n===== §1 开局 =====');
{
  const g = initGame(4);
  check('先手补偿按「行动次序」发（150 + START_BONUS[k]）',
    g.order.every((seat, k) => g.players[seat].money === RULES.startMoney + START_BONUS[k]),
    g.order.map((seat, k) => `${g.players[seat].name}:${g.players[seat].money}`).join(' '));
  check('先手（order 第 0 位）无补偿',
    g.players[g.order[0]].money === RULES.startMoney);
  check('每人 1 张免费买地卡', g.players.every(p => p.freeLandCards === RULES.freeLandCards));
  check('全在起点', g.players.every(p => p.pos === 0));
  check('开局各发 seedKeep 张基础种子卡',
    g.players.every(p => Object.values(p.seeds).reduce((a, b) => a + b, 0) === RULES.seedKeep));
  check('基础种子卡互不重复',
    g.players.every(p => new Set(Object.keys(p.seeds)).size === Object.keys(p.seeds).length));

  const g2 = initGame(4, { startMoney: [500, 400, 300, 200] });
  check('自定义初始金额生效且不叠加补偿',
    g2.players.map(p => p.money).join('/') === '500/400/300/200',
    g2.players.map(p => p.money).join('/'));
}

/* =========================================================
   §2 回合状态机
   ========================================================= */
console.log('\n===== §2 回合状态机 =====');
{
  // 掷骰：2 颗 d6
  const g = initGame(4);
  const r = stepRoll(g);
  check('掷 2 颗骰，步数 = 点数和',
    r.dice.length === RULES.diceCount && r.steps === r.dice.reduce((a, b) => a + b, 0),
    `${r.dice.join('+')}=${r.steps}`);

  // 移动：pos 前进 steps（模 32）
  const p = g.players[g.order[0]];
  const pos0 = p.pos;
  stepMove(g, 5);
  check('移动 pos = (pos+steps) mod 32', p.pos === (pos0 + 5) % TRACK.length,
    `${pos0} → ${p.pos}`);

  // 换手：turn +1；走满一圈 round++
  const g3 = initGame(4);
  const n = g3.order.length, r0 = g3.round, t0 = g3.turn;
  stepEnd(g3);
  check('换手：turn +1（按 order 推进）', g3.turn === (t0 + 1) % n, `turn=${g3.turn}`);
  const g4 = initGame(4);
  const rr0 = g4.round;
  for (let i = 0; i < n; i++) stepEnd(g4);
  check('走满一圈：round +1', g4.turn === 0 && g4.round === rr0 + 1,
    `turn=${g4.turn} round=${g4.round}`);

  // 监狱：skipTurns>0 时跳过掷骰
  const g5 = initGame(4);
  const q = setActor(g5, 0);
  q.skipTurns = 1;
  const sr = stepRoll(g5);
  check('监狱回合被跳过（不掷骰）', sr.skipped === true && sr.dice.length === 0);
  check('skipTurns 递减到 0', q.skipTurns === 0, `skipTurns=${q.skipTurns}`);
}

/* =========================================================
   §3.3 过路费与起点
   ========================================================= */
console.log('\n===== §3.3 过路费与起点 =====');
{
  const g = initGame(4);
  const li = firstLand();
  const land = landById(TRACK[li].soilId);
  const a = g.players[0], b = g.players[1];
  g.landOwners[li] = b.tid;

  const am = a.money, bm = b.money;
  const fee = payPass(g, a, li);
  const expect = Math.round(land.price * RULES.passRate);
  check('过路费 = 地价 × 50%（四舍五入）', fee && fee.fee === expect,
    `${land.price} × ${RULES.passRate} = ${expect}`);
  check('过路费从过路人扣、转给地主',
    a.money === am - expect && b.money === bm + expect,
    `A ${am}→${a.money}  B ${bm}→${b.money}`);

  // 自己的地不收费
  g.landOwners[li] = a.tid;
  const a2 = a.money;
  check('自己的地不收费', payPass(g, a, li) === null && a.money === a2);

  // 非土地格不收费
  const st = TRACK.findIndex(c => c.kind === 'zhongzi');
  check('非土地格不收费', payPass(g, a, st) === null);

  /* 过路费只在**最终落点**收：路过他人土地不收费（用户实测反馈）。 */
  const L = TRACK.findIndex((c, i) => i >= 1 && i <= 30 && c.kind === 'land');
  const gL = initGame(4);
  const pL = setActor(gL, 0);
  const ownerL = gL.players[1];
  gL.landOwners[L] = ownerL.tid;
  pL.pos = (L - 1 + TRACK.length) % TRACK.length;
  const mL = pL.money, mOwn = ownerL.money;
  const mvL = stepMove(gL, 2);              // 第 1 步路过 L，第 2 步落到 L+1
  check('路过他人土地不收费',
    pL.pos === (L + 1) % TRACK.length && pL.money === mL && ownerL.money === mOwn
    && !mvL.events.some(e => e.kind === 'pass'),
    `A ${mL}→${pL.money}  B ${mOwn}→${ownerL.money}`);

  const gL2 = initGame(4);
  const pL2 = setActor(gL2, 0);
  const ownerL2 = gL2.players[1];
  gL2.landOwners[L] = ownerL2.tid;
  pL2.pos = (L - 1 + TRACK.length) % TRACK.length;
  const feeL = Math.round(landById(cellAt(L).soilId).price * RULES.passRate);
  const mL2 = pL2.money, mOwn2 = ownerL2.money;
  const mvL2 = stepMove(gL2, 1);            // 正好落在 L
  check('落在他人土地才收过路费（地价 × 50%）',
    pL2.money === mL2 - feeL && ownerL2.money === mOwn2 + feeL
    && mvL2.events.some(e => e.kind === 'pass'),
    `−${mL2 - pL2.money}（应 −${feeL}）`);

  // 起点：经过即奖励（A=50）
  const g2 = initGame(4);
  const pA = setActor(g2, 0);
  pA.pos = TRACK.length - 1;
  const m0 = pA.money;
  stepMove(g2, 1);                       // 31 → 0，正好经过起点
  check('经过起点 +50（普通部落）', pA.money - m0 === RULES.startBonus,
    `+${pA.money - m0}`);

  // D 部落经过起点 +65
  const g3 = initGame(4);
  const pD = setActor(g3, 3);
  pD.pos = TRACK.length - 1;
  const m1 = pD.money;
  stepMove(g3, 1);
  check('经过起点 +65（燕都·丝路商队）', pD.money - m1 === RULES.startBonus + 15,
    `+${pD.money - m1}`);

  // 监狱：只有「落在」才触发，路过不触发
  const jy = TRACK.findIndex(c => c.kind === 'jianyu');
  const g4 = initGame(4);
  const p4 = setActor(g4, 0);
  p4.pos = jy - 1;
  stepMove(g4, 1);                       // 正好落在监狱
  check('落在监狱 → skipTurns=1', p4.skipTurns === 1, `skipTurns=${p4.skipTurns}`);
  const g5 = initGame(4);
  const p5 = setActor(g5, 0);
  p5.pos = jy - 2;
  stepMove(g5, 3);                       // 路过监狱但不落点
  check('路过监狱不触发', p5.skipTurns === 0 && p5.pos === (jy + 1) % TRACK.length,
    `pos=${p5.pos} skipTurns=${p5.skipTurns}`);
}

/* =========================================================
   §3.5 买地
   ========================================================= */
console.log('\n===== §3.5 买地 =====');
{
  const g = initGame(4);
  const a = g.players[0], b = g.players[1];
  const li = firstLand();
  const price = landById(TRACK[li].soilId).price;

  // 不在该格
  a.pos = 0;
  const r1 = buyLand(g, a, li);
  check('拒绝：部落不在该格', !r1.ok && /不在该格/.test(r1.msg), r1.msg);

  // 非土地格
  const st = TRACK.findIndex(c => c.kind === 'zhongzi');
  a.pos = st;
  const r2 = buyLand(g, a, st);
  check('拒绝：该格不是土地', !r2.ok && /不是土地/.test(r2.msg), r2.msg);

  // 成功
  a.pos = li; a.money = 1000;
  const r3 = buyLand(g, a, li);
  check('成功：扣地价 + 写入归属',
    r3.ok && a.money === 1000 - price && g.landOwners[li] === a.tid,
    `−${1000 - a.money}，owner=${g.landOwners[li]}`);

  // 已有主人
  b.pos = li; b.money = 1000;
  const r4 = buyLand(g, b, li);
  check('拒绝：该土地已有主人', !r4.ok && /已有主人/.test(r4.msg), r4.msg);

  // 钱不足
  const li2 = firstLand(c => c.soilId !== TRACK[li].soilId);
  a.pos = li2; a.money = 0;
  const r5 = buyLand(g, a, li2);
  check('拒绝：肥力币不足', !r5.ok && /不足/.test(r5.msg), r5.msg);

  // 免费买地卡
  a.freeLandCards = 1; a.money = 0;
  const r6 = buyLand(g, a, li2, true);
  check('免费买地卡：不扣钱、扣卡、得地',
    r6.ok && r6.free === true && a.money === 0 && a.freeLandCards === 0
    && g.landOwners[li2] === a.tid,
    `freeCards=${a.freeLandCards} owner=${g.landOwners[li2]}`);
}

/* =========================================================
   §3.6 种植
   ========================================================= */
console.log('\n===== §3.6 种植 =====');
{
  const g = initGame(1);
  const p = g.players[0];
  const li = firstLand(c => landById(c.soilId).fertility === '低');   // 容量 1
  const crop = CROPS.find(c => !c.soilMap[TRACK[li].soilId]);

  // 地不属于自己
  const r1 = plant(g, p, li, crop.id);
  check('拒绝：该土地不属于本部落', !r1.ok && /不属于/.test(r1.msg), r1.msg);

  p.lands[li] = { soilId: TRACK[li].soilId, crops: [] };
  g.landOwners[li] = p.tid;
  p.pos = li;                        // 新规则：只能站在该格才能种
  p.money = 500;

  /* 只能给**脚下**的地种：人挪开一格，同一个 plant 必须被拒。 */
  p.pos = (li + 1) % TRACK.length;
  p.seeds = { [crop.id]: 1 };
  const rFar = plant(g, p, li, crop.id);
  check('拒绝：人不在该格（只能给脚下的地种）',
    !rFar.ok && /当前所在/.test(rFar.msg), rFar.msg);
  p.pos = li;                        // 摆回脚下，继续后面的用例

  // 没有种子
  p.seeds = {};
  const r2 = plant(g, p, li, crop.id);
  check('拒绝：没有种子（硬门槛）', !r2.ok && r2.noSeed === true, r2.msg);

  // 成功
  p.seeds = { [crop.id]: 2 };
  const before = p.money;
  const r3 = plant(g, p, li, crop.id);
  check('成功：消耗 1 张种子、cost=0、不扣钱',
    r3.ok && r3.cost === 0 && p.seeds[crop.id] === 1 && p.money === before,
    `seeds=${p.seeds[crop.id]} cost=${r3.cost}`);
  check('成功：地里 +1 片作物', p.lands[li].crops.length === 1);

  // 地块已满（低肥力容量 1）
  const r4 = plant(g, p, li, crop.id);
  check('拒绝：地块已满（肥力容量）', !r4.ok && /最多可种/.test(r4.msg), r4.msg);

  // 本回合已收获 → 不能再种
  harvest(g, p, li);
  p.seeds = { [crop.id]: 2 };
  const r5 = plant(g, p, li, crop.id);
  check('拒绝：本回合已收获过（防刷钱）', !r5.ok && /已经收获过/.test(r5.msg), r5.msg);
  // 新回合清标记后可再种
  stepRoll(g);
  const r6 = plant(g, p, li, crop.id);
  check('新回合清标记后可再种', r6.ok, r6.msg || '');

  /* ---- 片数自选：肥力是**上限**不是指标 ----
     count 可在 1~剩余空位之间自选；n 片 = n 张种子 = n 条记录，每条只记**单片**利润。
     （旧实现一次调用按整块地结算、却只压 1 条记录 —— 连点 3 次 = 3 倍收益。） */
  const gm = initGame(1);
  const pm = gm.players[0];
  const lm = firstLand(c => landById(c.soilId).fertility === '中高');   // 容量 3
  const cm = CROPS.find(c => !c.soilMap[TRACK[lm].soilId]);
  pm.lands[lm] = { soilId: TRACK[lm].soilId, crops: [] };
  gm.landOwners[lm] = pm.tid;
  pm.pos = lm;                       // 新规则：只能站在该格才能种
  pm.seeds = { [cm.id]: 5 };
  const incM = plantingProfit(cm, landById(TRACK[lm].soilId)).income;
  const rm = plant(gm, pm, lm, cm.id, 2);
  check('可自选片数：肥力上限 3，只种 2 片', rm.ok && rm.plots === 2, `plots=${rm.plots}`);
  check('按片消耗种子：种 2 片扣 2 张', pm.seeds[cm.id] === 3, pm.seeds[cm.id] + ' 张');
  check('按片记账：2 片 = 2 条记录，单片 = 整块 ÷ 3',
    pm.lands[lm].crops.length === 2
    && pm.lands[lm].crops.every(c => c.profit === Math.round(incM / 3)),
    JSON.stringify(pm.lands[lm].crops.map(c => c.profit)));
  const fewM = plant(gm, pm, lm, cm.id, 2);     // 只剩 1 个空位
  check('片数超过剩余空位时拒绝', !fewM.ok && /空位/.test(fewM.msg), fewM.msg);
}

/* =========================================================
   §3.7 收获
   ========================================================= */
console.log('\n===== §3.7 收获 =====');
{
  const g = initGame(1);
  const p = g.players[0];
  const li = firstLand(c => landById(c.soilId).fertility === '低');
  const crop = CROPS.find(c => !c.soilMap[TRACK[li].soilId]);
  p.lands[li] = { soilId: TRACK[li].soilId, crops: [] };
  g.landOwners[li] = p.tid;
  p.pos = li;                        // 新规则：只能站在该格才能种
  p.hand = [];
  p.seeds = { [crop.id]: 1 };
  plant(g, p, li, crop.id);

  const before = p.money;
  const h = harvest(g, p, li);
  check('成功：money += total', h.ok && p.money === before + h.total, `+${h.total}`);
  check('成功：地块清空（地保留）', p.lands[li].crops.length === 0);
  check('成功：标记本回合已收获', p.harvestedThisTurn[li] === true);
  check('空地块收获被拒', harvest(g, p, li).ok === false);

  // 结算顺序：部落特长 → 改良卡增益
  const g2 = initGame(1);
  const a = g2.players[0];                 // A 华表：山东棕壤 +90%
  const sd = firstLand(c => c.soilId === 'shandong');
  a.lands[sd] = { soilId: 'shandong', crops: [{ cropId: 'yumi', match: 'good', profit: 100 }] };
  a.hand = ['dimo', 'diguan'];             // 改良：面值 5+10 = 15/20 → +4.5%
  const h2 = harvest(g2, a, sd);
  const expect = Math.round(Math.round(100 * 1.9) * 1.045);   // 先特长(190) 再改良(×1.045) 取整
  check('结算顺序：特长(×1.9) → 改良(按面值折算，取整)',
    h2.total === expect, `${h2.total} vs ${expect}`);
}

/* =========================================================
   §3.8 改良卡
   ========================================================= */
console.log('\n===== §3.8 改良卡 =====');
{
  const g = initGame(1);
  const p = g.players[0];
  check('无卡增益 0%', improveBonus(p).rate === 0);
  p.hand = ['nongyao'];                     // 面值 20（最高）
  check('面值20 单卡 -> +6%', Math.abs(improveBonus(p).rate - 0.06) < 1e-9);
  check('单卡折算率 = 面值/最高面值 × 6%',
    Math.abs(improveCardRate({ value: 5 }) - 0.015) < 1e-9,
    (improveCardRate({ value: 5 }) * 100).toFixed(1) + '%');
  p.hand = new Array(9).fill('nongyao');
  check('上限 +48%（面值20 ×9 封顶）', Math.abs(improveBonus(p).rate - 0.48) < 1e-9);

  // 抽卡进手牌 + 抽到即一次性获得面值肥力币
  const p2 = initGame(1).players[0];
  const n0 = p2.hand.length;
  const m0 = p2.money;
  const im = drawImprove(g, p2);
  check('落改良站抽 1 张进手牌', p2.hand.length === n0 + 1);
  check('抽到即一次性获得该卡面值肥力币', p2.money === m0 + im.value,
    `+${im.value} → ${p2.money}`);
}

/* =========================================================
   §3.9 气象卡
   ========================================================= */
console.log('\n===== §3.9 气象卡 =====');
{
  const g = initGame(1);
  const p = g.players[0];
  check('开局无气象卡', p.weatherCards.length === 0);
  const w = drawWeather(g, p);
  check('气象站发延时卡（不立即结算）', w.delayed === true && p.weatherCards.length === 1);

  const li = firstLand();
  const crop = CROPS.find(c => !c.soilMap[TRACK[li].soilId]);
  p.lands[li] = { soilId: TRACK[li].soilId, crops: [] };
  g.landOwners[li] = p.tid;
  p.pos = li;                        // 新规则：只能站在该格才能种
  p.seeds = { [crop.id]: 2 };
  const rp = plant(g, p, li, crop.id);
  check('种植时自动发动（一次性）', !!rp.weather && p.weatherCards.length === 0,
    rp.weather ? rp.weather.name : '(未触发)');
  const rp2 = plant(g, p, li, crop.id);
  check('第二次种植不再触发（已用掉）', (rp2.weather || null) === null);

  // 不种植则卡一直留着
  const g2 = initGame(1), q = g2.players[0];
  drawWeather(g2, q); drawWeather(g2, q);
  check('不种植时卡一直留着（延时语义）', q.weatherCards.length === 2);
}

/* =========================================================
   §3.10 种子集市
   ========================================================= */
console.log('\n===== §3.10 种子集市 =====');
{
  const g = initGame(4);
  check('集市每次摆 marketSize 种', marketCrops(g).length === RULES.marketSize);

  // 囤卡上限
  const p = g.players[0];
  p.money = 9999;
  p.seeds = {};
  let guard = 0;
  while (buyCrop(g, p, 'yumi').ok && guard++ < 10) { /* 买到满 */ }
  check('单一作物囤卡上限 = seedMaxPerType',
    p.seeds.yumi === RULES.seedMaxPerType, `yumi=${p.seeds.yumi}`);
  check('超上限再买被拒', buyCrop(g, p, 'yumi').ok === false);

  // 种子卡合计上限：每个部落最多同时带 seedMaxTotal 张（集市购买总量上限）
  const pt = g.players[2];
  pt.money = 9999; pt.seeds = {};
  const ms = marketCrops(g);
  for (let k = 0; k < 3; k++) { buyCrop(g, pt, ms[k].id); buyCrop(g, pt, ms[k].id); } // 2×3 = 6
  const tot = Object.values(pt.seeds).reduce((a, b) => a + b, 0);
  check('种子卡合计上限 = seedMaxTotal', tot === RULES.seedMaxTotal, `total=${tot}`);
  check('合计达上限后买任何作物都被拒', buyCrop(g, pt, ms[3].id).ok === false);

  // B 部落水稻种子成本减半
  const b = g.players[1];
  b.money = 1000; b.seeds = {};
  const cost = cropById('shuidao').cost;
  const expect = traitSeedCost(b, 'shuidao', cost);
  const before = b.money;
  const rb = buyCrop(g, b, 'shuidao');
  check('古蜀·水稻种子成本减半',
    rb.ok && expect === Math.round(cost * 0.5) && b.money === before - expect,
    `${cost} → ${expect}`);
}

/* =========================================================
   §3.12 胜负
   ========================================================= */
console.log('\n===== §3.12 胜负 =====');
{
  const g = initGame(1);
  const p = g.players[0];
  stepEnd(g);
  check('未达线不判胜', g.over === false);

  const g2 = initGame(1);
  const q = g2.players[0];
  q.money = RULES.winMoney;
  stepEnd(g2);
  check('达到 winMoney 判胜并记录 winner', g2.over === true && g2.winner === q,
    `winner=${g2.winner ? g2.winner.name : '(无)'}`);
}

/* =========================================================
   §4 部落特长（引擎函数层）
   ========================================================= */
console.log('\n===== §4 部落特长 =====');
{
  const g = initGame(4);
  g.players.forEach(p => { p.trait = { ...p.trait }; });
  const A = g.players[0], B = g.players[1], D = g.players[3];

  check('A 华表·华北平原收获 ×1.9',
    traitHarvestBonus(A, 'shandong', 'yumi', 100).profit === 190);
  check('A 华表·其他土壤无加成',
    traitHarvestBonus(A, 'heilitu', 'yumi', 100).profit === 100);

  const sc = cropById('shuidao').cost;
  check('B 古蜀·水稻种子成本减半',
    traitSeedCost(B, 'shuidao', sc) === Math.round(sc * 0.5));
  check('B 古蜀·水稻收获 ×1.25',
    traitHarvestBonus(B, 'jiangnan', 'shuidao', 100).profit === 125);
  check('B 古蜀·非水稻无种子折扣',
    traitSeedCost(B, 'yumi', 20) === 20);

  check('D 燕都·经过起点额外 +15',
    traitStartBonus(D) === RULES.startBonus + 15, `${traitStartBonus(D)}`);
  check('A 华表·经过起点仍 +50', traitStartBonus(A) === RULES.startBonus);
}

console.log(`\n===== 结果：${fails === 0 ? '全部通过 ✓' : fails + ' 项失败 ✗'} =====`);
process.exit(fails === 0 ? 0 : 1);