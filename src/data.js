/**
 * 菜农部落 · 完整可玩版 —— 游戏数据层
 *
 * 所有数值均取自《菜农部落电子版》桌游原件 + 《菜农部落游戏规则设计》：
 *  - 土地价格 / 肥力等级 / 适配作物：土地信息卡实物
 *  - 作物种子成本 / 高收低收：作物卡实物
 *  - 改良卡面值：改良卡实物
 *  - 站点规则：规则设计 PDF
 *
 * 数值与表现严格分离：改这里 -> 刷新页面即生效，
 * 供课程后半段「学生优化游戏」环节直接验证结果。
 */

/* ================= 规则常量 ================= */
/**
 * 先手补偿：赛道较长（32 格）时，先手能更早占到优质土地。
 * 按**行动次序**给后排部落一次性补币，把先手优势压平：
 * order 里第 k 位行动的部落拿 START_BONUS[k]（index 0 = 本局先手）。
 * ⚠ 不是按座位号发 —— 行动顺序每局随机，按座位发会完全错位。
 */
export const START_BONUS = [0, 25, 45, 60];

export const RULES = {
  tribes: 4,
  startMoney: 150,        // 简化版初始肥力币（原版 400）
  winMoney: 260,          // 简化版胜利线（原版 600）
  debtLimit: 50,          // 允许欠款上限：money 最低到 −50；欠款超过它即破产退出
  startBonus: 50,         // 经过起点获得（原版 100）
  passRate: 0.5,          // 过路费 = 地价 50%（地价的一半）
  diceCount: 2,           // 两个骰子
  freeLandCards: 1,       // 每人初始一张免费买地卡
  marketSize: 10,         // 种子集市摆出几种作物卡（= 全部 10 种，不再限量摆 5 种）
  seedMaxPerType: 3,      // 单一作物最多囤几张卡
  seedMaxTotal: 6,        // 全部作物种子卡合计上限（每次进集市最多囤 6 张）
  seedDraw: 3,            // 开局从作物池随机抽几张候选
  seedKeep: 2,            // 其中几张作为「基础种子卡」直接入库
  // 肥力等级 -> 可种植作物片数
  plots: { low: 1, mid: 2, midHigh: 3, high: 3 }
};

/* ================= 部落特长 ================= */
/**
 * 每个部落一条与自身文化地理绑定的特长。
 * 数值刻意克制：以百分比微调为主，不破坏四部落均衡。
 *  - A 华表（中原）   ：华北平原的土地收获加成
 *  - B 三星堆（四川） ：水稻成本减半 + 收益加成
 *  - C 琵琶（西北）   ：每回合可追加掷骰，步数优势
 *  - D 彩陶骆驼（丝路）：经过起点额外收益
 */
export const TRIBE_TRAITS = {
  A: {
    name: '沃野中原',
    short: '华北平原收获 +90%',
    desc: '华表立于中原沃土。在华北平原的土壤（山东棕壤、黄绵土）上收获，收益 +90%',
    landBonus: { lands: ['shandong', 'huangmiantu'], rate: 0.90 },
  },
  B: {
    name: '稻作之源',
    short: '水稻成本减半 · 收益 +25%',
    desc: '三星堆先民最早驯化水稻。种植水稻时种子成本减半，收获水稻收益 +25%',
    cropBonus: { crops: ['shuidao'], costRate: -0.5, gainRate: 0.25 },
  },
  C: {
    name: '追风千里',
    short: '每 2 回合可追加掷骰 1 次',
    desc: '琵琶声出玉门关，追风逐沙。每 2 回合可追加投掷 1 颗「追风骰」（1~3 点），步数累加',
    extraRoll: 1,            // 每次可追加的掷骰颗数
    extraRollEvery: 2,       // 冷却：每 N 回合一次（1=每回合）
    extraRollMax: 3,         // 追风骰点数上限
  },
  D: {
    name: '丝路商队',
    short: '经过起点额外 +15',
    desc: '彩陶骆驼驮队穿行丝路。每次经过起点，额外 +15 肥力币',
    startBonus: 15,          // 原为 30：种植改成「按片结算」后局长变长、绕圈变多，
                             // D 的每圈收益被放大到碾压（spread 19%）；实测 15 最均衡
  },
};

/* ================= 土地信息卡 11 种 ================= */
/* img 指向 assets/cards/ 下的原卡面图 */
export const LANDS = [
  {
    id: 'huangmiantu', name: '黄绵土', img: 'assets/cards/land_huangmiantu.png',
    price: 60, fertility: '低', plots: 1, texture: '粉壤',
    ph: 'pH 6.5-7.5 微碱性', region: '黄土高原（陕甘、晋南）',
    crops: ['春小麦', '谷子', '糜子'],
    knowledge: '粉壤质绵土，土质绵软、粉性重，保水保肥能力中等。'
  },
  {
    id: 'heilitu', name: '东北黑土', img: 'assets/cards/land_heilitu.png',
    price: 120, fertility: '高', plots: 3, texture: '壤土',
    ph: 'pH 6.0-7.0 中性', region: '东北平原',
    crops: ['玉米', '大豆', '水稻'],
    knowledge: '腐殖质含量高，是世界三大肥沃黑土之一，长期耕作易导致黑土层变薄。'
  },
  {
    id: 'jiangnan', name: '江南水稻土', img: 'assets/cards/land_jiangnan.png',
    price: 110, fertility: '中', plots: 2, texture: '黏壤',
    ph: 'pH 5.5-6.5 微酸性', region: '长江中下游平原',
    crops: ['水稻', '油菜', '茶树'],
    knowledge: '人工培育的水稻土，潴育层发育，保水保肥，是「南稻北米」格局下南方主产的载体。'
  },
  {
    id: 'zise', name: '四川紫色土', img: 'assets/cards/land_zise.png',
    price: 100, fertility: '中高', plots: 3, texture: '壤土',
    ph: 'pH 5.5-6.5 中性偏酸', region: '四川盆地及周边',
    crops: ['水稻', '油菜', '甘蔗'],
    knowledge: '由紫色砂页岩风化而成，土层深厚、富含磷钾元素，自然肥力高。'
  },
  {
    id: 'xibei', name: '西北沙土', img: 'assets/cards/land_xibei.png',
    price: 50, fertility: '低', plots: 1, texture: '砂土',
    ph: 'pH 7.5-8.5 碱性', region: '西北干旱区、内蒙古西部',
    crops: ['小麦', '玉米', '马铃薯'],
    knowledge: '土质疏松、通透性强，但保水保肥能力差、养分流失快。'
  },
  {
    id: 'nanfang', name: '南方红壤', img: 'assets/cards/land_nanfang.png',
    price: 90, fertility: '低', plots: 1, texture: '黏土',
    ph: 'pH 4.5-5.5 强酸性', region: '江南丘陵、云贵高原',
    crops: ['茶树', '水稻', '柑橘'],
    knowledge: '酸性强、土质黏重、有机质少、肥力贫瘠，需施加生石灰中和酸性。'
  },
  {
    id: 'shandong', name: '山东棕壤', img: 'assets/cards/land_shandong.png',
    price: 80, fertility: '中', plots: 2, texture: '壤土',
    ph: 'pH 6.0-7.0 中性微酸', region: '山东半岛、胶东丘陵',
    crops: ['花生', '苹果', '甘薯'],
    knowledge: '土层较厚、质地适宜，微酸性最宜花生种植。'
  },
  {
    id: 'huangmo', name: '荒漠土', img: 'assets/cards/land_huangmo.png',
    price: 40, fertility: '低', plots: 1, texture: '砂土',
    ph: 'pH 8.0-9.0 强碱性', region: '新疆塔里木、准噶尔盆地',
    crops: ['小麦', '棉花', '瓜类'],
    knowledge: '干旱少雨、蒸发旺盛，盐分表层堆积、板结严重。'
  },
  {
    id: 'yungui', name: '云贵黄壤', img: 'assets/cards/land_yungui.png',
    price: 70, fertility: '中', plots: 2, texture: '壤土',
    ph: 'pH 5.0-6.0 酸性', region: '云贵高原、四川盆地边缘',
    crops: ['水稻', '玉米', '油菜'],
    knowledge: '亚热带湿润气候下发育，黄色黏粒淀积，肥力中等偏上。'
  },
  {
    id: 'hainan', name: '海南砖红壤', img: 'assets/cards/land_hainan.png',
    price: 65, fertility: '中', plots: 2, texture: '黏壤',
    ph: 'pH 4.5-5.5 酸性', region: '海南岛、雷州半岛',
    crops: ['水稻', '橡胶', '菠萝'],
    knowledge: '高温多雨淋溶强烈，铁铝氧化物富集呈砖红色。'
  },
  {
    id: 'qingzang', name: '青藏草甸土', img: 'assets/cards/land_qingzang.png',
    price: 75, fertility: '中', plots: 2, texture: '壤土',
    ph: 'pH 6.5-7.5 中性', region: '青藏高原东部',
    crops: ['青稞', '小麦', '油菜'],
    knowledge: '高寒草甸植被根系密集、腐殖质积累，但土温低、生长期短。'
  }
];

/* ================= 作物卡 10 种 ================= */
/* cost 种子成本；good/high收益土壤；other 低收益土壤 */
export const CROPS = [
  {
    id: 'malingshu', name: '马铃薯', cost: 15,
    img: 'assets/cards/crop_malingshu.png',
    good: 35, bad: 20,
    goodSoil: '沙土', badSoil: '黏土/壤土',
    soilMap: { 'xibei': true },
    note: '喜冷凉气候，块茎在疏松沙质土中产量高；怕涝，忌连作。'
  },
  {
    id: 'huasheng', name: '花生', cost: 20,
    img: 'assets/cards/crop_huasheng.png',
    good: 45, bad: 25,
    goodSoil: '沙土', badSoil: '黏土/壤土',
    soilMap: { 'shandong': true },
    note: '地上开花，地下结果；根据土壤质地深埋或浅埋。'
  },
  {
    id: 'xigua', name: '西瓜', cost: 30,
    img: 'assets/cards/crop_xigua.png',
    good: 70, bad: 35,
    goodSoil: '砂质沙土', badSoil: '黏壤土',
    soilMap: { 'xibei': true, 'huangmo': true },
    note: '喜温暖，昼夜温差大有利于糖分积累；沙质土保水保肥差，需注意补水。'
  },
  {
    id: 'hongshu', name: '红薯', cost: 18,
    img: 'assets/cards/crop_hongshu.png',
    good: 40, bad: 22,
    goodSoil: '砂质沙土', badSoil: '易涝瘠薄、砂质黏土',
    soilMap: { 'xibei': true, 'heilitu': true },
    note: '喜缓温和长日照；块根膨大期需要疏松通气的土壤环境。'
  },
  {
    id: 'xiaomai', name: '小麦', cost: 25,
    img: 'assets/cards/crop_xiaomai.png',
    good: 55, bad: 30,
    goodSoil: '黄壤/黑钙土', badSoil: '砂质壤土',
    soilMap: { 'yungui': true, 'huangmiantu': true },
    note: '世界三大粮食之一，需土壤深厚、肥力较好，耐寒性强。'
  },
  {
    id: 'fanqie', name: '番茄', cost: 30,
    img: 'assets/cards/crop_fanqie.png',
    good: 60, bad: 30,
    goodSoil: '砂质壤土', badSoil: '黏土',
    soilMap: { 'zise': true, 'jiangnan': true },
    note: '喜温怕热，根系分布深，适宜砂质壤土；黏土排水差易伤根。'
  },
  {
    id: 'yumi', name: '玉米', cost: 20,
    img: 'assets/cards/crop_yumi.png',
    good: 65, bad: 35,
    goodSoil: '壤土', badSoil: '砂质黏土',
    soilMap: { 'heilitu': true, 'huangmiantu': true },
    note: '适应性最强，肥沃黑土与壤土产量最大，需氮肥较多。'
  },
  {
    id: 'youcai', name: '油菜', cost: 25,
    img: 'assets/cards/crop_youcai.png',
    good: 60, bad: 25,
    goodSoil: '旱地壤土', badSoil: '重黏土',
    soilMap: { 'zise': true, 'jiangnan': true, 'hainan': true },
    note: '喜温暖湿润，需土层深厚、排水良好的壤土。'
  },
  {
    id: 'shuidao', name: '水稻', cost: 35,
    img: 'assets/cards/crop_shuidao.png',
    good: 75, bad: 40,
    goodSoil: '水稻土', badSoil: '壤土/黄壤',
    soilMap: { 'jiangnan': true },
    note: '水生喜湿、喜高温喜酸，水稻土保水保肥；需水层管理。'
  },
  {
    id: 'chashu', name: '茶树', cost: 40,
    img: 'assets/cards/crop_chashu.png',
    good: 90, bad: 45,
    goodSoil: '酸性红壤土', badSoil: '酸性黄壤',
    soilMap: { 'nanfang': true },
    note: '酸性土(pH 4.5-6.0)保酸保肥，多年生长期益。'
  },
];

/* ================= 改良卡 12 张 ================= */
/* value 面值：**抽到这张卡时立即一次性获得**的肥力币。
   持有增益按面值折算：每张 =（value / IMPROVE_VALUE_MAX）× 6%
   （面值 20 的卡给 +6%，面值 5 的卡给 +1.5%），求和后封顶 +48%。
   gain 字段是原版卡的「改良效果」文案，供学生设计长效机制时参考。 */
export const IMPROVES = [
  { id: 'dimo', name: '地膜覆盖技术', img: 'assets/cards/imp_dimo.png',
    value: 5, station: '农技站', gain: '作物增产 20%' },
  { id: 'diguan', name: '滴灌系统', img: 'assets/cards/imp_diguan.png',
    value: 10, station: '农技站', gain: '节水率 30%' },
  { id: 'jixiehua', name: '机械化耕作升级', img: 'assets/cards/imp_jixiehua.png',
    value: 10, station: '农技站', gain: '机械收割效率提升 30%' },
  { id: 'nongyao', name: '农药使用', img: 'assets/cards/imp_nongyao.png',
    value: 20, station: '农技站', gain: '杀虫率 +30%、产量提升 25%' },
  { id: 'zengchan', name: '增产措施', img: 'assets/cards/imp_zengchan.png',
    value: 15, station: '农技站', gain: '增产 20%' },
  { id: 'youjifei', name: '有机肥', img: 'assets/cards/imp_youjifei.png',
    value: 10, station: '堆肥站', gain: '土壤肥力提升 25%' },
  { id: 'fuhefei', name: '复合肥', img: 'assets/cards/imp_fuhefei.png',
    value: 15, station: '堆肥站', gain: '土壤肥力提升 20%，促进作物生长' },
  { id: 'qiyuan', name: '蚯蚓生物改良', img: 'assets/cards/imp_qiyuan.png',
    value: 5, station: '堆肥站', gain: '改良效果 +10%，持续 3 回合' },
  { id: 'fuzhi', name: '腐殖质强化', img: 'assets/cards/imp_fuzhi.png',
    value: 8, station: '堆肥站', gain: '作物产量 +25%' },
  { id: 'cetu', name: '测土配方', img: 'assets/cards/imp_cetu.png',
    value: 10, station: '科研所', gain: '土壤采集 + 成分分析，精准施肥' },
  { id: 'ph', name: 'pH 值检测改良', img: 'assets/cards/imp_ph.png',
    value: 10, station: '科研所', gain: '酸性/中性/碱性分类，增施石灰调理' },
  { id: 'tudihuli', name: '土壤维护', img: 'assets/cards/imp_tudihuli.png',
    value: 15, station: '堆肥站', gain: '深松土+20% / 混合有机肥+30% / 覆盖秸秆保墒' }
];

/** 改良卡最高面值（持有增益的分母）：面值最高的卡恰好对应 +6%。 */
export const IMPROVE_VALUE_MAX = Math.max(...IMPROVES.map(i => i.value));

/* ================= 气象事件卡 6 张 ================= */
/* ⚠ 原版气象卡对**所有作物统一奖惩**：`base` 是唯一参与结算的数值，
   与种什么作物无关（引擎 plant() 只读 base）—— 这是课程要学生发现的核心 BUG。
   `match` 是「优化后建议值」（按作物区分），**当前引擎不使用**，仅作教学对比参考，
   因此不再在 UI 里展示成「这张卡对各作物的影响」（那会让人误以为现规则按作物结算）。 */
export const WEATHERS = [
  { id: 'w1', wiki: 'https://baike.baidu.com/item/%E9%A3%8E%E8%B0%83%E9%9B%A8%E9%A1%BA', name: '风调雨顺', sub: '气候适宜年', sign: 1, base: 20,
    match: { 水稻: 30, 小麦: 20, 玉米: 25, 油菜: 20 },
    desc: '降水与温度适宜，作物普遍增产。' },
  { id: 'w2', wiki: 'https://baike.baidu.com/item/%E6%A2%85%E9%9B%A8', name: '梅雨连绵', sub: '持续渍涝', sign: -1, base: -15,
    match: { 水稻: 5, 小麦: -20, 玉米: -10, 油菜: -10 },
    desc: '南方持续阴雨，土壤过湿板结。' },
  { id: 'w3', wiki: 'https://baike.baidu.com/item/%E5%8F%B0%E9%A3%8E', name: '台风过境', sub: '风雨复合灾害', sign: -1, base: -25,
    match: { 水稻: -20, 小麦: -10, 玉米: -25, 油菜: -20 },
    desc: '强风暴雨，作物倒伏与水土流失。' },
  { id: 'w4', wiki: 'https://baike.baidu.com/item/%E5%80%92%E6%98%A5%E5%AF%92', name: '倒春寒', sub: '春季晚霜冻害', sign: -1, base: -20,
    match: { 水稻: -30, 小麦: -5, 玉米: -15, 油菜: -20 },
    desc: '春季回寒，早播作物受霜冻。' },
  { id: 'w5', wiki: 'https://baike.baidu.com/item/%E6%9A%96%E5%86%AC', name: '暖冬少雪', sub: '害虫越冬基数增加', sign: -1, base: -12,
    match: { 水稻: -10, 小麦: -15, 玉米: -12, 油菜: -8 },
    desc: '冬温偏高，病虫越冬基数上升。' },
  { id: 'w6', wiki: 'https://baike.baidu.com/item/%E4%BA%BA%E5%B7%A5%E5%A2%9E%E9%9B%A8', name: '增雨补贴', sub: '政府种植补贴', sign: 1, base: 18,
    match: { 水稻: 25, 小麦: 20, 玉米: 22, 油菜: 15 },
    desc: '降水增加同时获得政策性补贴。' }
];

/* ================= 功能站点 ================= */
export const STATIONS = {
  start: { id: 'start', name: '起点', color: '#d0392b', kind: 'start',
    desc: '每经过起点获得 50 肥力币' },
  qixiang: { id: 'qixiang', name: '气象站', color: '#4a9bd8', kind: 'weather',
    desc: '抽 1 张延时气象卡存入卡槽，下一次种植时自动生效' },
  nongji: { id: 'nongji', name: '土壤改良站', color: '#59a85a', kind: 'improve',
    desc: '自动抽 1 张土壤改良卡，抽到即得面值肥力币，持有期间按面值折算增加收获收益' },
  zhongzi: { id: 'zhongzi', name: '种子集市', color: '#d8a03a', kind: 'market',
    desc: '购买作物卡囤到手上，种植时一片消耗一张' },
  jianyu: { id: 'jianyu', name: '监狱', color: '#4a4a52', kind: 'prison',
    desc: '落在监狱暂停一回合，反思不当农业行为（路过不坐牢）' }
};

/* ================= 科普词条链接（百度百科） =================
   「查阅科普」按钮跳转用。规则：
   - 确认存在的词条用 baike.baidu.com/item/<词条>（直达正文）
   - 拿不准的用 baike.baidu.com/search?word=<词>（站内搜索页，永不 404）
   统一在这里挂载，避免散落在 33 个条目里。                        */

/** 直达词条正文 */
export const wikiItem = (t) => 'https://baike.baidu.com/item/' + encodeURIComponent(t);
/** 兜底：站内搜索结果页 */
export const wikiSearch = (t) => 'https://baike.baidu.com/search?word=' + encodeURIComponent(t);

/* 土地：游戏名 → 真实土壤学名词（多数是复合词，映射到标准词条） */
const WIKI_LAND = {
  huangmiantu: wikiItem('黄绵土'),
  heilitu:     wikiItem('黑土'),
  jiangnan:    wikiItem('水稻土'),
  zise:        wikiItem('紫色土'),
  xibei:       wikiItem('砂土'),
  nanfang:     wikiItem('红壤'),
  shandong:    wikiItem('棕壤'),
  huangmo:     wikiItem('荒漠土'),
  yungui:      wikiItem('黄壤'),
  hainan:      wikiItem('砖红壤'),
  qingzang:    wikiItem('草甸土'),
};

/* 作物：卡面名即标准作物名，全部有词条 */
const WIKI_CROP = {
  malingshu: wikiItem('马铃薯'),
  huasheng:  wikiItem('花生'),
  xigua:     wikiItem('西瓜'),
  hongshu:   wikiItem('红薯'),
  xiaomai:   wikiItem('小麦'),
  fanqie:    wikiItem('番茄'),
  yumi:      wikiItem('玉米'),
  youcai:    wikiItem('油菜'),
  shuidao:   wikiItem('水稻'),
  chashu:    wikiItem('茶树'),
};

/* 改良卡：卡名是游戏化表述，映射到真实的农业技术词条；
   映射不到确切词条的（增产措施 / 蚯蚓改良 / 土壤维护）用搜索兜底。 */
const WIKI_IMPROVE = {
  dimo:     wikiItem('地膜覆盖'),
  diguan:   wikiItem('滴灌'),
  jixiehua: wikiItem('农业机械'),
  nongyao:  wikiItem('农药'),
  zengchan: wikiItem('粮食增产'),
  youjifei: wikiItem('有机肥'),
  fuhefei:  wikiItem('复合肥'),
  qiyuan:   wikiItem('蚯蚓'),
  fuzhi:    wikiItem('腐殖质'),
  cetu:     wikiItem('测土配方施肥'),
  ph:       wikiItem('pH'),
  tudihuli: wikiItem('土壤改良'),
};

/* 站点与功能 */
const WIKI_EXTRA = {
  qixiang:  wikiItem('气象学'),
  nongji:   wikiItem('土壤改良'),
  zhongzi:  wikiSearch('种子 品种 农业'),
  jianyu:   wikiItem('监狱'),
  start:    wikiItem('起点'),
};

/* 把 wiki 字段注入各数据表 */
LANDS.forEach(l => { l.wiki = WIKI_LAND[l.id] || wikiSearch(l.name); });
CROPS.forEach(c => { c.wiki = WIKI_CROP[c.id] || wikiSearch(c.name); });
IMPROVES.forEach(m => { m.wiki = WIKI_IMPROVE[m.id] || wikiSearch(m.name); });

/** 通用查询：给任意名字一个可用的科普链接 */
export function wikiOf(name) {
  const key = Object.keys(WIKI_LAND).find(k => LANDS.find(l => l.id === k)?.name === name);
  if (key) return WIKI_LAND[key];
  const ck = CROPS.find(c => c.name === name);
  if (ck) return ck.wiki;
  return wikiSearch(name);
}

/* ================= 图板赛道 ================= */
/**
 * 赛道严格对应 PDF 原图 board_full.png 外圈的 **32 格**，
 * 顺序与 assets/cells/cell_00..31.png 完全一致：
 *   底边 右->左 (0-9) · 右边 下->上 (10-15)
 *   顶边 左->右 (16-25) · 左边 上->下 (26-31)
 * 索引 0 = 右下角「起点 +100」。
 *
 * kind: 'land' = 土地格（soilId 指向土壤）
 *       'start' / 'qixiang' / 'nongji' / 'zhongzi' / 'jianyu' = 功能站点
 */
/* =========================================================
   赛道 32 格：**严格顺时针**，每一步都走到几何上相邻的格子。
   ---------------------------------------------------------
   顺序从右下角「起点」开始：
     底边 右→左 → 左边 下→上 → 顶边 左→右 → 右边 上→下 → 回起点
   即「4 点 → 7 点 → 10 点 → 1 点」的顺时针方向。

   为什么必须这样排：TRACK 的index 要和 cellPositions.js 里的
   CELL_POS[index] 严格对应 —— 棋子每走一步都按 CELL_POS 定位。
   只要 TRACK 的排列与几何顺序错位，就会出现「横穿图板」的跳跃
   （实测过 4 处：位移0.855，而正常步长 0.087~0.118，差 8 倍）。

   转角格归属：归「顺时针先踩到的那条边」，即
     左下角（种子集市）→ 属于底边，
     左上角（监狱）→ 属于左边，
     右上角（种子集市）→ 属于顶边，
     右下角（起点）→ 属于底边，闭环回到起点。

   每格后面的注释标的是它在**底图上的真实位置**，不是它在数组里的位置。
   ========================================================= */
export const TRACK = [
  // ---- 底边 0-9：起点在最右，向左走 ----
  { kind: 'start', id: 'start' },              //  0 起点 +100（右下角）
  { kind: 'land', soilId: 'nanfang' },         //  1 南方红壤
  { kind: 'land', soilId: 'hainan' },          //  2 海南砖红壤
  { kind: 'zhongzi', id: 'zhongzi' },          //  3 种子集市
  { kind: 'nongji', id: 'nongji' },            //  4 土壤改良站
  { kind: 'land', soilId: 'yungui' },          //  5 云贵黄壤
  { kind: 'land', soilId: 'yungui' },          //  6 云贵黄壤
  { kind: 'qixiang', id: 'qixiang' },          //  7 气象站
  { kind: 'land', soilId: 'zise' },            //  8 四川紫色土
  { kind: 'zhongzi', id: 'zhongzi' },          //  9 种子集市（左下角）← 转入左边
  // ---- 左边 10-15：从下往上 ----
  { kind: 'land', soilId: 'qingzang' },        // 10 青藏草甸土
  { kind: 'land', soilId: 'qingzang' },        // 11 青藏草甸土
  { kind: 'nongji', id: 'nongji' },            // 12 土壤改良站
  { kind: 'land', soilId: 'xibei' },           // 13 西北沙土
  { kind: 'qixiang', id: 'qixiang' },          // 14 气象站
  { kind: 'land', soilId: 'huangmo' },         // 15 荒漠土
  // ---- 转上顶边：16-25，左上角（监狱）→ 向右 ----
  { kind: 'jianyu', id: 'jianyu' },            // 16 监狱（左上角）
  { kind: 'zhongzi', id: 'zhongzi' },          // 17 弃种地 / 种子集市
  { kind: 'land', soilId: 'huangmo' },         // 18 荒漠土
  { kind: 'land', soilId: 'huangmo' },         // 19 荒漠土
  { kind: 'nongji', id: 'nongji' },            // 20 土壤改良站
  { kind: 'land', soilId: 'huangmiantu' },     // 21 黄绵土
  { kind: 'qixiang', id: 'qixiang' },          // 22 气象站
  { kind: 'land', soilId: 'heilitu' },         // 23 东北黑土
  { kind: 'land', soilId: 'heilitu' },         // 24 东北黑土
  { kind: 'zhongzi', id: 'zhongzi' },          // 25 种子集市（右上角）← 转入右边
  // ---- 右边 26-31：从上往下 ----
  { kind: 'land', soilId: 'shandong' },        // 26 山东棕壤
  { kind: 'land', soilId: 'shandong' },        // 27 山东棕壤
  { kind: 'land', soilId: 'jiangnan' },        // 28 江南水稻土
  { kind: 'nongji', id: 'nongji' },            // 29 土壤改良站
  { kind: 'land', soilId: 'jiangnan' },        // 30 江南水稻土
  { kind: 'land', soilId: 'nanfang' },         // 31 南方红壤
  // 回到 0（起点，右下角），闭环
];

/* ================= 部落 ================= */
/** 标识在 motifs.js 里以 SVG 绘制：华表 / 三星堆面具 / 琵琶 / 彩陶驼 */
export { TRIBES, MOTIF_THUMBS, pawnUri, svgToDataUri } from './motifs.js';

/* ================= 工具函数 ================= */
export const landById = (id) => LANDS.find(l => l.id === id);
export const cropById = (id) => CROPS.find(c => c.id === id);
export const cropByName = (n) => CROPS.find(c => c.name === n);
export const improveById = (id) => IMPROVES.find(i => i.id === id);

/** 肥力等级 -> 可种植作物片数（对应规则：低1 / 中2 / 中高3 / 高3） */
export const FERTILITY_PLOTS = { 低: 1, 中: 2, 中高: 3, 高: 3 };
export const plotsFor = (fertility) => FERTILITY_PLOTS[fertility] || 1;

/**
 * 土壤适配度：作物在给定土壤上是高收还是低收。
 * 依据作物卡标注的「种植 X（高收益）」，按土壤名/质地关键词比对。
 * 容错缺失字段，任何不匹配都退化为「低收」而不是抛错。
 */
export function soilMatch(crop, land) {
  if (!crop || !land) return 'bad';
  // 显式映射：作物卡的「高收土壤」-> 对应土地 id。
  // 不用字符串包含匹配 —— 「酸性红壤土」会被误判到黄壤/紫色土上。
  const map = crop.soilMap || {};
  return map[land.id] === true ? 'good' : 'bad';
}

export function plantingProfit(crop, land) {
  const m = soilMatch(crop, land);
  const yieldPerPlot = m === 'good' ? crop.good : crop.bad;
  const plots = plotsFor(land && land.fertility);
  const income = yieldPerPlot * plots;
  const cost = crop.cost * plots;
  return { plots, yieldPerPlot, income, cost, profit: income - cost, match: m };
}