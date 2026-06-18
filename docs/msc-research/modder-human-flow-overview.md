# MSC 逆向模组开发总览：从玩家动作追到 `2.c` 可改点

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

这页只回答一个问题：

```text
我作为逆向者，怎么从“玩家按了什么 / 想改什么”追到 `2.c` 里真正能改的地方？
```

不要把它当 syscall 表，也不要把它当函数重命名表。它是读码路线图。真正的证据层在：

- [当前样本 semantic overlay JSON](./overlays/0xBDBE6FEA-2.semantic-overlay.json)
- [0xBDBE6FEA / 2.c semantic overlay 解析视图](./resolved/0xBDBE6FEA-2.resolved-labels.md)
- [结构化分析 JSON](./generated/0xBDBE6FEA-2.analysis.json)

## 1. 先建立边界

`2.c` 是 depiction / 表现脚本层。它能稳定说明：

- 本机体 depiction 初始化了什么。
- action hash 如何注册、查表、调度到 `ACTION_*`。
- `ACTION_*` 如何安装 runtime callback。
- segment callback 在什么时间点输出射击、援护、移动、镜头、shell。

`2.c` 单独不能完整证明：

- 原始 A/B/C/跳键如何被 engine 解析。
- 跳键二连如何形成 BD。
- 同方向摇杆二连如何形成 step。
- `sys_46` 每个 native case 的最终参数名。
- 格斗 damage / down value / proration 的完整资源链。

人话边界：

```text
wiki 解释玩家看到的系统。
Notion 解释已知 syscall / global 经验。
2.c 解释当前机体脚本怎么消费 action / 状态并输出表现。
resource / native / 实机测试负责最终验证。
```

## 2. 玩家语义到脚本语义

OverBoost wiki 的系统语义需要先翻译成脚本问题。

| 玩家语义 | wiki 层含义 | `2.c` 里怎么追 |
|---|---|---|
| 主射 / BR | 射击按钮，常用 BD cancel 连射 | 从 `func_1043` 找主射 action hash，再追 `ACTION_A_SHOT -> func_915 -> sys_4F` |
| BR ズンダ | 射击后 BD cancel，再射击 | 不是单个函数；看 `sys_4F` 发射点、`func_123` cancel mask、`func_11` gate |
| BD / BDC | 跳键二连，高速移动，可取消多数动作 | 普通 BD 基础性能不在 `2.c` 完整展开；`2.c` 侧看 `func_11` gate 和动作内 cancel |
| step | 同方向输入二连，切诱导 / 枪口修正 | 上游输入不在 `2.c` 完整展开；格斗 step cancel 先看 `func_123/125` 与 branch window |
| overheat / OH | boost 用尽，BD / step 不可用，落地硬直变大 | `2.c` 侧从 `sys_0(0xc000*)`、`func_11`、action availability 反推 |
| 特射 / 援护 | A+C，机体差异很大 | 从 action registry 找 `ACTION_AC_*`，再追 `sys_51` |
| 特格 / 特殊移动 | B+C，可能是移动、换装、格斗或防御 | 从 `ACTION_BC_*`，再看 `sys_46`、`func_532/535/536`、shell |
| 格斗 / 派生 | B，后续可有方向和输入派生 | 从 `ACTION_B_MELEE`，再看 `func_219`、`func_489`、`func_536`、`func_239` |
| 镜头演出 | 特定动作进入 camera preset / 震动 / 缩放 | 找 `func_321` / `sys_53(0x4)`，同时找 `sys_53(0x5)` 清理 |
| 换装 / 组件 | 模型挂接、拆卸、变形外观 | 找 `func_877 -> func_887/888`，动作段里看 `global170/global143/sys_4B/sys_47` |

## 3. 整体调用链，先背这条

当前样本主链：

```text
main
  -> sys_2(... func_3 / func_26 / func_27)
  -> func_1
       -> func_386
       -> func_272
       -> func_877
            -> sys_4B(0, base shell)
            -> global20 = sys_4B(1)
            -> global170 = 0
            -> func_887
            -> func_1042
                 -> func_1043 action hash registry
                 -> func_1044 slot callback registry
                 -> func_1045 stance resource registry
                 -> func_1046 extra resource registry
  -> callFunc3(func_4)

func_4
  -> func_19..25 read engine / action / weapon / direction state
  -> func_5 choose pending action
  -> func_11 update boost / cancel gate
  -> func_51 / func_52 commit secondary action
  -> func_44 commit primary action
  -> ACTION_* callback
       -> runtime reset
       -> install segment callbacks
       -> driver
       -> segment output
            -> sys_4F / sys_51 / sys_46 / sys_53 / sys_4B / sys_47 / sys_4A / sys_58
```

这条链有两个关键判断：

1. `func_1` 是脚本运行时初始化，不是某个武装。
2. `func_887/888` 是 shell / loadout 下游，不是整体入口。

## 4. 怎么证明 `func_1` 在初始化

看证据，不靠猜：

| 证据 | 说明 |
|---|---|
| `main` 先调用 `func_1`，再 `callFunc3(func_4)` | `func_1` 在主循环前，只能是 init / bootstrap 层 |
| `func_1` 清大量 early global | 初始化 callback、action candidate、状态槽 |
| `func_1 -> func_386` | 初始化大批 runtime global，属于全局运行时 reset |
| `func_1 -> func_272` | 初始化辅助状态 |
| `func_1 -> func_877` | 进入本机体 shell、weapon slot、action registry 初始化 |
| `func_1` 写 `sys_1(0x10002,...)` | 注册基础 action / callback 表 |

所以工作名应该是：

```text
depiction.initializer
```

不要叫它：

```text
main shot init
melee init
shell init
BD system
```

这些只是它间接初始化的大系统的一部分。

## 5. 怎么证明 `func_4` 是每帧主循环

看形状：

| 证据 | 说明 |
|---|---|
| `main` 用 `callFunc3(func_4)` 安装它 | 它不是一次性 init，而是持续 callback |
| 调用 `func_19..25` | 每帧读 engine / action / weapon / direction 状态 |
| 调用 `func_11` | 每帧更新 boost / cancel gate |
| 调用 `func_51/52` 和 `func_44` | 每帧可能提交 action hash |
| 读取 `sys_0(0x10000,...)` | 消费上游 action state |

工作名：

```text
depiction.actionUpdateLoop
```

模组规则：

```text
不要为了改某一招先改 func_4。
func_4 是交通枢纽，不是单招参数。
```

## 6. action registry 怎么用

注册端：

```text
func_1042
  -> func_1043
       -> func_241(actionHash, ACTION_*)

func_241
  -> sys_1(0x10002, 0x2, actionHash, callback)
```

执行端：

```text
func_44 / func_52
  -> callback = sys_0(0x10002, 0x2, actionHash)
  -> sys_2(0, channel, callback)
```

人话：

```text
func_1043 写“动作 hash -> 脚本函数”的表。
func_44/52 每帧拿当前 action hash 去查表。
查到后，VM 调度 ACTION_*。
```

当前样本常用入口：

| 玩家目标 | action hash | 当前 callback | semanticId |
|---|---|---|---|
| 主射 | `0xf48d2d49` | `ACTION_A_SHOT` | `action.mainShot.setup` |
| 方向特射 / 援护 | `0x23df217e` | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | `action.specialShotAssist.setup` |
| 特格 | `0x193fe550` | `ACTION_BC_SPECIAL_MELEE` | `action.bcSpecialMelee.setup` |
| 特格 alt / 变形突进 | `0x6ab12717` | `ACTION_BC_SPECIAL_MELEE_ALT_2` | `action.bcSpecialMeleeAlt.transformRushSegment` |
| N 格 | `0x178d1109` | `ACTION_B_MELEE` | `action.bMelee.setup` |

## 7. 主射怎么追到可改点

最短链：

```text
func_1043
  -> func_241(0xf48d2d49, ACTION_A_SHOT)

ACTION_A_SHOT
  -> func_586()
  -> global677 = func_914
  -> global680 = func_915
  -> global681 = 0
  -> callFunc3(func_913)

func_913
  -> func_587()

func_914
  -> startup motion / ammo check / shell restore

func_915
  -> sys_0(0x90000, 0, 0)
  -> sys_4F(0, 0, 0xcc9f6df0)
  -> func_123(0x280)
```

可改点：

| 想改什么 | 优先看 | 说明 |
|---|---|---|
| 换弹种 | `func_915 -> sys_4F(0,0,weaponHash)` | Notion 经验：`sys_4F(0,slot,hash)` 是发射 / weapon request |
| 改 ammo slot | `ACTION_A_SHOT global681`、`sys_0(0x90000,slot,0)`、`sys_4F(0,slot,hash)` | 三处要一致 |
| 改发射帧 | `func_914/915` 里的时间线和 driver | 不要只改 ACTION setup |
| 改 BDC / cancel 感觉 | `func_123(0x280)`、`func_11` gate | 同时测 BD / OH |
| 改起手动作 | `func_914` 的 motion helper | 可能影响发射 callback 进入时机 |

审计点：

```text
主射不是 ACTION_A_SHOT 里直接发射。
真正发射点是 func_915 的 sys_4F(0,0,0xcc9f6df0)。
```

## 8. 援护 / 特射怎么追

最短链：

```text
func_1043
  -> func_241(0x23df217e, ACTION_AC_SPECIAL_SHOT_DIRECTIONAL)

ACTION_AC_SPECIAL_SHOT_DIRECTIONAL
  -> func_488()
  -> global609 = func_952
  -> global200 = (global87 & 0x3c) ? 1 : 0
  -> callFunc3(func_951)

func_951
  -> func_502()

func_952
  -> if global200:
       sys_51(... index 0, type 0x5)
       sys_51(... index 1, type 0x6)
     else:
       sys_51(... index 0, type 0x2)
       sys_51(... index 1, type 0x4)
  -> sys_4F(0x7, 0x2, 1)
```

Notion 对应经验：

| 调用 | 当前读法 |
|---|---|
| `sys_51(0x20000,0,0x2,index,type)` | 召唤援护，`index/type` 控制援护实例和类型 |
| `sys_4F(0x7,slot,1)` | 主动扣 ammo |
| `global200` | 是否按着方向键的分支标志 |
| `global172 & 0x4/0x8/0x10/0x20` | 前 / 后 / 左 / 右方向位 |

可改点：

| 想改什么 | 优先看 |
|---|---|
| N 特射和方向特射差异 | `global200` 分支 |
| 援护类型 | `sys_51` 最后一参 |
| 援护数量 / 实例 | `sys_51` 的 index |
| 扣弹 slot | `sys_4F(0x7,0x2,1)` |
| 出援护帧 | `func_952` 里的时间线条件 |

## 9. N 格和派生怎么追

最短链：

```text
func_1043
  -> func_241(0x178d1109, ACTION_B_MELEE)

ACTION_B_MELEE
  -> func_488()
  -> func_219(0xde3d1477)
  -> global602 = func_966
  -> callFunc3(func_965)

func_965
  -> func_489()

func_966
  -> func_308(... motion ...)
  -> func_531(func_967)
  -> global170 = 1
  -> func_887()
  -> func_123(0x200)

func_967
  -> func_308(... next motion ...)
  -> func_532(...)
  -> func_535(1, 0xa)
  -> func_536(0x1, 0xf, func_968)
  -> func_536(0x20, 0xf, func_980)
  -> func_536(0x4, 0xf, func_1007)
  -> func_123(0x200)
  -> func_125(0xc00000)
```

读法：

| 符号 | 工作语义 | 改动位置 |
|---|---|---|
| `func_488` | melee / special runtime reset | 一般不改单招 |
| `func_219(row)` | 读取动作参数 row | 改追踪 / 突进要看 |
| `func_489` | melee runtime driver | 共用 driver，谨慎改 |
| `func_532` | 接触 / 前进 / 派生辅助候选 | 改格斗贴近感可看 |
| `func_535` | 派生窗口范围 | 改开放区间 |
| `func_536(mask,time,callback)` | 派生输入登记 | 改第几帧、按什么、去哪里 |
| `func_239` | 派生输入消费器 | 共用，不优先改 |
| `func_123/125` | cancel route / route mask | 改取消路线 |

关键规则：

```text
改 N 格派生，先看 func_967 里的 func_536。
不要先改 func_239，因为它是共用 resolver。
```

## 10. BD、step、boost 和动作内移动怎么分层

这部分最容易混。

```text
普通 BD / step 基础系统
  -> engine / native / speed_param / boost gauge

BD cancel / OH gate
  -> func_11 + sys_0(0xc000*) + func_123/125

某一招自己的位移
  -> ACTION segment + sys_46 + func_532/535/536 + func_219(row)
```

按目标选入口：

| 想改什么 | 先看 | 不要先看 |
|---|---|---|
| 普通 BD 距离 / 速度 / 次数 | `docs/command_mapping.md` 的 `speed_param` / native resource | 某一招里的 `sys_46` |
| step 基础性能 | `speed_param.step_*` / native | `ACTION_BC_SPECIAL_MELEE` |
| 某动作能否 BD cancel | `func_123/125`、`func_11` gate、action 结束路径 | `sys_4B` shell |
| 特格横移距离 | `ACTION_BC_SPECIAL_MELEE -> func_940` | `func_11` 整体 |
| 格斗突进 / 追踪 | `func_219(row)`、`func_489`、`func_532` | `func_44/52` |
| OH 状态能否使用某动作 | `sys_0(0xc000*)`、`sys_0(0x90000)`、action availability | 单独 weapon hash |

`sys_46` 当前只给脚本侧工作模型：

| 形状 | 当前读法 |
|---|---|
| `func_44` 里的 `sys_46(0x1,...)` | action commit 清移动通道 |
| `func_298..302` 包装器 | 速度 / 倍率 / channel 包装 |
| `func_489/490` | melee runtime 移动 baseline |
| `func_502/503/504` | special movement runtime baseline |
| `func_937/940` | 具体动作段位移，适合改单招移动 |

## 11. 特格 / 特殊移动怎么追

当前样本两个重点：

```text
ACTION_BC_SPECIAL_MELEE_ALT_2
  -> func_488
  -> func_219(0x769a714e)
  -> global602 = func_936
  -> func_935 -> func_489

func_936
  -> func_888(0x7)
  -> func_308(...)
  -> func_531(func_937)

func_937
  -> sys_46(0x5, 0, 0x46, 0x64)
  -> func_532(...)
  -> func_535(...)
  -> func_536(0x1, 0, func_945)
  -> func_321(0x651e4f06)
```

```text
ACTION_BC_SPECIAL_MELEE
  -> func_488
  -> global609 = func_940
  -> func_939 -> func_502

func_940
  -> read global172 left / right bits
  -> compute lateral movement constants
  -> sys_46(0, global265)
  -> sys_46(0x1,...)
  -> sys_46(0x2,...)
```

可改点：

| 想改什么 | 优先看 |
|---|---|
| 变形突进种子 | `func_937 -> sys_46(0x5,...)` |
| 横移距离 | `func_940` 左右方向分支 |
| 左右输入判断 | `global172 & 0x10` / `global172 & 0x20` |
| 特格镜头 | `func_937 -> func_321(0x651e4f06)` |
| 特格外观 | `func_936 -> func_888(0x7)` 和恢复路径 |
| 特格 cancel | `func_123` / `func_536` / driver end path |

## 12. 镜头怎么追

镜头不是一个独立系统入口，通常藏在动作段里。

```text
func_321(cameraHash)
  -> sys_53(0x4, cameraHash, 0x4650)

sys_53(0x5)
  -> camera preset cleanup candidate
```

Notion 对应经验：

| 调用 | 当前读法 |
|---|---|
| `sys_53(0x4,hash,...)` | camera preset |
| `sys_53(0x5)` | 清 camera preset 候选 |
| `sys_53(0,...)` | 画面震动 |
| `sys_53(0x2,...)` | 镜头缩放候选 |

改镜头时必须填：

```text
启用点:
启用条件:
启用 hash:
自然结束清理:
被打断清理:
BD cancel 清理:
死亡 / 换锁 / 复归清理:
```

只找到 `sys_53(0x4)` 不够。

## 13. shell / 换装 / 组件怎么追

启动链：

```text
func_877
  -> sys_4B(0, 0xab9c3043)
  -> global20 = sys_4B(1)
  -> global170 = 0
  -> func_887()
  -> func_1042()
```

默认 loadout：

```text
func_887
  -> if global170 == 0: func_888(0)
  -> else: func_888(1)
```

分发：

```text
func_888(mode)
  -> 0..6: shell loadout helper
  -> 0x7: enter alternate shell mode
  -> 0x8: return base shell mode
```

Notion 对应经验：

| 调用 | 当前读法 |
|---|---|
| `sys_4B(0x2, model,bone,action,target)` | 模型接到模型 / bone |
| `sys_4B(0x3)` | 解除装备 / detach |
| `sys_47(0x10,...)` | rotate |
| `sys_47(0x11,...)` | translate |
| `sys_47(0x12,...)` | scale |

改 shell 必须找恢复路径：

```text
进入分支
动作中维护
动作自然结束
BD cancel / step cancel
被打断
死亡复归
回默认形态
```

## 14. 一个 `func_N` 到底在做什么

给任何函数做这个判断：

| 问题 | 如果答案是这样 | 函数层级 |
|---|---|---|
| 谁调用它 | `main/func_1/func_877` | init |
| 谁调用它 | `func_4` 每帧 | loop / gate |
| 谁调用它 | `func_1043` 大量注册 | registry |
| 谁调用它 | `func_44/52` 查表后调度 | dispatch target |
| 它写什么 | 大量 callback global | runtime setup |
| 它输出什么 | `sys_4F/sys_51/sys_46/sys_53` | segment output |
| 它是否共用 | 很多 ACTION 都调用 | shared runtime/helper |
| 它是否只在一招出现 | 一个 ACTION 的 callback 链 | action-local patch point |

命名时按角色：

```text
depiction.initializer
depiction.actionUpdateLoop
depiction.actionHashRegistry
action.mainShot.fireSegment
action.bcSpecialMelee.directionalMovementSegment
branch.callbackRegistrar
camera.presetWrapper
```

不要按当前编号：

```text
func_1_is_init_forever
func_940_is_side_move_forever
```

编号、offset、行号都会变。证据 shape 才能跨样本。

## 15. 实战最短路线

打开新机体 `2.c`，按这个顺序：

1. 跑 `tools/msc_c_static_analyzer.py` 生成 analysis JSON。
2. 找入口 shape：`main -> func_1 -> callFunc3(loop)`。
3. 找 action registry shape：大量 `func_241(hash, callback)`。
4. 找 shell initializer shape：`sys_4B(0,baseShell)`、`global20=sys_4B(1)`、`func_887`、`func_1042`。
5. 找目标 action hash 对应 `ACTION_*`。
6. 进入 `ACTION_*`，判断 runtime family。
7. 顺着 callback global 找 segment。
8. 在 segment 里找真正输出。
9. 找 cleanup / cancel / restore path。
10. 把结论写进 overlay，不只写 `func_N`。

## 16. 改动前审计表

每次准备改脚本前填这个表：

| 项 | 记录 |
|---|---|
| 玩家目标 | 例如：主射换弹种、特格横移更远、N 格派生提前 |
| action hash | 例如：`0xf48d2d49` |
| ACTION callback | 例如：`ACTION_A_SHOT` |
| action channel | primary / secondary |
| runtime family | ranged / melee / special movement |
| segment callback | 例如：`func_915` |
| motion hash | `func_308` / `func_79` 中的 hash |
| weapon / assist | `sys_4F` / `sys_51` |
| movement | `sys_46` / `func_532/535/536` |
| camera | `func_321` / `sys_53` |
| shell | `func_887/888` / `sys_4B/sys_47` |
| cancel | `func_123` / `func_125` |
| ammo slot | `global681` 或 action 自己写的 slot |
| cleanup | shell / camera / state 恢复路径 |
| 测试场景 | 地上、空中、OH、命中、空挥、被打断、BD cancel、step、死亡复归 |

如果这个表填不完，说明你还没追到真正可改点。

## 17. 资料来源

- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki システム：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki テクニック：`https://w.atwiki.jp/exvs2ob/pages/683.html`
- OverBoost wiki 初心者指南 / BR ズンダ：`https://w.atwiki.jp/exvs2ob/pages/560.html`
- OverBoost wiki 用语集：`https://w.atwiki.jp/exvs2ob/pages/82.html`
- [0xBDBE6FEA / 2.c semantic overlay 解析视图](./resolved/0xBDBE6FEA-2.resolved-labels.md)
- [动态命名与 JSON Overlay 方案](./dynamic-naming-overlay.md)
- [BD / 移动 / `sys_46` 模组开发工作簿](./movement-bd-modding-workbook.md)
- [`func_11` / `0xc000*` boost gate 状态槽地图](./func11-c000-boost-gate-map.md)
