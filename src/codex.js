/* ============================================================
   农耕志 · 我的农事 / 图鉴收集 / 成就称号 / 探索足迹
   ------------------------------------------------------------
   ⚠️ 硬约束（课程设计）：本模块是**纯荣誉层**，只读写本地键
      localStorage['cnvillage.codex.v1']，**绝不写进对局状态 G**。
      因此金币、土地、种子、过路费、破产、AI 决策与胜负判定
      全部不受影响，现有的引擎 / SPEC / UI 测试也不需要改。

   与游戏的关系只有「单向读取」：落格、买地、抽到气象卡、点 🔍 时
   由 main.js 调 mark() / scan() / trace() 记一笔，反向不写入游戏。
   ============================================================ */
import { LANDS, CROPS, WEATHERS, TRACK } from './data.js';

export const CODEX_KEY = 'cnvillage.codex.v1';

/* ---------- 个性化问答：没有标准答案，写下即入册 ---------- */
export const QS = [
  { q: '你最喜欢的一种植物是什么？为什么喜欢它？',
    note: '想写什么写什么，<b>没有标准答案</b>', badge: '心之所向', char: '心' },
  { q: '你家里或教室里养了什么植物？它现在长什么样？',
    note: '没养过也可以写「想养什么」', badge: '窗台园丁', char: '园' },
  { q: '你觉得该怎么种它才合适？（土、水、光）',
    note: '按你的经验写，写错了也算数', badge: '种植心得', char: '种' },
  { q: '你家乡最常种什么？那里的土是什么颜色？',
    note: '写完会在图鉴里为你亮起一块土', badge: '乡野记忆', char: '乡' },
  { q: '如果可以在脚下这块地种一样东西，你选什么？',
    note: '和游戏里的土地、作物对照着写', badge: '开垦者之愿', char: '垦' },
  { q: '你知道有哪些「不科学」的种植说法？',
    note: '对应游戏里那 4 个科学性 BUG，随便猜', badge: '小小科学家', char: '科' }
];

/* ---------- 五个成就：全部由计数自动判定 ----------
   of  = 取自 counts() 的哪个计数器；need = 达标线。 */
export const ACHV = [
  { id: 'land11',  ch: '土', n: '走遍十一土', d: '解锁全部 11 种土壤图鉴',      of: 'land',    need: 11, 得: '土行者',     rw: '纹样 · 五色土' },
  { id: 'crop6',   ch: '谷', n: '六谷丰登',   d: '解锁 6 种作物图鉴',           of: 'crop',    need: 6,  得: '农学家',     rw: '称号 · 农学家' },
  { id: 'farm4',   ch: '拓', n: '四方开垦',   d: '在 4 个部落各买到 1 块地',     of: 'farm',    need: 4,  得: '拓荒人',     rw: '头像框 · 拓荒' },
  { id: 'trace10', ch: '博', n: '好奇者',     d: '点开卡片上的 🔍 百科 10 次',   of: 'trace',   need: 10, 得: '博物之士',   rw: '称号 · 博物之士' },
  { id: 'quiz6',   ch: '科', n: '学以致用',   d: '在「我的农事」写下 6 个答案',   of: 'quiz',    need: 6,  得: '小小科学家', rw: '纹样 · 麦穗冠' }
];

const TABS = [
  { id: 'p1', n: '我的农事 · 个性化' },
  { id: 'p2', n: '图鉴收集' },
  { id: 'p3', n: '成就称号' },
  { id: 'p4', n: '探索足迹' }
];

/* 图鉴格子上的小图标（纯装饰） */
const SOIL_IC = { huangmiantu: '🌾', heilitu: '🌱', jiangnan: '💧', zise: '🍇', xibei: '🏜',
  nanfang: '🍊', shandong: '🥜', huangmo: '🪨', yungui: '🍄', hainan: '🥥', qingzang: '🏔' };
const CROP_IC = { malingshu: '🥔', huasheng: '🥜', xigua: '🍉', hongshu: '🍠', xiaomai: '🌾',
  fanqie: '🍅', yumi: '🌽', youcai: '🌼', shuidao: '🌾', chashu: '🍵' };
const WEA_IC = { w1: '🌦', w2: '🌧', w3: '🌪', w4: '❄️', w5: '☀️', w6: '☔' };

/* =========================================================
   存档
   ========================================================= */
const blank = () => ({
  lands: {}, crops: {}, weathers: {},   // 图鉴解锁
  farms: {},                           // 买到过地的部落（tid）
  quiz: {},                            // 我的农事：{ 题号: 答案 }
  traceN: 0, trace: [],                // 探索次数 + 最近记录
  achv: {}                             // 已解锁成就快照（id → true）
});

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(CODEX_KEY));
    if (!raw || typeof raw !== 'object') return blank();
    const b = blank();
    return {
      lands: raw.lands || b.lands,
      crops: raw.crops || b.crops,
      weathers: raw.weathers || b.weathers,
      farms: raw.farms || b.farms,
      quiz: raw.quiz || b.quiz,
      traceN: Number(raw.traceN) || 0,
      trace: Array.isArray(raw.trace) ? raw.trace : b.trace,
      achv: raw.achv || b.achv
    };
  } catch (e) { return blank(); }
}

let S = load();
function save() { try { localStorage.setItem(CODEX_KEY, JSON.stringify(S)); } catch (e) { /* 隐私模式忽略 */ } }

/* =========================================================
   计数与完成度
   ========================================================= */
export function counts() {
  return {
    land: Object.keys(S.lands).length,
    crop: Object.keys(S.crops).length,
    weather: Object.keys(S.weathers).length,
    farm: Object.keys(S.farms).length,
    trace: S.traceN || 0,
    quiz: Object.keys(S.quiz).length
  };
}

const TOTAL = LANDS.length + CROPS.length + WEATHERS.length + ACHV.length + QS.length;

export function progress() {
  const c = counts();
  const codexN = c.land + c.crop + c.weather;
  const achvN = ACHV.filter(a => c[a.of] >= a.need).length;
  const done = codexN + achvN + c.quiz;
  return { c, codexN, achvN, quizN: c.quiz, done, total: TOTAL, pct: Math.round(done / TOTAL * 100) };
}

/* 达标即写入快照；返回「本次新解锁」的成就定义（供提示） */
function sync() {
  const c = counts();
  const fresh = ACHV.filter(a => c[a.of] >= a.need && !S.achv[a.id]);
  fresh.forEach(a => { S.achv[a.id] = true; });
  return fresh;
}

const T_KIND = { land: '土壤图鉴', crop: '作物图鉴', weather: '气象图鉴', farm: '开垦' };

/**
 * 记一笔图鉴解锁。
 * @param {'land'|'crop'|'weather'|'farm'} kind
 * @param {string} key 条目的 id（farm 用部落 tid）
 * @param {string} [name] 用于提示文案
 * @returns {boolean} 是不是第一次解锁
 */
export function mark(kind, key, name) {
  const map = { land: 'lands', crop: 'crops', weather: 'weathers', farm: 'farms' }[kind];
  if (!map || !key || S[map][key]) return false;
  S[map][key] = true;
  const fresh = sync();
  save();
  if (fresh.length) toast('🏅 解锁成就「' + fresh.map(a => a.得).join('、') + '」', 'gold');
  else toast('解锁' + T_KIND[kind] + ' · ' + (name || key));
  return true;
}

/** 记一次「探索足迹」（点 🔍 百科时调用） */
export function trace(icon, text) {
  const d = new Date();
  const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  S.traceN = (S.traceN || 0) + 1;
  S.trace.unshift({ ic: icon || '🔍', txt: text || '', hm });
  if (S.trace.length > 40) S.trace.length = 40;
  const fresh = sync();
  save();
  if (fresh.length) toast('🏅 解锁成就「' + fresh.map(a => a.得).join('、') + '」', 'gold');
}

/** 保存「我的农事」的一道答案 */
export function answer(i, text) {
  const v = String(text == null ? '' : text).trim();
  if (!v) return { ok: false, msg: '写一句话就能入册（没有标准答案）' };
  const isNew = !S.quiz[i];
  S.quiz[i] = v;
  const fresh = sync();
  save();
  if (fresh.length) toast('🏅 解锁成就「' + fresh.map(a => a.得).join('、') + '」', 'gold');
  else toast(isNew ? '已入册 · 获得朱砂章「' + QS[i].badge + '」' : '已更新');
  return { ok: true, isNew };
}

/**
 * 单向扫描对局状态 G，把「已站过 / 已买下」的土壤、手上的气象卡静默入册。
 * 静默 = 不弹提示（render() 每次都会调，弹提示会刷屏）；
 * 完成度百分比会随之上升，用户点开农耕志就能看到。
 */
export function scan(G) {
  if (!G || !G.players) return;
  let dirty = false;
  G.players.forEach(p => {
    if (!p) return;
    const cell = TRACK[p.pos];
    if (cell && cell.kind === 'land' && cell.soilId && !S.lands[cell.soilId]) { S.lands[cell.soilId] = true; dirty = true; }
    Object.values(p.lands || {}).forEach(l => {
      const id = l && l.soilId;
      if (id && !S.lands[id]) { S.lands[id] = true; dirty = true; }
    });
    (p.weatherCards || []).forEach(w => {
      const id = typeof w === 'string' ? w : (w && w.id);
      if (id && !S.weathers[id]) { S.weathers[id] = true; dirty = true; }
    });
  });
  if (dirty) { sync(); save(); }
}

/* =========================================================
   入口按钮上的百分比
   ========================================================= */
export function updateEntry() {
  const el = document.getElementById('codex-pct');
  if (!el) return;
  const p = progress();
  el.textContent = p.pct + '%';
  el.classList.toggle('full', p.pct >= 100);
}

/* =========================================================
   提示条
   ========================================================= */
let toastEl = null, toastT = 0;
export function toast(msg, cls) {
  if (!toastEl || !toastEl.isConnected) {
    toastEl = document.createElement('div');
    toastEl.className = 'cx-toast';
    document.body.appendChild(toastEl);
  }
  toastEl.className = 'cx-toast' + (cls ? ' ' + cls : '');
  toastEl.textContent = msg;
  void toastEl.offsetWidth;          // 强制重排，让动画能从 0 重放
  toastEl.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('on'), 2000);
}

/* =========================================================
   弹层
   ========================================================= */
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const barPct = (n, of) => Math.min(100, Math.round(n / (of || 1) * 100));

let curTab = 'p1';

/** 打开农耕志弹层。ctx 需提供 openModal(html) 与（可选）openHandbook()。 */
export function openCodex(ctx) {
  ctx.openModal(page());
  wire(ctx);
}

function page() {
  return `<h3>🏮 农耕志 · 荣誉册</h3>
    ${idcard()}
    <nav class="cx-tabs">${TABS.map(t =>
      `<button class="cx-tab${t.id === curTab ? ' on' : ''}" data-cx="${t.id}">${t.n}</button>`).join('')}</nav>
    <section class="cx-panel">${pane()}</section>
    <div class="cx-note">
      <b>只记荣耀，不碰胜负：</b>农耕志的全部奖励只存放在本地键 <code>cnvillage.codex.v1</code>，
      <b>绝不写进对局状态</b> —— 金币、土地、种子、过路费、破产与 AI 决策完全不受影响，随时可清空重来。
    </div>`;
}

function idcard() {
  const p = progress();
  const c = p.c;
  /* 称号取「已达标的最后一个成就」——与成就页显示同一口径（不看 S.achv 快照，
     那只是用来给 toast 去重的）。 */
  const sat = ACHV.filter(a => c[a.of] >= a.need);
  const title = sat.length ? sat[sat.length - 1].得 : '初入农门';
  return `<div class="cx-idcard">
    <div class="cx-avatar">农</div>
    <div class="cx-who">
      <div class="nm">我的农耕志</div>
      <div class="tt">当前称号：<b>${esc(title)}</b></div>
      <div class="cx-stats">
        <span class="cx-chip gold">成就章 ×${p.achvN}</span>
        <span class="cx-chip">探索 ×${c.trace}</span>
        <span class="cx-chip red">图鉴 ${p.codexN}/${LANDS.length + CROPS.length + WEATHERS.length}</span>
      </div>
    </div>
    <div class="cx-ring" style="--p:${p.pct}"><span>${p.pct}%<i>完成度</i></span></div>
  </div>`;
}

function pane() {
  const p = progress();
  const c = p.c;
  if (curTab === 'p2') return paneCodex(p, c);
  if (curTab === 'p3') return paneAchv(p, c);
  if (curTab === 'p4') return paneTrace(c);
  return paneQ();
}

function paneQ() {
  return `<div class="cx-h">我的农事 <em>没有标准答案 —— 写下就算入册，立刻得章</em></div>
    <div class="cx-qgrid">${QS.map((it, i) => {
      const done = !!S.quiz[i];
      return `<div class="cx-q${done ? ' done' : ''}" data-i="${i}">
        <div class="cx-qno">${i + 1}</div>
        <div class="cx-seal">${it.char}<br>已入册</div>
        <div class="cx-qt">${esc(it.q)}</div>
        <div class="cx-qn">${it.note}</div>
        <textarea class="cx-ta" placeholder="写下你的答案…（写多写少都可以）">${esc(S.quiz[i] || '')}</textarea>
        <div class="cx-qrow">
          <button class="cx-btn primary" data-save="${i}">${done ? '更新记录' : '记录并得章'}</button>
          <span class="cx-rw">奖励：朱砂章 <b>「${it.badge}」</b></span>
        </div>
      </div>`;
    }).join('')}</div>`;
}

function paneCodex(p, c) {
  const cxCard = (gotEnough, name, desc, ic, tip) => gotEnough
    ? `<div class="cx-card"><div class="nm">${esc(name)}</div><div class="sn">${esc(desc || '')}</div><div class="ic">${ic}</div></div>`
    : `<div class="cx-card lk"><div class="nm">？？？</div><div class="sn">${esc(tip)}</div><div class="lk-ic">🔒</div></div>`;
  return `<div class="cx-h">图鉴收集 <em>落格 / 买地 / 抽到气象卡 自动解锁</em></div>
    <div class="cx-line"><span class="lb">土壤</span><div class="cx-bar"><i style="width:${barPct(c.land, LANDS.length)}%"></i></div><span class="vv">${c.land} / ${LANDS.length}</span></div>
    <div class="cx-line"><span class="lb">作物</span><div class="cx-bar"><i style="width:${barPct(c.crop, CROPS.length)}%"></i></div><span class="vv">${c.crop} / ${CROPS.length}</span></div>
    <div class="cx-line"><span class="lb">气象</span><div class="cx-bar"><i style="width:${barPct(c.weather, WEATHERS.length)}%"></i></div><span class="vv">${c.weather} / ${WEATHERS.length}</span></div>

    <div class="cx-h mt">土壤 · 中国土区 <em>已解锁 ${c.land}</em></div>
    <div class="cx-grid">${LANDS.map(l => cxCard(!!S.lands[l.id], l.name, l.knowledge || l.region, SOIL_IC[l.id] || '🌱', '落格到这种土上即解锁')).join('')}</div>

    <div class="cx-h mt">作物 · 生物学特性 <em>已解锁 ${c.crop}</em></div>
    <div class="cx-grid">${CROPS.map(k => cxCard(!!S.crops[k.id], k.name, k.note, CROP_IC[k.id] || '🌾', '买到该作物的种子卡即解锁')).join('')}</div>

    <div class="cx-h mt">气象 · 气候与灾害 <em>已解锁 ${c.weather}</em></div>
    <div class="cx-grid">${WEATHERS.map(w => cxCard(!!S.weathers[w.id], w.name, w.desc, WEA_IC[w.id] || '🌦', '在气象站抽到即解锁')).join('')}</div>

    <div class="cx-h mt">全量参考书 <em>想查更细的卡面与数值？</em></div>
    <button class="cx-btn cx-openhb">📖 打开完整图鉴 · 参考书</button>`;
}

function paneAchv(p, c) {
  return `<div class="cx-h">成就称号 <em>达成即解锁称号与纹样，随时可佩戴</em></div>
    ${ACHV.map(a => {
      const got = c[a.of] >= a.need;
      const cur = Math.min(c[a.of], a.need);
      return `<div class="cx-ach${got ? ' got' : ''}">
        <div class="cx-stamp">${a.ch}</div>
        <div class="mid">
          <div class="hh">${a.n}</div>
          <div class="dd">${a.d}</div>
          <div class="cx-line"><div class="cx-bar"><i style="width:${barPct(cur, a.need)}%"></i></div><span class="vv">${cur} / ${a.need}</span></div>
        </div>
        <div class="rw">${got ? '<b>已解锁</b>' : '<b>未解锁</b>'}${a.rw}</div>
      </div>`;
    }).join('')}`;
}

function paneTrace(c) {
  return `<div class="cx-h">探索足迹 <em>每点一次卡片上的 🔍 百科，就记一笔</em></div>
    <div class="cx-line"><span class="lb">累计</span><div class="cx-bar"><i style="width:${barPct(c.trace, 10)}%"></i></div><span class="vv">${c.trace} 次</span></div>
    ${S.trace.length
      ? `<div class="cx-trace">${S.trace.slice(0, 20).map(t =>
          `<div class="cx-tr"><span class="k">${esc(t.ic)}</span><span>${esc(t.txt)}</span><time>${esc(t.hm)}</time></div>`).join('')}</div>`
      : `<div class="cx-empty">还没有探索记录 —— 点开任意卡片上的 🔍 就开始记录</div>`}`;
}

/* 重绘后重新绑定（弹层内容整体被 openModal 覆盖，旧引用会脱离 DOM） */
function wire(ctx) {
  const body = document.getElementById('modal-body');
  if (!body) return;

  body.querySelectorAll('.cx-tab').forEach(b => {
    b.addEventListener('click', () => {
      curTab = b.dataset.cx;
      ctx.openModal(page());
      wire(ctx);
    });
  });

  body.querySelectorAll('button[data-save]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.save);
      const ta = btn.parentElement.querySelector('.cx-ta');
      const r = answer(i, ta && ta.value);
      if (!r.ok) { toast(r.msg); ta && ta.focus(); return; }
      ctx.openModal(page());
      wire(ctx);
      updateEntry();
    });
  });

  const hb = body.querySelector('.cx-openhb');
  if (hb) hb.addEventListener('click', () => { ctx.openHandbook && ctx.openHandbook(); });
}