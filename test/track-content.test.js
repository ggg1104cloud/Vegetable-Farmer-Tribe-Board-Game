/* =========================================================
   赛道内容校验：TRACK[index] 必须落在 CELL_POS[index] 那个坐标上
   ---------------------------------------------------------
   上一轮只重排了 CELL_POS，但 TRACK 的**内容**（哪种土壤、哪个站）
   也必须跟着对调，否则会出现「坐标顺时针了，但卡片画在错误位置上」。

   做法：把底图实测的「每格内容 → 它应该在的边」列成表，
   断言 TRACK[index] 的内容与 CELL_POS[index] 所属的边一致。
   ========================================================= */
import { TRACK } from '../src/data.js';
import { CELL_POS } from '../src/cellPositions.js';

let fails = 0;
const check = (n, ok, d) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  → ' + d : ''}`);
};

/* 底图实测：各边上的格子类型（从右下角顺时针）
   底边（右→左）：起点/南方红壤/海南砖红壤/种子集市/土壤改良站/
                云贵黄壤×2/气象站/四川紫色土/种子集市
   左边（下→上）：青藏草甸土×2/土壤改良站/西北沙土/气象站/荒漠土/监狱
   顶边（左→右）：监狱已计入左边，这里是 种子集市/荒漠土×2/土壤改良站/
                黄绵土/气象站/东北黑土×2/种子集市
   右边（上→下）：山东棕壤×2/江南水稻土/土壤改良站/江南水稻土/南方红壤

   注意：转角格（起点在右下、左上监狱、右上种子集市、左下种子集市）
   各算一条边，编号连续，不重复。 */
const EXPECT = [
  // 0-9 底边
  'start', 'land:nanfang', 'land:hainan', 'zhongzi', 'nongji',
  'land:yungui', 'land:yungui', 'qixiang', 'land:zise', 'zhongzi',
  // 10-15 左边（下→上）
  'land:qingzang', 'land:qingzang', 'nongji', 'land:xibei', 'qixiang', 'land:huangmo',
  // 16-25 顶边（左→右）
  'jianyu', 'zhongzi', 'land:huangmo', 'land:huangmo', 'nongji',
  'land:huangmiantu', 'qixiang', 'land:heilitu', 'land:heilitu', 'zhongzi',
  // 26-31 右边（上→下）
  'land:shandong', 'land:shandong', 'land:jiangnan', 'nongji',
  'land:jiangnan', 'land:nanfang'
];

const key = c => (c.kind === 'land' ? 'land:' + c.soilId : c.kind);

check('期望表长度 = TRACK 长度',
  EXPECT.length === TRACK.length, `${EXPECT.length} vs ${TRACK.length}`);

const mismatch = [];
for (let i = 0; i < TRACK.length; i++) {
  if (key(TRACK[i]) !== EXPECT[i]) mismatch.push(`${i}: ${key(TRACK[i])} ≠ ${EXPECT[i]}`);
}
check('每格内容与底图实测一致（无错位）',
  mismatch.length === 0, mismatch.length ? mismatch.join('; ') : '32 格全部对位');

/* 反向核对：每种土壤的数量必须与底图相同 */
const cnt = arr => arr.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {});
const a = cnt(TRACK.map(key)), b = cnt(EXPECT);
check('各类型数量一致',
  JSON.stringify(a) === JSON.stringify(b),
  JSON.stringify(a, null, 0) === JSON.stringify(b, null, 0) ? '' : JSON.stringify(a) + ' vs ' + JSON.stringify(b));

/* 打印完整对照表，方便肉眼核 */
console.log('\n--- idx  内容                 坐标位置 ---');
const edge = (nx, ny) => ny > 0.85 ? '底边' : ny < 0.15 ? '顶边' : nx > 0.85 ? '右边' : '左边';
for (let i = 0; i < TRACK.length; i++) {
  const c = TRACK[i];
  const label = c.kind === 'land'
    ? (c.soilId === 'nanfang' ? '南方红壤' : c.soilId === 'hainan' ? '海南砖红壤'
      : c.soilId === 'yungui' ? '云贵黄壤' : c.soilId === 'zise' ? '四川紫色土'
      : c.soilId === 'qingzang' ? '青藏草甸土' : c.soilId === 'xibei' ? '西北沙土'
      : c.soilId === 'huangmo' ? '荒漠土' : c.soilId === 'huangmiantu' ? '黄绵土'
      : c.soilId === 'heilitu' ? '东北黑土' : c.soilId === 'shandong' ? '山东棕壤'
      : c.soilId === 'jiangnan' ? '江南水稻土' : c.soilId)
    : c.kind === 'start' ? '起点' : c.kind === 'zhongzi' ? '种子集市'
    : c.kind === 'nongji' ? '土壤改良站' : c.kind === 'qixiang' ? '气象站' : '监狱';
  console.log(`${String(i).padStart(2)}  ${label.padEnd(10, '　')}  ${edge(CELL_POS[i][0], CELL_POS[i][1])}`
    + `  (${CELL_POS[i][0].toFixed(3)}, ${CELL_POS[i][1].toFixed(3)})`
    + (key(c) === EXPECT[i] ? '' : '   <<< 不一致'));
}

console.log(`\n===== 结果：${fails === 0 ? '全部通过 ✓' : fails + ' 项失败 ✗'} =====`);
process.exit(fails === 0 ? 0 : 1);