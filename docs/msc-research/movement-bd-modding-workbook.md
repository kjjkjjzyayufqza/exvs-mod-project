# BD / 移动 / `sys_46` 模组开发工作簿

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

这页面向实际改机体移动的人。目标不是给 `sys_46` 每个 native case 定最终名，而是回答：

```text
我要改普通 BD、step、特格横移、格斗追踪、派生窗口、取消路线时，先看哪里？
哪些参数可以先小改？
哪些函数是全局门，不能当成单个动作参数乱改？
改完应该测什么？
```

## 0. 先把移动拆成三层

不要把“角色会移动”都归到一个函数。当前证据支持三层：

| 层 | 代表资料 / 函数 | 负责什么 | 适合改什么 |
|---|---|---|---|
| 资源基础层 | `docs/command_mapping.md` 的 `speed_param` | 普通走路、BD、step、落地、boost gauge 基础参数 | 普通 BD / step 基础手感 |
| 全局 gate 层 | `func_11`、`0xc000*`、`global23/43/45/46/54` | 本帧能否进入 / 维持 / 退出 boost-cancel gate | 全局 cancel / overheat / gate 规则 |
| 动作局部层 | `ACTION_* -> func_489/502 -> segment -> sys_46 / func_532/535/536` | 某个格斗、特格、特殊移动自己的位移、追踪、派生窗口 | 某招冲多远、横移多远、何时派生 |

人话：

```text
普通 BD 强不强，先看 speed_param。
某个特格冲不冲，先看这个 ACTION 的 segment。
某招能不能被 BD / step / route 取消，再看 func_123/125 和 func_11。
```

## 1. 玩家语义到脚本层

OverBoost wiki 的玩家语义可以作为命名参照：

- BD 是跳键二连，能取消大多数射击 / 格斗，并消耗 boost。
- step 是同方向输入二连，用来切诱导和枪口修正。
- boost gauge 被 BD、step、武装等消耗；空了会进入 overheat，落地硬直更大。
- BR ズンダ是射击后 BD cancel，再重复射击的基础连携。

脚本里不是这样直接写的。当前 `2.c` 更像：

```text
raw input / boost gauge / step / BD
  -> engine / upstream selector
  -> sys_0(0x10000,...) and sys_0(0xc000*) exposed to 2.c
  -> func_21/24/25 read action / direction / route state
  -> func_11 update global boost-cancel gate
  -> func_44/52 commit action hash
  -> ACTION_* runtime controls local motion
```

所以在 `2.c` 里读移动时，先问：

```text
这是基础机动力？
这是 gate 状态？
这是某个动作段自己的移动？
```

这三个答案会走到完全不同的改动点。

## 2. 普通 BD / step：先看 `speed_param`

来源：[command_mapping.md](../command_mapping.md) 的 `speed_param (041cpm, cmd=74, entry_size=304)`。

普通 BD、step、跳、落地这类基础机动参数，不应该从单条 `sys_46` 开始改。先查资源表字段。

最常用字段：

| 目标 | 字段 | Hash | 当前范围记录 |
|---|---|---|---|
| boost 上限 | `boost_gauge_capacity` | `0x0B9EBECE` | `[0,500]` |
| BD 初速 | `boost_dash_initial_speed` | `0x11FFDDB4` | `[60,220]` |
| BD 持续速度 | `boost_dash_sustained_speed` | `0x2EAE942B` | `[220,312]` |
| BD 起始帧 | `boost_dash_startup_frame` | `0x4031CB84` | OB-only |
| BD 恢复帧 | `boost_dash_recovery_frame` | `0x41DABEC5` | OB-only |
| BD 距离 | `boost_dash_distance` | `0x5481CCF4` | `[140,330]` |
| BD 持续帧 | `boost_dash_duration_frame` | `0xA49287B9` | `[240,588]` |
| BD 次数上限 | `boost_dash_count` | `0xE590DFE2` | `[0,8]` |
| BD 最大距离 | `boost_dash_distance_max` | `0xFEC6069F` | `[40,145]` |
| step 距离 | `step_distance` | `0x17A9D82D` | `[4,31]` |
| step 起手 | `step_startup_frame` | `0x2DF7AF95` | `[20,25]` |
| step 速度 | `step_speed` | `0x4D601E55` | `[25,35]` |
| step 恢复 | `step_recovery_frame` | `0x4F705BAD` | `[20,30]` |
| step cancel 窗口 | `step_cancel_frame` | `0x97BE8DFC` | `[10,12]` |
| dash cancel 类型 | `dash_cancel_type` | `0x32FD1EDC` | `[1,10]` |
| 落地硬直 | `landing_recovery_frame` | `0x459455EA` | `[0,300]` |

实战规则：

```text
改普通 BD / step 基础性能 -> speed_param
改某个动作自己的突进 -> ACTION segment
改某个动作能不能取消 -> func_123/125 + func_11
```

不要把普通 BD 距离改到特格动作段里；那只会改变某一招或某一段，不会改变全机体基础 BD。

## 3. `func_11`：boost-cancel gate，只在需要全局规则时碰

当前锚点：`2.c:1325-1516`。

`func_11` 在 `func_4` 每帧主循环中，位于 action commit 之前：

```text
func_4
  -> func_21/24/25      读方向和 action candidate
  -> func_11            更新 boost / cancel gate
  -> func_51/52         secondary action commit
  -> func_44            primary action commit
```

它的状态机可以压成三段：

| 阶段 | 关键证据 | 人话 |
|---|---|---|
| 进入 | `global23 == 0`，`global11 & 1`，`global46`，`sys_0(0xc0005)` | 本帧是否进入 boost-cancel gate |
| 维持 | `global23 == 1/2`，`sys_0(0xc0001)`，`global50/51/52/53` | gate 是否还能持续 |
| 退出 | 清 `global23`，置 `global45=1`，`sys_4F(0x14,0)` | gate 结束，恢复 movement / weapon 状态 |

重要变量：

| 符号 | 工作名 | 说明 |
|---|---|---|
| `global23` | gate active state | `0/1/2` 状态机 |
| `global43` | gate enter edge | 进入时置 `1` |
| `global45` | gate exit edge | 退出时置 `1` |
| `global46` | forced re-entry latch | `0xc0008` 等状态结束后会置入 |
| `global54` | movement bonus edge | 由 `0xc000c` 控制，影响 `0xc000b` movement modifier |

`0xc000*` 槽位的当前脚本侧工作名：

| 槽 | 次数 | 工作名 |
|---|---:|---|
| `0xc0001` | 1 | gate continuation permission |
| `0xc0003` | 2 | gate mode selector |
| `0xc0005` | 1 | restricted-state gate permission |
| `0xc0006` | 2 | gate intensity scalar |
| `0xc0007` | 2 | gate phase enum |
| `0xc0008` | 6 | gate continuation / re-entry latch source |
| `0xc0009` | 4 | target validity under gate |
| `0xc000b` | 7 | movement correction active |
| `0xc000c` | 2 | movement bonus edge source |

何时才改 `func_11`：

| 目标 | 是否适合 |
|---|---|
| 全机体 BD cancel gate 规则 | 可以研究 |
| 特殊状态结束后是否恢复 gate | 可以研究 `0xc0008 -> global46` |
| 单个特格横移距离 | 不适合，去 `ACTION_BC_SPECIAL_MELEE -> func_940` |
| 单个格斗派生窗口 | 不适合，去 `func_536` / `func_239` |
| 普通 BD 基础速度 | 不适合，去 `speed_param` |

`func_11` 影响所有动作，任何改动都要按全局行为验证。

## 4. `sys_46`：动作局部 movement bus

当前样本 `sys_46` 出现 391 次，第一个参数分布：

| subcmd | 次数 | 脚本侧工作名 |
|---|---:|---|
| `0x1` | 177 | movement channel write / reset |
| `0` | 59 | steering / facing / lateral delta apply |
| `0x4` | 46 | movement baseline scale |
| `0x2` | 35 | interpolation / transition |
| `0xf` | 29 | advanced movement parameter |
| `0x5` | 14 | direct dash / rush seed |
| `0x3` | 5 | movement speed scale wrapper |
| `0xe` | 4 | damping / time constant candidate |

常见上下文：

| 位置 | 例子 | 读法 |
|---|---|---|
| action commit 清场 | `func_44 -> sys_46(0x1,channel,0,0,0)` | 清 movement 通道，不是动作参数 |
| runtime 初始化 | `func_490/503 -> sys_46(0x4,0x4,value)` | 建立动作移动基准 |
| wrapper | `func_298..302 -> sys_46(0x3,...)` | 速度倍率 |
| 特格横移 | `func_940 -> sys_46(0,global265)` | 横向 / 朝向 delta |
| 突进 seed | `func_937 -> sys_46(0x5,...)` | 起步突进参数 |

最重要的阅读规则：

```text
不要先问 sys_46 子命令叫什么。
先问这条 sys_46 在清场、runtime 初始化，还是某个动作段。
```

## 5. Wrapper：`func_296` 和 `func_298..302`

当前锚点：`2.c:7158-7248`。

`func_296` 是 movement state flag 包装：

| 调用 | 输出 | 工作名 |
|---|---|---|
| `func_296(0x3e8,value)` | `sys_1(0x30001,value)` | generic movement state flag |
| `func_296(0x3e9,value)` | `sys_46(0x6,value)` | movement state flag 6 |
| `func_296(0x3eb,value)` | `sys_46(0x7,value)` | movement state flag 7 |
| `func_296(0x3ea,value)` | `sys_1(0xf0000,0,value)` | route / runtime flag |

`func_298..302` 是速度倍率包装：

| 函数 | 输出 | 工作名 |
|---|---|---|
| `func_298(v)` | `sys_46(0x3,0x1,v,v,v)` | scale channel 1 |
| `func_299(v)` | `sys_46(0x3,0x2,v,v,v)` | scale channel 2 |
| `func_300(v)` | `sys_46(0x3,0x4,v,v,v)` | scale channel 4 |
| `func_301(v)` | `sys_46(0x3,0x4,v,0x64,v)` | scale channel 4 X/Z |
| `func_302(v)` | `sys_46(0x3,0x4,0x64,v,0x64)` | scale channel 4 Y |

实战含义：

- 看到 `func_300((0x64 - x) * ... + x)`，通常是在按帧衰减 / 插值 movement scale。
- 这类参数可以小幅改，但要测动作结束是否恢复到默认 scale。
- `func_296(0x3e8/0x3e9/0x3eb,...)` 风险更高，因为它像状态开关，不只是数值倍率。

## 6. 格斗追踪：`ACTION_B_MELEE -> func_489`

当前锚点：

- `ACTION_B_MELEE`: `2.c:27343`
- `func_489`: `2.c:12485`
- `func_490..492`: `2.c:12511-12766`
- `func_967`: `2.c:27376`

链路：

```text
ACTION_B_MELEE
  -> func_488()
  -> func_219(0xde3d1477)
  -> global602 = func_966
  -> func_489()

func_489
  -> func_490 初始化 movement baseline
  -> func_491 早期追踪 / 倍率衰减
  -> func_492 后期追踪 / 接触 / 结束判断

func_967
  -> func_532(0x2,0xd,0x58)
  -> func_535(0x1,0xa)
  -> func_536(mask,time,callback)
```

参数来源：

| 参数 / global | 来源 | 人话 |
|---|---|---|
| `func_219(0xde3d1477)` | 动作参数 row | N 格基础追踪 / 突进参数 |
| `global606` | row / runtime | `sys_46(0x4,0x4,global606)` movement baseline |
| `global507` | row + gate 修正 | forward / chase speed candidate |
| `global508` | row + gate 修正 | acceleration / additive speed candidate |
| `global175/188/189` | runtime timer | 阶段持续时间 |
| `func_532/535/536` | segment | 接近、派生窗口、callback |

改法建议：

| 目标 | 先改 |
|---|---|
| N 格更容易追上 | 先比较 / 小调 `func_219` row 对应资源或 `func_532/535` |
| N 格派生更早 | `func_536(mask,time,callback)` 的 `time` |
| N 格动作更快 | motion / timeline 相关函数，不要只改追踪 |
| N 格可取消性 | `func_123(0x200)`、`func_125(0xc00000)`，再看 `func_11` |

不要第一步改 `func_489` 通用阶段，因为它被多个 melee / special 动作复用。

## 7. 特殊移动：`ACTION_BC_SPECIAL_MELEE -> func_502`

当前锚点：

- `ACTION_BC_SPECIAL_MELEE`: `2.c:26586`
- `func_502`: `2.c:13212`
- `func_503/504/505/506`: `2.c:13233-13469`
- `func_940`: `2.c:26607`

链路：

```text
ACTION_BC_SPECIAL_MELEE
  -> func_488()
  -> global609 = func_940
  -> global390 = -1
  -> global613 = 0xa
  -> global452/453/454 = 0x61/0x5f/0x5f
  -> func_502()

func_502
  -> func_503 初始化
  -> func_504 主移动段
  -> func_505 派生 / transition
  -> func_506 收尾
```

`func_503` 建立 movement baseline：

```text
sys_46(0x4,0x4,global452)
sys_46(0xe,0x4,0x190)
func_296(0x3e8,1) 或 func_302(0)
global191 = global454 或 global453
```

`func_504` 主移动段：

```text
func_300((0x64 - global191) * ... + global191)
global265 = sys_0(0x40000,0x5)
global499 = func_521(0x1) - global268
sys_46(0, func_102(global265, global175, 0))
func_105(func_102(global499, global175, 0), 0, 0)
```

读法：

- `global452/453/454` 是 action setup 写入的动作局部移动参数。
- `func_502` 不等于某一招；它是 special movement runtime。
- `func_940` 才是这个特格动作自己的横移 segment。

## 8. 案例：方向特格横移 `func_940`

当前锚点：`2.c:26607-26726`。

`func_940` 的关键点：

```text
if (global172 & 0x20) right branch
else if (global172 & 0x10) left branch

target exists:
  var1 = 0xffffffd8 or 0x28
  global265 = func_102(targetAngle + var1 * 0x64, global204, 0)
  sys_46(0, global265)

no target:
  var1 = 0xfffffff6 or 0xa
  global265 = var1 * 0x64
  sys_46(0, global265)

after first phase:
  sys_46(0x1,0x4,0,0,0)
  sys_46(0x2,0x3,0,var0,0xc8)
  sys_46(0x1,0x1,0,var0,0x12c)
```

Notion 方向位对照：

| 位 | 方向候选 |
|---|---|
| `0x4` | 前 |
| `0x8` | 后 |
| `0x10` | 左 |
| `0x20` | 右 |

想改横移距离：

1. 先改 `0x28 / 0xffffffd8` 和无目标分支 `0xa / 0xfffffff6`。
2. 再看 `global204`，它每次减 `0x64`，像第一阶段持续。
3. 最后才碰后半段 `sys_46(0x2/0x1,...)`，因为那更像回正 / 插值。

必测：

| 场景 | 为什么 |
|---|---|
| 有目标左 / 右 | 两个方向常数 |
| 无目标左 / 右 | fallback 分支 |
| 地上 / 空中 | gate 和 motion 不同 |
| overheat | 可能被 `func_11` 限制 |
| 命中 / 空挥 / 被打断 | 检查移动残留和收尾 |

## 9. 案例：变形突进 `func_937`

当前锚点：

- `ACTION_BC_SPECIAL_MELEE_ALT_2`: `2.c:26424`
- `func_936`: `2.c:26442`
- `func_937`: `2.c:26520`

链路：

```text
ACTION_BC_SPECIAL_MELEE_ALT_2
  -> func_488()
  -> func_219(0x769a714e)
  -> global602 = func_936
  -> func_489()

func_936
  -> func_888(0x7)
  -> func_308(... motion ...)
  -> func_531(func_937)
  -> func_296(0x3e8,1)

func_937
  -> func_296(0x3e9,0)
  -> sys_46(0x5,0,0x46,0x64)
  -> func_532(0x1f,0x20,0x64)
  -> func_535(0,0x3e7)
  -> func_536(0x1,0,func_945)
  -> func_123(0x200)
```

读法：

- `func_888(0x7)` 是 shell / 变形外观。
- `sys_46(0x5,...)` 是突进 seed 候选。
- `func_532/535/536` 控接近 / 窗口 / 派生。
- `func_123` 控取消路线。

想改突进：

| 目标 | 先看 |
|---|---|
| 突进起步更强 | `sys_46(0x5,0,0x46,0x64)` |
| 命中后更贴近 | `func_532(0x1f,0x20,0x64)` |
| 派生更早 | `func_536(0x1,0,func_945)` 和后续派生段 |
| 取消更早 | `func_123` 出现的时间点 |
| 外观不切变形 | `func_888(0x7)` 和恢复 `func_887()` |

## 10. 派生窗口：`func_536` 和 `func_239`

当前锚点：

- `func_239`: `2.c:6002-6208`
- `func_532`: `2.c:14064`
- `func_535`: `2.c:14081`
- `func_536`: `2.c:14087`

`func_536(mask,time,callback)` 的作用：

```text
global140 |= mask
按 mask 写:
  trigger time = time * 0x64
  callback = callback
```

`func_239()` 的作用：

```text
等 motion 时间进入 global401/global402 窗口
读 global49/global92/global87 输入
按 global140 mask 选派生
把 callback 写到 global430
return selected mask
```

派生改动优先级：

| 想改 | 先改 |
|---|---|
| 派生开放更早 / 更晚 | `func_536(mask,time,callback)` 的 `time` |
| 改派生目标 | `func_536` 的 callback |
| 改方向派生 | `mask` 和 `global87` 方向位 |
| 改派生窗口起止 | `func_535(start,end)` |
| 改接近 / 命中后窗口感 | `func_532(a,b,c)` |

不要先改 `func_239`，它是通用消费器，改了会影响所有使用这套派生系统的动作。

## 11. 按目标选择入口

| 目标 | 第一入口 | 第二入口 | 不建议先动 |
|---|---|---|---|
| 普通 BD 更远 | `speed_param.boost_dash_distance` | `boost_dash_duration_frame`、`boost_dash_max_speed` | `func_940` |
| 普通 BD 次数更多 | `speed_param.boost_dash_count` | `boost_gauge_capacity`、`boost_consumption_base` | `func_11` |
| step 更远 | `speed_param.step_distance` | `step_speed`、`step_recovery_frame` | `sys_46` |
| 某招横移更远 | 对应 `ACTION_*` segment | `sys_46(0,...)` 常数 / duration | `speed_param` |
| 某格斗追踪更强 | `func_219(row)` | `func_532/535`、`global507/508` | `func_11` |
| 某格斗派生更早 | `func_536(mask,time,cb)` | `func_535(start,end)` | `speed_param` |
| 某动作可 BD cancel | `func_123/125` | `func_11` gate | `sys_46` |
| 特殊状态结束后恢复移动 | `0xc0008 -> global46 -> func_11` | `global43/45 edge consumers` | 单个 action segment |

## 12. 改动记录模板

每次改移动类内容，先填：

```text
玩家目标:
基础层是否相关:
  speed_param field:
  hash:
  old value:
  new value:

动作层是否相关:
  action hash:
  ACTION callback:
  runtime driver:
  segment callback:
  sys_46 calls:
  func_532/535/536:
  func_123/125:

gate 层是否相关:
  func_11 branch:
  0xc000 slot:
  global23/43/45/46/54:

cleanup:
  movement reset:
  camera cleanup:
  shell restore:

tests:
  ground:
  air:
  overheat:
  hit:
  whiff:
  interrupted:
  BD cancel:
  step / rainbow step:
  death / respawn:
```

这张表填不完时，说明还没找到真正的可改点。

## 13. 动态命名 overlay 建议

不要写：

```json
{"func_940": "special_movement"}
```

写成：

```json
{
  "semanticId": "action.bcSpecialMelee.directionalMovementSegment",
  "currentSymbol": "func_940",
  "shape": {
    "actionCallback": "ACTION_BC_SPECIAL_MELEE",
    "runtimeDriver": "func_502",
    "directionBits": ["global172 & 0x10", "global172 & 0x20"],
    "movementBus": ["sys_46(0,...)", "sys_46(0x1,...)", "sys_46(0x2,...)"],
    "durationCounter": "global204 -= 0x64"
  }
}
```

普通 BD 资源也单独建：

```json
{
  "semanticId": "resource.speedParam.boostDashDistance",
  "family": "speed_param",
  "hash": "0x5481CCF4",
  "field": "boost_dash_distance",
  "source": "docs/command_mapping.md"
}
```

这样 offset、`func_N` 或二次反编译变化时，仍然能靠 action hash、runtime shape、syscall shape 和资源 hash 重定位。

## 14. 当前还缺的硬证据

这份工作簿能指导脚本侧改动，但还不能替代 native handler：

| 缺口 | 需要的证据 |
|---|---|
| `sys_46` 每个 subcmd 的最终单位 | `CDepictionScript` native handler case 解析 |
| `0xc000*` 每个槽的真实来源 | native dispatch / engine state table |
| `func_532` 是否最终生成 hitbox | native consumer / hit resource 对齐 |
| 普通 BD 消耗公式 | boost gauge native 逻辑和 `speed_param` 组合 |
| 跨机体稳定性 | 第二个机体样本的 shape overlay 验证 |

下一步要把这层继续做硬，就是定位 `sys_46` native handler，并按 case 反向对齐本页的脚本调用家族。

## 15. 来源

- 当前样本：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`
- 当前源码：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`
- `speed_param` 字段：[command_mapping.md](../command_mapping.md)
- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki システム：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki テクニック：`https://w.atwiki.jp/exvs2ob/pages/683.html`
- OverBoost wiki 初心者指南：`https://w.atwiki.jp/exvs2ob/pages/560.html`
- [2.c 移动 / BD / `sys_46` / `func_11` 地图](./movement-boost-sys46-func11-map.md)
- [`sys_46` 脚本侧参数地图：动作内移动怎么读、怎么改](./sys46-script-parameter-atlas.md)
- [`func_11` / `0xc000*` boost gate 状态槽地图](./func11-c000-boost-gate-map.md)
