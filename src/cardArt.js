/**
 * 菜农部落 · 国风卡面生成器
 *
 * 卡面改用 SVG 现画：宣纸底 + 墨线双框 + 回纹角饰 + 朱砂印章。
 * 相比位图：任意尺寸都清晰、文案配色改一处即生效、无需重新出图。
 *
 * 对外接口（都返回可直接塞 <img src> 的 data URI）：
 *   landCard(land)      土地卡（弹层大图）
 *   landMini(land)      土地卡缩略（列表）
 *   cropCard(crop)      作物卡（选种网格）
 *   improveCard(imp)    改良卡（手牌）
 */

/* ================= 色板 ================= */
const INK = '#3b332a';
const INK2 = '#6d6250';
const INK3 = '#9b8f79';
const PAPER1 = '#fdf9ee';
const PAPER2 = '#f3e8d0';
const CIN = '#b23a2e';
const GOLD = '#b8892e';
const JADE = '#4e7350';
const LEAF = '#4f7038';
const LEAF_HI = '#6f8f4a';
const STEM = '#43602f';
const KAI = "'STKaiti','KaiTi','KaiTi_GB2312','楷体',serif";
const SONG = "'Songti SC','SimSun','宋体',serif";

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 拼成 data URI */
export function cardUri(svg) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s+/g, ' ').trim());
}

/* ================= 通用零件 ================= */

/** 宣纸底 + 颗粒噪点 */
function paper(w, h, seed = 4) {
  return `
  <defs>
    <linearGradient id="pp" x1="0" y1="0" x2="0.25" y2="1">
      <stop offset="0" stop-color="${PAPER1}"/>
      <stop offset="1" stop-color="${PAPER2}"/>
    </linearGradient>
    <filter id="grain" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="${seed}" result="n"/>
      <feColorMatrix in="n" type="matrix"
        values="0 0 0 0 0.40  0 0 0 0 0.33  0 0 0 0 0.22  0 0 0 0.08 0"/>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#pp)"/>
  <rect width="${w}" height="${h}" filter="url(#grain)"/>`;
}

/** 墨线双框 + 四角回纹 */
function frame(w, h) {
  const corner = `<g fill="none" stroke="${GOLD}" stroke-width="1.1" opacity=".92">
      <path d="M0,20 L0,0 L20,0"/>
      <path d="M5,15 L5,5 L15,5"/>
      <rect x="9.5" y="9.5" width="3" height="3" fill="${GOLD}" stroke="none"/>
    </g>`;
  const m = 17;
  return `
  <rect x="7" y="7" width="${w - 14}" height="${h - 14}" rx="4" fill="none"
        stroke="${INK}" stroke-width="2.4"/>
  <rect x="13.5" y="13.5" width="${w - 27}" height="${h - 27}" rx="2.5" fill="none"
        stroke="${INK}" stroke-width="0.7" opacity=".45"/>
  <g transform="translate(${m},${m})">${corner}</g>
  <g transform="translate(${w - m},${m}) scale(-1,1)">${corner}</g>
  <g transform="translate(${m},${h - m}) scale(1,-1)">${corner}</g>
  <g transform="translate(${w - m},${h - m}) scale(-1,-1)">${corner}</g>`;
}

/** 朱砂印章 */
function seal(cx, cy, s, txt) {
  const chars = [...String(txt)].slice(0, 4);
  const n = chars.length;
  const lines = n >= 4 ? [chars.slice(0, 2), chars.slice(2)] : [chars];
  const fs = n <= 2 ? s * 0.56 : s * 0.40;
  const lh = fs * 1.04;
  const y0 = cy - (lines.length - 1) * lh / 2;
  const body = lines.map((ln, i) => ln.map((ch, j) =>
    `<text x="${cx + (n >= 4 ? (j - 0.5) * fs * 1.02 : 0)}"
           y="${y0 + i * lh + (n >= 4 ? lh * 0.5 : 0)}"
           font-family="${KAI}" font-size="${fs}" fill="#fff8ea"
           text-anchor="middle" dominant-baseline="central">${esc(ch)}</text>`).join('')).join('');
  return `<g>
    <rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" rx="${s * 0.13}"
          fill="${CIN}" opacity=".93"/>
    <rect x="${cx - s / 2 + 1.8}" y="${cy - s / 2 + 1.8}" width="${s - 3.6}" height="${s - 3.6}"
          rx="${s * 0.08}" fill="none" stroke="#fff8ea" stroke-opacity=".5" stroke-width="1"/>
    ${body}
  </g>`;
}

/* ================= 地貌小景（200 × 150 坐标系） ================= */

const SCENE_P = {
  heilitu: { kind: 'plain', sky1: '#e9ece2', sky2: '#cdd6c6', soil: '#2f2820', sub: '#4b4133', line: '#6b5f4a', tree: '#54613f' },
  huangmiantu: { kind: 'plateau', sky1: '#f0e6cd', sky2: '#e0cfa6', soil: '#c8a24c', sub: '#dcbc74', line: '#a8853a', tree: '#7d8a4a' },
  jiangnan: { kind: 'water', sky1: '#e6ecea', sky2: '#c3d5d2', soil: '#7d7a5e', sub: '#9c9a78', line: '#5f7d72', tree: '#4d6b4c' },
  zise: { kind: 'basin', sky1: '#eee6ea', sky2: '#dcc9d4', soil: '#7c5a6c', sub: '#9b7689', line: '#63475a', tree: '#5c6b46' },
  xibei: { kind: 'dune', sky1: '#f4ecd8', sky2: '#e2d0a8', soil: '#d3b57e', sub: '#e6d2a6', line: '#b8995f', tree: '#8b9a5e' },
  nanfang: { kind: 'hill', sky1: '#f2e8e0', sky2: '#e0cabc', soil: '#a84b34', sub: '#c06b4f', line: '#8a3722', tree: '#4f6b43' },
  shandong: { kind: 'orchard', sky1: '#eeece0', sky2: '#d8d6c0', soil: '#8c6c46', sub: '#a5885f', line: '#6f5436', tree: '#557044' },
  huangmo: { kind: 'gobi', sky1: '#f5eeda', sky2: '#e6d8b4', soil: '#c3a874', sub: '#d9c69a', line: '#a58c5c', tree: '#9aa06a' },
  yungui: { kind: 'terrace', sky1: '#efece0', sky2: '#dad4bc', soil: '#c09740', sub: '#d8b76a', line: '#9c7830', tree: '#5f7444' },
  hainan: { kind: 'island', sky1: '#e4eee9', sky2: '#bdd8d2', soil: '#a63d22', sub: '#c25a38', line: '#7f2a15', tree: '#3f6b45' },
  qingzang: { kind: 'snow', sky1: '#e9eef0', sky2: '#cdd8dd', soil: '#6d6650', sub: '#8c8468', line: '#585240', tree: '#6f8455' },
};

/** 地貌小景，画在 200×150 画布上 */
function scene(kind, p) {
  const head = `<defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${p.sky1}"/><stop offset="1" stop-color="${p.sky2}"/>
      </linearGradient>
    </defs>
    <rect width="200" height="150" fill="url(#sky)"/>`;
  const furrows = (y0, n, gap, color, op = 0.45) =>
    Array.from({ length: n }, (_, i) =>
      `<path d="M-4,${y0 + i * gap} Q100,${y0 + i * gap - 4} 204,${y0 + i * gap}"
         fill="none" stroke="${color}" stroke-width="1.2" opacity="${op}"/>`).join('');
  const tree = (x, y, s, c = p.tree) =>
    `<g transform="translate(${x},${y}) scale(${s})">
       <path d="M0,0 L0,-4" stroke="${INK2}" stroke-width="1.2"/>
       <path d="M-6,-4 Q0,-13 6,-4 Z" fill="${c}"/>
     </g>`;

  switch (kind) {
    case 'plain':
      return `${head}
        <path d="M0,150 L0,84 L200,80 L200,150 Z" fill="${p.soil}"/>
        <path d="M0,84 L200,80 L200,88 L0,92 Z" fill="${p.sub}" opacity=".9"/>
        ${furrows(96, 7, 8, p.line, 0.4)}
        ${tree(28, 80, 1.1)}${tree(52, 79, 0.85)}${tree(168, 78, 1.0)}${tree(146, 79, 0.8)}`;

    case 'plateau':
      return `${head}
        <path d="M0,150 L0,70 L54,66 L60,92 L108,88 L116,64 L158,60 L200,66 L200,150 Z" fill="${p.soil}"/>
        <path d="M0,70 L54,66 L60,92 L40,96 L0,92 Z" fill="${p.sub}" opacity=".55"/>
        <path d="M116,64 L158,60 L200,66 L200,78 L150,80 Z" fill="${p.sub}" opacity=".5"/>
        <path d="M56,68 q6,10 3,24 M60,88 q8,10 6,26 M118,66 q7,10 5,22"
              fill="none" stroke="${p.line}" stroke-width="1.6" opacity=".7"/>
        ${furrows(100, 5, 10, p.line, 0.32)}
        ${tree(30, 64, 0.8)}${tree(176, 62, 0.9)}`;

    case 'water':
      return `${head}
        <path d="M0,150 L0,74 L200,70 L200,150 Z" fill="${p.sub}"/>
        <path d="M0,74 L200,70 L200,80 L0,84 Z" fill="${p.soil}" opacity=".85"/>
        <path d="M6,92 L94,88 L94,120 L6,124 Z" fill="#cfe0dc" opacity=".85"/>
        <path d="M106,88 L194,84 L194,116 L106,120 Z" fill="#cfe0dc" opacity=".85"/>
        <path d="M6,132 L94,128 L94,146 L6,150 Z" fill="#c2d6d2" opacity=".8"/>
        <path d="M106,128 L194,124 L194,142 L106,146 Z" fill="#c2d6d2" opacity=".8"/>
        ${[0, 1, 2].map(i => `<path d="M12,${100 + i * 9} q40,-3 78,0" fill="none" stroke="#8fb0a8" stroke-width="1.1" opacity=".7"/>`).join('')}
        ${[0, 1, 2].map(i => `<path d="M112,${96 + i * 9} q40,-3 78,0" fill="none" stroke="#8fb0a8" stroke-width="1.1" opacity=".7"/>`).join('')}
        ${tree(20, 72, 0.8)}${tree(178, 70, 0.75)}`;

    case 'basin':
      return `${head}
        <path d="M0,150 L0,96 Q34,64 62,88 Q92,52 120,86 Q152,60 200,94 L200,150 Z" fill="${p.sub}"/>
        <path d="M0,150 L0,104 Q40,86 74,100 Q110,78 150,100 Q178,88 200,100 L200,150 Z" fill="${p.soil}"/>
        ${furrows(116, 4, 9, p.line, 0.38)}
        ${tree(24, 100, 0.85)}${tree(178, 96, 0.85)}`;

    case 'dune':
      return `${head}
        <circle cx="152" cy="40" r="16" fill="#e8c56a" opacity=".5"/>
        <path d="M0,150 L0,104 Q44,78 92,104 Q142,72 200,100 L200,150 Z" fill="${p.sub}"/>
        <path d="M0,150 L0,122 Q52,102 104,124 Q154,102 200,120 L200,150 Z" fill="${p.soil}"/>
        <path d="M92,104 Q116,96 138,106 M0,104 Q22,96 44,104"
              fill="none" stroke="${p.line}" stroke-width="1.3" opacity=".55"/>
        ${tree(30, 118, 0.7)}${tree(166, 116, 0.62)}`;

    case 'hill':
      return `${head}
        <path d="M0,150 L0,92 Q38,56 76,90 Q112,58 148,92 Q176,72 200,90 L200,150 Z" fill="${p.sub}"/>
        <path d="M0,150 L0,106 Q42,88 84,110 Q126,90 168,112 Q186,102 200,108 L200,150 Z" fill="${p.soil}"/>
        ${[0, 1, 2].map(i =>
        `<path d="M${28 + i * 58},106 q10,-12 22,-2" fill="none" stroke="${p.line}" stroke-width="1.2" opacity=".5"/>`).join('')}
        ${tree(40, 102, 0.9)}${tree(120, 100, 0.9)}${tree(176, 104, 0.8)}`;

    case 'orchard':
      return `${head}
        <path d="M0,150 L0,96 Q50,74 100,94 Q152,72 200,94 L200,150 Z" fill="${p.sub}"/>
        <path d="M0,150 L0,112 Q52,96 104,114 Q154,96 200,112 L200,150 Z" fill="${p.soil}"/>
        ${[[22, 100], [56, 96], [92, 98], [128, 96], [164, 98]].map(([x, y], i) =>
          `<g><path d="M${x},${y + 12} L${x},${y + 4}" stroke="${INK2}" stroke-width="1.3"/>
             <circle cx="${x}" cy="${y + (i % 2 ? 0 : -2)}" r="${i % 2 ? 5 : 6}" fill="${p.tree}" opacity=".92"/></g>`).join('')}
        ${furrows(124, 3, 9, p.line, 0.3)}`;

    case 'gobi':
      return `${head}
        <circle cx="46" cy="38" r="13" fill="#e9c96f" opacity=".45"/>
        <path d="M0,150 L0,110 Q46,92 96,110 Q148,90 200,108 L200,150 Z" fill="${p.sub}"/>
        <path d="M0,150 L0,128 Q56,112 112,130 Q158,114 200,126 L200,150 Z" fill="${p.soil}"/>
        <path d="M60,110 L64,92 L76,92 L80,110 Z" fill="${p.line}" opacity=".65"/>
        <path d="M120,112 L124,96 L134,96 L138,112 Z" fill="${p.line}" opacity=".5"/>
        <path d="M150,132 q14,-8 26,-2 M24,134 q14,-8 26,-2" fill="none"
              stroke="${p.line}" stroke-width="1.2" opacity=".45"/>`;

    case 'terrace':
      return `${head}
        ${[0, 1, 2, 3, 4].map(i => {
        const y = 66 + i * 17, w = 200 - i * 6, x = i * 3;
        return `<path d="M${x},${y + 14} L${x},${y} L${x + w},${y - 3} L${x + w},${y + 12} Z"
                  fill="${i % 2 ? p.sub : p.soil}" opacity="${0.85 - i * 0.05}"/>
                <path d="M${x},${y + 14} L${x + w},${y + 12}" stroke="${p.line}" stroke-width="1.1" opacity=".4"/>`;
      }).join('')}
        ${tree(16, 66, 0.7)}${tree(182, 62, 0.7)}`;

    case 'island':
      return `${head}
        <rect y="104" width="200" height="46" fill="#a9cfc8"/>
        <path d="M0,150 L0,116 Q54,102 108,116 Q158,104 200,114 L200,150 Z" fill="#bcdcd4" opacity=".8"/>
        <path d="M46,116 Q100,84 158,116 Z" fill="${p.sub}"/>
        <path d="M62,112 L96,92 L134,112 Z" fill="${p.soil}"/>
        <g transform="translate(88,92)">
          <path d="M0,0 L0,-22" stroke="#6b5436" stroke-width="2.4"/>
          <path d="M0,-22 q-14,-8 -22,2 q12,4 22,-2 M0,-22 q14,-8 22,2 q-12,4 -22,-2
                   M0,-22 q-8,-13 -18,-14 q4,12 18,14 M0,-22 q8,-13 18,-14 q-4,12 -18,14"
                fill="none" stroke="${p.tree}" stroke-width="2.2"/>
        </g>
        <path d="M0,124 q40,-4 80,0 M120,124 q40,-4 80,0" fill="none"
              stroke="#8fb8b0" stroke-width="1.1" opacity=".65"/>`;

    case 'snow':
      return `${head}
        <path d="M0,150 L0,102 L40,58 L70,88 L104,44 L140,90 L172,66 L200,100 L200,150 Z" fill="#b9c6cc"/>
        <path d="M40,58 L54,74 L46,80 L34,72 Z M104,44 L122,66 L110,74 L96,62 Z M172,66 L184,78 L174,84 L166,74 Z"
              fill="#fbfdfe" opacity=".95"/>
        <path d="M0,150 L0,112 Q54,98 108,114 Q156,100 200,112 L200,150 Z" fill="${p.soil}"/>
        <path d="M0,150 L0,128 Q56,114 112,130 Q158,118 200,128 L200,150 Z" fill="${p.sub}" opacity=".8"/>
        ${[[30, 122], [72, 120], [118, 122], [166, 120]].map(([x, y]) =>
            `<path d="M${x - 4},${y} q4,-7 8,0 M${x},${y} L${x},${y + 5}" fill="none"
               stroke="${p.tree}" stroke-width="1.3" opacity=".8"/>`).join('')}`;

    default:
      return `${head}<path d="M0,150 L0,90 L200,86 L200,150 Z" fill="${p.soil}"/>`;
  }
}

/* ================= 作物水墨图标（120 × 120 坐标系） ================= */

const CROP_ART = {
  shuidao: `
    <g fill="none" stroke="${STEM}" stroke-width="3" stroke-linecap="round">
      <path d="M62 114 C60 88 60 60 63 38"/>
      <path d="M61 84 C46 80 35 68 32 52"/>
      <path d="M63 74 C78 70 89 58 92 42"/>
    </g>
    <g fill="#d8b34c" stroke="#a5812a" stroke-width="1.1">
      <path d="M63 14 C73 22 76 38 70 50 C66 58 61 60 58 57 C53 52 50 38 52 27 C54 19 58 15 63 14 Z"/>
      <path d="M32 40 C39 47 41 58 36 66 C32 71 29 72 27 69 C24 65 23 54 25 46 C26 41 29 39 32 40 Z"/>
      <path d="M92 30 C99 38 100 50 95 58 C91 63 88 64 86 61 C83 57 83 45 85 37 C86 32 89 29 92 30 Z"/>
    </g>
    <path d="M62 96 C50 92 42 84 38 74" fill="none" stroke="${LEAF_HI}" stroke-width="2.4" stroke-linecap="round"/>`,

  xiaomai: `
    <path d="M60 114 L60 46" fill="none" stroke="${STEM}" stroke-width="3" stroke-linecap="round"/>
    <g fill="#d9b459" stroke="#a5812a" stroke-width="1">
      ${[[-11, 0], [11, 0], [-10, 12], [10, 12], [-9, 24], [9, 24], [-8, 36], [8, 36]]
      .map(([dx, dy]) => `<ellipse cx="${60 + dx}" cy="${44 + dy}" rx="6" ry="8"
             transform="rotate(${dx < 0 ? -18 : 18} ${60 + dx} ${44 + dy})"/>`).join('')}
      <path d="M60 20 C64 30 66 42 64 54 C62 62 58 62 56 54 C54 42 56 30 60 20 Z"/>
    </g>
    <g fill="none" stroke="#c9a94e" stroke-width="1.4" opacity=".9">
      <path d="M60 22 L48 8 M60 22 L72 8 M60 34 L44 22 M60 34 L76 22"/>
    </g>`,

  yumi: `
    <path d="M60 116 L60 92" fill="none" stroke="${STEM}" stroke-width="3" stroke-linecap="round"/>
    <path d="M44 92 C34 78 32 50 42 32 C50 18 70 16 78 30 C88 48 86 78 76 92 Z"
          fill="#e0bb5c" stroke="#a5812a" stroke-width="1.6"/>
    <g fill="#c8a44a">
      ${Array.from({ length: 5 }, (_, r) => Array.from({ length: 4 }, (_, c) =>
        `<circle cx="${48 + c * 8 + (r % 2) * 4}" cy="${40 + r * 11}" r="2.4"/>`).join('')).join('')}
    </g>
    <path d="M44 90 C24 84 16 62 22 44 C36 54 44 70 46 88 Z" fill="${LEAF}" opacity=".92"/>
    <path d="M76 90 C96 84 104 62 98 44 C84 54 76 70 74 88 Z" fill="${LEAF_HI}" opacity=".92"/>`,

  malingshu: `
    <g fill="none" stroke="${STEM}" stroke-width="2.6" stroke-linecap="round">
      <path d="M60 62 L60 42"/>
      <path d="M60 52 C52 46 46 36 46 26"/>
      <path d="M60 50 C68 44 74 34 74 24"/>
    </g>
    <path d="M46 26 C40 14 46 6 56 8 C62 14 58 24 46 26 Z" fill="${LEAF}"/>
    <path d="M74 24 C80 12 90 10 94 16 C92 26 82 30 74 24 Z" fill="${LEAF_HI}"/>
    <path d="M28 100 C26 82 44 68 62 74 C80 80 82 98 68 108 C54 118 30 114 28 100 Z"
          fill="#c8a468" stroke="#8a6a3a" stroke-width="1.8"/>
    <g fill="#8a6a3a" opacity=".7">
      <circle cx="46" cy="88" r="2"/><circle cx="60" cy="96" r="2"/>
      <circle cx="68" cy="86" r="2"/><circle cx="52" cy="104" r="1.8"/>
    </g>`,

  huasheng: `
    <path d="M56 62 C56 44 74 38 82 50 C88 60 80 68 84 78 C88 90 78 102 66 100
             C54 98 48 88 52 78 C56 70 56 68 56 62 Z"
          fill="#d7bb84" stroke="#8f6e3c" stroke-width="1.8"/>
    <g fill="none" stroke="#a5824a" stroke-width="1" opacity=".75">
      ${Array.from({ length: 7 }, (_, i) =>
        `<path d="M${34 + i * 4},60 Q${56 + i * 4},${54 + i * 6} ${80 - i * 2},${62 + i * 7}"/>`).join('')}
    </g>
    <g fill="none" stroke="${STEM}" stroke-width="2.8" stroke-linecap="round">
      <path d="M60 62 L58 36"/>
      <path d="M58 46 C48 42 42 32 42 22"/>
      <path d="M59 42 C68 38 74 28 74 18"/>
    </g>
    <path d="M42 22 C34 12 40 2 50 6 C56 12 52 20 42 22 Z" fill="${LEAF}"/>
    <path d="M74 18 C80 6 92 6 94 14 C90 24 80 26 74 18 Z" fill="${LEAF_HI}"/>`,

  xigua: `
    <circle cx="74" cy="78" r="32" fill="#4e7b3c" stroke="#2f5426" stroke-width="1.8"/>
    <g fill="none" stroke="#2f5426" stroke-width="3" opacity=".65">
      <path d="M74 46 C68 62 68 94 74 110"/>
      <path d="M60 52 C52 66 52 92 58 104"/>
      <path d="M88 52 C96 66 96 92 90 104"/>
    </g>
    <path d="M8 104 A34 34 0 0 1 76 104 Z" fill="#d9564a" stroke="#8f2a20" stroke-width="1.6"/>
    <path d="M8 104 A34 34 0 0 1 76 104" fill="none" stroke="#4e7b3c" stroke-width="5"/>
    <g fill="#2f2a22" opacity=".85">
      <ellipse cx="30" cy="92" rx="2.6" ry="3.6" transform="rotate(20 30 92)"/>
      <ellipse cx="46" cy="84" rx="2.6" ry="3.6" transform="rotate(8 46 84)"/>
      <ellipse cx="62" cy="92" rx="2.6" ry="3.6" transform="rotate(-14 62 92)"/>
      <ellipse cx="42" cy="100" rx="2.4" ry="3.4"/>
    </g>
    <path d="M74 44 C74 34 82 26 92 26" fill="none" stroke="${STEM}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M84 30 C92 22 102 24 102 32 C96 40 86 38 84 30 Z" fill="${LEAF_HI}"/>`,

  hongshu: `
    <path d="M24 84 C26 66 50 58 74 62 C98 66 106 84 92 98 C78 112 40 110 28 98
             C24 94 23 90 24 84 Z" fill="#b8503a" stroke="#7f2f1c" stroke-width="1.8"/>
    <g fill="none" stroke="#8f3a24" stroke-width="1.1" opacity=".55">
      <path d="M34 76 q20,-8 42,-2 M30 90 q26,6 52,-4"/>
    </g>
    <g fill="none" stroke="${STEM}" stroke-width="2.6" stroke-linecap="round">
      <path d="M40 64 C36 50 34 40 36 30"/>
      <path d="M36 44 C26 36 22 24 26 14"/>
      <path d="M36 40 C44 30 52 24 62 20"/>
    </g>
    <path d="M26 14 C20 4 28 -4 38 0 C42 8 36 16 26 14 Z" fill="${LEAF}"/>
    <path d="M62 20 C70 10 80 12 82 20 C76 28 66 28 62 20 Z" fill="${LEAF_HI}"/>`,

  fanqie: `
    <circle cx="60" cy="80" r="32" fill="#c8452f" stroke="#8a2a1a" stroke-width="1.8"/>
    <path d="M42 62 C48 70 52 78 52 88" fill="none" stroke="#e07a5e" stroke-width="3" opacity=".5"/>
    <g fill="${LEAF}">
      <path d="M60 48 C52 44 46 46 42 52 C50 54 56 54 60 52 Z"/>
      <path d="M60 48 C68 44 74 46 78 52 C70 54 64 54 60 52 Z"/>
      <path d="M60 46 C56 38 56 32 60 26 C64 32 64 40 60 46 Z"/>
      <path d="M58 48 C50 42 42 38 34 38 C40 46 50 50 58 50 Z" opacity=".9"/>
      <path d="M62 48 C70 42 78 38 86 38 C80 46 70 50 62 50 Z" opacity=".9"/>
    </g>
    <path d="M60 26 L60 14" stroke="${STEM}" stroke-width="2.8" stroke-linecap="round"/>`,

  youcai: `
    <g fill="none" stroke="${STEM}" stroke-width="2.8" stroke-linecap="round">
      <path d="M60 116 L58 40"/>
      <path d="M59 78 C48 70 40 58 38 44"/>
      <path d="M59 70 C70 62 78 50 80 36"/>
    </g>
    <g fill="#e6c74e" stroke="#b89430" stroke-width="0.9">
      ${[[38, 40], [46, 28], [58, 20], [70, 26], [80, 34], [52, 44], [66, 40]].map(([x, y]) =>
    [0, 72, 144, 216].map(a => {
      const r = 5, rad = a * Math.PI / 180;
      return `<circle cx="${(x + Math.cos(rad) * r).toFixed(1)}" cy="${(y + Math.sin(rad) * r).toFixed(1)}" r="3.3"/>`;
    }).join('')).join('')}
    </g>
    <g fill="none" stroke="${LEAF}" stroke-width="3.4" stroke-linecap="round">
      <path d="M58 100 C50 96 44 88 42 78"/>
      <path d="M60 92 C68 88 74 80 76 70"/>
    </g>`,

  chashu: `
    <g fill="none" stroke="#6b5436" stroke-width="3" stroke-linecap="round">
      <path d="M28 108 C48 92 70 66 92 34"/>
    </g>
    <g fill="${LEAF}" stroke="#2f5426" stroke-width="1">
      <path d="M62 62 C60 44 70 26 88 20 C94 40 84 58 62 62 Z"/>
      <path d="M56 74 C40 70 26 56 24 38 C42 40 56 54 56 74 Z" fill="${LEAF_HI}"/>
      <path d="M78 40 C84 30 94 24 106 24 C102 36 92 44 78 40 Z" fill="${LEAF_HI}"/>
    </g>
    <g fill="none" stroke="#8fae63" stroke-width="1" opacity=".75">
      <path d="M64 60 C70 48 76 38 86 26"/>
      <path d="M54 72 C46 62 38 50 28 42"/>
    </g>
    <path d="M96 30 C100 20 108 14 116 14 C114 26 106 34 96 30 Z" fill="#8fae63"/>`,
};

/* ================= 改良卡图标（120×120，白描 + 单色底纹） ================= */

const IMP_ART = {
  dimo: `<path d="M18 92 Q60 62 102 92 Z" fill="#cfe3d2" stroke="${JADE}" stroke-width="2"/>
    <g fill="none" stroke="${JADE}" stroke-width="2.2"><path d="M30 92 L30 66 M60 92 L60 54 M90 92 L90 66"/></g>
    <path d="M24 62 Q60 34 96 62" fill="none" stroke="#8fb0a8" stroke-width="2.4" stroke-dasharray="5 4"/>`,
  diguan: `<path d="M18 46 L102 46" stroke="#5f8fa8" stroke-width="4" stroke-linecap="round"/>
    <path d="M40 46 L40 60 M64 46 L64 60 M88 46 L88 60" stroke="#5f8fa8" stroke-width="3" stroke-linecap="round"/>
    <g fill="#7fb0c8"><path d="M40 66 C46 76 46 84 40 88 C34 84 34 76 40 66 Z"/>
      <path d="M64 70 C70 80 70 88 64 92 C58 88 58 80 64 70 Z"/>
      <path d="M88 66 C94 76 94 84 88 88 C82 84 82 76 88 66 Z"/></g>`,
  jixiehua: `<g fill="none" stroke="${INK2}" stroke-width="2.4">
      <circle cx="46" cy="62" r="18"/><circle cx="46" cy="62" r="7"/>
      ${Array.from({ length: 8 }, (_, i) => {
    const a = i * 45 * Math.PI / 180;
    return `<path d="M${46 + Math.cos(a) * 18},${62 + Math.sin(a) * 18} L${46 + Math.cos(a) * 25},${62 + Math.sin(a) * 25}"/>`;
  }).join('')}
    </g>
    <path d="M70 84 L82 96 M78 66 L104 66 M92 66 L92 88" stroke="${CIN}" stroke-width="2.6" stroke-linecap="round"/>`,
  nongyao: `<path d="M46 40 L46 30 L74 30 L74 40" fill="none" stroke="${INK2}" stroke-width="2.6"/>
    <rect x="38" y="40" width="44" height="52" rx="6" fill="#e6dfc8" stroke="${INK2}" stroke-width="2.4"/>
    <path d="M74 26 L96 14" stroke="${INK2}" stroke-width="2.6" stroke-linecap="round"/>
    <g fill="#7fb0c8"><circle cx="100" cy="20" r="3"/><circle cx="106" cy="30" r="3"/><circle cx="94" cy="34" r="3"/></g>
    <path d="M50 56 L70 56 M50 68 L70 68" stroke="#a8b8a0" stroke-width="2.2"/>`,
  zengchan: `<path d="M30 96 L84 42" stroke="${JADE}" stroke-width="4" stroke-linecap="round"/>
    <path d="M70 30 L92 24 L86 46 Z" fill="${JADE}"/>
    <path d="M34 60 Q46 46 62 50" fill="none" stroke="${LEAF}" stroke-width="2.4"/>
    <path d="M34 76 C26 66 28 52 40 48 C46 60 44 72 34 76 Z" fill="${LEAF}"/>`,
  youjifei: `<ellipse cx="60" cy="76" rx="36" ry="20" fill="#7a5a3a" stroke="#4f3a24" stroke-width="2"/>
    <path d="M60 56 C52 44 52 30 60 20 C68 30 68 44 60 56 Z" fill="${LEAF}"/>
    <path d="M60 56 C48 52 38 42 36 30 C50 32 60 42 60 56 Z" fill="${LEAF_HI}"/>
    <g fill="#a8865a"><circle cx="46" cy="74" r="3"/><circle cx="62" cy="80" r="3"/><circle cx="76" cy="72" r="3"/></g>`,
  fuhefei: `<rect x="34" y="42" width="52" height="54" rx="7" fill="#e8dcbc" stroke="${INK2}" stroke-width="2.4"/>
    <path d="M34 58 L86 58" stroke="${INK2}" stroke-width="1.6" opacity=".5"/>
    <text x="60" y="82" font-family="${KAI}" font-size="20" fill="${CIN}" text-anchor="middle">肥</text>
    <circle cx="60" cy="30" r="9" fill="#d9c493" stroke="${INK2}" stroke-width="1.8"/>`,
  qiyuan: `<path d="M16 66 Q32 44 48 66 Q64 88 80 66 Q92 50 104 62"
      fill="none" stroke="${CIN}" stroke-width="5" stroke-linecap="round" opacity=".8"/>
    <path d="M12 88 L108 88" stroke="#8a6a3a" stroke-width="3" stroke-linecap="round"/>
    <path d="M24 88 q6,-8 12,0 M60 88 q6,-8 12,0" fill="none" stroke="#a8865a" stroke-width="2"/>`,
  fuzhi: `<path d="M18 92 L102 92 L96 64 L24 64 Z" fill="#4f3a24"/>
    <path d="M24 64 L96 64 L92 44 L28 44 Z" fill="#6b5236"/>
    <path d="M28 44 L92 44 L88 26 L32 26 Z" fill="#8a6a44"/>
    <path d="M44 18 q8,-8 16,0 q8,-8 16,0" fill="none" stroke="${LEAF}" stroke-width="2.4" stroke-linecap="round"/>`,
  cetu: `<rect x="36" y="24" width="48" height="66" rx="6" fill="#eef4f2" stroke="${INK2}" stroke-width="2.2"/>
    <path d="M36 62 L84 62 L84 84 Q84 90 78 90 L42 90 Q36 90 36 84 Z" fill="#8a6a3a"/>
    <path d="M50 24 L50 18 M70 24 L70 18" stroke="${INK2}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M48 44 L72 44 M48 52 L64 52" stroke="#b8c4bc" stroke-width="2"/>`,
  ph: `<circle cx="60" cy="62" r="30" fill="#eef4f2" stroke="${INK2}" stroke-width="2.4"/>
    <path d="M60 62 L60 40" stroke="${CIN}" stroke-width="3" stroke-linecap="round"/>
    <text x="60" y="86" font-family="${SONG}" font-size="15" fill="${INK2}" text-anchor="middle">pH</text>
    <g fill="${INK3}"><circle cx="40" cy="50" r="2"/><circle cx="80" cy="50" r="2"/><circle cx="60" cy="34" r="2"/></g>`,
  tudihuli: `<path d="M22 88 Q60 62 98 88 Z" fill="#8a6a3a"/>
    <path d="M44 88 L44 50 L52 50 L52 88 Z" fill="#6b5236"/>
    <path d="M38 50 L58 50 L48 34 Z" fill="${INK2}"/>
    <path d="M70 74 C64 60 72 46 86 44 C88 60 82 72 70 74 Z" fill="${LEAF}"/>`,
};

/* ================= 对外：土地卡 ================= */

/** 土地卡（400 × 300 横版） */
export function landCard(land) {
  const p = SCENE_P[land.id] || SCENE_P.heilitu;
  const W = 400, H = 300;
  const infoX = 218;
  const nameSize = land.name.length >= 4 ? 26 : 31;
  const rows = [
    ['健康度', `${land.fertility}（可种 ${land.plots} 片）`],
    ['质地', land.texture],
    ['酸碱度', land.ph.replace(/^pH\s*/, '')],
  ];
  const rowsHtml = rows.map(([k, v], i) => {
    const y = 172 + i * 26;
    return `<text x="${infoX}" y="${y}" font-family="${SONG}" font-size="11.5" fill="${INK3}">${esc(k)}</text>
      <text x="${infoX + 50}" y="${y}" font-family="${SONG}" font-size="13" fill="${INK}">${esc(v)}</text>`;
  }).join('');

  return cardUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${paper(W, H, land.name.length + 3)}
    ${frame(W, H)}
    <g transform="translate(28,56)">
      <clipPath id="sc"><rect width="172" height="129" rx="3"/></clipPath>
      <g clip-path="url(#sc)">${scene(p.kind, p)}</g>
      <rect x="-0.5" y="-0.5" width="173" height="130" rx="3" fill="none"
            stroke="${INK}" stroke-width="1.6" opacity=".7"/>
    </g>
    <text x="${infoX}" y="30" font-family="${SONG}" font-size="11" fill="${GOLD}"
          letter-spacing="3">土 壤 信 息 卡</text>
    <text x="${infoX}" y="68" font-family="${KAI}" font-size="${nameSize}" fill="${INK}"
          letter-spacing="2">${esc(land.name)}</text>
    <path d="M${infoX},80 L${W - 34},80" stroke="${GOLD}" stroke-width="1.1" opacity=".65"/>

    <g transform="translate(${infoX},94)">
      <circle cx="10" cy="10" r="10" fill="${GOLD}" opacity=".18" stroke="${GOLD}" stroke-width="1"/>
      <text x="10" y="10.5" font-family="${SONG}" font-size="11.5" fill="${GOLD}"
            text-anchor="middle" dominant-baseline="central">币</text>
      <text x="28" y="11" font-family="${KAI}" font-size="24" fill="${CIN}"
            dominant-baseline="central">${land.price}</text>
      <text x="${28 + String(land.price).length * 14 + 5}" y="12" font-family="${SONG}"
            font-size="11" fill="${INK3}" dominant-baseline="central">肥力币</text>
    </g>

    ${rowsHtml}
    <text x="${infoX}" y="${172 + 3 * 26 + 2}" font-family="${SONG}" font-size="10.5"
          fill="${INK3}">${esc(land.region)}</text>

    ${seal(W - 46, 56, 34, '土')}

    <text x="30" y="${H - 30}" font-family="${SONG}" font-size="11" fill="${INK3}">适配作物</text>
    <text x="86" y="${H - 30}" font-family="${KAI}" font-size="13.5" fill="${JADE}">${esc(land.crops.join('　'))}</text>
  </svg>`);
}

/** 土地卡缩略（160 × 120，给列表用：只留地貌 + 地名） */
export function landMini(land) {
  const p = SCENE_P[land.id] || SCENE_P.heilitu;
  const W = 160, H = 120;
  return cardUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <clipPath id="sc"><rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="3"/></clipPath>
    <g clip-path="url(#sc)" transform="translate(3,3) scale(${(W - 6) / 200},${(H - 6) / 150})">
      ${scene(p.kind, p)}
    </g>
    <rect x="3.5" y="3.5" width="${W - 7}" height="${H - 7}" rx="3" fill="none"
          stroke="${INK}" stroke-width="1.6" opacity=".8"/>
    <rect x="2" y="${H - 30}" width="${W - 4}" height="28" fill="#fdf9ee" opacity=".84"/>
    <text x="${W / 2}" y="${H - 15}" font-family="${KAI}" font-size="15" fill="${INK}"
          text-anchor="middle" dominant-baseline="central" letter-spacing="1">${esc(land.name)}</text>
  </svg>`);
}

/* ================= 对外：作物卡 ================= */

/** 作物卡（240 × 340 竖版） */
export function cropCard(crop) {
  const W = 240, H = 340;
  const art = CROP_ART[crop.id];
  const nameSize = crop.name.length > 2 ? 26 : 30;
  return cardUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${paper(W, H, crop.name.length + 11)}
    ${frame(W, H)}

    <text x="${W / 2}" y="40" font-family="${KAI}" font-size="${nameSize}" fill="${INK}"
          text-anchor="middle" letter-spacing="3">${esc(crop.name)}</text>
    <path d="M40,52 L${W - 40},52" stroke="${GOLD}" stroke-width="1" opacity=".55"/>

    ${art ? `<g transform="translate(${(W - 120) / 2},54)">${art}</g>` : ''}

    <path d="M28,200 L${W - 28},200" stroke="${GOLD}" stroke-width="1" opacity=".5"/>

    <text x="34" y="222" font-family="${SONG}" font-size="11" fill="${INK3}">种子成本</text>
    <text x="${W - 34}" y="224" font-family="${KAI}" font-size="19" fill="${CIN}"
          text-anchor="end">${crop.cost}<tspan font-family="${SONG}" font-size="10"
          fill="${INK3}" dx="3">币</tspan></text>

    <g>
      <rect x="26" y="240" width="90" height="64" rx="4" fill="#eef4ea" stroke="#8fb07a" stroke-width="1.2"/>
      <text x="71" y="258" font-family="${SONG}" font-size="9.5" fill="#4f7038"
            text-anchor="middle">高收 · ${esc(crop.goodSoil)}</text>
      <text x="71" y="290" font-family="${KAI}" font-size="25" fill="#3d6b2c"
            text-anchor="middle">${crop.good}</text>
    </g>
    <g>
      <rect x="124" y="240" width="90" height="64" rx="4" fill="#f8ece9" stroke="#d09a90" stroke-width="1.2"/>
      <text x="169" y="258" font-family="${SONG}" font-size="9.5" fill="#9a4a3a"
            text-anchor="middle">低收 · ${esc(crop.badSoil)}</text>
      <text x="169" y="290" font-family="${KAI}" font-size="25" fill="#a03028"
            text-anchor="middle">${crop.bad}</text>
    </g>

    ${seal(W - 40, 40, 30, '禾')}
  </svg>`);
}

/* ================= 对外：改良卡 ================= */

/** 改良卡（140 × 196 竖版，手牌尺寸） */
export function improveCard(imp) {
  const W = 140, H = 196;
  const art = IMP_ART[imp.id];
  const short = imp.name.length > 5 ? imp.name.slice(0, 5) : imp.name;
  return cardUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${paper(W, H, imp.name.length + 5)}
    ${frame(W, H)}

    <text x="${W / 2}" y="34" font-family="${KAI}" font-size="17" fill="${INK}"
          text-anchor="middle" letter-spacing="1.5">${esc(short)}</text>
    <path d="M26,44 L${W - 26},44" stroke="${GOLD}" stroke-width="0.9" opacity=".5"/>

    ${art ? `<g transform="translate(${(W - 120) / 2},52) scale(0.62)">${art}</g>` : ''}

    <text x="${W / 2}" y="146" font-family="${SONG}" font-size="10" fill="${INK3}"
          text-anchor="middle">${esc(imp.station)}</text>
    <g transform="translate(${W / 2 - 30},154)">
      <rect width="60" height="24" rx="12" fill="${CIN}" opacity=".12" stroke="${CIN}"
            stroke-width="1" stroke-opacity=".6"/>
      <text x="30" y="13" font-family="${KAI}" font-size="15" fill="${CIN}"
            text-anchor="middle" dominant-baseline="central">+${imp.value}</text>
    </g>
  </svg>`);
}

/* ================= 对外：站点格图标（图板上叠的圆形小徽） ================= */

const STATION_P = {
  start: { txt: '起', c: '#d0392b' },
  qixiang: { txt: '气', c: '#4a9bd8' },
  nongji: { txt: '改', c: '#59a85a' },
  zhongzi: { txt: '种', c: '#d8a03a' },
  jianyu: { txt: '狱', c: '#4a4a52' },
};

/** 站点徽标（72 × 72 圆形） */
export function stationBadge(kind) {
  const p = STATION_P[kind];
  if (!p) return null;
  const S = 72, c = S / 2;
  return cardUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <circle cx="${c}" cy="${c}" r="${c - 3}" fill="#fdf9ee" opacity=".95" stroke="${p.c}" stroke-width="2.5"/>
    <circle cx="${c}" cy="${c}" r="${c - 8}" fill="none" stroke="${p.c}" stroke-width="0.8" opacity=".5"/>
    <text x="${c}" y="${c + 1}" font-family="${KAI}" font-size="30" fill="${p.c}"
          text-anchor="middle" dominant-baseline="central">${p.txt}</text>
  </svg>`);
}

/* ================= 对外：图板赛道格贴片 ================= */

/**
 * 把 200×150 的地貌小景完整铺进一个宽 sw 高 sh 的框里（等比，居中）。
 * 不裁切 —— 裁地平线会把黑土、雪原这类深沉地貌裁成一整块色板。
 */
function sceneFit(kind, p, sw, sh) {
  const sc = Math.min(sw / 200, sh / 150);
  const tx = (sw - 200 * sc) / 2;
  const ty = (sh - 150 * sc) / 2;
  return `<g clip-path="url(#cs)">
      <rect width="${sw.toFixed(1)}" height="${sh.toFixed(1)}" fill="#f2ead6"/>
      <g transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${sc.toFixed(4)})">
        ${scene(kind, p)}
      </g>
    </g>
    <rect x=".5" y=".5" width="${(sw - 1).toFixed(1)}" height="${(sh - 1).toFixed(1)}" rx="4"
          fill="none" stroke="${INK}" stroke-width="1" opacity=".45"/>`;
}

/** 估算一段中英混排文字的像素宽（全角按 1.0em，半角按 0.55em） */
function textWidth(s, size) {
  let w = 0;
  for (const ch of String(s)) {
    w += /[\x00-\xff]/.test(ch) ? size * 0.55 : size;
  }
  return w;
}

/** 按可用宽度截断，超出加省略号 */
function fitText(s, size, maxW) {
  s = String(s == null ? '' : s);
  if (textWidth(s, size) <= maxW) return s;
  let out = '';
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break;
    out += ch;
  }
  return out + '…';
}

/**
 * 把图板上的一格重绘成国风样式（盖住原始卡通插画）。
 * 尺寸按实测矩形传进来，返回 data URI。
 *
 * @param {object} cell  TRACK 中的一格（附 land / station）
 * @param {number} w     格子像素宽（图板原始尺度）
 * @param {number} h     格子像素高
 */
export function cellTile(cell, w, h) {
  const W = Math.round(w), H = Math.round(h);
  const portrait = H > W * 1.25;          // 上下两行为竖版，左右两列为横版
  const land = cell.kind === 'land' ? cell.land : null;
  const st = cell.kind === 'land' ? null : (STATION_P[cell.kind] || STATION_P.start);

  /* 底：宣纸 + 墨线框。
     不透明：外圈 32 格压在**原图的印刷卡面**上，需要盖住底下的插画，
     不能透。中心的地图是独立的 <img>，与这里的透明度无关。 */
  const pad = Math.round(Math.min(W, H) * 0.055);
  const seed = (land ? land.name.length : 3) + 2;
  const base = `
  <defs>
    <linearGradient id="cp" x1="0" y1="0" x2="0.25" y2="1">
      <stop offset="0" stop-color="${PAPER1}"/>
      <stop offset="1" stop-color="${PAPER2}"/>
    </linearGradient>
    <filter id="cg" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="${seed}" result="n"/>
      <feColorMatrix in="n" type="matrix"
        values="0 0 0 0 0.40  0 0 0 0 0.33  0 0 0 0 0.22  0 0 0 0.06 0"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#cp)"/>
  <rect width="${W}" height="${H}" filter="url(#cg)"/>
    <rect x="${pad * .5}" y="${pad * .5}" width="${W - pad}" height="${H - pad}" rx="${pad * .45}"
          fill="none" stroke="${INK}" stroke-width="1.8" opacity=".7"/>`;

  let inner = '';

  if (land) {
    /* ---------- 土地格：地貌小景 + 土名 + 地价 + 肥力 ---------- */
    const p = SCENE_P[land.id] || SCENE_P.heilitu;

    if (portrait) {
      const sw = W * 0.84, sh = sw * 0.75;
      const sx = (W - sw) / 2, sy = H * 0.07;
      /* 土名要适应宽度：「青藏草甸土」5 个字，宽版格子放不下会溢出。
         字号按可用宽反推，并用 fitText 兜底加省略号。 */
      const nameMaxW = W * 0.86;
      const nameSize = Math.min(W * 0.17, 34, nameMaxW / land.name.length);
      const landName = fitText(land.name, nameSize, nameMaxW);
      const priceSize = Math.min(W * 0.15, 30);
      const fSize = Math.min(W * 0.10, 19);

      inner = `
        <g transform="translate(${sx.toFixed(1)},${sy.toFixed(1)})">
          <clipPath id="cs"><rect width="${sw.toFixed(1)}" height="${sh.toFixed(1)}" rx="4"/></clipPath>
          ${sceneFit(p.kind, p, sw, sh)}
        </g>
        <text x="${W / 2}" y="${(H * 0.595).toFixed(1)}" font-family="${KAI}"
              font-size="${nameSize.toFixed(1)}" fill="${INK}" text-anchor="middle"
              letter-spacing="1">${esc(landName)}</text>
        <g transform="translate(${W / 2},${(H * 0.705).toFixed(1)})">
          <circle cx="${(-priceSize * 0.95).toFixed(1)}" cy="0" r="${(priceSize * 0.42).toFixed(1)}"
                  fill="${GOLD}" opacity=".2" stroke="${GOLD}" stroke-width="1"/>
          <text x="${(-priceSize * 0.95).toFixed(1)}" y="1" font-family="${SONG}"
                font-size="${(priceSize * 0.5).toFixed(1)}" fill="${GOLD}" text-anchor="middle"
                dominant-baseline="central">币</text>
          <text x="${(-priceSize * 0.15).toFixed(1)}" y="0" font-family="${KAI}"
                font-size="${priceSize.toFixed(1)}" fill="${CIN}"
                dominant-baseline="central">${land.price}</text>
        </g>
        <text x="${W / 2}" y="${(H * 0.805).toFixed(1)}" font-family="${SONG}"
              font-size="${fSize.toFixed(1)}" fill="${INK3}" text-anchor="middle">
          ${esc(land.fertility)}肥力 · 种 ${land.plots} 片</text>`;

    } else {
      const sw = H * 0.86, sh = sw * 0.75;
      const sx = W * 0.045, sy = (H - sh) / 2;
      const textX = sx + sw + W * 0.05;
      const availW = W - textX - pad * 1.6;
      const nameSize = Math.min(H * 0.20, 31, availW / land.name.length);
      const priceSize = Math.min(H * 0.17, 27);
      const fSize = Math.min(H * 0.105, 17);

      inner = `
        <g transform="translate(${sx.toFixed(1)},${sy.toFixed(1)})">
          <clipPath id="cs"><rect width="${sw.toFixed(1)}" height="${sh.toFixed(1)}" rx="4"/></clipPath>
          ${sceneFit(p.kind, p, sw, sh)}
        </g>
        <text x="${textX.toFixed(1)}" y="${(H * 0.40).toFixed(1)}" font-family="${KAI}"
              font-size="${nameSize.toFixed(1)}" fill="${INK}" letter-spacing="1">${esc(fitText(land.name, nameSize, availW))}</text>
        <g transform="translate(${textX.toFixed(1)},${(H * 0.60).toFixed(1)})">
          <circle cx="${(priceSize * 0.42).toFixed(1)}" cy="0" r="${(priceSize * 0.42).toFixed(1)}"
                  fill="${GOLD}" opacity=".2" stroke="${GOLD}" stroke-width="1"/>
          <text x="${(priceSize * 0.42).toFixed(1)}" y="1" font-family="${SONG}"
                font-size="${(priceSize * 0.5).toFixed(1)}" fill="${GOLD}" text-anchor="middle"
                dominant-baseline="central">币</text>
          <text x="${(priceSize * 1.1).toFixed(1)}" y="0" font-family="${KAI}"
                font-size="${priceSize.toFixed(1)}" fill="${CIN}"
                dominant-baseline="central">${land.price}</text>
        </g>
        <text x="${textX.toFixed(1)}" y="${(H * 0.79).toFixed(1)}" font-family="${SONG}"
              font-size="${fSize.toFixed(1)}" fill="${INK3}">${esc(land.fertility)}肥力 · 种 ${land.plots} 片</text>`;
    }

  } else {
    /* ---------- 站点格：印章 + 站名 + 短说明 ---------- */
    const stName = cell.station ? cell.station.name : '起点';
    const stDesc = cell.station ? cell.station.desc : '';

    if (portrait) {
      const sealS = Math.min(W * 0.46, H * 0.24);
      const nameSize = Math.min(W * 0.16, 32, (W * 0.88) / stName.length);
      const dSize = Math.min(W * 0.088, 16);
      const short = fitText(stDesc, dSize, W * 0.88);
      const cy = H * 0.29;
      inner = `
        <g>
          <rect x="${(W / 2 - sealS / 2).toFixed(1)}" y="${(cy - sealS / 2).toFixed(1)}"
                width="${sealS.toFixed(1)}" height="${sealS.toFixed(1)}" rx="${(sealS * .16).toFixed(1)}"
                fill="${st.c}" opacity=".92"/>
          <rect x="${(W / 2 - sealS / 2 + 3).toFixed(1)}" y="${(cy - sealS / 2 + 3).toFixed(1)}"
                width="${(sealS - 6).toFixed(1)}" height="${(sealS - 6).toFixed(1)}"
                rx="${(sealS * .11).toFixed(1)}" fill="none" stroke="#fff8ea"
                stroke-opacity=".55" stroke-width="1.2"/>
          <text x="${W / 2}" y="${cy + 1}" font-family="${KAI}"
                font-size="${(sealS * .58).toFixed(1)}" fill="#fff8ea"
                text-anchor="middle" dominant-baseline="central">${st.txt}</text>
        </g>
        <text x="${W / 2}" y="${(H * 0.545).toFixed(1)}" font-family="${KAI}"
              font-size="${nameSize.toFixed(1)}" fill="${INK}" text-anchor="middle"
              letter-spacing="1">${esc(stName)}</text>
        <text x="${W / 2}" y="${(H * 0.645).toFixed(1)}" font-family="${SONG}"
              font-size="${dSize.toFixed(1)}" fill="${INK3}" text-anchor="middle">${esc(short)}</text>
        ${cell.kind === 'start' ? `<text x="${W / 2}" y="${(H * 0.80).toFixed(1)}"
              font-family="${KAI}" font-size="${(nameSize * .85).toFixed(1)}" fill="${CIN}"
              text-anchor="middle">经过 +50</text>` : ''}`;

    } else {
      const sealS = Math.min(H * 0.54, W * 0.22);
      const sx = W * 0.05, cy = H / 2;
      const textX = sx + sealS + W * 0.055;
      const availW = W - textX - pad * 1.4;
      const nameSize = Math.min(H * 0.19, 30, availW / stName.length);
      const dSize = Math.min(H * 0.10, 15);
      const short = fitText(stDesc, dSize, availW);
      inner = `
        <g>
          <rect x="${sx.toFixed(1)}" y="${(cy - sealS / 2).toFixed(1)}"
                width="${sealS.toFixed(1)}" height="${sealS.toFixed(1)}" rx="${(sealS * .16).toFixed(1)}"
                fill="${st.c}" opacity=".92"/>
          <rect x="${(sx + 2.5).toFixed(1)}" y="${(cy - sealS / 2 + 2.5).toFixed(1)}"
                width="${(sealS - 5).toFixed(1)}" height="${(sealS - 5).toFixed(1)}"
                rx="${(sealS * .11).toFixed(1)}" fill="none" stroke="#fff8ea"
                stroke-opacity=".55" stroke-width="1.1"/>
          <text x="${(sx + sealS / 2).toFixed(1)}" y="${cy + 1}" font-family="${KAI}"
                font-size="${(sealS * .58).toFixed(1)}" fill="#fff8ea"
                text-anchor="middle" dominant-baseline="central">${st.txt}</text>
        </g>
        <text x="${textX.toFixed(1)}" y="${(H * 0.42).toFixed(1)}" font-family="${KAI}"
              font-size="${nameSize.toFixed(1)}" fill="${INK}" letter-spacing="1">${esc(stName)}</text>
        <text x="${textX.toFixed(1)}" y="${(H * 0.62).toFixed(1)}" font-family="${SONG}"
              font-size="${dSize.toFixed(1)}" fill="${INK3}">${esc(short)}</text>
        ${cell.kind === 'start' ? `<text x="${textX.toFixed(1)}" y="${(H * 0.80).toFixed(1)}"
              font-family="${KAI}" font-size="${(dSize * 1.15).toFixed(1)}" fill="${CIN}">经过 +50</text>` : ''}`;
    }
  }

  return cardUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"
      viewBox="0 0 ${W} ${H}">${base}${inner}</svg>`);
}

/* ================= 对外：图板卡位牌 ================= */

/**
 * 图板中央原本印着三张手绘说明卡（土壤改良卡 / 气象卡 / 土壤信息卡），
 * 用来示意「这套牌的卡堆放这里」。这里换成国风牌位：
 * 主题色卡背 + 两张微旋转的宣纸片 + 墨框回纹 + 朱砂印。
 *
 * @param {'improve'|'weather'|'info'} kind
 * @param {number} w 卡位外框宽（图板原始尺度像素）
 * @param {number} h 卡位外框高
 */
export function deckSlot(kind, w, h) {
  const W = Math.round(w), H = Math.round(h);
  const P = SLOT_P[kind] || SLOT_P.improve;
  const portrait = H > W * 1.15;              // 信息卡是竖版，另两张横版

  /* 两张微旋转的宣纸片，交错叠出「一摞卡」的感觉 */
  const aw = W - 24, ah = H - 24;
  const bw = W - 40, bh = H - 40;
  const bx = (W - bw) / 2, by = (H - bh) / 2;

  /* 顶层纸片上的内容（坐标系以纸片左上角为原点，画完 translate 过去） */
  let inner = '';

  if (portrait) {
    /* ---------- 竖版（土壤信息卡）：三行大字 ---------- */
    const lines = ['土壤', '信息', '卡'];
    const fs = Math.min(bw * 0.30, (bh - 34) / 3.35);
    const lh = fs * 1.24;
    const y0 = bh * 0.455 - (lines.length - 1) * lh / 2;
    const body = lines.map((ln, i) =>
      `<text x="${bw / 2}" y="${(y0 + i * lh).toFixed(1)}" font-family="${KAI}"
             font-size="${fs.toFixed(1)}" fill="${INK}" text-anchor="middle"
             dominant-baseline="central" letter-spacing="${(fs * .06).toFixed(1)}">${esc(ln)}</text>`
    ).join('');
    /* 底部一小行说明 + 右下朱砂印 */
    const subSize = Math.min(fs * 0.30, 12);
    inner = `
      ${slotMotif(kind, bw, bh, 0.085)}
      ${slotCorners(bw, bh)}
      ${body}
      <text x="${bw / 2}" y="${(bh - 16).toFixed(1)}" font-family="${SONG}"
            font-size="${subSize.toFixed(1)}" fill="${INK3}" text-anchor="middle"
            letter-spacing="1">读 土 知 地</text>
      ${seal(bw - 21, bh - 21, Math.min(24, bw * 0.16), P.seal)}`;

  } else {
    /* ---------- 横版（改良卡 / 气象卡）：一行大字 ---------- */
    const t = P.title;
    const fs = Math.min(bh * 0.30, (bw - 30) / (t.length + 0.25));
    const subSize = Math.min(fs * 0.34, 13);
    inner = `
      ${slotMotif(kind, bw, bh, 0.095)}
      ${slotCorners(bw, bh)}
      <text x="${bw / 2}" y="${(bh * 0.475).toFixed(1)}" font-family="${KAI}"
            font-size="${fs.toFixed(1)}" fill="${INK}" text-anchor="middle"
            dominant-baseline="central" letter-spacing="${(fs * .08).toFixed(1)}">${esc(t)}</text>
      <line x1="${(bw * 0.24).toFixed(1)}" y1="${(bh * 0.70).toFixed(1)}"
            x2="${(bw * 0.76).toFixed(1)}" y2="${(bh * 0.70).toFixed(1)}"
            stroke="${GOLD}" stroke-width="1" opacity=".7"/>
      <text x="${bw / 2}" y="${(bh * 0.79).toFixed(1)}" font-family="${SONG}"
            font-size="${subSize.toFixed(1)}" fill="${INK3}" text-anchor="middle"
            letter-spacing="1">${esc(P.sub)}</text>
      ${seal(bw - 20, 20, Math.min(24, bh * 0.17), P.seal)}`;
  }

  return cardUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"
      viewBox="0 0 ${W} ${H}">
    <!-- 卡背底板 -->
    <rect x=".6" y=".6" width="${W - 1.2}" height="${H - 1.2}" rx="7"
          fill="${P.back}" stroke="${P.back2}" stroke-width="1.2"/>
    <rect x="4.5" y="4.5" width="${W - 9}" height="${H - 9}" rx="5"
          fill="none" stroke="#fff8ea" stroke-opacity=".20" stroke-width="1"/>
    <!-- 下层纸片（微旋转） -->
    <g transform="rotate(-2.3 ${W / 2} ${H / 2})">
      <rect x="${(W - aw) / 2}" y="${(H - ah) / 2}" width="${aw}" height="${ah}" rx="5"
            fill="#f0e7d3" stroke="${INK}" stroke-opacity=".38" stroke-width="1"/>
    </g>
    <!-- 上层纸片 -->
    <g transform="translate(${bx.toFixed(1)},${by.toFixed(1)}) rotate(1.4 ${(bw / 2).toFixed(1)} ${(bh / 2).toFixed(1)})">
      ${paper(bw, bh, kind.length + 7)}
      <rect x="4" y="4" width="${bw - 8}" height="${bh - 8}" rx="3.5" fill="none"
            stroke="${INK}" stroke-width="1.5" opacity=".72"/>
      <rect x="8.5" y="8.5" width="${bw - 17}" height="${bh - 17}" rx="2.5" fill="none"
            stroke="${INK}" stroke-width=".6" opacity=".38"/>
      ${inner}
    </g>
  </svg>`);
}

const SLOT_P = {
  improve: { back: '#4e7350', back2: '#38533b', title: '土壤改良卡', sub: '改土增肥 · 因土制宜', seal: '改' },
  weather: { back: '#3f6f9e', back2: '#2d527a', title: '气象卡', sub: '阴晴雨雪 · 天时难测', seal: '气' },
  info: { back: '#9b6a3a', back2: '#754c25', title: '土壤信息卡', sub: '读 土 知 地', seal: '土' },
};

/** 纸片四角的回纹（简化版，尺寸随纸片） */
function slotCorners(w, h) {
  const c = `<g fill="none" stroke="${GOLD}" stroke-width="1" opacity=".85">
      <path d="M0,12 L0,0 L12,0"/>
      <path d="M3.5,8.5 L3.5,3.5 L8.5,3.5"/>
    </g>`;
  const m = 9;
  return `
    <g transform="translate(${m},${m})">${c}</g>
    <g transform="translate(${w - m},${m}) scale(-1,1)">${c}</g>
    <g transform="translate(${m},${h - m}) scale(1,-1)">${c}</g>
    <g transform="translate(${w - m},${h - m}) scale(-1,-1)">${c}</g>`;
}

/** 主题淡纹：改良=禾苗，气象=云雨，信息=田垄。opacity 低，压在文字下面 */
function slotMotif(kind, w, h, op) {
  const s = Math.min(w, h) * 0.62 / 100;      // 纹样按 100×100 画好后缩放
  let art = '';
  if (kind === 'improve') {
    art = `<g stroke="${JADE}" stroke-width="3.4" fill="none" stroke-linecap="round">
        <path d="M50,86 L50,40"/>
        <path d="M50,58 C34,54 26,42 28,26 C42,29 50,42 50,56" fill="${JADE}" fill-opacity=".55"/>
        <path d="M50,46 C66,42 74,30 72,14 C58,17 50,30 50,44" fill="${JADE}" fill-opacity=".55"/>
      </g>`;
  } else if (kind === 'weather') {
    art = `<g fill="#3f6f9e">
        <path d="M30,60 a14,14 0 0 1 1,-27 a17,17 0 0 1 32,-4 a12,12 0 0 1 13,13 a11,11 0 0 1 -4,18 z"/>
      </g>
      <g stroke="#3f6f9e" stroke-width="3.6" stroke-linecap="round" fill="none">
        <path d="M38,72 L33,86"/><path d="M52,74 L47,88"/><path d="M66,72 L61,86"/>
      </g>`;
  } else {
    art = `<g stroke="#9b6a3a" stroke-width="3.6" fill="none" stroke-linecap="round">
        <path d="M12,44 Q50,28 88,44"/>
        <path d="M12,62 Q50,46 88,62"/>
        <path d="M12,80 Q50,64 88,80"/>
      </g>`;
  }
  const tx = (w - 100 * s) / 2, ty = (h - 100 * s) / 2;
  return `<g opacity="${op}" transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${s.toFixed(4)})">${art}</g>`;
}