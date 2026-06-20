# MSC 调用链快速决策树：从问题到可改点

这页面向实际改机体的人：当你只知道“我要改主射 / 特格 / BD / 镜头 / 换装”，不要先在 29,664 行里乱搜 `func_887` 或某个 hash。先把目标归到系统，再从稳定形状进入。

当前样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

## 0. 三分钟决策树

```text
我想知道 func_1 在干什么
  -> 看 main: 先注册 VM callback，再 func_1，再 callFunc3(func_4)
  -> 看 func_1: 清全局、初始化基础系统、注册 action callback、进入 func_877
  -> 结论: func_1 是启动初始化，不是某个武装动作

我想改某个玩家动作
  -> 从 func_1043 action registry 找 action hash -> ACTION_* callback
  -> 再看 ACTION_* 里设置了哪组 runtime callback
  -> 最后追 runtime segment 里的 motion / weapon / movement / camera syscall

我想改射击或弹种
  -> ACTION_A_SHOT / AB / AC
  -> ranged runtime: global676..681
  -> sys_4F(0, slot, weaponHash) 发射
  -> sys_4F(0x7, slot, 1) 主动扣弹
  -> sys_0(0x90000, slot, 0) ammo 检查

我想改援护
  -> 找 sys_51(0x20000, 0, 0x2, index, type)
  -> 同时检查 sys_4F(0x7, slot, 1) 扣弹和 ACTION_* 取消路线

我想改格斗、派生、突进
  -> ACTION_B_MELEE / BC / ABC
  -> func_488 清 melee runtime
  -> func_219(row) 载入动作参数
  -> global602/608/609/610 设置 segment callback
  -> func_489 或 func_502 驱动动作
  -> func_532/535/536 是接近、输入窗口、派生时间线候选

我想改 BD、移动、速度或特殊移动
  -> 普通速度先看 speed_param 资源，而不是先改脚本
  -> 动作内位移看 ACTION_* segment 里的 sys_46 / func_532 / func_535
  -> 全局 boost / cancel gate 看 func_11 和 sys_0(0xc000*)
  -> 需要 native 最终语义时再拆 sys_46 handler

我想改镜头
  -> 找 sys_53
  -> func_321(hash) = sys_53(0x4, hash, 0x4650)
  -> 进入点和清理点必须成对看，尤其是被打断路径

我想改换装、挂件、shell
  -> func_877 初始化 active shell 和资源槽
  -> func_887 根据 global170 选默认 loadout
  -> func_888 根据参数切 shell 组合
  -> sys_4B attach / detach / clear
  -> sys_47(0x10/0x11/0x12) 改骨骼 transform
```

## 1. 怎么判断 `func_1` 是初始化

不是靠名字猜，而是靠位置和副作用：

| 证据 | 在样本中的形状 | 人话结论 |
|---|---|---|
| 调用位置 | `main` 先 `sys_2(...func_3/26/27)`，然后 `func_1`，最后 `callFunc3(func_4)` | `func_1` 发生在主循环之前 |
| 全局状态 | `func_1` 开头清 `global1..19` 等基础槽 | 清 runtime 状态，像开局初始化 |
| 基础系统 | 调 `func_61/62`、`func_386`、`func_272` | 建立动作、输入、武装、镜头、换装相关基础表 |
| callback 注册 | 多次 `sys_1(0x10002, 0x2, actionHash, func)` | 注册默认 action handler，不是在执行某次攻击 |
| depiction 初始化 | 末尾进入 `func_877` | 激活 shell / loadout / weapon resource registry |
| 主循环分离 | 真正每帧动作循环在 `func_4` | 初始化和运行时分开 |

所以后续命名时，`func_1` 的工作名应该类似：

```text
init_depiction_script_runtime
```

不要命名成 `init_weapon` 或 `change_form`，因为它的证据覆盖面比单个系统大。

## 2. 系统卡片

| 系统 | 玩家语言 | 稳定入口 | 主要可改点 | 高风险点 | 最小验证 |
|---|---|---|---|---|---|
| 启动 / 初始化 | 机体脚本开局装了哪些系统 | `main -> func_1 -> func_386/877/1042` | action 表、资源槽、默认 shell、基础 callback | 不要把初始化函数当动作函数改 | 进入对战不崩，动作表仍能 dispatch |
| action 注册 | A、B、AB、AC、BC、ABC 对应哪个 callback | `func_1043 -> func_241(hash, callback)` | action hash 到 `ACTION_*` 的映射 | `func_N` 可变，hash 和 syscall shape 更稳定 | 触发按钮后进入预期 callback |
| action dispatch | pending action 如何真正执行 | `func_44` / `func_52` | `sys_0(0x10002,0x2,hash)` 查表，`sys_2` 调 callback | `func_44` 和 `func_52` 分别处理不同 route / secondary action | 正常输入、取消输入、派生输入都能进入 |
| 输入 / 状态读取 | 当前方向、动作、武装状态从哪里来 | `func_21/24/25` | `global87/global172/global200/global5/global6` | 原始按键到 action hash 的上游不完全在 `2.c` | 前后左右、step、BD、取消路线分别记录 |
| 射击 | 主射 / 副射 / 特射怎么出弹 | `ACTION_A_SHOT` 等 ranged action | `global676..681`、`sys_4F`、ammo slot | 弹种、扣弹、取消路线要一起改 | ammo 正确减少，空弹不发，取消路线正常 |
| 援护 | 特射援护召唤 | `sys_51(0x20000,0,0x2,index,type)` | assist index / type，扣弹 slot | 援护和 projectile 可能分属两套资源 | 召唤、命中、消失、重复召唤均正常 |
| 格斗 | N 格、横格、特格、派生 | `ACTION_B_MELEE` / `ACTION_BC_*` | `func_219(row)`、`func_308`、`func_532/535/536` | motion、追踪、派生窗口、取消掩码互相影响 | 空挥、命中、派生、被打断、overheat 都测 |
| 移动 / BD | boost dash、step、特殊移动 | `func_11`、动作内 `sys_46`、`speed_param` | global gate、动作位移、速度资源 | `sys_46` native case 语义还需继续拆 | 地上/空中/overheat/step/BD/动作结束 |
| 镜头 | 格斗镜头、觉醒技镜头 | `func_321` / `sys_53` | camera hash、启用时机、清理时机 | 只加不清会残留镜头 | 命中、空挥、被打断、动作结束镜头恢复 |
| shell / 换装 | 组件挂接、卸下、变形外观 | `func_877 -> func_887/888` | `global170/global143`、`sys_4B`、`sys_47` | 改 action 中 shell 后，要确认结束恢复 | 每个动作进出、取消、死亡、复归都恢复 |
| 动态命名 | offset / `func_N` 变了怎么办 | 当前 `.c` registry + callback body | hash、syscall shape、global family、call-chain role | 不要把一次反编译编号写死为最终真名 | 换第二个样本仍能重新定位 |

## 3. 几条完整链路

### 3.1 启动链路

```text
main
  -> sys_2(0, 0, func_3)
  -> sys_2(0, 0x16, func_26)
  -> sys_2(0, 0x17, func_27)
  -> func_1
      -> 清 global1..19 等启动状态
      -> func_386 初始化 action / input / weapon / camera / shell runtime 槽
      -> sys_1 / sys_47 / sys_50 基础注册
      -> func_877
          -> sys_4B(0, 0xab9c3043)
          -> global20 = sys_4B(1)
          -> sys_4F(0xb, slot, hash) 注册武装 / HUD 资源槽
          -> global170 = 0
          -> func_887 默认 shell loadout
          -> func_1042 注册 action、slot callback、resource hash
  -> callFunc3(func_4)
```

读法：`func_1` 的目标是让后面的 `func_4` 每帧循环有表可查、有 shell 可用、有资源槽可用。

### 3.2 action 分发链路

```text
func_4
  -> func_20/21/22/23/24/25 读取 engine 状态和 pending action
  -> func_5 选择下一次动作
  -> func_11/12/13 处理 boost / cancel / gate
  -> func_44 或 func_52 commit
      -> sys_0(0x10002, 0x2, actionHash) 查 callback
      -> sys_2(0, 0x2 或 0x3, callback)
          -> ACTION_* 函数
```

读法：想找“按钮动作对应哪个函数”，先找 `func_1043` 的注册，再从 `func_44/52` 理解它怎么被调度。不要从底部某个 syscall 倒推整个按钮系统。

### 3.3 主射链路

```text
func_1043
  -> func_241(0xf48d2d49, ACTION_A_SHOT)

ACTION_A_SHOT
  -> func_586
  -> global677 = func_914
  -> global680 = func_915
  -> func_913

func_914 / later ranged segment
  -> global170 = 0
  -> func_887 恢复默认 shell
  -> func_610 / motion setup
  -> sys_0(0x90000, 0, 0) ammo 检查
  -> sys_4F(0, slot, weaponHash) 发射候选
  -> sys_4F(0x7, slot, 1) 扣弹候选
  -> func_123(mask) 设置取消路线
```

读法：改主射不是只改一个 hash。至少同时看弹体请求、ammo slot、扣弹、空弹分支、取消掩码。

### 3.4 特格 / 特殊移动链路

```text
func_1043
  -> func_241(0x6ab12717, ACTION_BC_SPECIAL_MELEE_ALT_2)
  -> func_241(0x193fe550, ACTION_BC_SPECIAL_MELEE)

ACTION_BC_SPECIAL_MELEE_ALT_2
  -> func_488 清 melee/special runtime
  -> func_219(0x769a714e) 载入动作参数 row
  -> global602 = func_936
  -> callFunc3(func_935)
  -> func_489 驱动 segment

func_936 / func_937
  -> func_888(0x7) 切 shell 组合
  -> func_308 播放 motion / segment
  -> func_531(func_937) 切入后续 segment
  -> sys_46(0x5, ...) 特殊移动 / 朝向 / 追踪初值候选
  -> func_532 / func_535 / func_536 设置接近、窗口、派生
  -> func_321(cameraHash) 启用镜头候选
```

读法：特格通常同时动四件事：动作参数、shell、位移、派生窗口。只改 `func_888` 会得到外观变化，但不等于改了特格行为。

### 3.5 N 格链路

```text
func_1043
  -> func_241(0x178d1109, ACTION_B_MELEE)

ACTION_B_MELEE
  -> func_488
  -> func_219(0xde3d1477)
  -> global602 = func_966
  -> callFunc3(func_965)
  -> func_489

func_966 / func_967
  -> global170 = 1
  -> func_887 切默认 loadout group
  -> func_308 播放格斗 motion segment
  -> func_532(0x2, 0xd, 0x58) 接近 / hit / forward inertia 候选
  -> func_535 设置窗口候选
  -> func_536(mask, time, callback) 设置派生时间线
  -> func_123(0x200) 设置取消路线
  -> func_125(0xc00000) 设置额外状态 mask
```

读法：格斗不是一个函数完成。入口 action 只装 runtime，真正每段动作的命中、派生、移动、取消分布在 segment callback 里。

### 3.6 BD / 移动链路

OverBoost wiki 对玩家侧语义的描述是：BD 是跳键二连，可以取消大多数射击 / 格斗并消耗 boost；step 是同方向 lever 二连，用来切 tracking / gun correction；boost 空会 overheat，落地硬直变长。脚本里不要期待看到“press jump twice”这种原始输入，因为 `2.c` 已经在更下游。

```text
func_4 每帧
  -> func_21 读取 global87/global48 等 engine 状态
  -> func_24/25 读取 pending primary/secondary action
  -> func_11 处理 boost / cancel gate
      -> sys_0(0xc000*) 读取 engine gate 状态槽
      -> global23 gate state
      -> global43 enter edge
      -> global45 exit edge
      -> global46 forced reentry latch
      -> global54 movement bonus edge

动作内移动
  -> ACTION_* segment
  -> func_219(row) / speed_param 影响基础动作参数
  -> func_532/535/536 设置接近和窗口
  -> sys_46(...) 写 movement / steering / special move 通道候选
```

读法：如果你要改普通 BD 手感，优先找资源层 `speed_param` 和 native boost 参数；如果你要改某个动作里的突进 / 横移，优先找这个 `ACTION_*` 的 segment 和 `sys_46` 调用。

### 3.7 镜头链路

```text
ACTION_* segment
  -> func_321(cameraHash)
      -> sys_53(0x4, cameraHash, 0x4650)

清理路径
  -> sys_53(0x5, ...)
  -> 动作结束 / 打断 / 切段时触发
```

读法：镜头一定要按“启用点 + 清理点”成对看。觉醒技、格斗命中演出、特殊移动都可能有不同清理路径。

### 3.8 shell / 换装链路

```text
启动
  -> func_877
      -> sys_4B(0, baseShellHash)
      -> global20 = sys_4B(1)
      -> global170 = 0
      -> func_887

默认恢复
  -> func_887
      -> if global170 == 0: func_888(0)
      -> if global170 == 1: func_888(1)

动作内切换
  -> ACTION_* segment
      -> global170 = ...
      -> func_887 或 func_888(mode)
      -> sys_4B(0x2/0x3, ...)
      -> sys_47(0x10/0x11/0x12, ...)
```

读法：`func_887/888` 是 shell / loadout 系统的核心，但它不是高层动作入口。动作入口在 `func_1043`，shell 切换只是动作过程中的一个效果层。

## 4. `func_N` 改了以后怎么继续用这页

把“函数编号”当临时坐标，把“形状”当真正身份。

| 临时编号依赖 | 更稳的识别形状 |
|---|---|
| `func_1` | 从 `main` 调用，发生在 `callFunc3(mainLoop)` 前，清大量 global，进入 depiction init |
| `func_4` | 主循环，反复读 `sys_0(0x10000/0xc000*)`，最后 commit action |
| `func_44/52` | 通过 `sys_0(0x10002,0x2,actionHash)` 查 callback，再 `sys_2` 调度 |
| `func_1043` | 大量 `func_241(hash, ACTION_*)` action 注册 |
| `ACTION_A_SHOT` | 由 action hash 注册，设置 ranged runtime `global676..681`，含 ammo / `sys_4F` 链 |
| `ACTION_B_MELEE` | 由 melee action hash 注册，`func_488`、`func_219(row)`、`global602`、`func_489` |
| `func_887/888` | 使用 `global170`、`global143`、`sys_4B`、`sys_47` 控制 shell loadout |
| `func_11` | 主循环内 gate 状态机，密集读取 `sys_0(0xc000*)` 和写 `global23/43/45/46/54` |

跨样本时，直接从两份 `.c` 记录：

```text
action registry entries
syscall histogram
global read/write family
callers/callees
motion / weapon / camera hash
```

然后按这些 shape 建立 Markdown 工作名。不要把 `func_888` 这种编号写成永久真名。

## 5. 最小模组 worksheet

每次改一个动作，先填这张表：

| 字段 | 当前动作记录 |
|---|---|
| 目标 | 例如：主射弹种 / 特格横移距离 / N 格派生窗口 / 觉醒技镜头 |
| action hash | 来自 `func_1043 -> func_241(hash, ACTION_*)` |
| ACTION callback | 例如 `ACTION_A_SHOT` / `ACTION_B_MELEE` |
| runtime family | ranged `global676..681`、melee `global602/608/609/610`、shell `global170/143` |
| motion callback | 哪个 segment 调 `func_79/308/309/610` |
| 发射 / 援护 | `sys_4F` 或 `sys_51` 参数 |
| 移动 | `func_219(row)`、`func_532/535/536`、`sys_46` 参数 |
| 镜头 | `func_321` / `sys_53` hash，清理点在哪里 |
| 取消 | `func_123(mask)`、`func_125(mask)`、`func_239` 窗口 |
| ammo | `sys_0(0x90000,slot,0)`、`sys_4F(0x7,slot,1)` |
| shell | `global170/global143`、`func_887/888`、`sys_4B/sys_47` |
| 测试场景 | 地上、空中、overheat、命中、空挥、被打断、取消、死亡复归 |

## 6. 来源

- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki 系统页：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki 初心者指南：`https://w.atwiki.jp/exvs2ob/pages/559.html`
- OverBoost wiki 用语集：`https://w.atwiki.jp/exvs2ob/pages/82.html`
- 当前样本：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`

## 7. 相关页

- [从 `2.c` 读到可改点：人类可读的 MSC 模组开发导览](./2c-human-readable-modding-field-guide.md)
- [MSC 模组开发 cookbook：按改动目标反查 `2.c`](./modding-cookbook-action-editing.md)
- [2.c 移动 / BD / `sys_46` / `func_11` 地图](./movement-boost-sys46-func11-map.md)
- [`func_11` / `0xc000*` boost gate 状态槽地图](./func11-c000-boost-gate-map.md)
- 跨样本命名原则：以当前 `.c` 的 action hash、callback shape、syscall/resource 输出为准。
