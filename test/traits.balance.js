/**
 * 部落特性平衡测试：200 局 AI 自动对战，统计各部落胜率。
 * 用法：node test/traits.balance.js
 */
import { initGame, playTurn, aiDecide } from '../src/engine.js';
import { RULES, TRIBES } from '../src/data.js';

const N = Number(process.argv[2] || 200);
const win = {};
const lens = [];
TRIBES.forEach(t => win[t.id] = 0);

for (let i = 0; i < N; i++) {
  const g = initGame(RULES.tribes);
  let guard = 0;
  while (!g.over && guard++ < 500) {
    playTurn(g, aiDecide);
  }
  if (g.over && g.winner) win[g.winner.tid]++;
  lens.push(g.round);
}

const total = Object.values(win).reduce((a, b) => a + b, 0);
console.log(`=== ${N} 局结果 ===`);
console.log(`平均局长 ${(lens.reduce((a, b) => a + b, 0) / N).toFixed(1)} 回合（${Math.min(...lens)}~${Math.max(...lens)}）`);
let lo = 100, hi = 0;
for (const t of TRIBES) {
  const p = win[t.id] / total * 100;
  lo = Math.min(lo, p); hi = Math.max(hi, p);
  console.log(`  ${t.name}（${t.motif}）胜率 ${p.toFixed(1)}%  [${win[t.id]}/${total}]`);
}
console.log(`spread = ${(hi - lo).toFixed(1)}%`);
