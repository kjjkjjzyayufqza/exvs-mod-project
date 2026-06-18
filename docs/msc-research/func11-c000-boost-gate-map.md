# `func_11` / `0xc000*` boost gate 状态槽地图

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

这页专门回答一个问题：`func_11` 里面这些 `sys_0(0xc000*)` 到底该怎么读，为什么它们会影响 BD、step、overheat、landing、cancel 和动作结束后的继续移动。

先给结论：

- `func_11` 不是 BD 输入函数，也不是某个武装动作。它是 `2.c` 每帧主循环里的脚本侧 boost / cancel gate 状态机。
- `0xc000*` 是 engine / native 层暴露给 MSC 的状态槽。当前样本能把它们分到 gate、movement modifier、phase/effect、target validity 几类，但还不能给每个槽写死最终 native 名。
- `global23` 是脚本侧 gate 主状态；`global43/global45` 是进入 / 退出边沿；`global46` 是特殊状态结束后强制重新进入 gate 的 latch；`global54` 是由 `0xc000c` 驱动的 movement modifier 边沿。
- 真正改 BD 手感时，不应该第一步改 `func_11`。多数情况下先改 `speed_param`、动作内 `sys_46`、`func_123/125` 取消标记，再看是否需要碰 gate。

## 外部系统语义

OverBoost wiki 对玩家侧系统的描述可以作为 MSC 命名的上层语义：

- BD 是跳键二连，可取消射击、格斗等大多数动作，并消耗 boost gauge。
- step 是同方向 lever 二连，主要作用是切诱导和枪口补正，也消耗 boost gauge。
- boost gauge 为空后进入 overheat，BD / step 等行动受限，落地硬直变长。

这些语义不能直接等于某个 `func_N`。在当前脚本里更稳的分层是：

```text
玩家输入 / engine 判定
  -> engine action / movement state
  -> sys_0(0x10000, ...) 和 sys_0(0xc000*) 暴露给 2.c
  -> func_4 每帧主循环
  -> func_11 维护 boost / cancel gate
  -> func_44 / func_52 提交 action
  -> ACTION_* callback 内用 sys_46 / func_532 / func_536 控制动作局部移动
```

Notion MSC 页给当前样本提供了两个重要对照：

- `func_123(mask)` 是取消路线 / action flag bitmask 方向。
- `global200` 表示是否持有方向，`global172` 的 `0x4/0x8/0x10/0x20` 对应前 / 后 / 左 / 右。

所以，玩家说“BD / step / 方向输入 / 取消”时，脚本里通常会拆成三层：上游输入状态、`func_11` 这种全局 gate、动作 callback 里的局部移动控制。

## `func_11` 的位置

`func_11` 在主 action update loop 里位于 action commit 之前：

```text
main
  -> func_1
  -> callFunc3(func_4)

func_4
  -> func_20/21/22/23/24/25
  -> func_5
  -> func_11
  -> func_12 / func_13
  -> func_51 / func_52
  -> func_44
```

人话解释：

- `func_4` 每帧先读 engine 给出的 action、输入、状态槽。
- `func_11` 在本帧 action 真正提交前，判断是否进入、维持或退出 boost / cancel gate。
- `func_44/52` 后面才把 action hash 转成实际 callback。

这解释了为什么 `func_11` 影响面很大：它处在所有 action callback 前面，不属于某一个射击、格斗或特格。

## `func_11` 主流程

源码范围：`2.c:1325-1516`。

### 1. 保存 gate 边沿

```text
global42 = global43
global44 = global45
global43 = 0
global45 = 0
```

工作模型：

| 符号 | 当前术语 | 证据 |
|---|---|---|
| `global43` | gate enter edge | 进入分支末尾置 `1` |
| `global45` | gate exit edge | 退出分支末尾置 `1` |
| `global42` | previous enter edge | 每帧复制自 `global43` |
| `global44` | previous exit edge | 每帧复制自 `global45` |

`func_26` 会消费这两个边沿：`global43` 时调用 `global101` 并执行 `func_261()`；`global45` 时调用 `global102` 并执行 `func_262(0)`。因此它们不是普通 flag，而是给其他 runtime / effect 系统的 gate enter/exit 通知。

### 2. 未处于 gate 时，判断能否进入

入口条件的关键变量：

```text
global23 == 0
global46
global11 & 0x1
global24 & 0x800000
global24 & 0x800
sys_0(0xc0005)
sys_0(0x60001)
sys_0(0xb0003)
```

读法：

- `global23 == 0` 表示脚本侧 gate 未激活。
- `global46` 是强制进入 latch。它不是玩家输入本身，而是某些特殊状态结束后设置的“下一帧重新进 gate”。
- `global11 & 0x1` 是本帧 engine movement / cancel 请求候选。
- `0xc0005` 只在受 `global24` 限制的入口分支出现，像 restricted-state gate permission。
- `0x60001` 和 `0xb0003` 像通用资源 / 状态检查，负责过滤某些不能进入 gate 的状态。

### 3. 进入 gate 后，写多个系统

进入分支的核心调用：

```text
sys_52(0, var1) 或 sys_52(0x2)
func_387()
sys_52(0x3, 0x1)
sys_4D(0x1)
sys_4C(0x6, var5 * var6 / 0x64)
sys_4F(0x14, 0x1)
global23 = 0x1
global47 = 0x2 | optional bits
global43 = 0x1
sys_55(0x1, slot, 0x1) 多次
global48/global49 清部分输入位
```

这说明 `func_11` 不是单一“能否 BD”的 if。它同时通知 movement、weapon/action gate、输入 buffer、effect/runtime edge 多个系统。

`sys_0(0xc0003)` 在这里选择两组 `0x6000e` 参数：

```text
0xc0003 true  -> 0x51782bfe / 0xe6838dfc
0xc0003 false -> 0xc7125f17 / 0xfda6187d
```

所以 `0xc0003` 当前适合命名为 gate mode selector。具体它是空中 / 地上、普通 / forced、或别的 native 模式，还需要 native handler 验证。

### 4. gate 激活时，判断维持或退出

当 `global23 != 0` 时，`func_11` 先看：

```text
sys_0(0xc0001)
```

如果这个槽不成立，并且不是 `global23 == 2` 的短暂回弹分支，就会退出。成立时还会结合当前 action metadata 判断能否继续：

```text
global50
global6
global24
global19
global51
global52
global53
global30/global31
```

退出时调用：

```text
sys_52(0x1)
sys_52(0x3, 0)
global47 = 0
global45 = 0x1
sys_4F(0x14, 0)
sys_56(0x3, 0x64)
sys_56(0x4, 0x64)
sys_4C(0x9, 0x1)
```

这和进入时的 `sys_52(0x3,1)`、`sys_4F(0x14,1)`、`sys_4C(0x9,0)` 对称。`0xc0001` 因此更像 gate continuation / active permission，而不是单纯按键。

### 5. `0xc000c` 驱动 `global54`

函数末尾：

```text
if (global54 == 0) {
  if (sys_0(0xc000c)) {
    global54 = 0x1
  }
} else if (global45 || !sys_0(0xc000c)) {
  global54 = 0
}
```

`global54` 随后被 `func_419/420/421/422` 使用，用于给 movement 参数追加额外值。因此 `0xc000c` 不是普通 action id；它像 gate 内部的边沿 / bonus 状态，用来改变某些移动段的速度或距离修正。

## `0xc000*` 状态槽表

当前样本里 `sys_0/sys_1(0xc000*)` 的使用很集中：

| 槽 | 次数 | 主要位置 | 当前工作名 | 置信度 |
|---|---:|---|---|---|
| `0xc0001` | 1 | `func_11` active 分支 | gate continuation permission | 中 |
| `0xc0003` | 2 | `func_11`、`func_484` | gate mode selector | 中 |
| `0xc0005` | 1 | `func_11` restricted entry | restricted-state gate permission | 中低 |
| `0xc0006` | 2 | `func_191`、`func_484` | gate intensity scalar | 中 |
| `0xc0007` | 2 | `func_254`、`func_260` | gate phase enum | 中 |
| `0xc0008` | 6 | `func_191`、`func_474..478` | gate continuation / re-entry latch source | 中 |
| `0xc0009` | 4 | target / attack candidate logic | target validity under gate | 中低 |
| `0xc000a` | 1 | `func_193` wrapper | unknown gate status wrapper | 低 |
| `0xc000b` | 7 | movement functions `func_423..447` | movement correction active | 中 |
| `0xc000c` | 2 | `func_11` -> `global54` | movement bonus edge source | 中 |
| `0xc000e` | 1 write | `func_305` | gate effect scale parameter | 中低 |
| `0xc000f` | 1 write | `func_306` | gate effect vector parameter | 中低 |

这里的“工作名”只用于研究和动态 overlay，不建议直接改成最终代码名。

## 关键状态槽细拆

### `0xc0003` + `0xc0006`：模式选择和强度标量

`func_191`：

```text
var0 = sys_0(0x6000e, 0xcf30663b)
var1 = sys_0(0xc0006)
sys_52(0x4, var1 * var0 / 0x64)
```

`func_484`：

```text
var0 = sys_0(0xc0003)
var1 = var0 ? sys_0(0x6000e, 0xeef7d24c)
            : sys_0(0x6000e, 0xf1c2a3e3)
var2 = sys_0(0xc0006)
sys_52(0x4, var2 * var1 / 0x64)
```

解释：

- `0xc0003` 选择参数组。
- `0xc0006` 提供一个百分比式强度值。
- `sys_52(0x4, ...)` 消费这个结果，像 gate 期间某种 movement / state intensity。

### `0xc0008` -> `global46` -> forced gate entry

`0xc0008` 在 `func_474..478` 一类特殊 movement / cinematic 状态结束时反复出现：

```text
if (sys_0(0xc0008)) {
  global46 = 0x1
}
```

下一帧 `func_11` 看到 `global46` 后直接走 forced entry 分支：

```text
if (global46) {
  var0 = 0x1
}
...
if (global46) {
  sys_52(0x2)
  var3 = 0x1
}
```

解释：`0xc0008` 很可能表示 native 认为当前特殊状态结束后还应该恢复 / 继续 boost-cancel gate。它不是“按了 BD”，而是从动作状态回到 gate 的 re-entry source。

### `0xc000b` + `global54`：移动修正

`func_423` 和 `func_437/439/446/447` 这组 movement function 会先读 `speed_param`，再根据 `global23` 和 `0xc000b` 叠加脚本侧修正。

例子：

```text
global507 = sys_0(0x60006, global142, 0xc6157381)
global508 = sys_0(0x60006, global142, 0x37d1d056)
global509 = sys_0(0x60006, global142, 0xe682ba8)

if (global23 != 0) {
  global507 += func_417()
  global509 += func_418()
}

if (sys_0(0xc000b)) {
  global507 += func_419()
  global509 += func_420()
}
```

另一个 BD / step 相关例子：

```text
global507 = sys_0(0x60006, global142, 0xa49287b9)
global508 = sys_0(0x60006, global142, 0x6c640897)
global509 = sys_0(0x60006, global142, 0x5481ccf4)

if (global23 != 0) {
  global507 += func_435()
  global509 += func_436()
}

if (sys_0(0xc000b)) {
  global507 += func_421()
  global509 += func_422()
}
```

其中 `func_419/420/421/422` 还会检查 `global54`：

```text
base = sys_0(0x6000e, hashA)
if (global54) {
  base += sys_0(0x6000e, hashB)
}
```

对应 `docs/command_mapping.md` 的 `speed_param` 字段：

| Hash | 字段 | 在当前流程里的意义 |
|---|---|---|
| `0xC6157381` | `air_dash_speed` | 空中 dash / movement 初速度候选 |
| `0x37D1D056` | `fall_gravity` | 下落重力候选 |
| `0x0E682BA8` | `ground_run_speed` | 地走 / 地面 run speed 候选 |
| `0xA49287B9` | `boost_dash_duration_frame` | BD 持续帧 |
| `0x6C640897` | `fall_speed` | 下落速度 |
| `0x5481CCF4` | `boost_dash_distance` | BD 距离 |
| `0x2DF7AF95` | `step_startup_frame` | step 起始帧 / 起手时长 |
| `0x32FD1EDC` | `dash_cancel_type` | dash cancel 类型枚举候选 |
| `0x4F705BAD` | `step_recovery_frame` | step 恢复帧 |
| `0x4031CB84` | `boost_dash_startup_frame` | BD 起始帧 |
| `0x41DABEC5` | `boost_dash_recovery_frame` | BD 恢复帧 |

这条链很重要：`speed_param` 是机体基础机动数据，`global23/0xc000b/global54` 是 gate 期间叠加的脚本修正，最后通过 `sys_46` 写进 movement 通道。

### `0xc0007`、`0xc000e`、`0xc000f`：gate phase 和表现参数

`func_254`：

```text
global23 != 0
sys_0(0xc0007) == 0x3
当前 action 是 0xc / 0xe / 0xf 之一
```

成立时会驱动 `sys_4A(0x9, 0x6, 0x3, ...)` 这类 effect。

`func_260`：

```text
var0 = sys_0(0xc0007)
var1 = global126 > 0 && (global76 || global77) && global125 == 0 && var0 == 0x4
```

成立时启动 `func_258()`，而 `func_258()` 使用 `global439..442` 调 `sys_4A`。这些 global 又来自：

```text
func_305(arg0) -> global439 = arg0; sys_1(0xc000e, arg0)
func_306(a,b,c) -> global440/441/442 = a/b/c; sys_1(0xc000f, a,b,c)
```

解释：`0xc0007` 像 gate phase enum；`0xc000e/f` 像把 gate effect 的 scale / vector 参数同时写给 native 和脚本 effect 系统。

### `0xc0009`：gate 中的目标 / action 候选有效性

`0xc0009` 不在 `func_11` 中出现，而是在 target / attack candidate 相关逻辑里出现：

- `2.c:1078`：没有合适 target candidate 时，如果 `sys_0(0xc0009)` 成立，就调用 `func_6(var0)` 选 fallback。
- `2.c:17216/17291`：在 `global23 != 0` 且某个 `0x6000e` 参数成立时，`sys_0(0xc0009)` 和 `sys_0(0xc0009, global539)` 会让 `global543` 切到 `0x25b`。
- `2.c:24418`：`func_837` 里用 `sys_0(0xc0009, arg2)` 判断某个 target/action 条件能否成立。

解释：它更像 gate 期间 target / action candidate validity，而不是 movement gauge。

## 和动作内移动的关系

玩家觉得“BD / step / 特格移动 / 格斗突进”是一件事，但脚本里至少分三类：

| 层 | 代表位置 | 作用 |
|---|---|---|
| engine 基础层 | `0xc000*`、`0x10000`、`speed_param` | 识别输入、状态、boost gauge、基础机动参数 |
| gate 层 | `func_11`、`global23`、`global46`、`global54` | 进入 / 退出 boost-cancel 过渡，给 movement 叠加修正 |
| 动作局部层 | `ACTION_*`、`func_489/502`、`sys_46`、`func_532/535/536` | 某个格斗、特格、射击动作自己的位移、追踪、派生窗口 |

所以改动顺序应当是：

1. 改机体基础 BD 速度 / 距离 / 持续：优先查 `speed_param` 字段。
2. 改某个特格或格斗的突进：查该 `ACTION_*` callback 内的 `sys_46`、`func_532/535/536`。
3. 改某个动作能否被取消：查该动作的 `func_123/125/81` 和 runtime window。
4. 只有当目标是全局 BD / cancel gate 规则时，才动 `func_11` 或 `0xc000*` 相关判断。

## 动态命名建议

不要把这些名字直接写成“`func_11 = BD`”。更稳的 overlay 方式：

```json
{
  "symbol": "func_11",
  "role": "boost_cancel_gate_state_machine",
  "confidence": "medium",
  "evidence": [
    "called before action commit in func_4",
    "reads 0xc0001/3/5/c",
    "sets global23/global43/global45",
    "toggles sys_52/sys_4D/sys_4C/sys_4F(0x14)"
  ]
}
```

`0xc000*` 也按槽位建 overlay，不按 line 或 offset：

```json
{
  "slot": "0xc000b",
  "role": "movement_correction_active",
  "confidence": "medium",
  "evidence": [
    "adds func_419/420 in func_423",
    "adds func_421/422 in func_437/439/446/447",
    "depends on global54 bonus path"
  ]
}
```

这样后续另一个机体样本里 `func_N` 变了，只要还能看到相同 syscall shape、global family、`speed_param` hash 和 action context，就能重新匹配角色。

## 模组开发上的实际判断

| 想改的东西 | 优先入口 | 不建议第一步动 |
|---|---|---|
| BD 基础次数、速度、距离、持续 | `speed_param`：`boost_dash_count`、`boost_dash_duration_frame`、`boost_dash_distance`、`boost_dash_*` | `func_11` |
| step 距离、起手、恢复 | `speed_param`：`step_distance`、`step_startup_frame`、`step_recovery_frame`、`step_cancel_frame` | `0xc0001/3/5` |
| 某个特格横移 / 突进 | 对应 `ACTION_*` 的 `sys_46(0/1/2/4/5,...)` | 全局 `speed_param` |
| 某个格斗追踪 / 派生窗口 | `func_532/535/536`、`func_239`、`func_489/502` | `0xc000b/c` |
| 某个射击能否 BD cancel | 该动作 `func_123/125/81` 和 ammo/action runtime | `sys_52` |
| 特殊动作结束后继续 gate | `0xc0008 -> global46 -> func_11` 这条链 | 单独清 `global46` |
| 全局 cancel gate 规则 | `func_11`、`global23/43/45/46/54` | 单一动作 callback |

改 `func_11` 前至少要测这些场景：

- 地上 BD、空中 BD、step、BD 中 step。
- boost gauge 空时的 overheat。
- 落地硬直长短。
- 射击后 BDC、格斗虹 step、特格移动结束。
- 动作被打断、自然结束、命中、空挥。
- 镜头演出状态结束后能否恢复正常移动。

## 当前仍需验证的点

- `0xc0001/3/5/6/7/8/9/b/c/e/f` 的 native handler 还没定位，本文只给脚本侧角色。
- `sys_52` 的 subcmd 需要和 native 表对齐；现在只能从进入 / 退出对称性推断。
- `0xc0003` 是空地模式、forced mode，还是其他 gate mode，需要跨样本或 native 证据。
- `0xc000b` 与 `global54` 的实机表现需要录制对照：同一动作在普通 gate 与 `0xc000c` 成立时移动距离是否不同。
- `0xc0009` 当前更像 target validity，但需要结合 `0x50000/0x50001/0x7000c` native 语义确认。

## 证据索引

| 证据 | 范围 |
|---|---|
| `func_11` 主状态机 | `2.c:1325-1516` |
| gate enter/exit edge consumer | `2.c:1885-1905` |
| edge 初始化 | `2.c:8454-8459` |
| `0xc0006/8` 与 `sys_52(0x4/0x3)` | `2.c:5156-5170` |
| `0xc0007` phase effect | `2.c:6344-6365`、`2.c:6420-6442` |
| `0xc000e/f` 写入和 effect 参数 | `2.c:6398-6409`、`2.c:7261-7272` |
| `0xc000b/global54` modifier helper | `2.c:9602-9652` |
| `0xc000b` 叠加 movement 参数 | `2.c:9795-9814`、`2.c:10263-10275`、`2.c:10320-10338`、`2.c:10561-10618` |
| `0xc0008 -> global46` | `2.c:11678-11688`、`2.c:11783-11792`、`2.c:11834-11845`、`2.c:11934-11944`、`2.c:12067-12076` |
| `0xc0003/6` 二次使用 | `2.c:12192-12220` |
| `0xc0009` target validity | `2.c:1060-1090`、`2.c:17205-17300`、`2.c:24413-24425` |
| `speed_param` hash 字段名 | `docs/command_mapping.md` 的 `speed_param (041cpm, cmd=74)` |

## 资料来源

- 当前样本：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`
- 仓库字段表：[command_mapping.md](../command_mapping.md)
- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki 系统页：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki 初心者指南：`https://w.atwiki.jp/exvs2ob/pages/559.html`
- OverBoost wiki 用语集：`https://w.atwiki.jp/exvs2ob/pages/82.html`
- 相关研究：[2.c 移动 / BD / `sys_46` / `func_11` 地图](./movement-boost-sys46-func11-map.md)
