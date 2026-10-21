/**
 * 菜农部落 · 新手教程「小禾」问答手册 + 底面《随农记》
 * ------------------------------------------------------------
 * 独立浮层，与对局状态完全解耦：
 *   · 不读写对局状态 G，不碰引擎 / 规则 / 平衡 / 胜负 / 存档；
 *   · 纯静态问答（点问题看答案），不联网、不调用任何大模型。
 *
 * 占位方式（关键）：
 *   宽屏(≥1500) —— 给 #app 加 padding-right 为教程「常驻预留」一条窄列。
 *                 只动 padding，不改 #app 的 grid 列定义，
 *                 图板由 main.js 的 layoutBoard() 自动重算（开合不改几何）。
 *   窄屏(<1500) —— 右侧弹出式面板，手机端同样能查教程。
 *   入口        —— 两套：PC（≥1500）用预留列里的灯笼罩 .ai-launch（原样）；
 *                 手机 / 窄屏（<1500）用底栏 #ai-entry 的「新手教程 / 随农记」两个按钮
 *                 （index.html，与「作物卡 · 改良卡」一栏并排）；本模块只负责绑定与开关。
 */

const WIDE_MIN = 1500;            // 与 style.css 的媒体查询断点保持一致

/* ================= 问答手册数据 =================
   分类 → 问题 → 答案。答案里 **…** 会被 md() 渲染成加粗，\n 保留换行。
   内容与《游戏规则.md》《SPEC.md》保持一致；4 个 BUG 是课程探究重点。 */
const QA = [
  { cat: '快速上手', items: [
    { q: '掷骰子之后要做什么？',
      a: '点右下「🎲 掷骰子开始回合」，掷 2 颗骰子，棋子按点数**一次走完**；停下的那一格先结算（过路费 / 集市 / 气象站…），**结算完才是做决定的时候**：买地、种植、收获都在脚下这一格办。办完点「结束回合」换下一个部落。' },
    { q: '怎么买地、怎么买种子？',
      a: '买地只能买**脚下这块无主地**：按地价买下，或用开局发的「免费买地卡」直接拿。种子卡要去**种子集市**格买，买卡时就把种子钱付了，卡囤在手上，等种植时才用掉。' },
    { q: '怎么种植？肥力和片数是什么？',
      a: '站在**自己的地里**点「种植」。肥力决定这块地**最多能种几片**（低 1 / 中 2 / 中高 3 / 高 3）——这是上限，可以少种。\n每片消耗 1 张对应的种子卡，**种植本身不花钱**。种在**适配土壤**上产量更高。' },
    { q: '怎么收获？',
      a: '走到自己**种了作物**的地，点「收获」，就能把这块地**已种的全部作物**收下来换肥力币（不要求种满）。收完这块地本回合就不能再种了，等下回合。' },
  ]},

  { cat: '回合与移动', items: [
    { q: '一个回合分几步？',
      a: '① 掷骰 → ② 一次走完所有步数 → ③ 落格结算（过路费 / 集市 / 气象站…）→ ④ 做决策（买地 / 种植 / 收获 / 用卡）→ ⑤ 换下一个部落。五个环节按顺序走。' },
    { q: '骰子几颗？点数怎么用？',
      a: '每回合 **2 颗骰子**，两颗的点数**一次走完**（不是走一格结算一次）。只有**最终停下的那一格**会结算 —— 中间路过的格子不结算。' },
    { q: '「本回合顺序」是什么意思？谁先走？',
      a: '每局开局的行动顺序是**随机抽签**定的，排第一的先走，不按 A / B / C / D 的编号。顶栏「本回合顺序」显示的就是这一局的顺位。' },
    { q: '监狱格是怎么回事？',
      a: '只有**正好停在**监狱格才暂停一回合（下回合跳过掷骰）；从旁边**路过**不坐牢。' },
    { q: '「追风骰」是什么？',
      a: '丝绸部落（琵琶）的特长「追风千里」：**每 2 回合**可追加掷 1 颗「追风骰」（1~3 点），步数累加，像驼队多赶一程。只有这个部落有。' },
  ]},

  { cat: '买地 · 土地', items: [
    { q: '买地要多少钱？免费买地卡怎么用？',
      a: '每块无主地都标着地价，钱够就能按价买下；每人开局有 1 张**免费买地卡**，可以直接白拿一块脚下的地。地买下来就归你了。' },
    { q: '我只能买脚下的地吗？',
      a: '是的，**买地只能在脚下这块**（种植也一样）。隔着几格的地不能买。' },
    { q: '这块地是什么土？适合种什么？',
      a: '点格子看土地详情，卡上写着土壤类型和适配作物。举几个例子：水稻↔水稻土、茶树↔南方红壤、花生↔山东棕壤、西瓜↔西北沙土、玉米↔东北黑土。种在**适配土壤**上产量更高。' },
    { q: '土地详情里的收益表为什么看不清？',
      a: '那张表默认是**雾化**的，花 **5 肥力币**做一次**土壤检测**，这块地就永久清晰可见了（一次付费，永久有效）。' },
  ]},

  { cat: '种植 · 收获', items: [
    { q: '种子卡在哪里买？最多能带几张？',
      a: '在**种子集市**格买（买卡时付种子钱）。单种作物最多囤 **3 张**，**全部作物合计最多 6 张**——满了就买不进。' },
    { q: '没有种子能种吗？',
      a: '**不能**。种子卡是硬门槛：手上没有那种作物的种子卡，就算钱再多也种不了。种子钱在买卡时就付过了，种植只消耗卡、不再扣钱。' },
    { q: '为什么有的地能种 3 片，有的只能种 1 片？',
      a: '看**肥力**：低肥力 1 片、中 2 片、中高 3 片、高 3 片。肥力是上限，可以少种几片，但不会超。' },
    { q: '收获怎么算钱？',
      a: '每片作物有各自的净收益（产量 − 种子成本）。收获时把这块地**已种的全部作物**一起收下、一块结算；土地适配、部落特长、改良卡加成都会算进去。' },
    { q: '一块地一回合能种几轮？',
      a: '**只算一轮**。收完（或种完）这块地，本回合就不能再种它了，防止反复刷钱；下回合恢复。' },
  ]},

  { cat: '卡牌 · 站点', items: [
    { q: '改良卡怎么用？有什么增益？',
      a: '在**土壤改良站**自动抽 1 张改良卡，**抽到就一次性拿到卡面值的肥力币**；持有还按面值折算增加收获加成（面值 20 = +6%，全部加起来封顶 **+48%**）。不种作物就没有这份增益。' },
    { q: '气象站发的卡什么时候生效？',
      a: '气象站抽到的是**延时卡**（±12~25 肥力币），不马上结算，等你**下一次种植**时自动发动一次，然后就没了。' },
    { q: '起点奖励是多少？',
      a: '每**经过**起点得 **50 肥力币**；燕都部落（丝路商队）每次经过额外 **+15**。' },
    { q: '集市里能看到哪些种子？',
      a: '集市默认列出**全部 10 种作物卡**，价格、扣款、日志三处一致；部落特长（如古蜀种水稻成本减半）会影响实付价。' },
    { q: '停在站点格会自动发卡吗？',
      a: '会：停在**气象站**自动发 1 张延时气象卡；停在**土壤改良站**自动抽 1 张改良卡；停在**种子集市**则打开集市让你挑作物卡买。' },
  ]},

  { cat: '过路费 · 破产', items: [
    { q: '过路费怎么算？',
      a: '**停在**别人的土地上，要付**这块地地价的 50%**（四舍五入）给地主；别的地不付。' },
    { q: '路过别人的地要收钱吗？',
      a: '**不收**。只有**最终停在**那一格才结算过路费，从旁边走过不算。' },
    { q: '破产是怎么触发的？',
      a: '允许欠款，钱包最低到 **−50**；**欠款超过 50**（比如 −51）就破产出局，名下土地全部回归无主，其他部落继续玩。实际对局里，唯一会把钱包打负的就是**付过路费**。' },
  ]},

  { cat: '怎么赢', items: [
    { q: '怎么才能赢下这一局？',
      a: '两条路：① 攒够 **260 肥力币**达标；② 其他部落全都破产，你成为唯一的幸存者。' },
    { q: '胜利线可以改吗？',
      a: '可以。点顶栏「⚙ 设置」，里面的「胜利线」可改（默认 260），改完会记住。' },
  ]},

  { cat: '科学探究 · 4 个 BUG', items: [
    { q: '游戏里那 4 个科学性 BUG 是什么？',
      a: '这是留给同学们「试玩找茬、科学探究」的四个问题：\n① **土壤数据缺失**——只用数字分肥力，没有颜色 / pH / 质地等实测数据；\n② **改良成本一刀切**——劣质土和黑土改良花一样的钱，违背因地制宜；\n③ **生物改良无长效**——堆肥与化学改良都是一次性收益，混淆了理化改良与生物改良；\n④ **气象损益不分作物**——台风对水稻和小麦一样罚，忽略了作物习性与气候适配。\n改完规则再验证效果，就是这堂课的任务。' },
    { q: '「气象损益不分作物」具体错在哪？',
      a: '现实里台风、倒春寒对不同作物的伤害差别很大（水稻怕倒春寒、小麦耐寒…），但游戏里所有作物都按**同一个数值**加减，与种什么无关。这就是要你动手改的地方。' },
    { q: '「改良成本一刀切」是什么意思？',
      a: '劣质土（如荒漠土、砂土）和好土（黑土）用同一种改良卡、花一样的钱。现实中应当**因地制宜**、按土壤短板来改良，成本与效果都该不同。' },
  ]},

  { cat: '部落与土壤', items: [
    { q: '四个部落分别是什么来历？',
      a: '长安部落（华表 · 黄绵土）、古蜀部落（三星堆面具 · 紫色土）、丝绸部落（琵琶 · 西北沙土）、燕都部落（彩陶骆驼 · 丝路）。\n点本窗口右上角「—」收起问答，底面就是《随农记》，分章讲它们的小起源。' },
    { q: '中国的土壤有哪些？',
      a: '《随农记》第五章讲了十一种土：黄绵土、东北黑土、南方红壤、江南水稻土、四川紫色土、山东棕壤、荒漠土、云贵黄壤、海南砖红壤、青藏草甸土……每一种都连着当地的作物与人家。' },
  ]},
];

/* ================= 《随农记》：四个部落的小文化 + 中国土壤的故事 ================= */
const BOOK = [
  {
    no: '卷首', title: '随农记', sub: '写在田埂边 · 一本随手的小册子', color: '#8a6416',
    body: [
      '水土有灵，滋养一方生民。《随农记》记四部缘起，叙中土壤色之由来，留存田埂阡陌间口耳相承的老话。',
      '牌局胜负，转瞬可再；而水土育人的真谛，值得慢慢品读。',
      '掌心每一张土地卡，都连着真实的乡野土地，载着鲜活的人间故事。展卷细读，再低头凝望足下故土，所见已然不同。'
    ],
    note: '小禾按：读不读都不要紧，不影响赢牌。'
  },
  {
    no: '第一章', title: '华表之下，麦浪千顷', sub: '长安部落 · 立于中原沃土', color: '#4f9ed6',
    body: [
      '长安部落的图腾是一根华表。相传尧舜之时，人们在路口立木为表，谁有想说的话都能刻在上头——那是中国最早的「意见箱」。后来木头换成了白玉，立在宫门前，成了中原人立身处世的一根脊梁。',
      '他们世居黄河中下游。黄河一涨一落，用了几十万年，把西北高原的黄土一车车搬到这里，铺成一层松软厚实的**黄绵土**。粉性重、土质绵，风一吹能起尘，雨一落便成泥。',
      { h: '中原的农谚', v: '「麦收八十三场雨」，说的就是这块地上小麦一季要的雨水。这里的人看天吃饭看了几千年，也就把节气和农时刻进了骨头里。' },
      '所以长安部落种水稻、种小麦都顺手——平原一望无际，犁得开、灌得匀，是天生的大粮仓。'
    ],
    note: '小禾按：长安人「沃野中原」的特长，正是这块黄绵土给的。'
  },
  {
    no: '第二章', title: '纵目青铜，稻香岷江', sub: '古蜀部落 · 三星堆与天府之国', color: '#4e7350',
    body: [
      '古蜀部落的面孔，是一张青铜纵目面具——眼睛像两根伸出的柱子，耳朵阔得像展开的翅膀。三千多年前，他们把这些面具埋进祭祀坑，直到今天挖出来，仍然让世人愣住：原来蜀地早就有了这样奇诡的想象力。',
      '他们住在四川盆地。四面是山，中间是一块紫红色的**紫色土**，由紫色砂岩风化而成，天生带着磷和钾，肥得很。',
      { h: '都江堰的智慧', v: '战国时李冰父子在岷江上修了都江堰，把一条闯祸的江，变成灌溉千里、旱涝从人的水。从此「水旱从人，不知饥馑」，这片盆地成了天府之国。' },
      '古蜀人最早驯化水稻。水里有稻、山里有铜、心里有神——稻香与青铜，就是他们的两副面孔。'
    ],
    note: '小禾按：古蜀种水稻成本减半，是「稻作之源」的老本行。'
  },
  {
    no: '第三章', title: '琵琶声里，驼铃向西', sub: '丝绸部落 · 玉门关外追风千里', color: '#b8843f',
    body: [
      '丝绸部落的图腾是一把琵琶。曲项、四弦、十四品。它原本不是中原的乐器，是从西域一路「走」进来的——驼背上驮着丝绸出去，驮着琵琶、葡萄和曲子回来。',
      '他们守在玉门关一带。关外是**西北沙土**与**荒漠土**：土质疏松、通透性极好，就是存不住水，养分跑得快。可偏偏这样「贫」的地，昼夜温差大，瓜果甜得能齁人。',
      { h: '追风之意', v: '「追风千里」，说的是商队昼行夜伏、逐水草而行的本事。别人一回合走一步，他们常能多赶一程——路，就是他们的本钱。' },
      '风沙里长不出娇气的作物，却养出了最耐旱的种田人。'
    ],
    note: '小禾按：丝绸部落每两回合能追加掷一次「追风骰」，正是骆驼商队的脚力。'
  },
  {
    no: '第四章', title: '彩陶纹间，四时有序', sub: '燕都部落 · 马家窑彩陶与商队', color: '#c85f2e',
    body: [
      '燕都部落的图腾是一头彩陶骆驼，身上画着马家窑式的菱格与波纹。五千年前，先民把涡旋的水纹、交错的菱格画在赭红的陶盆上——那是他们对河流、对四季最早的描摹。',
      '他们长于行走与交换，把各地的种子、农具和见识带到一起。彩陶上的纹样，其实也是一部「交流史」：纹样走过的地方，就是商路走过的地方。',
      { h: '陶上的节气', v: '菱格像田垄，波纹像江河，圆圈像太阳。古人未必懂气象学，却把四时更替一笔一笔记在了陶罐上，过日子就是照着这些纹路来的。' },
      '燕都人常年在路上，每绕行一圈回到起点，都能多得一份盘缠——走得越远，见到的土就越多。'
    ],
    note: '小禾按：燕都部落「丝路商队」每经过起点额外 +15 肥力币。'
  },
  {
    no: '第五章', title: '一方水土，养一方人', sub: '中国土壤的故事 · 土有十一色', color: '#8a5a2e',
    body: [
      '中国之大，土也各不相同。古人说「土爰稼穑」，意思是土地能长庄稼——可长什么、长得好不好，得看是哪一方土。',
      { h: '黄绵土 · 黄土高原', v: '「面朝黄土背朝天」说的就是它。冬暖夏凉的窑洞、漫天飞舞的黄尘，都在这一层绵软的粉土上。它疏松易耕，却也怕冲刷，黄河的黄，正是它被水带走的身影。' },
      { h: '东北黑土 · 北大荒', v: '抓一把能攥出油来。这是世界三大黑土之一，腐殖质厚得惊人，一茬一茬的玉米大豆养活了整个东北。老话说「黑土是祖宗留下的家底」，如今人们也在喊：「别把黑土种薄了。」' },
      { h: '南方红壤 · 江南丘陵', v: '强酸性、黏重而贫瘠，是它给外人的印象。可茶树偏偏就爱这一口——**南方红壤**上的茶，回甘最足。土不合意，是没找对作物。' },
      { h: '江南水稻土 · 长江中下游', v: '这是人工「养」出来的土。几千年插秧、灌水、潴育，先民把它养成了一层保水保肥的活土。「南稻北米」的格局，就架在这层水稻土上。' },
      { h: '四川紫色土 · 盆地', v: '紫色砂岩风化而来，富含磷钾，天生肥。承「天府」之名，担得起油菜与水稻的丰饶。' },
      { h: '山东棕壤 · 胶东丘陵', v: '微酸性、质地适中，最宜花生。「沙土地里出花生」，落果埋土、长短深浅都有讲究。' },
      { h: '荒漠土 · 塔里木', v: '干旱少雨，盐分爬上地表结成硬壳。这里种田靠的是「水」——有渠就活，无水就荒。' },
      { h: '云贵黄壤 · 高原', v: '亚热带湿润，黏粒把土染成黄褐色，肥力中等偏上。山有多高，田就有多高，梯田是人与自然商量出来的样子。' },
      { h: '海南砖红壤 · 热带', v: '高温多雨淋溶剧烈，铁铝氧化物富集，土红得像砖。稻子能种两季，橡胶和菠萝也在这里安家。' },
      { h: '青藏草甸土 · 高寒', v: '草根密密麻麻织成一层「草毡」，腐殖质积累不少，可惜土温低、生长期短。青稞却耐得起，四千米的海拔上，它照样结穗。' }
    ],
    note: '小禾按：这就是为什么游戏里「种对土壤」收益更高——不只是数值，是道理。'
  },
  {
    no: '卷尾', title: '记', sub: '把土的故事带回牌桌', color: '#8c2a20',
    body: [
      '四个部落，四段来路。',
      '册子翻到这里，就翻完了。'
    ],
    note: '小禾说：记完了，随时点「🏮 新手教程」，接着查牌桌上的事。'
  }
];

/* ================= 面板结构 =================
   PC（≥1500px）入口 = 预留列里的灯笼罩 .ai-launch；
   手机 / 窄屏（<1500px）入口 = 底栏 #ai-entry 的两个按钮（见 index.html）。 */
const SLOT_HTML = `
<button class="ai-launch" id="ai-launch" type="button" title="打开新手教程 · 问答手册">
  <span class="ai-launch-ic">🏮</span><span>新手教程</span>
</button>

<div class="ai-slot">
  <div class="ai-tag">新手教程 · 问答手册</div>

  <!-- 底层：随农记 -->
  <div class="ai-book">
    <div class="ai-stitch"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="ai-book-inner">
      <div class="ai-book-head">
        <div class="ai-book-seal">记</div>
        <div class="ai-book-title"><b>随农记</b><em>四个部落与一方水土</em></div>
        <button class="ai-call" id="ai-call" type="button">🏮 回到问答</button>
      </div>
      <div class="ai-cats" id="ai-cats"></div>
      <div class="ai-page" id="ai-page"></div>
      <div class="ai-book-foot">
        <button class="ai-nav" id="ai-prev" type="button">‹ 上一章</button>
        <button class="ai-nav" id="ai-next" type="button">下一章 ›</button>
        <span class="ai-idx" id="ai-idx"></span>
      </div>
    </div>
  </div>

  <!-- 上层：新手教程 · 问答 -->
  <aside class="aiwin" id="aiwin">
    <div class="ai-rod top"><span class="cap l"></span><span class="cap r"></span></div>
    <div class="ai-paper">
      <div class="ai-head">
        <div class="ai-seal">禾</div>
        <div class="ai-who"><b>小禾</b><i>新手向导 · 农事问答</i></div>
        <button class="ai-ibtn" id="ai-min" type="button" title="翻到背面的《随农记》">—</button>
        <button class="ai-ibtn" id="ai-hide" type="button" title="收起教程（点右下角灯笼罩再打开）">✕</button>
      </div>
      <div class="ai-cats" id="ai-qcats"></div>
      <div class="ai-qlist" id="ai-qlist"></div>
      <div class="ai-foot-note">
        <span>离线问答手册 · 答案以《规则》为准</span>
        <span class="mdl" id="ai-count">共 0 问</span>
      </div>
    </div>
    <div class="ai-rod bottom"><span class="cap l"></span><span class="cap r"></span></div>
  </aside>
</div>`;

/* ================= 启动 ================= */
const host = document.getElementById('aihelper');
if (host) {
  host.innerHTML = SLOT_HTML;
  init();
}

function init() {
  const $ = id => document.getElementById(id);

  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  /* ---------- 随农记（线装书） ---------- */
  const pageEl = $('ai-page'), catsEl = $('ai-cats'), idxEl = $('ai-idx');
  let ch = 0;

  function renderCats() {
    catsEl.innerHTML = BOOK.map((c, i) =>
      `<button class="ai-cat${i === ch ? ' on' : ''}" data-i="${i}" type="button">${c.no} · ${c.title}</button>`
    ).join('');
    catsEl.querySelectorAll('.ai-cat').forEach(b =>
      b.addEventListener('click', () => { ch = +b.dataset.i; drawBook(); }));
  }
  function drawBook() {
    const c = BOOK[ch];
    pageEl.innerHTML = `
      <div class="pg-no">${c.no}</div>
      <h3 class="pg-h" style="border-left:4px solid ${c.color};padding-left:10px">${c.title}</h3>
      <div class="pg-sub">${c.sub}</div>
      <div class="pg-rule"></div>
      <div class="pg-page">
        ${c.body.map(x => typeof x === 'string'
          ? `<p>${md(x)}</p>`
          : `<h5>${x.h}</h5><p>${md(x.v)}</p>`).join('')}
      </div>
      ${c.note ? `<div class="pg-note"><b>${c.note.slice(0, 3)}</b>${md(c.note.slice(3))}</div>` : ''}`;
    idxEl.textContent = `${ch + 1} / ${BOOK.length}`;
    $('ai-prev').disabled = ch === 0;
    $('ai-next').disabled = ch === BOOK.length - 1;
    catsEl.querySelectorAll('.ai-cat').forEach(b => b.classList.toggle('on', +b.dataset.i === ch));
    pageEl.scrollTop = 0;
    pageEl.style.animation = 'none'; void pageEl.offsetWidth; pageEl.style.animation = '';
  }
  $('ai-prev').addEventListener('click', () => { if (ch > 0) { ch--; drawBook(); } });
  $('ai-next').addEventListener('click', () => { if (ch < BOOK.length - 1) { ch++; drawBook(); } });

  /* ---------- 问答手册 ---------- */
  const qcatsEl = $('ai-qcats'), qlistEl = $('ai-qlist'), countEl = $('ai-count');
  let qi = 0;
  countEl.textContent = '共 ' + QA.reduce((n, c) => n + c.items.length, 0) + ' 问';

  function renderQcats() {
    qcatsEl.innerHTML = QA.map((c, i) =>
      `<button class="ai-cat${i === qi ? ' on' : ''}" data-i="${i}" type="button">${esc(c.cat)}</button>`
    ).join('');
    qcatsEl.querySelectorAll('.ai-cat').forEach(b =>
      b.addEventListener('click', () => { qi = +b.dataset.i; renderQcats(); renderQlist(); }));
  }
  function renderQlist() {
    const c = QA[qi];
    qlistEl.innerHTML = c.items.map((it, i) => `
      <div class="ai-qwrap">
        <button class="ai-q" type="button" data-i="${i}">
          <span class="qn">${i + 1}</span>
          <span class="qt">${esc(it.q)}</span>
          <span class="qc">▾</span>
        </button>
        <div class="ai-a"><div class="ai-a-in">${md(it.a)}</div></div>
      </div>`).join('');
    qlistEl.querySelectorAll('.ai-q').forEach(b =>
      b.addEventListener('click', () => b.parentElement.classList.toggle('open')));
    qlistEl.scrollTop = 0;
  }

  /* ---------- 开合 ---------- */
  const aiwin = $('aiwin');
  /* 入口在底栏（index.html 的 #ai-entry，不归 #aihelper 管），按 id 取。 */
  const qaBtn = $('ai-open-qa'), bookBtn = $('ai-open-book');

  /* 标出当前展示的是「问答」还是「随农记」 */
  function mark(which) {
    if (qaBtn) qaBtn.classList.toggle('on', which === 'qa');
    if (bookBtn) bookBtn.classList.toggle('on', which === 'book');
  }
  function showQA()   { setOpen(true); aiwin.classList.remove('rolled'); mark('qa'); }
  function showBook() { setOpen(true); aiwin.classList.add('rolled');    mark('book'); }

  $('ai-min').addEventListener('click', showBook);    // 卷起 → 露出《随农记》
  $('ai-call').addEventListener('click', showQA);     // 回到问答
  $('ai-hide').addEventListener('click', () => setOpen(false));
  /* PC（≥1500px）预留列里的灯笼罩：只开面板，保留上次是问答还是随农记（手机端被 CSS 隐藏） */
  const launchBtn = $('ai-launch');
  if (launchBtn) launchBtn.addEventListener('click', () => setOpen(true));
  /* 手机 / 窄屏（<1500px）底栏的两个入口 */
  if (qaBtn) qaBtn.addEventListener('click', showQA);
  if (bookBtn) bookBtn.addEventListener('click', showBook);
  /* 窄屏是整屏透明层，点空白处（= 点到容器本身）收起 */
  host.addEventListener('click', e => { if (e.target === host) setOpen(false); });

  /* 开合：宽屏只切换自身显隐，预留列常驻（见 style.css），不影响图板几何 */
  function setOpen(v) {
    document.body.classList.toggle('ai-open', v);
  }

  /* ---------- 开场 ---------- */
  renderCats();
  drawBook();
  renderQcats();
  renderQlist();
  if (QA[0] && QA[0].items[0]) qlistEl.querySelector('.ai-qwrap').classList.add('open');  // 默认展开第一问

  /* 宽屏默认展开；窄屏默认收起（点底栏「新手教程」按钮打开）。
     简约版例外：那一列已经被让给棋盘放大用了，教程默认收起、把右侧留给日志与骰子。 */
  mark('qa');
  const simpleOn = document.body.classList.contains('simple');
  setOpen(!simpleOn && window.innerWidth >= WIDE_MIN);
}