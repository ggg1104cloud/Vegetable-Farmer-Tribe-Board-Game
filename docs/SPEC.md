# 《菜农部落》游戏机制规格（SPEC）

> **本文是引擎的唯一事实来源（single source of truth）。**
> `src/engine.js` 必须实现本文的全部规则；`test/spec.test.js` 逐条验证。
> 改规则 = 先改本文 → 改 engine.js → 补/改测试 → 跑回归。
>
> 面向玩家的口语化说明见 `README.md`；面向接手开发者的架构与坑见上级目录 `AGENTS.md`。
> 最后校准：2026-10-09（对应 engine.js 当前版本）

---

## 0. 状态模型

### 0.1 三个「位置」概念 —— 最容易混

| 概念 | 含义 | 存放 | 是否可变 |
|---|---|---|---|
| **seat 座位** | 部落坐在第几号位，0~3 | `g.players` 的数组下标 | 永远不变 |
| **order 次序** | 本局行动顺序（座位号的排列） | `g.order` | 每局随机一次，局内不变 |
| **turn 轮次指针** | 当前轮到 order 里的第几位 | `g.turn`（0..3） | 每换手 +1 |

**铁律**：当前行动者 = `g.players[g.order[g.turn]]`。
`g.players[g.turn]` 是**错的**（turn 是次序不是座位）。
引擎用 `curPlayer(g)`，UI 用 `cur()` / `curSeat()` / `isAITurn()`。

**开局先手 = `order[0]`，不认座位**：`turn` 一律从 0 起，谁排在行动顺序第一位就谁先行动。
单机模式**不再**强行把 `turn` 拨到真人座位（那样等于每局玩家先手，与顶栏公示的顺序自相矛盾）。

### 0.2 部落字典（`src/tribes.js`）

每个部落 = 一个**纯数据字典**，只记录「它现在有什么」，不含规则。
所有规则写在 `engine.js` 的框架函数里，只读写字典。

| 栏目 | 类型 | 含义 |
|---|---|---|
| `money` | number | 肥力币 |
| `pos` | number | 赛道格索引，0 = 起点 |
| `seeds` | `{cropId: 张数}` | 种子栏目（种什么由它决定） |
| `hand` | `improveId[]` | 改良栏目（持有即增益） |
| `weatherCards` | `weatherId[]` | 气象栏目（延时卡，下次种植发动） |
| `lands` | `{trackIndex: {soilId, crops[]}}` | 土地栏目 |
| `freeLandCards` | number | 免费买地卡张数 |
| `skipTurns` | number | 监狱剩余暂停回合 |
| `extraRollLeft` | number | 本回合剩余追加掷骰次数 |
| `extraRollCd` | number | 追加掷骰冷却计数 |
| `harvestedThisTurn` | `{trackIndex: true}` | 本回合已收获过的地（防刷钱） |
| `bankrupt` | boolean | 破产退出本局（欠款超过 `RULES.debtLimit`） |
| `log` | line[] | 该部落相关日志 |

读写器：`seedCount/addSeed/takeSeed`、`addImprove/dropImprove/dropImproveTo`、
`addWeather/shiftWeather`、`addLand/getLand`、`markHarvested/harvestedThisTurn/clearHarvestMarks`。
**引擎与 UI 只通过读写器碰字典**，不直接改字段（架构约束，见 AGENTS.md 第四节）。

### 0.3 牌局状态 `G`

```
players[]       四个部落字典
order[]         行动顺序（座位号排列，每局随机）
turn            当前次序指针
round           轮数（order 转满一圈 +1）
over / winner   胜负
landOwners{}    trackIndex -> tid（谁拥有哪块地）
weatherDeck[]   气象牌堆（洗过）
improveDeck[]   改良牌堆（洗过）
marketStock[]   作物牌堆（洗过，集市每次摆前 marketSize 张）
log[]           全局日志
```

### 0.4 赛道 `TRACK`（32 格）

严格顺时针，`TRACK[i]` 与 `CELL_POS[i]`（坐标）、`CELL_RECTS[i]`（矩形）**三表同序**。
`kind` ∈ `land | start | qixiang | nongji | zhongzi | jianyu`。
改任一表必须三表同改，并跑 `test/track.test.js`。

---

## 1. 开局（`initGame(playerCount, opts)`）

- **前置**：无。
- **动作**：
  1. 取前 `playerCount` 个部落，各造一个空字典。
  2. 发基础种子卡（`dealSeedCards`）：从 10 种作物随机抽 `seedDraw=3` 张候选，取前 `seedKeep=2` 张入库（各 1 张，不重复）。
  3. 行动顺序 `order` = 座位号的 Fisher-Yates 洗牌（每局随机）。
  4. 先手补偿：**按行动次序**发 —— `order` 第 k 位行动的部落 +`START_BONUS[k]`，`START_BONUS=[0,25,45,60]`。
     - 若 `opts.startMoney` 给了四部落初始币（对局设置），则**不再叠加**补偿，直接用给定值。
- **状态变化**：`money = startMoney(150) + 补偿`；`pos=0`；`seeds=发的 2 张`；`freeLandCards=1`；其余栏目归零；`turn=0, round=1`。
- **不变量（可测）**：
  - `order` 是 `[0..3]` 的一个排列；`players[order[k]].money === 150 + START_BONUS[k]`。
  - 四个部落开局各有 `seedKeep=2` 张基础种子卡，且互不重复。
  - 所有人 `pos===0`、`freeLandCards===1`。
- **⚠ 坑**：补偿**绝不能按座位号发**。行动顺序已随机，按座位发会让补偿对象与真实先后手错位（实测 spread 8%→37%）。

---

## 2. 回合状态机

一整回合由 5 个阶段顺序组成。`playTurn` 是同步组合；UI 逐步调用同名 `step*` 函数以便播报。

```
① stepRoll        回合开始：清「已收获」标记 + 刷追风机会 + 监狱判定 + 掷骰
   ↓ (若在监狱 → skipped，直接跳到 ⑤)
①b stepExtraRoll  （可选）追风追加掷骰，步数累加进本回合
② stepMove        一次走完所有步数；**只在最终落点**结算：经过起点 / 过路费 / 撞监狱
③ stepSettle      落在哪一格就结算那一格（土地归属播报 / 站点发卡）
④ 决策            买地 / 种植 / 收获 / 用卡（真人点按钮；AI 走 aiPlan）
⑤ stepEnd         胜负判定 + 换手（按 order 推进）
```

- **真人流程与 AI 流程一致**：都是「先掷骰走棋，再对落点做操作」。决策统一放在**移动之后**（AGENTS.md 第六节的历史教训：AI 曾在回合开始多跑一次 `aiPlan`，一回合决策两遍，破坏平衡）。
- **换手**（`endTurn`）：从当前位往后走一格 `turn = (turn + 1) % order.length`；回到 0 则 `round++`；**破产的部落被跳过**（`hops` 兜底防死循环）。`g.over` 时不再换手。
- **事件流**：每个 step 返回 `{events:[...]}`，事件带 `kind`（`dice/start/pass/prison/land/station/weather/improve/market/win`）。

> ⚠ **已知流程分歧（Step 2 待统一）**：UI 的 `runAiTurn()`（`main.js`）走的是**规范流程**（掷骰→移动→操作）。
> 但引擎里的 `playTurn(g, aiMove)`（**只有测试在用**）仍在**掷骰之前**调用 `aiMove`，
> 即电脑会对「上回合落点」做决策，而非本回合落点。因此 `traits.balance.js` 测的是旧流程。
> Step 2 会把 `playTurn` 改成规范流程，届时重跑平衡。

---

## 3. 规则细则

每条格式：**前置 → 动作 → 状态变化 → 事件**。

### 3.1 掷骰（`stepRoll`）

- **前置**：`!g.over`。
- **动作**：清空本回合 `harvestedThisTurn`；刷新追风机会（见 3.2）；监狱判定；否则掷 2 个 d6。
- **状态变化**：`extraRollLeft` 重置/刷新；`skipTurns` 判定；`clearHarvestMarks`。
- **监狱分支**：`skipTurns > 0` → `skipTurns--`，返回 `skipped:true`，本回合不掷骰不移动。
- **事件**：`prison` 或 `dice`。

### 3.2 追风（`stepExtraRoll`，C 部落特长）

- **前置**：`extraRollLeft > 0`。
- **动作**：`extraRollLeft--`；掷 1 颗**特制骰**（1~`extraRollMax=3` 点）。
- **刷新规则**：C 部落每 `extraRollEvery=2` 回合获得一次机会（`extraRollCd` 计数）；机会在回合开始时刷新。
- **事件**：`dice`。步数累加进本回合（不再分两段跳）。

### 3.3 移动与逐格结算（`stepMove(g, steps)`）

- **前置**：无（由回合流程调用）。
- **动作**：`pos = (pos + 1) % 32`，共 `steps` 次；记录 `passed[]`（含起点）。
- **逐格结算**：
  - **经过起点**（`passed` 含起点格）：`money += traitStartBonus(player)`（默认 50；D 部落 +30 → 80）。是**经过**即触发，不只是落在起点。
  - **过路费（只在最终落点收）**：**只有 `idx === player.pos`（真正落在的那一格）**才结算；若该格是他人土地 → 付地价 ×`passRate(0.5)`（地价的一半），四舍五入，钱转给地主。自己的地、无主地、非土地格不收费。**路过的他人土地不收费**（`passed` 只用于起点奖励与棋子动画）。
  - **撞监狱**：只有当**落点**是监狱格（`idx === player.pos`）才 `skipTurns = 1`；路过不触发。
- **状态变化**：`pos`、`money`、`skipTurns`。
- **事件**：`start` / `pass` / `prison`。

### 3.4 落格结算（`stepSettle`）

- **土地格**：只播报归属（无主/自己/他人），不产生金钱变化（过路费在 3.3 已结）。
- **站点格**：
  - `qixiang` 气象站 → `drawWeather`（3.9）。
  - `nongji` 土壤改良站 → `drawImprove`（3.8）。
  - `zhongzi` 种子集市 → 发 `market` 事件，可购买作物卡（3.10）。
  - `jianyu` 监狱 → 由 3.3 处理暂停。
- **事件**：`land` / `station` / `weather` / `improve` / `market`。

### 3.5 买地（`buyLand(g, player, idx, useFreeCard)`）

- **前置（缺一即拒绝）**：
  1. `cellAt(idx).kind === 'land'`（否则「该格不是土地」）。
  2. `!g.landOwners[idx]`（否则「该土地已有主人」）。
  3. `player.pos === idx`（否则「部落不在该格」）。
  4. 用免费卡：`freeLandCards > 0`；否则 `money >= land.price`。
- **动作**：扣 `land.price`（用免费卡则不扣钱、`freeLandCards--`）；写入 `lands[idx]`；`landOwners[idx] = player.tid`。
- **状态变化**：`money` / `freeLandCards` / `lands` / `landOwners`。
- **事件**：日志 `buy`/`good`。
- **返回值**：`{ok, land}` 或 `{ok:false, msg}`。

### 3.6 种植（`plant(g, player, idx, cropId, count = 1)`）

- **前置（缺一即拒绝）**：
  1. 该地属于本部落（`getLand` 非空）。
  2. **部落正站在该格上**（`player.pos === idx`）—— 只能给「脚下的土地」种植；站在 a 地时不能给远方的 b 地（哪怕 b 是自己买的）种植。与 3.5 买地的 `player.pos === idx` 同一把尺子。收获（3.7）**不受此限**（收获是「收自家囤在地里的粮」）。
  3. **本回合这块地还没收获过**（`!harvestedThisTurn`）—— 每回合每地只能种一轮。
  4. 剩余空位够：`1 ≤ count ≤ plotsFor(fertility) − rec.crops.length`。
     **肥力只决定「最多能种几片」，不强制种满** —— `count` 由玩家自选（1~剩余空位）。
  5. **手里有该作物种子，且够本次要种的片数**（`seedCount ≥ count`）← 硬门槛，
     一片一张：种 `count` 片就要 `count` 张种子卡。
- **动作**：消耗 `count` 张种子卡；把 `count` 条 `{cropId, match, profit, weather}` 压入 `rec.crops`。
- **成本**：种植环节 `cost` **恒为 0**（种子钱在买卡/发牌时已付）。
- **利润口径（按片）**：单片利润 = `plantingProfit.income ÷ plots` = `yieldPerPlot`
  （等价于「把省下的这一片种子成本算回去」）；本次总利润 = 单片 × `count` + 气象加成。
  ⚠ 早先的实现一次调用就按「整块地」结算收益、却只压 1 条记录 ——
  中高肥力（3 片）连点 3 次 = 3 倍收益，是刷钱漏洞；现改为按片记账。
- **延时气象**：若 `weatherCards` 非空，**取出 1 张**（一次性）并把 `weather.base`
  加进**第一片**的利润（不是每片都加）。
- **状态变化**：`seeds` −`count`；`lands[idx].crops` +`count`；`weatherCards` 可能 −1。
- **事件**：`plant`。
- **返回**：`{ok, plots:count, match, cost:0, perPlot, profit, fromStock:true, weather}`。

### 3.7 收获（`harvest(g, player, idx)`）

- **前置**：该地有作物（`rec.crops.length > 0`）。
- **动作**：逐片结算
  `片利润 = traitHarvestBonus(...).profit × (1 + improveBonus(player).rate)`；
  累加进 `money`。
- **状态变化**：`money += total`；`rec.crops = []`（地保留）；`markHarvested(idx)`。
- **事件**：`good`/`bad`，含加成明细。
- **口径**：改良卡增益在**部落特长之后**叠加。

### 3.8 改良卡（`drawImprove` / `improveBonus` / `improveCardRate`）

- **获取**：落改良站抽 1 张进 `hand`（牌堆空则重洗）。**抽到即一次性获得该卡面值 `value` 肥力币**（`money += value`）。
- **增益（按面值折算）**：`improveCardRate(im) = (im.value ÷ IMPROVE_VALUE_MAX) × 6%`
  （`IMPROVE_VALUE_MAX = 20`，即面值最高的卡恰好 +6%；面值 5 → +1.5%）。
  `improveBonus` 把手上每张卡的折算率**求和**，封顶 `+48%`。**持有即增益**，不种作物就没有增益（只在 `harvest` 结算）。
- **弃牌**：点击自己的卡 = 纯弃牌（移除该卡、失去它的折算增益），**不再换钱**；`aiPlan` 在超过 8 张时 `dropImproveTo(8)` 弃多余的。
- **状态变化**：`hand`、`money`。
- **事件**：`draw`/`skip`。

### 3.9 气象卡（`drawWeather`）

- **获取**：落气象站抽 1 张，**存进延时卡槽，不立即结算**。
- **发动**：**下一次种植**时自动发动（一次性，用掉即消失）；加 `weather.base`（可为负）。
- **与作物无关**：`base` 是唯一参与结算的数值，**不论种什么作物都加同一个 `base`**（这是课程要学生发现的核心 BUG；`WEATHERS[].match` 只是「优化建议」参考值，引擎不使用）。
- **延时语义**：这一回合不种植，卡就一直留着（可囤多张，按 FIFO `shift` 顺序发动）。
- **状态变化**：`weatherCards`。
- **事件**：`weather`。

### 3.10 种子集市（`buyCrop` / `marketCrops`）

- **前置**：`seedCount(cropId) < seedMaxPerType(3)`；**全部种子合计 < `seedMaxTotal(6)`**；`money >= price`。
- **价格**：`price = traitSeedCost(player, cropId, crop.cost)` —— B 部落水稻种子**成本减半**。
- **动作**：扣钱、`seeds[cropId] + 1`。
- **集市摆货**：`marketCrops(g)` 取 `marketStock` 前 `marketSize=10` 种（= 全部 10 种作物）；牌堆洗过，每局顺序不同。
- **状态变化**：`money`、`seeds`。
- **事件**：`buy`。

### 3.11 监狱（`jianyu`）

- **触发**：**落在**监狱格 → `skipTurns = 1`。
- **效果**：下一个自己的回合 `stepRoll` 中 `skipTurns--` 并跳过掷骰/移动，直接换手。
- **状态变化**：`skipTurns`。
- **事件**：`prison`。

### 3.12 胜负（`stepEnd`）

- **前置**：`!g.over`。
- **判定（两条胜利途径）**：
  1. **达到胜利线**：当前行动者 `money >= winMoney(260)` → `g.over = true`，`g.winner = 该部落`。
  2. **最后幸存者**：其他部落全部破产、只剩 `activePlayers(g).length === 1` **且确实有人被淘汰**
     （`eliminated > 0`，避免单人测试局被误判） → 该部落获胜。
  3. **全员破产**：`alive.length === 0` → `g.over = true`，`g.winner = null`（无人获胜）。
- **动作**：否则正常换手（见 `endTurn`）。
- **事件**：`win`。

### 3.13 破产（`checkBankrupt` / `activePlayers`）

- **规则**：允许部落欠款，钱包下限 = `−RULES.debtLimit`（默认 **50**）。
  欠款**超过**上限（`money < −debtLimit`）即破产、退出本局；其他部落继续，直到只剩 1 个未破产部落（3.12 条件二）。
- **触发点**：`payPass`（付过路费）末尾调用 —— 这是实际对局里**唯一**会把钱包打到负数的途径
  （买地/买卡都有钱数门槛）。恰好等于 `−50` 不破产，`−51` 才破产。
- **动作**：`player.bankrupt = true`；名下土地**全部回归无主**（`delete g.landOwners[...]`、`lands = {}`），
  免得别人把过路费付给已出局的部落。
- **换手**：`endTurn` 跳过 `bankrupt` 的部落；`stepRoll` 顶部再兜一层跳过。
- **事件**：`bad`（`💀 破产退出本局`）。

---

## 4. 部落特长（`TRIBE_TRAITS`，`data.js`）

| 部落 | 特长 | 实现函数 | 规则 |
|---|---|---|---|
| 长安（华表） | 沃野中原 | `traitHarvestBonus` | 山东棕壤/黄绵土收获 **+90%** |
| 古蜀（三星堆面具） | 稻作之源 | `traitSeedCost` + `traitHarvestBonus` | 水稻种子**成本减半**（作用于买卡价）、水稻收获 **+25%** |
| 丝绸（琵琶） | 追风千里 | `stepExtraRoll` | 每 **2** 回合可追加 1 颗 **1~3** 点骰，步数累加 |
| 燕都（彩陶骆驼） | 丝路商队 | `traitStartBonus` | 经过起点额外 **+15**（即 65） |

- **数值刻意克制**：以百分比微调为主，不破坏四部落均衡。
- **结算顺序**：部落特长 → 改良卡增益（见 3.7）。

---

## 5. 参数表（`RULES`，`data.js`）

| 参数 | 值 | 说明 |
|---|---|---|
| `tribes` | 4 | 部落数 |
| `startMoney` | 150 | 初始肥力币（原版 400，简化） |
| `winMoney` | 260 | 胜利线（原版 600，简化）。**默认值**；玩家可在「对局设置」弹层自定义，存 `localStorage` 键 `cnvillage.winmoney.v1`，覆盖后 `RULES.winMoney` 即被改写 |
| `debtLimit` | 50 | 允许欠款上限：`money` 下限 = −50；欠款超过它即破产退出 |
| `startBonus` | 50 | 经过起点奖励（原版 100） |
| `passRate` | 0.5 | 过路费 = 地价 50%（地价的一半） |
| `diceCount` | 2 | 每回合骰子数 |
| `freeLandCards` | 1 | 每人初始免费买地卡 |
| `marketSize` | 10 | 集市每次摆货种数（= 全部 10 种作物） |
| `seedMaxPerType` | 3 | 单一作物囤卡上限 |
| `seedMaxTotal` | 6 | 全部作物种子卡合计上限（每次进集市最多囤 6 张） |
| `seedDraw` / `seedKeep` | 3 / 2 | 开局抽 3 张候选、取 2 张入库 |
| `plots` | 低1/中2/中高3/高3 | 肥力 → 可种片数 |
| `START_BONUS` | `[0,25,45,60]` | **按行动次序**发的先手补偿 |

---

## 6. 课程用的 4 个科学性 BUG（**有意保留**，勿「修好」）

这版游戏忠实还原原始设定，供学生试玩找茬、科学探究后改规则并验证。见 `main.js` `openRules()`：

1. **土壤数据缺失**：只用数字分肥力，没有颜色/pH/质地实测数据。
2. **改良成本一刀切**：劣质土与黑土改良花一样的钱，违背因地制宜。
3. **生物改良无长效**：堆肥与化学改良都是一次性收益，混淆理化改良与生物改良。
4. **气象损益统一**：对水稻和小麦同样奖惩，忽略作物习性与气候适配差异。

> `WEATHERS[].match` 字段存的是「优化后」的建议值，供学生参考对比。

---

## 7. 已知设计取舍

- **局长偏短**：`winMoney=260`（简化版）下 AI 对局平均约 **6 回合**；原版 600 线约 19 回合。
  这是「简化版」的刻意设定。若要拉长局长，调 `winMoney`，但需重跑平衡（见 AGENTS.md）。
  ⚠️ **2026-10-10 起**：加上「只能站在脚下的地种植」（3.6 前置 2）后，AI 对局平均局长
  由约 9.1 回合升到 **17.7 回合**（收益节奏被拉长），spread 13.7% 仍在 15% 目标内。
- **剩余平衡来源**：燕都（D）起点 +30 在短线局中收益占比高，是 spread 的主要来源之一。
- **赛道站点占比**：32 格中土地 18 格、站点 14 格。站点占比过高会稀释土地经营（核心玩法），调赛道时留意。
- **位置门槛是「同一把尺子」**：买地（3.5）、种植（3.6）都要求 `player.pos === idx`；
  收获（3.7）不要求。改任何一处时另两处要一起想清楚。

---

## 8. 测试映射表

| 规格章节 | 验证位置 |
|---|---|
| 0 数据完整性 / 三表同序 | `test/engine.test.js` §1、`test/track.test.js` |
| 1 开局 / 先手补偿 / 基础种子 | `test/engine.test.js` §10、§13、`test/spec.test.js` |
| 2 回合状态机 / 换手 | `test/spec.test.js`、`test/engine.test.js` §6 |
| 3.3 过路费（只在落点收）/ 起点 | `test/engine.test.js` §4、§7、§19、`test/spec.test.js` §3.3 |
| 3.5–3.7 买地/种植/收获 | `test/engine.test.js` §5、§14、§19、`test/spec.test.js` §3.6 |
| 3.10 种子集市（实付价一致） | `test/engine.test.js` §12、`test/ui.test.html` §11 |
| 4 部落特长 | `test/engine.test.js` §11 |
| 5 平衡（局长/胜率） | `test/traits.balance.js`、`test/engine.test.js` §8–9 |
| UI 交互 | `test/ui.test.html`、`test/guofeng.test.html` |

**怎么跑**：

```bash
cd cn-village
node test/spec.test.js          # 本规格的逐条验证
node test/engine.test.js        # 引擎 17 节
node test/track.test.js         # 赛道几何
node test/traits.balance.js 300 # 平衡
```