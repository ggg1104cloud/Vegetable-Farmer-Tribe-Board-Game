/** 赛道分布分析：定位先手优势来源 */
import { TRACK, LANDS, CROPS, landById, cropById, soilMatch, plantingProfit, plotsFor, RULES } from '../src/data.js';

console.log('=== 赛道 18 格分布 ===');
TRACK.forEach((c, i) => {
  if (c.kind === 'land') {
    const l = landById(c.soilId);
    // 找出在这块地上收益最高的作物
    let best = null, bp = -1e9;
    for (const cr of CROPS) {
      const p = plantingProfit(cr, l);
      if (p.profit > bp) { bp = p.profit; best = cr; }
    }
    console.log(
      String(i).padStart(2), '土地', l.name.padEnd(6),
      '价', String(l.price).padStart(3),
      '肥力', l.fertility.padEnd(3),
      '片', plotsFor(l.fertility),
      '| 最优作物', best.name.padEnd(4), '净收益', String(bp).padStart(4)
    );
  } else {
    console.log(String(i).padStart(2), '★站点', c.kind);
  }
});

console.log('\n=== 各地块「每 100 肥力币投入回报」===');
const rows = TRACK.filter(c => c.kind === 'land').map(c => {
  const l = landById(c.soilId);
  let best = null, bp = -1e9;
  for (const cr of CROPS) {
    const p = plantingProfit(cr, l);
    if (p.profit > bp) { bp = p.profit; best = cr; }
  }
  return { name: l.name, price: l.price, cost: best.cost * plotsFor(l.fertility),
           net: bp, roi: bp / l.price, name2: best.name };
});
rows.sort((a, b) => b.roi - a.roi);
for (const r of rows) {
  console.log(`  ${r.name.padEnd(6)} 地价 ${String(r.price).padStart(3)}  最优 ${r.name2.padEnd(4)}  净收益 ${String(r.net).padStart(4)}  投入回报比 ${r.roi.toFixed(3)}`);
}

console.log('\n=== 站点分布 ===');
const st = {};
TRACK.forEach((c) => { if (c.kind !== 'land') st[c.kind] = (st[c.kind] || 0) + 1; });
console.log(' ', st);
console.log('  土地格', TRACK.filter(c => c.kind === 'land').length, '/ 站点格', TRACK.length - TRACK.filter(c => c.kind === 'land').length);
console.log('  => 站点占比过高会让游戏过于依赖抽卡，土地经营（核心）被稀释');