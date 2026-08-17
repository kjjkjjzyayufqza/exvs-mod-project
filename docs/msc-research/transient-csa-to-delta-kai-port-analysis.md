# 瞬变高达 CSA 机制与德尔塔改移植前分析

> 日期：2026-08-03  
> 状态：Param/MSC 证据已闭环，Motion/Effect/Sound 待补；尚未修改两台机体的 MSC 源码  
> 目标：解释瞬变高达射击 CS（持续照射）的实现层次，评估把德尔塔改现有 CSA 改成同类动作的安全做法，并记录 `func_983` 反编译美化缺陷。

## 1. 分析对象与边界

源机体：

- `E:\XB\mod\040msc\053gbftry_005tsient_001\2.c`
- 配套 `0.c`、`2.dscex`、`2.txt`
- Character ID：`53005001`
- Character ID Table 绑定：
  - MSC：`0x3AA036F8`
  - Param：`0x6B5B0CE0`
  - Motion：`0x9A0DB96A`
  - Effect：`0x4F90042E`
  - Sound：`0x748F2C70`

目标机体：

- `E:\XB\mod\040msc\026gnbelt_003delatkai_001_msc\2.c`
- 配套 `0.c`
- 当前底盘实际上是 Character ID `15004001` 的 Delta Plus classic-selector 脚本，不是 external-table 脚本。

本阶段只生成分析和实施方案，不改 `0.c`、`2.c`、二进制或 Param。

## 2. 先给结论

1. 德尔塔改的蓄力输入入口已经存在，无需照抄瞬变 `0.c`。
   - 普通形态：Delta `0.c:3421-3424`，`global48 & 0x800 -> 0x700BB2C6`。
   - 变形形态：Delta `0.c:3375-3378`，同样进入 `0x700BB2C6`。
   - Delta `2.c:29613` 把该 hash 绑定到当前名为 `ACTION_CHARGE_SHOT_LOCK_SWITCH` 的函数。

2. `ACTION_CHARGE_SHOT_LOCK_SWITCH` 的现名不准确。
   - 它不是“换锁分支”；从 `0.c` 的直接输入证据看，它就是 `0x800` 蓄力射击 action。
   - 后续修改时建议改为证据更强的 `ACTION_A_CHARGE_SHOT`，或至少在文档 overlay 中撤销“lock switch”结论。

3. 德尔塔当前 CSA 和瞬变 CSA 的架构不同。
   - 德尔塔是 classic local selector：action hash 和完整时间线硬编码在 `0.c/2.c`。
   - 瞬变是 external Param action-table：`0.c/2.c` 只有通用 runtime，具体 action row、motion、资源 hash、三相 callback key 来自 `chrsysparam.csyspm`。

4. 瞬变的持续照射不能通过“只复制 `func_946`”移植。
   - `func_946` 是 group/type `0x03` 的通用射击 wrapper。
   - 真正的机体差异来自瞬变 `chrsysparam` 对应行，以及 `func_983` 解析出的 entry/tick/cleanup 回调。
   - 用户提供的 `E:\XB\mod\041cpm\053gbftry_005tsient_001` 已补齐 Param 证据：CSA 是 table 0 row 2，action hash `0x12B9EDF7`，group `0x03`，且只创建一个 projectile `0x22A6450B`。

5. 推荐移植方向是“保留 Delta 输入入口，重写 Delta CSA action 内部”，而不是把 Delta 整机改造成 external-table 架构。

6. 原版瞬变的“主射 7 发”和“射击 CS”是两套弹药语义。
   - `armsparam` 的 GN Partisan 位于 slot 0，`ammoCount = 7`。
   - CSA row 的 field `0x03 = 0x0B`，公共 runtime 因而强制 `global681 = 5`，最终调用 `func_94(5)` / `func_95(5)`。
   - 所以原版 CSA 不扣 slot 0；Delta 当前 `func_94(0)` 是自定义的“CSA 消耗主射”行为，不是瞬变原版行为。

## 3. 瞬变 CSA 的输入链

瞬变的输入不是在 `2.c` 内直接检测按键，而是经过下列链路：

```text
持续按住射击并达到蓄力条件
  -> 0.c 蓄力子系统设置 global83 bit 0x800
  -> func_118() 返回 global83
  -> func_81(...) 保留/组合 0x800
  -> global48
  -> func_143() 调用 sys_41(...global48...)
  -> native action table 选择一个 chrsysparam row
  -> func_145(row, ...)
  -> field 0x2E 取得 action hash
  -> field 0x0A 取得 group/type
  -> 写入公共 action 请求
```

关键证据：

- `0.c:2654-2659`：蓄力计时有效时把 `0x800` 写入 `global83`。
- `0.c:2708-2711`：`0x800` 属于蓄力输入族，并压制后续 charge bits。
- `0.c:2120-2200`：`func_81` 把 `0x800` 合并进本帧 action mask。
- `0.c:3204-3207`：`func_118` 返回 `global83`。
- `0.c:3352-3396`：`func_143` 把 `global48` 等状态交给 `sys_41`，得到 action row。
- `0.c:3438-3453`：`func_145` 从 row 读取 action hash、group 和 route/flags。

这也说明 CSA 的蓄力时长和“射击蓄力是否启用”并不全在 `2.c`。它还受 armsparam 的 `chargeInputFlags`、stage 和 accumulate duration 控制。

## 4. 瞬变 `2.c` 的动态注册层

`func_849`（`2.c:25055-25090`）遍历 external action table：

```text
field 0x2E -> action hash
field 0x0A -> group/type
func_873(group) -> group callback
func_241(action hash, callback) -> 注册 action
```

它还为每一行注册三相回调：

```text
field 0x02 -> active/tick callback key
field 0x7C -> entry callback key
field 0x7D -> cleanup callback key
func_983(key) -> 具体 func_N
```

三者的调用位置已经闭环，不只是按字段顺序命名：

- `0x02` 注册到 runtime slot `0x10`，由 `func_912 -> func_862` 在动作运行期间反复调用，是 active/tick hook；
- `0x7C` 注册到 slot `0x11`，由各 action wrapper 内的 `func_863` 调用一次，是 action-entry hook；
- `0x7D` 注册到 slot `0x12`，由 `func_864/865` 在动作切换或清理时调用，是 cleanup hook。

`func_873` 的 group `0x03` 返回 `0x3AC0F`。MSC 脚本内 offset 加文件基址 `0x30` 后是十进制 `240703`，与 `2.txt` 的 `func_946` 入口完全一致。因此：

```text
group 0x03 -> func_946
```

这是直接的 offset-table 证据，不是仅靠函数顺序猜测。补充 Param 后，table 0 row 2 的 field `0x0A` 已确认等于 `0x03`，因此 `CSA row 2 -> group 0x03 -> func_946` 已闭环。

## 5. `func_946` 射击 runtime 的四段结构

### 5.1 action wrapper：`func_946`

位置：`2.c:27823-27862`

它完成：

- 清理上一动作：`func_864()`（有残留 action 时）。
- 初始化公共 ranged runtime：`func_586()`。
- 加载当前 external row：`func_874()`，内部最终走 `func_866..870`。
- 安装四个阶段 callback：
  - `global676 = func_948`
  - `global677 = func_949`
  - `global678 = func_950`
  - `global679 = func_951`
- 设置 slot/route/cancel 公共状态。
- 调用 `func_947` 进入 ranged driver。

### 5.2 driver：`func_947`

位置：`2.c:27864-27876`

它根据 `global24 & 0x2` 选择 `func_593()` 或 `func_599()`，随后运行公共 effect/cancel/action 调度。它不是发射点。

### 5.3 起手段：`func_948`

位置：`2.c:27878-27953`

主要职责：

- 第一次进入时初始化起手状态；row-specific entry callback 已在 wrapper 调用 `func_863()` 时执行，不在 `func_948` 内重复调用。
- 用 `global839/global909/global814` 选择并播放起手 motion。
- `global839` 来自 action row field `0x1C`；在 group `0x03` 中它被当前函数按 motion key 使用。
- 用 `global841 * 0x64` 作为阶段阈值。
- 设置起手阶段表现、瞄准、slot 可用性和取消标志。

### 5.4 持续照射/输出段：`func_949`

位置：`2.c:27955-28024`

这是最关键的一段：

- 播放持续段 motion：`func_894(global839, global909, global815, global841)`。
- 根据 action row 在最多五个位置发出资源：
  - `global843`（field `0x20`）
  - `global844`（field `0x21`）
  - `global845`（field `0x22`）
  - `global846`（field `0x23`）
  - `global847`（field `0x24`）
- 实际输出经 `func_220(slot, resource, alternate)`，最终是：

```c
sys_4F(0, slot, selectedResourceHash);
```

- `alternate` 值来自 fields `0x27..0x2A/0x63`，由 `global30 & 1` 选择。
- 这些资源是“一次建立后由 projectile/depiction 自身持续”的候选结构，不是 Delta 当前那种每隔固定时间重复 `sys_4F` 的弹幕循环。
- 随后设置 action 输出位、取消掩码，并等待配置时长或 motion 接近结束。

补齐 Param 后，这个 generic 的“最多五个”已收敛为 CSA row 只使用 field `0x20`，其余四个字段均为零。因此瞬变照射的关键不是“循环生成几十发弹”，而是：

```text
进入持续段一次
  -> 仅创建一次 projectile 0x22A6450B
  -> 由资源自身维持 beam 生命周期
  -> MSC 等待结束条件
```

### 5.5 替代/中断段：`func_950`

位置：`2.c:28026-28058`

它只保留部分资源/表现，设置 action 结束位并等待结束条件。它更像被打断、替代 phase 或短路径结束，不应直接当作正常照射主体。

### 5.6 收尾段：`func_951`

位置：`2.c:28060-28078`

它写入恢复 phase id，并在公共结束条件成立后执行结束/取消处理。row-specific cleanup callback 还会从 external row 的 field `0x7D` 经 `func_983` 进入机体专属函数。

## 6. 为什么 `func_983` 是理解 CSA 的必要部分

`func_983` 的真实语义是：

```text
phase callback hash -> MSC function
```

它当前被反编译成大型二分查找树，例如：

```c
if (0x76dcfdee == arg0)
{
    var1 = 0x406fc;
}
```

这里 `0x406FC` 不是普通参数。加 MSC 脚本基址 `0x30` 后，对应 `2.txt` 中某个 `func_N` 的入口。

对原始 `2.dscex` 运行现有 `--exvsPostprocess` 后，可恢复出 `138` 个 case，例如：

```c
case 0x76dcfdee:
    var1 = func_1002;
    break;
```

CSA 的 entry/tick/cleanup 行为可能完全位于这些回调中，所以不解析 `func_983` 会漏掉特效、临时状态、附加弹体和清理逻辑。

## 7. `func_983` 美化工具的确定缺陷

### 7.1 复现

测试命令：

```powershell
python tools/mscdec.py `
  "E:\XB\mod\040msc\053gbftry_005tsient_001\2.dscex" `
  -o "tmp\msc-csa-analysis\tsient-2-post.c" `
  -log "tmp\msc-csa-analysis\tsient-2-post.log" `
  --exvsPostprocess
```

结果：

- `func_983` 的 138 个 pointer case 均能被识别并替换为 `func_N`。
- 二分查找能被转换为 switch。
- 生成文件花括号不平衡：`6143` 个 `{`，`6144` 个 `}`。
- `msclang.py`/`pycparser` 编译失败。

### 7.2 根因

`tools/mscdec.py:1097-1099` 在看到 `return var1;` 时，把它当成目标函数结束行：

```python
if 'return var1;' in current_line:
    target_func_end_line = current_index
    break
```

随后 `convert_target_function_to_switch` 用一个自带完整 `}` 的新函数替换到 `return var1;` 为止，却把原函数最后一个 `}` 留在文件中，于是形成连续两个函数结束括号。

### 7.3 已实施的最小修复

1. 已删除 `return var1;` 的提前结束分支。
2. 现在只用 brace counting 确定函数真正结束行。
3. switch 生成后已验证：
   - 花括号平衡。
   - `pycparser` 可解析。
   - `msclang.py` 可编译。
   - case 数和原二分树等值比较数一致。
   - 每个函数指针满足 `storedOffset + 0x30 == 2.txt pointer`。

### 7.4 更稳妥的后续修复

当前实现仍依赖 `.c` 正则和 log 文本。长期应把“返回值是脚本函数指针”的识别放入 `msc_cfg.py`/AST 语义层，而不是继续为 `func_983` 的文本形状加特例。

建议测试 fixture 至少覆盖：

- 嵌套二分树 dispatcher。
- `var1 = raw script offset; return var1;`。
- 138-case 大函数。
- 找不到 offset 时明确报错并保持输出文件未修改，不伪造 `func_N`，也不静默留下指针。
- postprocess 输出可重新编译。

### 7.5 2026-08-03 工具修复结果

`mscdec.py` 现在会自动识别同时具有以下两个结构证据的新版 MSC：

- `sys_0(0x700000, 0, ..., 0xa)` 外部动作表读取；
- `sys_1(0x10001, 0x10, ..., resolver(...))` 动作回调分发。

命中后无需手写 `--exvsPostprocess`，会自动执行已证明的脚本函数引用恢复和 dispatcher switch 美化。保护边界如下：

- 只处理 `func_241` 回调参数、外部动作表 group resolver 的 `return 0x...`、以及 phase resolver 的 `var1 = 0x...`；
- 普通十六进制常量不按地址猜测；
- 已识别的指针槽若无法由反汇编 log 映射到 `func_N`，解编译明确失败，不生成半美化文件。

真实样本验证：

- 瞬变 `func_983`：138 cases，`0xD6FD54 -> func_1040`，解编译→回编译→再解编译后仍为 138 cases；
- G-Mecha 新版 dispatcher：121 cases；
- Hambrabi 新版 dispatcher：131 cases；
- 三个样本的美化输出均通过 `msclang.py` 回编译。

## 8. 德尔塔改当前 CSA 在做什么

入口：

```text
0.c global48 & 0x800
  -> action hash 0x700BB2C6
  -> 2.c ACTION_CHARGE_SHOT_LOCK_SWITCH
  -> func_920
  -> func_921 / func_922 / func_923
```

当前行为不是瞬变式单个持续 beam：

- `func_921`：起手 motion/effect、姿态和阶段计时。
- `func_922`：在大量硬编码时间点重复向 slot `5` 发出三族资源：
  - `0x574865F4`
  - `0x2AC4A5DF`
  - `0xB3CDF465`
- 同时旋转/更新一个表现对象，直到约 `0x1A90` 内部时间单位结束。
- `func_923`：收尾 motion/effect 和取消处理。

所以目标改造不是“增加 CSA”，而是“保留现有 CSA action 入口，替换其内部弹幕时间线为持续照射时间线”。

## 9. 两种移植方案

### 方案 A：语义移植到 Delta classic runtime（推荐）

保留：

- Delta `0.c` 的 `0x800 -> 0x700BB2C6`。
- Delta `2.c` 的 ranged runtime 和 action 注册方式。
- Delta 的普通/变形共同入口。

替换：

- `ACTION_CHARGE_SHOT_LOCK_SWITCH` 及其 `func_920..923` 内部阶段职责。
- 起手 motion、持续段 motion、beam 主体、附属 effect、结束/清理。

优点：

- 改动边界小。
- 不把 Delta 整机迁移到 external action-table。
- 容易保留当前 NITRO、浮游炮、变形和其他 AI patch。

前提：

- **已完成**：从 `E:\XB\mod\041cpm\053gbftry_005tsient_001\chrsysparam.csyspm` 确定 CSA row 及其 callback/projectile 参数。
- 提取/迁移 Motion `0x9A0DB96A` 中对应动作。
- 提取/迁移 Effect `0x4F90042E` 和相关 bullet/depiction 资源。
- 若要忠实复刻原版，CSA 使用虚拟 slot 5，不扣 slot 0 的 7 发主射；只有明确要做自定义玩法时才保留 `func_94(0)`。

### 方案 B：把 external action row/runtime 一起搬进 Delta（不推荐）

这要求引入 `0x700000/1/2` action table、`func_849/873/983`、三相 callback 注册和配套 Param 表。

风险：

- Delta 当前是 classic selector，架构不兼容。
- 容易破坏整台机体其他 action 注册。
- 对 Param、MSC、输入和资源的耦合远大于一个 CSA 动作的需求。

## 10. 推荐实施顺序

1. **已完成**：修复 `mscdec.py` 的 `func_983` switch 边界错误并加回归测试。
2. **已完成**：重新反编译瞬变 `2.dscex`，得到可编译的 `func_983` switch 版本。
3. **已完成**：解析 Param `0x6B5B0CE0`，用 `research_chrsysparam_action_report.py` / human export 工具定位：
   - input mask 含 `0x800` 的 CSA row；
   - group `0x03`；
   - fields `0x1C..0x24`；
   - fields `0x7C/0x02/0x7D` 三相 callback key。
4. **已完成**：经 `func_983` 把三相 key 闭环到 `func_987/988/989`，并追踪 `sys_4F/sys_4A/sys_58`。
5. **部分完成**：已建立 Param/MSC 资源清单；仍需取得实际 Motion/Effect/Sound 归档后验证资源可直接跨机体使用。
6. 在 Delta `ACTION_A_CHARGE_SHOT` 中按“起手 / 持续 / 中断 / 收尾”四段重写，使用最小 AI 修改块。
7. 重新编译到 `tmp/`，验证：
   - MSC AI block 检查通过。
   - 无 `TODO/FIXME`。
   - `msclang.py` 编译通过。
   - action hash `0x700BB2C6` 仍从普通和变形两条 `0.c` 分支可达。
   - beam 只创建一次，结束/取消时可靠清理。
   - ammo 消耗与设计的“7 发”一致。

## 11. 当前缺失证据与下一次确认点

Param 缺口已经关闭。当前仍缺的是实际表现资源归档：

- Motion：`0x9A0DB96A`
- Effect：`0x4F90042E`
- 如要完整复刻声音：Sound `0x748F2C70`

即使暂时没有这些归档，MSC 与 Param 已足以确定动作结构、时间线、callback 和发射的 bullet key；但不能确认瞬变 motion/effect 是否能在 Delta 骨架与资源命名空间中原样使用。

玩法语义也已经由原版 Param 解决：忠实复刻时，保留 `0x800` 系统 CSA并使用 slot 5，不扣 slot 0 的 7 发普通主射。若用户仍希望“每次 CSA 消耗一发主射”，可以保留 Delta 的 `func_94(0)`，但应明确标成自定义变体。

## 12. 美化后的确定调用链

完成函数指针恢复后，瞬变的动作框架可以写成以下闭环：

```text
0.c func_143
  -> sys_41(...) 根据输入/状态选择 external action row
  -> func_145(row, route, flags)
     -> row[0x2E] action hash
     -> row[0x0A] group/type
     -> func_95(action hash, route0, route1, input class)

2.c func_849（初始化时）
  -> func_873(row[0x0A])
     -> group 0x03 => func_946
  -> func_241(row[0x2E], func_946)

动作开始
  -> func_946 wrapper
     -> func_864：清理上一 action（如有）
     -> func_874/866..870：把 row fields 装载到 global798..912
     -> func_863：调用 row[0x7C] entry hook
     -> callFunc3(func_947)

每帧
  -> func_947
     -> 地面/空中公共 movement driver
     -> func_886：按 row 配置开放 cancel/input mask
     -> func_912
        -> func_862：调用 row[0x02] active/tick hook
        -> 四阶段 global676..679 状态机

退出/切换
  -> func_864/865
     -> row[0x7D] cleanup hook
```

这说明 `func_983` 的 138 个 case 是“回调 key -> 函数”的字典，并不等于 138 个 action。一个 action row 最多引用其中三个 key。

## 13. 瞬变射击 runtime 的 Param 字段消费表

下面只记录能从 `2.c` 直接看到的消费方式，不给未知字段强行命名：

| Row field | Runtime global | 消费位置 | 已证明用途 |
|---|---:|---|---|
| `0x02` | callback slot `0x10` | `func_862` | 每帧 active/tick hook |
| `0x03` | `global821` | `func_866/879` | input/action class；`0x0B/0x0C` 时强制使用 slot 5 |
| `0x08` | `global820` | `func_866` | 默认 weapon slot |
| `0x0A` | `global811` | `func_873` | action group/type |
| `0x1C` | `global839` | `func_948/949` | 主 motion hash |
| `0x1D` | `global840` | `func_615` | 公共射击/瞄准参数输入 |
| `0x1E` | `global841` | `func_948/949` | 起手阈值及持续 motion 起点 |
| `0x1F` | `global842` | `func_949` | 持续段公共时长/状态输入 |
| `0x20..0x24` | `global843..847` | `func_949/950` | 最多五个 projectile/effect resource hash |
| `0x25` | `global848` | `func_949` | 资源是否改投到 slot 5 |
| `0x26` | `global849` | `func_948` | 起手速度/时间缩放输入 |
| `0x27..0x2A`、`0x63` | `global850..853/907` | `func_220` | alternate resource hash |
| `0x64` | `global908` | `func_946` | motion 选择条件输入 |
| `0x65` | `global909` | `func_894/895` | alternate motion hash |
| `0x66` | `global910` | `func_949/950` | 明确结束阈值；不大于起手阈值时改用 motion 结束判定 |
| `0x67` | `global911` | `func_946` | 公共射击状态开关 |
| `0x6E` | `global912` | `func_946` | 公共 route/状态开关 |
| `0x7C` | callback slot `0x11` | `func_863` | action-entry hook |
| `0x7D` | callback slot `0x12` | `func_864/865` | cleanup hook |

`func_949` 对 `0x20..0x24` 的处理全部位于 `global240 == 0` 的首次进入分支，因此每个非零资源只创建一次。持续照射的寿命、连续判定和外观主要由 `Laser` projectile/depiction 资源负责，而不是靠 MSC 每帧重复创建。

## 14. 德尔塔改当前 CSA 与瞬变结构的逐项差异

德尔塔当前入口已经完整，不需要改 `0.c`：

```text
普通形态 0.c:3421-3424  global48 & 0x800 -> 0x700BB2C6
变形形态 0.c:3375-3378  global48 & 0x800 -> 0x700BB2C6
2.c:29613               0x700BB2C6 -> ACTION_CHARGE_SHOT_LOCK_SWITCH
```

当前 `ACTION_CHARGE_SHOT_LOCK_SWITCH` 是 classic 四阶段 runtime：

| 阶段 | Delta 函数 | 当前行为 | 与瞬变目标的差异 |
|---|---|---|---|
| wrapper | `ACTION_CHARGE_SHOT_LOCK_SWITCH` | 安装 `func_921/922/0/923` | 架构可保留 |
| driver | `func_920` | `func_593()` 足止 driver | 与“足止照射”一致，可保留 |
| 起手 | `func_921` | motion `0x216B6EC6`；约 `0x834` 进入下一段 | 可保留设计姿态，也可换瞬变 motion |
| 弹药 | `func_921` | `func_94(0)` | 与瞬变原版不同；原版由 action class `0x0B` 强制走 slot 5，不扣 slot 0 |
| 输出 | `func_922` | 三组 hash 按大量时间点重复 `sys_4F(0, 5, ...)` | 这是弹幕时间线，不是持续 beam，必须重写 |
| 朝向表现 | `func_922` | 持续修改 `0x689C17F5/0x950BF0D6` 旋转 | 瞬变不可弯射语义下不应保留整套旋转循环 |
| 收尾 | `func_923` | motion/effect、恢复与结束 | 可作为清理骨架，但需补 beam/effect 的可靠清除 |

三组需要删除或停用的旧弹幕 hash：

- `0x574865F4`
- `0x2AC4A5DF`
- `0xB3CDF465`

它们当前从约 `0x898` 到 `0x17D4` 被反复创建，不能通过“把其中一个 hash 换成 Laser”得到正确照射；那样会重复创建多条 beam。

## 15. 推荐移植设计：保留 Delta classic runtime，语义复刻瞬变

这是当前证据下风险最低的方案。不要把 `func_849/873/983` 和 `global798..912` 整套搬进 Delta。

### 15.1 wrapper/driver

- 保留 action hash `0x700BB2C6`。
- 保留 `ACTION_CHARGE_SHOT_LOCK_SWITCH -> func_920`。
- 保留 `func_593()` 足止 driver。
- `global678` 可继续为 `0`，除非实测需要单独的受击/替代 phase。

### 15.2 起手 `func_921`

- 保留或替换为最终选定的设计姿态 motion。
- 保留只执行一次的瞄准、camera、effect 初始化。
- 忠实复刻瞬变时，把 `func_94(0)` 改为与原版等价的 slot 5 通知，或在确认公共状态无需它后移除；不能继续把它解释为“瞬变 CSA 的 7 发弹药”。
- 若用户明确要求“每次 CSA 扣一发主射”，才保留 `func_94(0)`，并把它记录为 Delta 自定义玩法。

### 15.3 持续段 `func_922`

- 删除三组旧弹幕的全部定时 `sys_4F`。
- 在 `global240 == 0` 首次进入分支中只创建一次：
  - 瞬变 CSA 的唯一 projectile `0x22A6450B`；
  - 原 row 的 `0x21..0x24` 全为零，不应虚构或追加四个附属 projectile。
- 播放持续段 motion，并维持到选定结束阈值。
- 删除旧弹幕专用的持续旋转循环；只保留首次锁定/朝向初始化，符合“足止、不可弯射”的目标。
- 不在每帧重建 beam。

### 15.4 收尾 `func_923`

- 进入时停止持续 motion/effect。
- 对非自动销毁的 beam/effect 执行明确清理。
- 恢复 camera/锁定/取消状态。
- 保留 `global252`、`global212` 等 classic runtime 所需结束信号。

## 16. Param 补齐后的确定值

`E:\XB\mod\041cpm\053gbftry_005tsient_001\chrsysparam.csyspm` 的 table 0 row 2 是 CSA 行。直接关联链为：

```text
input/action class 0x0B
  -> table 0 row 2
  -> action hash 0x12B9EDF7
  -> group 0x03
  -> func_946
```

与移植直接相关的非零字段：

| Field | Value | 已闭环用途 |
|---|---:|---|
| `0x02` | `0x07AD3164` | active/tick key -> `func_988` |
| `0x03` | `0x0000000B` | action class；强制 runtime 使用 slot 5 |
| `0x0A` | `0x00000003` | group -> `func_946` |
| `0x0E` | `0x00000008` | 公共射击配置值，装入 `global825` |
| `0x0F` | `0x2FC59B65` | phase 2 调度的 `sys_58(0x9, ...)` 声音；Delta 当前 CSA 已复用同一 hash |
| `0x10` | `0x00000002` | 上述声音的触发 phase |
| `0x1C` | `0x02FBB259` | 主 motion hash |
| `0x1D` | `0x0000001F` | `func_615` 公共射击/瞄准参数 |
| `0x1E` | `0x00000020` | 起手阈值 32 |
| `0x1F` | `0x00000096` | 持续段值 150 |
| `0x20` | `0x22A6450B` | 唯一 projectile；`func_220 -> sys_4F(0, 5, ...)` |
| `0x21..0x24` | `0` | 没有附属 projectile |
| `0x2E` | `0x12B9EDF7` | action hash |
| `0x44..0x46` | `100,100,100` | 公共表现 scale |
| `0x6F` | `7` | 当前仅记录原值，不强行命名 |
| `0x70` | `15` | 当前仅记录原值，不强行命名 |
| `0x7C` | `0x87B18C50` | entry key -> `func_987` |
| `0x7D` | `0x0029909F` | cleanup key -> `func_989` |

### 16.1 三相 callback 的真实行为

- `func_987`（entry）：设置 `global452 = 100`、`global453 = 95`、`global454 = 95`。
- `func_988`（active/tick）：
  - 首帧配置两组 `sys_4B` 表现状态，并调用 `func_1180(0, 6)`；
  - phase 0 持续 `func_166(3, -2, 0)`；在阈值 `0x12C` 切换表现并播放 `0x3BEA680C`；在 `0x3E8` 调用 `sys_4A(0, 0xCA7188DC, 0x0DDF1A4E, 0xF0FCD65E, 7, 0)`；
  - phase 1 入口清理 slot 7 的 `sys_4A` 对象、设置 `sys_46(1,4,...)` 并停声；
  - phase 2 入口执行 `sys_4E(0)`，随后恢复表现状态。
- `func_989`（cleanup）：`sys_4E(0)` 并调用 `func_1181(0, 6)`，保证中断时恢复表现。

这里不把 `sys_4A(0, 0xCA7188DC, ...)` 简化命名为“特效”。它的后两个 hash `0x0DDF1A4E`、`0xF0FCD65E` 与 `0x22A6450B` bulletparam 的两个字段完全相同，证明它和 beam 的表现/判定配置相关；但当前 native syscall 证据还不足以给 `0xCA7188DC` 强行命名。

### 16.2 projectile Param 证据

`bulletparam.bin` 存在 entry `0x22A6450B`：

- `bulletActionHash = 0x4CED589A`
- `lifetime = 90`
- `maxRange = 2000`
- `maxDistance = 3000`
- `initialSpeed = 12`
- `turnRate = 10`
- `onExpireHash = 0xC5F58F99`
- 与 callback 共用的两个值：`0x0DDF1A4E`、`0xF0FCD65E`

`projectile_depiction_table.bin` 中 `0xC5F58F99` 对应的消失/表现行还会引用 `mainEffectHash = 0xE8D5BFD1`。另一方面，`0xA3661F61` 在本机 `interactionid.bin` 中对应一条 29 damage、50 down、最多 12 hit 的 interaction 行。由于当前 bullet 字段的历史名称存在已知证据边界，移植时应按“原值组合”搬运，不应仅凭旧字段名判断它们属于 depiction 还是 interaction。

### 16.3 armsparam 与弹药语义

`armsparam.bin` 也排除了“原版 CSA 消耗 7 发主射”的解释：

- GN Partisan 是 slot 0，`ammoCount = 7`、`initialAmmoCount = 7`；
- 它启用 charge input，默认蓄力 150 frame、base 120 frame；
- 但 CSA row 的 action class `0x0B` 让 `func_866` 强制 `global681 = 5`，`func_948` 随后调用 slot 5；
- 所以 7 发是普通主射库存，CSA 是独立的系统蓄力动作。

### 16.4 仍然缺少的资源

现在已经可以无猜测填写 row、callback 和 projectile key；仍需取得或提取：

- Motion `0x9A0DB96A`：验证 motion `0x02FBB259` 能否直接给 Delta 使用；
- Effect `0x4F90042E`：补齐 `0xCA7188DC`、`0xE8D5BFD1` 等实际表现资源；
- Sound `0x748F2C70`：若要完整复刻 `0x2FC59B65`、`0x3BEA680C`。

在这些归档未迁移前，可以先做“状态机和判定结构相同”的版本，但完整视觉/声音复刻仍不能保证。
