# MSC 模组开发 cookbook：按改动目标反查 `2.c`

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

这页的目标不是继续解释 common/syscall，而是让逆向者可以按“我要改什么”进入脚本。它假设你已经读过：

- [2.c 运行时系统地图](./2c-runtime-system-map-for-modding.md)
- [逆向 / 模组开发实操导览](./modder-practical-callchain-guide.md)

外部语义来源：

- OverBoost 系统页：https://w.atwiki.jp/exvs2ob/pages/593.html
- OverBoost 初心者指南：https://w.atwiki.jp/exvs2ob/pages/559.html
- デルタプラス页：https://w.atwiki.jp/exvs2ob/pages/416.html
- Notion MSC 页：https://app.notion.com/p/MSC-1601ebad394d8027a042df115e61b6dd

## 总流程：任何动作都先走这 6 步

1. 找玩家指令：主射、副射、特射、特格、格斗、觉醒技、换锁分支。
2. 在 `func_1043` 查 action hash 对应的 `ACTION_*`。
3. 进入 `ACTION_*`，看它安装哪个 runtime：
   - `func_586`：射击 / weapon runtime。
   - `func_488`：格斗 / 特殊移动 runtime。
4. 进入实际 callback，标出：
   - motion：`func_308(...)`
   - 时间点：`func_309(..., time)`
   - 发射 / ammo：`sys_4F(...)`
   - 援护：`sys_51(...)`
   - 移动：`sys_46(...)`、`func_219(...)`、`func_532/535/536`
   - 镜头：`sys_53(...)`、`func_321(...)`
   - 换装 / 模型：`func_887/888`、`sys_4B`、`sys_47`
   - cancel：`func_123(...)`、`func_81(...)`
5. 只改你目标对应的层，不要为了改武器 hash 去动全局 runtime。
6. 记录 overlay 时写 action hash、runtime family、callback 角色和证据，不要只写 `func_N = 名字`。

## 快速判断表

| 你看到的东西 | 人话意思 | 常见改动 |
|---|---|---|
| `func_241(hash, ACTION_*)` | action hash 注册 | 给 action 做稳定索引 |
| `func_586()` | 清射击 runtime | 不作为普通改点 |
| `global677/680/681` | 射击起手 callback / 发射 callback / ammo slot | 改发弹点、弹药槽 |
| `func_488()` | 清格斗 / 特殊移动 runtime | 不作为普通改点 |
| `func_219(row)` | 加载格斗 / 移动参数 row | 改追踪、突进、惯性前先看 |
| `global602/609/610` | 格斗 / 特殊移动动作段 callback | 找起手、后续、收尾 |
| `func_536(mask,time,callback)` | 登记格斗派生 / 输入窗口 | 改派生、前后左右输入窗口 |
| `func_239()` | 消费 `func_536` 登记的窗口和输入 | 判断派生为什么触发 |
| `func_123(mask)` | 开 cancel mask | 改可取消路线 |
| `func_81(hash,...)` | 排后续 action hash | 改接续到哪个动作 |
| `sys_4F(0,slot,hash)` | 发射 / weapon resource 请求 | 改弹种 |
| `sys_4F(0x7,slot,1)` | 主动扣 ammo | 改扣弹逻辑 |
| `sys_51(0x20000,0,0x2,index,type)` | 召唤援护 | 改援护类型 |
| `sys_53(0x4,hash,...)` | 镜头 preset | 改演出镜头 |
| `sys_53(0x5)` | 清镜头 preset | 改完镜头必须确认清理点 |
| `sys_46(...)` | 运动 / 速度 / 转向总线候选 | 改移动手感 |

## Recipe 1：改主射

玩家语义：A / 射击。初心者指南把射击作为基础按钮，系统页说明 BD 可以取消大多数射击动作。

当前样本入口：

```text
func_1043
  -> func_241(0xf48d2d49, ACTION_A_SHOT)

ACTION_A_SHOT                 2.c:25765
  -> func_586()
  -> global677 = func_914     起手 / motion callback
  -> global680 = func_915     发射 callback
  -> global681 = 0            ammo slot 0
  -> callFunc3(func_913)

func_913
  -> func_587()               ranged runtime driver
```

真正发射点：

```text
func_915
  -> sys_0(0x90000,0,0)       slot 0 ammo / 可用状态
  -> func_123(0x280)          开 cancel mask
  -> sys_4F(0,0,0xcc9f6df0)   请求主射武器资源
  -> func_123(0xc00000)       另一组动作状态 / cancel 标记
```

可改点：

| 目标 | 改哪里 | 风险 |
|---|---|---|
| 换主射弹种 | `func_915` 的 `sys_4F(0,0,0xcc9f6df0)` 第三参 | 低到中，hash 必须是有效 weapon resource |
| 改主射使用的 ammo slot | `ACTION_A_SHOT` 的 `global681=0`、`func_915` 的 `sys_0(0x90000,0,0)`、`sys_4F(0,0,hash)` 要一起看 | 中，slot 不一致会出现有弹不发或不扣弹 |
| 改主射取消路线 | `func_123(0x280)`、`func_123(0xc00000)`、`func_81(0xf48d2d49,...)` | 中到高，影响连射和 BD cancel 感觉 |
| 改起手动作 / timing | `func_914` 的 `func_610(0x91351d9e,0xd,-1)`、`func_91()` | 中，可能影响何时进入 `global680` 发射 callback |
| 改音效 / 表现 | `sys_58(0x9,0x4c9a9d5b)` | 低 |

验证方式：

- 主射空弹时不会绕过 `sys_0(0x90000,0,0)`。
- 连射时 `global773` 不会卡死。
- BD cancel 后不会残留镜头或 shell。
- 如果只换 hash，优先确认 projectile / hitbox resource 不是另一个文件缺资源。

## Recipe 2：改副射

玩家语义：A+B / 射击+格斗。初心者指南把サブ射撃描述为射击和格斗同按。

当前样本有两个入口：

```text
0x31f61d6c -> ACTION_AB_SUB
0x6ab85f0d -> ACTION_AB_SUB_DIRECTIONAL
```

### 普通副射 `ACTION_AB_SUB`

```text
ACTION_AB_SUB                 2.c:26257
  -> func_586()
  -> global676 = func_926      start
  -> global677 = func_927      shoot（有弹）
  -> global678 = func_928      no_ammo（没子弹；不是 cancel）
  -> global679 = func_929      end
  -> global681 = 1            ammo slot 1
  -> global685 = 0xa          连射 / 循环间隔候选
  -> callFunc3(func_925)

func_925
  -> func_593()               旧版 / 正常班多阶段 ranged driver
```

这套四槽的证据和命名见 [func593-vanilla-ranged-slots.md](./func593-vanilla-ranged-slots.md)。

关键发射点：

```text
func_927
  -> sys_0(0x90000,1,0)
  -> sys_4F(0,global681,0x4ab49abd)
  -> func_158(0xc8)
  -> func_123(0x200)
```

`func_928` 不是发弹，而是 `sys_4F(0x12,1)` 收武器 handle。它在 `func_595` 里只在 **弹药槽已空** 时被调用，不要把它当成 BD cancel / 中段续射。

### 方向副射 `ACTION_AB_SUB_DIRECTIONAL`

```text
ACTION_AB_SUB_DIRECTIONAL     2.c:26368
  -> func_586()
  -> global677 = func_932
  -> global680 = func_933
  -> global681 = 1
  -> callFunc3(func_931)

func_933
  -> sys_0(0x90000,global681,0)
  -> func_123(0x200)
  -> sys_4F(0,global681,0x0a4c98ae)
  -> func_123(0xc00000)
```

可改点：

| 目标 | 改哪里 |
|---|---|
| 普通副射弹种 | `func_927` 的 `0x4ab49abd` |
| 方向副射弹种 | `func_933` 的 `0x0a4c98ae` |
| 副射 ammo slot | `global681=1`、`sys_0(0x90000,1,0)`、`sys_4F(0,1,hash)` |
| 副射动作长度 | `func_926/927/928/929` 里的 `func_309` 时间点 |
| 副射速度 / rate | `func_929` 的 `func_300(...)`、`global714` |

风险：

- `func_593` 是旧版 / 正常班多阶段 ranged driver，槽是 start / shoot / no_ammo / end。只改一个 callback 容易导致阶段不匹配。`678` 是空弹段，不是 cancel。
- 如果改连射间隔，必须同时观察 `global685`、`global682/683`、`global707/711`。

## Recipe 3：改特射援护

玩家语义：A+C / 射击+跳。初心者指南说明特殊射撃常用于照射、援护、换装、特殊移动等，具体因机体而异。デルタプラス页把 N 特射和方向特射都描述为 Jesta 援护，其中方向特射是两机时间差突击。

当前样本入口：

```text
0x23df217e -> ACTION_AC_SPECIAL_SHOT_DIRECTIONAL
```

链路：

```text
ACTION_AC_SPECIAL_SHOT_DIRECTIONAL      2.c:26957
  -> func_488()
  -> global609 = func_952
  -> global390 = -1
  -> global613 = 0x14
  -> global200 = (global87 & 0x3c) ? 1 : 0
  -> callFunc3(func_951)

func_951
  -> func_502()

func_952
  -> func_308(global20,0x51f5773a,...)
  -> if func_309(...,0x1f4):
       if global200 == 1:
         sys_51(..., index 0, type 0x5)
         sys_51(..., index 1, type 0x6)
       else:
         sys_51(..., index 0, type 0x2)
         sys_51(..., index 1, type 0x4)
       sys_4F(0x7,0x2,1)
       func_123(0x281)
```

可改点：

| 目标 | 改哪里 | 说明 |
|---|---|---|
| 改 N / 方向援护差异 | `global200` 分支里的 `sys_51` type | Notion 记录 type 控制援护种类 |
| 改援护数量或左右 | 两个 `sys_51(... index 0/1, type)` | index 是援护实例槽，不是 ammo slot |
| 改特射扣弹 | `sys_4F(0x7,0x2,1)` | slot 2 主动扣 ammo |
| 改援护出现帧 | `func_309(global20,0x1f4)` | 时间点提前/延后会影响动作手感 |
| 改取消路线 | `func_123(0x281)` | 会影响能接主射、BD、格斗等路线 |

验证方式：

- N 特射和方向特射都测，因为 `global200` 是方向分支。
- 确认 slot 2 ammo 扣一次，不要因为循环 driver 重复扣。
- 如果只改 `sys_51` type，不应影响 `sys_4F(0x7,2,1)` 的扣弹。

## Recipe 4：改特格 / 变形突击 / 特殊移动

玩家语义：B+C / 格斗+跳。初心者指南说明特殊格闘可能是特殊格斗、援护、护盾、换装或特殊移动。デルタプラス页对特格相关语义是 Wave Rider 突击和变形动作。

当前样本有两条核心入口：

```text
0x6ab12717 -> ACTION_BC_SPECIAL_MELEE_ALT_2
0x193fe550 -> ACTION_BC_SPECIAL_MELEE
```

### `ACTION_BC_SPECIAL_MELEE_ALT_2`

```text
ACTION_BC_SPECIAL_MELEE_ALT_2       2.c:26424
  -> func_488()
  -> func_219(0x769a714e)           加载移动参数 row
  -> global602 = func_936
  -> global390 = 0xa
  -> global613 = 0
  -> global76 = 1
  -> global359 = 0
  -> callFunc3(func_935)

func_935
  -> func_489()
```

关键段：

```text
func_936
  -> func_888(0x7)                 切变形 / 突击 shell loadout
  -> func_308(...,0xe6bd9694,...)
  -> func_531(func_937)            登记后续段
  -> func_167(0x1004000)
  -> func_296(0x3e8,1)
  -> if func_309(...,0x8fc): func_123(0x381)

func_937
  -> func_296(0x3e9,0)
  -> sys_46(0x5,0,0x46,0x64)
  -> func_532(0x1f,0x20,0x64)
  -> func_535(0,0x3e7)
  -> func_536(0x1,0,func_945)
  -> func_123(0x200)
  -> if func_544(): func_321(0x651e4f06)
```

### `ACTION_BC_SPECIAL_MELEE`

```text
ACTION_BC_SPECIAL_MELEE             2.c:26586
  -> func_488()
  -> global609 = func_940
  -> global390 = -1
  -> global613 = 0xa
  -> global76 = 1
  -> callFunc3(func_939)

func_939
  -> func_502()
```

`func_940` 很值得看，因为它直接按方向输入写 `sys_46`：

```text
if global172 & 0x20: var1 = right-side offset
else if global172 & 0x10: var1 = left-side offset
global265 = ...
sys_46(0, global265)
...
sys_46(0x1,0x4,0,0,0)
sys_46(0x2,0x3,0,var0,0xc8)
```

可改点：

| 目标 | 改哪里 | 风险 |
|---|---|---|
| 改突进 / 追踪参数 | `func_219(0x769a714e)` 对应 row，或 `func_532/535` 参数 | 中，高度依赖 `sys_46` 语义 |
| 改变形外观 | `func_888(0x7)`、`func_887()`、`sys_4B/sys_47` | 高，影响 shell |
| 改横向偏移 | `func_940` 里 `global172 & 0x10/0x20` 分支 | 中，左右方向别写反 |
| 改能否早 cancel / BD | `func_123(0x381)`、`func_123(0x200)` 的时间点 | 高，影响动作平衡和卡状态风险 |
| 改镜头 | `func_321(0x651e4f06)` 和对应清理点 `sys_53(0x5)` | 中，必须确认收尾清理 |

验证方式：

- N 特格和方向特格都测。
- 右输入和左输入都测，因为 `global172` 分支不对称。
- 空中、地上、overheat 状态都测，因为 wiki 说明 boost / overheat 会影响 BD、step、变形和部分武装。

## Recipe 5：改普通格斗和派生

玩家语义：B / 格斗。系统页说明格斗属性动作可 step cancel，wiki 的コンボ表中 `>` 通常代表 step，`≫` 代表 BD。デルタプラス页说明 N 格斗是 3 段，且有射击派生、后派生等。

当前样本注册：

```text
0x178d1109 -> ACTION_B_MELEE
0xa2236f44 -> ACTION_B_MELEE_DIR_1
0x0e962048 -> ACTION_B_MELEE_DIR_2
0xa1635c24 -> ACTION_B_MELEE_DIR_4
0x3ac14535 -> ACTION_B_MELEE_VARIANT
```

### N 格斗入口

```text
ACTION_B_MELEE                      2.c:27343
  -> func_488()
  -> func_219(0xde3d1477)           N格参数 row
  -> global602 = func_966
  -> callFunc3(func_965)

func_965
  -> func_489()
```

起手：

```text
func_966
  -> func_308(...,0x3894dc3b,...)
  -> func_351(0,1)
  -> func_531(func_967)             下一段
  -> global170 = 1
  -> func_887()
  -> func_123(0x200)
```

第二段 / 派生窗口：

```text
func_967
  -> func_308(...,0xe50205be,...)
  -> func_532(0x2,0xd,0x58)
  -> func_535(1,0xa)
  -> func_536(0x1,0xf,func_968)
  -> func_536(0x20,0xf,func_980)
  -> func_536(0x4,0xf,func_1007)
  -> func_123(0x200)
  -> func_125(0xc00000)
```

后续段：

- `func_968`：继续普通连段，后面接 `func_969`。
- `func_969`：高段数 / finishing 段，调用 `func_321(0x87491bc1)` 镜头 preset。
- `func_980`：`func_81(0x1a62bc9b,1,1,0)`，也就是跳到另一个 action hash，像某个派生 / 换锁 / 特殊路线。
- `func_1007`：另一条派生，需单独继续拆。

### 方向格斗入口差异

| action | 参数 row | 起手 callback | 第一段 motion | 主要差异 |
|---|---|---|---|---|
| `ACTION_B_MELEE` | `0xde3d1477` | `func_966` | `0x3894dc3b` | N格 |
| `ACTION_B_MELEE_DIR_1` | `0x6b936a3a` | `func_972` | `0x3a6195eb` | 方向格斗 1，`func_973/974` 后续 |
| `ACTION_B_MELEE_DIR_2` | `0xc7262536` | `func_977` | `0x9c21fefe` | 方向格斗 2，`func_978/979` 后续 |
| `ACTION_B_MELEE_DIR_4` | 不走 `func_219`，直接 `func_502` | `func_988/989/990` | `0x6fa33ad4` | 更像后格或特殊动作 |

### 派生窗口怎么读

`func_536(mask,time,callback)` 做的是：

```text
global140 |= mask
把 callback 和 time 写进对应槽
```

`func_239` 再消费这些槽：

```text
读取 global49 / global92 / global87
根据输入 mask 和方向位选择 var0
检查 sys_47(0,activeShell) 是否到达窗口时间
把选中的 callback 写到 global430
返回 var0
```

人话：

```text
func_536 = 登记“这个时间窗可以按哪个输入派生到哪个 callback”
func_239 = 每帧检查玩家有没有按、方向对不对、时间到没到
global430 = 选中的派生 callback
```

可改点：

| 目标 | 改哪里 | 风险 |
|---|---|---|
| 改 N 格动作 motion | `func_966/967/968/969` 的 `func_308` hash | 中，hitbox / damage 未必跟 motion 一起变 |
| 改追踪 / 突进 | `func_219(row)`、`func_532/535`、`sys_46` | 中到高 |
| 改第几帧开放派生 | `func_536(mask,time,callback)` 的 `time` | 中 |
| 改派生到哪个动作 | `func_536(...,callback)` 或 `func_81(hash,...)` | 高，容易跳到不兼容 runtime |
| 改格斗 cancel | `func_123(0x200)`、`func_125(0xc00000)` | 中到高 |
| 改镜头演出 | `func_321(...)`、`sys_53(0x5)` 清理 | 中 |

验证方式：

- N 格 1 段、2 段、3 段分别测。
- 前后左右方向都测，因为 `func_239` 根据 `global87` 分方向。
- step cancel 和 BD cancel 都测。系统页说明 step 可以取消格斗属性武装，因此这类改动最容易影响手感。
- 命中、空挥、盾、overheat 状态都测，因为 `sys_47(0x7,activeShell)` 和 `func_91()` 会改变收尾。

## Recipe 6：改镜头 / 演出

当前样本里镜头不在单独 action，而是动作 callback 的一部分。

常见入口：

```text
func_321(hash)
  -> sys_53(0x4, hash, 0x4650)

收尾:
  -> sys_53(0x5)
```

典型位置：

- 特格后续：`func_937` 在 `func_544()` 条件成立时调用 `func_321(0x651e4f06)`。
- N 格 finishing：`func_969` 调用 `func_321(0x87491bc1)`。
- 方向格斗：`func_974` 调用 `func_321(0x192d8e62)`。
- ranged / melee runtime 收尾多处调用 `sys_53(0x5)`。

可改点：

| 目标 | 改哪里 |
|---|---|
| 换镜头 preset | `func_321(hash)` 或直接 `sys_53(0x4,hash,...)` |
| 改镜头强度 / 时间 | `sys_53(0x4,hash,arg)` 第三参，或 `sys_53(0x2,...)` |
| 清理镜头 | 确认同动作后续有 `sys_53(0x5)` |

风险：

- 只加 `sys_53(0x4)` 不加清理点，可能让相机状态残留到下一个动作。
- 镜头 preset hash 可能依赖资源表，不是任意 hash 都有效。

## Recipe 7：改 BD / boost cancel / 移动手感

先记住边界：BD 输入识别和 boost gauge 基础扣减属于 engine 通用系统。`2.c` 主要改动作内部的移动控制和 cancel gate。

从 wiki 语义看：

- BD 是跳键二连，能取消大多数射击和格斗动作。
- step 是同方向方向输入二连，会切诱导和枪口修正。
- boost gauge 会被跳、BD、step、变形、足止武装、格斗等消耗。

在当前 `2.c` 里，改移动手感优先看：

| 目标 | 入口 |
|---|---|
| 动作突进距离 / 追踪 | `func_219(row)`、`func_532/535` |
| 横向偏移 | `global172/global87` 方向分支、`sys_46(0, value)` |
| 速度曲线 | `func_298..302`、`func_300(...)` |
| 状态开关 | `func_296(0x3e8/0x3e9,...)` |
| 能否早取消 | `func_123(mask)`、`func_81(hash,...)` |
| boost / overheat gate | `func_11`、`sys_0(0xc000*)` 状态 |

不建议第一步改：

- `func_11` 整体逻辑。
- `func_44/52` 调度。
- `func_586/488` runtime reset。

更安全的改法：

1. 先在具体 action callback 内改 `func_309` 时间点或 `func_123` 开放点。
2. 再改 `func_532/535` 这类动作局部参数。
3. 最后才碰 `sys_46` 子命令和 `func_11`。

## Recipe 8：换装 / 组件挂接

当前样本的换装主链：

```text
func_1
  -> func_877
       -> sys_4B(0,0xab9c3043)
       -> global20 = sys_4B(1)
       -> global170 = 0
       -> func_887()
       -> func_1042()

func_887
  -> 根据 global170 选择 func_888(0/1)

func_888(mode)
  -> 按 mode 接上 / 拆下不同 shell component
```

动作内常见切换：

- 主射和副射起手常 `global170 = 0; func_887()`，回基础姿态。
- 格斗起手常 `global170 = 1; func_887()`，切格斗用资源组。
- 特格 / 觉醒技常 `func_888(0x7)`，切变形 / 突击 shell。
- 特射换锁段会 `func_888(0x8)`，进入另一组 shell / 组件状态。

改动建议：

- 如果只是让某个动作显示不同组件，优先改该动作 callback 里的 `global170/func_887/func_888` 调用点。
- 如果要改默认外观，才去动 `func_877 -> func_887`。
- 如果要接新模型，结合 Notion 和本地 `sys_4B` 文档看 `sys_4B(2,...)` 参数，不要只改 hash。

## 每次改完后怎么验证

最小验证矩阵：

| 改动类型 | 必测 |
|---|---|
| weapon hash | 有弹、空弹、连射、BD cancel、命中 / 未命中 |
| ammo slot | UI 弹数、实际扣弹、reload、空弹动作 |
| 援护 type | N / 方向分支、左右 index、重复召唤、切锁 |
| 格斗派生 | 命中、空挥、各方向、step cancel、BD cancel |
| 特格移动 | 左右方向、地上 / 空中、overheat、撞墙 / 目标丢失 |
| 镜头 | 命中 / 未命中、被打断、动作结束后是否 `sys_53(0x5)` 复位 |
| shell | 动作结束、被打断、换锁、觉醒技后是否回到正确组件 |

记录结果时建议写成：

```json
{
  "sample": "0xBDBE6FEA/2.c",
  "action_hash": "0x178d1109",
  "entry": "ACTION_B_MELEE",
  "runtime_family": "melee_runtime_func_489",
  "edited_points": [
    "func_967 func_536(0x1,0xf,func_968)",
    "func_968 func_532(0xd,0x11,0x5a)"
  ],
  "checks": [
    "N melee full chain",
    "direction branch",
    "step cancel",
    "BD cancel",
    "camera reset"
  ]
}
```

这种记录比“改了 `func_967`”更稳。下次 `func_N` 变了，只要 action hash、runtime family、syscall 组合还在，就能重新定位。

