/**
 * 部落特性参数扫描：找出「胜率最均衡」的 A 加成率 与 C 追风骰上限。
 * 用法：node test/traits.scan.js [每组合局数]
 */
import { initGame, playTurn, aiDecide } from '../src/engine.js';
import { RULES, TRIBES, TRIBE_TRAITS } from '../src/data.js';

const N = Number(process.argv[2] || 200);

function runBatch(n) {
  const win = {};
  TRIBES.forEach(t => win[t.id] = 0);
  for (let i = 0; i < n; i++) {
    const g = initGame(RULES.tribes);
    let guard = 0;
    while (!g.over && guard++ < 2000) playTurn(g, aiDecide);
    if (g.over && g.winner) win[g.winner.tid]++;
  }
  return win;
}

console.log(`每组 ${N} 局`);
console.log('A.rate  C骰  | A%    B%    C%    D%    | spread');
const combos = [];
for (const rate of [0.5, 0.7, 0.9]) {
  for (const max of [2, 3]) combos.push({ rate, max });
}
const rows = [];
for (const c of combos) {
  TRIBE_TRAITS.A.landBonus.rate = c.rate;
  TRIBE_TRAITS.C.extraRollMax = c.max;
  const win = runBatch(N);
  const p = TRIBES.map(t => win[t.id] / N * 100);
  const spread = Math.max(...p) - Math.min(...p);
  rows.push({ ...c, p, spread });
  console.log(`${c.rate.toFixed(1)}    1~${c.max} | ${p.map(x => x.toFixed(1).padStart(5)).join(' ')} | ${spread.toFixed(1)}`);
}

rows.sort((a, b) => a.spread - b.spread);
const best = rows[0];
console.log('\n最优组合:  A.rate=' + best.rate + '  C追风骰=1~' + best.max +
  '  spread=' + best.spread.toFixed(1) + '%');
TRIBE_TRAITS.A.landBonus.rate = best.rate;
TRIBE_TRAITS.C.extraRollMax = best.max;

/* 再用该组合跑一轮独立样本复核 */
const win2 = runBatch(N);
const p2 = TRIBES.map(t => win2[t.id] / N * 100);
console.log('复核样本: ' + p2.map((x, i) => TRIBES[i].name + ' ' + x.toFixed(1) + '%').join('  ') +
  '  spread=' + (Math.max(...p2) - Math.min(...p2)).toFixed(1) + '%');
