# MSC 模组开发 worked traces：从目标到 patch 点

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

这页是实战跟读手册。每个 trace 都按同一套格式写：

```text
玩家目标 -> 证据链 -> 当前函数 / 行号 -> 可改点 -> 不要先动 -> 必测场景
```

这里的行号只适用于当前样本。跨样本时优先用 semanticId、action hash、syscall shape、callback global 和常量集合重新定位。

如果还没有建立总流程，先读 [MSC 模组开发操作手册：从 29664 行 `2.c` 读到可改点](./msc-modder-operating-manual.md)。本页只负责把具体目标展开成 worked trace。

## Trace 0：证明 `func_1` 是 init，不是某个武装

目标：

```text
我怎么知道 func_1 在做初始化？
```

证据链：

```text
main 2.c:779-788
  -> sys_2(0, 0x8, func_3)
  -> sys_2(0, 0x6, func_26)
  -> sys_2(0, 0x7, func_27)
  -> func_1()
  -> callFunc3(func_4)

func_1 2.c:789-842
  -> clears global1..19
  -> func_386()
  -> func_272()
  -> sys_1(0x10002, 0x2, hash, callback)
  -> func_877()
```

人话解释：

```text
main 先注册 VM callback。
然后只执行一次 func_1。
最后把 func_4 安装成持续 update loop。
所以 func_1 处在主循环之前，是脚本初始化层。
```

`func_1` 初始化的系统：

| 系统 | 证据 | 读法 |
|---|---|---|
| 顶层 callback / action state | 写 `global1..19` | 清空 frame loop 使用的顶层状态 |
| 基础 action 表 | `sys_1(0x10002,0x2,hash,callback)` | 写 action hash 到 callback 的基础映射 |
| runtime global family | `func_386()` | 清动作、移动、射击、格斗、shell 相关 runtime |
| 辅助状态 | `func_272()` | 初始化另一组 helper / resource 状态 |
| 本机体 depiction | `func_877()` | 进入 shell、weapon slot、action registry |

适合命名：

```text
depiction.initializer
```

不要命名成：

```text
main shot init
melee init
shell only init
BD init
```

它们都是下游子系统。

## Trace 1：找主射弹种

玩家目标：

```text
我要改主射发出来的东西。
```

证据链：

```text
func_1043 2.c:29413-29471
  -> func_241(0xf48d2d49, ACTION_A_SHOT)

func_241 2.c:6225-6242
  -> sys_1(0x10002, 0x2, actionHash, callback)

func_44 / func_52
  -> sys_0(0x10002, 0x2, activeActionHash)
  -> sys_2(... callback)

ACTION_A_SHOT 2.c:25765-25784
  -> func_586()
  -> global677 = func_914
  -> global680 = func_915
  -> global681 = 0

func_914 2.c:25790-25834
  -> startup / shell restore / ammo check

func_915 2.c:25835-25849
  -> sys_0(0x90000, 0, 0)
  -> sys_4F(0, 0, 0xcc9f6df0)
```

当前可改点：

| 目标 | 改哪里 | 注意 |
|---|---|---|
| 换主射 projectile / weapon | `func_915` 的 `sys_4F(0,0,0xcc9f6df0)` 第三参 | hash 必须是有效 weapon resource |
| 改主射 ammo slot | `ACTION_A_SHOT global681=0`、`func_915 sys_0(0x90000,0,0)`、`sys_4F(0,0,hash)` | 三处 slot 要一致 |
| 改发射前动作 | `func_914` | 它是起手，不是真正发弹 |
| 改 cancel 感觉 | `func_915` 附近的 `func_123(...)` 与 `func_11` gate | 需要实机测 BDC / OH |

不要先动：

| 不建议先动 | 原因 |
|---|---|
| `func_586` | ranged runtime reset，共用面大 |
| `func_587` | ranged driver，影响 phase 顺序 |
| `func_44/52` | action dispatch 枢纽，不是主射参数 |

必测：

- 有弹主射。
- 空弹主射。
- `BR >> BR >> BR` 类 BD cancel 连射。
- 地上 / 空中。
- overheat 时能否异常发射。
- 换 hash 后 hitbox / damage 是否来自正确资源。

## Trace 2：改 BR ズンダ / BDC 相关手感

玩家目标：

```text
我想理解射击后 BD cancel、BR ズンダ在脚本里看哪里。
```

先分层：

```text
BD 输入识别 / boost gauge 扣减
  -> engine / native / speed_param

当前动作是否开放 cancel
  -> ACTION segment 的 func_123 / func_125
  -> func_11 boost/cancel gate

射击实际输出
  -> func_915 sys_4F(0,slot,hash)
```

当前样本要看：

| 层 | 当前位置 | 用途 |
|---|---|---|
| 主射发射 | `func_915` | `sys_4F(0,0,0xcc9f6df0)` |
| 主射 cancel mask | `func_914/915` | 看 `func_123(...)` 开哪些路线 |
| 全局 gate | `func_11 2.c:1325-1517` | 读 `0xc000*`，维护 `global23/43/45/54` |
| 普通 BD 基础参数 | `docs/command_mapping.md speed_param` | `boost_dash_*`、`boost_gauge_capacity`、`boost_dash_count` |

`func_11` 的证据：

```text
func_11
  -> reads sys_0(0xc0001 / 0xc0003 / 0xc0005 / 0xc000c)
  -> writes global23 / global43 / global45 / global54
  -> emits sys_52 / sys_4C / sys_4F / sys_55 / sys_56
```

人话：

```text
func_11 像全局交通灯。
它决定某些 boost / cancel / restricted state 是否开门。
但普通 BD 距离、BD 次数、step 距离不应该先从 func_11 改。
```

普通机动力优先看 resource：

| 目标 | `speed_param` 字段方向 |
|---|---|
| BD 更快 | `boost_dash_initial_speed`、`boost_dash_sustained_speed`、`boost_dash_max_speed` |
| BD 更远 | `boost_dash_distance`、`boost_dash_distance_max`、`boost_dash_duration_frame` |
| BD 次数更多 | `boost_dash_count`、`boost_gauge_capacity` |
| step 更远 | `step_distance`、`fixed_step_distance` |
| step 更快 | `step_speed`、`step_recovery_frame` |

必测：

- `BR >> BR >> BR`。
- 射击后立即 BD。
- 空弹后 BD。
- overheat 下射击后是否能异常移动。
- step cancel 与 BD cancel 的手感是否被混改。

## Trace 3：改方向特射 / 援护类型

玩家目标：

```text
我要改方向特射的援护种类或出场方式。
```

证据链：

```text
func_1043
  -> func_241(0x23df217e, ACTION_AC_SPECIAL_SHOT_DIRECTIONAL)

ACTION_AC_SPECIAL_SHOT_DIRECTIONAL 2.c:26957-26978
  -> func_488()
  -> global609 = func_952
  -> global200 = 1 if global87 & 0x3c else 0
  -> callFunc3(func_951)

func_951
  -> func_502()

func_952 2.c:26984-27022
  -> if global200:
       sys_51(0x20000,0,0x2,0,0x5)
       sys_51(0x20000,0,0x2,1,0x6)
     else:
       sys_51(0x20000,0,0x2,0,0x2)
       sys_51(0x20000,0,0x2,1,0x4)
  -> sys_4F(0x7, 0x2, 1)
```

Notion 经验：

| 符号 | 读法 |
|---|---|
| `global200` | 是否按着方向键的分支标志 |
| `global172 & 0x4` | 前 |
| `global172 & 0x8` | 后 |
| `global172 & 0x10` | 左 |
| `global172 & 0x20` | 右 |
| `sys_51(... index,type)` | 召唤援护，index / type 控制实例和类型 |
| `sys_4F(0x7,slot,1)` | 主动扣弹 |

当前可改点：

| 目标 | 改哪里 |
|---|---|
| 改 N 特射援护 | `global200 == 0` 分支的 `sys_51` type |
| 改方向特射援护 | `global200 == 1` 分支的 `sys_51` type |
| 改援护数量 | 增减 `sys_51` 调用，需要谨慎验证实例槽 |
| 改扣弹槽 | `sys_4F(0x7,0x2,1)` |
| 改出援护时间 | `func_952` 的时间线条件 |

不要先动：

| 不建议先动 | 原因 |
|---|---|
| `func_488` | melee / special runtime reset，共用 |
| `func_502` | special movement driver，共用 |
| `func_239` | branch resolver，不属于援护召唤点 |

必测：

- N 特射。
- 前 / 后 / 左 / 右方向特射。
- ammo slot 2 扣弹。
- 援护重复召唤。
- 切锁后援护目标是否异常。

## Trace 4：改 N 格派生时间

玩家目标：

```text
我要改 N 格二段、派生、取消窗口。
```

证据链：

```text
func_1043
  -> func_241(0x178d1109, ACTION_B_MELEE)

ACTION_B_MELEE 2.c:27343-27350
  -> func_488()
  -> func_219(0xde3d1477)
  -> global602 = func_966
  -> callFunc3(func_965)

func_965
  -> func_489()

func_966 2.c:27356-27375
  -> func_308(... first motion ...)
  -> func_531(func_967)
  -> global170 = 1
  -> func_887()
  -> func_123(0x200)

func_967 2.c:27376-27423
  -> func_308(... next motion ...)
  -> func_532(...)
  -> func_535(1, 0xa)
  -> func_536(0x1, 0xf, func_968)
  -> func_536(0x20, 0xf, func_980)
  -> func_536(0x4, 0xf, func_1007)
  -> func_123(0x200)
  -> func_125(0xc00000)
```

怎么读 `func_536`：

```text
func_536(mask, time, callback)
```

当前工作语义：

| 参数 | 人话 |
|---|---|
| `mask` | 接受哪类输入 / 派生条件 |
| `time` | 第几帧或哪个时间点开放 |
| `callback` | 派生后跳到哪个段 |

可改点：

| 目标 | 改哪里 |
|---|---|
| 派生更早 / 更晚 | `func_536(..., time, ...)` |
| 派生到不同段 | `func_536(..., callback)` |
| 开放窗口范围 | `func_535(start,end)` |
| N 格动作 motion | `func_966/967` 的 `func_308` hash |
| 取消路线 | `func_123(0x200)`、`func_125(0xc00000)` |

不要先动：

| 不建议先动 | 原因 |
|---|---|
| `func_489` | melee runtime driver，共用 |
| `func_239` | 消费所有 branch window 的共用 resolver |
| `func_488` | runtime reset |

必测：

- N 格一段、二段、三段。
- 命中 / 空挥。
- 前后左右方向输入。
- step cancel。
- BD cancel。
- overheat 下派生是否异常。
- shell 是否从 `global170=1` 恢复。

## Trace 5：改特格横移距离

玩家目标：

```text
我要改特格左 / 右横移距离或方向差异。
```

证据链：

```text
func_1043
  -> func_241(0x193fe550, ACTION_BC_SPECIAL_MELEE)

ACTION_BC_SPECIAL_MELEE 2.c:26586-26601
  -> func_488()
  -> global609 = func_940
  -> global452 = 0x61
  -> global453 = 0x5f
  -> global454 = 0x5f
  -> callFunc3(func_939)

func_939
  -> func_502()

func_940 2.c:26607-26727
  -> reads global172 & 0x10 / 0x20
  -> computes lateral constants
  -> global265 = ...
  -> sys_46(0, global265)
  -> sys_46(0x1, 0x4, 0, 0, 0)
  -> sys_46(0x2, 0x3, 0, var0, 0xc8)
```

当前可改点：

| 目标 | 改哪里 |
|---|---|
| 左右偏移距离 | `func_940` 的左右方向分支和 `global265` 计算 |
| 横移持续 / 插值 | `sys_46(0x2,0x3,0,var0,0xc8)` 的尾参候选 |
| 横移 reset | `sys_46(0x1,0x4,0,0,0)` |
| 动作 motion | `func_940` 内的 `func_308` |
| 特格取消 / 派生 | `func_81`、`func_123`、driver 收尾 |

不要先动：

| 不建议先动 | 原因 |
|---|---|
| `func_11` | 全局 gate，影响所有动作 |
| `func_44` 里的 `sys_46(0x1,...)` | action commit 清场，不是特格横移参数 |
| `func_502` | special movement driver，共用 |

必测：

- 左输入特格。
- 右输入特格。
- 无方向特格。
- 地上 / 空中。
- overheat。
- 撞墙 / 目标丢失。
- BD cancel 后位置是否异常。

## Trace 6：改变形突进 / 特格 alt

玩家目标：

```text
我要改变形突进距离、镜头或 shell。
```

证据链：

```text
func_1043
  -> func_241(0x6ab12717, ACTION_BC_SPECIAL_MELEE_ALT_2)

ACTION_BC_SPECIAL_MELEE_ALT_2 2.c:26424-26436
  -> func_488()
  -> func_219(0x769a714e)
  -> global602 = func_936
  -> callFunc3(func_935)

func_935
  -> func_489()

func_936
  -> func_888(0x7)
  -> func_308(...)
  -> func_531(func_937)

func_937 2.c:26520-26585
  -> sys_46(0x5, 0, 0x46, 0x64)
  -> func_532(...)
  -> func_535(...)
  -> func_536(0x1, 0, func_945)
  -> func_321(0x651e4f06)
```

可改点：

| 目标 | 改哪里 |
|---|---|
| 突进种子 / 初值 | `sys_46(0x5,0,0x46,0x64)` |
| 追踪 / 接近参数 | `func_219(0x769a714e)`、`func_532` |
| 派生窗口 | `func_535` / `func_536` |
| 镜头 preset | `func_321(0x651e4f06)` |
| 变形 shell | `func_936 -> func_888(0x7)` 与恢复路径 |

不要先动：

| 不建议先动 | 原因 |
|---|---|
| `func_888` 全局分发结构 | 会影响所有 shell mode |
| `func_489` | melee runtime driver |
| `sys_46` native 名字 | 当前还没有 native handler 完整证据 |

必测：

- N 特格 alt。
- 命中 / 空挥。
- 派生输入。
- 镜头是否清理。
- shell 是否恢复。
- overheat 与 BD cancel。

## Trace 7：改镜头 preset

玩家目标：

```text
我要改某个动作的镜头。
```

证据链：

```text
func_321 2.c:7370-7374
  -> sys_53(0x4, arg0, 0x4650)

动作段调用例：
  func_937 -> func_321(0x651e4f06)
```

Notion 经验：

| 调用 | 当前读法 |
|---|---|
| `sys_53(0x4,hash,...)` | camera preset |
| `sys_53(0x5)` | camera cleanup candidate |
| `sys_53(0,...)` | screen shake |
| `sys_53(0x2,...)` | camera zoom candidate |

可改点：

| 目标 | 改哪里 |
|---|---|
| 换 preset | 调用点的 `func_321(hash)` |
| 改 preset 参数 | `func_321` wrapper 或直接 `sys_53(0x4,...)` 调用点 |
| 加震动 | `sys_53(0,...)` 模式，但要先找同类例子 |
| 清理镜头 | 对应动作结束 / cancel / hit / whiff path 的 `sys_53(0x5)` |

不要只做：

```text
只把 hash 改了，然后只测命中。
```

必测：

- 命中。
- 空挥。
- 被打断。
- BD cancel。
- step cancel。
- 死亡 / 复归。
- 下一个动作镜头是否残留。

## Trace 8：改 shell / 换装组件

玩家目标：

```text
我要改组件挂接、默认 loadout、变形外观。
```

证据链：

```text
func_877 2.c:25407-25430
  -> sys_4B(0, 0xab9c3043)
  -> global20 = sys_4B(1)
  -> global170 = 0
  -> func_887()
  -> func_1042()

func_887 2.c:25522-25533
  -> if global170 == 0: func_888(0)
  -> else: func_888(1)

func_888 2.c:25534-25573
  -> mode 0..6: loadout helpers
  -> mode 0x7: func_1037 enter alternate shell
  -> mode 0x8: func_1038 return base shell
```

Notion 经验：

| 调用 | 当前读法 |
|---|---|
| `sys_4B(0x2,model,bone,action,target)` | 模型挂到模型 / bone |
| `sys_4B(0x3)` | 解除装备 / detach |
| `sys_47(0x10,...)` | rotate |
| `sys_47(0x11,...)` | translate |
| `sys_47(0x12,...)` | scale |

可改点：

| 目标 | 改哪里 |
|---|---|
| 默认外观 | `func_877 -> global170=0 -> func_887()` |
| 某动作临时外观 | 该 ACTION segment 内的 `global170` / `func_887` / `func_888` |
| 变形进入 | `func_888(0x7)` 相关路径 |
| 变形恢复 | `func_888(0x8)` 或 `func_887()` 恢复路径 |
| 挂接组件 | loadout helper 内 `sys_4B(0x2,...)` |
| 缩放 / 平移 / 旋转组件 | `sys_47(0x10/0x11/0x12,...)` |

不要先动：

| 不建议先动 | 原因 |
|---|---|
| `func_877` 里的 base shell hash | 会影响初始化全局状态 |
| `global20` | active shell entry id，很多 motion / `sys_47` 使用 |
| 单独增加 attach 不写 detach | 容易残留组件 |

必测：

- 出击默认外观。
- 主射后恢复。
- 格斗后恢复。
- 特格 / 变形进入和退出。
- 被打断。
- 死亡复归。
- 换锁 / 觉醒技后外观是否残留。

## Trace 9：一个函数是不是可改点

判断表：

| 形状 | 它大概率是 | 是否适合直接改单招 |
|---|---|---|
| `main -> func_1 -> callFunc3(func_4)` | bootstrap / init / loop | 否 |
| 大量 `sys_1(0x10002,...)` | registry | 否，除非改 action 映射 |
| `sys_0(0x10002,...)` 后 `sys_2` | dispatch | 否 |
| 写 `global677/680/681` | ranged setup | 只适合找 segment |
| 写 `global602/609/610` | melee / special setup | 只适合找 segment |
| 有 `func_309` 时间点和 `sys_4F/sys_51/sys_46/sys_53` | segment output | 是，通常是具体 patch 点 |
| 读 `global170/global143`，调用 `sys_4B/sys_47` | shell/model | 是，但必须找恢复 |
| 被很多 ACTION 共用 | shared runtime/helper | 谨慎 |
| 只在一个 ACTION 链出现 | action-local segment | 优先 |

写研究记录时，用这种格式：

```json
{
  "goal": "change main shot projectile",
  "semantic_id": "action.mainShot.fireSegment",
  "current_symbol": "func_915",
  "action_hash": "0xf48d2d49",
  "evidence": [
    "ACTION_A_SHOT writes global680 = func_915",
    "func_915 checks sys_0(0x90000,0,0)",
    "func_915 emits sys_4F(0,0,0xcc9f6df0)"
  ],
  "patch_points": [
    "sys_4F weapon hash",
    "ammo slot consistency",
    "cancel mask"
  ],
  "tests": [
    "normal shot",
    "empty ammo",
    "BD cancel",
    "overheat"
  ]
}
```

这比“`func_915 = 主射`”更稳。

## 当前边界

这些还不能在当前 `2.c` 单文件内最终证明：

| 缺口 | 下一步 |
|---|---|
| raw input 到 action hash | 纳入 `0.c` / `1.c` 或 native input selector |
| `sys_46` 每个 case 的最终名 | 拆 native syscall handler |
| `sys_0(0xc000*)` 来源 | 拆 native state table / engine 状态 |
| damage / down / proration | 接 `arms_param`、`bullet_param`、hitgroup 和 native |
| 跨机体稳定性 | 用第二个 `2.c` 直接验证 action hash、callback shape 和 syscall 输出 |

## 来源

- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki システム：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki テクニック：`https://w.atwiki.jp/exvs2ob/pages/683.html`
- OverBoost wiki 用语集：`https://w.atwiki.jp/exvs2ob/pages/82.html`
- 跨样本工作名原则：`func_N` 只当当前样本坐标，最终回到 `.c` evidence shape。
- [MSC 逆向模组开发总览：从玩家动作追到 `2.c` 可改点](./modder-human-flow-overview.md)
- [BD / 移动 / `sys_46` 模组开发工作簿](./movement-bd-modding-workbook.md)
- [`func_11` / `0xc000*` boost gate 状态槽地图](./func11-c000-boost-gate-map.md)
