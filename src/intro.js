/* =========================================================
   intro.js —— 开篇 + 玩法介绍引导层
   -------------------------------------------------------------
   职责：进站先展示开篇（匾额/ 宣传语 / 模式 / 部落选择），
   可切到「玩法介绍」页，点「进入田亩」才关闭引导层露出游戏本体。

   ⚠ 关键约束（改之前务必读）：
   1. **绝不碰对局状态 G，也不 import engine.js**。它是纯入口层。
   2. 模式 / 座位写**同一份 localStorage key**（cnvillage.mode.v1 /
      cnvillage.seat.v1），由 main.js 在启动时读取 —— 不重复实现开局逻辑。
   3. 只切 `#intro` 的 hidden 类，**不隐藏 body**：main.js 一进来就会跑
      newGame() 并按stage 尺寸算棋盘，如果引导层改成 display:none 让
      body 重新参与布局，棋盘会在隐藏瞬间算错一次尺寸。
   4. **每次进站都先过开篇**（2026-10-15 起）。原先靠 localStorage[introseen]
      记「看过」只弹一次，实测导致玩家第一次点掉后就再也回不到开篇，
      表现为「一打开直奔主体，home 没用」。现在默认永远显示，
      只有地址栏显式 `?intro=0` 才跳过 —— 测试与「连续开局」用它。
   5. **showIntro 是 const，只在 boot() 里读一次**。任何函数（含 openIntro）
      都不许再赋值给它 —— 一赋值就抛 TypeError，函数当场中断，
      症状是「按钮点了完全没反应」而不是报错，很难查。
      要改「要不要显示」，只能改URL query。
   ========================================================= */

import { TRIBES } from './motifs.js';
import { TRIBE_TRAITS } from './data.js';

const $ = (id) => document.getElementById(id);

/* 与 main.js 完全一致的 key —— 改一处必须改两处 */
const MODE_KEY = 'cnvillage.mode.v1';
const SEAT_KEY = 'cnvillage.seat.v1';
const SEEN_KEY = 'cnvillage.introseen.v1';

/* ---------- 当前选择（读写 localStorage） ---------- */
let MODE = (() => {
  try { return localStorage.getItem(MODE_KEY) === 'solo' ? 'solo' : 'local'; }
  catch (e) { return 'local'; }
})();
let SEAT = (() => {
  try {
    const v = Number(localStorage.getItem(SEAT_KEY));
    return Number.isInteger(v) && v >= 0 && v < TRIBES.length ? v : 0;
  } catch (e) { return 0; }
})();

function saveMode(m) {
  MODE = m;
  try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* 隐私模式忽略 */ }
}
function saveSeat(i) {
  SEAT = i;
  try { localStorage.setItem(SEAT_KEY, String(i)); } catch (e) { /* 忽略 */ }
}

/* ---------- 是否要显示引导层 ----------
   ⚠ 2026-10-15 改：**默认永远显示开篇，不再记忆「看过」。
   之前用 localStorage[introseen] 只弹一次，结果是玩家第一次点掉之后就再也
   回不到开篇（而「顶栏 🏮 开篇」按钮正好又被引导层之外的布局挡住时，
   体验就是「一打开直奔主体，home 好像没用」）。
   现在只认地址栏里的显式意图：
     ?intro=0  → 跳过开篇（连续开局 / 自动化测试，ui.test.html 就靠它）
     #doc      → 直接落到玩法介绍页
   其它情况一律先过开篇。SEEN_KEY 保留写入（别处可能读），但不再用于判断。 */
const Q = new URLSearchParams(location.search);
const showIntro = Q.get('intro') !== '0';

/* ---------- 四部落卡片（纯展示，不可选） ----------
   ⚠ 2026-10-15 起改为**只展示**：封面不再承担「挑部落」的职责。
   原来点卡片会写 localStorage[seat] 并高亮，现在整块退化成介绍图 ——
   玩家在开篇只需要知道「有哪四个部落、各有什么特长」，
   选哪个部落改由**开局顺序弹窗**承担（main.js 的 showOrderGate）。
   所以这里不再绑任何 click，也不再渲染 .pickslot 按钮位。 */
function renderPick() {
  const grid = $('intro-pickgrid');
  if (!grid) return;
  grid.innerHTML = TRIBES.map((t) => {
    const tr = TRIBE_TRAITS[t.id] || {};
    return `<figure class="pickcard" style="--tc:${t.color}">
      <div class="pickpic" style="background-image:url('assets/ui/motif_${t.id}.png')"></div>
      <figcaption>
        <b>${t.name}</b><span class="pmotif">${t.motif}</span>
        <span class="picktrait">${tr.name || ''}｜${tr.short || ''}</span>
        <span class="pickdesc">${tr.desc || ''}</span>
      </figcaption>
    </figure>`;
  }).join('');
}

/* ---------- 模式按钮 ---------- */
function syncModes() {
  document.querySelectorAll('#intro-modes button').forEach(b => {
    b.classList.toggle('on', b.dataset.mode === MODE);
  });
  syncTip();
}
function syncTip() {
  const tip = $('intro-pick-tip');
  if (!tip) return;
  /* 封面已无模式切换按钮（2026-10-18，入口统一到顶栏 #mode-seg），
     所以这句不再跟着模式变 —— 讲清楚「四个部落各有什么差别」就够。 */
  tip.textContent = '四个部落的特长差别很大 —— 起始位置、盈利能力、行动节奏各不相同。'
    + '单机模式可在顶栏切换，你操控其中一个部落。';
}

/* ---------- 游戏简介卷轴 ----------
   点「📜 游戏简介」展开，点✕ / 点遮罩 / Esc 收起。
   收起走 CSS 动画（.closing 类 + .34s），动画结束才真正 hidden ——
   直接 hidden 就没有「卷回去」的过程。 */
const ABOUT_CLOSE_MS = 340;
let aboutTimer = null;
function openAbout() {
  const s = $('about-scroll');
  if (!s) return;
  clearTimeout(aboutTimer);
  /* 重放动画的关键：先移除 closing / 强制回流后再加 opening，
     否则连续点两次不会重新播放（class 没变化 → 动画不重启）。 */
  s.classList.remove('closing');
  s.hidden = false;
  void s.offsetWidth;              // 强制回流，让 opening 重新触发
  s.classList.add('opening');
  const x = $('about-close');
  if (x) x.focus();
}
function closeAbout() {
  const s = $('about-scroll');
  if (!s || s.hidden) return;
  s.classList.remove('opening');
  s.classList.add('closing');
  clearTimeout(aboutTimer);
  aboutTimer = setTimeout(() => {
    s.hidden = true;
    s.classList.remove('closing');
  }, ABOUT_CLOSE_MS);
}

/* ---------- 两屏切换 ---------- */
let curScreen = 'intro-open';
function showScreen(id) {
  curScreen = id;
  ['intro-open', 'intro-doc'].forEach(s => {
    const el = $(s);
    if (el) el.hidden = (s !== id);
  });
  if (id === 'intro-open') window.scrollTo(0, 0);
}

/* ---------- 关闭引导层，进入游戏 ---------- */
function enterGame() {
  saveMode(MODE);
  saveSeat(SEAT);
  /* 卷轴若开着，先收掉 —— 不然它会跟着引导层一起消失之后
     又留在页面上（z-index 205 比 #ordergate 低，但比游戏本体高）。 */
  closeAbout();
  /* SEEN_KEY 已不参与「要不要显示」的判断（见文件头第 4 条），
     这里仍写一份，留作「本机上有人进过游戏」的痕迹，别的模块可能读。 */
  try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* 隐私模式忽略 */ }
  const layer = $('intro');
  if (layer) {
    layer.classList.add('gone');
    /* 撤走整层：从可访问性树与 Tab 顺序里拿掉，
       否则键盘用户 Tab 会一直落在已经看不见的引导层控件上。 */
    layer.setAttribute('aria-hidden', 'true');
    layer.hidden = true;
  }
  /* 游戏本体可能还在按「引导层占着屏」算过的尺寸上，
     这里补一次重排（幂等，布局没变时不会产生多余动作）。 */
  window.dispatchEvent(new Event('resize'));
  /* 通知游戏本体：玩家正式入场了。
     ⚠️ 这里**不直接调 main.js 的函数**（intro.js 不 import main.js，见约束 1），
        只发一个自定义事件，由 main.js 决定要做什么。
        目前 main.js 收到后会重开一局并弹「本局行动顺序」窗 ——
        玩家点「知道了，开始」才真的走第一回合。 */
  window.dispatchEvent(new CustomEvent('cnv:entergame'));
}

/* ---------- 重新打开引导层（顶栏「开篇」按钮，main.js 里绑定的） ---------- */
function openIntro(screen) {
  /*⚠ 不要再写 showIntro = ... —— 它现在是 const（见上面「是否要显示引导层」）。
     之前这里有一行 showIntro = true，改const 时漏改，点顶栏「开篇」会抛
     TypeError: Assignment to constant variable，整个函数中断，
     表现为「按钮点了没反应」（无头诊断 _btn.py 实测定位）。
     showIntro 只在 boot() 里读一次，不需要在运行期改写。 */
  const l = $('intro');
  if (l) {
    l.hidden = false;
    l.classList.remove('gone');
    l.removeAttribute('aria-hidden');
  }
  showScreen(screen || 'intro-open');
}

/* ---------- 启动 ---------- */
function boot() {
  renderPick();
  syncModes();

  const layer = $('intro');
  if (!showIntro) {
    if (layer) layer.classList.add('gone');
  } else {
    /* 首屏开篇；地址栏带 #doc 时直接落到介绍页（教研分享 / 截图验收都靠它） */
    showScreen(location.hash === '#doc' ? 'intro-doc' : 'intro-open');

    /* 模式切换按钮已于 2026-10-18 从封面删除（顶栏 #mode-seg 是唯一入口）。
       ⚠️ 这里必须判空 —— 元素不存在时 querySelectorAll 返回空 NodeList
       （不会抛错），但 $('.querySelectorAll') 之外的直接属性访问会炸。
       保留这段是为了「以后要加回来」时能直接用，加回来的话记得同步 AGENTS.md。 */
    const modes = $('intro-modes');
    if (modes) {
      modes.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => { saveMode(b.dataset.mode); syncModes(); });
      });
    }

    /* 开篇 -> 介绍 / 直接进游戏 */
    $('intro-to-doc').addEventListener('click', () => showScreen('intro-doc'));
    $('intro-start').addEventListener('click', enterGame);

    /* 游戏简介卷轴（元素可能不存在 —— 测试页会换掉 body） */
    const aboutBtn = $('btn-intro-about');
    if (aboutBtn) aboutBtn.addEventListener('click', openAbout);
    const aboutX = $('about-close');
    if (aboutX) aboutX.addEventListener('click', closeAbout);
    const aboutDim = $('about-dim');
    if (aboutDim) aboutDim.addEventListener('click', closeAbout);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAbout();
    });

    /* 介绍页：返回开篇 / 进游戏 / 锚点跳转 */
    $('intro-back').addEventListener('click', () => showScreen('intro-open'));
    $('intro-doc-go').addEventListener('click', enterGame);
    $('intro-doc-go2').addEventListener('click', enterGame);
    document.querySelectorAll('.hn-links [data-jump]').forEach(b => {
      b.addEventListener('click', () => {
        const t = b.dataset.jump;
        if (t === 'intro-open') { showScreen('intro-open'); return; }
        showScreen('intro-doc');
        /* 等一帧再滚，屏幕切换与滚动同一帧会偶发滚不动 */
        requestAnimationFrame(() => {
          const el = $(t);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    });
  }

  /* 顶栏「开篇」按钮（HTML 里存在与否都安全，测试会换掉 body） */
  const btn = $('btn-intro');
  if (btn) btn.addEventListener('click', () => openIntro('intro-open'));
}

/* DOM 还没就绪时先等一等（module 是 defer 语义，通常已就绪，但保险起见） */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* 给测试与调试用 */
window.__intro = {
  get shown() { return !!$('intro') && !$('intro').classList.contains('gone'); },
  get screen() { return curScreen; },
  get mode() { return MODE; },
  get seat() { return SEAT; },
  open: openIntro,
  goDoc() { openIntro('intro-doc'); },
  openAbout, closeAbout,
  get aboutOpen() { const s = $('about-scroll'); return !!s && !s.hidden; },
  enterGame
};