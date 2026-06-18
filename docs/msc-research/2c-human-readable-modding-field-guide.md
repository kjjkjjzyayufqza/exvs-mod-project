# 从 `2.c` 读到可改点：人类可读的 MSC 模组开发导览

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

这份文档的目的不是再列一张 `func_N` 猜名表，而是回答逆向者最常遇到的问题：

- 我打开 `2.c` 后，怎么知道 `func_1` 初始化了什么？
- 我怎么从玩家动作找到真正的 `ACTION_*` callback？
- 我怎么判断一个函数是在控制 BD / movement、镜头、射击、格斗、换装，还是只是 runtime wrapper？
- 我要做模组时，应该改哪一层，哪些层暂时不该碰？

先记住一句话：

```text
func_1 初始化系统
func_4 每帧读 engine 状态并选择 action
func_44 / func_52 把 action hash 变成 ACTION_* callback
ACTION_* 安装本动作 runtime
runtime segment 里才真正调用 motion / weapon / movement / camera / shell / effect syscall
```

## 这份 `2.c` 是哪一层

`2.c` 是 MSC bytecode 反编译出的 C 风格中间表示，不是游戏原生 C 源码。更准确地说，它处在机体 depiction / action script 层。

玩家侧的规则来自游戏系统：

- OverBoost wiki 的系统页把 BD 描述为跳键二连触发、可取消大多数射击和格斗，并消耗 boost gauge。
- step 是同方向输入二连，用来切诱导和枪口补正，也消耗 boost gauge。
- boost gauge 为空后进入 overheat，BD / step 等行动受限，落地硬直会变长。

脚本侧不要把这些玩家操作直接等同到某个函数。当前样本中，BD / step 原始识别、boost gauge、lock-on、hit collision 等基础状态主要在 engine / native 层；`2.c` 负责读 engine 已经整理好的 action hash、输入 mask、状态槽，然后给本机动作配置 motion、武器、移动、镜头和表现。

## 第一张地图：从启动到动作

源码锚点：`2.c:779-787`。

```text
main
  -> sys_2(0, 0x8, func_3)
  -> sys_2(0, 0x6, func_26)
  -> sys_2(0, 0x7, func_27)
  -> func_1()
  -> callFunc3(func_4)
```

人话读法：

| 函数 | 层级 | 逆向判断 |
|---|---|---|
| `main` | VM callback 入口 | 只挂接 callback，然后进入主循环 |
| `func_1` | 初始化 | 初始化全局槽、native 初始参数、shell、注册表 |
| `func_3` | side callback | 每帧调用 `global1/global2`，常用于 shell / depiction 维护 |
| `func_26` | gate edge callback | 消费 `global43/global45` 这类 boost / 特殊状态边沿 |
| `func_27` | 帧尾同步 | 保存上一帧状态、计数、导出状态 |
| `func_4` | 主循环 | 每帧读输入 / action / 状态，调度动作 |

如果你在看一个陌生样本，先找这条链。`main -> func_1 -> callFunc3(func_4)` 是判断整份脚本结构的入口。

## `func_1` 到底初始化了什么

源码锚点：`2.c:789-841`。

`func_1` 的外形是：

```text
func_1
  -> 清空 global1..global19
  -> func_61 / func_62
  -> func_386
  -> func_272
  -> sys_1 / sys_47 / sys_50 写 native 初始参数
  -> 注册少量基础 action callback
  -> func_835 / func_836
  -> func_18
  -> func_877
```

所以它不是“主射初始化”、也不是“BD 初始化”。它是脚本运行时初始化器。

判断 `func_1` 做了什么，不要只看它自己。要看它调用的初始化函数铺了哪些后续会被反复使用的槽：

| 初始化出的东西 | 后续怎么证明 | 模组意义 |
|---|---|---|
| 顶层 callback 槽 `global1/global2` | `func_3` 每帧调用，`func_877` 设 `global1 = func_878` | shell / depiction 每帧维护 |
| 主动作通道 `global5/global3` | `func_24` 读 `global5`，`func_44` 提交到 `global3` | primary action |
| 副动作 / route 通道 `global6/global4` | `func_25` 读 `global6`，`func_51/52` 提交到 `global4` | cancel / route / secondary action |
| active shell `global20` | `func_877` 里 `global20 = sys_4B(1)`，后续大量给 `func_308/sys_47` | 当前模型 / shell 操作目标 |
| 方向输入 `global87/global172/global200` | `func_21`、`func_52`、特射方向分支使用 | 方向特射、方向格斗、左右动作分支 |
| ranged runtime `global676..681` | `ACTION_A_SHOT` 设置 `global677/global680/global681` | 射击动作段和 ammo slot |
| melee runtime `global602/608/609/610` | 特格、N 格斗设置这些 callback | 格斗 / 特殊移动动作段 |
| shell mode `global170/global143` | `func_887/888`、`func_308` 使用 | 换装、变形、motion resource group |

逆向结论：除非你要改全局动作注册、基础 shell、native 初始参数，否则不要从 `func_1` 下手改武装行为。

## `func_877` 是 depiction / shell 初始化入口

源码锚点：`2.c:25407-25429`。

```text
func_877
  -> sys_4B(0, 0xab9c3043)
  -> global20 = sys_4B(0x1)
  -> global142 = 0xc2b19d12
  -> sys_4F(0xb, slot, hash)
  -> global170 = 0
  -> func_887()
  -> func_1042()
  -> global1 = func_878
```

读法：

- `sys_4B(0, hash)` 激活基础 shell entry。
- `sys_4B(1)` 取 active shell id，保存到 `global20`。
- `sys_4F(0xb,...)` 在这里更像绑定 HUD / ammo / resource 槽，不是发弹。
- `global170 = 0; func_887()` 应用默认 loadout。
- `func_1042()` 注册 action 表、slot callback 表和资源 hash 表。

所以 `func_887/888` 要放在 `func_877` 后面理解：它们是 shell loadout 层，不是动作 dispatch 层。

## `func_1043` 是 action 字典

源码锚点：`2.c:29413-29470`。底层 helper：`2.c:6225-6240`。

`func_1043` 大量调用：

```text
func_241(actionHash, callback)
```

而 `func_241` 实际写：

```text
sys_1(0x10002, 0x2, actionHash, callback)
```

所以它是一张 action hash -> callback 表。玩家按键不会直接跳到 `ACTION_A_SHOT`；engine 先给出 action hash，`func_44/52` 再查表调度。

当前样本中最值得先记住的注册：

| hash | callback | 玩家语义 |
|---|---|---|
| `0xf48d2d49` | `ACTION_A_SHOT` | 主射 |
| `0x31f61d6c` | `ACTION_AB_SUB` | 副射 |
| `0x23df217e` | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | 方向特射 / 援护 |
| `0x6ab12717` | `ACTION_BC_SPECIAL_MELEE_ALT_2` | 特格 alt / 变形突击 |
| `0x193fe550` | `ACTION_BC_SPECIAL_MELEE` | 特格 |
| `0x178d1109` | `ACTION_B_MELEE` | N 格斗 |
| `0x8ae55bb1` | `ACTION_ABC_FINAL_ATTACK` | 觉醒技 |

新样本里 `func_N` 可能变，但这种注册表 shape 通常还在。动态命名时优先匹配 `func_241(hash, callback)`，不要硬记当前函数编号。

## `func_4` 每帧做什么

源码锚点：`2.c:873-1002`。

```text
func_4
  -> func_19()
       -> func_20()
            -> func_21()   读方向 / input mask
            -> func_22()   读 weapon slot 状态
            -> func_23()   读 sys_55 状态
            -> func_24()   读 primary action 到 global5
            -> func_25()   读 secondary action 到 global6
  -> func_879()
  -> func_5()
  -> func_11()
  -> func_12()
  -> func_13()
  -> func_273()
  -> func_51()
  -> func_44()
  -> func_880()
  -> func_264()
```

这里最重要的是两个 action 通道：

| 通道 | 读取函数 | engine 槽 | 提交函数 | 当前动作槽 |
|---|---|---|---|---|
| primary | `func_24` | `sys_0(0x10000,0,0x10)` | `func_44` | `global5 -> global3` |
| secondary | `func_25` | `sys_0(0x10000,0,0x11)` | `func_51/52` | `global6 -> global4` |

`func_21` 还会读：

```text
global87 = sys_0(0x10000, 0, 0x7)
global48 = sys_0(0x10000, 0, 0x8)
```

Notion 记录中，方向输入可用 `global172/global175` 这类值配合 `0x4/0x8/0x10/0x20` 判断前后左右。当前样本中 `func_52` 会写：

```text
global172 = global87 & 0x3c
```

所以方向分支通常是 action 已经选中后，再看方向 mask；它不是原始按键识别入口。

## `func_44/52` 如何启动 ACTION

`func_44` 源码锚点：`2.c:2615-2668`。

```text
global3 = global5
清 movement / runtime 状态
var1 = sys_0(0x10002, 0x2, global3)
sys_2(0, 0x2, var1)
```

`func_52` 源码锚点：`2.c:2765-2830`。

```text
global172 = global87 & 0x3c
var5 = sys_0(0x10002, 0x2, global4)
sys_2(0, 0x3, var5)
```

读法：

- `func_44` 负责 primary action commit。
- `func_52` 负责 secondary / route action commit。
- 两者都从 `0x10002, group 0x2` 查 callback，再通过 `sys_2` 挂到执行槽。
- Notion 中提到 `func_44` 附近“是指针”的经验，正好对应这里：`var1/var5` 是从注册表取出的 callback pointer。

## 看到 `ACTION_*` 后怎么读

`ACTION_*` 通常不是动作全过程，而是 runtime 安装器。判断它属于射击还是格斗，先看它设置哪些 global 槽。

| 函数外形 | 系统 | 判断方式 |
|---|---|---|
| `func_586(); global677=...; global680=...; global681=slot; callFunc3(func_587 family)` | ranged / weapon runtime | 射击、多段射击、ammo slot |
| `func_488(); global602=...; callFunc3(func_489)` | melee runtime | 普通格斗 / 突进段 |
| `func_488(); global609=...; callFunc3(func_502)` | special movement runtime | 特格 / 特殊移动 |
| `func_219(rowHash)` | action parameter row | 格斗 / movement 参数表 |
| `func_308(global20, motionHash, ...)` | motion | 播放动作 |
| `func_309(global20, time)` | timeline gate | 到某帧触发后续调用 |

### 主射：`ACTION_A_SHOT`

源码锚点：`2.c:25765-25820`。

```text
ACTION_A_SHOT
  -> func_586()
  -> global677 = func_914
  -> global680 = func_915
  -> global681 = 0
  -> callFunc3(func_913)
```

解读：

- `global681 = 0` 表示 ammo / weapon slot 0。
- `func_914` 是动作 / motion 段。
- `func_915` 是发射段，后面会出现 `sys_4F(0, slot, weaponHash)`。
- Notion 中记录 `sys_4F(0, slot, hash)` 是射击请求；本仓库 `sys_4F` 文档也确认它是 syscall `0x4F`，不是字符串名。

主射模组优先看：

| 目标 | 看哪里 |
|---|---|
| 改弹种 | `sys_4F(0,0,weaponHash)` |
| 改 ammo slot | `global681`、`sys_0(0x90000,slot,0)`、`sys_4F` slot |
| 改取消 | `func_123(mask)`、`func_81(actionHash,...)` |
| 改动作表现 | `func_914` 的 `func_610/func_308/sys_47` |

### 特格 / 变形突击：`ACTION_BC_SPECIAL_MELEE*`

源码锚点：`2.c:26424-26584`、`2.c:26586-26605`。

```text
ACTION_BC_SPECIAL_MELEE_ALT_2
  -> func_488()
  -> func_219(0x769a714e)
  -> global602 = func_936
  -> callFunc3(func_935)

func_936
  -> func_888(0x7)
  -> func_308(global20, motionHash, ...)
  -> func_531(func_937)
  -> func_296(0x3e8, 1)
  -> func_123(0x381) at timeline

func_937
  -> sys_46(0x5, ...)
  -> func_532(...)
  -> func_535(...)
  -> func_536(mask, time, callback)
  -> func_321(cameraHash)
```

这里同时涉及四个系统：

- shell：`func_888(0x7)` 切 loadout / 变形表现。
- motion：`func_308` 播放动作。
- movement：`sys_46`、`func_532/535` 控制突进 / 追踪 / 惯性候选。
- route：`func_536` 和 `func_123` 控制派生 / cancel 窗口。

所以改特格不要只改 motion hash。你必须先决定改的是外观、速度、追踪、派生窗口、还是取消路线。

### N 格斗：`ACTION_B_MELEE`

源码锚点：`2.c:27343-27410`。

```text
ACTION_B_MELEE
  -> func_488()
  -> func_219(0xde3d1477)
  -> global602 = func_966
  -> callFunc3(func_965)

func_966
  -> func_308(global20, 0x3894dc3b, ...)
  -> global170 = 1
  -> func_887()
  -> func_123(0x200)

func_967
  -> func_308(global20, 0xe50205be, ...)
  -> func_532(0x2, 0xd, 0x58)
  -> func_535(0x1, 0xa)
  -> func_536(0x1, 0xf, func_968)
  -> func_536(0x20, 0xf, func_980)
  -> func_536(0x4, 0xf, func_1007)
  -> func_123(0x200)
  -> func_125(0xc00000)
```

格斗阅读重点：

- `func_219(rowHash)` 是格斗 / movement 参数 row。
- `global602` 是首段 callback。
- `func_532/535` 是追踪 / 命中前移动窗口候选。
- `func_536(mask,time,callback)` 是派生窗口。
- `func_123/125` 是取消或动作状态 mask。

## 六类系统怎么找

### 1. 动作系统

入口链：

```text
func_1043 -> func_241(hash, ACTION_*)
func_21/24/25 -> global5/global6
func_44/52 -> sys_0(0x10002, 0x2, hash) -> sys_2(... callback)
ACTION_* -> runtime callback slots
```

搜索策略：

- 已知玩家动作：先搜 `ACTION_` 或 action hash。
- 未知 hash：先看 `func_1043`，再看 callback 设置了哪些 runtime 槽。
- offset 变了：匹配 `func_241` 注册表形态，而不是当前 `func_N`。

### 2. 射击 / ammo / 援护

常见证据：

```text
sys_4F(0, slot, weaponHash)
sys_4F(0x7, slot, 1)
sys_0(0x90000, slot, 0)
sys_51(0x20000, 0, 0x2, index, type)
```

读法：

- `sys_4F(0,...)` 是 weapon / projectile 请求候选。
- `sys_4F(0x7,...)` 是主动扣 ammo。
- `sys_0(0x90000,slot,0)` 是 ammo / weapon slot 状态检查。
- `sys_51(0x20000,...)` 在 Notion 记录和当前样本里都指向援护召唤。

不要把“召唤援护”和“扣 ammo”混在一个点改。

### 3. 格斗 / 派生

常见证据：

```text
func_488()
func_219(rowHash)
global602/global608/global609/global610
func_532 / func_535 / func_536
func_123 / func_125
```

读法：

- `func_488` 清 melee / special runtime。
- `func_219(rowHash)` 加载动作参数。
- `func_536` 按 mask 和 time 安装派生 callback。
- `func_123/125` 控制 cancel / action mask。

Notion 里把 `func_532(...)` 记录为近战命中 / 前进惯性候选；当前样本能证明它写 `global625/626/627`，最终 native 消费还需要继续验证。

### 4. BD / movement

常见证据：

```text
speed_param hash
func_11
sys_0(0xc000*)
sys_46(...)
func_296 / func_298..302
```

读法：

- `speed_param` 是机体基础移动表，例如 `boost_dash_duration_frame`、`boost_dash_distance`、`step_distance`。
- `func_11` 是 boost / cancel gate 状态机，不是原始 BD 输入函数。
- `sys_46` 是动作局部 movement 控制总线。
- `0xc000*` 是 native 暴露的 gate / movement 状态槽，当前已有脚本侧初分型。

改 BD 基础手感，优先查 `docs/command_mapping.md` 的 `speed_param`；改某个动作的突进，优先查该 `ACTION_*` 内 `sys_46/func_532/func_536`。

### 5. 镜头

常见证据：

```text
func_321(cameraHash)
sys_53(0x4, cameraHash, strength)
sys_53(0x5)
```

仓库 `sys_53` native 文档已经把它收敛到第三人称相机参数 / preset 层。当前样本中 `func_321(arg)` 只是包装：

```text
sys_53(0x4, arg, 0x4650)
```

读法：

- `sys_53(0x4, hash, ...)` 启用 camera preset。
- `sys_53(0x5)` 清理 / 退出 camera preset。
- 镜头一般在动作 timeline 的某一帧进入，动作结束或被打断时必须确认是否清掉。

### 6. shell / 换装 / 模型组件

常见证据：

```text
func_877
func_887
func_888(mode)
sys_4B(...)
sys_47(0x10/0x11/0x12,...)
global170 / global143
```

Notion 记录中，`sys_4B(0x2, modelHash, boneIndex, actionHash, targetModel)` 是模型接上模型；`sys_4B(0x3)` 是解除装备。当前样本中：

- `func_877` 初始化 active shell。
- `func_887` 根据 `global170` 应用默认 loadout。
- `func_888(mode)` 分发具体装卸组合。
- `global170` 也会影响 motion resource group，因此换装和动作播放不是完全独立。

改组件挂接前，先确认动作结束是否会调用 `func_887()` 恢复默认 loadout。

## 如何判断一个陌生 `func_N`

用函数外形判断，不要先猜名字：

| 外形 | 可能角色 | 例子 |
|---|---|---|
| 大量清 global，再调初始化函数 | 初始化器 | `func_1`、`func_386` |
| 大量 `func_241(hash, callback)` | action registry | `func_1043` |
| 大量 `sys_1(0x10001,...)` | slot / resource registry | `func_1044..1046` |
| 开头 `func_586()` 并设置 `global677/680/681` | ranged action installer | `ACTION_A_SHOT` |
| 开头 `func_488()` 并设置 `global602/609` | melee / special action installer | `ACTION_B_MELEE`、`ACTION_BC_SPECIAL_MELEE` |
| `global240 == 0` guard + `func_308` + `func_309` | timeline segment | 多数实际动作段 |
| 只有一行 syscall 包装 | syscall helper | `func_321` |
| 大量 `sys_46` 和 `speed_param` hash | movement controller | `func_423..447` |
| 大量 `sys_4B/sys_47` | shell / model transform | `func_887/888` 附近 |

## 一个实际模组改动流程

假设你要改“特格突进速度和派生窗口”：

1. 从 `func_1043` 找特格 action：`0x6ab12717 -> ACTION_BC_SPECIAL_MELEE_ALT_2`、`0x193fe550 -> ACTION_BC_SPECIAL_MELEE`。
2. 进 `ACTION_*` 看 runtime 槽：`global602` 还是 `global609`。
3. 看 runtime driver：`func_489` 或 `func_502`。
4. 找实际 segment：例如 `func_936/937/940`。
5. 区分改动目标：
   - 速度 / 位移：`sys_46`、`func_219(rowHash)`、`speed_param`。
   - 追踪 / 惯性：`func_532/535`。
   - 派生：`func_536(mask,time,callback)`。
   - 取消：`func_123/125`。
   - 外观：`func_888(mode)`、`global170/global143`。
   - 镜头：`func_321/sys_53`。
6. 改完后按地上、空中、overheat、命中、空挥、被打断、动作自然结束分别测。

这个流程比“搜所有 `sys_46`”更稳，因为它从玩家动作出发，保留了 action context。

## 当前进度能支持什么

当前文档和证据已经足够支持：

- 找到 `func_1` 初始化的系统边界。
- 从 action hash 追到 `ACTION_*` callback。
- 区分主射发弹、ammo 扣减、援护召唤。
- 区分普通格斗、特格 / 特殊移动、派生窗口。
- 识别镜头 preset 与清理点。
- 把 `func_887/888` 放回 shell / loadout 链路。
- 按脚本侧证据解释 `func_11` 和 `0xc000*` gate 状态槽。

当前还不能声称完全解决：

- `sys_46` native case 级参数语义。
- `0xc000*` native handler 的最终命名。
- hitbox / damage / down value / proration 的完整资源链。
- raw input 到 action hash 的 native selector。
- 多机体样本下 dynamic overlay 的稳定性。

这些不是失败点，而是后续研究边界。做模组时要把“脚本侧已知”和“native 层未验证”分开。

## 资料来源

- 当前样本：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`
- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki 系统页：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki 初心者指南：`https://w.atwiki.jp/exvs2ob/pages/559.html`
- OverBoost wiki 用语集：`https://w.atwiki.jp/exvs2ob/pages/82.html`
- 本仓库：[command_mapping.md](../command_mapping.md)
- 本仓库：[EXVS MSC Syscall 53 Investigation Notes](../exvs-msc-syscall-53-notes.md)
- 本仓库：[EXVS MSC Syscall 4F Investigation Notes](../exvs-msc-syscall-4f-notes.md)
- 相关研究：[动态命名与 JSON overlay 方案](./dynamic-naming-overlay.md)
- 相关研究：[`func_11` / `0xc000*` boost gate 状态槽地图](./func11-c000-boost-gate-map.md)
