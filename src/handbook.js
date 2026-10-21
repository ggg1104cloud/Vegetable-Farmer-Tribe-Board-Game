/* =========================================================
   图鉴（参考书）
   ---------------------------------------------------------
   列出**全部**卡牌，不受「谁持有」影响 —— 即使一个部落都没抽到某张卡，
   学生也能提前看到它的存在与数值，把它当「资料册」用。

   与三类手牌弹层的区别：
     - 手牌弹层：按部落分组，只列各部落**当前持有**的卡（动态，每回合变）
     - 图鉴：    按卡牌种类分组，列**所有**卡（静态全量），并标注当前谁持有

   数据全部从参数传入（不读 window.__game），这样测试能直接驱动。
   ========================================================= */
import {
  CROPS, WEATHERS, IMPROVES, LANDS, STATIONS, plantingProfit, IMPROVE_VALUE_MAX
} from './data.js';
import { cropCard, improveCard, landCard } from './cardArt.js';
import { improveBonus, improveCardRate } from './engine.js';

const $ = (id) => document.getElementById(id);

/* ---------------- 「谁持有」标注 ---------------- */
function cropHolders(cropId, G) {
  return G.players.filter(p => (p.seeds || {})[cropId] > 0).map(p => p.name);
}
function weatherHolders(wid, G) {
  return G.players.filter(p => (p.weatherCards || []).includes(wid)).map(p => p.name);
}
function improveHolders(iid, G) {
  return G.players.filter(p => p.hand.includes(iid)).map(p => p.name);
}
/* 土地：先从赛道格子拿到 soilId，再看 landOwners */
function landHolders(landId, G, TRACK) {
  const out = [];
  TRACK.forEach((c, i) => {
    if (c.kind !== 'land' || c.soilId !== landId) return;
    const tid = G.landOwners[i];
    if (!tid) return;
    const p = G.players.find(q => q.tid === tid);
    if (p && !out.includes(p.name)) out.push(p.name);
  });
  return out;
}

function heldBy(names, meName) {
  if (!names.length) return `<div class="hb none">当前无人持有</div>`;
  const tags = names.map(n =>
    `<span class="hb-tag${n === meName ? ' me' : ''}">${n}</span>`).join('');
  return `<div class="hb">持有：${tags}</div>`;
}

function wikiMini(url) {
  if (!url) return '';
  return `<a class="wikibtn wikibtn--mini" href="${url}" target="_blank"
    rel="noopener noreferrer">🔍 查阅科普</a>`;
}

/* ---------------- 页签 ---------------- */
const HB_TABS = [
  { k: 'crop',    n: '作物卡', ic: '🌰', c: () => CROPS.length },
  { k: 'weather', n: '气象卡', ic: '🌦️', c: () => WEATHERS.length },
  { k: 'improve', n: '改良卡', ic: '🎴', c: () => IMPROVES.length },
  { k: 'land',    n: '土地',   ic: '⛰️', c: () => LANDS.length },
  { k: 'station', n: '站点',   ic: '🚩', c: () => Object.keys(STATIONS).length }
];

let hbTab = 'crop';

/* =========================================================
   入口：openHandbook({ G, RULES, TRACK, meName, tab })
     tab 由调用方给出时切换页签；**不给时回到第一页**。
     （模块级 hbTab 只服务页签内的往复切换 —— 如果它一直留着，
       从别的入口打开图鉴时会停在上次看的页签，看着像按钮坏了。）
   ========================================================= */
export function openHandbook(ctx) {
  const { G, RULES, TRACK, meName } = ctx;
  hbTab = ctx.tab || 'crop';

  const tabs = `<div class="hb-tabs">${HB_TABS.map(t =>
    `<button class="hb-tab${t.k === hbTab ? ' on' : ''}" data-hb="${t.k}" type="button">
       <span class="hb-ic">${t.ic}</span>${t.n}<em>${t.c()}</em>
     </button>`).join('')}</div>`;

  const intro = `<p class="hint">这是<b>全量图鉴</b>：所有卡牌都在这里，<b>与谁持有无关</b>。
    每张卡的「持有」一行标出<b>当前各部落手上真的有这张卡</b>的情况，
    方便你判断对手下回合能赚多少。点🔍 可以跳百度百科看现实中的概念。
    <br>⚠️ 图鉴里标的是<b>标准价 / 标准面值</b>；<b>种子集市</b>的实际成交价受部落特长影响
    （如古蜀「稻作之源」水稻种子成本减半）—— <b>以集市卡面与右侧日志的实付金额为准</b>。</p>`;

  const body = hbTab === 'crop'    ? hbCrop(G, meName)
    : hbTab === 'weather' ? hbWeather(G, meName)
    : hbTab === 'improve' ? hbImprove(G, meName)
    : hbTab === 'land'    ? hbLand(G, TRACK, meName)
    : hbStation(RULES, TRACK);

  $('modal-body').innerHTML = `<h3>📖 图鉴 · 参考书</h3>${tabs}${intro}${body}`;
  $('modal').hidden = false;

  $('modal-body').querySelectorAll('.hb-tab').forEach(b => {
    b.addEventListener('click', () => openHandbook({ ...ctx, tab: b.dataset.hb }));
  });
}

/* ---------------- 作物卡 ---------------- */
function hbCrop(G, meName) {
  const cards = CROPS.map(c => {
    const hs = cropHolders(c.id, G);
    const rows = LANDS.map(l => {
      const pr = plantingProfit(c, l);
      return `<tr class="${pr.match === 'good' ? 'row-good' : ''}">
        <td>${l.name}</td><td>${l.fertility}</td>
        <td style="color:${pr.profit >= 0 ? '#3d7a30' : '#a03028'}">${pr.profit >= 0 ? '+' : ''}${pr.profit}</td>
      </tr>`;
    }).join('');
    const goodLands = LANDS.filter(l => plantingProfit(c, l).match === 'good').map(l => l.name);

    return `<figure class="hbcard${hs.length ? '' : ' dim'}">
      <img src="${cropCard(c)}" alt="${c.name}">
      <figcaption>
        <b>${c.name}</b>
        <span class="hb-num">种子 ${c.cost} 币 · 高收 ${c.good} · 低收 ${c.bad}</span>
        <span class="hb-kv">适配土壤：<em>${c.goodSoil}</em></span>
        <span class="hb-kv">实际高收益土：${goodLands.length ? goodLands.join('、') : '<i>本轮无</i>'}</span>
        <span class="hb-note">${c.note}</span>
        ${heldBy(hs, meName)}
        <details class="hb-detail">
          <summary>各土壤净收益（共 ${LANDS.length} 种）</summary>
          <table class="hb-table"><tr><th>土壤</th><th>肥力</th><th>净收益</th></tr>${rows}</table>
        </details>
        ${wikiMini(c.wiki)}
      </figcaption></figure>`;
  }).join('');
  return `<div class="hubgrid">${cards}</div>`;
}

/* ---------------- 气象卡 ---------------- */
function hbWeather(G, meName) {
  const cards = WEATHERS.map(w => {
    const hs = weatherHolders(w.id, G);
    return `<figure class="hbcard ${w.sign > 0 ? 'good' : 'bad'}${hs.length ? '' : ' dim'}">
      <div class="wx-ico">${w.sign > 0 ? '☀️' : '⛈️'}</div>
      <figcaption>
        <b>${w.name}</b><span class="hb-sub">${w.sub}</span>
        <span class="wx-val">${w.base >= 0 ? '+' : ''}${w.base} 肥力币（对所有作物统一）</span>
        <span class="hb-note">${w.desc}</span>
        ${heldBy(hs, meName)}
        ${wikiMini(w.wiki)}
      </figcaption></figure>`;
  }).join('');
  return `<p class="hint">气象卡<b>不会自动结算</b>：它在持有者<b>下一次种植</b>时
    自动发动（一次性，用掉即消失）。那一回合不种植，卡就一直留着。<br>
    <b style="color:#a03028">注意：气象损益对<b>所有作物一视同仁</b>（不论水稻、小麦），
    这正是课程里要学生发现的核心科学性 BUG。</b></p>
    <div class="hubgrid">${cards}</div>`;
}

/* ---------------- 改良卡 ---------------- */
function hbImprove(G, meName) {
  const cards = IMPROVES.map(im => {
    const hs = improveHolders(im.id, G);
    const pct = (improveCardRate(im) * 100).toFixed(1).replace(/\.0$/, '');
    return `<figure class="hbcard${hs.length ? '' : ' dim'}">
      <img src="${improveCard(im)}" alt="${im.name}">
      <figcaption>
        <b>${im.name}</b>
        <span class="hb-kv">站点：<em>${im.station}</em></span>
        <span class="hb-note">${im.gain}</span>
        <span class="hb-num">面值 ${im.value} 肥力币（抽到即到账）· 持有增益 <b>+${pct}%</b></span>
        ${heldBy(hs, meName)}
        ${wikiMini(im.wiki)}
      </figcaption></figure>`;
  }).join('');
  const rates = G.players.map(p =>
    `<span class="hb-tag" style="--tc:${p.color}">${p.name} ${p.hand.length} 张 → +${Math.round(improveBonus(p).rate * 100)}%</span>`).join('');
  return `<p class="hint">改良卡<b>抽到即得面值肥力币</b>，并<b>持有即增益</b>（不用点使用）：
    每张按面值折算增加收获收益 —— 面值 ${IMPROVE_VALUE_MAX}（最高）对应 <b>+6%</b>，
    其余 =（面值 ÷ ${IMPROVE_VALUE_MAX}）× 6%，合计上限 <b>+48%</b>；
    <b>不种作物就没有收益</b>。当前各部落：<span class="hb-row">${rates}</span></p>
    <div class="hubgrid">${cards}</div>`;
}

/* ---------------- 土地 ---------------- */
function hbLand(G, TRACK, meName) {
  const cards = LANDS.map(l => {
    const hs = landHolders(l.id, G, TRACK);
    const good = CROPS.filter(c => plantingProfit(c, l).match === 'good')
      .map(c => `<span class="hb-crop">${c.name}</span>`).join('') || '<i>无</i>';
    return `<figure class="hbcard${hs.length ? '' : ' dim'}">
      <img src="${landCard(l)}" alt="${l.name}">
      <figcaption>
        <b>${l.name}</b>
        <span class="hb-num">地价 ${l.price} · ${l.fertility}肥力 · ${l.plots} 片</span>
        <span class="hb-kv">质地 <em>${l.texture}</em> · ${l.ph}</span>
        <span class="hb-kv">分布：${l.region}</span>
        <span class="hb-kv">高收益作物：${good}</span>
        <span class="hb-note">${l.knowledge}</span>
        ${heldBy(hs, meName)}
        ${wikiMini(l.wiki)}
      </figcaption></figure>`;
  }).join('');
  return `<p class="hint">这里列的是<b>土壤本身</b>的适配作物（开局即可查，公开信息）；
    游戏里「花 5 币做土壤检测」买的是<b>某一块具体地块</b>的逐作物净收益明细。</p>
    <div class="hubgrid">${cards}</div>`;
}

/* ---------------- 站点 ---------------- */
function hbStation(RULES, TRACK) {
  const extra = {
    qixiang: '落到此格 → 获得一张<b>延时气象卡</b>（下次种植时发动）',
    nongji:  '落到此格 → 获得一张<b>改良卡</b>（持有即收获增益）',
    zhongzi: `落到此格 → 可买<b>作物卡</b>（单类上限 ${RULES.seedMaxPerType} 张 · 合计上限 ${RULES.seedMaxTotal} 张）`,
    jianyu:  '经过此格 → <b>暂停一回合</b>（反思不当农业行为）',
    start:   '每经过起点 → <b>+50 肥力币</b>'
  };
  const cards = Object.values(STATIONS).map(s => `<figure class="hbcard st">
      <div class="st-ico" style="--stc:${s.color}"><span class="st-dot"></span>${s.name}</div>
      <figcaption>
        <span class="hb-note">${s.desc}</span>
        ${extra[s.id] ? `<span class="hb-num">${extra[s.id]}</span>` : ''}
      </figcaption></figure>`).join('');
  const counts = {};
  TRACK.forEach(c => { counts[c.kind] = (counts[c.kind] || 0) + 1; });
  const dist = Object.entries(counts).map(([k, v]) => `${k} ×${v}`).join(' · ');
  return `<p class="hint">赛道共 <b>${TRACK.length}</b> 格，顺时针前进（起点 → 底边 → 左边 → 顶边 → 右边）。
    构成：${dist}</p><div class="hubgrid stgrid">${cards}</div>`;
}