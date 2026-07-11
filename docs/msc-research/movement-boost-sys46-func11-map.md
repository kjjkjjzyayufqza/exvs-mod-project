# 2.c 移动 / BD / `sys_46` / `func_11` 地图

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

这页只解决一个问题：逆向者想改机体移动、特格突进、格斗追踪、BD cancel 手感时，应该从哪里看，哪些地方能改，哪些地方暂时不要动。

先给结论：

- `2.c` 没有从零实现“跳键二连触发 BD”。BD / step 的原始识别、boost gauge 基础扣减、overheat / landing 硬直属于 engine 通用层。
- `2.c` 负责在动作运行时读 engine 给出的状态，决定当前动作能否被 boost / cancel gate 打断，并用 `sys_46(...)` 写入动作局部的移动、速度、惯性、追踪、转向类参数。
- `func_11` 是全局 boost / cancel gate 候选，不是普通动作 callback。
- `sys_46` 是动作局部运动控制总线候选，不是单一“BD 函数”。
- **2026-07-11：** transform 飞行路径里没有把气槽消耗写成 `/2`；`boost_dash_initial_speed` 上的 `/2` 出现在其它 BD 动作（如 Gyan `func_407`）。见 [gyan-session-2026-07-11-handoff.md](./gyan-session-2026-07-11-handoff.md) §3。

## 玩家语义对照

外部语义来源先按 wiki 定义：

- OverBoost 系统页说明 BD 是跳键二连，能取消射击、格斗等大多数动作，并消耗 boost gauge。
- 初心者指南把 BD 描述为“带方向的跳键二连高速水平移动”，step 是同方向输入二连，主要用于切诱导和枪口修正。
- 用语集也把 BD / step 归入移动和回避系动作。

这些语义不能直接等同到某个 `func_N`。在脚本里应该这样分层：

```text
玩家输入：跳键二连 / 同方向二连 / A / B / A+C / B+C
  -> engine input/action layer
  -> sys_0(0x10000, ...) 给 2.c 当前 action hash / action metadata
  -> func_4 每帧主循环
  -> func_11 处理 boost / cancel gate 状态
  -> func_44 / func_52 commit action 并调度 ACTION_* callback
  -> ACTION_* 安装 ranged 或 melee/special movement runtime
  -> segment callback 里用 sys_46 / func_532 / func_535 / func_536 改动作移动
```

## `func_11` 在主循环的位置

`func_4` 是 `2.c` 的主 action update loop。它每帧读输入、读 pending action、处理中断和 cancel gate，最后把 action hash 变成 callback。

在这条链上，`func_11` 位于 action commit 之前：

```text
main
  -> func_1
  -> callFunc3(func_4)

func_4
  -> func_20/21/22/23/24/25    读 engine 输入、action、状态槽
  -> func_5                    选择 pending action
  -> func_11                   boost / cancel gate 状态更新
  -> func_12 / func_13          其他外部转移和强制中断
  -> func_51 / func_52          secondary action channel
  -> func_44                   primary action commit
```

因此不要把 `func_11` 当成某个武装动作的一段。它更像“本帧能不能进入 / 维持 / 退出 boost-cancel 相关状态”的统一门。

## `func_11` 用人话拆开

源码证据：`2.c:1325-1516`。

### 1. 先保存上一帧边沿，再清本帧边沿

```text
global42 = global43
global44 = global45
global43 = 0
global45 = 0
```

工作模型：

- `global43` 是本帧进入 gate 的边沿候选。
- `global45` 是本帧退出 gate 的边沿候选。
- `global42/global44` 保存上一帧，用于其他函数判断“刚进入 / 刚退出”。

### 2. 未处于 gate 时，判断是否进入

入口条件主要看：

```text
global23 == 0
global46
global11 & 0x1
global24 & 0x800000 / 0x800
sys_0(0xc0005)
sys_0(0x60001)
sys_0(0xb0003)
```

当前能稳妥说的是：

- `global23` 是 gate 状态机，`0` 表示未进入。
- `global46` 是强制进入分支。
- `global11 & 0x1` 是本帧某类 engine movement / cancel 请求候选。
- `sys_0(0xc0005)`、`sys_0(0xc0003)`、`sys_0(0xc0001)`、`sys_0(0xc000c)` 是 engine 侧 boost / cancel / landing / overheat 相关状态候选，具体 native 名称还没拆完。
- `sys_0(0x60001) > 0` 像 boost gauge 或可行动资源检查；`sys_0(0xb0003)` 像地面 / 空中 /落地状态分组。

### 3. 进入 gate 后，会设置多个子系统

进入分支里有一串很关键的系统调用：

```text
sys_52(0, var1) 或 sys_52(0x2)
func_387()
sys_52(0x3, 0x1)
sys_4D(0x1)
sys_4C(0x6, var5 * var6 / 0x64)
sys_4F(0x14, 0x1)
global23 = 0x1
global47 = 0x2 | optional flags
global43 = 0x1
sys_55(0x1, slot, 0x1) 多次
global48/global49 清掉部分输入位
```

工作模型：

- `sys_52` / `sys_4D` / `sys_4C` 是运动状态、速度倍率、表现或限制层的 gate 控制。
- `sys_4F(0x14,1)` 不是发弹；它更像武装或动作层的“当前被 boost/cancel gate 接管”标志。
- 多个 `sys_55(0x1, slot, 1)` 说明进入 gate 时会禁止或冻结一批动作 / weapon slot。
- 如果 `var1` 成立，会把 `global5` 强行改成 `sys_0(0x10000,0x1,0x23)`，这像是把当前 primary action 切到一个 engine 预定义 action。

### 4. 维持或退出 gate

当 `global23 != 0` 时，`func_11` 主要靠 `sys_0(0xc0001)` 和当前 action metadata 判断是否继续：

```text
if (sys_0(0xc0001)) {
  ... 根据 global50/global6/global24/global51/global52/global53 判断维持或清空 global23
}
```

退出时会：

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

工作模型：

- `global45=1` 是退出边沿。
- `sys_4F(0x14,0)` 和进入时的 `sys_4F(0x14,1)` 对称。
- `sys_56` 和 `sys_4C(0x9,1)` 像恢复默认运动 / 表现参数。

这就是为什么模组开发不应第一步改 `func_11`：它不是单个动作速度，而是跨射击、格斗、特格、BD cancel、landing / overheat 的全局门。

## `sys_46` 出现形态

当前样本里 `sys_46` 出现 391 次，脚本侧第一个参数分布如下：

| subcmd | 次数 | 当前脚本侧解释 |
|---|---:|---|
| `0` | 59 | 每帧 movement delta / steering adjustment 候选。特格横向移动直接写这里。 |
| `0x1` | 177 | 最常见的 vector / velocity / offset 通道写入或清零。第二参像通道 id，后面三参像目标值和持续 / 强度。 |
| `0x2` | 35 | 运动插值 / 过渡 /惯性续接候选，常见 `sys_46(0x2,0x3,...)`。 |
| `0x3` | 5 | 速度倍率包装层，`func_298..302` 都只包这一类。 |
| `0x4` | 46 | runtime 入口处常用的 movement scale / channel 4 基准值，很多动作结束时回到 `0x64`。 |
| `0x5` | 14 | 瞬时追踪 / 朝向 / 特殊移动初值候选，常出现在格斗、特格起手。 |
| `0x6` | 1 | 只由 `func_296(0x3e9, value)` 包装，像运动状态开关。 |
| `0x7` | 1 | 只由 `func_296(0x3eb, value)` 包装，像另一类运动状态开关。 |
| `0x8` | 7 | 辅助运动 gate 候选，常跟 `global181` 一起出现。 |
| `0x9` | 3 | 低频开关。 |
| `0xa` / `0xb` / `0xc` / `0xd` | 7 | 低频参数通道，当前样本证据不足。 |
| `0xe` | 4 | 常和 `sys_46(0x4,0x4,...)` 成对设置。 |
| `0xf` | 29 | 时间 / 插值约束候选，常见第三参是 `sys_47(0x1, activeShell)` 或固定时长。 |
| `0x12` / `0x13` / `0x14` | 3 | 稀有控制项，当前只做索引，不直接命名。 |

脚本侧可以先这样使用：

- 想改“动作中往哪冲、冲多快”：先看 `sys_46(0,...)`、`sys_46(0x1,...)`、`sys_46(0x2,...)`。
- 想改“动作速度曲线”：先看 `func_298..302` 和 `sys_46(0x3,...)`。
- 想改“格斗追踪 / 特格突进起手”：先看 `sys_46(0x5,...)`、`func_532(...)`、`func_535(...)`。
- 想改“动作是否进入某类移动状态”：再看 `func_296(0x3e8/0x3e9/0x3ea/0x3eb,...)`。

## `func_296` 和速度包装函数

源码证据：`2.c:7158-7248`。

`func_296` 是状态开关包装层：

```text
func_296(0x3e8, value) -> sys_1(0x30001, value)
func_296(0x3e9, value) -> sys_46(0x6, value)
func_296(0x3eb, value) -> sys_46(0x7, value)
func_296(0x3ea, value) -> sys_1(0xf0000, 0, value)
```

`func_298..302` 是速度倍率包装层：

```text
func_298(v) -> sys_46(0x3,0x1,v,v,v)
func_299(v) -> sys_46(0x3,0x2,v,v,v)
func_300(v) -> sys_46(0x3,0x4,v,v,v)
func_301(v) -> sys_46(0x3,0x4,v,0x64,v)
func_302(v) -> sys_46(0x3,0x4,0x64,v,0x64)
```

模组开发时不要只搜 `sys_46`。很多速度变化藏在 `func_300(...)` 这种包装里。

## Melee runtime：`func_489`

源码证据：`2.c:12485-12766`。

普通格斗和一部分特殊格斗使用 `func_489` 这个 runtime：

```text
ACTION_B_MELEE
  -> func_488()                 清 melee/special runtime
  -> func_219(row)              读 0x60002 参数 row 到 global379..393
  -> global602 = segment0
  -> callFunc3(func_965)

func_965
  -> func_489()

func_489
  global184=0 -> func_490       起手初始化
  global184=1 -> func_491       突进 / 追踪早期
  global184=2 -> func_492       追踪后期 / 命中前后
  global184=3 -> func_493       后处理
  global184=4 -> func_494       额外后处理
```

`func_490` 起手会设置运动基准：

```text
sys_46(0x4, 0x4, global606)
sys_46(0xe, 0x4, 0x190)
func_296(0x3e8, 0 或 1)
func_71(global602)
```

`func_491/492` 每帧处理速度衰减、追踪、命中前后切阶段：

```text
func_300((0x64 - global606) * ... + global606)
global507/global508 更新
global175/global188/global189 递减
```

所以格斗“冲不冲、冲多久、追得多强”通常不是一个点，而是：

```text
func_219(row)
  -> global379..393 / global507 / global508 / global606
  -> func_490 设置 sys_46(0x4/0xe) 和状态开关
  -> func_491/492 每帧衰减
  -> segment callback 里额外 func_532/535/536
```

## Special movement runtime：`func_502`

源码证据：`2.c:13212-13469`。

特格 / 特殊移动类动作常用 `func_502`：

```text
ACTION_BC_SPECIAL_MELEE
  -> func_488()
  -> global609 = func_940
  -> global390 = -1
  -> global613 = 0xa
  -> global452/453/454 = movement scale
  -> callFunc3(func_939)

func_939
  -> func_502()

func_502
  global184=0 -> func_503       起手初始化
  global184=1 -> func_504       主移动段
  global184=2 -> func_505       派生 / 输入窗口
  global184=3 -> func_506       结束清理
```

`func_503` 建立移动段：

```text
global175 = global390 * 0x64
global181 = 0
global182 = 0
func_71(global608 或 global609)
sys_46(0x4, 0x4, global452)
sys_46(0xe, 0x4, 0x190)
```

`func_504` 是主移动段，每帧把 engine 目标 / 自机差值变成运动控制：

```text
global265 = sys_0(0x40000, 0x5)
global499 = func_521(0x1) - global268

var0 = func_102(global265, global175, 0)
sys_46(0, var0)
global265 -= var0

var1 = func_102(global499, global175, 0)
func_105(var1, 0, 0)
global499 -= var1
```

这就是为什么特格移动常常既有 `sys_46(0,...)`，又有 `func_104/105/107` 这类位置 / 目标差值 helper。

## 输入派生窗口：`func_532` / `func_535` / `func_536` / `func_239`

源码证据：`2.c:6002-6208`、`2.c:14064-14150`。

这一组不是 BD 本身，而是格斗 / 特格动作内“什么时候允许按方向或按钮派生到下一段”。

```text
func_532(a,b,c)
  -> func_533(a)          global625 = a * 0x64
  -> func_534(b,c)        global626 = b * 0x64; global627 = c

func_535(start,end)
  -> global401 = start * 0x64
  -> global402 = end * 0x64

func_536(mask,time,callback)
  -> global140 |= mask
  -> 按 mask 把 time*0x64 和 callback 写入 global406..429

func_239()
  -> 等待 sys_47(0,activeShell) 到达 global401/global402
  -> 读 global49/global92/global87
  -> 按方向和 mask 选出 var0
  -> global430 = 对应 callback
  -> return var0
```

重点：

- `func_536(0x1, time, cb)` 是无方向 / 默认派生候选。
- `func_536(0x2/0x4/0x8/0x10, time, cb)` 和 `global87` 前后左右方向匹配。
- `func_536(0x20/0x40/0x80/0x100/0x200/0x400/0x800,...)` 是其他按钮或特殊条件派生。
- `func_239` 真正消费输入并把选中的 callback 放入 `global430`。

因此改格斗派生时应优先改 `func_536` 的 time / callback，而不是乱改 `func_239`。

## 案例 1：方向特格横移 `func_940`

源码证据：`2.c:26607-26696`。

`ACTION_BC_SPECIAL_MELEE` 进入 `func_502` runtime，并把 `global609` 设成 `func_940`。

`func_940` 里有非常清楚的方向分支：

```text
if (global172 & 0x20) {
  var1 = right-side offset
} else if (global172 & 0x10) {
  var1 = left-side offset
}

global265 = func_102(target + var1 * 0x64, global204, 0)
sys_46(0, global265)
```

然后进入另一段运动控制：

```text
sys_46(0x1, 0x4, 0, 0, 0)
sys_46(0x2, 0x3, 0, var0, 0xc8)
...
sys_46(0x1, 0x1, 0, var0, 0x12c)
func_104(global499, 0, 0)
```

人话解释：

- `global172` 是本动作进入时保存的方向输入，Notion 记录里 `0x10` 是左，`0x20` 是右。
- 第一段用 `sys_46(0,global265)` 逐帧推一个横向 / 朝向相关 delta。
- 第二段清 `0x4` 通道，然后用 `0x2/0x1` 子命令把运动过渡到目标方向或目标高度。

模组改点：

- 改左右横移距离：先改 `var1` 常量，不要先改 `sys_46` subcmd。
- 改横移持续：看 `global204` 和 `global204 -= 0x64`。
- 改后半段追踪：看 `sys_46(0x2,0x3,...)` 和 `sys_46(0x1,0x1,...)` 的持续值。

## 案例 2：变形突击 `func_937`

源码证据：`2.c:26424-26584`。

`ACTION_BC_SPECIAL_MELEE_ALT_2` 是另一条特格 / 变形突击路径：

```text
ACTION_BC_SPECIAL_MELEE_ALT_2
  -> func_488()
  -> func_219(0x769a714e)
  -> global602 = func_936
  -> global390 = 0xa
  -> callFunc3(func_935)
```

起手 `func_936`：

```text
func_888(0x7)
func_308(global20, 0xe6bd9694, ...)
func_531(func_937)
func_296(0x3e8, 1)
if func_309(...,0x8fc): func_123(0x381)
```

后续 `func_937`：

```text
func_296(0x3e9, 0)
sys_46(0x5, 0, 0x46, 0x64)
func_532(0x1f, 0x20, 0x64)
func_535(0, 0x3e7)
func_536(0x1, 0, func_945)
func_123(0x200)
if func_544(): func_321(0x651e4f06)
```

人话解释：

- `func_888(0x7)` 先换到变形 / 突击外观。
- `func_296(0x3e8,1)` 开一个 movement 状态。
- `sys_46(0x5,0,0x46,0x64)` 设置起手运动 / 追踪参数。
- `func_532/535/536` 设置可派生 / 命中 / 追踪窗口。
- `func_123(0x200)`、后面的 `func_123(0x381)` 决定哪些时点可 cancel。

模组改点：

- 想让突击更早可取消：优先调 `func_123(0x381)` 的 `func_309` 时间点。
- 想让突击追得更远：先小幅调 `func_532/535`，再碰 `sys_46(0x5,...)`。
- 想让外观不变：不要碰 `func_888(0x7)`，或必须同时确认动作结束时是否回到 `func_887()` 默认 loadout。

## 案例 3：N 格 `func_967`

源码证据：`2.c:27343-27537`。

N 格链路：

```text
ACTION_B_MELEE
  -> func_488()
  -> func_219(0xde3d1477)
  -> global602 = func_966
  -> func_489 runtime

func_966
  -> func_308(...,0x3894dc3b,...)
  -> func_531(func_967)
  -> global170 = 1
  -> func_887()
  -> func_123(0x200)

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

人话解释：

- `func_219(0xde3d1477)` 决定这套 N 格的基础追踪 / 突进 row。
- `func_967` 决定第一段实际动作、命中 / 派生窗口和 cancel mask。
- `func_536` 三行分别给默认派生、某个按钮 / 特殊派生、后方向派生装 callback。
- 真正何时触发派生由 `func_239()` 在 runtime 里消费。

模组改点：

- 改 N 格第一段动作：`func_308` motion hash。
- 改第一段派生时间：`func_536(...,0xf,...)` 第二参。
- 改追踪 / 突进手感：先看 `func_219(row)` 和 `func_532/535`，再看 runtime 里的 `global507/global508/global606`。
- 改能否 BD / step cancel：看 `func_123`、`func_125` 和 `func_11` gate，不要只改 motion。

## 逆向时的实用路线

当你面对一个新的 `func_N`，想判断它是不是移动相关：

1. 从 `func_1043` 的 action registry 找 action hash 和 callback。
2. 看入口里有没有 `func_488()`。有的话大概率是 melee / special movement runtime。
3. 看有没有 `func_219(row)`。有的话把 row 作为动态命名证据记录下来。
4. 找 `global602/global608/global609/global610`，它们通常是动作段 callback。
5. 在动作段 callback 里搜：
   - `sys_46`
   - `func_296`
   - `func_298..302`
   - `func_532/535/536`
   - `func_123`
   - `func_81`
6. 把 `func_309(global20,time)` 当时间线节点，不要当按钮判断。
7. 如果看到 `global172/global87`，按方向输入解释；Notion 记录当前样本里 `0x4/0x8/0x10/0x20` 对应前 / 后 / 左 / 右。

## 改动风险分层

| 改动 | 建议风险 | 原因 |
|---|---|---|
| 调 `func_309` 时间点 | 低到中 | 只影响当前动作节点，但要确认收尾清理。 |
| 调 `func_536` 派生时间 / callback | 中 | 容易跳到不兼容 runtime，但范围还在动作内。 |
| 调 `func_532/535` | 中 | 会改变追踪 / 命中前窗口，需要测命中和空挥。 |
| 调 `sys_46(0/0x1/0x2/0x4/0x5)` 参数 | 中到高 | 直接改动作位移 / 速度 / 追踪，必须测地上、空中、overheat、锁定目标丢失。 |
| 调 `func_296(0x3e8/0x3e9/0x3eb)` | 高 | 可能影响运动状态开关和全局 runtime。 |
| 改 `func_11` 或 `sys_0(0xc000*)` 判断 | 很高 | 影响所有动作的 boost / cancel / landing gate。 |

## 当前还不能定死的点

- `sys_46` native handler 还没有像 `sys_47/sys_53/sys_4F` 那样拆到 case 级，所以这里的 subcmd 名称是脚本侧工作名。
- `sys_0(0xc0001/3/5/c)` 的 native 语义还没最终确认，只能从 `func_11` 的上下文判断它们属于 boost / cancel / landing gate。
- `func_532` 在 Notion 中记录为“近战击中 / 前进惯性候选”，当前样本可证明它设置 `global625/626/627`，但还不能证明 native 最终如何消费这些值。
- `sys_46(0x5,...)` 和 `func_532/535` 的关系需要实机对照或 native handler 才能命名得更硬。

## 资料来源

- 当前样本：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`
- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki 系统页：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki 初心者指南：`https://w.atwiki.jp/exvs2ob/pages/559.html`
- OverBoost wiki 用语集：`https://w.atwiki.jp/exvs2ob/pages/82.html`
- 仓库资料：`docs/exvs-msc-input-action-weapon-pipeline.md`、`docs/exvs-msc-syscall-47-notes.md`、`docs/exvs-msc-syscall-53-notes.md`
