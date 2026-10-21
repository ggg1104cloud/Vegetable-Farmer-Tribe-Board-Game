/**
 * 四个部落标识 —— SVG 绘制，纯代码，无需外部素材。
 * 风格：优美国风立体（青铜鎏金 + 朱砂 + 石青），带高光与投影。
 */

/* ============================================================
   A 部落 · 华表（天安门华表：蟠龙、云板、承露盘）
   ============================================================ */
export const HUABIAO = `
<svg viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="hb-stone" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#e8e2d4"/>
      <stop offset=".35" stop-color="#fbf8f0"/>
      <stop offset=".6" stop-color="#ddd5c2"/>
      <stop offset="1" stop-color="#c8bfa8"/>
    </linearGradient>
    <linearGradient id="hb-gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#b8892e"/>
      <stop offset=".4" stop-color="#f0cf7a"/>
      <stop offset=".65" stop-color="#d9a63f"/>
      <stop offset="1" stop-color="#a5761f"/>
    </linearGradient>
    <linearGradient id="hb-red" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8c2a20"/>
      <stop offset=".4" stop-color="#c4453a"/>
      <stop offset="1" stop-color="#7a2019"/>
    </linearGradient>
  </defs>

  <!-- 投影 -->
  <ellipse cx="50" cy="124" rx="26" ry="4.5" fill="#000" opacity=".16"/>

  <!-- 须弥座底座 -->
  <rect x="24" y="108" width="52" height="15" rx="2" fill="url(#hb-stone)" stroke="#a89e88" stroke-width="1"/>
  <rect x="19" y="118" width="62" height="8" rx="2" fill="url(#hb-stone)" stroke="#a89e88" stroke-width="1"/>
  <!-- 座上仰莲 -->
  <path d="M32 108 q4-8 18-8 t18 8 z" fill="#e6dfd0" stroke="#b3a894" stroke-width="1"/>

  <!-- 柱身（华表主柱） -->
  <rect x="42" y="30" width="16" height="80" fill="url(#hb-stone)" stroke="#a89e88" stroke-width="1"/>
  <rect x="42" y="30" width="5" height="80" fill="#fff" opacity=".35"/>
  <!-- 蟠龙纹（朱砂缠绕） -->
  <path d="M43 40 q12 6 0 13 t0 13 q12 6 0 13 t0 13"
        fill="none" stroke="url(#hb-red)" stroke-width="3.4" stroke-linecap="round"/>
  <circle cx="43.5" cy="43" r="2" fill="url(#hb-gold)"/>
  <circle cx="56.5" cy="62" r="2" fill="url(#hb-gold)"/>
  <circle cx="43.5" cy="82" r="2" fill="url(#hb-gold)"/>

  <!-- 承露盘 + 蹲兽（华表顶端） -->
  <ellipse cx="50" cy="30" rx="15" ry="5" fill="url(#hb-gold)" stroke="#8a6416" stroke-width="1"/>
  <ellipse cx="50" cy="28.5" rx="9" ry="3" fill="#f2dca4"/>
  <!-- 蹲兽 -->
  <path d="M45 27 q0-9 5-9 t5 9 z" fill="url(#hb-gold)" stroke="#8a6416" stroke-width=".9"/>
  <circle cx="50" cy="19.5" r="2.4" fill="#f5e3b0" stroke="#8a6416" stroke-width=".7"/>
  <path d="M47.6 17.6 h4.8" stroke="#8a6416" stroke-width=".8"/>

  <!-- 云板（朝天吼） -->
  <path d="M50 24 q-11-4-11 2 t6 5" fill="none" stroke="url(#hb-gold)" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M50 24 q11-4 11 2 t-6 5" fill="none" stroke="url(#hb-gold)" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="37" cy="27" r="2.2" fill="#d9a63f"/>
  <circle cx="63" cy="27" r="2.2" fill="#d9a63f"/>
</svg>`;

/* ============================================================
   B 部落 · 三星堆面具（青铜纵目面具）
   ============================================================ */
export const SANXINGDUI_MASK = `
<svg viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sd-bronze" x1="0" y1="0" x2=".8" y2="1">
      <stop offset="0" stop-color="#6f8f6a"/>
      <stop offset=".3" stop-color="#4e7350"/>
      <stop offset=".55" stop-color="#87a67e"/>
      <stop offset=".75" stop-color="#3f6244"/>
      <stop offset="1" stop-color="#5d7d59"/>
    </linearGradient>
    <linearGradient id="sd-bronze2" x1="0" y1="0" x2="1" y2=".8">
      <stop offset="0" stop-color="#87a67e"/>
      <stop offset=".5" stop-color="#45694a"/>
      <stop offset="1" stop-color="#6f8f6a"/>
    </linearGradient>
    <linearGradient id="sd-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f2d891"/>
      <stop offset=".5" stop-color="#c9a24a"/>
      <stop offset="1" stop-color="#a5761f"/>
    </linearGradient>
  </defs>

  <ellipse cx="60" cy="104" rx="34" ry="5" fill="#000" opacity=".14"/>

  <!-- 面具主体 -->
  <path d="M60 8 C84 8 100 22 100 46 C100 68 86 90 60 98
           C34 90 20 68 20 46 C20 22 36 8 60 8 Z"
        fill="url(#sd-bronze)" stroke="#33513a" stroke-width="2"/>

  <!-- 高光 -->
  <path d="M60 12 C80 12 94 24 95 44 C84 32 72 24 58 22 C44 20 32 26 25 40
           C26 22 42 12 60 12 Z" fill="#a8c49c" opacity=".35"/>

  <!-- 纵目（凸出的圆柱眼） -->
  <g>
    <!-- 左目 -->
    <ellipse cx="40" cy="46" rx="13" ry="10" fill="#2d4432" stroke="#20301f" stroke-width="1.5"/>
    <ellipse cx="40" cy="45" rx="10" ry="7.6" fill="url(#sd-bronze2)"/>
    <circle cx="40" cy="44" r="4.6" fill="#172a1b"/>
    <circle cx="38.4" cy="42" r="1.7" fill="#dcecd8" opacity=".9"/>
    <!-- 右目 -->
    <ellipse cx="80" cy="46" rx="13" ry="10" fill="#2d4432" stroke="#20301f" stroke-width="1.5"/>
    <ellipse cx="80" cy="45" rx="10" ry="7.6" fill="url(#sd-bronze2)"/>
    <circle cx="80" cy="44" r="4.6" fill="#172a1b"/>
    <circle cx="78.4" cy="42" r="1.7" fill="#dcecd8" opacity=".9"/>
  </g>

  <!-- 夔龙形阔耳（两侧外扩） -->
  <path d="M20 44 C8 36 2 46 6 58 C9 68 18 66 20 58 Z"
        fill="url(#sd-bronze2)" stroke="#33513a" stroke-width="1.8"/>
  <path d="M100 44 C112 36 118 46 114 58 C111 68 102 66 100 58 Z"
        fill="url(#sd-bronze2)" stroke="#33513a" stroke-width="1.8"/>
  <path d="M13 48 q-3 8 2 12" fill="none" stroke="#a8c49c" stroke-width="1.6" opacity=".6"/>
  <path d="M107 48 q3 8-2 12" fill="none" stroke="#a8c49c" stroke-width="1.6" opacity=".6"/>

  <!-- 鼻梁 -->
  <path d="M60 34 L60 72" stroke="#33513a" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M57.5 40 L57.5 68" stroke="#a8c49c" stroke-width="1.2" opacity=".55"/>

  <!-- 阔口 -->
  <path d="M44 78 Q60 84 76 78" fill="none" stroke="#2d4432" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M48 81 Q60 85 72 81" fill="none" stroke="#a8c49c" stroke-width="1" opacity=".5"/>

  <!-- 额部菱形纹饰 -->
  <path d="M52 20 h16 l-8 8 z" fill="#c9a24a" opacity=".7"/>
  <circle cx="60" cy="16" r="3" fill="#d9b45c" stroke="#8a6416" stroke-width=".8"/>
</svg>`;

/* ============================================================
   C 部落 · 琵琶（曲项、四弦、面覆桐木）
   ============================================================ */
export const PIPA = `
<svg viewBox="0 0 110 130" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="pp-wood" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8a5a2e"/>
      <stop offset=".28" stop-color="#d4a05c"/>
      <stop offset=".5" stop-color="#b8843f"/>
      <stop offset=".78" stop-color="#8f6030"/>
      <stop offset="1" stop-color="#6b4620"/>
    </linearGradient>
    <linearGradient id="pp-face" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#c99a5e"/>
      <stop offset=".35" stop-color="#f0d6a4"/>
      <stop offset=".6" stop-color="#e0be84"/>
      <stop offset="1" stop-color="#a87c42"/>
    </linearGradient>
    <linearGradient id="pp-jade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9fd0bd"/>
      <stop offset="1" stop-color="#4e8f78"/>
    </linearGradient>
    <linearGradient id="pp-jade2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c8e8d8"/>
      <stop offset="1" stop-color="#6aa892"/>
    </linearGradient>
  </defs>

  <ellipse cx="56" cy="126" rx="26" ry="4" fill="#000" opacity=".16"/>

  <!-- 曲项（琴头，向后弯） -->
  <path d="M52 8 C46 2 34 4 33 12 C32 20 40 24 47 22
           C52 21 54 16 52 8 Z"
        fill="url(#pp-wood)" stroke="#5e3d1c" stroke-width="1.6"/>
  <path d="M48 10 C43 6 37 8 37 13 C37 17 41 19 45 18"
        fill="none" stroke="#e0be84" stroke-width="1.4" opacity=".6"/>

  <!-- 弦轴（四相） -->
  <circle cx="40" cy="7" r="3.6" fill="url(#pp-jade)" stroke="#3d6f5d" stroke-width="1"/>
  <circle cx="47" cy="4" r="3.6" fill="url(#pp-jade2)" stroke="#3d6f5d" stroke-width="1"/>
  <circle cx="36" cy="13" r="3.2" fill="url(#pp-jade)" stroke="#3d6f5d" stroke-width=".9"/>
  <circle cx="44" cy="12" r="3.2" fill="url(#pp-jade2)" stroke="#3d6f5d" stroke-width=".9"/>

  <!-- 琴颈 -->
  <path d="M46 20 L70 20 L68 42 L48 42 Z" fill="url(#pp-wood)" stroke="#5e3d1c" stroke-width="1.4"/>
  <!-- 覆手 -->
  <rect x="44" y="26" width="28" height="7" rx="2" fill="#7a3f2c" stroke="#4a2016" stroke-width="1"/>
  <circle cx="49" cy="29.5" r="1.5" fill="#e0be84"/>
  <circle cx="58" cy="29.5" r="1.5" fill="#e0be84"/>
  <circle cx="67" cy="29.5" r="1.5" fill="#e0be84"/>

  <!-- 琴身（上窄下宽的梨形） -->
  <path d="M48 42 C34 52 26 76 32 98 C36 112 44 122 58 122
           C72 122 80 112 84 98 C90 76 82 52 68 42 Z"
        fill="url(#pp-face)" stroke="#5e3d1c" stroke-width="2"/>

  <!-- 木质侧板高光 -->
  <path d="M48 42 C34 52 26 76 32 98 C34 104 37 110 40 114
           C34 92 40 62 54 46 Z" fill="#fff" opacity=".28"/>

  <!-- 四品（六相） -->
  <g fill="#7a3f2c" opacity=".85">
    <circle cx="50" cy="58" r="2.4"/><circle cx="59" cy="58" r="2.4"/><circle cx="68" cy="58" r="2.4"/>
    <circle cx="47" cy="68" r="2.4"/><circle cx="56" cy="68" r="2.4"/><circle cx="65" cy="68" r="2.4"/>
    <circle cx="45" cy="78" r="2.4"/><circle cx="54" cy="78" r="2.4"/><circle cx="63" cy="78" r="2.4"/>
    <circle cx="44" cy="88" r="2.4"/><circle cx="53" cy="88" r="2.4"/><circle cx="62" cy="88" r="2.4"/>
    <circle cx="44" cy="98" r="2.4"/><circle cx="53" cy="98" r="2.4"/><circle cx="62" cy="98" r="2.4"/>
  </g>

  <!-- 四弦 -->
  <g stroke-linecap="round" fill="none">
    <path d="M43 20 L36 112" stroke="#f7f3e8" stroke-width=".9"/>
    <path d="M50 20 L48 114" stroke="#e8dcc0" stroke-width=".9"/>
    <path d="M58 20 L60 114" stroke="#f7f3e8" stroke-width=".9"/>
    <path d="M65 20 L72 112" stroke="#d8c9a4" stroke-width=".9"/>
  </g>

  <!-- 覆手高光 -->
  <rect x="44" y="26" width="28" height="2" fill="#fff" opacity=".25"/>

  <!-- 弦枕 -->
  <rect x="47" y="38" width="22" height="4" rx="1.4" fill="#5e3d1c"/>
</svg>`;

/* ============================================================
   D 部落 · 彩陶驼（马家窑彩陶纹样：赭红陶 + 几何纹）
   ============================================================ */
export const CAI_TAO_CAMEL = `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ct-body" x1="0" y1="0" x2=".9" y2="1">
      <stop offset="0" stop-color="#d9743f"/>
      <stop offset=".35" stop-color="#e89a5c"/>
      <stop offset=".6" stop-color="#c85f2e"/>
      <stop offset="1" stop-color="#a8451f"/>
    </linearGradient>
    <linearGradient id="ct-hump" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f0a86e"/>
      <stop offset="1" stop-color="#cf6833"/>
    </linearGradient>
    <linearGradient id="ct-dark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6b3418"/>
      <stop offset="1" stop-color="#47210e"/>
    </linearGradient>
  </defs>

  <ellipse cx="60" cy="112" rx="34" ry="5" fill="#000" opacity=".16"/>

  <!-- 四腿 -->
  <g fill="url(#ct-dark)">
    <rect x="30" y="82" width="7" height="26" rx="3"/>
    <rect x="42" y="84" width="6" height="24" rx="3"/>
    <rect x="72" y="84" width="6" height="24" rx="3"/>
    <rect x="83" y="82" width="7" height="26" rx="3"/>
  </g>
  <!-- 蹄 -->
  <g fill="#2f1508">
    <rect x="30" y="104" width="7" height="5" rx="2"/>
    <rect x="42" y="104" width="6" height="5" rx="2"/>
    <rect x="72" y="104" width="6" height="5" rx="2"/>
    <rect x="83" y="104" width="7" height="5" rx="2"/>
  </g>

  <!-- 躯干 -->
  <path d="M28 84 C22 68 30 56 46 56 C62 56 76 58 88 62
           C96 66 96 80 88 86 C74 92 44 92 28 84 Z"
        fill="url(#ct-body)" stroke="#8a3a18" stroke-width="1.8"/>

  <!-- 双峰 -->
  <path d="M40 56 C42 42 52 38 56 46 C58 52 58 56 56 58 Z" fill="url(#ct-hump)" stroke="#a8451f" stroke-width="1.5"/>
  <path d="M66 58 C68 44 78 42 81 50 C83 56 82 60 80 61 Z" fill="url(#ct-hump)" stroke="#a8451f" stroke-width="1.5"/>

  <!-- 颈与头 -->
  <path d="M88 64 C96 58 104 52 108 44 C112 36 110 28 104 26
           C98 24 92 30 90 38 C88 46 88 54 88 64 Z"
        fill="url(#ct-body)" stroke="#8a3a18" stroke-width="1.8"/>
  <path d="M104 26 C110 22 116 26 114 33 C112 39 106 39 103 35 Z" fill="#e89a5c" stroke="#8a3a18" stroke-width="1.5"/>
  <!-- 耳 -->
  <path d="M100 28 C98 22 100 18 103 21 C105 23 104 26 103 28 Z" fill="#a8451f"/>
  <!-- 眼 -->
  <circle cx="107" cy="29.5" r="1.8" fill="#2f1508"/>
  <circle cx="107.5" cy="29" r=".7" fill="#fff" opacity=".8"/>

  <!-- 尾 -->
  <path d="M28 82 C22 80 18 86 20 92" fill="none" stroke="#a8451f" stroke-width="4" stroke-linecap="round"/>

  <!-- 彩陶纹样：马家窑式菱格 + 波纹 -->
  <g stroke="#47210e" stroke-width="1.5" fill="none" opacity=".72">
    <path d="M44 68 l7 5 l-7 5 l-7 -5 z"/>
    <path d="M62 70 l6 4.5 l-6 4.5 l-6 -4.5 z"/>
    <path d="M78 72 l5 4 l-5 4 l-5 -4 z"/>
    <path d="M40 78 q4-4 8 0 q-4 4-8 0" fill="#47210e" opacity=".4"/>
    <path d="M56 78 q4-4 8 0 q-4 4-8 0" fill="#47210e" opacity=".4"/>
    <path d="M72 80 q4-4 8 0 q-4 4-8 0" fill="#47210e" opacity=".4"/>
  </g>
  <g fill="#f2c48c" opacity=".55">
    <circle cx="48" cy="73" r="1.4"/><circle cx="68" cy="74.5" r="1.3"/>
  </g>
  <!-- 脊线 -->
  <path d="M34 62 C52 58 76 60 88 65" fill="none" stroke="#f0a86e" stroke-width="2" opacity=".5"/>
</svg>`;

/* ============================================================
   部落实体棋子（把标识立起来，带立体底座与投影）
   ============================================================ */
export const TRIBES = [
  {
    id: 'A', name: '长安部落', initialCrop: '水稻', color: '#4f9ed6', tint: '#bfe0f5',
    motif: '华表', motifDesc: '天安门华表 · 蟠龙云板',
    svg: HUABIAO, viewBox: '0 0 100 130'
  },
  {
    id: 'B', name: '古蜀部落', initialCrop: '小麦', color: '#4e7350', tint: '#b6cdb0',
    motif: '三星堆面具', motifDesc: '青铜纵目 · 夔龙阔耳',
    svg: SANXINGDUI_MASK, viewBox: '0 0 120 110'
  },
  {
    id: 'C', name: '丝绸部落', initialCrop: '玉米', color: '#b8843f', tint: '#e8cfa0',
    motif: '琵琶', motifDesc: '曲项四弦 · 十四品',
    svg: PIPA, viewBox: '0 0 110 130'
  },
  {
    id: 'D', name: '燕都部落', initialCrop: '棉花', color: '#c85f2e', tint: '#eeb694',
    motif: '彩陶骆驼', motifDesc: '马家窑纹 · 赭红陶',
    svg: CAI_TAO_CAMEL, viewBox: '0 0 120 120'
  }
];

/** 把 SVG 字符串包成 data URI，用于 CSS background */
export function svgToDataUri(svg) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s+/g, ' ').trim());
}

// 给每个部落挂上方法，engine 里就能直接 t.svgToDataUri()
TRIBES.forEach(t => {
  t.svgToDataUri = () => svgToDataUri(t.svg);
});

/** 生成一枚棋子（标识 + 立体底座）的 data URI */
export function pawnUri(t) {
  const inner = t.svg.replace(/\n/g, '');
  const vb = t.viewBox.split(' ').map(Number);
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb[2] + 8} ${vb[3] + 12}">
    <ellipse cx="${vb[2] / 2 + 4}" cy="${vb[3] + 8}" rx="${vb[2] * 0.34}" ry="4.5"
             fill="rgba(40,28,14,.22)"/>
    <g transform="translate(4,2)">${inner}</g>
  </svg>`;
  return svgToDataUri(s);
}

/** 图例用的小图标 */
export const MOTIF_THUMBS = TRIBES.map(t => ({ id: t.id, name: t.name, motif: t.motif, svg: t.svg, viewBox: t.viewBox }));
