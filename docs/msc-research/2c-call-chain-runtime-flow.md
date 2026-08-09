# `0xBDBE6FEA/2.c` 调用链与运行时流程

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

这份笔记回答一个更实际的问题：看到 `func_1`、`func_4`、`func_586`、`ACTION_A_SHOT` 这类名字时，怎么判断它们在系统里负责什么，而不是只给单个函数猜名。

如果当前目标是从零理解 `func_1` 初始化了什么、`func_4` 每帧怎么推进、BD / 移动 / 镜头 / 射击 / 格斗分别落在哪层，优先读 [2.c 运行时系统地图](./2c-runtime-system-map-for-modding.md)。如果目标是“我要改某个武装 / 动作 / 镜头 / BD 手感，先从哪条链看”，再读 [逆向 / 模组开发实操导览](./modder-practical-callchain-guide.md)。本页负责保存更完整的调用链背景和证据。

## 证据来源

- `2.c` 当前磁盘文件：29,664 行，1,047 个函数。
- Notion `MSC` 页：`sys_4B/sys_4F/sys_47/sys_4A/func_309/global172/global200` 等经验解释。
- OverBoost wiki：
  - 系统页说明 BD、step、boost gauge、cancel 是玩家侧核心系统：https://w.atwiki.jp/exvs2ob/pages/593.html
  - デルタプラス页说明本机武装语义，包括 main、sub、special shot assist、special melee、melee、burst attack：https://w.atwiki.jp/exvs2ob/pages/416.html
  - 初心者指南说明 sub/special shot/special melee 的按键关系：https://w.atwiki.jp/exvs2ob/pages/559.html

## 先建立边界

`2.c` 不是完整的游戏引擎。BD 物理、step 输入判定、boost gauge 原始扣减、lock-on、hit collision 等底层系统大概率在 native engine 里。MSC 这层更像“机体脚本控制层”：

- 从 engine 表读取当前输入、动作、boost、weapon slot、lock 状态。
- 注册 action hash 到脚本 callback。
- 在动作开始或动作时间线上播放 motion。
- 在特定帧触发武装、特效、镜头、模型挂接、取消路线、速度或惯性参数。
- 把脚本内部状态重新写回 engine 表，让 UI、动作系统、武器系统和表现系统知道当前机体状态。

所以问“它怎么控制角色 BD/移动/镜头/动作/射击/格斗”时，要分两层看：

- engine 已经实现的通用系统：BD、step、boost、lock、collision、weapon slot。
- MSC 对这些系统的机体化配置和时间线控制：本机某个 action 在第几帧发弹、是否换装、镜头怎么拉、速度曲线怎么写、能接哪些 cancel。

## 总入口链

```text
main
  -> sys_2(0, 0x8, func_3)       每帧状态发布 / 维护 callback
  -> sys_2(0, 0x6, func_26)      boost / 特殊状态进入退出后续 callback
  -> sys_2(0, 0x7, func_27)      帧尾同步 / 状态导出 callback
  -> func_1                      初始化本脚本所有 registry 和运行时状态
  -> callFunc3(func_4)           主 action update loop
```

`main` 本身不做业务，它只把脚本接到 VM 的几个 callback 槽上。真正的初始化从 `func_1` 开始，每帧主循环从 `func_4` 开始。

## `func_1` 在初始化什么

`func_1` 不是某个武装函数。它是 `initializeDepictionScriptRuntime` 级别的函数，可以拆成几组。

### 1. 清空顶层指针和状态

开头清 `global1..global19`，其中几个马上能定位角色：

- `global1`：后续由 `func_877` 设置为 `func_878`，再由 `func_3` 每帧调用。
- `global2`：默认 `func_43`，也由 `func_3` 每帧调用。
- `global14/global15`：`func_240` 会根据当前 VM 上下文写入，像“动作切换前后 hook”。

### 2. 初始化 action gate 和大块 runtime state

```text
func_61()        global144 = 1，动作 gate / cancel gate 候选
func_62()        global145 = 1，另一组动作 gate
func_386()       大型全局初始化
func_272()       另一组系统状态初始化，待继续拆
```

`func_386` 是关键。它不只是清零，而是初始化这些系统组：

- `global20 = sys_4B(0x1)`：当前 active shell/body entry，后续所有 `func_308/sys_47` 经常用它。
- `global24/global33/global29`：当前动作状态 bitfield 及其上一帧副本。
- `global143/global170`：形态 / shell mode 与 motion resource group。
- `global172/global175/global200`：方向输入 / 时间计数 / 方向保持类状态。
- `global602/608/609/610`：一套近战/特殊移动 runtime 的 callback 槽。
- `global676/677/678/679/680/681`：一套射击/多阶段 weapon runtime 的 callback 槽和 ammo slot。
- `global334..357`、`global342..349`：按 `global143` 分组的 cancel / action mask 表。
- `global379..393`：动作参数表，后续 `func_219` 会从 `sys_0(0x60002, row, key)` 载入。

判断 `func_1` 的核心方法：不要只看它调用多少函数，而要看它初始化了哪些“会被全文件反复读写”的 global 区间。

### 3. 初始化机体表现层和基础注册

`func_1` 里有几类 engine write：

- `sys_1(0xb0000, 0x34, 0x3039)`：写入一个方向/角度/视角类初值。
- `sys_47(0x1f, sys_4B(0x1), ...)`：对当前 body entry 设置一组空间参数。
- `sys_50(0, 0x64)`：初始化一个比例/镜头/显示类参数。
- `sys_1(0x30001, 0)`：清一个 movement/action flag。

随后注册少量基础 action handler：

```text
sys_1(0x10002, 0x2, 0xc858da63, func_45)
sys_1(0x10002, 0x2, 0x4cdc9902, func_47)
sys_1(0x10002, 0x2, 0x450c6ce4, func_484)
sys_1(0x10002, 0x2, 0x06bd334d, func_60)
```

这说明 `0x10002/group 0x2` 是 action hash -> callback 的表。`func_1043` 后面大量调用 `func_241(hash, callback)`，本质也是写这张表。

### 4. 进入机体 shell/loadout 初始化

`func_1` 后段调用：

```text
func_835()
func_836()
func_18()
...
func_877()
func_2(0x27786a84, 0x18680, 0x36)
func_2(0xf32aa1ba, 0x181c0, 0x34)   // victory pose 1 hash + state slot 0x34
func_2(0x900ab393, 0x1827c, 0x35)   // defeat pose 1 hash + state slot 0x35
```

这里 `func_877` 是机体表现层真正入口：激活 base shell、设置 `global20/global170`、调用 `func_887` 应用默认 loadout、调用 `func_1042` 注册 action 表、并设置 `global1 = func_878` 作为每帧维护函数。

`func_2` 是 fallback 注册工具：如果某个 action hash 没有 `0x10002` 注册，就写入脚本 offset；如果某个 slot callback 没有，就继承 slot `0x1` 的 callback。

### 结果 pose（胜利 / 失败）action hash

**Settled identity**（`wing_gundam_zero_rebellion_msc` / 同类 `2.c` 注册表；与 `func_241` 写表一致）：

| action hash | `func_241` / 入口 callback | state slot (`func_69`) | 玩家语义 |
|---|---|---|---|
| `0xf32aa1ba` | `func_480` | `0x34` | **胜利 pose 1** |
| `0x900ab393` | `func_482` | `0x35` | **失败 pose 1** |

对应启动/注册形态：

```c
func_241(0xf32aa1ba, func_480); // victory pose 1
func_241(0x900ab393, func_482); // defeat pose 1
// + func_2(hash, entry, slot) 绑定同一 hash 与 state slot
// + sys_1(0x10001, 0x2, 0x34, tickFn) / 0x35 注册槽上每帧 tick
```

结构要点（改主射/pose 时别接错总线）：

- 结果 pose **不是** 主射 `ACTION_A_SHOT` 链；hash 也不同。
- 入口 callback（`func_480` / `func_482`）会做权限/准备，再 `func_69(0x34|0x35)` 装 state tick，并 `callFunc3(...)` 持续 `func_72`。
- 槽 `0x34` 的 tick 在部分机体上按 `func_186()` 分叉（例如 `func_871` vs `func_870`）；**hash→`func_480` 的身份是胜利 pose 1**，与槽内 tick 变体无关。
- 不要把 `func_241(主射hash, func_871)` 当成“播胜利 pose”：`func_871` 是槽 `0x34` 的 tick，不是 `0x10002` 入口形态。

## 每帧主循环

主循环有三条并行感觉的链：`func_3`、`func_4`、`func_27`。

### `func_3`：状态发布和常驻维护

```c
if (global1) (*global1)();
func_41();
func_42();
if (global2) (*global2)();
```

当前样本中：

- `global1 = func_878`，而 `func_878 -> func_1040()`。
- `func_1040()` 每帧根据 `global143`、weapon slot 状态写 `sys_4F(0x15/0x16, 0x2, ...)`，像 alternate shell / 特射资源显示状态维护。
- `func_41()` 把脚本内部状态写到 `sys_1(0x10000,0,...)`。
- `func_42()` 写更多 action/cancel/flag 状态，例如 `global12/global13/global65/global67/global52/global25/global50/global33`。

这条链说明：很多 global 不是本地变量，而是通过 `0x10000` 表向 engine 公开的状态字段。

### `func_4`：主 action update loop

`func_4` 开头：

```text
func_19()
func_879()
func_5()
func_11()
func_12()
func_13()
func_273()
...
func_44()
func_880()
func_264()
```

可以按功能拆：

- `func_19 -> func_20/21/22/23`：读取 engine 当前状态、输入 bit、weapon slot、特殊 UI/boost 标志。
- `func_5`：从 engine action queue 选择本帧要进入的 action。
- `func_11`：处理 boost/BD/cancel 资源类状态，进入时写 `sys_52/sys_4D/sys_4C/sys_4F(0x14)` 并设置 `global23`。
- `func_12`：处理命中、碰撞、目标或外部 action 转移类状态，读取 `0x50002/0x50003/0x7000c/0x7000b`。
- `func_13`：处理强制中断 bit `0x20000000` 一类状态，必要时清掉当前 pending action。
- `func_44`：把 `global5` 的 pending action 提交为当前 action，并启动对应脚本。

### `func_20/21/22/23`：从 engine 读当前帧输入和武装状态

关键读取：

- `global87 = sys_0(0x10000, 0, 0x7)`：当前输入/方向 bitfield 候选。
- `global48 = sys_0(0x10000, 0, 0x8)`：另一个输入或状态 bitfield。
- `global91/global92/global93/global94`：更多动作状态 bit。
- `sys_0(0x90002, slot)`：读取 weapon slot 状态，发现特定状态时写 `sys_4F(0xd, slot, 1)`。
- `sys_55(0x2, ...)`：检测某些 engine flag，触发 `sys_4F(0x13)` 或 `sys_1(0x60012, 0x64)`。

Notion 里建议不要死记 `global172/global175`，而是搜 `& 0x10`、`& 0x20`。当前样本也符合：`global87 & 0x3c` 在 `func_52` 和多处动作函数中被用作方向输入。

### `func_5`：动作选择器

`func_5` 从：

```text
var0 = sys_0(0x50000)
sys_0(0x50001, field, index)
```

读取 action queue。它会：

- 找可用 queue entry。
- 根据 cancel、landing、overheat、boost、当前动作状态决定是否进入特殊 action。
- 设置 `global5` 为 pending action hash。
- 设置 `global9` 为 pending action reason / branch id。
- 必要时调用 `func_63/64` 关掉 action gate，或调用 `func_628/154/168/280` 等处理取消和硬直。

所以 `func_5` 更像 `selectNextActionFromEngineQueue`，不是某个具体武装。

### `func_44`：提交 action 并启动脚本

`func_44` 是理解 ACTION 链的关键：

```text
if (global5 == 0) return
global7 = global3
global3 = global5
reset movement/effect/action transient globals
var1 = sys_0(0x10002, 0x2, global3)
sys_2(0, 0x2, var1)
```

它做的事：

- 把 pending action 变成 current action。
- 清掉上一动作的速度、朝向、特效、派生状态。
- 通过 `0x10002/group 0x2/action hash` 找 callback 或 script offset。
- 用 `sys_2(0,0x2, var1)` 启动 action script。

Notion 里被划掉的 “`func_44` 这个区域也是指针” 正好对上这里：`var1` 确实是从注册表取出的 callback/script pointer。

## Action registry 到实际动作

### 注册表

```text
func_1042
  -> func_1043  action hash -> ACTION callback
  -> func_1044  slot id -> callback
  -> func_1045  motion resource group 0x3/0x4
  -> func_1046  effect / extra resource group 0xb
```

`func_1043` 里已经有中文注释的 action 很重要：

| action hash | 当前 callback | 玩家语义 |
|---|---|---|
| `0xf48d2d49` | `ACTION_A_SHOT` | 主射 |
| `0x7158fa47` | `ACTION_A_SHOT_STATE_0` | 主射状态 0 |
| `0x700bb2c6` | `ACTION_CHARGE_SHOT_LOCK_SWITCH` | 射击 CS / 换锁分支 |
| `0x31f61d6c` | `ACTION_AB_SUB` | 副射 |
| `0x6ab85f0d` | `ACTION_AB_SUB_DIRECTIONAL` | 方向副射 |
| `0x23df217e` | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | 方向特射 |
| `0x6ab12717` | `ACTION_BC_SPECIAL_MELEE_ALT_2` | 特格 |
| `0x193fe550` | `ACTION_BC_SPECIAL_MELEE` | 特格 |
| `0x178d1109` | `ACTION_B_MELEE` | 格斗 |
| `0x8ae55bb1` | `ACTION_ABC_FINAL_ATTACK` | 觉醒技 |
| `0xf32aa1ba` | `func_480`（→ state `0x34`） | **胜利 pose 1** |
| `0x900ab393` | `func_482`（→ state `0x35`） | **失败 pose 1** |

注：部分机体主射 hash 不是 `0xf48d2d49`（例如 wing zero rebellion 样本为 `0x7cd11119` → `ACTION_A_SHOT`）。结果 pose 两枚 hash 在同类 `2.c` 注册表中稳定出现。

OverBoost wiki 的玩家侧按键能帮助命名：副射是射击+格斗，特射是射击+跳，特格是格斗+跳；但具体 hash 必须以 `func_1043` 和当前 ACTION wrapper 为准。

### 动作段调度层

动作函数经常不是直接做完所有逻辑，而是设置 callback 槽，再进入 runtime driver。

基础调度：

```text
func_69(slot)
  -> global223 = sys_0(0x10001, 0x2, slot)
  -> func_72()

func_71(callback)
  -> global225 = callback
  -> func_72()

func_72()
  -> 如果 VM context == 0x2，执行 global223
  -> 否则执行 global225

func_73()
  -> 清动作段临时状态
  -> 重置速度 / action rate / sys_46(0x8)
```

这就是为什么 `ACTION_*` 里常见 `global677 = func_922` 这类写法：wrapper 只配置动作段，真正执行在 driver 调 `func_71` 或 `func_72` 时发生。

### Motion 播放

```text
func_79(slot, rate, blend, mode)
  -> var4 = sys_0(0x10001, 0x3 + global170, slot)
  -> fallback sys_0(0x10001, 0x3, slot)
  -> func_308(global20, var4, global171, rate*100, blend*100, mode)

func_308(...)
  -> sys_47(0x2, modelEntry, motionHash, rate, blend, ...)
```

所以：

- `func_1045` 注册的是 motion resource hash 表。
- `global170` 不只是换装显示，它还决定动作资源 group：`0x3 + global170`。
- `func_887/888` 的 shell loadout 和 `func_79` 的 motion group 需要一起看。

### 时间线判断

Notion 里说新版可用 `func_309` 判断动作做到多少帧。当前样本：

```text
func_309(model, time)
  -> sys_4B(0x1)
  -> sys_47(0xf, currentBody, time)
```

典型模式：

```c
if (func_309(global20, 0x834))
{
    sys_4F(0, slot, weaponHash);
}
```

这就是“动作第 N 帧发弹 / 出特效 / 改模型”的主要证据。

## 两套 action runtime

### `func_586/587`：射击 / 多阶段武装 runtime

配置槽：

```text
global676  可选 start callback
global677  main motion callback
global678  branch callback
global679  finish / return callback
global680  fire callback
global681  ammo slot
```

driver：

```text
func_587
  global184 == 0 -> func_588  start：func_71(global677)，必要时 sys_4E(0)
  global184 == 1 -> func_589  等待 motion gate；检查 ammo；调用 global680 fire callback
  global184 == 2 -> func_590  loop/repeat；按 interval 再次调用 global680
  global184 == 3 -> func_591  finish/return：func_71(global679)
```

例子：

- `ACTION_A_SHOT`：`global677=func_914`，`global680=func_915`，`global681=0`。`func_915` 触发 `sys_4F(0,0,0xcc9f6df0)`，符合 Notion “`sys_4F(0, slot, ammoHash)` 射击”。
- `ACTION_CHARGE_SHOT_LOCK_SWITCH`：`global676=func_921`，`global677=func_922`，`global679=func_923`，`global681=0x5`。`func_922` 有大量 `func_309(...)` 后触发 `sys_4F(0,0x5,hash)`，是一条重时间线武装。
- `ACTION_AB_SUB`：`global681=0x1`，`func_927` 里 `sys_4F(0,global681,0x4ab49abd)`，对应副射类武装。

这套 runtime 的特征是：有 ammo slot、有 fire callback、有 `sys_4F(0,...)`。

### `func_488/489/507`：格斗 / 特殊移动 / 单段动作 runtime

配置槽：

```text
global602  first motion callback
global608  optional pre/main callback
global609  main callback
global610  finish callback
```

`func_488` 清这些槽和大量移动参数。后续有多个 driver：

- `func_489`：5 phase runtime，常见于格斗、特格、带位移动作。
- `func_507`：3 phase runtime，常见于较简单的动作状态。

例子：

- `ACTION_BC_SPECIAL_MELEE_ALT_2`：`global602=func_936`，然后 `callFunc3(func_935)`，`func_935 -> func_489`。
- `ACTION_BC_SPECIAL_MELEE`：`global609=func_940`，然后进入 `func_507` 一类 driver。
- `ACTION_B_MELEE`：`global602=func_966`，`func_966` 里 `global170=1; func_887()`，说明格斗动作会切到另一组 motion/shell stance。
- `ACTION_ABC_FINAL_ATTACK`：`global609=func_955`，并写 `global183=0`、`global771=1`，后续有大量 `sys_4A/sys_47/sys_46/sys_52`，是觉醒技表现和移动控制。

这套 runtime 的特征是：更多 `sys_46` 速度/惯性、`func_219` 参数表、`func_99/100/101` 方向数学、`func_532` 一类近战命中/追踪参数。

## 各系统怎么落到函数链

### 角色移动 / BD / step

玩家侧：wiki 说明 BD 是跳键两次，step 是同方向两次，都会消耗 boost gauge。当前 MSC 不是直接检测“双击”，而是读 engine 已经整理好的状态。

当前样本证据：

- `func_20/21` 从 `0x10000` 表读取当前状态和输入 bit。
- `func_11` 处理 boost/BD/cancel 进入和退出：
  - 进入时写 `sys_52(0, var1)`、`sys_52(0x3,1)`、`sys_4D(0x1)`。
  - 根据 `0x6000e` 参数写 `sys_4C(0x6, ...)`，像 boost cost / movement cost。
  - 写 `sys_4F(0x14,1)`，退出时写 `sys_4F(0x14,0)`。
  - 打开/关闭一组 `sys_55(0x1, ...)` flag。
- `func_40` 帧尾把 `global24/global33/global29` 等动作 bit 写到 `0xe0000`，并把某些状态写到 `0xf0000`。
- `func_99/100/101` 把方向 bit 转成角度/方向分类，后续给 `sys_46` 或动作段使用。

结论：BD/step 的“输入成立”和基础移动物理在 engine；MSC 通过 `func_11`、`sys_46`、`sys_52`、`sys_4C` 控制本机动作期间的移动资源、速度、朝向、硬直和可取消性。

### 方向输入

当前样本：

- `global172 = global87 & 0x3c` at `func_52`。
- Notion 经验：`0x4` 前、`0x8` 后、`0x10` 左、`0x20` 右；offset 变化时搜 `& 0x10` 更稳。
- `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` 附近会根据 `global87 & 0x3c` 设置 `global200=1`。
- 多处动作函数用 `global172 & 0x10` / `global172 & 0x20` 选择左右版本。

结论：`global87` 是当前输入 bitfield 候选，`global172` 是动作开始时截取的方向输入，`global200` 是“本动作有方向输入”的布尔状态。

### 镜头

当前样本里的镜头控制主要经由 `sys_53`：

- `sys_53(0x2, x, y)`：Notion 记录为镜头缩放。
- `sys_53(0, strengthA, strengthB, duration, flag)`：Notion 记录为画面震动。
- `func_320/321`：`sys_53(0x4, hash, 0x4650)`，像 camera preset / camera work。
- `func_14/17/57` 和觉醒技/重武装动作里常见 `sys_53(0x5)`，像恢复或清 camera 状态。

结论：普通移动不直接碰镜头；重武装、cut-in、觉醒技、强制中断会碰 `sys_53`。

### 动作 / motion

主链：

```text
action hash -> func_1043/func_241 -> func_44 -> ACTION_* -> runtime -> func_79/func_308 -> sys_47(0x2)
```

判断一个函数是不是“动作函数”，看它是否：

- 被 `func_241(hash, callback)` 注册。
- 设置 `global602/609/677/680` 等 runtime callback。
- 调 `func_79/func_80/func_308` 播放 motion。
- 用 `func_309` 在 motion 时间线上触发后续行为。

### 射击 / 武装

主链：

```text
ACTION_A_SHOT
  -> func_586()
  -> global677 = func_914      startup/motion callback
  -> global680 = func_915      fire callback
  -> global681 = 0             ammo slot
  -> func_587 driver
  -> func_915
  -> sys_4F(0, 0, 0xcc9f6df0)
```

Notion 解释：`sys_4F(0, slot, hash)` 是射击/武装触发，`slot` 是消耗的弹药栏位，`hash` 是武装资源 id。

所以找射击不要只搜 `ACTION_A_SHOT`，更稳的搜索是：

```text
sys_4F(0,
func_309(global20,
global681 =
global680 =
```

### 格斗 / 特格 / 派生

主链：

```text
ACTION_B_MELEE or ACTION_BC_SPECIAL_MELEE
  -> func_488()
  -> func_219(row)             载入动作参数
  -> global602/global609 = callback
  -> func_489 or func_507
  -> func_71(callback)
  -> func_308/sys_46/sys_47
```

格斗和特格更依赖：

- `func_219` 的参数表。
- `func_99/100/101` 的方向与角度处理。
- `sys_46` 的速度/惯性/转向。
- `func_532` 等命中后追踪、位移或派生参数。

Notion 里的 `func_532(0x1,0xc,0x5f)` “近战击中后前进惯性？” 适合放在这条链继续验证。

### 模型 / 换装 / 组件

主链：

```text
func_877
  -> sys_4B(0, 0xab9c3043)
  -> global20 = sys_4B(0x1)
  -> global170 = 0
  -> func_887()

func_887
  -> if global170 == 0: func_888(0)
  -> if global170 == 1: func_888(1)

func_888(arg0)
  -> clear/attach shell components
  -> branch 7/8 handles alternate shell enter/return
```

Notion 解释：

- `sys_4B(0x2, model, bone, resource, target)` 接模型；`bone` 是目标模型自身
  `.jnttbl` 的 bone / joint hash，不能直接复用其他模型的挂点 hash。
- `sys_4B(0x3)` 解除全部装备。
- `sys_47(0x10/0x11/0x12)` 对模型/bone 做 rotate/translate/scale。

结论：`func_887/888` 是 shell/loadout 层，但它必须和 `global170` 的 motion group 一起理解，否则只看到“挂组件”，看不到“为什么某些格斗切另一组动作”。

## 怎么判断一个未知 `func_N` 在做什么

建议流程：

1. 看它是否被注册：搜 `func_241(..., func_N)`、`sys_1(0x10001, ..., func_N)`、`globalXXX = func_N`。
2. 看它在哪个 runtime 槽出现：
   - `global676..681` 多半是射击/多阶段武装。
   - `global602/608/609/610` 多半是格斗/特殊移动。
   - `global1/global2/global14/global15` 是全局或切换 hook。
3. 看它的 syscall 形态：
   - `sys_4F(0,...)`：武装触发。
   - `sys_4B/sys_47(0x10/0x12)`：模型/换装/TRS。
   - `func_308/sys_47(0x2)`：motion 播放。
   - `sys_46`：速度、惯性、转向、motion rate 类控制。
   - `sys_53`：镜头。
   - `sys_4A/sys_58`：特效/aleo/音效表现。
4. 看它是否使用 `func_309`：如果是，通常是动作时间线上的事件函数。
5. 看它读哪个 engine 表：
   - `0x10000`：当前动作/输入/公开状态。
   - `0x10001`：本脚本注册表。
   - `0x10002/0x10003`：action hash callback 注册和存在性。
   - `0x50000/0x50001`：action queue。
   - `0x60002/0x60006/0x60007/0x6000e`：参数表。
   - `0x90000/0x90002`：weapon slot / ammo 状态。

这个方法比“看到 `func_888` 就叫换装”更稳，因为 offset 变了以后，注册形态、syscall 组合、常量集合和 runtime 槽仍然能重新匹配。

## 当前可用的高层命名

这些名字作为研究术语使用，后续应进入人工读码文档，并附 `.c` 行号和 evidence shape：

| 当前符号 | 建议语义 | 置信度 |
|---|---|---|
| `main` | MSC VM entry and callback registration | high |
| `func_1` | depiction script runtime initializer | high |
| `func_3` | per-frame state publisher / maintenance runner | high |
| `func_4` | action update loop | high |
| `func_5` | next action selector from engine queue | medium |
| `func_11` | boost/cancel resource state handler | medium |
| `func_20/21/22/23` | frame state and weapon slot reader | medium |
| `func_41/42` | script state exporter to `0x10000` | high |
| `func_44` | commit pending action and dispatch callback | high |
| `func_69/70/71/72/73` | action segment callback dispatcher | high |
| `func_79/308/309` | motion lookup/playback/timeline marker | high |
| `func_241` | action hash handler binder | high |
| `func_386` | global runtime state initializer | high |
| `func_488/489/507` | melee/special movement runtime family | medium |
| `func_586/587` | ranged weapon multi-phase runtime family | high |
| `func_877` | base shell/loadout initializer | high |
| `func_887/888` | shell loadout selector/dispatcher | high |
| `func_1042..1046` | registration coordinator and registry tables | high |
