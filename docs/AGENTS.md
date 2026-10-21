# AGENTS.md —— 《菜农部落》交接文档

>给接手的 AI agent / 人类开发者。**先读「四、架构约定」，再动手。**
>最后更新：2026-10-12。
>- 规则/机制的**权威来源**：`cn-village/SPEC.md`（引擎唯一事实来源，配 `test/spec.test.js`）。
>- 玩家向口语规则：`cn-village/游戏规则.md`（详尽）与 `README.md`。
>- 每轮开发日志：`.workbuddy/memory/*.md`，**遇到奇怪现象先翻那里。**

---

## 一、这个项目是什么

浏览器里直接能玩的 2D 桌游《菜农部落》，农业科学主题。
纯静态、无构建、无依赖 —— 用 `<script type="module">` 直接跑 ES Module，改完刷新即可（**不需要 npm install / 打包**）。

它同时是**课程教具**：游戏机制里忠实保留了原版设定的 4 个「科学性 BUG」，
让学生试玩找茬、科学探究后修改规则并验证效果。
这 4 个 BUG 的教学内容保留在 `游戏规则.md` 第 19 节、`SPEC.md` 第 6 节、
`新手教程.md` 第八节与 `src/aihelper.js` 的问答里；
⚠️ **但游戏内的规则弹层（`main.js` 的 `openRules()`）已于 2026-10-18 删掉 BUG 段落** ——
面向玩家的规则只讲玩法，不讲课程缺陷。改 `openRules()` 前先看这条。

---

## 二、怎么跑起来

```bash
cd "C:/Users/lzh14/OneDrive/桌面/菜农部落课程包最终版/cn-village"
"C:/Users/lzh14/.workbuddy/binaries/python/versions/3.13.12/python.exe" serve.py 8932
```

- 电脑版 → http://127.0.0.1:8932/index.html（**唯一入口**，开篇 + 玩法介绍已内嵌在 index.html 里）
  - **开篇每次进站都必现**（2026-10-15 定规）。原先用 `localStorage[cnvillage.introseen.v1]`
    记忆「看过」只弹一次，实测导致玩家第一次点掉后就再也回不到开篇，表现为
    「一打开直奔主体，home 没用」。现在 `src/intro.js` 里 `showIntro` 是
    **`const`，只在 boot() 读一次**：只有地址栏显式 `?intro=0` 才跳过开篇。
    ⚠️ 任何函数都不许再给 `showIntro` 赋值 —— 一赋值抛
    `TypeError: Assignment to constant variable`，函数当场中断，
    症状是「顶栏 🏮 开篇按钮点了完全没反应」而不报错，极难定位（踩过，2026-10-15）。
  - 顶栏「🏮 开篇」按钮由 `intro.js` 的 `boot()` 绑定（`#btn-intro`），不进主体也能回开篇。
  - ⚠️ 任何 iframe 加载 `index.html` 的测试页，src 必须带 `?intro=0` ——
    开篇是 `position:fixed; z-index:200` 的整页覆盖层，会挡住测试页里的棋盘。
  - **封面只展示部落，不提供选择**（2026-10-18）。四张卡片不再有「点选 / ✓ 你当前选择的部落」
    按钮位，也没有 `.on` 高亮，`cursor:default`（`intro.css` 里必须显式写 ——
    `style.css` 里另有一条 `.pickcard{cursor:pointer}` 给单机「选部落」弹层用，两处共用 class）。
    选部落改由**开局顺序弹窗**与单机模式的「选部落」弹层（`openChooseTribe`）承担。
  - **底图（水墨中国地图）分两层**：`.intro-mapbg`（1772×1200 原图，`opacity:.40`）
    + `.intro-mapveil`（米色纱，压住抢眼处）。
    ⚠️ 两个必须一起调的坑：① 纱层**不能用 `::after`**——底图是 `<img>`，伪元素不渲染；
    ② **不要给这两层加 `backdrop-filter`**，它会把底图本身一起模糊。
    `opacity` 与纱的浓度是一对：`.44` 时山峦深色块会压到标语行。
  - **操作按钮组（`.intro-go`）在匾额正下方**，不在页面末尾（2026-10-18）。
    它上面盖了一层**实色宣纸托板**（`padding` + 渐变底 + 外发光）——
    按钮压在地图山峦上，半透明底会让纹样透上来。
    ⚠️ 必须 `display:flex` + `width:fit-content`，**不能用 `inline-flex`**：
    inline-flex 是行内级，会跟在匾额（inline-block）的行内位置后面跑偏到页面右侧。
  - **封面已删除模式切换（`.intro-modes`）**：顶栏 `#mode-seg` 是唯一入口。
    `intro.js` 里那段绑定加了判空，`syncTip()` 不再按模式变文案。
  - **封面文字一律不许半透明**：`kbd` 与 `.intro-ghost` 都用实色
    （`#fffdf7` 系），不要写 `var(--panel-hi)` 之类半透明变量。
  - **宣纸柔化层 `.intro-paperwash`**（在 mapveil 之后、`.intro-screen` 内）：
    只在最上面一小段托住标题区就往下化开。⚠️ 别加重 —— v1 用 `.86/.74/.52`
    把标语糊成一片白，文字比有底纹时**更**看不清；
    底图纹样与文字是「纹 vs 字」，中灰衬底反而最清楚。
- 手机版预览 → http://127.0.0.1:8932/手机/mobile.html（414×896 设备外框预览页）
  ⚠ **已归档，不再维护**：手机版外壳 2026-10-15 移到 `cn-village/手机/`（见该目录 `说明.md`）。
  游戏本体只有 `index.html` 一份，手机与 PC 共用；手机上直接开 `index.html` 即可（同一套响应式版面）。
  真机要给别人的链接一律发 `index.html`，不要发 `手机/mobile.html` —— 那层外框在手机上会「手机里再套一台手机」。

⚠️ **必须用 `serve.py`（带 `Cache-Control: no-cache`），不要裸 `http.server`**：裸服务不带缓存头，浏览器会启发式缓存 JS 模块，出现「新 main.js + 旧 engine.js」混搭的**假 bug**。serve.py 每次保证新鲜，未改动文件仍走 304。
⚠️ **必须走 HTTP，不能 `file://`**（ES Module 有 CORS 限制）。

---

## 三、目录结构

```
cn-village/
├── index.html            页面骨架 + 开篇/介绍引导层 + 顶栏 + 棋盘容器（**唯一入口**）
├── intro.css             开篇与玩法介绍引导层样式（全部 .intro-* 前缀，与 style.css 零冲突）
├── 手机/                  ⛔ 已归档：手机版 414×896 预览外壳 + 说明.md，不使用
├── style.css             全部样式
├── SPEC.md               ★ 游戏机制说明书（规则/状态/回合序列，测试以它为准）
├── DESIGN.md             ★ 底层运行逻辑设计规范（数据 vs 函数 / 状态机 / 反模式清单）
├── 游戏规则.md            面向人类玩家的完整规则（21 节）
├── 新手教程.md            新手教程「小禾」问答手册的文字版（9 类 / 33 问，与浮层同源）
├── README.md             玩法说明
├── src/
│   ├── data.js           静态数据：土地11 / 作物10 / 气象6 / 改良卡12 / 赛道 TRACK / 规则 RULES
│   ├── motifs.js         部落定义 TRIBES + 纹样 SVG + 部落特长 TRIBE_TRAITS
│   ├── tribes.js         「部落字典」：纯数据 + 读写器
│   ├── engine.js         引擎：所有规则与结算，纯函数，不碰 DOM
│   ├── cardArt.js        SVG 卡面绘制（土地/作物/卡牌/格子贴片）
│   ├── cellPositions.js  赛道 32 格的坐标表（实测底图）
│   ├── handbook.js       图鉴弹层（全量卡牌参考书）
│   ├── bgm.js            ★ 背景音乐**独立模块**（与游戏完全解耦）
│   ├── codex.js          ★ 农耕志**荣誉层**（成就/图鉴/我的农事；存档独立，不写进 G）
│   ├── aihelper.js       ★ 新手教程「小禾」问答手册 +《随农记》（独立浮层，不读写 G，纯静态问答）
│   └── main.js           UI 层：渲染、交互、回合流程（最大）
├── test/                 见「七、测试」
├── tools/                出图/标定用 Python 脚本（非运行时依赖）；`adts_to_m4a.py` 换壳 BGM
├── shots/                验收截图
└── assets/
    ├── board_full.png    外圈赛道卡底图（1963×1482）
    ├── board_map.png     中心地图（1772×1200）
    ├── bgm.m4a           背景音乐（94.3 秒 / 48kHz 立体声 / 256kbps，循环）
    ├── bgm_raw.aac       原始裸 AAC（换壳输入）
    └── cards/            11 张土地卡面 PNG
```

> 曾经的 3D 方案（`map3d.js` / `terrainData.js` / `vendor/three*`）已随功能下线全部删除，**不要恢复这条线。**

---

## 四、架构约定（改之前务必读）

### 1. 「部落字典 + 引擎函数」分层

| | 职责 | 位置 |
|---|---|---|
| **部落字典** | 纯数据，只记录「它现在有什么」，**无任何规则** | `src/tribes.js` |
| **引擎框架函数** | 所有规则/判定/结算，只读写字典 | `src/engine.js` |

字典栏目：`money / pos / seeds 种子栏 / hand 改良栏 / weatherCards 气象栏 /
lands 土地栏 / freeLandCards / skipTurns / extraRollLeft / extraRollCd /
harvestedThisTurn / bankrupt 破产标记 / log`

读写器：`seedCount / addSeed / takeSeed / addImprove / dropImproveTo /
addWeather / shiftWeather / addLand / getLand / markHarvested / clearHarvestMarks`

**收益**：同一条规则只写一次，四个部落自动遵守；字典可 JSON 序列化。
判据、反模式清单与落地检查表见 **[`cn-village/DESIGN.md`](cn-village/DESIGN.md)**。

### 2. ⚠️ seat 与 turn 是两套东西 —— 最容易踩的坑

```
seat  = 部落「坐在第几号位」，0~3，永远不变（A/B/C/D 的数组下标）
turn  = 行动顺序里的「第几位」，每局随机打乱，存在 G.order 里
```

**`g.players[g.turn]` 是错的**（turn 是次序不是座位，那样写会拿到别人）。

```js
// engine.js
curPlayer(g)      // 当前行动者对象
// main.js
curSeat()         // 当前行动者所在的座位 = G.order[G.turn]
cur()             // 当前行动者对象
isAITurn()        // 当前行动者是不是电脑
```

**判据**：只有**回合流程**（掷骰 / 换手 / AI 行动）才用当前行动者；
凡是「展示给玩家看的东西」（土地面板、种植弹层、种子集市、落格操作）都用 `viewMe()` —— 单机模式下你选的部落与当前行动者**不是同一个**。

### 3. 赛道是三张索引表，必须同序

| 表 | 用途 |
|---|---|
| `TRACK`（data.js） | 格子**内容**（哪种土、哪个站） |
| `CELL_POS`（cellPositions.js） | 格子**中心坐标**（棋子定位） |
| `CELL_RECTS`（cellPositions.js） | 格子**矩形框**（画卡面、点击区） |

改任何一张，**另两张必须同步**，然后跑 `test/track.test.js`（校验 `CELL_RECTS` 中心 == `CELL_POS`）。

### 4. 图板是两层叠加，不是换图

```
#board       board_full.png   外圈 32 张印刷赛道卡
#board-map   board_map.png    只盖中间那块地图
```

CSS 变量 `--map-x0/x1/y0/y1`（在 `:root`）定义中心区边界。
**必须 `object-fit: fill`**（不是 cover）—— 新图比例与空洞不同，cover 会留白露馅。

### 5. z-index 必须显式排

```
board=1  board-map=2  slots=3  cells=4  pawns=5
```
这些层原本靠 DOM 顺序叠，插进中间一层后不补 z-index，格子会被地图盖住。

浮层：`waiting=30 aihelper=26 loading=90 modal=60 banner=70 intro=200 ordergate=210`

### 5b. ⚠️ 自己写了 `display` 的浮层，必须再补一条 `[hidden]{display:none}`

**作者样式的优先级压过浏览器 UA 的 `[hidden]{display:none}`。**
漏写时 `hidden=true` 的元素照样铺满全屏、把所有点击吃掉，**而控制台一行错误都没有**。

已补齐：`#ordergate` / `#loading` / `#waiting`（`.modal` / `.banner` 走各自的类规则）。
2026-10-18 加 `#ordergate` 时漏写这条，症状是 ui.test 从 281 条掉到 266 条、
大量段落「没执行」但零 FAIL —— 极难判断，第一反应会误以为是超时。

> 与「const 被赋值导致函数中断」是同一类坑：**症状与原因完全脱钩**。
> 无头测试出现「莫名少跑一截 / 点了没反应」时，先去 dump 的 DOM 里搜
> `id="errbar"`（运行时异常）和 `elementFromPoint` 的实际命中元素。

### 5c. 行动顺序是弹窗，不是顶栏常驻条

2026-10-18 从顶栏搬进 `#ordergate` 弹窗：

- `newGame(gate)`：`gate=true` 时先弹顺序窗，把 `nextTurn` 挂进 `PENDING_START`，
  点「知道了，开始」（或 Esc）才真正走第一回合 —— 否则 AI 会在你还没看完顺序时掷完骰。
- **省略 `gate` 参数时行为与从前完全一致**（测试与连续开局都走这条，不会被弹窗挡）。
- 弹窗在**入场时刻**才出现：开篇点「进入田亩」→ `intro.js` 发 `cnv:entergame` 事件
  → `main.js` 里 `newGame(true)`。两个模块互不 import，只靠事件通信。
- ⚠️ 单机模式的「选部落」弹层确认键（`#pick-ok`）**不能**用 `newGame(true)`：
  它的语义是「我准备好了，直接开打」。曾误改成 gate 版，导致 ui.test §4 点了 `pick-ok`
  之后顺序窗一直盖在屏幕上没人关，后续 §25 的 `elementFromPoint` 断言直接读到 `ordergate`。
- `#orderstrip` 的 **id 不能删**（`iter.test.html` R7 段查它），只是搬进了弹窗里；
  且 `.os-chip` 的 `textContent` 必须**严格等于部落名**，「第 N 位」放在外层 `.og-cell` 里。

### 6. 回合流程只有一条状态机：`playTurn(g, aiMove)`

真人（UI 的 `runAiTurn` / 落格操作）与 AI（测试里的 `playTurn`）**走同一条序列**，顺序固定：

```
① 掷骰（含监狱判定） → ①b 追风追加掷骰 → ② 一次走完所有步数
→ ③ 落格结算（过路费 / 集市 / 气象站…） → ④ 决策（买地 / 种植 / 收获 / 用卡） → ⑤ 收尾换手
```

**关键约束：决策发生在「移动落格之后」，不是回合开始。**
（历史教训：`runAiTurn` 里在回合开始和落格后各调一次 `aiPlan()`，等于电脑一回合做两次决策，平衡崩坏。）
测试与 UI 必须共用这一条序列，否则「引擎测得对、UI 里行为不一样」。

### 7. `window.__game` 调试 API（测试用，业务代码别依赖）

| 方法 | 作用 |
|---|---|
| `state` | 当前对局状态 G |
| `newGame()` / `setMode('local'\|'solo')` / `setSeat(i)` | 开局与模式 |
| `isAI(seat)` | 某座位是不是电脑 |
| `debug.viewSeat()` | 面板当前展示给哪个座位（= `viewSeat()`） |
| `debug.curSeat()` | 当前行动者座位（= `order[turn]`） |
| `debug.setActor(seat)` | 强制轮到某座位 |
| `debug.turnEpoch` / `winMoney` / `setWinMoney(v)` | 回合纪元 / 胜利线读写 |

**写测试取玩家一律走 `debug.viewSeat()`，不要写死 `players[0]`**（曾误报「检测没扣钱」）。

---

## 五、游戏规则要点（改代码前必读）

- **种子是硬门槛**：手里没有该作物种子卡 = 不能种，不管钱多不多。种子钱在**买卡时**已付，种植只消耗种子卡、cost 恒为 0
- **按片种植（肥力=上限，可少种）**：`plant(g, player, idx, cropId, count=1)` 的 `count` 由玩家自选 `1 ~ 剩余空位`；**n 片 = n 张种子 = n 条作物记录**，每条只记**单片**利润（= `plantingProfit.income ÷ plots`）
- **土地有作物即可收获**：`harvest()` 收下该地**全部**已种作物（不要求种满）。**每回合每块地只能种一轮**：`harvestedThisTurn` 标记，回合初清理
- **延时气象卡**：气象站只发卡不结算，**下一次种植时自动发动**（一次性，只加在第一片）
- **改良卡**：**抽到即一次性获得该卡面值肥力币**；**持有即增益**按面值折算 —— 每张 =（`value` / `IMPROVE_VALUE_MAX(20)`）× 6%，求和封顶 +48%（面值 20 → +6%）。不种作物就没有增益，点击卡牌 = 纯弃牌（不再换钱）
- **付费土壤检测**：土地详情收益表默认雾化，花 5 币解除，一次永久
- **过路费只在最终落点收**：`stepMove` 只对 `idx === player.pos` 结算 —— 落在他人土地上付**地价的一半**（`RULES.passRate = 0.5`，四舍五入、转给地主）；**路过**不收费。`passed[]` 只用于「经过起点奖励」与棋子动画。文案一律用 `RULES.passRate * 100` 拼，别再硬编码百分数
- **种子卡持有上限**：单个作物最多 `seedMaxPerType(3)` 张，**全部作物合计最多 `seedMaxTotal(6)` 张**（每次进集市都受这个总上限约束）。判定在 `engine.buyCrop`；`seedsTotal(player)` 求和，AI 集市循环也会在满 6 张时 break
- **只能站在脚下的地种植（买地同理）**：`plant()` 与 `buyLand()` 都要求 `player.pos === idx`；**收获不受此限**
- **集市价 / 图鉴 / 日志三处一致**：一律走 `traitSeedCost(me, c.id, c.cost)`；`buyCrop` 返回实付 `price`，UI 一律用 `r.price`
- **开局先手 = `order[0]`**：谁排第一谁先走，不认座位
- **欠款上限 50 → 破产出局**：允许欠款（`money` 可为负），下限 `−RULES.debtLimit(50)`；**欠款超过 50** 即破产退出本局 —— `checkBankrupt()` 置 `bankrupt=true`、名下土地**全部回归无主**，`endTurn()` 跳过它，其他部落继续。实际对局里**唯一**把钱包打成负数的是「付过路费」（`payPass` 末尾调用检查）。`−50` 还不算，`−51` 才破产
- **两条胜利途径**（`stepEnd`）：① 当前行动者 `money >= RULES.winMoney` 即获胜；② 其他部落全部破产、只剩 1 个未破产部落（且确有人被淘汰）由它获胜；全员破产 → `winner=null`

---

## 六、当前状态

### 功能全绿

| 项 | 状态 |
|---|---|
| **破产规则** | ✅ `debtLimit=50`；`checkBankrupt`/`activePlayers`；`endTurn` 跳过破产者；`stepEnd` 双胜利途径。UI 灰化 + 「破产出局」标签 + 负数标红。engine §21（12 项） |
| 本地对战换手 | ✅ render() 的 `canRoll` 加 `$('actionbox').hidden`；「结束回合」闭包一次性守卫 |
| 重开作废旧协程 | ✅ 回合纪元 `TURN_EPOCH`：`newGame()` 自增，异步协程每 `await` 后比对、过期即终止。ui §31 |
| 四处规则/结算修复 | ✅ 开局按抽签先手 · 过路费只在落点收 · 集市价三处对齐 · 只能站在脚下种植 |
| 过路费 50% | ✅ `RULES.passRate = 0.5`（地价的一半）；`passRate` 一处定义，UI/日志/SPEC 全用 `passRate * 100` 拼文案 |
| 种子合计上限 6 张 | ✅ `RULES.seedMaxTotal = 6` + `engine.seedsTotal()`；`buyCrop` 拒绝、集市弹层显示「种子卡 n/6」、AI 也遵守 |
| 长安部落改浅蓝 | ✅ `motifs.js` `TRIBES[0].color = '#4f9ed6'`（原朱砂红与燕都橙太像）；图例/格子染色/角标全读 `t.color`，同步改 `style.css` 的 `owned-A` 与 `.mark.A` |
| 胜利线可调 | ✅ 「对局设置」新增「胜利线」输入框（默认 260），存 `cnvillage.winmoney.v1` |
| 背景音乐 | ✅ 独立模块 `src/bgm.js`（打开即播 + 循环）；设置里音量滑块；**0 音量 = 真静音**；存 `cnvillage.bgm.v2` |
| 按片种植 | ✅ 种植弹层「片数选择器」（−/数字/＋），收益随片数实时变 |
| 机制固化 SPEC | ✅ `cn-village/SPEC.md` + `test/spec.test.js` |
| 回合流程单一状态机 | ✅ `playTurn()` 统一 AI 与真人 |
| 3D 死代码清理 | ✅ 活代码 0 引用 |
| **农耕志（成就 · 图鉴 · 我的农事）** | ✅ 入口 `#codex-entry` 在图例（`.legend`）**正下方**（鎏金匾额 + 朱砂「志」印 + 完成度徽章）；弹层四页签。`src/codex.js` 为**独立荣誉层**，存档只写 `localStorage['cnvillage.codex.v1']`，**绝不写进对局状态 G** —— 金币/土地/种子/过路费/破产/AI/胜负全部不受影响，既有测试无需改。挂钩点：`render()`→`codexScan(G)`（落格土壤 / 手上气象卡，静默）、`buyLand`→`mark('farm')`、`onCellClick`→`mark('land')`、`buyCrop`→`mark('crop')`、`🔍 .wikibadge/.wikibtn`（**捕获阶段**委派）→`trace()`。数据源直接复用 `data.js` 的 `LANDS/CROPS/WEATHERS` |
| **新手教程「小禾」问答手册 + 《随农记》** | ✅ **纯静态问答**（点问题看答案），**不联网、不调用任何大模型**。**入口分两套**：**PC（≥1500px）保持原样** —— 入口是教程预留列里的灯笼罩 `.ai-launch`（点开 / 点「✕」收起）；**手机 / 窄屏（<1500px）** 则是底栏 `#bottombar` 里、与「作物卡 · 改良卡」一栏并排的**两个药丸按钮**（`index.html` 的 `#ai-entry`：`#ai-open-qa` 新手教程 / `#ai-open-book` 随农记，CSS 只在 `max-width:1499.98px` 启用、PC 下 `display:none`；事件在 `src/aihelper.js` 绑定）—— 点「新手教程」直开问答，点「随农记」直翻到底面那本线装书。**宽屏（≥1500px）**面板在右下**常驻预留**一列（`#app` 加 `padding-right`，**不改 grid 列**；图板由 `layoutBoard()` 重算），默认展开：顶部分类条（9 类 / 共 33 问）→ 点问题展开答案；点右上「—」把卷轴卷起，露出《随农记》线装书（7 章，可翻章）。**窄屏 / 手机（<1500px）改为右侧弹出面板**（点空白处收起），功能与 PC 一致 —— `mobile.html` 顶栏另有「🏮 新手教程」按钮直接切换内页浮层。`src/aihelper.js` 为**独立浮层**：不读写对局状态 G，不碰引擎 / 规则 / 平衡。问答内容另有文字版 [`cn-village/新手教程.md`](cn-village/新手教程.md) |
| **手机 / 平板横屏版面** | ✅ `style.css` 末尾新增 `@media (orientation:landscape) and (max-width:1499.98px) and (max-height:620px)`：顶栏压成单行 → `#app` 变「左图板（占满高）\| 右列（部落条 2×2 + 日志 + 掷骰）」→ 窄竖列在左。竖屏（≤620px）那挡**语义不变**。`main.js` 加了 `LAND` 媒体查询参与 `layoutBoard` 的让位计算（`colW` 用 `WIDE\|\|LAND`，`colH` 用 `NARROW && !LAND`）。只用 CSS + 一次 `matchMedia`，**不改引擎 / 规则 / 平衡**。验收图 `shots/landscape_{600x360,667x375,900x414}_v4.png` |

### 平衡（`node test/traits.balance.js 300`）

```
平均局长 14.5 回合（2~47）
  长安 17.7% / 古蜀 21.7% / 丝绸 30.3% / 燕都 30.3%
spread = 12.7%   ← 达标（<15%）
```

⚠ 加入「只能站在脚下的地种植」后收益节奏变慢，局长 9.1 → ~14.5、spread 7.0% → ~13%。这是**规则收紧的预期副作用，不是 bug**。要拉回更短节奏就调 `RULES.winMoney`，但需重跑平衡。
（过路费 20% → 50% 会同时加快破产和结算节奏，局长/胜率会跟着飘 —— 每次改 `passRate` 都要重跑本平衡。）

### 五个易踩的实现细节

- **背景音乐**（`src/bgm.js`）：手势补播监听**必须在捕获阶段**（冒泡阶段会被游戏的 `stopPropagation` 吃掉）；0 音量要 `muted=true` + `pause()` 双保险。
- **手机横屏（`orientation:landscape` + 高 ≤620px + 宽 ≤1499.98px）专用版面**（`style.css` 末尾那一挡 + `main.js` 的 `LAND`）：横屏的痛点是**高**不够，所以顶栏压成单行（`.tb-t` 收掉、`.order-wrap` 只留当前行动者、`.brand/.top-actions` 都要 `flex:0 0 auto`，否则 `h1` 会被 flex 收缩挤成竖排）、`#app` 改成「左图板占满高 | 右列（部落条 + 日志 + 掷骰）」（`#players` 2×2、`.pcard` 去进度条缩到 ~52px、`#dice` 的 `min-height:46px` 必须归零，否则掷骰按钮被顶出可视区）、竖列 `.legend-col` 改窄列（宽度 `clamp(118px,21%,168px)`，图板靠 `layoutBoard` 的 `margin-left` 让位）。**两个必做的联动**：① `main.js` 里 `colW` 的让位条件改成 `WIDE.matches || LAND.matches`；② `colH`（竖屏那条底部留白）必须写成 `NARROW.matches && !LAND.matches` —— 横屏在 600px 宽时 `NARROW`(≤620) 也会命中，不排除的话会把 `#stage` 的 `padding-bottom` 设成整条竖列高、图板可用高归零（实测图板只剩 30px + `ResizeObserver` 死循环报错）。另外 ≤620px 的竖屏挡会把 `#scrollzone` 变成真盒子、把 `round-info/.top-actions` 设成 `width:100%`，横屏挡里必须逐条还原（`#scrollzone{display:contents}` 等）。验收图 `shots/landscape_{600x360,667x375,900x414}_v4.png`；竖屏验收 `shots/portrait_500x896_check.png`（未被污染）。
- **手机版图板下缘**：窄屏（≤620px）时把竖列高度 +12px 写进 `#stage` 的 `padding-bottom`，图板下缘让开卡片条；用 `ResizeObserver` 盯竖列高度变化。验收图 `shots/mobile_414x896_after_fix.png`。
- **左上角「我的土地与作物」里的土地卡**（`#myfarms .farm`）：竖列只有 236px（1000~1120px 更窄），卡片必须整体换行布局 —— 图片+文字占第一行、按钮 `flex:0 0 100%` 换到第二行。两个关键点：① `#myfarms` 上还挂着 `.hscroll`，其 `.hscroll .farm{min-width:230px}` 会让卡片**比面板还宽**被裁，必须用 `#myfarms .farm{min-width:0;width:100%}` 压掉；② `.fmain` / `.farm-tip` 的 `flex-basis` 必须写 **0**，写 `auto` 时按内容 max-content 算，面板一窄就被挤到下一行（卡片高度 103→168 跳变、下半截被裁）。另：`.legend` 不要限制 `max-width`（曾压到 110px 导致四行部落名全折两行，吃掉了土地卡的高度）。
- **新手教程列会让图板让位**（`src/aihelper.js` + `style.css` 的 `#aihelper` 段）：≥1500px 时 `#app` **常驻** `padding-right:calc(var(--ai-w) + 22px)`（`--ai-w` 定义在 `body` 上，`#app` 与 `#aihelper` 是兄弟节点，定义在 `#aihelper` 上 `#app` 读不到）。因此 1600 宽下 `#board-wrap` 从 896px 缩到 **608px** —— `test/ui.test.html` §23 的图板宽度阈值已同步降到 560，并新增 **§23b** 校验教程列停靠在日志列右侧、不越界。开合教程**不改** `padding`（常驻），所以图板不会忽大忽小。`<1500px` 时 `#aihelper` 变成整屏透明层（开时 `pointer-events:auto` + 半透明底，点空白收起），面板 `position:fixed` 靠右、宽 `min(440px,100%)` —— 因此**手机 414px 下也能用**（`mobile.html` 顶栏「🏮 新手教程」按钮 = 切 `iframe` 内 `<body>.ai-open`）。入口按钮**分两套**（不要混）：PC（≥1500px）**保持原样** —— `.ai-launch` 灯笼罩放在浮层预留列里（`style.css` 的 `@media (min-width:1500px)`），单机 / 手机端入口则是**静态写在 `#bottombar` 里**的 `#ai-entry`（`.bb-entry` 列 + `.ai-entry-btn` 药丸 ×2），默认 `display:none`，只在 `@media (max-width:1499.98px)` 显示。窄屏下 `.bb-hand` 是 `flex:1`，按钮自动被挤到最右、与「作物卡 · 改良卡」头一行齐平（`≤620px` 再收一档字号/内边距）；桌面端 `.bb-entry` 隐藏 → `.bb-hand` 独自 296px 居中，即原样。

---

## 七、测试

| 文件 | 怎么跑 | 覆盖 |
|---|---|---|
| `test/spec.test.js` | `node test/spec.test.js` | **SPEC.md 一致性**（76 项） |
| `test/engine.test.js` | `node test/engine.test.js` | 引擎（148 项，不碰 DOM；§20 骰子公平性 / §21 破产） |
| `test/traits.balance.js` | `node test/traits.balance.js 300` | 平衡（局长/胜率/spread） |
| `test/traits.scan.js` | `node test/traits.scan.js 200` | 特长参数扫描 |
| `test/track.test.js` | `node test/track.test.js` | 赛道几何 + 三表一致性（9 项） |
| `test/track-content.test.js` | `node test/track-content.test.js` | 每格内容落在正确的边上（3 项） |
| `test/human-logic.test.html` | 浏览器打开 | **人类思维逻辑验收**（A~AA + r1~r13 共约 40 组；交互是否符合玩家直觉） |
| `test/ui.test.html` | 浏览器打开 `/test/ui.test.html` | UI 交互（278 项） |
| `test/guofeng.test.html` | 浏览器打开 | 国风验收（36 项） |

浏览器测试需先起 HTTP 服务。用无头 Edge 跑（**必须加 `?v=<时间戳>` 防缓存**）：

```powershell
$edge="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$ts=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds(); $tmp="$env:TEMP\edge_$ts"; $dump="$env:TEMP\ui_$ts.html"
Start-Process -FilePath $edge -ArgumentList "--headless=new","--disable-gpu","--user-data-dir=$tmp","--window-size=1620,1020","--dump-dom","--virtual-time-budget=250000","http://127.0.0.1:8932/test/ui.test.html?v=$ts" -NoNewWindow -Wait -RedirectStandardOutput $dump
# 再从 $dump 里抓 <pre id="out">…</pre>
```
（用 `Start-Process -RedirectStandardOutput` 落盘，**不要**用 `& $edge … > file` —— PowerShell 抓不到 Edge 的原生 stdout。）

⚠ 无头 Edge 有最小宽度约 496px，`--window-size=414,896` 不生效；要真机尺寸必须用固定尺寸的同源 iframe。

### 测试里的约定

- `test/engine.test.js` 用 `setActorSeat(g, seat)` 让某部落行动 —— `turn` 是次序，不能写 `g.turn = 2`
- UI 测试用 `w.document`；顶层 await 模块的未捕获异常**不冒泡**，可疑章节用 `try/catch` + `check()` 输出
- **取玩家一律走 `w.__game.debug.viewSeat()`**，不要写死 `players[0]`
- **弹层开关会触发重渲染**：量节点样式前要重新 `querySelector`（旧引用已脱离 DOM）
- **测试开头清 localStorage**：`SEAT_KEY` / `MODE_KEY` / `cnvillage.winmoney.v1` 会跨「重跑」残留
- **测试页与 iframe 是两个 ES Module 实例**：测试页 `await import('/src/data.js')` 拿到的是**另一份** `RULES`，iframe 里 `setWinMoney()` 改的是它自己那份。
  所以断言「运行期被改的常量」要读 iframe 的 `w.__game.debug.winMoney`，不能读测试页的 `data.RULES`；要跑引擎判定就用测试页 `eng` + 默认值
  （否则会出现「设置明明成功、断言却读到旧值」的假 FAIL —— r8 踩过）。

---

## 八、反复踩到的坑（别再踩）

1. **含反引号/`${}` 的代码别用 `python -c` 内联写**（shell 会掏空）。用 Write 写临时 `.js`/`.py` 再执行，或 Edit 逐处改。改完跑 `node --check`（先 `cp x.js x.js.mjs`）。
2. **一个概念涉及多张表时，测试要覆盖全部**（改 `TRACK`+`CELL_POS` 漏 `CELL_RECTS` 的教训）。
3. **改架构时上一轮的测试断言要一起改语义**，否则留下「断言通过但描述旧设计」的假绿。
4. **验证 UI 交互必须走真实点击链路**，不能用 API 代替（绕过事件绑定/弹窗/弹层最容易出问题）。
5. **改动后先跑冒烟测试再交付**：「语法通过」不等于「页面能跑」（曾出现 HTML 有占位节点但 JS 没渲染函数，一加载就炸）。
6. **render() 会无条件重算按钮可用性**：`canRoll` 这类条件必须写全，新增「什么状态不允许操作」时同步补进 `canRoll`，不是只在事件入口挡。
7. **一次性按钮用闭包挡重复触发**：「结束回合」这类触发换手的按钮，onClick 要闭包 `ended` 守卫 + **先收框再执行**（程序化 `.click()` 无视 hidden）。

---

## 九、关键历史教训（详细日志见 `.workbuddy/memory/*.md`）

- **回合/座位别混**（四.2）：`players[g.turn]` 是错的，一律 `curPlayer` / `curSeat` / `viewMe`
- **决策只在落格后**（四.6）：回合开始不做决策，否则电脑一回合决策两次、平衡崩
- **每张表都要同步**（八.2）：赛道三表、集市价三处、$canRoll$ 三处状态
- **规则收紧会动平衡**：加「只能站脚下种」后局长 9→14.5、spread 7%→13%（预期副作用，非 bug）
- **一处百分数定义要贯穿全文**：过路费从 20% 改 50% 时，`engine.payPass` 日志、`main.js` 土地详情、`SPEC.md`、`游戏规则.md`、`README.md`、三份测试里都硬编码过「20% / × 0.2」—— 现在一律 `RULES.passRate * 100` 拼；`test/engine.test.js` 里写死的 `* 0.2` 就是这轮漏改会立刻报 FAIL 的地方
- **竖列里的卡片别沿用横滑样式**（`#myfarms` 挂着 `.hscroll`）：横滑给的是 `min-width:230px`，放进 236px 的竖列就溢出被 `overflow-x:hidden` 裁掉、文字被挤成竖排。详见 §六「三个易踩的实现细节」第 3 条
- **按片记账堵刷钱漏洞**：n 片 = n 条记录，每条只记单片利润；否则一次调用按整地结算会连点刷钱
- **破产规则的单人测试局守卫**：`stepEnd` 的幸存者判定必须 `alive.length===1 && eliminated>0`，否则 `initGame(1)` 未达线也判胜
- **人类逻辑验收**（`test/human-logic.test.html`，A~AA 组，按「玩家会怎么想」写断言）：已抓出并修掉 ——
  ① 收获被「必须种满」门控（`>= cap` → `> 0`，种几片都能收）；② 灾害气象卡 `base` 为正（台风反而 +25 → 改为负数，`sign` 才有意义）；
  ③ 操作框「预计收获」漏算改良卡加成（预估 40 ≠ 实收 50）；④ 破产部落棋子仍按在场渲染（加 `.pawn.out` 灰化）；
  ⑤ 监狱日志自相矛盾「暂停 0 回合后继续」（`engine.stepRoll` 改「本回合暂停行动」）；
  ⑥ **站点文案与实际规则不符**：气象站写「投掷骰子按点数抽卡」（实际直接发 1 张）、改良站写「三选一可购买」（实际自动抽 1 张）、
  监狱写「经过」（实际只有**落在**才停）→ 改 `data.js` `STATIONS.*.desc` 与 `main.js` `openRules()` 的监狱条目；
  ⑦ UI 文案泄漏英文单词 `students` → 改回「学生」（`main.js` `revealBlock` ×2）。
  同时把 `游戏规则.md` §20「已知实现与文案的不一致」更新为「已修复 / 待处理」两栏（#1 灾害卡、#2 监狱文案标为已修复）。
  另追加 r1~r13 共 13 组（买地边界 / 过路费四舍五入与破产联动 / 收获不受脚下限制 / 片数>种子数 / 起点奖励去重 /
  破产清理+棋子灰化+换手跳过 / 追风节奏 / 胜利线可调 / 图鉴完整 / 每地一轮 / 改良封顶 +48% / 土壤适配 / 追风骰范围）——
  **这轮引擎未发现新 BUG**，唯一问题是测试桩自身（见 §七「两个 ES Module 实例」）。
  > 注意：`useImprove`（历史「弃牌换钱」路径）已**删除**；现规则是「抽到即得面值 + 持有按面值折算增益」，
  > UI 点击 = 纯弃牌（见 `human-logic` Z 组）。卡面值 `value` 同时决定「抽到到账」与「持有折算率」。