/* 顶层同步错误捕获：ES module 顶层抛错时 window.onerror 抓不到 */
window.addEventListener('error', e => {
  const loc = (e.filename || '').split('/').pop() + ':' + e.lineno;
  const msg = (e.message || e.error) + ' @ ' + loc;
  const b = document.getElementById('errbar') || (() => {
    const x = document.createElement('div'); x.id = 'errbar';
    x.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:999;background:#c0392b;color:#fff;font:12px monospace;padding:6px 10px';
    document.body.appendChild(x); return x;
  })();
  b.textContent = 'JS: ' + msg;
  b.dataset.msg = msg;
}, true);

/**
 * 菜农部落 · 完整可玩版 —— UI 层
 * 图板使用原桌游图板图，卡牌使用原卡面图，全部素材来自 PDF。
 */
import {
  RULES, CROPS, WEATHERS, STATIONS, TRACK, TRIBES, TRIBE_TRAITS,
  landById, cropById, improveById, plantingProfit, plotsFor
} from './data.js';
import { CELL_POS as MEASURED, CELL_RECTS, DECK_SLOTS } from './cellPositions.js';
import { MOTIF_THUMBS, svgToDataUri } from './motifs.js';
import { landCard, landMini, cropCard, improveCard, cellTile, deckSlot } from './cardArt.js';
import {
  initGame, cellAt, buyLand, plant, harvest,
  stepRoll, stepExtraRoll, stepMove, stepSettle, stepEnd, aiPlan,
  traitSeedCost, traitHarvestBonus, buyCrop, seedCount, seedsTotal, marketCrops,
  improveBonus, improveCardRate
} from './engine.js';
import { openHandbook as openHandbookRaw } from './handbook.js';
/* 农耕志（荣誉层）：只读对局状态记一笔，绝不回写 G —— 不影响平衡与胜负 */
import {
  openCodex, mark as codexMark, trace as codexTrace,
  scan as codexScan, updateEntry as updateCodexEntry
} from './codex.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

let G = null;          // 游戏状态
let busy = false;      // 回合动画中，锁定操作
let aiStep = '';       // 电脑当前在干什么（显示在掷骰按钮上，避免玩家干等）
/* 「回合纪元」：每开一局 +1。
   异步回合协程（真人 doRoll / 电脑 runAiTurn）会捕获开局时的纪元值，
   每个 await 之后比对 —— 一旦有人点了「重开」，纪元变了，旧协程立即 return。
   否则旧协程会带着**上一局的玩家对象**继续对新一局掷骰/买地/换手（偶发错乱）。
   注意：旧协程过期时**只许 return**，不要再碰 busy/nextTurn/G —— 新局由 newGame() 接管。 */
let TURN_EPOCH = 0;

/* =========================================================
   赛道格定位
   18 格按顺时针分布在图板外圈。
   用百分比坐标把每格锚定到图板上的对应位置，
   起点在右下角（图板右下角标注「起点 +100」）。
   ========================================================= */
/* 赛道格实测坐标：tools_detect_cells.py 从底图检测得到，
   索引 0 = 右下角起点，顺时针（视觉）环绕外圈。
   格子大小也来自检测，CSS 用它做 width/height 才能精确压住原图的格子。 */
const CELL_POS = MEASURED;

/* =========================================================
   平面图板：格子命中区 + 部落棋子
   底图是一张纯装饰地图（assets/board_new.jpg，1536x1152），没有格子和站点，
   全部赛道格由 cellTile() 在上面绘制。这里只叠：
     - 透明命中区（点击看详情 / 归属染色 / 悬停提示）
     - 四部落棋子（SVG 标识）

   BOARD_W / BOARD_H 是底图的原始像素，用来把归一化的格子矩形
   换算成**贴片的绘制分辨率**（不是显示尺寸，显示由 CSS 的百分比负责）。
   换图时这两个值要跟着改，否则贴片会按旧图的基准缩放、与地图错位。
   ========================================================= */
/* 底图原始像素（换图必改）。
   现在是「原图做外圈赛道卡 + 中心另叠新地图」，所以这两个值仍按原图算：
   32 格贴片要精确压回原图印刷的卡面上。中间地图是独立的 <img>，
   尺寸由 CSS 的百分比定位，两者互不影响。 */
const BOARD_W = 1963, BOARD_H = 1482;
/* 牌位牌（土壤改良卡 / 气象卡 / 土壤信息卡）要不要画。
   这三块原本是盖在**旧图中央的说明卡**位置上的，但中心换成新地图后
   它们与地图在空间上完全冲突（实测：要避开三块牌，地图区只剩 0.42 宽，
   等于缩掉一大半），所以不再绘制。
   牌位信息改由图例上方的三卡入口 #cardhub 承载，信息一条不少。
   改回 false 即恢复旧图行为。 */
const BOARD_CENTER_CLEAR = true;

const cellEls = [];   // index -> HTMLElement
const pawnEls = {};   // tid  -> HTMLElement

/** 图板尺寸：按stage 的可用空间等比缩放，写成像素值。
    之后.cell / .pawn 用百分比锚定，就和底图严丝合缝。 */
const WIDE = window.matchMedia('(min-width:1000px)');
/* 窄屏（≤620px）时竖列被改成「压在图板下缘的一条」（见 style.css 那一档），
   只有这一档才需要给 stage 留底部空间；621~999px 竖列仍在左上角，不走这条路。 */
const NARROW = window.matchMedia('(max-width:620px)');
/* 手机 / 平板横屏（矮视口）：图板左上角的竖列改成一条窄列（见 style.css 那一档），
   图板同样要让开它 —— 走的是桌面那条 margin-left 让位逻辑。 */
const LAND = window.matchMedia('(orientation:landscape) and (max-width:1499.98px) and (max-height:620px)');
function layoutBoard() {
  const stage = $('stage');
  const wrap = $('board-wrap');
  const img = $('board');
  if (!img || !img.naturalWidth) return;

  const col = document.querySelector('.legend-col');

  /* 手机竖屏：竖列绝对定位在 stage 底部，压在图板下缘。若不给 stage 留底部空间，
     flex 居中会把图板下缘塞进这条下面 —— 底排赛道卡被整条盖住（实测被盖 46px，
     看不见也点不到）。把条高写进 padding-bottom，图板就只在「条以上」居中，下缘让开。
     桌面/中屏清空它，回到样式表里的 padding。 */
  const colH = (NARROW.matches && !LAND.matches && col)
    ? Math.ceil(col.getBoundingClientRect().height) + 12 : 0;
  stage.style.paddingBottom = colH ? colH + 'px' : '';

  /* 左侧竖列（三类手牌入口 + 我的土地与作物 + 图例）绝对定位在 stage 里，
     图板要让开它。做法：给图板加 margin-left —— 它在 stage 里右移，
     同时可用宽度也扣掉这条列，图板不会被压在面板下面。

     注意不能用 stage 的 padding-left 来让位：那会让「可用宽 - 图板宽」
     恒等于一个很小的值，从而把「竖列是否需要收窄」的判断带进振荡。 */
  const colW = (col && (WIDE.matches || LAND.matches) && !SIMPLE_MODE)
    ? col.offsetWidth + 26 : 0;
  document.documentElement.style.setProperty('--sidecol-w', colW + 'px');

  const cs = getComputedStyle(stage);
  const availW = stage.clientWidth
    - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - colW;
  const availH = stage.clientHeight
    - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);

  const r = img.naturalWidth / img.naturalHeight;
  let w = availW, h = w / r;
  if (h > availH) { h = availH; w = h * r; }
  wrap.style.width = Math.floor(w) + 'px';
  wrap.style.height = Math.floor(h) + 'px';
  wrap.style.marginLeft = colW + 'px';
  wrap.style.marginRight = '0px';
}

/* =========================================================
   可拖拽分隔条
   竖条：图板区↔ 右侧面板宽度  -> --side-w
   横条：主区 ↔ 底栏高度        -> --bottom-h
   拖完存localStorage，刷新后保留；双击复位默认。
   ========================================================= */
const SPLIT_KEY = 'cnvillage.split.v2';
/* 底栏默认 52px：手牌（作物卡/改良卡）已搬到图板左下角竖列的「农耕志」下方，
   底栏只剩窄屏用的新手教程/随农记入口，104px 有一半是空的，直接砍半。
   老存档里的旧值（≥76）会被下面的夹取逐步收敛；要强制回默认双击分隔条即可。 */
const SPLIT_DEFAULT = { side: 316, bottom: 52 };
const SPLIT_LIMIT = {
  side: [236, 620],     // 右侧面板宽度范围
  bottom: [36, 300]     // 底栏高度范围（下限跟着默认值降，否则夹不回 52）
};

function loadSplit() {
  try {
    const raw = localStorage.getItem(SPLIT_KEY);
    if (!raw) return { ...SPLIT_DEFAULT };
    const v = { ...SPLIT_DEFAULT, ...JSON.parse(raw) };
    // 夹一下，防止手改localStorage 或换了更小的窗口
    v.side = Math.min(SPLIT_LIMIT.side[1], Math.max(SPLIT_LIMIT.side[0], v.side));
    v.bottom = Math.min(SPLIT_LIMIT.bottom[1], Math.max(SPLIT_LIMIT.bottom[0], v.bottom));
    return v;
  } catch (e) {
    return { ...SPLIT_DEFAULT };
  }
}

function applySplit(s) {
  document.documentElement.style.setProperty('--side-w', s.side + 'px');
  document.documentElement.style.setProperty('--bottom-h', s.bottom + 'px');
}

let splitState = loadSplit();
applySplit(splitState);

/**
 * 绑定一条分隔条。
 * @param {string} id 分隔条元素 id
 * @param {'side'|'bottom'} key 写进 CSS 变量的哪一项
 * @param {number} sign 拖动方向：1 = 数值随坐标增大而增大，-1 = 相反
 */
function bindSplitter(id, key, sign) {
  const bar = $(id);
  if (!bar) return;
  const prop = key === 'side' ? '--side-w' : '--bottom-h';
  const [lo, hi] = SPLIT_LIMIT[key];

  bar.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    bar.setPointerCapture(e.pointerId);
    bar.classList.add('drag');
    document.body.classList.add('resizing');
    document.body.style.cursor = key === 'side' ? 'col-resize' : 'row-resize';
    const startVal = splitState[key];
    const startCoord = key === 'side' ? e.clientX : e.clientY;

    const move = (ev) => {
      const now = key === 'side' ? ev.clientX : ev.clientY;
      // 竖条在右侧：向左拖（坐标变小）面板变宽，所以 sign = -1
      const next = startVal + (now - startCoord) * sign;
      splitState[key] = Math.round(Math.min(hi, Math.max(lo, next)));
      document.documentElement.style.setProperty(prop, splitState[key] + 'px');
      layoutBoard();
    };
    const up = () => {
      bar.classList.remove('drag');
      document.body.classList.remove('resizing');
      document.body.style.cursor = '';
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
      try { localStorage.setItem(SPLIT_KEY, JSON.stringify(splitState)); } catch (e) { /* 隐私模式忽略 */ }
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  });

  // 双击复位这一项
  bar.addEventListener('dblclick', () => {
    splitState[key] = SPLIT_DEFAULT[key];
    applySplit(splitState);
    layoutBoard();
    try { localStorage.setItem(SPLIT_KEY, JSON.stringify(splitState)); } catch (e) { /* 忽略 */ }
  });
}

function initSplitters() {
  bindSplitter('split-v', 'side', -1);
  bindSplitter('split-h', 'bottom', -1);
}

/** 建一次格子与棋子，之后只改 class 和坐标 */
function buildBoard2D() {
  const cellsBox = $('cells');
  const pawnsBox = $('pawns');
  const slotsBox = $('slots');
  cellsBox.innerHTML = '';
  pawnsBox.innerHTML = '';
  slotsBox.innerHTML = '';
  cellEls.length = 0;

  /* 图板中央的三块卡位牌（土壤改良卡 / 气象卡 / 土壤信息卡）。
   新底图是一张完整的装饰地图，中央是青藏高原/山脉，不能再压牌位。
   所以：只有「旧图」才需要盖东西，现在把它们收进图板下方的独立说明条
   （见 legend-col 上方的#cardhub），这里不再绘制。
   保留这段代码是为了在换回旧图时能一键恢复。*/
  if (DECK_SLOTS.length && !BOARD_CENTER_CLEAR) {
    DECK_SLOTS.forEach(s => {
      const [x0, y0, x1, y1] = s.rect;
      const d = el('div', 'slot');
      d.style.left = (x0 * 100).toFixed(3) + '%';
      d.style.top = (y0 * 100).toFixed(3) + '%';
      d.style.width = ((x1 - x0) * 100).toFixed(3) + '%';
      d.style.height = ((y1 - y0) * 100).toFixed(3) + '%';
      d.style.backgroundImage = `url("${deckSlot(s.kind, (x1 - x0) * BOARD_W, (y1 - y0) * BOARD_H)}")`;
      d.title = { improve: '土壤改良卡 · 抽卡位', weather: '气象卡 · 抽卡位', info: '土壤信息卡 · 参考位' }[s.kind] || '';
      slotsBox.appendChild(d);
    });
  }

  CELL_POS.forEach(([nx, ny], i) => {
    const cell = TRACK[i] || {};
    const c = el('div', 'cell');
    /* 悬停提示的朝向：图板四周没有富余空间，提示一律往板内翻。
       顶行上方就是板外，提示改到底侧；底行上方是地图，保持默认朝上。 */
    if (ny < 0.35) c.classList.add('tip-down');

    // 用实测矩形定位（百分比），让国风贴片严丝合缝压住原图格子
    const r = CELL_RECTS[i];
    if (r) {
      c.style.left = (r[0] * 100).toFixed(3) + '%';
      c.style.top = (r[1] * 100).toFixed(3) + '%';
      c.style.width = ((r[2] - r[0]) * 100).toFixed(3) + '%';
      c.style.height = ((r[3] - r[1]) * 100).toFixed(3) + '%';
    } else {
      c.style.left = (nx * 100).toFixed(3) + '%';
      c.style.top = (ny * 100).toFixed(3) + '%';
    }
    c.dataset.idx = String(i);

    // 国风格子贴片
    const view = { ...cell };
    if (cell.kind === 'land') view.land = landById(cell.soilId);
    else view.station = STATIONS[cell.kind];
    c.style.backgroundImage = `url("${cellTile(view, r ? (r[2] - r[0]) * BOARD_W : 170,
      r ? (r[3] - r[1]) * BOARD_H : 200)}")`;

    if (cell.kind === 'land') {
      const land = landById(cell.soilId);
      c.innerHTML = `<div class="tip"><b>${land.name}</b><br>
        <span class="tp">${land.price}</span> 肥力币 · ${land.fertility}肥力</div>`;
    } else if (cell.kind === 'start') {
      c.innerHTML = `<div class="tip"><b>起点</b><br>
        <span class="tp">+${RULES.startBonus}</span> 肥力币</div>`;
    } else {
      const st = STATIONS[cell.kind] || { name: cell.kind };
      c.innerHTML = `<div class="tip"><b>${st.name}</b><br>
        <span style="color:var(--ink-3);font-size:10.5px">${(st.desc || '').slice(0, 22)}…</span></div>`;
    }

    c.addEventListener('click', () => onCellClick(i));
    cellsBox.appendChild(c);
    cellEls.push(c);
  });

  G.players.forEach(p => {
    const m = MOTIF_THUMBS.find(x => x.id === p.tid);
    const w = el('div', 'pawn ' + p.tid);
    w.style.backgroundImage = `url("${svgToDataUri(m.svg)}")`;
    // SVG 有内在宽高比，给定宽度后按viewBox 比例算高度，否则图标会被压扁
    const vb = m.viewBox.split(' ').map(Number);
    const pw = 42;
    w.style.width = pw + 'px';
    w.style.height = Math.round(pw * (vb[3] / vb[2])) + 'px';
    w.title = `${p.name} · ${m.motif}`;
    pawnsBox.appendChild(w);
    pawnEls[p.tid] = w;
  });
}

/** 把游戏状态同步到平面图板 */
function syncBoard2D() {
  if (!cellEls.length) return;

  // 格子：归属染色 + 当前部落高亮 + 归属角标
  cellEls.forEach((c, i) => {
    const owner = G.landOwners[i];
    c.classList.remove('owned-A', 'owned-B', 'owned-C', 'owned-D', 'cur');
    if (owner) c.classList.add('owned-' + owner);

    const holders = G.players.filter(p => p.pos === i);
    holders.forEach(p => {
      if (!c.querySelector('.mark.' + p.tid)) {
        c.appendChild(el('div', 'mark ' + p.tid));
      }
    });
    // 清理已离开的角标
    c.querySelectorAll('.mark').forEach(m => {
      if (!holders.some(p => p.tid === m.classList[1])) m.remove();
    });

    if (!G.over && cur().pos === i) c.classList.add('cur');
  });

  // 棋子：定位到所在格
  const used = {};
  G.players.forEach(p => {
    const w = pawnEls[p.tid];
    if (!w) return;
    /* 破产 = 退出本局：棋子在图上必须一眼看出「不在场」，
       不能再跟在场部落长得一样，更不能被标成当前行动者。 */
    w.classList.toggle('out', !!p.bankrupt);
    /* 逐格行走期间不碰位置。
       stepMove() 在动画之前就已经把 player.pos 推到终点，
       中途任何 render() 都会把棋子「瞬移」到终点，
       紧接着 walkPawn 又把它拉回第一格重来 —— 视觉上就是来回跳变。 */
    if (w.classList.contains('walking')) {
      w.classList.toggle('cur-pawn', !G.over && !p.bankrupt && p === cur());
      return;
    }
    const [nx, ny] = CELL_POS[p.pos];
    // 同一格多部落时横向错开
    const n = used[p.pos] = (used[p.pos] || 0) + 1;
    const crowd = G.players.filter(q => q.pos === p.pos).length;
    const dx = crowd > 1 ? (n - 1 - (crowd - 1) / 2) * 4.4 : 0;
    const dy = crowd > 1 ? (G.turn % 2 ? 0 : 1.6) : 0;
    w.style.left = (nx * 100 + dx).toFixed(3) + '%';
    w.style.top = (ny * 100 - dy).toFixed(3) + '%';
    w.classList.toggle('cur-pawn', !G.over && !p.bankrupt && p === cur());
  });
}

/* =========================================================
   渲染：四部落横排面板
   ========================================================= */
function renderPlayers() {
  const box = $('players');
  box.innerHTML = '';
  G.players.forEach((pl, i) => {
    const pct = Math.max(0, Math.min(100, (pl.money / RULES.winMoney) * 100));
    const ai = isAI(i);
    const bankrupt = !!pl.bankrupt;
    // 「行动中」要拿座位 i 跟当前行动者所在座位比；G.turn 是行动次序，不是座位
    const isActing = i === G.order[G.turn] && !G.over && !bankrupt;
    const c = el('div', 'pcard' + (isActing ? ' active' : '') + (ai ? ' ai' : '')
      + (bankrupt ? ' bankrupt' : ''));
    c.innerHTML = `
      <div class="pimg" style="background-image:url('${pl.icon}')"></div>
      <div class="pinfo">
        <div class="pname">${pl.name}
          ${ai ? '<span class="ptag bot">电脑</span>' : ''}
          ${isActing ? '<span class="ptag turn">行动中</span>' : ''}
          ${pl.skipTurns > 0 ? '<span class="ptag jail">狱中</span>' : ''}
          ${bankrupt ? '<span class="ptag dead">破产出局</span>' : ''}
        </div>
        <div class="pmotif">${pl.motif}${
          pl.trait ? ` · <span class="ptrait">${pl.trait.name}</span>` : ''}</div>
        <div class="pmoney${pl.money < 0 ? ' debt' : ''}"><b>${pl.money}</b> 肥力币 · ${Object.keys(pl.lands).length} 地</div>
        <div class="pbar"><i style="width:${pct}%"></i></div>
      </div>`;
    c.title = pl.trait ? `${pl.name} · ${pl.trait.name}\n${pl.trait.desc}` : pl.name;
    c.addEventListener('click', () => {
      // 点部落面板：把该部落的棋子闪烁提示一下
      const w = pawnEls[pl.tid];
      if (!w) return;
      w.classList.remove('cur-pawn');
      void w.offsetWidth;
      w.classList.add('cur-pawn');
    });
    box.appendChild(c);
  });
  $('round').textContent = G.round;
  $('winline').textContent = RULES.winMoney;
  $('curtribe').textContent = G.over ? '已结束'
    : cur().name + (isAITurn() ? '（电脑）' : '');
}

/** 底栏看谁的资产：本地对战看当前行动者；单机模式始终看真人自己 */
/* =========================================================
   座位（seat）与行动者（turn）—— 两套东西，别混
   ---------------------------------------------------------
   seat  = 部落「坐在第几号位」，0~3，永远不变（A/B/C/D 的数组下标）
   turn  = 行动顺序里的**第几位**，每局随机打乱，存在 G.order 里
   cur() 是**错的** —— turn 现在是「次序」不是「座位」，
   那样写会拿到别人。统一用下面三个辅助函数。
   ========================================================= */
function viewSeat() {
  /* 本地对战：面板跟随当前行动者；单机：固定是你自己。 */
  return MODE === 'solo' ? HUMAN_SEAT : curSeat();
}
/** 当前行动者所在的座位 */
function curSeat() {
  return G.order[G.turn];
}
/** 当前行动者对象 */
function cur() {
  return G.players[curSeat()];
}
/** 当前行动者是不是电脑 */
function isAITurn() {
  return MODE === 'solo' && curSeat() !== HUMAN_SEAT;
}

/** 面板与弹层要展示给谁看 —— 永远是 viewSeat() 那个玩家。
    ⚠️ 不要在这里用 G.players[G.turn]：单机模式下二者不同（你选的部落 vs 当前行动者）。
    曾经因为openPlantModal 用了 G.turn，导致单机模式下点「种植」
    查的是电脑的土地、索引对不上直接静默 return —— 表现就是「点了没反应」。
    只有回合流程（掷骰 / 换手 / AI 行动）才该用 G.turn，那时操作者就是当前玩家。*/
function viewMe() {
  return G.players[viewSeat()];
}

/* ---------- 土地与作物 ---------- */
function renderFarms() {
  const box = $('myfarms');
  const me = G.players[viewSeat()];
  const mineTurn = !G.over && !busy && viewSeat() === curSeat() && !isAITurn();
  box.innerHTML = '';
  const keys = Object.keys(me.lands).map(Number).sort((a, b) => a - b);
  const lc = $('landcount');
  if (lc) lc.textContent = keys.length;
  if (!keys.length) {
    box.appendChild(el('div', 'hint', '还没有土地。移动到无主土地格即可购买。'));
    return;
  }
  keys.forEach(k => {
    const rec = me.lands[k];
    const land = landById(rec.soilId);
    const cap = plotsFor(land.fertility);
    const d = el('div', 'farm');
    const cropsHtml = rec.crops.map(c => {
      const cr = cropById(c.cropId);
      return `<span class="fcrop ${c.match === 'bad' ? 'bad' : ''}">${cr.name}</span>`;
    }).join('');
    d.innerHTML = `
      <img src="${landMini(land)}" alt="${land.name}">
      <div class="fmain">
        <div class="fname">${land.name} <span>· ${land.fertility}肥力 ${cap}片</span></div>
        <div class="fmeta">适配：${land.crops.join('、')}</div>
        <div class="fcrops">${cropsHtml || '<span class="fcrop" style="background:#f0ebe0;color:#8a8070;border-color:#ddd3bf">空地</span>'}</div>
      </div>`;
    const btns = el('div', 'fbtns');
    /* 按钮为什么不能点，必须写进title ——
       否则「灰着点不动」看起来就像卡死，而不是「还没轮到你」。 */
    const whyOff = G.over ? '本局已结束'
      : busy ? '正在结算中…'
      : isAITurn() ? `现在是 ${cur().name}（电脑）的回合`
      : viewSeat() !== curSeat() ? `现在是 ${cur().name} 的回合`
      : '';
    /* 人类常识：**种了就能收**，不必种满；**有空位就能接着种**。
       两条相互独立，所以「收获」与「种植」可以同时出现
       （1/3 片的地：既能收这 1 片，也能再补种 2 片）。 */
    const doneThisTurn = !!(me.harvestedThisTurn && me.harvestedThisTurn[k]);
    if (rec.crops.length > 0) {
      const h = el('button', 'mini harvest', '🌾 收获');
      h.disabled = !mineTurn;
      if (!mineTurn && whyOff) h.title = whyOff + '，收获按钮暂不可用' + String.fromCharCode(10) + '（点卡片任意位置仍可查看土地详情）';
      h.addEventListener('click', () => {
        const r = harvest(G, me, k);
        if (r.ok) pushLog(r.total >= 0 ? 'good' : 'bad',
          `${me.name} 收获${land.name}，${r.total >= 0 ? '+' : ''}${r.total}`);
        render();
        if (!G.over) showActions(`${me.name} 的回合 · ${land.name}`, postMoveActions());
      });
      btns.appendChild(h);
    }
    if (rec.crops.length < cap) {
      const b = el('button', 'mini', '🌱 种植');
      /* 只能给「脚下的」那块地种植 —— 站在别处时置灰并写明原因
         （规则本体在 engine.plant，这里只是让玩家看得懂为什么点不动）。
         同一回合已收获过的地也不能再种（否则「种→收→再种」刷钱）。 */
      const onIt = (k === me.pos);
      b.disabled = !mineTurn || !onIt || doneThisTurn;
      const why = doneThisTurn ? `${land.name}本回合已收获过，要等下个回合才能再种`
        : !onIt ? `你正站在${cellName(me.pos)}，只能给脚下的土地种植` : whyOff;
      if (b.disabled && why) b.title = why + '，种植按钮暂不可用' + String.fromCharCode(10) + '（点卡片任意位置仍可查看土地详情）';
      b.addEventListener('click', () => openPlantModal(k));
      /* 非脚下地块的按钮是灰的：光靠 title（悬停才可见、手机没有悬停）
         玩家会以为「坏了 / 显示问题」。这里补一条**可见**的说明，
         讲清为什么不能种、要怎么做 —— 规则本体仍在 engine.plant。 */
      if (!onIt && mineTurn) {
        btns.appendChild(el('span', 'farm-tip', '🚶 走到这块地上才能种植'));
      }
      btns.appendChild(b);
    }
    d.appendChild(btns);
    /* 点土地卡任意位置（图标 / 卡面 / 空白）都能看这块地的详情。
       早先只有「收获」「种植」两个按钮绑了事件，卡片本体是个死块 ——
       玩家点图标/卡面毫无反应，看着像卡了。 */
    d.title = `${land.name} · ${land.fertility}肥力 ${cap}片｜点击查看详情`;
    d.addEventListener('click', e => {
      if (e.target.closest('.fbtns')) return;      // 按钮自己处理
      onCellClick(k);
    });
    box.appendChild(d);
  });
}

/* ---------- 改良卡手牌 ----------
   规则：改良卡「持有即增益」，不再点击换钱 ——
   每张按**面值折算**增加收获收益（面值 20 = +6%，封顶合计 +48%），
   不种作物就没有收益。点击 = 弃掉这张卡（主动放弃它的增益）。 */
function renderHand() {
  const box = $('hand');
  box.innerHTML = '';
  const me = G.players[viewSeat()];
  const mineTurn = !G.over && !busy && viewSeat() === curSeat() && !isAITurn();
  const ib = improveBonus(me);
  $('handcount').textContent = me.hand.length;
  const badge = $('impbonus');
  if (badge) {
    badge.textContent = ib.count ? `收获 +${Math.round(ib.rate * 100)}%` : '无加成';
    badge.classList.toggle('on', ib.count > 0);
  }
  if (!me.hand.length) {
    box.appendChild(el('div', 'hcard empty', '无'));
    return;
  }
  me.hand.forEach(id => {
    const im = improveById(id);
    const rate = improveCardRate(im);                      // 这张卡的面值折算增益
    const pct = (rate * 100).toFixed(1).replace(/\.0$/, '');
    const c = el('div', 'hcard' + (mineTurn ? ' discardable' : ' locked'));
    // 科普做成右上角角标（独立 <a>，不会触发弃牌）
    c.innerHTML = `<img src="${improveCard(im)}" alt="${im.name}">`
      + `<span class="imp-rate">+${pct}%</span>`
      + `<a class="wikibadge" href="${im.wiki || ''}" target="_blank" rel="noopener noreferrer"
            title="查阅百度百科：${im.name}">🔍</a>`;
    c.title = `${im.name}（${im.station}·面值 ${im.value}）\n${im.gain}\n`
      + `持有中：按面值折算每次收获 +${pct}%（当前合计 ${Math.round(ib.rate * 100)}%）\n`
      + `点击弃掉这张卡（合计增益 −${pct}%）\n点右上角 🔍 看科普`;
    c.addEventListener('click', (e) => {
      if (e.target.closest('.wikibadge')) return;      // 点角标不去弃牌
      if (!mineTurn) return;
      const i = me.hand.indexOf(id);
      if (i < 0) return;
      me.hand.splice(i, 1);
      pushLog('skip', `${me.name} 弃掉改良卡「${im.name}」，收获增益降为 +${Math.round(improveBonus(me).rate * 100)}%`);
      render();
      if (!G.over) showActions(`${me.name} 的回合`, postMoveActions());
    });
    box.appendChild(c);
  });
}

/** 作物卡手牌（种子集市买的）：种植时优先消耗 */
function renderSeeds() {
  const box = $('seedrow');
  if (!box) return;
  box.innerHTML = '';
  const me = G.players[viewSeat()];
  const owned = CROPS.filter(c => seedCount(me, c.id) > 0);
  const total = owned.reduce((s, c) => s + seedCount(me, c.id), 0);
  const cnt = $('seedcount');
  if (cnt) cnt.textContent = total;
  /* 图例上方入口上的三张计数。
     徽章只显示「我自己」的数量（玩家最需要知道的是自己手里有什么），
     但弹层里会列出全部四个部落的卡 + 首行统计条 ——
     对手手里有几张延时气象卡 / 改良卡，直接决定他下回合能赚多少，属于公开信息。 */
  const s2 = $('seedcount2');
  if (s2) s2.textContent = total;
  const h2 = $('handcount2');
  if (h2) h2.textContent = me.hand.length;
  const w2 = $('weathercount');
  if (w2) w2.textContent = (me.weatherCards || []).length;
  // 有待发动气象卡时入口高亮提醒
  ['hub-weather'].forEach(id => {
    const b = $(id);
    if (b) b.classList.toggle('urgent', (me.weatherCards || []).length > 0);
  });
  if (!owned.length) {
    box.appendChild(el('span', 'seedempty', '在种子集市可买作物卡囤到手上'));
    return;
  }
  owned.forEach(c => {
    const n = seedCount(me, c.id);
    const chip = el('span', 'seedchip');
    chip.innerHTML = `<b>${c.name}</b><i>×${n}</i>`
      + `<a class="wikibadge" data-wk="${c.name}" href="${c.wiki || ''}" target="_blank" rel="noopener noreferrer"
           title="查阅百度百科：${c.name}">🔍</a>`;
    chip.title = `手中 ${c.name} 作物卡 ×${n}（种子 ${c.cost} 币）\n种植时优先消耗，不再重复扣钱\n点 🔍 看科普`;
    box.appendChild(chip);
  });
}

/* =========================================================
   渲染：日志与骰子
   ========================================================= */
/* =========================================================
   游戏日志：按事件类型着色 + 加图标
   ========================================================= */
/** kind → [emoji 图标, 语义说明] */
const LOG_KIND = {
  turn:    ['👤', '回合交接'],
  dice:    ['🎲', '掷骰'],
  move:    ['👣', '移动'],
  start:   ['🏁', '经过起点'],
  land:    ['🗺️', '落点土地'],
  station: ['🚩', '到达站点'],
  market:  ['🏪', '种子集市'],
  buy:     ['🛒', '购买'],
  plant:   ['🌱', '种植'],
  harvest: ['🌾', '收获'],
  seed:    ['🌰', '基础种子卡'],
  use:     ['✨', '使用改良卡'],
  improve: ['🎴', '抽到改良卡'],
  weather: ['🌦️', '气象事件'],
  'weather-bad': ['⛈️', '气象灾害'],
  'harvest-bad': ['🥀', '歉收'],
  pass:    ['💸', '过路费'],
  prison:  ['⛓️', '监狱'],
  skip:    ['⏭️', '放弃行动'],
  win:     ['🏆', '胜利'],
  good:    ['😀', '正面结果'],
  bad:     ['⚠️', '负面结果'],
  warn:    ['❗', '提醒'],
  sys:     ['⚙️', '系统'],
};

/** 日志里用到的所有 kind（供测试断言，避免漏配） */
const LOG_KINDS = Object.keys(LOG_KIND);

/** 未登记的 kind 统一按系统消息处理，避免裸文本没有颜色 */
function normKind(k) {
  return LOG_KIND[k] ? k : 'sys';
}

function pushLog(kind, msg) {
  const box = $('log');
  box.appendChild(buildLogLine(kind, msg, G.round));
  while (box.children.length > 160) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
}

function buildLogLine(kind, msg, round) {
  const k = normKind(kind);
  const ico = LOG_KIND[k][0];
  return el('div', 'li k-' + k,
    `<span class="rt">R${round}</span>` +
    `<span class="ico" title="${LOG_KIND[k][1]}">${ico}</span>${msg}`);
}

function renderLog() {
  const box = $('log');
  box.innerHTML = '';
  G.log.slice(-60).forEach(l => box.appendChild(buildLogLine(l.kind, l.msg, l.round)));
  box.scrollTop = box.scrollHeight;
}

function showDice(dice, sum) {
  const box = $('dice');
  box.innerHTML = '';
  dice.forEach(d => {
    const e = el('div', 'die roll-anim', pips(d));
    box.appendChild(e);
  });
  if (dice.length) {
    box.appendChild(el('div', 'die-sum', `合计 <b>${sum}</b> 步`));
  }
}

/** 用 Unicode 骰子点渲染 */
function pips(n) {
  const map = {
    1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅'
  };
  return map[n] || n;
}

/* =========================================================
   行动顺序条（2026-10-15 从顶栏搬进弹窗）
   ---------------------------------------------------------
   行动顺序每局随机打乱（存在 G.order），玩家必须能一眼看到谁先谁后，
   否则「为什么这回合不是我」会变成疑问。当前行动者高亮，
   已经行动过的置灰，本回合还没轮到的正常显示。

   ⚠️ 结构约定（iter.test.html R7 段依赖）：
     1. `.os-chip` 的 textContent 必须**严格等于部落名**，不能夹带别的文字。
        所以「第 N 位」放在外层 `.og-cell` 里，不能塞进 chip 内部。
     2. #orderstrip 元素不能删 —— 它搬进了 #ordergate 弹窗，但 id 不变。
   ========================================================= */
function renderOrderStrip() {
  const box = $('orderstrip');
  if (!box || !G.order) return;
  box.innerHTML = G.order.map((seat, i) => {
    const pl = G.players[seat];
    const isCur = (i === G.turn) && !G.over;
    const done = G.over ? false : (i < G.turn);
    const cls = ['os-chip', isCur ? 'on' : '', done ? 'done' : ''].join(' ').trim();
    return `<span class="og-cell">`
      + `<span class="og-pos">第 ${i + 1} 位</span>`
      + `<span class="${cls}" style="--tc:${pl.color}"`
      + ` title="第 ${i + 1} 个行动：${pl.name}">${pl.name}</span>`
      + `</span>`;
  }).join('<span class="og-arrow">→</span>');
}

/* ---------- 顺序弹窗 ----------
   开新局后自动弹一次（玩家点「知道了，开始」才继续），
   之后可随时点顶栏「🔀 行动顺序」(#btn-order) 再看。
   独立于 #modal：那个容器会被 openModal() 整体覆盖，
   种田弹层 / 设置 / 部落选择都往里塞，顺序窗会被冲掉。 */
function showOrderGate(autoStart) {
  const gate = $('ordergate');
  if (!gate || !G || !G.order) return;
  renderOrderStrip();
  const first = G.players[G.order[0]];
  const note = $('ordernote');
  if (note) {
    note.innerHTML = `先手：<b style="color:${first.color}">${first.name}</b>`
      + (MODE === 'solo'
        ? `　·　你操控 <b>${G.players[HUMAN_SEAT].name}</b>，其余 ${RULES.tribes - 1} 个部落由电脑控制`
        : '');
  }
  const btn = $('order-ok');
  if (btn) btn.textContent = autoStart ? '知道了，开始' : '关闭';
  gate.hidden = false;
  /* 键盘可达：弹窗一开就把焦点给主按钮，Esc 可关 */
  if (btn) btn.focus();
}
function hideOrderGate() {
  const gate = $('ordergate');
  if (gate) gate.hidden = true;
}
/* 「知道了，开始」：关窗 + 执行挂起的启动函数（通常是 nextTurn）。
   挂起函数只跑一次并立刻清空 —— 连点两下不会让电脑多走一个回合。 */
$('order-ok').addEventListener('click', () => {
  const fn = PENDING_START;
  PENDING_START = null;
  hideOrderGate();
  if (typeof fn === 'function') fn();
});
$('ordergate').addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const fn = PENDING_START;
  PENDING_START = null;
  hideOrderGate();
  if (typeof fn === 'function') fn();   /* Esc 也算确认，不能把关掉弹窗变成卡死 */
});
$('btn-order').addEventListener('click', () => showOrderGate(false));

/* =========================================================
   图例里的四部落行
   ---------------------------------------------------------
   早先是 index.html 里硬编码「A/B/C/D 部落」，改部落名时漏了一处。
   现在统一从 TRIBES 渲染，改名只改 motifs.js 一处。
   ========================================================= */
function renderLegend() {
  const box = $('legendrows');
  if (!box) return;
  box.innerHTML = TRIBES.map(t =>
    `<div class="legend-row"><span class="sw" style="background:${t.color}"></span>${t.name}（${t.motif}）</div>`
  ).join('');
}

function render() {
  renderPlayers();
  renderFarms();
  renderSeeds();
  renderHand();
  renderOrderStrip();     // 顶栏「本回合顺序」
  syncBoard2D();
  // 电脑回合 / 动画中 / 已结束，都不能手动掷骰。
  // 操作框（落格操作 / 追风决策）开着时**同样不能**：否则任何一次 render()
  // 都会把骰子按钮重新点亮，玩家一点就同一个部落连走多个回合
  // （本地对战实测：A 落格操作还没结束，骰子已可再点 = 回合没换手就重掷）。
  const canRoll = !busy && !G.over && !isAITurn() && $('actionbox').hidden;
  $('btn-roll').disabled = !canRoll;
  const me = cur();
  $('btn-roll').textContent = isAITurn()
    ? `🤖 ${me.name} ${aiStep || '行动中…'}`
    : '🎲 掷骰子开始回合';

  /* 农耕志：单向扫描（落格过的土壤 / 手上的气象卡）→ 刷新入口上的完成度。
     只读 G，不写回 —— 与对局平衡完全无关。 */
  codexScan(G);
  updateCodexEntry();
}

/* =========================================================
   操作区
   ========================================================= */
function showActions(title, items) {
  const box = $('actionbox');
  const wrap = $('actions');
  wrap.innerHTML = '';
  if (!items || !items.length) { box.hidden = true; return; }
  box.hidden = false;
  $('actiontitle').textContent = title;
  items.forEach(it => {
    const b = el('button', 'act' + (it.primary ? ' primary' : ''));
    b.innerHTML = `<div class="at"><span>${it.label}</span>
      ${it.cost !== undefined ? `<span class="ac ${it.costClass || ''}">${it.cost}</span>` : ''}
    </div>${it.desc ? `<div class="ad">${it.desc}</div>` : ''}`;
    b.disabled = busy || G.over || isAITurn() || it.disabled;
    b.addEventListener('click', it.onClick);
    wrap.appendChild(b);
  });
}

function hideActions() { $('actionbox').hidden = true; }

/* 落格后给出可执行操作 */
function landActions() {
  const me = viewMe();
  const i = me.pos;
  const cell = cellAt(i);
  const items = [];

  // 种子集市：买作物卡囤到手上
  if (cell.kind === 'zhongzi') {
    const goods = marketCrops(G);
    items.push({
      label: '🛒 进入种子集市', primary: true,
      desc: `本回合摆出 ${goods.length} 种作物卡，买下即入手牌，种植时优先消耗`,
      onClick: () => openMarket()
    });
    return items;
  }

  if (cell.kind !== 'land') return items;

  const land = landById(cell.soilId);
  const owner = G.landOwners[i];

  if (!owner) {
    if (me.freeLandCards > 0) {
      items.push({
        label: `🆓 使用免费买地卡购入${land.name}`,
        cost: '免费', costClass: 'g', primary: true,
        desc: `原价 ${land.price} 肥力币，使用后剩余免费卡 ${me.freeLandCards - 1} 张`,
        onClick: () => doBuy(i, true)
      });
    }
    items.push({
      label: `💰 花 ${land.price} 肥力币购入${land.name}`,
      cost: `-${land.price}`,
      desc: `现有 ${me.money} 肥力币`,
      disabled: me.money < land.price,
      onClick: () => doBuy(i, false)
    });
  } else if (owner === me.tid) {
    const rec = me.lands[i];
    const cap = plotsFor(land.fertility);
    const doneThisTurn = !!(me.harvestedThisTurn && me.harvestedThisTurn[i]);
    // 收获：只要有作物就能收（不必种满）—— 人类常识
    if (rec.crops.length > 0) {
      // 预估收益要把「部落加成 + 改良卡持有增益」整条链算进去，
      // 与 harvest() 完全一致 —— 玩家是冲着这个数字点「收获」的，
      // 早先漏掉改良卡那一段，预估比实收少一截（实测 40 vs 50）。
      const imp = improveBonus(me);
      const est = rec.crops.reduce((s, c) => {
        const b = traitHarvestBonus(me, rec.soilId, c.cropId, c.profit).profit;
        return s + (imp.rate > 0 ? Math.round(b * (1 + imp.rate)) : b);
      }, 0);
      items.push({
        label: `🌾 收获${land.name}`, primary: true,
        desc: `已种 ${rec.crops.length} 片，预计 ${est >= 0 ? '+' : ''}${est} 肥力币`,
        onClick: () => {
          const r = harvest(G, me, i);
          if (r.ok) pushLog(r.total >= 0 ? 'good' : 'bad',
            `${me.name} 收获${land.name}，合计 ${r.total >= 0 ? '+' : ''}${r.total}`
            + (r.total !== r.raw ? `（含${me.trait.name} ${r.raw >= 0 ? '+' : ''}${r.total - r.raw}）` : ''));
          render();
        }
      });
    }
    // 种植：有空位、且本回合没收获过才给（收获后同回合不能再种，防刷钱）
    if (rec.crops.length < cap && !doneThisTurn) {
      items.push({
        label: `🌱 在${land.name}种植作物`, primary: !rec.crops.length,
        desc: `${land.fertility}肥力，可种 ${cap} 片（已种 ${rec.crops.length} 片）｜适配：${land.crops.join('、')}`,
        onClick: () => openPlantModal(i)
      });
    }
  } else {
    const op = G.players.find(p => p.tid === owner);
    const fee = Math.round(land.price * RULES.passRate);
    /* 别人地上没有可执行操作，但仍让玩家能点开看这块地的信息。
       早先这里 disabled:true 却写着「点击查看该土地信息」——
       文案让点、按钮不让点，玩家点了没反应以为卡住。现在真的可点。 */
    items.push({
      label: `${op.name} 的${land.name}，本回合已付过路费`,
      cost: `-${fee}`,
      desc: '点击查看该土地信息',
      onClick: () => onCellClick(i)
    });
  }
  return items;
}

/**
 * 落格后的**完整**决策清单 = 可执行操作 + 一个「结束回合」出口。
 * 凡是「重画动作框」的地方都必须走这里 —— 点买地 / 种植 / 收获 / 弃卡之后
 * 都会重画一次，早先各自直接调 landActions()，于是「结束回合」按钮在那些
 * 路径下凭空消失，玩家看着像卡住（尤其单机模式连点两次就再也点不到结束）。
 */
function postMoveActions() {
  /* 「结束回合」只许触发一次：先收框再换手，闭包挡住重复点击
     （快速双击 / 键盘 Enter 复触发 / 程序化连点都会让 finishTurn 跑两遍，
      turn 被连推两次 = 跳过一个部落 —— 本地对战实测踩过）。 */
  let ended = false;
  return landActions().concat([{
    label: '结束回合',
    desc: '不再操作，交棒给下一个部落',
    onClick: () => {
      if (ended) return;
      ended = true;
      hideActions();
      finishTurn();
    }
  }]);
}

function doBuy(idx, useFree) {
    const me = viewMe();
  const r = buyLand(G, me, idx, useFree);
  if (!r.ok) { pushLog('bad', '购买失败：' + r.msg); return; }
  pushLog(r.free ? 'good' : 'buy',
    `${me.name} ${r.free ? '使用免费买地卡' : `花费 ${r.land.price} 肥力币`}购入${r.land.name}`);
  /* 农耕志：「四方开垦」按「在几个部落买到过地」计数（荣誉层，不影响对局） */
  const t = TRIBES.find(x => x.id === me.tid);
  codexMark('farm', me.tid, t ? t.name : '');
  render();
  showActions(`${me.name} 的回合 · ${r.land.name}`, postMoveActions());
}

/* =========================================================
   土地详情：作物收益表 + 「付费揭示高收益」
   ---------------------------------------------------------
   高收益作物（该作物的高收益土壤正好是这块地）是这张表的全部价值所在，
   直接标出来玩家就失去了「自己判断」的乐趣，也违背课程设计意图。
   所以：默认全部按「非适配」显示（收益偏低），花 5 肥力币买一次
   「土壤检测报告」才拿到底层数据 —— 检测一次就永久可见。
   ========================================================= */
const REVEAL_COST = 5;

function hasRevealed(idx) {
  const me = G.players[viewSeat()];
  if (!me.revealed) me.revealed = {};
  return !!me.revealed[idx];
}

function payReveal(idx) {
  const me = G.players[viewSeat()];
  if (hasRevealed(idx)) return false;
  if (me.money < REVEAL_COST) return false;
  me.money -= REVEAL_COST;
  if (!me.revealed) me.revealed = {};
  me.revealed[idx] = true;
  pushLog('buy', `${me.name} 花钱做了一次土壤检测（−${REVEAL_COST} 肥力币），得知哪些作物在这块地是高收益`);
  render();
  return true;
}

function revealBlock(idx, land) {
  const me = G.players[viewSeat()];
  const known = hasRevealed(idx);

  /* 未付费时**不渲染任何数字** —— 整张表用雾化遮罩盖住。
     早先的实现是「显示非适配土壤的保守数字」，结果玩家照样看到
     一整张具体收益表（还全是错值），等于既泄题又误导。
     现在：付费前只给作物名 + 一层毛玻璃，看不到任何金币数字。 */
  if (!known) {
    const teaser = CROPS.map(c =>
      `<tr><td>${c.name}</td>
        <td class="fogcell"><span class="fogtxt">？？</span></td>
        <td class="fogcell"><span class="fogtxt">？？</span></td>
        <td class="fogcell"><span class="fogtxt">？？</span></td></tr>`).join('');
    return `
      <h4>作物收益表</h4>
      <div class="revealbar">
        <span class="rb-txt">🔍 这块地<b>适配哪些作物、各自收益多少</b>尚未检测。
          做一次土壤检测即可看清全部数据（<b>检测一次，本块地永久可见</b>）。</span>
        <button class="tb primary" id="btn-reveal" type="button"
          ${me.money < REVEAL_COST ? 'disabled' : ''}>
        花 ${REVEAL_COST} 肥力币做土壤检测</button>
      </div>
      <div class="fogwrap">
        <table class="revealtable fogged">
          <tr><th>作物</th><th>种子成本</th><th>本块地产量</th><th>净收益</th></tr>
          ${teaser}
        </table>
        <div class="fogveil"><span>🔒 未检测 — 数据已模糊</span></div>
      </div>
      <p style="font-size:11.5px;color:var(--ink-3)">
        「净收益」= 产量收入 − 种子成本。同一作物在<b>适配土壤</b>上产量更高 ——
        这正是《菜农部落》要学生验证的「作物—土壤适配」原理。
        检测需付费，对应真实农业里<b>测土配方施肥本来就要花钱</b>。</p>`;
  }

  /* 已付费：真实数据 */
  const rows = CROPS.map(c => {
    const pr = plantingProfit(c, land);
    const good = pr.match === 'good';
    return `<tr class="${good ? 'row-good' : ''}">
      <td>${c.name}${good ? ' <b class="ok">✅ 高收益</b>' : ''}</td>
      <td>${c.cost} × ${pr.plots} = ${pr.cost}</td>
      <td>${pr.yieldPerPlot} × ${pr.plots} = ${pr.income}</td>
      <td style="color:${pr.profit >= 0 ? '#3d7a30' : '#a03028'}">${pr.profit >= 0 ? '+' : ''}${pr.profit}</td>
    </tr>`;
  }).join('');

  return `
    <h4>作物收益表 <span class="revealed-tag">✓ 已检测 · 永久可见</span></h4>
    <table class="revealtable">
      <tr><th>作物</th><th>种子成本</th><th>本块地产量</th><th>净收益</th></tr>
      ${rows}
    </table>
    <p style="font-size:11.5px;color:var(--ink-3)">
      「净收益」= 产量收入 − 种子成本。<b>绿色高亮</b>的行 = 这块地的适配作物，产量更高。
      这正是《菜农部落》要学生验证的「作物—土壤适配」原理。</p>`;
}

/* =========================================================
   我的三类手牌：详情弹层（点图例上方的入口）
   ---------------------------------------------------------
   三个入口都展示**全部四个部落**的卡，而不只是当前视角那一个 ——
   一局里对手手里有几张延时气象卡、几张改良卡，直接决定他下回合能赚多少，
   属于公开信息，不该藏在对手的私手里。
   弹层首行是部落统计条（各部落该类卡数量 + 「你」标记）。
   ========================================================= */
/* 首行部落统计条：每个部落的该类卡数量 + 标记「你」 */
function tribeStatRow(me, counts) {
  const rows = G.players.map(p => {
    const n = counts(p);
    const mine = p === me;
    return `<div class="ts-cell${mine ? ' me' : ''}" style="--tc:${p.color}">
      <span class="ts-dot"></span>
      <span class="ts-name">${p.name}${mine ? '<em>你</em>' : ''}</span>
      <span class="ts-n">${n}</span>
    </div>`;
  }).join('');
  return `<div class="tribestat">${rows}</div>`;
}

/* 一个部落的小节标题 */
function tribeBlockHead(p, extra) {
  return `<h4 class="tbh" style="--tc:${p.color}">
    <span class="tbh-dot"></span>${p.name}
    <span class="tbh-x">${extra}</span>
  </h4>`;
}

function openCardHub(which) {
  const me = G.players[viewSeat()];

  /* ---------- 作物卡（种子）：显示全部部落 ---------- */
  if (which === 'seed') {
    const total = G.players.reduce((s, p) =>
      s + Object.values(p.seeds || {}).reduce((a, b) => a + b, 0), 0);
    const stat = tribeStatRow(me, p =>
      Object.values(p.seeds || {}).reduce((a, b) => a + b, 0));

    const blocks = G.players.map(p => {
      const owned = CROPS.filter(c => seedCount(p, c.id) > 0);
      const n = owned.reduce((s, c) => s + seedCount(p, c.id), 0);
      const head = tribeBlockHead(p, n ? `${n} 张` : '无');
      if (!n) return `${head}<p class="hint">尚未获得作物卡。</p>`;
      return head + `<div class="hubgrid">${owned.map(c => {
        const k = seedCount(p, c.id);
        return `<figure class="hubcard">
          <img src="${cropCard(c)}" alt="${c.name}">
          <figcaption><b>${c.name} ×${k}</b>
            <span>种子 ${c.cost} 币 · 高收 ${c.good} · 低收 ${c.bad}</span>
            <span class="hubnote">${k >= RULES.seedMaxPerType
              ? `已达单类上限 ${RULES.seedMaxPerType}` : '种植时优先消耗，不再重复扣钱'}</span>
            ${wikiBtn(c.wiki, c.name, 'wikibtn--mini')}
          </figcaption></figure>`;
      }).join('')}</div>`;
    }).join('');

    openModal(`<h3>作物卡（种子）· 全局共 ${total} 张</h3>
      ${stat}
      <p class="hint">开局每个部落已发 <b>2 张</b>基础种子卡，其余都要在<b>种子集市</b>买。
        每个部落最多同时带 <b>${RULES.seedMaxTotal}</b> 张种子卡，同一作物最多 <b>${RULES.seedMaxPerType}</b> 张。</p>
      ${blocks}`);
    return;
  }

  /* ---------- 延时气象卡：显示全部部落 ---------- */
  if (which === 'weather') {
    const stat = tribeStatRow(me, p => (p.weatherCards || []).length);
    const pending = G.players.reduce((s, p) => s + (p.weatherCards || []).length, 0);

    const blocks = G.players.map(p => {
      const list = (p.weatherCards || []).map(id => WEATHERS.find(x => x.id === id)).filter(Boolean);
      const head = tribeBlockHead(p, list.length ? `${list.length} 张待发` : '无');
      if (!list.length) return `${head}<p class="hint">没有待发的气象卡。落到<b>气象站</b>会获得一张。</p>`;
      return head + `<div class="hubgrid">${list.map(w => `
        <figure class="hubcard${w.sign > 0 ? ' good' : ' bad'}">
          <div class="wx-ico">${w.sign > 0 ? '☀️' : '⛈️'}</div>
          <figcaption><b>${w.name}</b><span>${w.sub}</span>
            <span class="wx-val">${w.base >= 0 ? '+' : ''}${w.base} 肥力币</span>
            <span class="hubnote">下次种植时自动发动</span>
            ${wikiBtn(w.wiki || '', w.name, 'wikibtn--mini')}</figcaption>
        </figure>`).join('')}</div>`;
    }).join('');

    openModal(`<h3>延时气象卡 · 全局待发 ${pending} 张</h3>
      ${stat}
      <p class="hint">气象卡<b>不会自动结算</b>：它在持有者<b>下一次种植</b>时自动发动（一次性，用掉即消失）。
        那一回合不种植，卡就一直留着，可以攒到关键地块再用。</p>
      ${blocks}`);
    return;
  }

  /* ---------- 改良卡：显示全部部落 ---------- */
  const stat = tribeStatRow(me, p => p.hand.length);
  const total = G.players.reduce((s, p) => s + p.hand.length, 0);
  const blocks = G.players.map(p => {
    const ib = improveBonus(p);
    const head = tribeBlockHead(p, p.hand.length
      ? `${p.hand.length} 张 · 增益 +${Math.round(ib.rate * 100)}%` : '无');
    if (!p.hand.length) return `${head}<p class="hint">没有改良卡。落到<b>土壤改良站</b>可以抽一张。</p>`;
    return head + `<div class="hubgrid">${p.hand.map(id => {
      const im = improveById(id);
      const pct = (improveCardRate(im) * 100).toFixed(1).replace(/\.0$/, '');
      return `<figure class="hubcard">
        <img src="${improveCard(im)}" alt="${im.name}">
        <figcaption><b>${im.name}</b><span>${im.station}</span>
          <span class="hb-note">${im.gain}</span>
          <span class="wx-val">面值 ${im.value} · 持有 +${pct}%</span>
          ${wikiBtn(im.wiki, im.name, 'wikibtn--mini')}</figcaption></figure>`;
    }).join('')}</div>`;
  }).join('');

  openModal(`<h3>改良卡 · 全局共 ${total} 张</h3>
    ${stat}
    <p class="hint">改良卡<b>抽到即得面值肥力币</b>，并<b>持有即增益</b>（不用点使用）：
      每张按<b>面值折算</b>增加收获收益 —— 面值 20 对应 <b>+6%</b>，其余 =（面值 ÷ 20）× 6%，
      合计上限 <b>+48%</b>。<b>不种作物就没有收益</b>。点击自己的卡牌 = 主动弃掉。</p>
    ${blocks}`);
}

/** 图鉴：全量卡牌参考书（不论谁持有都列全） */
function openHandbook(tab) {
  const me = G.players[viewSeat()];
  openHandbookRaw({
    G, RULES, TRACK,
    meName: me ? me.name : '',
    tab
  });
}

/* =========================================================
   「查阅科普」按钮
   ---------------------------------------------------------
   跳百度百科看真实世界的概念，让学生把游戏里的数值和现实对上。
   链接由 data.js 统一挂载（wiki 字段）：
     - 确认存在的词条 -> baike.baidu.com/item/<词条>（直达正文）
     - 拿不准的-> baike.baidu.com/search?word=<词>（站内搜索，永不 404）
   ========================================================= */
function wikiBtn(url, label, cls) {
  if (!url) return '';
  return `<a class="wikibtn ${cls || ''}" data-wk="${label}" href="${url}" target="_blank" rel="noopener noreferrer"
             title="在新标签页打开百度百科，了解「${label}」在现实中的概念">
            🔍 查阅科普</a>`;
}

/* 点击图板格子：查看详情 */
function onCellClick(i) {
  const cell = cellAt(i);
  if (cell.kind === 'land') {
    /* 打开详情后若玩家点了「土壤检测」，就地重绘这张弹层 */
    queueMicrotask(() => {
      const btn = $('btn-reveal');
      if (!btn) return;
      btn.addEventListener('click', () => {
        if (payReveal(i)) onCellClick(i);
      });
    });
    const land = landById(cell.soilId);
    codexMark('land', land.id, land.name);   // 农耕志：看过即入册该土壤图鉴
    const owner = G.landOwners[i];
    const ownerName = owner ? G.players.find(p => p.tid === owner).name : '无主';
    const fee = Math.round(land.price * RULES.passRate);
    openModal(`
      <img src="${landCard(land)}" style="width:100%;max-width:560px;border-radius:8px;
           margin-bottom:14px;box-shadow:0 3px 12px rgba(80,60,30,.18)" alt="${land.name}">
      <div class="wikibar">${wikiBtn(land.wiki, land.name)}</div>
      <h3>${land.name}　<span style="color:var(--red)">${land.price} 肥力币</span></h3>
      <table>
        <tr><th>分布</th><td>${land.region}</td></tr>
        <tr><th>健康度（肥力）</th><td>${land.fertility}（可种 ${plotsFor(land.fertility)} 片作物）</td></tr>
        <tr><th>质地</th><td>${land.texture}</td></tr>
        <tr><th>酸碱度</th><td>${land.ph}</td></tr>
        <tr><th>适配作物</th><td>${land.crops.join('、')}</td></tr>
        <tr><th>过路费</th><td>${fee} 肥力币（地价 ${RULES.passRate * 100}%）</td></tr>
        <tr><th>当前归属</th><td>${ownerName}</td></tr>
      </table>
      <p><b>土壤知识：</b>${land.knowledge}</p>
      <div class="wikibar">${wikiBtn(land.wiki, land.name)}</div>
      ${revealBlock(i, land)}
    `);
  } else {
    const st = STATIONS[cell.kind];
    openModal(`
      <h3>${st.name}</h3>
      <p>${st.desc}</p>
      <p style="font-size:11.5px;color:var(--ink-3)">赛道第 ${i + 1} 格</p>
      ${cell.kind === 'qixiang' ? weatherTableHtml() : ''}
    `);
  }
}

function weatherTableHtml() {
  return `<h4>气象事件卡（共 ${WEATHERS.length} 张，抽完重新洗牌）</h4>
    <table>
      <tr><th>气象事件</th><th>说明</th><th>统一奖惩</th></tr>
      ${WEATHERS.map(w => `<tr>
        <td>${w.name}<br><span style="font-size:10.5px;color:var(--ink-3)">${w.sub}</span></td>
        <td>${w.desc}</td>
        <td style="color:${w.sign > 0 ? '#3d7a30' : '#a03028'}">${w.sign > 0 ? '+' : ''}${w.base}</td>
      </tr>`).join('')}
    </table>
    <p style="font-size:11.5px;color:#a03028">
      ⚠ 注意：原版规则对所有作物<strong>统一奖惩</strong>，不考虑作物习性差异 ——
      这正是课程中要学生发现的核心科学性 BUG。</p>`;
}

/* =========================================================
   种植弹层
   ========================================================= */
function openPlantModal(idx) {
  const me = viewMe();
  const rec = me.lands[idx];
  /* 这块地不是面板主人的 —— 不能进种植弹层。
     早先这里只写一句 return，玩家点了完全没反应，看起来像卡住了。
     现在给出明确原因，并把「为什么用 viewMe() 而不是 G.turn」记在这里：
     单机模式下你选了 C 部落但当前行动者是 A 部落时，
     用 G.players[G.turn] 会去读 A 部落的 lands，索引自然对不上。 */
  if (!rec) {
    const cell = cellAt(idx);
    const owner = G.landOwners[idx];
    const soil = landById(cell.soilId);
    const who = owner ? G.players.find(q => q.tid === owner) : null;
    pushLog('bad', who
      ? `${soil.name}属于${who.name}，你不能在那里种植`
      : `你还没有${soil.name}，先买下这块地才能种`);
    return;
  }
  const land = landById(rec.soilId);
  /* 只能给**当前所在**的那块地种植：面板里可能列着好几块自有地，
     站在 a 时点 b 的「种植」必须挡住 —— 否则就是隔空种地（用户实测反馈）。
     规则本体在 engine.plant（唯一的判定处），这里只是提前给出人话提示。 */
  if (idx !== me.pos) {
    pushLog('bad', `你正站在${cellName(me.pos)}，只能给脚下的土地种植；${land.name} 不在你脚下`);
    return;
  }
  const cap = plotsFor(land.fertility);
  const used = rec.crops.length;
  const room = cap - used;

  const pendingWx = (me.weatherCards || []).map(id => WEATHERS.find(x => x.id === id)).filter(Boolean);
  const wxBase = pendingWx.length ? pendingWx[0].base : 0;
  const impB = improveBonus(me);

  /* 本次要种的片数：默认种满剩余空位，可在 1~room 之间自选。
     肥力（cap）只是**上限**，不强制种满 —— 想留空位 / 种子不够 / 只想试种都能少种。 */
  let qty = room;

  /* 单片净收益：把「部落特长 → 改良卡持有增益」整条链算进去，与 harvest() 完全一致 */
  const netOne = (c, base) => {
    const b = traitHarvestBonus(me, rec.soilId, c.id, base);
    return impB.rate > 0 ? Math.round(b.profit * (1 + impB.rate)) : b.profit;
  };
  /* 本次 n 片的净收益：延时气象只作用在**第一片**（与 plant() 一致） */
  const totalFor = (c, n) => {
    const per = plantingProfit(c, land).yieldPerPlot;
    if (!pendingWx.length) return netOne(c, per) * n;
    return netOne(c, per) * (n - 1) + netOne(c, per + wxBase);
  };

  const html = () => `
    <h3>在${land.name}种植作物</h3>
    ${pendingWx.length ? `<p class="wxnote">🌦️ 手上有一张<b>延时气象卡</b>，本次种植会自动发动：
      <b>${pendingWx[0].name}·${pendingWx[0].sub}</b>（${pendingWx[0].base >= 0 ? '+' : ''}${pendingWx[0].base} 肥力币，用掉即消失，只作用于第一片）</p>` : ''}
    ${impB.count ? `<p class="wxnote">🎴 持有 <b>${impB.count}</b> 张改良卡，本次收获额外 <b>+${Math.round(impB.rate * 100)}%</b></p>` : ''}
    <p>${land.fertility}肥力，共可种 <b>${cap}</b> 片，已种 <b>${used}</b> 片，
       还能种 <b style="color:var(--red)">${room}</b> 片。<br>
       土壤质地 ${land.texture}｜${land.ph}<br>
       适配作物：<b>${land.crops.join('、')}</b></p>
    <div class="qtybar">
      <span>本次种植</span>
      <button id="qty-minus" type="button" ${qty <= 1 ? 'disabled' : ''} aria-label="少种一片">−</button>
      <b class="qty-num" id="qty-val">${qty}</b>
      <button id="qty-plus" type="button" ${qty >= room ? 'disabled' : ''} aria-label="多种一片">＋</button>
      <span class="qty-hint">片（1 ~ ${room} 片，肥力只是上限）</span>
      ${qty < room ? `<span class="qty-fill" id="qty-fill">种满 ${room} 片</span>` : ''}
    </div>
    <h4>选择要种植的作物（一片一张种子卡；种不满 ${qty} 片时会按手中种子数量少种）</h4>
    <div class="cardgrid" id="croppick">
      ${CROPS.map(c => {
    const pr = plantingProfit(c, land);
    /* 展示值必须和 plant() 完全一致，否则玩家看到的和结算的对不上：
       种子钱在买卡时已付，种植环节 cost 恒为 0；
       单片利润 = yieldPerPlot（把省下的这一片种子成本算回去）。 */
    const held = seedCount(me, c.id);
    const hasSeed = held > 0;
    /* 一片一张种子卡：这张卡**实际能种几片** = min(本次片数, 手里种子数)。
       只要手里还有该作物的种子就能种（少种几片即可），不必凑够全部 qty 片 ——
       否则「地有 2 片空位、手里两种种子各 1 张」会被误判成一片都种不了。 */
    const canUse = Math.min(qty, held);
    const canPlant = canUse > 0;
    const good = pr.match === 'good';
    const hb = traitHarvestBonus(me, rec.soilId, c.id, pr.yieldPerPlot);
    const impTag = impB.rate > 0 ? `<div class="cc-bonus cc-bonus--imp">改良卡 +${Math.round(impB.rate * 100)}%</div>` : '';
    const wxTag = pendingWx.length ? `<div class="cc-bonus cc-bonus--wx">${pendingWx[0].name} ${pendingWx[0].base >= 0 ? '+' : ''}${pendingWx[0].base}</div>` : '';
    const bonus = hb.label ? `<div class="cc-bonus">${hb.label}</div>` : '';
    const stockTag = hasSeed
      ? `<div class="cc-stock${canUse < qty ? ' cc-noseed' : ''}">手中种子 ×${held}，本次种 ${canUse} 片${canUse < qty ? `（种子仅够 ${canUse} 片）` : ''}</div>`
      : `<div class="cc-stock cc-noseed">✖ 无种子 · 不可种，去集市购买</div>`;
    const costTag = hasSeed
      ? `<b style="color:#3d7a30">0（消耗 ${canUse} 张种子）</b>`
      : `<b style="color:#a03028">—</b>`;
    const net = totalFor(c, canPlant ? canUse : qty);
    const cls = `${good ? 'good' : ''}${hasSeed ? '' : ' noseed'}${(hasSeed && canUse < qty) ? ' notenough' : ''}`;
    return `<figure data-crop="${c.id}" class="${cls}"
          style="margin:0;cursor:${canPlant ? 'pointer' : 'not-allowed'};opacity:${canPlant ? 1 : .55}">
          <img src="${cropCard(c)}" alt="${c.name}" data-crop="${c.id}">
          ${wikiBtn(c.wiki, c.name, 'wikibtn--mini')}
          <figcaption>
            <span class="cc-cost">${costTag}</span><br>
            <span style="color:${good ? '#3d7a30' : '#a03028'}">
              ${good ? '适配 ✓ ' : ''}${canPlant ? canUse : qty} 片净${net >= 0 ? '+' : ''}${net}</span>
            ${stockTag}${bonus}${impTag}${wxTag}
          </figcaption>
        </figure>`;
  }).join('')}
    </div>
    <p style="font-size:11.5px;color:var(--ink-3);margin-top:10px">
      绿框 = 该作物的「高收益土壤」正好是这块地${me.trait ? `；加成已计入
      <b style="color:var(--gold-lo)">${me.trait.name}</b>` : ''}。每片单独计收益、单独消耗 1 张种子卡，收益在收获时结算。</p>
  `;

  /* 加减片数只重画弹层（数值、印章、按钮状态全部跟着变），不重开新弹层 */
  const bind = () => {
    $('qty-minus').addEventListener('click', () => { qty = Math.max(1, qty - 1); paint(); });
    $('qty-plus').addEventListener('click', () => { qty = Math.min(room, qty + 1); paint(); });
    const fill = $('qty-fill');
    if (fill) fill.addEventListener('click', () => { qty = room; paint(); });

    $('croppick').querySelectorAll('img[data-crop]').forEach(img => {
      img.addEventListener('click', () => {
        const cid = img.dataset.crop;
        /* 本次实际种几片 = min(本次片数, 手里该作物种子数)：种子不够就少种几片。 */
        const n = Math.min(qty, seedCount(me, cid));
        if (n < 1) { pushLog('bad', '没有这张作物的种子卡，去种子集市购买'); return; }
        const r = plant(G, me, idx, cid, n);
        if (!r.ok) {
          pushLog('bad', '种植失败：' + r.msg);
          return;
        }
        const cr = cropById(cid);
        pushLog('plant', `${me.name} 在${land.name}种下 ${r.plots} 片${cr.name}`
          + `（${r.match === 'good' ? '适配土壤 ✓' : '非适配土壤'}），`
          + `消耗 ${r.plots} 张种子卡`);
        closeModal();
        render();
        showActions(`${me.name} 的回合 · ${land.name}`, postMoveActions());
      });
    });
  };
  const paint = () => { openModal(html()); bind(); };

  paint();
}

/* =========================================================
   种子集市
   ---------------------------------------------------------
   引擎侧 buyCrop 扣钱后把作物卡存进 player.seeds；
   种植时 plant() 优先消耗手牌（钱买卡时已付过，不再重复扣），
   利润里把省下的种子成本加回去，所以「囤种子」是净赚而非重复扣款。
   ========================================================= */
function openMarket() {
    const me = viewMe();
  const goods = marketCrops(G);

  const heldTotal = seedsTotal(me);
  const totalFull = heldTotal >= RULES.seedMaxTotal;

  openModal(`
    <h3>种子集市</h3>
    <p style="color:var(--ink-3);font-size:12.5px;margin:-2px 0 10px">
      买下的作物卡进你的手牌。每个部落最多同时带 <b>${RULES.seedMaxTotal}</b> 张种子卡
      （同一作物最多 <b>${RULES.seedMaxPerType}</b> 张）。
      之后在自有土地上种植时会<b>优先消耗手牌</b>、不再重复付种子钱。<br>
      现有 <b style="color:var(--cinnabar)">${me.money}</b> 肥力币 ·
      种子卡 <b style="color:${totalFull ? 'var(--cinnabar)' : 'inherit'}">${heldTotal}/${RULES.seedMaxTotal}</b></p>
    <div class="cardgrid" id="marketlist">
      ${goods.map(c => {
        const held = seedCount(me, c.id);
        /* 实付价 = 基础价按部落特长折算（古蜀·水稻成本减半）。
           卡片价 / 是否买得起 / 右侧日志三处**必须**都用这个数：
           早先卡片与日志用基础价、扣款用实付价，玩家看到「日志 15 币、实际扣 8 币」。 */
        const price = traitSeedCost(me, c.id, c.cost);
        const afford = me.money >= price;
        const full = held >= RULES.seedMaxPerType || totalFull;
        const ok = afford && !full;
        return `<figure style="margin:0;cursor:${ok ? 'pointer' : 'not-allowed'};opacity:${ok ? 1 : .45}">
          <img src="${cropCard(c)}" alt="${c.name}" data-seed="${c.id}"
               style="border-color:${held ? 'var(--gold)' : 'var(--line)'};border-width:${held ? '2.5' : '1.5'}px">
          ${wikiBtn(c.wiki, c.name, 'wikibtn--mini')}
          <figcaption>
            <span class="cc-cost">种子 <b>${price}</b> 币</span><br>
            <span style="color:var(--ink-3)">高收 ${c.good} · 低收 ${c.bad}</span>
            ${held ? `<div class="cc-bonus">手中 ×${held}</div>` : ''}
            ${full ? `<div class="cc-full">${held >= RULES.seedMaxPerType ? '已囤满' : `种子卡已满 ${RULES.seedMaxTotal} 张`}</div>` : ''}
          </figcaption>
        </figure>`;
      }).join('')}
    </div>
  `);

  $('marketlist').querySelectorAll('img[data-seed]').forEach(img => {
    img.addEventListener('click', () => {
      const r = buyCrop(G, me, img.dataset.seed);
      if (!r.ok) { pushLog('bad', r.msg); return; }
      pushLog('buy', `${me.name} 买下作物卡「${r.crop.name}」 −${r.price}（手中 ×${r.held}）`);
      codexMark('crop', r.crop.id, r.crop.name);   // 农耕志：买到种子即入册该作物图鉴
      renderSeeds();
      openMarket();          // 重绘，让持有数与可购状态跟上
    });
  });
}

/* =========================================================
   回合流程
   ---------------------------------------------------------
   本地对战：四个部落都由真人点击操作。
   单机模式：玩家在开局前挑一个部落当真人（openChooseTribe），
             其余三个由电脑控制；电脑每执行一步都停 AI_STEP_MS（3 秒）。
   ========================================================= */
const SEAT_KEY = 'cnvillage.seat.v1';
/** 单机模式下真人坐的座位（0~3），玩家可自选，刷新后保留 */
let HUMAN_SEAT = (() => {
  try {
    const v = Number(localStorage.getItem(SEAT_KEY));
    return Number.isInteger(v) && v >= 0 && v < RULES.tribes ? v : 0;
  } catch (e) { return 0; }
})();
/* 电脑每步之间的停顿。默认 3 秒；顶栏可切「快速模式」压到 0.6 秒 ——
   3 秒一格、一回合 4~8 格，三个电脑一轮要等 36~72 秒，
   很多人会以为游戏卡死了。 */
const AI_SLOW_MS = 3000, AI_FAST_MS = 600;
const FAST_KEY = 'cnvillage.fastmode.v1';
let FAST_MODE = (() => {
  try { return localStorage.getItem(FAST_KEY) === '1'; } catch (e) { return false; }
})();
let AI_STEP_MS = FAST_MODE ? AI_FAST_MS : AI_SLOW_MS;
function setFastMode(on) {
  FAST_MODE = !!on;
  AI_STEP_MS = on ? AI_FAST_MS : AI_SLOW_MS;
  try { localStorage.setItem(FAST_KEY, on ? '1' : '0'); } catch (e) { /* 忽略 */ }
  /* 按钮结构是 <span id=fast-ico>🐢</span><span class=tb-t>3 秒</span>，
     窄屏下 .tb-t 会被 CSS 隐藏（只留图标）。
     所以只能分别更新两个 span —— 直接写 b.textContent 会把图标一起抹掉。 */
  const b = $('btn-fast');
  if (b) {
    b.classList.toggle('on', on);
    const ico = $('fast-ico'), txt = $('fast-txt');
    if (ico) ico.textContent = on ? '⚡' : '🐢';
    if (txt) txt.textContent = on ? '快速' : '3 秒';
  }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/** 停 ms 毫秒；期间若有人开了新局（纪元变了）→ 返回 false，调用方应立刻 return。
    异步回合协程统一用它代替裸 sleep()，避免旧协程对新一局继续动手。
    ep = null 表示「不校验」（非回合协程的调用点）。 */
async function pace(ep, ms) { await sleep(ms); return ep === null || ep === TURN_EPOCH; }

/** 该座位是不是电脑（单机模式下除真人外都是） */
function isAI(seat) { return MODE === 'solo' && seat !== HUMAN_SEAT; }

/* =========================================================
   单机模式：开局前选择部落
   ---------------------------------------------------------
   四个部落的特长差别很大（华北加成 / 水稻半价 / 追加掷骰 / 起点奖励），
   让玩家自己挑一个当主角。座位记进 localStorage，下次开机沿用。
   ========================================================= */
function setSeat(seat) {
  HUMAN_SEAT = seat;
  try { localStorage.setItem(SEAT_KEY, String(seat)); } catch (e) { /* 忽略 */ }
}

function openChooseTribe() {
  const cards = TRIBES.map((t, i) => {
    const tr = TRIBE_TRAITS[t.id] || {};
    const m = MOTIF_THUMBS.find(x => x.id === t.id);
    const on = i === HUMAN_SEAT;
    return `<figure class="pickcard${on ? ' on' : ''}" data-seat="${i}"
                 style="--tc:${t.color}">
      <div class="pickpic" style="background-image:url('${svgToDataUri(m.svg)}')"></div>
      <figcaption>
        <b>${t.name}</b><span class="pmotif">${t.motif}</span>
        <span class="picktrait">${tr.name || ''}｜${tr.short || tr.desc || ''}</span>
        <span class="pickdesc">${tr.desc || ''}</span>
        <span class="pickslot">${on ? '✓ 你当前选择的部落' : '点选'}</span>
      </figcaption>
    </figure>`;
  }).join('');

  openModal(`
    <h3>单机模式 · 选择你的部落</h3>
    <p style="color:var(--ink-3);font-size:12.5px;margin:-2px 0 12px">
      四个部落的特长差别很大，选一个当主角；其余三个由电脑控制（每步间隔 3 秒）。</p>
    <div class="pickgrid" id="pickgrid">${cards}</div>
    <div class="setactions">
      <button class="tb primary" id="pick-ok" type="button">${MODE === 'solo' ? '以此部落开局' : '切换到单机模式'}</button>
      <button class="tb" id="pick-cancel" type="button">取消</button>
    </div>
  `);

  $('pickgrid').querySelectorAll('.pickcard').forEach(fig => {
    fig.addEventListener('click', () => {
      setSeat(Number(fig.dataset.seat));
      $('pickgrid').querySelectorAll('.pickcard').forEach(x => x.classList.remove('on'));
      fig.classList.add('on');
      const slot = $('pickgrid').querySelector('.pickcard.on .pickslot');
      $('pickgrid').querySelectorAll('.pickslot').forEach(s => { s.textContent = '点选'; });
      if (slot) slot.textContent = '✓ 你当前选择的部落';
    });
  });
  $('pick-ok').addEventListener('click', () => {
    if (MODE !== 'solo') setMode('solo');
    closeModal();
    /* 这里**不弹顺序窗**（gate 留空）：选部落的语义是「我已经准备好了，直接开打」，
       再插一道确认窗等于多此一举。顺序公示只发生在「入场」时刻 ——
       开篇点「进入田亩」与顶栏「新游戏」这两处。
       ⚠️ 曾在这里用 newGame(true)，导致 ui.test §4 点了 pick-ok 之后
       顺序窗一直盖在屏幕上（没人点 order-ok），后续 §25 的
       elementFromPoint 断言读到 ordergate 而非 waiting。 */
    newGame();
  });
  $('pick-cancel').addEventListener('click', closeModal);
}

/** 引擎事件 -> 日志配色 class */
/* 事件 → 日志 kind。保留语义（气象就是气象、收获就是收获），
   负向结果用 -bad 后缀，由 CSS 决定颜色，避免这里就把信息压成 good/bad。 */
function logKindOf(ev) {
  switch (ev.kind) {
    case 'harvest': return (ev.total >= 0) ? 'harvest' : 'harvest-bad';
    case 'weather': return (ev.total >= 0) ? 'weather' : 'weather-bad';
    case 'start':   return 'start';
    case 'improve': return 'improve';
    case 'buy':     return 'buy';
    case 'plant':   return 'plant';
    case 'use':     return 'use';
    case 'land':    return 'land';
    case 'station': return 'station';
    case 'market':  return 'market';
    case 'dice':    return 'dice';
    case 'pass':    return 'pass';
    case 'prison':  return 'prison';
    case 'skip':    return 'skip';
    case 'win':     return 'win';
    default:        return 'sys';
  }
}

/** 让棋子沿经过的格子逐格走过去（纯视觉，不动状态） */
/**
 * 让棋子沿经过的格子逐格走过去（纯视觉，不动状态）。
 * msPerCell 要明显大于 .pawn.walking 的 CSS 过渡时长，
 * 否则过渡还没走完就被推到下一格，看起来是「跳变」而不是「走」。
 * 每落一格给该格一个短暂的驻足高亮，让「走了几格」一目了然。
 */
async function walkPawn(player, passed, msPerCell = 250, ep = null) {
  const w = pawnEls[player.tid];
  if (!w || !passed || !passed.length) return;
  w.classList.add('walking');
  for (const idx of passed) {
    if (ep !== null && ep !== TURN_EPOCH) break;   // 开了新局：停走（旧棋子已是游离节点）
    const [nx, ny] = CELL_POS[idx] || [];
    if (nx === undefined) continue;
    w.style.left = (nx * 100).toFixed(3) + '%';
    w.style.top = (ny * 100).toFixed(3) + '%';
    // 落点格闪一下，玩家能数清走了几格
    const cellEl = cellEls[idx];
    if (cellEl) {
      cellEl.classList.add('step-on');
      setTimeout(() => cellEl.classList.remove('step-on'), Math.min(260, msPerCell));
    }
    await sleep(msPerCell);
    if (ep !== null && ep !== TURN_EPOCH) break;   // 走的过程中被重开
  }
  w.classList.remove('walking');
}

/**
 * 推进到当前座位：真人就交出操作权，电脑就自动走完整个回合。
 * 所有换手都从这里过，避免两处逻辑分叉。
 */
function nextTurn() {
  if (G.over) { aiStep = ''; render(); showBanner(); return; }
  const p = cur();
  /* 清掉上一个人的动作词，否则按钮会显示「🤖 X部落 结算中…」
     而实际已经换手到下一个玩家，看着像卡住。 */
  aiStep = '';
  render();
  if (isAITurn()) {
    runAiTurn();                // 提示窗保持显示，AI 之间不闪
  } else {
    /* 回到真人：收掉电脑行动提示窗。
       之前不给任何「轮到你了」的强提示，玩家等完三个电脑
       只看到界面恢复，很容易以为整局卡住。 */
    hideWaiting();
    pushLog('turn', `—— 轮到 ${p.name} ——`);
    /* 回合开始**不摆操作框**：按单一状态机，买地/种植/收获都发生在
       「掷骰 → 落格」之后，这里摆出来的是**上一回合落点**的旧操作，
       既没有「结束回合」出口（用户会以为卡住），也会诱导玩家没掷骰就想操作。
       只把骰子按钮高亮成「轮到你了」。操作框等落格后再由 showLandActions() 弹。 */
    hideActions();
    $('btn-roll').disabled = false;
    $('btn-roll').classList.add('your-turn');
    setTimeout(() => $('btn-roll').classList.remove('your-turn'), 1800);
  }
}


/* =========================================================
   真人回合流程
   ---------------------------------------------------------
   ① 掷骰（决定基础步数）
   ② 追风决策（丝绸部落，冷却好了才有）—— **在走棋之前**，
      这样追风骰的点数直接加进本回合总步数，一次走完。
      早先的顺序是「掷骰 → 走完 → 再问要不要追风 → 再走一段」，
      变成棋子分两段跳，玩家看到的落点与总点数对不上。
   ③ 一次性走完总步数
   ④ 落格结算（气象卡/改良卡/抽牌等自动事件）
   ⑤ **落格操作**：买地 / 种植 / 收获 / 进集市 —— 由玩家点
   ⑥ 换手
   ========================================================= */

/** 走棋 + 逐格事件 + 落格结算（三段合一）。ep 见 TURN_EPOCH：过期的协程会中途 return。 */
async function runMoveAndSettle(me, steps, ep = null) {
  // 移动：棋子逐格走过去
  const mv = stepMove(G, steps);
  await walkPawn(me, mv.passed, 250, ep);
  if (ep !== null && ep !== TURN_EPOCH) return;   // 走棋期间被重开：别再结算（G 已换新）
  syncBoard2D();

  // 逐格事件（过路费、起点奖励…）
  for (const ev of mv.events) {
    pushLog(ev.kind === 'pass' ? 'warn' : (ev.kind || ''), ev.msg);
    render();
    if (!await pace(ep, 300)) return;
  }

  // 落格结算（气象卡发动、抽改良卡、过站牌位…）
  const st = stepSettle(G);
  for (const ev of st.events) {
    pushLog(logKindOf(ev), ev.msg);
    render();
    if (!await pace(ep, 330)) return;
  }
}

/** 收尾：胜负判定 + 换手 */
function finishTurn() {
  const en = stepEnd(G);
  for (const ev of en.events) pushLog(logKindOf(ev), ev.msg);
  render();
  busy = false;
  nextTurn();
}

/**
 * 落格操作：把「这里能做什么」摆给玩家，点完才换手。
 * 早先这段逻辑只挂在 nextTurn（轮到你时），于是**掷骰移动之后
 * 什么都不弹**，玩家必须干等三个部落走完才有机会买地/种植 ——
 * 严重破坏「投骰 → 操作」的节奏。
 *
 * 现在**一律弹出**：哪怕落在没有任何操作的站点格，也至少给一个
 * 「结束回合」按钮。早先无操作就静默自动换手，玩家看到的是「界面一闪而过、
 * 没有结束回合可点」，以为卡住了（用户实测反馈）。
 */
function showLandActions() {
  const me = cur();
  showActions(`${me.name} 的回合 · ${cellName(me.pos)}`, postMoveActions());
  return true;
}

/** 格子的中文名，用于提示语 */
function cellName(idx) {
  const c = cellAt(idx);
  if (!c) return '未知格';
  if (c.kind === 'land') return landById(c.soilId).name;
  if (c.kind === 'start') return '起点';
  return (STATIONS[c.kind] || {}).name || c.kind;
}

/** 真人掷骰 → 追风决策 → 走棋 → 落格操作 */
async function doRoll() {
  if (busy || G.over) return;
  if (isAITurn()) return;             // 电脑的回合不接受手动点击
  const ep = TURN_EPOCH;              // 本回合的纪元；被重开即作废（见 TURN_EPOCH 注释）
  const me = cur();
  busy = true;
  $('btn-roll').disabled = true;
  hideActions();

  // ① 掷骰
  const r = stepRoll(G);
  if (r.skipped) {
    pushLog('prison', `${me.name} 在监狱服刑，本回合暂停`);
    stepEnd(G);
    if (!await pace(ep, 650)) return;
    busy = false; render(); nextTurn(); return;
  }
  showDice(r.dice, r.steps);
  pushLog('dice', `${me.name} 掷出 ${r.dice.join(' + ')} = ${r.steps} 步`);
  let total = r.steps;
  if (!await pace(ep, 430)) return;

  // ② 追风决策（丝绸部落）—— 必须在走棋之前
  if (me.extraRollLeft > 0 && !G.over) {
    /* ⚠️ 追风是「等玩家点」的决策，但 showActions() 会因 busy 把按钮全部禁用。
       这里若不放掉 busy，两个按钮都是灰的、promise 永不 resolve ——
       表现就是「点了骰子没反应、棋子不动、追风按钮点不动」。
       决策完再收回 busy，交给后面的走棋动画。 */
    busy = false;
    const ex = await askExtraRoll(me);     // 返回 {dice, steps} 或 null
    /* 等待期间若被「重开」，纪元已变 —— 旧协程就此 return（只 return，
       不碰 busy/换手，交由 newGame() 接管），别再对新一局动手。 */
    if (ep !== TURN_EPOCH) return;
    busy = true;
    $('btn-roll').disabled = true;         // 决策期间也不允许重掷
    if (ex) {
      showDice(ex.dice, ex.steps, true);
      pushLog('dice', ex.msg);
      render();
      if (!await pace(ep, 450)) return;
      total += ex.steps;                    // 点数加进总步数，一次走完
      pushLog('dice', `追风后本回合共走 ${total} 步`);
      if (!await pace(ep, 260)) return;
    }
  }

  // ③ 一次性走完（把 ep 传进去，中途被重开就停）
  await runMoveAndSettle(me, total, ep);
  if (ep !== TURN_EPOCH) return;          // 走棋期间被重开：早退

  // ④⑤ 落格操作：买地 / 种植 / 收获 / 集市 —— 等玩家点完才换手
  busy = false;
  render();
  if (G.over) { finishTurn(); return; }
  showLandActions();               // 一律弹出，至少含「结束回合」出口
  $('btn-roll').disabled = true;   // 操作期间不能再次掷骰
}

/**
 * 追风决策：弹按钮等玩家选，解析成 {dice, steps, msg} 或 null。
 * 追风骰的结果必须**在走棋之前**拿到并累加，不能走完再问。
 */
function askExtraRoll(me) {
  return new Promise(resolve => {
    showActions(`${me.name} · ${me.trait.name}`, [
      {
        label: '🌪 追风：追加掷骰', primary: true,
        desc: `投 1 颗追风骰（1~${me.trait.extraRollMax} 点），点数加进本回合总步数`,
        onClick: () => {
          const ex = stepExtraRoll(G);
          if (!ex.ok) { hideActions(); resolve(null); return; }
          /* 选了追风就把决策框收掉：否则这两个按钮会一直杵在屏幕上，
             跟着棋子走完整段路，玩家以为「没点中、还得再点一次」。 */
          hideActions();
          resolve({
            dice: ex.dice, steps: ex.steps,
            msg: ex.events && ex.events[0] ? ex.events[0].msg
                 : `${me.name} 追风追加 ${ex.steps} 步`
          });
        }
      },
      {
        label: '不追风，直接走',
        desc: '放弃本次追加（每 2 回合才有一次机会）',
        onClick: () => { hideActions(); resolve(null); }
      }
    ]);
  });
}

/** 追风：追风骰已并入 doRoll 的总步数，这里只做界面收尾 */
async function doExtraRoll() {
  /* 保留导出名以兼容 debug / 测试；新流程里追风在 doRoll 内部完成，
     这个函数只在被外部直接调用时兜底。*/
  await finishTurn();
}


/* =========================================================
   电脑回合

   「每一步 3 秒」的目的是让玩家看得清电脑在干什么，不是让玩家干等。
   所以只有「真的产生了一条玩家能读到的动作」才占这 3 秒：
     · 决策闭包没产出事件 -> 不停
     · 逐格过路费 / 落格结算的一批事件 -> 合并成一步播报，而不是每条各停 3 秒
   这样典型电脑回合约 6~8 步（18~24 秒），而不是原来的 10~15 步（30~45 秒）。
   每一步都会把当前动作写进掷骰按钮（aiStep），玩家知道在等什么。
   ========================================================= */

/** 播报一批事件；返回 true 表示确实有内容、值得停 3 秒 */
function aiBroadcast(events) {
  const list = Array.isArray(events) ? events : [events];
  let n = 0;
  for (const ev of list) {
    if (!ev || !ev.msg) continue;
    pushLog(ev.kind === 'pass' ? 'warn' : logKindOf(ev), ev.msg);
    n++;
  }
  if (!n) return false;
  render();
  return true;
}

/* 电脑行动提示 ----------------------------------------------------
   只在正中显示一个小窗（转圈 + 部落名 + 当前动作），**不遮挡棋盘** ——
   玩家要能亲眼看见电脑的棋子在逐格移动、日志在逐条刷出来，
   这些才是「电脑在干什么」的直接证据，比任何文字说明都有用。
   提示窗层完全透明（只拦截误点击），棋盘始终可见。 */
let waitTimer = null;
function showWaiting(name) {
  const box = $('waiting');
  if (!box) return;
  box.hidden = false;
  $('wait-tribe').textContent = name;
  $('wait-act').textContent = '思考中…';
  if (waitTimer) clearInterval(waitTimer);
  waitTimer = setInterval(() => {
    const el = $('wait-act');
    if (el) el.textContent = (aiStep || '行动中') + '…';
  }, 500);
}
function hideWaiting() {
  const box = $('waiting');
  if (box) box.hidden = true;
  if (waitTimer) { clearInterval(waitTimer); waitTimer = null; }
}

async function runAiTurn() {
  if (busy || G.over) return;
  const ep = TURN_EPOCH;              // 本回合的纪元；被「重开」即作废（见 TURN_EPOCH 注释）
  const p = cur();
  busy = true;
  $('btn-roll').disabled = true;
  hideActions();
  pushLog('turn', `—— 轮到 ${p.name}（电脑） ——`);
  aiStep = '思考中…';
  render();
  showWaiting(p.name);

  // ① 掷骰（含追风）
  //    决策统一放在**移动落格之后**（见下方 ④b），与真人流程一致：
  //    投了骰子、走到格子上，再决定买地/种植/收获。
  //    早先这里还多跑了一次 aiPlan，等于电脑一回合决策两遍，破坏平衡。
  aiStep = '掷骰…';
  const r = stepRoll(G);
  if (r.skipped) {
    pushLog('prison', `${p.name} 在监狱服刑，本回合暂停`);
    stepEnd(G);
    aiStep = '';
    render();
    if (!await pace(ep, AI_STEP_MS)) return;
    busy = false; nextTurn(); return;
  }
  showDice(r.dice, r.steps);
  pushLog('dice', `${p.name} 掷出 ${r.dice.join(' + ')} = ${r.steps} 步`);
  let total = r.steps;              // 总步数：追风点数直接加进来，一次走完
  render();
  if (!await pace(ep, AI_STEP_MS)) return;

  // ①b 追风（丝绸部落）：**必须在走棋之前**，与真人流程一致
  if (p.extraRollLeft > 0 && !G.over) {
    aiStep = '追风再投…';
    render();
    if (!await pace(ep, AI_STEP_MS)) return;
    const ex = stepExtraRoll(G);
    if (ex.ok) {
      showDice(ex.dice, ex.steps, true);
      pushLog('dice', ex.events[0].msg);
      total += ex.steps;
      pushLog('dice', `${p.name} 追风后本回合共走 ${total} 步`);
      render();
      if (!await pace(ep, AI_STEP_MS)) return;
    }
  }

  // ② 一次性走完总步数
  aiStep = '行军中…';
  const mv = stepMove(G, total);
  await walkPawn(p, mv.passed, 250, ep);
  if (ep !== TURN_EPOCH) return;   // 走棋动画期间被重开：停手，G 已是新一局
  syncBoard2D();
  render();
  if (aiBroadcast(mv.events)) { if (!await pace(ep, AI_STEP_MS)) return; }

  // ③ 落格结算
  aiStep = '结算中…';
  if (aiBroadcast(stepSettle(G).events)) { if (!await pace(ep, AI_STEP_MS)) return; }

  // ③b 落格操作：买地 / 种植 / 收获 —— 与真人同样要在移动后立刻做
  aiStep = '操作中…';
  render();
  const plan = aiPlan(G, p);
  for (const act of plan) {
    if (ep !== TURN_EPOCH) return; // 被重开：别再执行旧局决策，更不许动新一局
    if (G.over) break;
    const ev = act();
    if (!ev || !ev.msg) continue;
    aiStep = `${ACTION_VERB[ev.kind] || '行动中'}`;
    pushLog(logKindOf(ev), ev.msg);
    render();
    if (!await pace(ep, AI_STEP_MS)) return;
  }

  // ④ 收尾
  if (ep !== TURN_EPOCH) return;   // 别替新一局判胜负 / 换手
  const en = stepEnd(G);
  aiBroadcast(en.events);
  if (!await pace(ep, AI_STEP_MS)) return;
  aiStep = '';
  busy = false;
  nextTurn();
}

/** 电脑动作 -> 按钮上显示的动词，让玩家知道它在干嘛 */
const ACTION_VERB = {
  buy: '买地中', plant: '种植中', harvest: '收获中', use: '用卡中',
  skip: '评估中', market: '买种中', pass: '过路费', start: '过起点',
  weather: '看天气', improve: '抽改良卡', prison: '进监狱',
};

/* =========================================================
   弹层控制
   ========================================================= */
function openModal(html) {
  $('modal-body').innerHTML = html;
  $('modal').hidden = false;
}
/* 关闭时顺手清空内容：留着旧 DOM 会让「打开后统计弹层里有几个卡片」
   这类断言读到上一次的残留（openModal 会整体覆盖，但清空更不容易出错），
   也避免隐藏的弹层里挂着几十张 data URI 卡面占内存。 */
function closeModal() {
  $('modal').hidden = true;
  $('modal-body').innerHTML = '';
}
$('modal-close').addEventListener('click', closeModal);
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });

/* 规则弹层 */
function openRules() {
  const legend = `<h4>四大部落标识</h4>
    <div class="motif-legend">
      ${MOTIF_THUMBS.map(m => `<div class="motif-box">
        <div class="mi" style="background-image:url('${svgToDataUri(m.svg)}')"></div>
        <b>${m.name}</b>
        <span>${m.motif}</span>
      </div>`).join('')}
    </div>`;

  const traitList = `<h4>部落特长</h4>
    <ul class="rulelist traitlist">
      ${TRIBES.map(t => {
        const tr = TRIBE_TRAITS[t.id];
        return `<li><b style="color:${t.color}">${t.name}（${t.motif}）· ${tr.name}</b><br>
          <span style="color:var(--ink-2)">${tr.desc}</span></li>`;
      }).join('')}
    </ul>
    <p style="font-size:11.5px;color:var(--ink-3);margin-top:6px">
      初始金额可在「设置」里逐个调整；四部落默认均为 ${RULES.startMoney}（行动顺序每局随机，不再有先手补偿）。</p>`;

  openModal(`
    <h3>《菜农部落》游戏规则</h3>
    ${legend}
    ${traitList}
    <h4>基本设定</h4>
    <ul class="rulelist">
      <li><b>${RULES.tribes}</b> 个部落轮流行动，每回合 <b>${RULES.diceCount}</b> 个骰子</li>
      <li>初始资金默认 <b>${RULES.startMoney}</b> 肥力币（可在「设置」里逐部落调整）；每人初始 <b>${RULES.freeLandCards}</b> 张免费买地卡</li>
      <li>经过起点 <b>+${RULES.startBonus}</b> 肥力币；累计 <b>${RULES.winMoney}</b> 即获胜</li>
      <li>初始作物：${TRIBES.map(t => `${t.name}→${t.initialCrop}`).join('、')}</li>
    </ul>
    <h4>核心机制</h4>
    <ul class="rulelist">
      <li><b>土地购买</b>：移动到无主土地可按卡面价格购买（各部落另有 1 张免费买地卡）</li>
      <li><b>过路费</b>：走到他人土地，支付该地价的 <b>${RULES.passRate * 100}%</b></li>
      <li><b>种植</b>：肥力决定<b>最多</b>可种片数 —— 低 ${plotsFor('低')} 片 / 中 ${plotsFor('中')} 片 / 中高 ${plotsFor('中高')} 片 / 高 ${plotsFor('高')} 片。
          这是<b>上限</b>不是指标：1~上限之间可自选片数（想留空位、种子不够都能少种）。
          作物在<b>适配土壤</b>上产量更高</li>
      <li><b>收获</b>：净收益 = 产量 − 种子成本。<b>每块地每回合只能种一轮</b>：
          收获后要等下个回合才能再种，避免「种完就收再种」的刷钱循环</li>
      <li><b>气象站</b>：抽一张<b>延时气象卡</b>（±12~25 肥力币）。
          它<b>不会自动结算</b>，而是在你<b>下一次种植</b>时自动发动（一次性，用掉即消失）；
          这一回合不种植，卡就一直留着</li>
      <li><b>土壤改良站</b>：抽改良卡到手牌，<b>抽到即得该卡面值肥力币</b>（一次性到账）。
          <b>持有即增益</b>，不用点使用 —— 每张按<b>面值折算</b>增加收获收益：
          面值 20 对应 <b>+6%</b>，其余 =（面值 ÷ 20）× 6%，合计上限 <b>+48%</b>；
          <b>不种作物就没有增益</b>。点击卡牌 = 主动弃掉</li>
      <li><b>没有种子就不能种</b>：手里没有该作物的种子卡，选种弹窗里它是灰的、打「无种子」章。
          种子钱在<b>买卡时</b>已付，种植时<b>一片消耗 1 张种子卡</b>、不再扣钱</li>
      <li><b>种子集市</b>：购买作物卡（开局每部落已发 2 张基础种子卡，其余都得买）</li>
      <li><b>土壤检测</b>：土地详情里的<b>作物收益表默认整张雾化</b>，看不到任何数字。
          花 <b>${REVEAL_COST}</b> 肥力币做一次检测解除雾化，本块地永久可见</li>
      <li><b>监狱</b>：落在监狱格暂停一回合（路过不坐牢）</li>
    </ul>
  `);
}
$('btn-rules').addEventListener('click', openRules);

/* 胜利横幅 */
function showBanner() {
  hideWaiting();
  const w = G.winner;
  if (!w) {                       // 全员破产：无人获胜
    $('banner-icon').innerHTML = '💀';
    $('banner-title').textContent = '本局无人获胜';
    $('banner-sub').textContent = `历经 ${G.round} 回合，所有部落均已破产出局`;
    $('banner').hidden = false;
    $('btn-roll').disabled = true;
    return;
  }
  const mm = MOTIF_THUMBS.find(x => x.id === w.tid);
  $('banner-icon').innerHTML = mm
    ? `<img src="${svgToDataUri(mm.svg)}" style="width:92px;height:92px;object-fit:contain" alt="">`
    : '🏆';
  $('banner-title').textContent = `${w.name} 获胜！`;
  // 两种获胜途径：达成胜利线 / 其他部落全部破产后成为最后幸存者
  $('banner-sub').textContent = w.money >= RULES.winMoney
    ? `历经 ${G.round} 回合，以 ${w.money} 肥力币达成胜利线 ${RULES.winMoney}`
    : `历经 ${G.round} 回合，其他部落全部破产，成为最后幸存的部落（${w.money} 肥力币）`;
  $('banner').hidden = false;
  $('btn-roll').disabled = true;
}
$('banner-btn').addEventListener('click', () => {
  $('banner').hidden = true;
  newGame();
});

/* =========================================================
   初始化
   ========================================================= */
/**
 * 单机模式开关。
 * 'local' = 本地对战（4 个部落都手动点）
 * 'solo'  = 单机模式（A 部落是真人，B/C/D 由电脑自动走）
 * 存在 localStorage，刷新后保留上次选择。
 */
const MODE_KEY = 'cnvillage.mode.v1';
let MODE = (() => {
  try { return localStorage.getItem(MODE_KEY) === 'solo' ? 'solo' : 'local'; }
  catch (e) { return 'local'; }
})();

function setMode(m) {
  MODE = m;
  try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* 忽略 */ }
  document.querySelectorAll('#mode-seg button').forEach(b => {
    b.classList.toggle('on', b.dataset.mode === m);
  });
}

/* =========================================================
   对局设置：各部落初始金额
   ---------------------------------------------------------
   默认四部落一律 150（RULES.startMoney）。
   早先默认是「150 + 先手补偿 [0,25,45,60]」= 150 / 175 / 195 / 210，
   按**座位号**发 —— 但行动顺序已改成每局随机，座位号不再等于先后手，
   结果座位 3（燕都）每局白拿 +60、座位 0（长安）拿 0，胜率被直接拉开
   （实测 spread 8% → 37%）。次序既已每局随机，先手优势长期已均摊，
   默认就不再加补偿。玩家仍可在「设置」里逐项调整，存 localStorage。
   ========================================================= */
const MONEY_KEY = 'cnvillage.startmoney.v1';
const DEFAULT_MONEY = TRIBES.map(() => RULES.startMoney);

let startMoney = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(MONEY_KEY) || 'null');
    if (Array.isArray(raw) && raw.length === TRIBES.length &&
        raw.every(v => Number.isFinite(Number(v)))) {
      return raw.map(v => Math.min(3000, Math.max(0, Math.round(Number(v)))));
    }
  } catch (e) { /* 忽略 */ }
  return [...DEFAULT_MONEY];
})();

function saveStartMoney() {
  try { localStorage.setItem(MONEY_KEY, JSON.stringify(startMoney)); } catch (e) { /* 忽略 */ }
}

/* ---------------------------------------------------------
   胜利线：达到多少肥力币即获胜（设置弹层里可调，存 localStorage）
   RULES 是 data.js 导出的**可变对象**，engine 判胜时直接读 RULES.winMoney，
   所以这里改一个属性就能全局生效（面板进度条、日志、胜利弹窗都跟着走）。
   默认 260；修改后「保存并重开」生效，与初始金额同一套交互。
   --------------------------------------------------------- */
const WIN_KEY = 'cnvillage.winmoney.v1';
const DEFAULT_WIN = RULES.winMoney;               // 260

function clampWin(v) { return Math.min(100000, Math.max(50, Math.round(v))); }

let winMoney = (() => {
  try {
    const raw = Number(localStorage.getItem(WIN_KEY));
    if (Number.isFinite(raw) && raw > 0) return clampWin(raw);
  } catch (e) { /* 忽略 */ }
  return DEFAULT_WIN;
})();
RULES.winMoney = winMoney;   // 立即对引擎/渲染生效（首次 newGame 在文件末尾调用）

function saveWinMoney() {
  try { localStorage.setItem(WIN_KEY, String(winMoney)); } catch (e) { /* 忽略 */ }
}

/* =========================================================
   背景音乐（BGM）—— 真正的实现已经搬到**独立模块** src/bgm.js
   ---------------------------------------------------------
   背景音乐与游戏逻辑完全解耦：只跟「网页有没有打开」有关，播放/循环/
   持久化都在 src/bgm.js 里，由一个独立的 <script type="module"> 加载。
   这里只保留「设置弹层里的音量入口」，读写一律走 window.BGM。
   素材说明见 src/bgm.js 顶部注释。
   ========================================================= */
const BGM = window.BGM || null;
const bgmPct = () => Math.round((BGM ? BGM.getVolume() : 0) * 100);
function setBgmVolume(v) { if (BGM) BGM.setVolume(v); }

/** 设置弹层：调初始金额 + 背景音乐音量 + 查看四部落特长 */
function openSettings() {
  const rows = TRIBES.map((t, i) => {
    const tr = TRIBE_TRAITS[t.id] || {};
    return `<div class="setrow">
      <div class="sethead">
        <span class="sw" style="background:${t.color}"></span>
        <b>${t.name}</b><span class="setmotif">${t.motif}</span>
        <span class="setmoney">
          <input type="number" min="0" max="3000" step="5"
                 data-seat="${i}" value="${startMoney[i]}"> 肥力币
        </span>
      </div>
      <div class="settrait"><b>${tr.name || ''}</b>${tr.desc ? '：' + tr.desc : ''}</div>
    </div>`;
  }).join('');

  openModal(`
    <h3>对局设置</h3>
    <p style="color:var(--ink-3);font-size:12.5px;margin:-2px 0 10px">
      调整四个部落的初始肥力币，以及达到多少肥力币即获胜。
      行动顺序每局随机，四部落默认金额相同；每个部落自带一条特长，
      点「保存并重开」后生效。背景音乐音量即时生效、自动记住。</p>
    <div id="setlist">${rows}</div>

    <div id="setwin" class="setrow">
      <div class="sethead">
        <span class="sw" style="background:linear-gradient(135deg,#e8c15a,#b8860b)"></span>
        <b>胜利线</b><span class="setmotif">目标肥力币</span>
        <span class="setmoney">
          <input type="number" id="win-money" min="50" max="100000" step="10"
                 value="${winMoney}"> 肥力币
        </span>
      </div>
      <div class="settrait">先攒到该数值的部落获胜（例如 <b>500</b> 肥力币）。数值越大，一局越长。</div>
    </div>

    <div id="setbgm" class="setrow">
      <div class="sethead">
        <span class="sw" style="background:linear-gradient(135deg,#7bb37b,#4a7c59)"></span>
        <b>背景音乐</b><span class="setmotif">循环播放</span>
        <span class="setmoney">
          <input type="range" id="bgm-vol" min="0" max="100" step="1"
                 value="${bgmPct()}" aria-label="背景音乐音量">
          <span id="bgm-vol-txt">${bgmPct()}%</span>
        </span>
      </div>
      <div class="settrait">进游戏后一直循环的国风背景乐。拖动滑块调音量，<b>0% 即静音</b>；设置会记住，下次进游戏沿用。</div>
    </div>

    <div class="setactions">
      <button class="tb" id="set-reset" type="button">恢复默认</button>
      <button class="tb primary" id="set-apply" type="button">保存并重开</button>
    </div>
  `);

  /* 背景音乐音量：即时生效 + 存 localStorage（不用点「保存并重开」） */
  const volEl = $('bgm-vol');
  const volTxt = $('bgm-vol-txt');
  volEl.addEventListener('input', () => {
    const pct = Math.round(Number(volEl.value) || 0);
    setBgmVolume(pct / 100);
    volTxt.textContent = pct + '%';
  });

  $('set-reset').addEventListener('click', () => {
    startMoney = [...DEFAULT_MONEY];
    document.querySelectorAll('#setlist input').forEach((inp, i) => {
      inp.value = startMoney[i];
    });
    winMoney = DEFAULT_WIN;
    $('win-money').value = winMoney;
  });

  $('set-apply').addEventListener('click', () => {
    document.querySelectorAll('#setlist input').forEach((inp, i) => {
      const v = Math.round(Number(inp.value));
      startMoney[i] = Number.isFinite(v) ? Math.min(3000, Math.max(0, v)) : DEFAULT_MONEY[i];
    });
    saveStartMoney();
    const wv = Math.round(Number($('win-money').value));
    winMoney = Number.isFinite(wv) && wv > 0 ? clampWin(wv) : DEFAULT_WIN;
    RULES.winMoney = winMoney;   // engine 判胜 / 渲染都读它
    saveWinMoney();
    closeModal();
    newGame();
  });
}

$('btn-settings').addEventListener('click', openSettings);

/* 电脑节奏：3 秒 / 快速 0.6 秒 */
/* 图鉴：全量卡牌参考书 */
$('btn-handbook').addEventListener('click', () => openHandbook());

/* 农耕志入口（图例下方）：我的农事 / 图鉴收集 / 成就称号 / 探索足迹。
   全部奖励只落本地存档，不写进 G，不影响对局。 */
$('codex-entry').addEventListener('click', () => openCodex({
  openModal,
  openHandbook: () => openHandbook()
}));

/* 点卡片上的 🔍 百科 → 农耕志记一笔「探索足迹」。
   用捕获阶段：游戏里不少卡片点击会 stopPropagation，冒泡阶段会被吃掉。 */
document.addEventListener('click', (e) => {
  const a = e.target && e.target.closest && e.target.closest('.wikibadge,.wikibtn');
  if (!a) return;
  codexTrace('🔍', a.dataset.wk || a.textContent.trim());
}, true);

/* 电脑节奏：3 秒 / 快速 0.6 秒 */
$('btn-fast').addEventListener('click', () => setFastMode(!FAST_MODE));
setFastMode(FAST_MODE);

/* 图例上方的三类手牌入口 */
$('hub-seed').addEventListener('click', () => openCardHub('seed'));
$('hub-weather').addEventListener('click', () => openCardHub('weather'));
$('hub-improve').addEventListener('click', () => openCardHub('improve'));

/* 新开一局。
   gate：是否先弹「本局行动顺序」窗、点确认才走第一回合。
   省略（=false）时行为与从前完全一致，测试直接调 newGame() 不受影响。 */
function newGame(gate) {
  /* 开新局 = 作废所有在飞的旧回合协程（真人 doRoll / 电脑 runAiTurn）。
     纪元 +1 后，旧协程在每个 await 之后的 `ep !== TURN_EPOCH` 判断处自我终止，
     不再带着上一局的玩家对象对新一局掷骰/买地/换手。见 TURN_EPOCH 注释。 */
  TURN_EPOCH++;
  G = initGame(RULES.tribes, { startMoney });
  busy = false;
  hideWaiting();
  $('banner').hidden = true;
  $('log').innerHTML = '';
  $('dice').innerHTML = '';
  hideActions();
  buildBoard2D();     // 平面图板：格子 + 棋子
  render();
  renderLog();
  pushLog('sys', `新游戏开始 —— 初始资金 ${G.players.map(p => `${p.tid} ${p.money}`).join(' / ')}，目标 ${RULES.winMoney}`);
  pushLog('sys', `部落特长：${G.players.map(p => `${p.tid}·${p.trait ? p.trait.name : '—'}`).join('　')}`);
  // 开局基础种子卡：抽 3 张候选，取其中 2 张入库；其余种子只能靠集市买
  G.players.forEach(p => {
    const drawn = (p.seedDrawn || []).map(id => cropById(id).name).join('、');
    const kept = Object.keys(p.seeds).map(id => cropById(id).name).join('、');
    pushLog('seed', `${p.name} 抽到候选种子卡 [${drawn}]，其中 ${kept} 作为基础种子卡入库`);
  });
  if (MODE === 'solo') {
    /* 开局行动顺序**完全按本局抽签结果 G.order**来：顺序第一位是谁，就谁先行动 ——
       第一位是电脑就电脑先走，是真人就真人先走。
       早先这里强行把 turn 拨到真人所在的座位，等于每局都玩家先手，
       与顶栏公示的「本回合顺序」自相矛盾（用户实测反馈）。
       ⚠️ turn 是 order 里的下标，不是座位号：G.turn = 0 即 G.order[0] 先行动。 */
    pushLog('sys', `单机模式：你是 ${G.players[HUMAN_SEAT].name}，其余 ${RULES.tribes - 1} 个部落由电脑控制`);
    pushLog('sys', `本局行动顺序：${G.order.map(s => G.players[s].name).join(' → ')}（${G.players[G.order[0]].name} 先手）`);
  }
  // 交棒：真人就等点骰子，电脑直接开走
  $('btn-roll').disabled = false;
  /* gate=true（玩家从开篇/新游戏按钮进来的）先弹顺序窗，
     点「知道了，开始」才真的走第一回合 —— 否则 AI 可能在你还没看完
     顺序时就已经掷完骰子了。
     ⚠️ 省略参数时（window.__game.newGame()，测试走这条）gate 为假，
        行为与从前完全一致：立刻 nextTurn，不会被弹窗挡住。 */
  if (gate) { setPendingStart(nextTurn); showOrderGate(true); }
  else nextTurn();
}

/* 顺序窗「知道了，开始」里要跑的函数（通常是 nextTurn）。
   手动点顶栏「🔀 行动顺序」查看时它是 null —— 只看，不启动。 */
let PENDING_START = null;
function setPendingStart(fn) { PENDING_START = fn || null; }

$('btn-roll').addEventListener('click', doRoll);

/* 新游戏：单机模式下先让玩家挑部落（本地对战直接开）。
   两边都走 gate=true —— 重开一局就该重新公示一次顺序，
   否则新顺序要等玩家自己点顶栏「🔀 行动顺序」才知道。 */
$('btn-new').addEventListener('click', () => {
  if (MODE === 'solo') { openChooseTribe(); return; }
  if (confirm('确定重新开始？当前进度将丢失。')) newGame(true);
});

/* 模式切换：点了立刻换边重开一局，免得出现「人机混战」的半截状态。
   切到单机模式时先弹部落选择，切回本地对战直接重开。 */
document.querySelectorAll('#mode-seg button').forEach(b => {
  b.addEventListener('click', () => {
    if (b.dataset.mode === MODE) return;
    if (!confirm('切换模式会重新开始一局，确定吗？')) return;
    const to = b.dataset.mode;
    setMode(to);
    if (to === 'solo') { openChooseTribe(); return; }
    newGame(true);
  });
});

/* =========================================================
   简约版（放大游玩）
   ---------------------------------------------------------
   只做两件事：切 body 上的 .simple 类 + 重调 layoutBoard()。
   **不碰任何游戏逻辑** —— 渲染函数、事件绑定、状态 G 全部原样，
   所以切来切去不会影响对局，随时可切。

   状态存 localStorage（刷新后仍是简约版）。窄屏（≤900px）自动失效：
   那时 CSS 强制把收起的面板放回来，手机上不会因此没法玩。
   ========================================================= */
const SIMPLE_KEY = 'cnvillage.simple.v1';
let SIMPLE_MODE = (() => {
  try { return localStorage.getItem(SIMPLE_KEY) === '1'; } catch (e) { return false; }
})();
function setSimpleMode(on, repaint = true) {
  SIMPLE_MODE = !!on;
  document.body.classList.toggle('simple', SIMPLE_MODE);
  const btn = $('btn-simple');
  if (btn) {
    btn.classList.toggle('on', SIMPLE_MODE);
    btn.querySelector('.tb-t').textContent = SIMPLE_MODE ? '完整版' : '简约版';
  }
  try { localStorage.setItem(SIMPLE_KEY, SIMPLE_MODE ? '1' : '0'); } catch (e) { /* 忽略 */ }
  /* 棋盘尺寸按可用空间算的，布局一变必须重算，否则会留白或溢出 */
  layoutBoard();
  /* 重绘只在「已经有对局」时做 —— 启动阶段 newGame() 还没跑，G 还是 null，
     这时调 render() 会在 renderPlayers 里炸 players[0].xxx（曾整页白屏）。 */
  if (repaint && G) render();
}
$('btn-simple').addEventListener('click', () => setSimpleMode(!SIMPLE_MODE));
/* 支持用地址栏 #simple 直接进简约版（投屏 / 分享场景） */
if (location.hash.replace('#', '') === 'simple') SIMPLE_MODE = true;

/* 启动 */
setMode(MODE);
/* 先只切 body 类（不重绘）：让下面的 newGame() 首帧就按简约版布局生成，
   否则会先按完整版建一次图板、再切类，多余一次抖动。 */
setSimpleMode(SIMPLE_MODE, false);
renderLegend();     // 图例只渲染一次（内容不随局变）
newGame();          // 启动这一局**不弹顺序窗**（此刻开篇盖着，弹了也看不见）

/* ---------- 开篇「进入田亩」→ 重开一局并弹顺序窗 ----------
   intro.js 与本模块互不 import（intro 是纯入口层），靠这个自定义事件通信。
   为什么重开一局：进入开篇时本模块已经跑过一次 newGame()，那局的抽签顺序
   玩家根本没机会看到（开篇是整页覆盖层）。所以玩家一点「进入田亩」，
   就重抽一次顺序、并把顺序窗摆在他面前，点「知道了，开始」才走第一回合。
   ?intro=0 跳过开篇时事件不触发，一切照旧（测试与「连续开局」走这条路）。 */
window.addEventListener('cnv:entergame', () => newGame(true));
initSplitters();
layoutBoard();
$('board').addEventListener('load', layoutBoard);
if ($('board').complete) layoutBoard();
window.addEventListener('resize', layoutBoard);
/* 跨过 1000px 断点时右侧竖列要/不需要让位，必须重算一次 */
if (WIDE.addEventListener) WIDE.addEventListener('change', layoutBoard);
else if (WIDE.addListener) WIDE.addListener(layoutBoard);
/* 跨过 620px 断点时「底部留空间」要开/关，同样重算 */
if (NARROW.addEventListener) NARROW.addEventListener('change', layoutBoard);
else if (NARROW.addListener) NARROW.addListener(layoutBoard);
/* 横竖屏切换 / 旋屏：横屏挡要开/关竖列让位，同样重算 */
if (LAND.addEventListener) LAND.addEventListener('change', layoutBoard);
else if (LAND.addListener) LAND.addListener(layoutBoard);
/* 窄屏下竖列高度会随「我的土地」增减而变（底排让开的高度得跟着变）。
   用 ResizeObserver 盯住它 —— 只在尺寸真变了才重排，不必每次 render 都算。
   竖列是绝对定位、尺寸由内容决定，改 stage 的 padding-bottom 不会反过来动它，无回环。 */
const legendColEl = document.querySelector('.legend-col');
if (legendColEl && window.ResizeObserver) {
  new ResizeObserver(() => layoutBoard()).observe(legendColEl);
}
/* 载入遮罩淡出后从 DOM 移除：它本来就是 position:fixed 的整页覆盖层，
   只留 .hide（opacity:0）会继续拦截点击。 */
const loadingEl = $('loading');
loadingEl.classList.add('hide');
setTimeout(() => loadingEl.remove(), 400);

/* 调试用：暴露到 window */
window.__game = {
  get state() { return G; }, newGame, RULES, TRACK,
  get mode() { return MODE; }, setMode, isAI,
  get seat() { return HUMAN_SEAT; }, setSeat,
  get busy() { return busy; },
  debug: {
    openPlantModal, openModal, closeModal, render, syncBoard2D, nextTurn,
    openChooseTribe, LOG_KIND, LOG_KINDS,
    /* 顺序窗：showOrderGate(是否作为开局确认)/ hideOrderGate */
    showOrderGate, hideOrderGate,
    get pendingStart() { return !!PENDING_START; },
    openCardHub, openHandbook,
    runAiTurn, doRoll, doExtraRoll, landActions, postMoveActions, showActions, finishTurn,
    openMarket, openSettings, openRules,
    /* 背景音乐（测试用）：全部转发给独立模块 window.BGM */
    setBgmVolume,
    get bgmVolume() { return BGM ? BGM.getVolume() : 0; },
    get bgmEl() { return BGM ? BGM.el : null; },
    /* 胜利线（测试用）：RULES.winMoney 同步反映 */
    get winMoney() { return winMoney; },
    setWinMoney(v) { winMoney = clampWin(v); RULES.winMoney = winMoney; saveWinMoney(); render(); },
    /* 面板主人 / 当前行动者所在座位 —— 测试里取「面板展示给谁」必须用它，
       不能拿 G.turn（那是行动次序，不是座位）。 */
    viewSeat, curSeat,
    /* 把回合交给某个座位：turn 是 order 下标，得先定位 */
    setActor(seat) { G.turn = G.order.indexOf(seat); render(); },
    /* 回合纪元：每 newGame() +1。测试用来验证「重开即作废旧协程」。 */
    get turnEpoch() { return TURN_EPOCH; },
    /* 快速模式开关（测试用）：单机模式开局可能电脑先手，
       电脑一步停 3 秒会让「等真人回合」的用例空等几十秒。 */
    setFastMode(on) { setFastMode(!!on); return FAST_MODE; },
    giveLand(pi, idx) {
      const p = G.players[pi];
      const cell = cellAt(idx);
      p.lands[idx] = { soilId: cell.soilId, crops: [] };
      G.landOwners[idx] = p.tid;
      render();
    }
  }
};