/**
 * 菜农部落 · 游戏引擎
 * 纯逻辑，不依赖 DOM，可单独在控制台里跑数值平衡测试。
 */
import {
  RULES, LANDS, CROPS, IMPROVES, WEATHERS, STATIONS, TRACK, TRIBES,
  IMPROVE_VALUE_MAX,
  landById, cropById, cropByName, improveById, soilMatch, plantingProfit,
  plotsFor, FERTILITY_PLOTS, START_BONUS, TRIBE_TRAITS, pawnUri
} from './data.js';
import {
  makeTribeDict, seedCount as dictSeedCount, takeSeed, hasAnySeed,
  addSeed, addImprove, dropImproveTo, addWeather, shiftWeather,
  addLand, getLand, countLands, markHarvested, harvestedThisTurn,
  clearHarvestMarks, dictSummary
} from './tribes.js';

let uid = 0;
const nid = () => ++uid;

/* ============ 洗牌 ============ */
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 抽 n 张（不放回） */
export function draw(deck, n) {
  return shuffle(deck).slice(0, n);
}

/* ============ 状态初始化 ============ */
/**
 * @param {number} playerCount
 * @param {object} [opts]
 * @param {number[]} [opts.startMoney] 四个部落的初始肥力币（对局设置里手动定）；
 *                                     缺省则用 150 + 按行动次序发的先手补偿
 *                                     START_BONUS[order 位置]，不是按座位号。
 */
/** 开局发基础种子卡：抽 3 张候选，取其中 2 张入库（其余只能靠集市买） */
export function dealSeedCards() {
  const pool = shuffle(CROPS.map(c => c.id));
  const drawn = pool.slice(0, RULES.seedDraw);       // 抽 3 张候选
  const keep = drawn.slice(0, RULES.seedKeep);       // 其中 2 张入库
  const hand = {};
  keep.forEach(id => { hand[id] = 1; });
  return { hand, drawn, keep };
}

/* =========================================================
   开局：造 4 个「部落字典」+ 一份牌局状态
   ---------------------------------------------------------
   字典的形状全部由 tribes.js 的 makeTribeDict 决定，
   这里只负责「发牌」——往字典的种子里栏填初始内容。
   所有规则判定都在下面的框架函数里，不在这。
   ========================================================= */
export function initGame(playerCount = RULES.tribes, opts = {}) {
  uid = 0;
  const moneyArr = Array.isArray(opts.startMoney) ? opts.startMoney : null;
  const players = TRIBES.slice(0, playerCount).map((t, i) => {
    const deal = dealSeedCards();
    /* 用字典工厂造一个空字典，再往栏目里填开局内容 */
    const dict = makeTribeDict(t.id,
      moneyArr
        ? Math.min(3000, Math.max(0, Math.round(Number(moneyArr[i]) || 0)))
        : RULES.startMoney);
    dict.seeds = deal.hand;         // 种子栏目
    dict.seedDrawn = deal.drawn;    // 记录候选（仅日志展示用）
    return dict;
  });

  /* 行动顺序：**每局随机打乱**（Fisher-Yates）。
     早先固定 A→B→C→D，四个部落的先手优势完全一样、每局都一样，
     现在每局重新抽签，且顺序公示在顶栏（本回合顺序），玩家随时知道谁先谁后。
     order 是座位索引数组；turn 是「当前轮到 order 里的第几个人」。 */
  const order = shuffle(players.map((_, i) => i));

  /* 先手补偿按「行动次序」发，不是按座位 —— order 里第 k 位行动的部落
     拿 START_BONUS[k]。行动顺序已改成每局随机，若仍按座位号 i 发补偿，
     补偿对象与真正的先/后手完全错位：座位 3（燕都）每局白拿 +60、
     座位 0（长安）拿 0，胜率被直接拉开（实测 spread 8% → 37%）。
     手动设了初始肥力币时不再叠加补偿。 */
  if (!moneyArr) order.forEach((seat, k) => { players[seat].money += (START_BONUS[k] || 0); });
  return {
    players,
    order,                     // 本回合的行动顺序（座位索引）
    turn: 0,                   // order 里第几个（不是座位号）
    round: 1,
    over: false,
    winner: null,
    landOwners: {},            // trackIndex -> tid
    weatherDeck: shuffle(WEATHERS.map(w => w.id)),
    improveDeck: shuffle(IMPROVES.map(i => i.id)),
    marketStock: shuffle(CROPS.map(c => c.id)),
    log: []
  };
}

/* ============ 部落特长结算 ============ */

/**
 * 收获时按部落特长算加成，返回新的收益额。
 *  - 土地类（A 华表）：土壤在特长列表里 -> 收益 ×(1+rate)
 *  - 作物类（B 三星堆）：作物在特长列表里 -> 收益 ×(1+gainRate)
 */
export function traitHarvestBonus(player, soilId, cropId, profit) {
  const tr = player && player.trait;
  if (!tr) return { profit, label: '' };
  let out = profit;
  const tags = [];
  if (tr.landBonus && tr.landBonus.lands.includes(soilId)) {
    out = Math.round(out * (1 + tr.landBonus.rate));
    tags.push(`${tr.name} +${Math.round(tr.landBonus.rate * 100)}%`);
  }
  if (tr.cropBonus && tr.cropBonus.crops.includes(cropId)) {
    out = Math.round(out * (1 + tr.cropBonus.gainRate));
    tags.push(`${tr.name} +${Math.round(tr.cropBonus.gainRate * 100)}%`);
  }
  return { profit: out, label: tags.join(' · ') };
}

/** 种植时按部落特长算实际种子成本（B 部落水稻打折） */
export function traitSeedCost(player, cropId, cost) {
  const tr = player && player.trait;
  if (tr && tr.cropBonus && tr.cropBonus.crops.includes(cropId)) {
    return Math.max(0, Math.round(cost * (1 + tr.cropBonus.costRate)));
  }
  return cost;
}

/** 经过起点时的奖励（D 部落丝路商队额外加成） */
export function traitStartBonus(player) {
  const tr = player && player.trait;
  return RULES.startBonus + ((tr && tr.startBonus) || 0);
}

/* ============ 日志 ============ */
export function log(g, msg, kind = 'info') {
  const line = { round: g.round, turn: g.turn + 1, msg, kind, ts: Date.now() };
  g.log.push(line);
  const p = curPlayer(g);
  if (p) p.log.push(line);
  if (g.log.length > 300) g.log.shift();
  return line;
}

/* ============ 掷骰 ============ */
export function rollDice(count = RULES.diceCount) {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
}
export const diceTotal = (d) => d.reduce((a, b) => a + b, 0);

/* ============ 移动 ============ */
/** 返回经过的格子索引列表（含起点） */
export function moveTo(g, player, steps) {
  const n = TRACK.length;
  const passed = [];
  for (let i = 0; i < steps; i++) {
    player.pos = (player.pos + 1) % n;
    passed.push(player.pos);
  }
  return passed;
}

export function cellAt(idx) {
  return TRACK[((idx % TRACK.length) + TRACK.length) % TRACK.length];
}

/* ============ 过路费 ============ */
export function payPass(g, player, idx) {
  const owner = g.landOwners[idx];
  if (!owner || owner === player.tid) return null;
  const cell = cellAt(idx);
  if (cell.kind !== 'land') return null;
  const land = landById(cell.soilId);
  const fee = Math.round(land.price * RULES.passRate);
  const ownerPlayer = g.players.find(p => p.tid === owner);
  player.money -= fee;
  ownerPlayer.money += fee;
  log(g, `${player.name} 落在 ${ownerPlayer.name} 的${land.name}，支付过路费 ${fee}（地价 ${land.price} × ${RULES.passRate * 100}%）`, 'warn');
  checkBankrupt(g, player);      // 付完过路费可能欠款超标 -> 破产退出
  return { fee, to: ownerPlayer };
}

/* ============ 破产（欠款上限） ============
   部落允许「欠款」：money 可以为负，下限 = −RULES.debtLimit（默认 50）。
   一旦欠款**超过**上限（money < −debtLimit），该部落宣告破产、退出本局：
     · 名下土地全部回归无主，别的部落可以再买；
     · 不再参与换手（endTurn 跳过），也不再参与胜负；
     · 其他部落继续游戏，直到只剩 1 个未破产部落由它获胜（见 stepEnd）。
   目前唯一会把钱包打到负数的途径是「付过路费」（买地/买卡都有钱数门槛）。 */
export function checkBankrupt(g, player) {
  if (!player || player.bankrupt) return false;
  if (player.money >= -RULES.debtLimit) return false;
  player.bankrupt = true;
  /* 土地回归无主，避免别人把过路费付给一个已出局的部落 */
  for (const key of Object.keys(player.lands || {})) delete g.landOwners[Number(key)];
  player.lands = {};
  log(g, `💀 ${player.name} 欠款 ${-player.money} 超过上限 ${RULES.debtLimit}，宣告破产退出本局`, 'bad');
  return true;
}

/** 仍在局中（未破产）的部落 */
export function activePlayers(g) {
  return g.players.filter(p => !p.bankrupt);
}

/* ============ 买地 ============ */
export function buyLand(g, player, idx, useFreeCard = false) {
  const cell = cellAt(idx);
  if (cell.kind !== 'land') return { ok: false, msg: '该格不是土地' };
  if (g.landOwners[idx]) return { ok: false, msg: '该土地已有主人' };
  if (player.pos !== idx) return { ok: false, msg: '部落不在该格' };

  const land = landById(cell.soilId);
  if (useFreeCard && player.freeLandCards > 0) {
    player.freeLandCards--;
    addLand(player, idx, land.id);
    g.landOwners[idx] = player.tid;
    log(g, `${player.name} 使用免费买地卡，获得${land.name}（原价 ${land.price}）`, 'good');
    return { ok: true, free: true, land };
  }
  if (player.money < land.price) {
    return { ok: false, msg: `肥力币不足（需 ${land.price}，现有 ${player.money}）` };
  }
  player.money -= land.price;
  addLand(player, idx, land.id);
  g.landOwners[idx] = player.tid;
  log(g, `${player.name} 花费 ${land.price} 肥力币购入${land.name}`, 'buy');
  return { ok: true, land };
}

/* ============ 种植 ============ */
/* =========================================================
   框架函数：种植
   ---------------------------------------------------------
   这是「规则」的唯一实现处。四个部落共用这一份代码，
   差异只来自各自的**字典内容**（手里有什么种子、地里种过什么）。

   前置门槛（缺一不可）：
     ① 站在这块地上、且地是自己的
     ② 这块地本回合还没收获过（每回合每地只能种一轮）
     ③ 地块还有空位，且本次片数 1 ≤ count ≤ 剩余空位
     ④ **手里有该作物的种子卡，且够本次要种的片数** ← 硬门槛，一片一张

   ⚠ 肥力只决定「最多能种几片」，**不强制种满**：count 由玩家自选（1~剩余空位）。
   早先的实现一次调用就按「整块地」结算收益、却只压入 1 条记录，
   于是中高肥力（3 片）的地连点 3 次 = 拿到 3 倍收益，是明显的刷钱漏洞。
   现在改成**按片**：n 片 = n 张种子卡 = n 条作物记录，每条只记单片利润。
   ========================================================= */
export function plant(g, player, idx, cropId, count = 1) {
  /* ---- 读字典：土地栏目 ---- */
  const rec = getLand(player, idx);
  if (!rec) return { ok: false, msg: '该土地不属于本部落' };
  /* ---- 规则 ①：只能站在这块地上种 ----
     部落走不到的地种不了：站在 a 地时不能在远方的 b 地种植。
     与买地 buyLand 的「部落不在该格」同一把尺子（用户实测反馈）。 */
  if (player.pos !== idx) {
    return { ok: false, msg: '只能在自己当前所在的土地上种植' };
  }
  const land = landById(rec.soilId);
  const crop = cropById(cropId);
  if (!crop) return { ok: false, msg: '作物不存在' };

  /* ---- 规则 ②：每回合每块地只能种一轮 ----
     没有这条时，玩家可以「种一块→立刻收→再种」的无限循环，
     沙土（低肥力 1 片）反而成了刷钱最快的地方，与现实不符。 */
  if (harvestedThisTurn(player, idx)) {
    return { ok: false, msg: `${land.name}本回合已经收获过一轮，要等下个回合才能再种` };
  }

  /* ---- 规则 ③：地块容量（肥力越低片数越少） ----
     容量是上限不是指标：想留空位、种子不够、只想试种一片，都可以少种。 */
  const capacity = plotsFor(land.fertility);
  const room = capacity - rec.crops.length;
  if (room <= 0) {
    return { ok: false, msg: `${land.name}为${land.fertility}肥力，最多可种${capacity}片` };
  }
  let n = Math.round(Number(count));
  if (!Number.isFinite(n) || n < 1) n = 1;          // 缺省 / 非法值 → 1 片
  if (n > room) {
    return { ok: false, msg: `${land.name}只剩 ${room} 个空位，最多再种 ${room} 片` };
  }

  /* ---- 规则 ④：必须有该作物的种子，且**一片一张** ----
     早先的规则是「有钱就能种」，种子卡只是个「省钱道具」——
     于是玩家能凭空种出从没买过的作物，种子集市/囤卡这条线完全失效。
     现在：手里没有这种种子 = 不能种；种 n 片就要 n 张种子卡。 */
  const stock = dictSeedCount(player, cropId);
  if (stock <= 0) {
    return {
      ok: false, noSeed: true,
      msg: `没有${crop.name}种子 —— 请先到种子集市购买（或等抽到基础种子卡）`
    };
  }
  if (stock < n) {
    return {
      ok: false, noSeed: true,
      msg: `${crop.name}种子只剩 ${stock} 张，不够种 ${n} 片（一片要 1 张种子卡）`
    };
  }

  /* ---- 算收益（**按片**） ----
     种子钱在**买卡时**已付，种植环节不再重复扣，所以 cost 恒为 0；
     单片利润 = plantingProfit.income ÷ plots = yieldPerPlot
     （等价于「把省下的这一片种子成本加回去」）。 */
  const p = plantingProfit(crop, land);
  const perPlot = p.yieldPerPlot;
  const cost = 0;

  /* ---- 延时气象卡：拿到手后**下一次种植**自动发动（一次性） ----
     只加在**第一片**上（不是每片都加）：卡是一次性的，用掉即消失。
     这一回合不种植，卡就一直留着（符合「延时」设定）。 */
  let weatherHit = null;
  const wc = shiftWeather(player);          // 取出并移除（一次性）
  if (wc) {
    const w = WEATHERS.find(x => x.id === wc);
    if (w) weatherHit = w;
  }

  /* ---- 写回字典：n 片 = n 条作物记录 ---- */
  player.money -= cost;                       // 恒为 0，仍保留以备将来收费规则
  takeSeed(player, cropId, n);                // 种子栏目 −n
  for (let i = 0; i < n; i++) {
    const wx = (weatherHit && i === 0) ? weatherHit : null;
    rec.crops.push({
      cropId, match: p.match,
      profit: perPlot + (wx ? wx.base : 0),
      weather: wx ? wx.id : null
    });
  }

  const wtag = weatherHit
    ? `，触发气象「${weatherHit.name}·${weatherHit.sub}」${weatherHit.base >= 0 ? '+' : ''}${weatherHit.base}`
    : '';
  log(g, `${player.name} 在${land.name}种下 ${n} 片${crop.name}`
    + `（${p.match === 'good' ? '适配土壤' : '非适配土壤'}），消耗 ${n} 张种子卡${wtag}`, 'plant');
  return {
    ok: true, plots: n, match: p.match, cost, perPlot,
    profit: perPlot * n + (weatherHit ? weatherHit.base : 0),
    fromStock: true, weather: weatherHit
  };
}
/* ============ 结算收获 ============ */
export function harvest(g, player, idx) {
  const rec = getLand(player, idx);          // 读土地栏目
  if (!rec || !rec.crops.length) return { ok: false, msg: '该土地没有作物' };

  /* 改良卡改为「持有即增益」：手上有多少张，收获时按比例加成；
     不种作物就自然没有收益（增益只在 harvest 里结算）。 */
  const imp = improveBonus(player);

  let total = 0, raw = 0, afterTrait = 0;
  const detail = [];
  for (const c of rec.crops) {
    const crop = cropById(c.cropId);
    raw += c.profit;
    // 部落特长：土地类 / 作物类收益加成
    const b = traitHarvestBonus(player, rec.soilId, c.cropId, c.profit);
    // 改良卡增益（在部落特长之后叠加）。必须取整：0.06 的倍数是浮点数，
    // 不 round 会让钱数变成 250.26000000000002 这种，直接印在玩家面板上。
    const v = imp.rate > 0 ? Math.round(b.profit * (1 + imp.rate)) : b.profit;
    afterTrait += b.profit;
    total += v;
    detail.push({
      name: crop.name, profit: v, raw: c.profit, match: c.match,
      bonus: b.label, weather: c.weather ? c.weather : null,
    });
  }
  player.money += total;
  rec.crops = [];                     // 土地栏目清空（地还在，作物收了）
  markHarvested(player, idx);         // 本回合这块地已收过 -> 同一回合不能再种

  const land = landById(rec.soilId);
  const parts = [];
  if (total - raw !== 0) {
    const who = [player.trait ? player.trait.name : '', imp.label].filter(Boolean).join(' + ');
    parts.push(`（含${who}加成 ${raw >= 0 ? '+' : ''}${total - raw}）`);
  }
  const tag = parts.join('');
  const wx = detail.filter(d => d.weather).map(d => {
    const w = WEATHERS.find(x => x.id === d.weather);
    return w ? w.name : null;
  }).filter(Boolean);
  const wtag = wx.length ? `，其中 ${wx.join('、')} 气象已生效` : '';
  log(g, `${player.name} 收获${land.name}：${detail.map(d => `${d.name}${d.profit >= 0 ? '+' : ''}${d.profit}`).join('、')}，合计 ${total >= 0 ? '+' : ''}${total}${tag}${wtag}`, total >= 0 ? 'good' : 'bad');
  return { ok: true, total, raw, detail, improveBonus: imp.rate };
}

/**
 * 单张改良卡的持有增益率：按**面值折算**。
 *   面值 20（最高）→ +6%；面值 5（最低）→ +1.5%。
 *   公式 =（value / 当前改良卡最高面值）× 6%
 */
export function improveCardRate(im) {
  if (!im) return 0;
  return (im.value / IMPROVE_VALUE_MAX) * 0.06;
}

/**
 * 改良卡持有增益：把手里每张卡的「面值折算率」加起来，封顶 +48%。
 * 面值越高、持有得越多，加成越高；不种作物自然没有收益。
 * 玩家可以主动弃掉多余的卡（弃牌不产生增益）。
 */
export function improveBonus(player) {
  const hand = player.hand || [];            // 改良栏目
  const rate = Math.min(0.48, hand.reduce((s, id) => s + improveCardRate(improveById(id)), 0));
  return { count: hand.length, rate, label: hand.length ? `改良卡×${hand.length}` : '' };
}

/* ============ 改良卡 ============ */
/** 从改良牌堆抽 1 张到手上：**抽到的瞬间一次性获得该卡面值肥力币** */
export function drawImprove(g, player) {
  if (!g.improveDeck.length) g.improveDeck = shuffle(IMPROVES.map(i => i.id));
  const id = g.improveDeck.pop();
  addImprove(player, id);
  const im = improveById(id);
  player.money += im.value;                  // 一次性到账（面值）
  log(g, `${player.name} 抽到改良卡「${im.name}」（${im.station}），立即获得 ${im.value} 肥力币；`
    + `持有期间按面值增加收获收益（+${(improveCardRate(im) * 100).toFixed(1).replace(/\.0$/, '')}%）`, 'draw');
  return im;
}

/* ============ 气象 ============ */
/**
 * 气象站：抽一张气象卡**存进延时卡槽**，不立即结算。
 * 新规则：拿到卡后，下一次「种植」时自动发动（一次性，用掉即消失）；
 *         如果这一回合没做任何种植，卡就留着，不会自动结算。
 * 玩家因此可以「攒着不用」，也可以刻意留着到关键地块再种。
 */
export function drawWeather(g, player) {
  if (!g.weatherDeck.length) g.weatherDeck = shuffle(WEATHERS.map(w => w.id));
  const id = g.weatherDeck.pop();
  const w = WEATHERS.find(x => x.id === id);

  if (!player.weatherCards) player.weatherCards = [];
  addWeather(player, w.id);
  const pending = player.weatherCards.length;

  const msg = `抽到延时气象卡「${w.name}·${w.sub}」${w.base >= 0 ? '+' : ''}${w.base}` +
    `（将在你下一次种植时自动生效，目前待发 ${pending} 张）`;
  log(g, `${player.name} ${msg}`, w.sign > 0 ? 'good' : 'bad');
  return { weather: w, total: w.base, pending, delayed: true };
}

/* ============ 买作物卡（种子集市） ============ */
/**
 * 买一张作物卡进手牌（player.seeds）。
 * 集市每次只摆 g.marketStock 前 MARKET_SIZE 种，牌面洗过所以每局不同。
 * 种地时优先消耗手牌种子（钱已在买卡时付过，不再重复扣）。
 */
export function buyCrop(g, player, cropId) {
  const crop = cropById(cropId);
  if (!crop) return { ok: false, msg: '作物不存在' };
  if (dictSeedCount(player, cropId) >= RULES.seedMaxPerType) {
    return { ok: false, msg: `「${crop.name}」最多囤 ${RULES.seedMaxPerType} 张` };
  }
  if (seedsTotal(player) >= RULES.seedMaxTotal) {
    return { ok: false, msg: `种子卡最多同时持有 ${RULES.seedMaxTotal} 张` };
  }
  /* 部落特长的「种子折扣」作用在**买卡价格**上 */
  const price = traitSeedCost(player, cropId, crop.cost);
  if (player.money < price) {
    return { ok: false, msg: `肥力币不足（种子 ${price}，现有 ${player.money}）` };
  }
  player.money -= price;
  addSeed(player, cropId, 1);              // 种子栏目 +1
  log(g, `${player.name} 在种子集市买下作物卡「${crop.name}」，−${price} 肥力币`, 'buy');
  return { ok: true, crop, price, held: dictSeedCount(player, cropId) };
}

/** 手里某作物的种子数 */
export function seedCount(player, cropId) {
  return (player.seeds && player.seeds[cropId]) || 0;
}

/** 手里全部作物种子卡合计张数（各类型求和）—— 集市购买总量上限用 */
export function seedsTotal(player) {
  return Object.values(player.seeds || {}).reduce((a, b) => a + b, 0);
}

/** 集市当前在售的作物卡（按当次摆货顺序） */
export function marketCrops(g) {
  return (g.marketStock || []).slice(0, RULES.marketSize).map(cropById).filter(Boolean);
}

/* ============ 回合：分步执行 ============
   一整回合拆成 ①掷骰 ②移动 ③落格结算 ④决策 ⑤收尾 五步。
   playTurn 是它们的同步组合（引擎测试仍走这条）；
   UI 则逐步调用，好让电脑行动时每一步之间能停下来播报。
   ============================================ */

/** ① 回合开始：监狱判定 + 掷骰 */
export function stepRoll(g) {
  if (g.over) return { over: true, skipped: false, events: [] };
  const player = curPlayer(g);
  const events = [];
  /* 破产部落直接跳过（正常流程下 endTurn 已不会轮到它，这里再兜一层） */
  if (player.bankrupt) return { skipped: true, dice: [], steps: 0, player, events };
  // 回合开始刷新「追加掷骰」机会（琵琶部落「追风千里」）
  // 800 局模拟：每回合都能追风 -> C 胜率 33%（过强）；改成每 2 回合一次 -> 约 25%
  player.extraRollLeft = 0;
  /* 新回合开始：清空「本回合已收获」的标记，
     这样上一轮「种→收」的地在这一轮又能种了。 */
  clearHarvestMarks(player);
  if (player.trait && player.trait.extraRoll) {
    const every = Math.max(1, player.trait.extraRollEvery || 1);
    if ((player.extraRollCd || 0) <= 0) {
      player.extraRollLeft = player.trait.extraRoll;
      player.extraRollCd = every;
    }
    player.extraRollCd = Math.max(0, (player.extraRollCd || 0) - 1);
  }
  if (player.skipTurns > 0) {
    player.skipTurns--;
    /* 别把递减后的数字印出来：这里已经变 0 了，写「暂停 0 回合后继续」
       是句自相矛盾的话（人类逻辑验收 F4 抓到的）。监狱固定停 1 回合，
       直接说「本回合暂停」即可。 */
    const l = log(g, `${player.name} 正在监狱服刑，本回合暂停行动`, 'prison');
    events.push({ kind: 'prison', msg: l.msg });
    return { skipped: true, dice: [], steps: 0, player, events };
  }
  const dice = rollDice();
  const steps = diceTotal(dice);
  const l = log(g, `${player.name} 掷出 ${dice.join(' + ')} = ${steps} 步`, 'dice');
  events.push({ kind: 'dice', dice, steps, msg: l.msg });
  return { skipped: false, dice, steps, player, events };
}

/**
 * ①b 追加掷骰（琵琶部落「追风千里」）：
 * 每回合限一次，额外投 1 颗「追风骰」（1~3 点）并把点数加进步数。
 * 用 1~3 点的特制骰而非标准 d6 —— 50 局模拟里标准骰让 C 部落胜率飙到 50%，
 * 换成半边骰后步数优势约 +29%，落在可接受区间。
 */
export function stepExtraRoll(g) {
  const player = curPlayer(g);
  if (!player || !player.extraRollLeft || player.extraRollLeft <= 0) {
    return { ok: false, dice: [], steps: 0, events: [] };
  }
  player.extraRollLeft--;
  const max = (player.trait && player.trait.extraRollMax) || 3;
  const dice = [Math.floor(Math.random() * max) + 1];   // 追风骰：1~max 点
  const steps = diceTotal(dice);
  const l = log(g, `${player.name} 追风再投 ${dice[0]} 点，再走 ${steps} 步`, 'dice');
  return { ok: true, dice, steps, player, events: [{ kind: 'dice', dice, steps, msg: l.msg }] };
}

/** ② 移动 + 逐格结算（经过起点 / 过路费 / 撞监狱） */
export function stepMove(g, steps) {
  const player = curPlayer(g);
  const events = [];
  const passed = moveTo(g, player, steps);

  const startIdx = TRACK.findIndex(c => c.kind === 'start');
  if (passed.includes(startIdx)) {
    const bonus = traitStartBonus(player);       // D 部落丝路商队有额外加成
    player.money += bonus;
    const extra = bonus - RULES.startBonus;
    const tag = extra > 0 ? `（含${player.trait.name} +${extra}）` : '';
    const l = log(g, `${player.name} 经过起点，+${bonus} 肥力币${tag}`, 'good');
    events.push({ kind: 'start', idx: startIdx, msg: l.msg });
  }

  /* 过路费只在**最终落点**收取：路过他人土地不收费。
     （早先对 passed 里每一块土地都收费 —— 走两步经过别人的地也要交钱，
     与桌游「落在格子上才结算」的规则不符，用户实测反馈。）
     撞监狱同理：只有落点才是监狱才生效，路过不算。 */
  for (const idx of passed) {
    const cell = cellAt(idx);
    if (idx !== player.pos) continue;
    if (cell.kind === 'land') {
      const fee = payPass(g, player, idx);
      if (fee) events.push({ kind: 'pass', msg: `支付过路费 ${fee.fee}`, idx });
    } else if (cell.kind === 'jianyu') {
      player.skipTurns = 1;
      const l = log(g, `${player.name} 到达监狱，下回合暂停行动`, 'prison');
      events.push({ kind: 'prison', msg: l.msg, idx });
    }
  }
  return { passed, events, player };
}

/** ③ 落格结算：土地归属播报 / 站点效果 */
export function stepSettle(g) {
  const player = curPlayer(g);
  const events = [];
  const cell = cellAt(player.pos);

  if (cell.kind === 'land') {
    const land = landById(cell.soilId);
    const owner = g.landOwners[player.pos];
    const owned = owner ? (owner === player.tid ? 'own' : 'other') : 'free';
    const msg = owned === 'free' ? `落在无主土地「${land.name}」，地价 ${land.price} 肥力币`
      : owned === 'own' ? `回到自己的「${land.name}」`
        : `落在「${g.players.find(p => p.tid === owner).name}」的「${land.name}」`;
    log(g, msg, 'land');
    events.push({ kind: 'land', idx: player.pos, land, owned, msg });
  } else {
    const st = STATIONS[cell.id];
    log(g, `到达${st.name}：${st.desc}`, 'station');
    events.push({ kind: 'station', station: st, idx: player.pos,
      msg: `到达${st.name}：${st.desc}` });

    if (cell.kind === 'qixiang') {
      const r = drawWeather(g, player);
      events.push({ kind: 'weather', weather: r.weather, total: r.total, pending: r.pending, delayed: true,
        msg: `抽到延时气象卡「${r.weather.name}·${r.weather.sub}」${r.total >= 0 ? '+' : ''}${r.total}（下次种植时自动生效）` });
    } else if (cell.kind === 'nongji') {
      const im = drawImprove(g, player);
      events.push({ kind: 'improve', improve: im,
        msg: `抽到改良卡「${im.name}」（${im.station}，${im.gain}）—— 立即获得 ${im.value} 肥力币，持有期间按面值折算增加收获收益` });
    } else if (cell.kind === 'zhongzi') {
      events.push({ kind: 'market', msg: '进入种子集市，可购买作物卡' });
    }
  }
  return { events, player };
}

/** ④ 执行一个 AI 决策动作（由 aiTurnPlan 生成的闭包调用，见下） */
export function stepAi(g, act) {
  if (!act) return { events: [] };
  const ev = act();
  return { events: ev ? [ev] : [] };
}

/** ⑤ 收尾：胜负判定 + 换手 */
export function stepEnd(g) {
  if (g.over) { return { events: [], over: true, winner: g.winner }; }
  const player = curPlayer(g);
  const events = [];
  if (player.money >= RULES.winMoney) {
    // 条件一：达到胜利线即获胜，游戏结束
    g.over = true;
    g.winner = player;
    events.push({ kind: 'win', msg: `🎉 ${player.name} 达到 ${RULES.winMoney} 肥力币，获胜！` });
    log(g, `🎉 ${player.name} 获胜！`, 'win');
  } else {
    // 条件二：其他部落全部破产 -> 最后幸存的部落获胜
    const alive = activePlayers(g);
    const eliminated = g.players.length - alive.length;
    if (alive.length === 1 && eliminated > 0) {
      g.over = true;
      g.winner = alive[0];
      events.push({ kind: 'win', msg: `🏆 其他部落全部破产，${alive[0].name} 成为最后幸存的部落，获胜！` });
      log(g, `🏆 ${alive[0].name} 是最后幸存的部落，获胜！`, 'win');
    } else if (alive.length === 0) {
      g.over = true;
      g.winner = null;
      events.push({ kind: 'win', msg: '所有部落均已破产，本局无人获胜' });
      log(g, '所有部落均已破产，本局无人获胜', 'bad');
    }
  }
  endTurn(g);
  return { events, over: g.over, winner: g.winner };
}

/* ============ 完整回合（同步组合） ============ */
/**
 * 执行一个玩家的完整回合 —— **与 UI 的 runAiTurn() 严格同序**（单一状态机）：
 *   ① 掷骰（含监狱判定）
 *   ①b 追风（若可用）：**在走棋之前**把追风点数并入总步数
 *   ② 一次走完总步数
 *   ③ 落格结算
 *   ④ 落格操作（买地/种植/收获/用卡）← 决策统一放在移动之后
 *   ⑤ 收尾换手
 *
 * 为什么要这样排：真人就是「投了骰子、走到格子上，再决定做什么」。
 * 早先 playTurn 把决策放在掷骰之前（对「上回合落点」决策），
 * 与 UI 的实际流程不一致，导致 balance 测试测的是另一套规则。
 * 现在两边共用同一套 step 原语、同一个顺序，AI 与真人行为一致。
 */
export function playTurn(g, aiMove = null) {
  if (g.over) return { events: [] };
  const events = [];
  const player = curPlayer(g);

  // ① 掷骰（监狱/胜负判定在这里）
  const r = stepRoll(g);
  events.push(...r.events);
  if (r.skipped || r.over) {
    endTurn(g);
    return { events, skipped: true };
  }

  // ①b 追风：必须在走棋之前，点数并入本回合总步数（一次走完，不分两段跳）
  let total = r.steps;
  if (player.extraRollLeft > 0 && !g.over) {
    const ex = stepExtraRoll(g);
    if (ex.ok) { events.push(...ex.events); total += ex.steps; }
  }

  // ② 一次走完 + ③ 落格结算
  events.push(...stepMove(g, total).events);
  events.push(...stepSettle(g).events);

  // ④ 落格操作：决策在移动之后（与真人/UI 一致）
  if (aiMove && !g.over) {
    const cell = cellAt(player.pos);
    const ai = aiMove(g, player, cell);
    if (ai) events.push(...(Array.isArray(ai) ? ai : [ai]));
  }

  // ⑤ 收尾换手
  events.push(...stepEnd(g).events);
  return { events, player, dice: r.dice, steps: total };
}

function endTurn(g) {
  // 胜负由 stepEnd 判定；已结束时不再换手
  if (g.over) return;
  /* 按 order 换手：turn 是「第几位行动者」，不是座位号。
     走完一圈（回到 order 的第 0 位）才算过完一轮。
     破产的部落被跳过（不轮到它）；hops 兜底防止全员破产时死循环。 */
  const n = g.order.length;
  let hops = 0;
  do {
    g.turn = (g.turn + 1) % n;
    if (g.turn === 0) g.round++;
    hops++;
  } while (g.players[g.order[g.turn]].bankrupt && hops <= n);
}

/** 当前行动者（turn 是 order 里的序号，不是座位号） */
export function curPlayer(g) {
  return g.players[g.order[g.turn]];
}

/**
 * AI 行动计划：把 aiDecide 的一口气决策拆成「一个个可单独执行的闭包」。
 * 单机模式下 UI 每 3 秒执行一个闭包，就能看到电脑一步一步操作。
 * 闭包捕获的是决策需要用到的索引，执行时再真正改状态 —— 
 * 所以玩家中途看到的钱数、归属都是真实的中间态。
 *
 * @returns {Array<() => ({kind:string,msg:string}|null)>}
 */
export function aiPlan(g, player) {
  const plan = [];
  const idx = player.pos;
  const cell = cellAt(idx);

  // ---- ① 买入所在格 ----
  if (cell.kind === 'land' && !g.landOwners[idx]) {
    const land = landById(cell.soilId);
    if (player.freeLandCards > 0) {
      plan.push(() => {
        const r = buyLand(g, player, idx, true);
        return r.ok
          ? { kind: 'buy', msg: `${player.name} 使用免费买地卡购入${land.name}`, land, idx }
          : null;
      });
    } else if (player.money >= land.price) {
      plan.push(() => {
        const r = buyLand(g, player, idx, false);
        return r.ok
          ? { kind: 'buy', msg: `${player.name} 花费 ${land.price} 肥力币购入${land.name}`, land, idx }
          : null;
      });
    } else {
      plan.push(() => ({
        kind: 'skip', msg: `${player.name} 资金不足（${land.name} 需 ${land.price}），放弃购买`, idx
      }));
    }
  }

  /* ---- ①-b 手里一张种子都没有：买一张 ----
     「没有种子就不能种」，所以一个种子都没有的电脑必须先补货，
     否则它会站在自有土地前什么都干不了（有地有肥力但种不下去）。 */
  if (cell.kind === 'zhongzi') {
    const hasAnySeed = Object.values(player.seeds || {}).some(n => n > 0);
    if (!hasAnySeed) {
      plan.push(() => {
        const goods = marketCrops(g);
        if (!goods.length) return null;
        // 挑一张买得起的最便宜的，避免钱不够买不起任何一张
        const pick = goods.slice().sort((a, b) => a.cost - b.cost)[0];
        const r = buyCrop(g, player, pick.id);
        return r.ok
          ? { kind: 'buy', crop: pick, msg: `${player.name} 手上没有种子，在种子集市买入「${pick.name}」 −${pick.cost}` }
          : null;
      });
    }
  }

  // ---- ② 每块自有土地：满了收，没满种 ----
  // 快照土地索引，闭包执行时再检查状态（前面的动作可能已改变钱数）
  for (const key of Object.keys(player.lands)) {
    const k = Number(key);
    plan.push(() => {
      const rec = player.lands[k];
      if (!rec) return null;
      const land = landById(rec.soilId);
      const capacity = plotsFor(land.fertility);

      if (rec.crops.length >= capacity) {
        const h = harvest(g, player, k);
        return h.ok
          ? { kind: 'harvest', msg: `${player.name} 收获${land.name} ${h.total >= 0 ? '+' : ''}${h.total}`, total: h.total, idx: k }
          : null;
      }
      /* 只能在**当前所在格**种植（与 engine.plant 同一规则）：
         走不到的地种不了。收获不受此限（收获是「收自家囤在地里的粮」）。 */
      if (k !== player.pos) return null;
      /* 只从「手上确实有种子」的作物里选 —— 没有种子就不能种（plant 会拒绝）。
         旧逻辑遍历全部 CROPS，靠 `cost=0` 让有库存的看起来更划算，
         结果电脑会去种从没买过的种子然后失败。 */
      let best = null, bestScore = -Infinity;
      for (const c of CROPS) {
        const hasStock = (player.seeds && player.seeds[c.id] > 0);
        if (!hasStock) continue;                    // ← 硬门槛：没种子不能种
        const p = plantingProfit(c, land);
        const cost = 0;                             // 种子钱买卡时已付
        // 评分用「特长加成后」的收益，电脑才会按自己部落的性格挑作物
        const profit = p.profit + (p.cost - cost);
        const b = traitHarvestBonus(player, rec.soilId, c.id, profit);
        // 库存多的优先花掉，别让囤货烂在手里
        const stockN = player.seeds[c.id] || 0;
        const score = b.profit + (p.match === 'good' ? 50 : 0) + Math.min(stockN, 3) * 8;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (!best) return null;
      /* 按片种：空位与种子都够就种满。
         种子钱买卡时已付，多种一片 = 净多一片收益，所以电脑总是种到上限。 */
      const roomN = capacity - rec.crops.length;
      const stockN = player.seeds[best.id] || 0;
      const n = Math.max(1, Math.min(roomN, stockN));
      const r = plant(g, player, k, best.id, n);
      return r.ok
        ? {
          kind: 'plant', crop: best, land, idx: k, plots: r.plots, match: r.match,
          msg: `${player.name} 在${land.name}种下 ${r.plots} 片${best.name}（${r.match === 'good' ? '适配' : '非适配'}）`
        }
        : null;
    });
  }

  /* ---- ③ 改良卡：持有即增益，不再「点击换钱」。
        手牌精简：8 张是「按最高面值折算刚好到 +48% 上限」的张数，
        AI 超过 8 张就主动弃掉多出来的（保持手牌清爽、不刷爆面板）。 ---- */
  const IMP_CAP = 8;
  if (player.hand.length > IMP_CAP) {
    plan.push(() => {
      const over = player.hand.length - IMP_CAP;
      if (over <= 0) return null;
      const drop = dropImproveTo(player, IMP_CAP);      // 弃掉多余的（改良栏目精简）
      const names = drop.map(id => (improveById(id) || {}).name || id).join('、');
      return {
        kind: 'skip',
        msg: `${player.name} 弃掉多余的改良卡「${names}」（改良手牌精简到 ${IMP_CAP} 张）`,
      };
    });
  }

  // ---- ④ 种子集市：挑一张「自有空地上收益最高」的作物卡买下 ----
  if (cell.kind === 'zhongzi') {
    let pick = null, pickScore = -Infinity;
    for (const c of marketCrops(g)) {
      if (seedsTotal(player) >= RULES.seedMaxTotal) break;
      if (seedCount(player, c.id) >= RULES.seedMaxPerType) continue;
      if (player.money < c.cost) continue;
      let gain = -Infinity;
      for (const key in player.lands) {
        const rec = player.lands[key];
        const ln = landById(rec.soilId);
        if (rec.crops.length >= plotsFor(ln.fertility)) continue;   // 只挑还有空位的地
        const pf = plantingProfit(c, ln);
        const eff = pf.profit + (pf.cost - traitSeedCost(player, c.id, pf.cost));
        const bb = traitHarvestBonus(player, ln, c.id, eff);
        const g2 = bb.profit + (pf.match === 'good' ? 50 : 0);
        if (g2 > gain) gain = g2;
      }
      if (gain > pickScore) { pickScore = gain; pick = c; }
    }
    if (pick) {
      plan.push(() => {
        const r = buyCrop(g, player, pick.id);
        return r.ok
          ? { kind: 'market', crop: pick, held: r.held,
              msg: `${player.name} 在种子集市买下作物卡「${pick.name}」−${pick.cost}` }
          : null;
      });
    }
  }

  return plan;
}

/* ============ AI 决策 ============ */
/**
 * 简易 AI（同步版）：优先买适配自己的土地，种植高收益作物，收获与改良。
 * 内部复用 aiPlan，保持与单机模式完全一致的决策顺序。
 */
export function aiDecide(g, player) {
  const out = [];
  for (const act of aiPlan(g, player)) {
    const ev = act();
    if (ev) out.push(ev);
    if (g.over) break;
  }
  return out;
}

// 重新导出 data 层的查询工具，方便测试与 UI 统一从这里取
export {
  RULES, LANDS, CROPS, IMPROVES, WEATHERS, STATIONS, TRACK, TRIBES, TRIBE_TRAITS,
  landById, cropById, cropByName, improveById, soilMatch, plantingProfit,
  plotsFor, FERTILITY_PLOTS
};

export default {
  initGame, playTurn, rollDice, diceTotal, moveTo, cellAt, dealSeedCards,
  buyLand, payPass, plant, harvest, drawImprove, drawWeather,
  buyCrop, seedCount, marketCrops,
  aiDecide, aiPlan, shuffle, draw, log,
  stepRoll, stepMove, stepSettle, stepAi, stepEnd, stepExtraRoll, improveBonus, improveCardRate,
  checkBankrupt, activePlayers,
  traitHarvestBonus, traitSeedCost, traitStartBonus,
  landById, cropById, cropByName, improveById, soilMatch, plantingProfit,
  plotsFor, FERTILITY_PLOTS
};