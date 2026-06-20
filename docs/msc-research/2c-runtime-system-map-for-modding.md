# `2.c` 运行时系统地图：给逆向和模组开发看的整链路说明

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

这页专门补“人怎么读整份脚本”的缺口。它不把 `2.c` 当成一堆孤立 `func_N`，而是按运行时流程解释：

- `func_1` 初始化了哪些系统。
- 每帧从哪里读输入和 action。
- action hash 怎么变成 `ACTION_*` callback。
- 射击、格斗 / 特格、BD / boost、移动、镜头、换装分别落在哪一层。
- 逆向者要改一个动作时，应该在哪些层找证据。

读完这页后，如果目标是实际改动作参数、弹种、cancel、格斗派生或镜头，继续看 [MSC 模组开发 cookbook](./modding-cookbook-action-editing.md)。

## 一句话模型

`2.c` 是机体 depiction / action script 层，不是完整游戏引擎。

```text
engine 已经识别输入、BD、step、boost、lock、hit 等底层状态
  -> 通过 sys_0/sys_1/sys_2 暴露给 MSC
  -> 2.c 每帧读取 action queue / input mask / weapon slot / 状态 flag
  -> 选择 action hash
  -> 用 func_1043 注册表把 action hash 变成 ACTION_* callback
  -> ACTION_* callback 安装 ranged 或 melee runtime
  -> runtime 按时间线调用 motion、武器、移动、镜头、shell、特效 syscall
```

所以逆向时要先分清两件事：

- **通用 engine 行为**：BD 二连跳、step、boost gauge、lock-on、hit collision。
- **机体脚本行为**：本机某个动作何时发弹、能否 cancel、是否变形、速度怎么调、镜头怎么拉、挂什么组件。

OverBoost wiki 里玩家侧的 BD 是跳键二连，几乎能取消射击和格斗等大多数行动，并消耗 boost；step 是方向二连，用来切诱导和枪口修正。`2.c` 一般不直接判定“双击跳键”，而是消费 engine 已经整理好的 action 和状态。

参考：

- OverBoost 系统页：https://w.atwiki.jp/exvs2ob/pages/593.html
- 初心者指南：https://w.atwiki.jp/exvs2ob/pages/559.html
- デルタプラス页：https://w.atwiki.jp/exvs2ob/pages/416.html
- Notion MSC 页：https://app.notion.com/p/MSC-1601ebad394d8027a042df115e61b6dd

## 顶层运行流程

源码锚点：`2.c:779-787`

```text
main
  -> sys_2(0, 0x8, func_3)
  -> sys_2(0, 0x6, func_26)
  -> sys_2(0, 0x7, func_27)
  -> func_1()
  -> callFunc3(func_4)
```

可以把它理解成：

| 函数 | 人话职责 | 逆向时怎么用 |
|---|---|---|
| `main` | 把脚本挂到 VM / engine 的几个 callback 槽，然后进入主循环 | 不改业务，确认入口 |
| `func_1` | 初始化本机脚本所有全局状态、注册表、shell、武装资源 | 判断系统边界 |
| `func_3` | 每帧 side callback，调用 `global1/global2` 维护函数 | 形态 / shell 每帧维护 |
| `func_26` | boost / 特殊状态进入退出相关 callback | 看 boost cancel 或状态切换副作用 |
| `func_27` | 帧尾同步，更新计数器、状态副本、导出状态 | 看“上一帧/本帧”状态 |
| `func_4` | 主 action update loop | 大多数动作行为从这里进入 |

## `func_1` 初始化了什么

源码锚点：`2.c:789-841`

`func_1` 不是某个武装，也不是 BD 函数。它更像：

```text
initializeDepictionScriptRuntime()
```

主线如下：

```text
func_1
  -> 清空 global1..global19 这些顶层 callback / hook
  -> func_61 / func_62       初始化 action gate / cancel gate
  -> func_386                大量 runtime global 归零和默认值
  -> func_272                另一组系统状态初始化
  -> sys_1/sys_47/sys_50     写 native 初始参数
  -> 注册少量基础 action callback
  -> func_835 / func_836     样本特有的资源 / 状态初始化
  -> func_18                 注册一组 `0x10001,0x8` 资源 hash
  -> func_877                active shell、默认 loadout、action 表、资源表
```

### `func_386` 铺运行时内存

源码锚点：`2.c:7969-8473`

`func_386` 的代码很长，但读法不是逐行背。看它清了哪些“后面会反复读写”的全局槽：

| 槽位组 | 当前角色 | 证据 |
|---|---|---|
| `global20` | active shell entry id | `global20 = sys_4B(1)`，后面大量传给 `func_308/sys_47` |
| `global87/global49` | 方向输入 / action mask 快照 | `func_21` 每帧从 `sys_0(0x10000,0,0x7/0x8)` 读入 |
| `global24/global33/global29` | 当前动作状态 bitfield 及副本 | `func_27` 帧尾保存副本 |
| `global5/global6/global3/global4` | action candidate / active action hash 通道 | `func_24/25/44/51` 读写 |
| `global25/global52/global67/global50` | cancel / route / pending action metadata | `func_81` 写，`func_51/52` 消费 |
| `global143/global170` | shell mode / motion resource group | `func_877/887/888` 与 `func_308` 相关 |
| `global172/global200` | 方向保持 / 方向分支 | `func_52` 写 `global172 = global87 & 0x3c`，特射用 `global200` 分支 |
| `global379..393` | 移动 / 格斗参数 row 结果 | `func_219(row)` 从 `sys_0(0x60002,row,key)` 载入 |
| `global602/608/609/610` | melee / special movement runtime callback 槽 | `ACTION_BC_SPECIAL_MELEE*`、格斗家族会设置 |
| `global676..681` | ranged / weapon runtime callback 和 ammo 槽 | `func_586` 重置，主射 / 副射 / 换锁射击设置 |
| `global184` | runtime phase state | ranged 和 melee driver 都用它做阶段机 |

这就是判断 `func_1` 的方法：它不是“功能函数”，而是把后续系统需要的槽位全部铺好。

### `func_877` 初始化本机 depiction / shell 层

源码锚点：`2.c:25407-25429`

```text
func_877
  -> sys_4B(0, 0xab9c3043)      激活基础 shell entry
  -> global20 = sys_4B(1)       保存 active shell entry id
  -> sys_1(0x60008, ...)
  -> sys_4F(0xb, slot, hash)    注册或绑定武装 / HUD / resource 槽
  -> global170 = 0
  -> func_887()                 应用默认 shell loadout
  -> func_1042()                注册 action 表、slot callback 表、资源 hash 表
  -> global1 = func_878         安装每帧 depiction 维护 callback
```

这里能回答“为什么 `func_887/888` 不是孤立换装函数”：

- `func_877` 在初始化 active shell 后马上调用 `func_887`。
- `func_887` 按 `global170` 选择默认 loadout。
- `func_888(n)` 才是把不同组件接上 / 拆下的分发器。
- 所以换装研究要从 `func_877 -> func_887 -> func_888` 看，不要只看 `func_888` 某个 case。

### `func_1042` 初始化注册表

源码锚点：`2.c:29405-29646`

```text
func_1042
  -> func_1043    action hash -> ACTION_* callback
  -> func_1044    slot id -> per-slot callback
  -> func_1045    stance / shell resource hash table
  -> func_1046    effect / extra resource hash table
```

`func_1043` 里最关键的是 `func_241(hash, callback)`。这不是“按键直接调用函数”，而是：

```text
如果 engine / action queue 给出这个 action hash，就调度对应 callback。
```

当前样本的核心 action 注册包括：

| hash | callback | 玩家语义 |
|---|---|---|
| `0xf48d2d49` | `ACTION_A_SHOT` | 主射 |
| `0x31f61d6c` | `ACTION_AB_SUB` | 副射 |
| `0x23df217e` | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | 特射方向分支 / 援护 |
| `0x6ab12717` | `ACTION_BC_SPECIAL_MELEE_ALT_2` | 特格 / 变形突击 |
| `0x193fe550` | `ACTION_BC_SPECIAL_MELEE` | 特格另一入口 |
| `0x178d1109` | `ACTION_B_MELEE` | N格斗 |
| `0xa2236f44` | `ACTION_B_MELEE_DIR_1` | 方向格斗 |
| `0xe962048` | `ACTION_B_MELEE_DIR_2` | 方向格斗 |
| `0xa1635c24` | `ACTION_B_MELEE_DIR_4` | 方向格斗 |
| `0x8ae55bb1` | `ACTION_ABC_FINAL_ATTACK` | 觉醒技 |

## 每帧主循环：`func_4`

源码锚点：`2.c:873-1002`

`func_4` 的读法是“流水线”，不要把它当成一个大 if：

```text
func_4
  -> func_19()
       -> func_20()
            -> func_21()     读输入 / 方向 / action mask
            -> func_22()     读 weapon slot 状态，刷新 ammo / charge 标记
            -> func_23()     读 sys_55 状态，处理一部分表现 / gauge flag
            -> func_24()     读 primary action channel 到 global5/global9
            -> func_25()     读 secondary action channel 到 global6/global10 和 route metadata
       -> func_881()
  -> func_879()              每帧 shell / depiction 维护
  -> func_5()                从 action queue 选择 pending action
  -> func_11()               boost / cancel / landing / forced transition gate
  -> func_12()               另一组外部 action / target / interrupt gate
  -> func_13()               短窗口强制清 action 的 gate
  -> func_273()              状态维护
  -> func_51()               处理 secondary action channel
  -> func_44()               commit primary action，调度 ACTION_* callback
  -> func_880()
  -> func_264()
```

逆向时最重要的是知道 action 有两个通道：

| 槽 | 来源 | 后续 |
|---|---|---|
| `global5` | `func_24` 从 `sys_0(0x10000,0,0x10)` 读 | `func_44` commit 到 `global3`，通过 `sys_2(0,0x2, callback)` 调度 |
| `global6` | `func_25` 从 `sys_0(0x10000,0,0x11)` 读 | `func_51/52` commit 到 `global4`，通过 `sys_2(0,0x3, callback)` 调度 |

`global5` 更像当前主动作候选，`global6` 更像切换 / 中断 / route action 候选。不要把两者混成一个“当前动作”。

## 输入和 action 读取层

### `func_21` 读方向和 action mask

源码锚点：`2.c:1767-1781`

```text
global86 = global87           保存上一帧方向
global88 = global49           保存上一帧 action mask
global49 = global48
global87 = sys_0(0x10000,0,0x7)
global48 = sys_0(0x10000,0,0x8)
...
```

当前工作映射来自已有输入文档：

- A = 射击。
- B = 格斗。
- C = 跳 / boost。
- A+B = 副射。
- A+C = 特射。
- B+C = 特格。
- A+B+C = 觉醒技。

这也解释了为什么 `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` 会看 `global87 & 0x3c`：它不是在识别“按了特射”，而是在 action 已经选中后判断有没有方向输入。

### `func_24/25` 读 action channel

源码锚点：`2.c:1865-1883`

```text
func_24
  -> global5 = sys_0(0x10000,0,0x10)
  -> global9 = sys_0(0x10000,0,0x13)

func_25
  -> global6 = sys_0(0x10000,0,0x11)
  -> global10 = sys_0(0x10000,0,0x14)
  -> 如果 global6 是有效 hash，再读 global67/global52/global50
```

实操意义：

- 查“这个按钮为什么进这个 action”，要往上游 `0.c` / input layer 追。
- 查“这个 action 在本机里做什么”，从 `func_1043` 注册表和 `ACTION_*` callback 追。

## action 选择、提交和调度

### `func_5` 从 engine action queue 选择候选

源码锚点：`2.c:1004-1212`

`func_5` 会读：

- `sys_0(0x50000)`：当前 action queue 数量。
- `sys_0(0x50001, ..., index)`：队列中每个 action 的状态 / id / route。
- `sys_0(0x60007, actionHash, key)`：action 参数表。

它会处理这些情况：

- 没有 action 时返回。
- 某些全局状态位禁止选择 action。
- 从多个候选里挑一个可用 action。
- 发生落地 / 强制中断 / 特殊状态时，把 `global5` 改成 engine 提供的基础 action hash。
- 在某些 action 上调用 `sys_46(0x12,...)` 做朝向 / 空间调整候选。

对模组开发来说，`func_5` 不是优先改点。它是通用选择器。除非你在研究“为什么这个 action 进不来”，否则先从具体 `ACTION_*` 看。

### `func_51/52` 处理 secondary action channel

源码锚点：`2.c:2724-2830`

```text
func_51
  -> if global6 == 0 return
  -> global8 = global4
  -> global4 = global6
  -> 如果 global4 是 -1/-2，走 func_53 强制/特殊处理
  -> 否则走 func_52

func_52
  -> func_64()
  -> func_56(...)              更新 action gate
  -> global172 = global87 & 0x3c
  -> 根据 global4 查 registered callback
  -> sys_2(0,0x3, callback)
```

`global172 = global87 & 0x3c` 是方向分支的重要证据。Notion 页也记录了 `global172` 的位：

- `0x4`：前。
- `0x8`：后。
- `0x10`：左。
- `0x20`：右。

### `func_44` commit primary action

源码锚点：`2.c:2615-2668`

```text
func_44
  -> if global5 == 0 return
  -> 如果 global14 hook 存在，先调用
  -> global7 = global3
  -> global3 = global5
  -> 清一批动作局部 global
  -> sys_46(0x1,0x1/0x2/0x4/0x3,0,0,0)  清移动控制通道候选
  -> func_113 / func_281 / func_358      清基础动作表现 / 状态
  -> callback = sys_0(0x10002,0x2,global3)
  -> sys_2(0,0x2,callback)
```

这是 action hash 到脚本 callback 的关键桥。

如果你问“我怎么知道 `func_1` 注册的东西什么时候被调用”，答案就是：

```text
func_1043 注册 hash -> callback
func_24/25 或 func_5 得到 hash
func_44/52 查 sys_0(0x10002,0x2,hash)
sys_2 调度 callback
```

## BD / boost / step 在哪里

玩家侧 BD / step 是 engine 通用系统。`2.c` 里更像处理动作期间的：

- 能不能被 boost cancel。
- 进入 boost / overheat / landing 后要清哪些表现。
- 哪些 action 状态下锁住输入或开放 cancel。
- 变形 / 特格 / 格斗动作期间写入什么速度和 gate。

### `func_11` 是 boost / cancel gate 候选，不是“BD 输入函数”

源码锚点：`2.c:1325-1516`

`func_11` 的强证据：

- 读取 `global11 & 0x1`，而 `global11` 来自 `sys_0(0x10000,0,0x27)`。
- 读取 `sys_0(0xc0005)`、`sys_0(0xc0001)`、`sys_0(0xc0003)` 这类 engine 状态。
- 进入时调用 `sys_52(0, var1)`、`sys_52(0x3,1)`、`sys_4D(1)`、`sys_4C(...)`、`sys_4F(0x14,1)`。
- 设置 `global23 = 1`、`global47` bit、`global43 = 1`，并通过一串 `sys_55(0x1,...)` 写状态。
- 退出时调用 `sys_52(1)`、`sys_52(0x3,0)`、`sys_4F(0x14,0)`、`sys_56(...)`、`sys_4C(0x9,1)`。

人话解释：

```text
func_11 像是在某类 boost / cancel / landing / overheat 过渡期间，
把动作系统切到“特殊移动或硬直状态”，并同步关掉 / 打开一批表现和输入 request。
```

它和 BD 有关，但不要把它直接命名成 `boostDash()`。BD 的输入识别和基础物理不在这里；这里更像动作层的 gate 和副作用。

### 改移动手感要看动作自己的速度链

当前最常见的动作移动控制入口：

| 接口 | 当前理解 | 证据 |
|---|---|---|
| `func_219(row)` | 从参数表加载移动 / 格斗 row 到 `global379..393` | `sys_0(0x60002,row,key)` |
| `sys_46(...)` | 动作移动 / 速度 / 转向控制总线候选 | 大量出现在格斗、特格、觉醒技 |
| `func_296(0x3e8,arg)` | 包装 `sys_1(0x30001,arg)`，像运动状态开关 | 特格 / 觉醒技入口常用 |
| `func_296(0x3e9,arg)` | 包装 `sys_46(0x6,arg)` | 特格后续段常用 |
| `func_298..302` | 包装 `sys_46(0x3,...)` 的速度 / rate scaling | runtime 中持续调整 |
| `func_123(mask)` | 开 cancel mask | Notion 记录为取消路线 |
| `func_81(hash,...)` | 排下一个 action / cancel target | 写 `global25/global52/global67/global50` |

所以要改“特格能不能更早 BD”、“格斗追踪速度”、“觉醒技飞行速度”，优先看该动作 callback 内的 `func_219`、`sys_46`、`func_296`、`func_123`，而不是全局找 BD。

## ranged / 射击 runtime

源码锚点：`2.c:15404-15839`

射击类 action 常见模式：

```text
ACTION_*
  -> func_586()                清空 ranged runtime
  -> global677 = startCallback
  -> global679 = finishCallback 或 -1
  -> global680 = fireCallback
  -> global681 = ammoSlot
  -> callFunc3(wrapper)

wrapper
  -> func_587()                ranged runtime driver
```

### `func_586` 清 ranged runtime

它重置：

- `global676..681`：callback / ammo slot。
- `global682/683`：发射次数 / 最大次数候选。
- `global685/687/689`：连射、保持输入、对准帧等候选。
- `global708/709/710/711`：运行时间、空弹状态、阶段计数。
- 一批表现 / shell /武器状态。

### `func_587` 是 ranged driver

阶段机：

| `global184` | 函数 | 人话 |
|---|---|---|
| `0` | `func_588` | 进入动作，调用 `global677` start callback |
| `1` | `func_589` | 等 start callback 完成，检查 ammo，调用 `global680` fire callback |
| `2` | `func_590` | 连射 / 保持输入 / 循环发射 / 结束判断 |
| `3` | `func_591` | 收尾，清 camera preset，必要时回到连射阶段 |

主射就是这个 pattern：

```text
ACTION_A_SHOT
  -> func_586()
  -> global677 = func_914
  -> global680 = func_915
  -> global681 = 0
  -> callFunc3(func_913)

func_915
  -> sys_0(0x90000,0,0)        检查 slot 0 ammo / 可用状态
  -> func_123(0x280)           开 cancel mask
  -> sys_4F(0,0,0xcc9f6df0)    发射 / 武器资源请求
```

这里 `sys_4F(0,slot,hash)` 对应 Notion 和本地文档里的武器发射 / slot resource 请求。`sys_4F(0x7,slot,1)` 是主动扣 ammo，特射援护里能看到。

## melee / special movement runtime

格斗、特格、部分特殊移动不是 ranged runtime，而是 `func_488` 初始化的一组 melee/special runtime。

### `func_488` 清 melee/special runtime

源码锚点：`2.c:12348-12483`

它重置：

- `global379..393`：参数 row 结果。
- `global602/608/609/610`：动作段 callback。
- `global613/614/615`：动作段参数。
- `global623/624/635/636`：phase / movement gate。
- `global452/453/454`：rate / speed scaling 默认值。
- 大量移动、诱导、cancel、hit 相关中间状态。

### 三个常见 driver

| driver | 典型用途 | 特点 |
|---|---|---|
| `func_489` | 更复杂的格斗 / 特殊移动五阶段 driver | 有推进、减速、命中 / 追击处理 |
| `func_502` | 带前置滑行 / 方向修正的 special movement driver | `func_503/504/505/506`，大量 `sys_46` 和 `func_300` |
| `func_507` | 简化三阶段 melee/special driver | `global609` 起手，`global610` 后续，结束 `func_93` |

`func_507` 证据锚点：`2.c:13471-13534`

```text
func_507
  -> global184 == 0: func_508
       -> func_71(global609)   执行起手 callback
  -> global184 == 1: func_509
       -> func_72()
       -> 如果 global252 完成，进入 global610 或结束
  -> global184 == 2: func_510
       -> 等后续 callback 完成，sys_53(0x5)，func_93(...)
```

`func_502` 证据锚点：`2.c:13212-13469`

```text
func_503
  -> global175 = global390 * 0x64
  -> func_71(global608 or global609)
  -> sys_46(0x4,0x4,global452)
  -> sys_46(0xe,0x4,0x190)
  -> func_296(0x3e8,1) 或 func_302(0)

func_504
  -> func_72()
  -> func_300(...)
  -> sys_46(0, var0)           按剩余时间分段写速度
  -> func_105(...)             写方向 / 位置控制候选

func_505
  -> 处理命中 / cancel / 后续 callback
```

这就是为什么“特格移动”不是单纯 motion。它至少由：

- `func_219(row)` 参数。
- `global390/global613` 等动作局部常量。
- `sys_46` 速度 / 运动控制。
- `func_296/298..302` 状态 / rate。
- `func_123/81` cancel 和后续 action。
- `func_888` shell loadout。

一起决定。

## 镜头 / 演出在哪里

本地 `sys_53` native 研究已经把它定位到 camera parameter layer：

- `sys_53(0x4, hash, optional)`：启用 camera / depiction preset。
- `sys_53(0x5)`：停用 / 复位 preset。
- `sys_53(0x2,...)`：三通道插值配置。
- `func_321(hash)` 是 `sys_53(0x4, hash, 0x4650)` 的包装。

源码里常见 pattern：

```text
动作起手或命中演出:
  -> sys_53(0x4, cameraPresetHash, strength)

动作结束 / runtime 收尾:
  -> sys_53(0x5)
```

例子：

- `func_507/510` 收尾会 `sys_53(0x5)`。
- ranged `func_591` 收尾也会 `sys_53(0x5)`。
- 特格后续段 `func_937` 调 `func_321(0x651e4f06)`，像启用一个 camera preset。

所以改镜头时不要全局随机替换 `sys_53`。应该先定位动作 callback，再看它在哪个 `func_309(...,time)` 时间点启用和清理 camera preset。

## shell / 换装 / motion 时间线

本地 `sys_4B` 文档已经确认：

- `sys_4B(0, entry)`：激活 shell entry。
- `sys_4B(1)`：返回 active shell entry id。
- `sys_4B(2, ...)`：配置 / 接上 shell entry。
- `sys_4B(3, optional)`：清 shell entry 或清全部。

本地 `sys_47` 文档已经确认部分子命令：

- `sys_47(0x10, object,bone,x,y,z)`：rotate。
- `sys_47(0x11, object,bone,x,y,z)`：translate。
- `sys_47(0x12, object,bone,x,y,z)`：scale。
- `sys_47(0xf, activeShell,time)`：当前样本里由 `func_309` 包装，用作 motion timeline marker。

`func_308` 是 motion 播放包装：

```text
func_308(object, motionHash, resourceGroup, blend, rate)
  -> sys_47(0x2, object, motionHash, resourceGroup, rate, blend/0x64, 0)
```

`func_309` 是时间线判断包装：

```text
func_309(anyArg, time)
  -> active = sys_4B(1)
  -> sys_47(0xf, active, time)
```

注意当前样本里 `func_309` 的第一个参数被忽略，它总是重新取 `sys_4B(1)`。Notion 页里提到新版脚本 `func_309 arg0` 可能对应按键 / action 控制，但当前 `2.c` 不能直接套用那个结论。

## 具体系统落点速查

| 你要理解 / 修改 | 先看 | 再看 | 不要先改 |
|---|---|---|---|
| `func_1` 做了什么 | `func_1 -> func_386 -> func_877 -> func_1042` | 各 global 槽后续读写 | 直接给 `func_1` 塞武装逻辑 |
| action 怎么进来 | `func_21/24/25 -> func_5 -> func_44/52` | `func_1043` 注册表 | 把 hash 当按钮名 |
| 主射 / 副射 | `ACTION_A_SHOT` / `ACTION_AB_SUB` | `func_586/587`、`sys_4F` | 只改 motion hash |
| 援护 / 特射 | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | `global200`、`sys_51`、`sys_4F(0x7,slot,1)` | 把扣 ammo 和召唤混成一个点 |
| 特格 / 特殊移动 | `ACTION_BC_SPECIAL_MELEE*` | `func_488/489/502/507`、`func_219`、`sys_46` | 全局找 BD 函数 |
| 格斗 | `ACTION_B_MELEE*` | `global602/609/610`、`func_219`、`func_123` | 只看 `func_308` |
| 觉醒技 | `ACTION_ABC_FINAL_ATTACK` | `func_955`、`sys_46/sys_52/sys_53/sys_4F` | 当成普通射击 |
| 镜头 | 动作 callback 内的 `sys_53/func_321` | 启用点和 `sys_53(0x5)` 清理点 | 全局替换所有 `sys_53` |
| 换装 / 组件 | `func_877/887/888` | `sys_4B/sys_47` | 只看 `func_888` 某个 case |
| BD / boost cancel | `func_11` 和动作内 `func_123/81` | `sys_46` 速度链、`func_296` 状态链 | 认为 MSC 负责原始 BD 输入 |

## 给逆向者的实际阅读步骤

### 1. 先确认你要改的是哪类行为

不要一上来问“这个 `func_N` 是什么”。先问：

- 是发弹吗？
- 是 ammo / reload / charge 吗？
- 是动作速度 / 转向 / 位移吗？
- 是 cancel 路线吗？
- 是 shell / 模型组件吗？
- 是镜头 / 演出吗？

### 2. 从 action hash 或 `ACTION_*` 定位入口

直接读 `func_1043` 的 registry：

```text
action hash -> ACTION_* callback
```

### 3. 看 `ACTION_*` 安装了哪个 runtime

- 调 `func_586` 并设置 `global677/680/681`：射击 runtime。
- 调 `func_488` 并设置 `global602/609/610`：格斗 / 特殊移动 runtime。
- 直接 `func_308/sys_47/sys_4B`：可能是纯表现或特殊状态 action。

### 4. 进入实际 callback

在 callback 里按顺序标：

- motion：`func_308`。
- 时间线：`func_309`。
- 发射 / ammo：`sys_4F`。
- 援护：`sys_51`。
- 移动：`sys_46`、`func_219`、`func_296/298..302`。
- 镜头：`sys_53`、`func_321`。
- shell：`func_887/888`、`sys_4B`、`sys_47(0x10/11/12)`。
- cancel：`func_123`、`func_81`。

### 5. 最后才给名字

命名建议写成“角色 + 证据”，不要写成“绝对结论”。直接在 Markdown 记录：

| Item | Evidence |
|---|---|
| Action | `0x23DF217E / ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` |
| Working label | 特射方向分支 / 援护 |
| Runtime | `func_488 -> func_502` family |
| Current callback | `func_952` |
| Proof | writes `global609`; branches on `global200`; calls `sys_51`; uses `sys_4F(0x7,2,1)` |

这样下次 offset 或 `func_N` 变了，仍然可以根据 action hash、runtime family、syscall 组合重新定位。

## 当前还没完全证明的地方

这页已经能支撑模组开发的阅读路径，但下面几块还需要继续 native / 实机验证：

- `func_11` 里每个 `sys_0(0xc000*)` 状态的准确名称。
- `sys_46` 各子命令的完整含义，尤其是 `0/1/2/3/4/6/7/e/12`。
- `func_532/535/536` 在特格 / 格斗中的精确运动语义。
- hitbox / damage / correction 表是否主要在其他文件或 native data 中。
- 上游输入层如何在所有状态下把 A/B/C/D 组合解析成具体 action hash。
