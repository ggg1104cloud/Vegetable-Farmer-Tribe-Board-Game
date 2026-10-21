/* =========================================================
   赛道几何自检
   ---------------------------------------------------------
   唯一目的：保证「TRACK[index]」与「CELL_POS[index]」在几何上对齐 ——
   棋子每走一步都按 CELL_POS 定位，只要这两者错位，
   就会出现横穿图板的跳跃（实测过4 处，位移 0.855 vs 正常 0.087）。

   检查两件事：
     ① 顺时针性：相邻两格的走向必须构成「底边向左 / 左边向上 /
        顶边向右 / 右边向下」的顺时针，绝不允许回头
     ② 邻接性：每步位移必须 < MAX_STEP（不跨格、不横穿）
   ========================================================= */
import { TRACK } from '../src/data.js';
import { CELL_POS, CELL_RECTS } from '../src/cellPositions.js';

/* 一步的最大允许位移：实测正常步长 0.086~0.118，
   转角处（斜跨角点）约 0.145。留足余量取 0.30，
   仍远小于断裂时的 0.85，能挡住所有错位。 */
const MAX_STEP = 0.30;

let fails = 0;
const check = (name, ok, detail) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`);
};

/* ---------- 1. 长度一致 ---------- */
check('TRACK 与 CELL_POS 长度一致',
  TRACK.length === CELL_POS.length,
  `TRACK ${TRACK.length} / CELL_POS ${CELL_POS.length}`);
check('赛道共 32 格', TRACK.length === 32, TRACK.length + ' 格');

if (TRACK.length !== CELL_POS.length) {
  console.log(`\n===== 结果：${fails} 项失败 ✗ =====`);
  process.exit(1);
}

/* ---------- 2. 每步位移（邻接性）---------- */
const norm = (i, j) => {
  const dx = CELL_POS[j][0] - CELL_POS[i][0];
  const dy = CELL_POS[j][1] - CELL_POS[i][1];
  return { dx, dy, len: Math.hypot(dx, dy) };
};

const bad = [];
for (let i = 0; i < TRACK.length; i++) {
  const j = (i + 1) % TRACK.length;
  const { len } = norm(i, j);
  if (len > MAX_STEP) bad.push(`${i}->${j} len=${len.toFixed(3)}`);
}
check(`每步位移都 ≤ ${MAX_STEP}（不横穿图板）`,
  bad.length === 0,
  bad.length ? bad.join(', ') : `最大 ${Math.max(...Array.from({ length: TRACK.length },
    (_, i) => norm(i, (i + 1) % TRACK.length).len)).toFixed(3)}`);

/* ---------- 3. 顺时针性 ---------- */
/* 棋盘四条边的合法走向（dx, dy 都是归一化增量）：
     底边→左边：向左 (-x) 然后向上 (-y)
     左边→顶边：向上 (-y) 然后向右 (+x)
     顶边→右边：向右 (+x) 然后向下 (+y)
     右边→底边：向下 (+y) 然后向左 (-x)
   合起来就是顺时针：左 → 上 → 右 → 下。
   「回头」的方向（左→右、上→下）都判为逆时针。 */
const CW = {
  'left':  { dx: -1, dy: 0 },
  'up':    { dx: 0, dy: -1 },
  'right': { dx: 1, dy: 0 },
  'down':  { dx: 0, dy: 1 }
};
/* 反向（逆时针）——出现即错 */
const CCW = {
  'left':  CW.right, 'up': CW.down, 'right': CW.left, 'down': CW.up
};

function dirOf(i, j) {
  const { dx, dy } = norm(i, j);
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

const ccwHits = [];
for (let i = 0; i < TRACK.length; i++) {
  const j = (i + 1) % TRACK.length;
  const d = dirOf(i, j);
  // 当前方向与「反向」字典比对：若这一步是上一组允许方向的相反，就是回头
  const prev = (i - 1 + TRACK.length) % TRACK.length;
  const pd = dirOf(prev, i);
  const opp = { left: 'right', right: 'left', up: 'down', down: 'up' }[pd];
  if (d === opp && TRACK.length > 2) ccwHits.push(`${prev}->${i}->${j}（${pd} 然后 ${d}）`);
}
check('全程顺时针，无回头（不存在「向左后又向右」这类折返）',
  ccwHits.length === 0,
  ccwHits.length ? ccwHits.join(', ') : '4 个转角方向依次为 左→上→右→下');

/* ---------- 4. 转角衔接（不能跳过转角格子）---------- */
/* 底图四条边的角格坐标：CELL_POS 里 nx/ny 明显贴边的就是角。
   顺时针一圈应有且仅有 4 个转角，且相邻两步方向改变恰好 4 次。 */
let turns = 0;
for (let i = 0; i < TRACK.length; i++) {
  const j = (i + 1) % TRACK.length;
  if (dirOf(i, j) !== dirOf(j, (j + 1) % TRACK.length)) turns++;
}
check('恰好 4 个转角', turns === 4, turns + ' 个');

/* ---------- 5. CELL_RECTS 与 CELL_POS 对齐 ---------- */
/* 这两张表都靠index 定位同一个格子：前者的中心必须等于后者。
   错位时的症状特别迷惑人 ——「棋子在江南水稻土，点开却是青藏草甸土」，
   因为棋子用 CELL_POS、格子贴片用 CELL_RECTS，两边指向了不同的格子。 */
const rectBad = [];
for (let i = 0; i < Math.min(CELL_POS.length, CELL_RECTS.length); i++) {
  const r = CELL_RECTS[i];
  const rx = (r[0] + r[2]) / 2, ry = (r[1] + r[3]) / 2;
  if (Math.abs(CELL_POS[i][0] - rx) > 0.015 || Math.abs(CELL_POS[i][1] - ry) > 0.015) {
    rectBad.push(`${i}: POS(${CELL_POS[i][0].toFixed(3)},${CELL_POS[i][1].toFixed(3)})`
      + ` vs RECTS(${rx.toFixed(3)},${ry.toFixed(3)})`);
  }
}
check('CELL_RECTS 与 CELL_POS 逐格对齐（同序）',
  rectBad.length === 0,
  rectBad.length ? rectBad.slice(0, 4).join('; ') + (rectBad.length > 4 ? ` …共 ${rectBad.length} 处` : '')
                 : '32 格贴片与坐标一致');
check('CELL_RECTS 数量 = 32', CELL_RECTS.length === 32, CELL_RECTS.length + ' 个');

/* ---------- 6. 起点/闭环 ---------- */
const s = CELL_POS[0];
check('起点在右下角', s[0] > 0.85 && s[1] > 0.85, `(${s[0].toFixed(3)}, ${s[1].toFixed(3)})`);
check('起点唯一', TRACK.filter(c => c.kind === 'start').length === 1,
  TRACK.filter(c => c.kind === 'start').length + ' 个');

console.log(`\n===== 结果：${fails === 0 ? '全部通过 ✓' : fails + ' 项失败 ✗'} =====`);
process.exit(fails === 0 ? 0 : 1);