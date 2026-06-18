# MSC 系统控制面矩阵：BD / 移动 / 镜头 / 动作 / 射击 / 格斗怎么改

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

当前仓库生成的结构化分析记录这份 `2.c` 约 29664 行、1047 个函数。这里的目标不是把 1047 个 `func_N` 一次性改名，而是建立一张可复用的“控制面矩阵”：每个玩家能感知的系统，都要能追到脚本层、资源层、native syscall 层和实机验证点。

如果当前问题已经落到资源数值，例如普通 BD / step、boost、射击伤害、弹体 hitbox、格斗追踪，直接看 [MSC 资源层 patch 指南：BD / step / boost / 射击 / 格斗该改哪些表](./resource-control-surface-for-modders.md)。

这页适合回答这些问题：

- 我怎么知道 `func_1` 在做初始化，而不是某个动作？
- BD、step、移动、镜头、射击、格斗到底分别在哪一层控制？
- 我想改一个具体手感时，应该改 action-local segment、资源表、还是 syscall/native？
- 换另一个 MSC 样本后，`func_N` 或 offset 变了，怎样保持分析不失效？

## 0. 先分清三件事

### 玩家操作不是脚本函数

OverBoost wiki 的玩家系统语义大致是：

- BD 是方向输入加跳跃键两次，能取消绝大多数射击和格斗动作，会消耗 boost。
- step 是同方向输入两次，能切一次诱导和枪口补正，也会消耗 boost。
- boost 空了以后，BD、step、变形和一部分武装会受限，落地硬直明显变大。
- BR ズンダ这类连射不是脚本里“按 A 三次”，而是射击动作之间通过 BD cancel 重新进入射击。

脚本侧看到的通常不是原始按键，而是 engine 已经选出来的 action hash、状态槽、weapon slot、方向 flag。也就是说，不要把 `0xf48d2d49` 这类 hash 直接命名成“A 键”。更稳的名字是 `action.mainShot` 或 `main shot action hash`，再用 `commandlist` 和行为验证把它映射回玩家操作。

### `func_1` 是系统初始化，不是武装动作

判断 `func_1` 的最短证据链：

```text
main
  -> sys_2(... func_3 / func_26 / func_27)
  -> func_1
  -> callFunc3(func_4)
```

`func_1` 在主循环 `func_4` 之前执行，并且它做的是全局清零、runtime helper 初始化、action callback 表初始化、shell/loadout 初始化、action/resource registry 初始化。它不是射击、格斗、移动、镜头中的任何一个单独动作。

### 普通 BD / step 不是某一条 `sys_46`

`sys_46` 在当前脚本里大量出现在动作内移动、格斗推进、特殊移动、清场或倍率包装器里。它很重要，但不等于“普通 BD 系统”。普通 BD / step 的基础性能更可能同时受这些层控制：

```text
玩家输入 / engine 状态
  -> action selector / boost gate
  -> speed_param / character_param
  -> 2.c 的 func_11 gate 和 action cancel route
  -> 具体动作里的 sys_46 只影响动作局部移动
```

如果目标是“普通 BD 更远、step 更远、boost 总量更多”，优先看资源表。只有目标是“某一招自己的横移、突进、惯性、追踪窗口”时，才优先回到该 `ACTION_*` 的 segment 和 `sys_46` 参数。

### `sys_0` 参数表读取不是自解释的

一个关键反思：MSC 里看到的 `sys_0(tableId, rowHash, fieldHash)` 并不会告诉我们字段原名。单靠 `2.c` 只能知道“这里读取了某个系统表”，不能知道它是 speedparam 的哪一项。

典型例子：

```c
sys_0(0x60006, global142, 0x5e8caf43)
```

跨查资源映射后才能读成：

```text
readSpeedParam(global142, air_dash_duration_frame)
```

当前证据：

| MSC 片段 | 资源层解释 | 证据 |
|---|---|---|
| `0x60006` | speedparam / 移动参数表 | `command_mapping.md` 与 speedparam editor 资料 |
| `global142` | speedparam entry key | `0xc2b19d12` 可解为 `SKL_MOVE` |
| `0x5e8caf43` | `air_dash_duration_frame` | `command_mapping.md`，`param_field_analysis.md` |

这意味着“人手看 MSC”只能做到第一层定位；真正解释移动、boost、落地、BD、step 参数，必须把 MSC syscall 与资源字段映射合并。后续 TestEditor 的 auto rename / overlay 应该支持这种跨层显示，例如把 `sys_0(0x60006, global142, 0x5e8caf43)` 注释为 `speedparam[global142].air_dash_duration_frame`。

## 1. 统一分层

| 层 | 人话 | 当前样本证据 | 模组意义 |
|---|---|---|---|
| 玩家语义层 | 玩家按射击、格斗、跳、方向，看到 BD、step、BR ズンダ、格斗派生、镜头演出 | OverBoost wiki 系统页、初心者指南、テクニック页、用语集 | 用来定义“我要改什么”，但不能直接当脚本函数名 |
| input/action 选择层 | engine 把输入、状态、武装可用性、cancel route 变成 action hash 或状态槽 | `sys_0(0x10000,...)`、`sys_1(0x10001,...)`、`sys_1(0x10002,...)` | 不要把 hash 当按钮；先确认 action 从哪里进入 |
| 初始化和注册层 | 启动时建立 action 表、slot 表、资源表、shell 初始状态 | `func_1 -> func_386/272/877 -> func_1042/1043/1044/1045/1046` | 不适合直接调手感，但适合定位 action 和资源 |
| 每帧 gate / dispatch 层 | 每帧读状态，处理 boost/cancel/外部转移，把 pending action commit 到 callback | `func_4 -> func_20/21/22/23 -> func_11/12/13 -> func_44/52` | 改全局 cancel、OH 边界、强制中断时才优先碰 |
| action runtime setup 层 | 某个 `ACTION_*` 安装 ranged/melee/special runtime，决定后续跑哪个 driver 和 segment | `ACTION_A_SHOT`、`ACTION_B_MELEE`、`ACTION_BC_SPECIAL_MELEE` 等 | 大多数动作 patch 的入口层 |
| segment output 层 | 时间线片段真正输出子弹、援护、位移、镜头、模型、特效 | `func_79/308/309`、`func_489/502/586` family、`func_321`、`func_536` | 最常见的局部改点，风险比 shared driver 低 |
| syscall/native 层 | 脚本请求 engine 执行表现、移动、相机、模型、武装、状态读写 | `sys_4F`、`sys_51`、`sys_46`、`sys_53`、`sys_4B`、`sys_47`、`sys_4A`、`sys_58` | 参数可改，但 case 语义不硬时要谨慎 |
| 资源层 | 武装、弹体、角色速度、boost、damage、hitbox 等数据 | `command_mapping.md` 的 `character_param`、`arms_param`、`bullet_param`、`commandlist` | 改基础性能和弹体参数时优先查这里 |
| semantic overlay 层 | 跨样本稳定命名，不依赖当前 `func_N` | `overlays/0xBDBE6FEA-2.semantic-overlay.json` | 后续 offset 变化时用 evidence shape 重新匹配 |

## 2. 系统控制面总表

### 2.1 `func_1` / 初始化

| 观察点 | 结论 |
|---|---|
| `main` 先注册 VM callback，再调用 `func_1`，再 `callFunc3(func_4)` | `func_1` 是主循环前初始化 |
| `func_1` 清 early globals | 建立脚本初始状态 |
| `func_1 -> func_386 / func_272` | 初始化动作、runtime helper、输入/状态 helper |
| `func_1 -> sys_1(0x10002,0x2,hash,callback)` | 安装 action callback 桥 |
| `func_1044 -> sys_1(0x10001,0x2,slot,callback)` | 安装 slot callback 表 |
| `func_1 -> func_877 -> func_1042` | 初始化 shell、HUD / ammo 资源、action/resource registry |

模组判断：

- 不要在 `func_1` 里直接调某个武装的伤害、弹速、位移。
- 可以从 `func_1 -> func_877 -> func_1042` 找“这个机体启动时登记了哪些 action、slot、资源组”。
- 如果改 shell 初始外观、默认 loadout 或 action registry，才需要理解 `func_1`。

验证方式：

- 进训练场，确认出生默认外观、默认 ammo、默认可用 action 没坏。
- 切换形态或进入动作后，确认结束时能恢复到 `func_887()` 选择的默认 loadout。

### 2.2 动作选择 / action dispatch

当前主链：

```text
func_1043
  -> func_241(actionHash, callback)

每帧：
func_4
  -> 读 engine 状态和 pending action
  -> func_11/12/13 gate
  -> func_44 或 func_52 commit
  -> sys_0(0x10002, 0x2, actionHash)
  -> sys_2(0, 0x2, callback/scriptPointer)
```

动作 callback 内部可能还有第二级 slot dispatch：

```text
ACTION callback
  -> func_69(slot) 或 func_70(slot, subslot)
  -> sys_0(0x10001, 0x2, slot)
  -> global223 = slot callback
  -> func_72
  -> (*global223)()
```

以德尔塔 Plus 变形为例，`0x9475130e -> func_450` 后不是直接切飞机模型，而是 `func_450 -> func_69(0x23)`，再由 `0x10001/0x2` 表查到 `0x23 -> func_870`，最后进入形态 case `0x7` 才调用 `func_1037`。

控制面：

| 你想改什么 | 优先看 | 不要先碰 |
|---|---|---|
| 某个玩家动作进入哪个脚本 | `func_1043` action registry、`commandlist.command_type`、overlay `depiction.actionHashRegistry` | 直接改 `func_1` |
| 某个动作能不能从另一个动作 cancel 进入 | action segment 里的 `func_123/125`，再看 `func_11` gate | 只改 motion 时间 |
| 某个状态下动作被禁用 | `sys_0(0x10000/0xc000*)`、`sys_0(0x90000)`、`func_11` | 直接替换 callback |
| 新增或交换 action callback | `func_1043` 和 `func_241(hash, callback)` | 未确认资源和 cleanup 就换 shared driver |

人话解释：

`func_1043` 像“动作目录”。玩家按键和状态在 engine 里先变成 action hash，脚本每帧只负责查这个 hash 对应哪个 callback，再让 callback 安装具体 runtime。动作真正的子弹、镜头、位移、派生通常不在 registry，而在 callback 后面的 runtime segment。

`0x10001/0x2` 则更像“动作槽回调表”。`sys_0(0x10001,0x2,slot)` 不是自己执行调用，而是取回调地址；实际执行发生在 `(*global223)()`。所以分析时不要写成“`sys_0` 呼叫了某函数”，更准确是“`sys_0` 查表返回某函数指针，随后被间接调用”。

### 2.3 射击 / 主射 / 副射 / 弹体

典型链：

```text
玩家射击语义
  -> engine/action selector
  -> action.mainShot hash
  -> ACTION_A_SHOT
  -> ranged runtime setup
  -> fire segment
  -> sys_4F(0, slot, weaponHash)
  -> sys_4F(0x7, slot, 1)  可见的主动扣 ammo 模式
  -> arms_param / bullet_param
```

当前证据：

- Notion 记录里 `sys_0(0x90000, slot, 0)` 是 weapon slot / ammo 检查模式。
- Notion 记录里 `sys_4F(0, slot, hash)` 是射击 / ammo id 请求。
- Notion 记录里 `sys_4F(0x7, index, 1)` 是主动 ammo decrement 候选。
- `command_mapping.md` 的 `arms_param` 包含 `ammo_count`、`damage`、`down_value`、`startup_frame`、`active_frame`、`recovery_frame`、`boost_consumption_rate`、`range`、`bullet_type`、`bullet_speed_rate` 等字段。
- `command_mapping.md` 的 `bullet_param` 包含 `hitbox_width/height/depth`、`speed_internal`、`initial_speed`、`duration_frame`、`hitgroup_hash` 等字段。

控制面：

| 目标 | 优先 patch 层 | 检查点 |
|---|---|---|
| 换主射弹体 | fire segment 的 `sys_4F(0, slot, weaponHash)` hash | ammo slot、弹体资源是否存在、命中和取消后是否正常 |
| 改伤害 / down value / 弹速 | `arms_param`、`bullet_param` | 脚本 hash 是否指向同一个资源 |
| 改弹数 / reload / 消耗 | `arms_param.ammo_count`，脚本 `sys_0(0x90000)` 和 `sys_4F(0x7)` | 射击、BDC、空弹、reload、觉醒状态 |
| 改发生 / 后摇 | action runtime segment 时间线、资源 startup/recovery | motion、判定、cancel window 是否错位 |

不要误判：

- `sys_4F` 不是“按钮”。它是脚本向 engine 请求 weapon/ammo/发射相关操作。
- 如果只是想让弹更快，优先看 bullet/resource，不要先换整条 action callback。
- 如果 BR ズンダ异常，可能是 ammo、action cancel、BD gate 三层共同问题，不只是一条射击 syscall。

### 2.4 援护 / 特射

典型链：

```text
ACTION_AC_SPECIAL_SHOT_DIRECTIONAL
  -> 读取方向 flag
  -> 选择 assist branch
  -> sys_51(0x20000, 0, 0x2, index, type)
  -> sys_4F / ammo decrement
```

当前证据：

- Notion 记录里 `sys_51(0x20000,0,0x2,index,type)` 是 summon assist 候选。
- Notion 记录里 `global200` 是方向输入 flag 候选。
- Notion 记录里 `global172/global175` 方向语义为 `0x4` front、`0x8` back、`0x10` left、`0x20` right。
- 特射常同时涉及 ammo slot、方向分支、assist index/type、动作结束 cleanup。

控制面：

| 目标 | 优先 patch 层 | 必测 |
|---|---|---|
| 换援护类型 | `sys_51` 的 assist index / type | N、前、后、左、右输入 |
| 改援护消耗 | `sys_4F(0x7)` 和 weapon slot 检查 | 空弹、reload、连续输入 |
| 改方向派生 | 读取 `global200/global172/global175` 的 branch | 斜方向、无方向、转身状态 |
| 改援护动作硬直 | `ACTION_AC_*` runtime segment | BDC、OH、被打断 |

不要误判：

- 方向派生不是五个完全独立系统，通常共享 action family，只在分支里选择不同 index/type。
- 如果只换 assist hash，却不检查 ammo 和 cleanup，很容易出现“能召唤但 UI、弹数或结束状态不一致”。

### 2.5 格斗 / 派生 / 判定窗口

典型链：

```text
ACTION_B_MELEE
  -> melee runtime setup
  -> func_219(row) 加载动作参数 row
  -> func_489 / related driver
  -> func_308 / func_309 motion and timeline
  -> func_532 / func_535 / func_536 派生和输入窗口
  -> hitbox / damage resource or native hit handler
```

当前证据：

- `func_488()` 是 melee / special runtime 清场候选。
- `func_219(row)` 是动作参数 row loader 候选。
- `func_489()` 是普通格斗 / 一部分特殊格斗 runtime driver 候选。
- `func_532/535/536` 和 `func_239` 构成派生 / 输入窗口系统候选。
- `command_mapping.md` 的 `character_param` 包含 `melee_damage`、`melee_tracking_angle` 等全局格斗倾向字段。
- damage、hitbox、proration、down value 的最终链路还没有完全拆硬，不能把当前脚本猜测当最终 native 名。

控制面：

| 目标 | 优先 patch 层 | 检查点 |
|---|---|---|
| 换格斗 motion | segment 中的 `func_308` / motion hash | 命中、空挥、step cancel、派生 |
| 改格斗追踪 / 突进 | `func_219(row)`、`func_532/535`、动作内 `sys_46` | N、横、前、后、绿锁、红锁 |
| 改派生时间 | `func_536(mask, time, callback)`、`func_535(start,end)` | 早按、晚按、连打、hit / whiff |
| 改伤害或判定 | 资源层和 native hit handler，脚本侧只作为入口 | damage、down、补正、盾、防御、觉醒 |

不要误判：

- 格斗“手感”通常由 motion、tracking、派生窗口、hitbox、cancel route 一起决定。
- 如果目标是只改某一段 N 格派生，优先改 action-local segment，不要改 shared melee driver。
- `sys_47(0x7, activeShell)` 这类命中/接触/动作完成判断需要继续和 native 对齐，不能直接命名成最终 hit check。

### 2.6 普通 BD / step / boost gate

玩家语义：

- BD 是移动和取消的核心系统，会消耗 boost。
- step 切诱导和枪口补正，格斗中常用 step cancel。
- boost 空了以后，很多移动和动作受限，落地硬直变大。

脚本侧控制面：

```text
engine input and boost state
  -> sys_0(0x10000/0xc000*) 状态读取
  -> func_11 boost/cancel gate
  -> func_123/125 action-local cancel window
  -> speed_param / character_param 基础性能
  -> action-local sys_46 只负责某些动作内移动
```

控制面：

| 目标 | 优先 patch 层 | 不要先碰 |
|---|---|---|
| 普通 BD 更远 | `speed_param.boost_dash_distance`、`boost_dash_duration_frame`、`boost_dash_distance_max` | 某个特格里的 `sys_46` |
| 普通 BD 次数更多 | `speed_param.boost_dash_count`、`character_param.boost_gauge_*`、boost 消耗字段 | 单个 action callback |
| step 更远或更快 | `speed_param.step_distance`、`step_speed`、`step_recovery_frame` | 射击 fire segment |
| 某个动作能不能 BDC | 动作 segment 的 `func_123/125`，再看 `func_11` gate | 只改 motion hash |
| OH 时能不能做某动作 | `func_11`、`0xc000*` 状态槽、资源 boost consumption | 只改 ammo |

当前边界：

- `func_11` / `0xc000*` 文档已经能指导脚本侧阅读，但 native 状态槽还没有最终命名。
- 普通 BD / step 基础性能应优先从资源表和 engine 状态理解，脚本里的 `sys_46` 主要用于动作局部移动。
- 如果把普通 BD、动作内横移、格斗追踪全部命名成一个“BD 函数”，后续 patch 会很难验证。

### 2.7 动作内移动 / 特格 / 变形突进

典型链：

```text
ACTION_BC_SPECIAL_MELEE
  -> special melee runtime setup
  -> direction branch
  -> segment
  -> sys_46(...) 动作局部移动
  -> func_532 / func_535 / func_536 派生或窗口
```

控制面：

| 目标 | 优先 patch 层 | 必测 |
|---|---|---|
| 特格横移更远 | 对应 `ACTION_BC_*` segment 中的 `sys_46` 常量和持续时间 | N、前后左右、红锁/绿锁、OH |
| 突进更快 | `func_219(row)`、`sys_46`、motion timeline | 贴脸、远距离、空挥、命中 |
| 变形/骑乘状态外观 | `global143`、`global170`、`func_1037/1038`、`func_887/888` | 进入、取消、被打断、结束恢复 |
| 派生更早 | `func_535/536` window | 命中派生、空挥派生、连打 |

不要误判：

- 这类动作内移动可以用 `sys_46` 调手感，但它不代表普通 BD 全局参数。
- 如果动作改变 shell 或 `global143`，必须检查结束和中断路径是否还原。

### 2.8 镜头 / 演出

典型链：

```text
ACTION_* segment
  -> func_321(cameraHash)
  -> sys_53(0x4, cameraHash, ...)
  -> action end / interrupt / cleanup
  -> sys_53(0x5, ...)
```

当前证据：

- `sys_53` 是 `CDepictionScript` camera parameter / preset bus。
- `sys_53(0x4, hash, ...)` 是启动 preset 候选。
- `sys_53(0x5, ...)` 是清理 preset 候选。
- `sys_53(0/0x2/0x3/0x6, ...)` 还涉及 shake、zoom、插值或 vector-ish 参数，需要按 callsite 和实机效果验证。

控制面：

| 目标 | 优先 patch 层 | 必测 |
|---|---|---|
| 换觉醒技镜头 | action segment 中的 `func_321` 或 `sys_53(0x4)` hash | 命中、空挥、被 cut、动作结束 |
| 改 zoom / shake | 对应 `sys_53` case 和参数 | 近距离、远距离、多人混战 |
| 防止镜头残留 | `sys_53(0x5)` cleanup 路径 | 被打断、受身、死亡、切 target |

不要误判：

- 只改进入镜头不改清理，会出现残留镜头或视角卡住。
- 镜头不是动作本体，action 结束、hit stop、cut-in、target 切换都会影响体验。

### 2.9 shell / 换装 / 组件挂接

典型链：

```text
func_877
  -> sys_4B(0, base shell)
  -> global20 = sys_4B(1)
  -> global170 = 0
  -> func_887
  -> func_1042

func_887
  -> 根据 global170 选择默认 loadout
  -> func_888(0/1/...)

func_888
  -> 不同 loadout / mode branch
  -> sys_4B attach / detach
  -> sys_47 rotate / translate / scale
```

当前证据：

- Notion 记录里 `sys_4B(0x2, model, bone, action, target)` 是 attach model 候选。
- Notion 记录里 `sys_4B(0x3)` 是 detach 候选。
- Notion 记录里 `sys_47(0x10/0x11/0x12)` 是 rotate / translate / scale 候选。
- `global170` 是 stance resource group selector。
- `global143` 是 flight/riding/alternate shell state 候选。

控制面：

| 目标 | 优先 patch 层 | 必测 |
|---|---|---|
| 改出生默认组件 | `func_877 -> func_887 -> func_888` | 出生、重开、觉醒、死亡重生 |
| 改动作中挂接组件 | action-local branch 里的 `func_888` 或 `sys_4B/47` | 动作结束、BDC、被打断 |
| 改变形/骑乘外观 | `global143`、`func_1037/1038`、`func_887` restore | 进入、取消、结束、受击 |
| 改骨骼挂点偏移 | `sys_4B` attach 参数和 `sys_47` transform | 左右方向、镜像、模型缩放 |

不要误判：

- `func_887/888` 是 shell/loadout 控制面，不是整个 MSC 系统。
- 如果只在动作开始 attach，不在结束或中断 detach/restore，会留下错误组件。
- 改 shell 时要同时关注 `global170` 资源组，否则 motion/resource group 可能和外观不一致。

### 2.10 特效 / 表现资源

典型控制面：

```text
ACTION_* segment
  -> sys_4A / sys_58 / sys_47 / sys_4B
  -> effect resource / ALEO / model / bone
```

控制面：

| 目标 | 优先 patch 层 | 检查点 |
|---|---|---|
| 换特效 | segment 的 effect hash / resource hash | 生成位置、生命周期、多人场景 |
| 改模型表现 | `sys_4B/47` | attach、detach、transform、restore |
| 改演出同步 | motion timeline、effect start/end frame | hit、whiff、BDC、中断 |

不要误判：

- 特效 hash 和武装 hash 经常同在一个动作 segment，不要因为都像 hash 就混为一类。
- 表现资源能改视觉，不一定改伤害、判定或弹体。

## 3. 按目标选择 patch 层

| 你的目标 | 第一选择 | 第二选择 | 风险提示 |
|---|---|---|---|
| 普通 BD 更远 | `speed_param` / `character_param` | `func_11` gate 只在全局规则异常时看 | 不要从特格 `sys_46` 推回普通 BD |
| 某一招横移更远 | 对应 `ACTION_*` segment 的 `sys_46` | motion timeline / `func_219(row)` | 必测 OH、BDC、被打断 |
| 主射换弹 | fire segment 的 `sys_4F(0,slot,hash)` | `arms_param` / `bullet_param` | ammo slot 和扣弹要一起看 |
| 主射更快 / 更痛 | `arms_param` / `bullet_param` | action startup/recovery | 不要只换脚本 hash |
| 援护换人或换动作 | `sys_51` index/type | `sys_4F` ammo decrement | 方向派生都要测 |
| 格斗派生更早 | `func_536` / `func_535` window | motion timeline | hit/whiff/连打都要测 |
| 格斗突进更强 | `func_219(row)`、`sys_46`、tracking 资源 | melee driver | 不要改 shared driver 后影响全部格斗 |
| 觉醒技镜头 | `func_321` / `sys_53(0x4)` | `sys_53(0x5)` cleanup | 进入和清理必须成对验证 |
| 动作中换装 | action-local `func_888` / `sys_4B/47` | `func_887` restore | 检查 cancel 和被打断 |
| 跨版本命名稳定 | semantic overlay evidence shape | 当前 `func_N` 只当定位 | 换样本后先重跑 analysis JSON |

## 4. 两条完整跟读示例

### 示例 A：主射换弹体，但保持 BR ズンダ逻辑

目标：

```text
主射弹体换成另一个 weapon hash，但不破坏 ammo、BDC 和连射手感。
```

跟读：

```text
玩家按射击
  -> engine 选出 main shot action hash
  -> func_1043 中能找到 hash -> ACTION_A_SHOT callback
  -> ACTION_A_SHOT 安装 ranged runtime
  -> fire segment 调 sys_4F(0, slot, weaponHash)
  -> ammo 相关路径检查 sys_0(0x90000, slot, 0) 和 sys_4F(0x7, slot, 1)
  -> 资源层检查 arms_param / bullet_param
```

实际改点：

- 如果只换弹体，优先替换 fire segment 的 `weaponHash`。
- 如果要改伤害、down value、弹速、hitbox，优先改 `arms_param` / `bullet_param`。
- 如果要改弹数或消耗，必须同时看 weapon slot 检查和主动扣 ammo。

必测：

- 单发主射。
- 主射后 BDC，再主射。
- 空弹输入。
- reload 后再次主射。
- OH 状态下主射和落地。

判断标准：

- 如果弹体变了但弹数 UI 或 reload 异常，是 ammo/slot 层没对齐。
- 如果单发正常但 BR ズンダ异常，是 cancel gate 或 action re-entry 层要继续查。

### 示例 B：特格横移更远，但不影响普通 BD

目标：

```text
只让某个特格横移距离变远，不改普通 BD / step。
```

跟读：

```text
玩家按特格加方向
  -> engine 选出 BC special melee action hash
  -> func_1043 定位 ACTION_BC_SPECIAL_MELEE 或 directional variant
  -> action callback 安装 special movement runtime
  -> segment 根据方向 flag 分支
  -> sys_46(...) 输出动作内移动
  -> func_532/535/536 处理派生或窗口
```

实际改点：

- 优先改该 action-local segment 的 `sys_46` 距离、速度或持续时间常量。
- 如果突进起步和 motion 不同步，再检查 `func_219(row)` 和 motion timeline。
- 如果动作结束后外观变化，检查 `global143/global170` 和 `func_887()` restore。

必测：

- N、前、后、左、右方向。
- 红锁和绿锁。
- 命中、空挥、BDC、OH、被打断。
- 特格结束后普通 BD 和 step 是否仍保持原样。

判断标准：

- 如果普通 BD 也变了，说明误改了资源或 shared gate，不是 action-local segment。
- 如果只在一个方向异常，方向 branch 或 `global172/global175` 读取需要继续查。

## 5. 动态命名策略

不要把文档主键写成：

```text
func_914 = 主射
```

更稳的是：

```text
semanticId: action.mainShot.fireSegment
currentSample:
  path: E:\XB\解包\com\file\0xBDBE6FEA\2.c
  function: func_914
evidence:
  - reachable from action.mainShot runtime
  - calls sys_4F(0, slot, weaponHash)
  - reads ammo slot global
patchRole: action-local fire output
```

换样本时流程：

1. 对新 `2.c` 重新生成 `generated/*.analysis.json`。
2. 用 overlay 的 evidence shape 匹配函数，而不是用旧 offset。
3. 匹配成功后更新 `currentSample.function`。
4. 人类讨论继续使用 `semanticId`，例如 `action.mainShot.fireSegment`、`depiction.actionHashRegistry`、`depiction.defaultShellLoadoutSelector`。

当前可复用 evidence shape：

| semanticId | 当前样本定位 | 稳定证据 |
|---|---|---|
| `depiction.entryInit` | `func_1` | `main` 前置调用、清 globals、进入 `func_386/877` |
| `depiction.frameLoop` | `func_4` | 被 `callFunc3` 注册、每帧读状态并 dispatch |
| `depiction.actionHashRegistry` | `func_1043` | 大量 `func_241(hash, callback)` |
| `depiction.actionCommit` | `func_44/52` | `sys_0(0x10002,...)` 和 `sys_2(... callback)` |
| `depiction.defaultShellLoadoutSelector` | `func_887` | 根据 `global170` 选择 `func_888` |
| `depiction.shellLoadoutDispatcher` | `func_888` | 分支调用 `sys_4B/47` 改 shell |
| `action.mainShot.fireSegment` | 当前 overlay 已记录 | `sys_4F(0, slot, weaponHash)` |
| `action.acSpecialShot.assistSegment` | 当前 overlay 已记录 | `sys_51(0x20000,...)` 和 ammo path |
| `action.bcSpecialMelee.directionalMovementSegment` | 当前 overlay 已记录 | direction branch + `sys_46` |
| `depiction.cameraPresetStart` | `func_321` wrapper | `sys_53(0x4, cameraHash, ...)` |

## 6. 当前仍不能硬命名的区域

| 区域 | 当前能做什么 | 还缺什么 |
|---|---|---|
| `sys_46` native case | 脚本侧按清场、动作内移动、格斗推进、特殊移动分家，能指导 patch 和测试 | native handler 的 case 参数解析 |
| `sys_0(0xc000*)` | 脚本侧能作为 boost/cancel gate 状态槽阅读 | engine 状态槽 dispatch 和实机状态对照 |
| hitbox / damage / proration | 能从 action、resource、hitgroup hash 入口追踪 | native hit handler、资源 hash 到具体判定表 |
| 原始输入到 action hash | 能确认 `2.c` 消费 action hash，不直接读按钮 | `0.c` 或 native input selector 的完整链路 |
| 跨机体 overlay 稳定性 | 当前样本已有第一批 semantic overlay | 至少第二个机体样本验证 |

这些区域可以讨论和试改，但文档命名要保留“候选 / 工作模型”语气，不能写成最终 native 事实。

## 7. 资料和交叉引用

本页使用的证据入口：

- 本地样本：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`
- Notion MSC 页：`https://app.notion.com/p/MSC-1601ebad394d8027a042df115e61b6dd`
- 本目录入口：[README.md](./README.md)
- 一页式操作手册：[msc-modder-operating-manual.md](./msc-modder-operating-manual.md)
- 关键函数职责表：[2c-key-function-atlas-for-patching.md](./2c-key-function-atlas-for-patching.md)
- worked traces：[modder-worked-traces.md](./modder-worked-traces.md)
- 动态命名方案：[dynamic-naming-overlay.md](./dynamic-naming-overlay.md)
- overlay JSON：[overlays/0xBDBE6FEA-2.semantic-overlay.json](./overlays/0xBDBE6FEA-2.semantic-overlay.json)
- overlay 解析视图：[resolved/0xBDBE6FEA-2.resolved-labels.md](./resolved/0xBDBE6FEA-2.resolved-labels.md)
- input/action 研究：[../exvs-msc-input-action-weapon-pipeline.md](../exvs-msc-input-action-weapon-pipeline.md)
- camera syscall 研究：[../exvs-msc-syscall-53-notes.md](../exvs-msc-syscall-53-notes.md)
- 资源字段映射：[../command_mapping.md](../command_mapping.md)
- OverBoost wiki システム：https://w.atwiki.jp/exvs2ob/pages/593.html
- OverBoost wiki テクニック：https://w.atwiki.jp/exvs2ob/pages/683.html
- OverBoost wiki 初心者指南：https://w.atwiki.jp/exvs2ob/pages/559.html
- OverBoost wiki ブースト/硬直相关指南：https://w.atwiki.jp/exvs2ob/pages/560.html
- OverBoost wiki 用语集：https://w.atwiki.jp/exvs2ob/pages/82.html
