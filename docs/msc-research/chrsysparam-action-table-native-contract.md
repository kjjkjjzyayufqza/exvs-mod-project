# chrsysparam.csyspm 动作表：native 契约、人类视角映射与编辑规则

**Date:** 2026-09-19
**Kind:** 跨机体 MSC / Param 桥接 + 引擎 ABI + 工具链契约
**Status:** E2 容器格式 / native 消费者（IDA OB v27 + 12 份 vanilla 互证）；E1 脚本侧字段消费者（FA Unicorn 2.c）；行为级结论一律 E0 待实机。

分段标注：

| 结论域 | 等级 | 依据 |
|--------|------|------|
| 容器格式、cell 寻址、加载器校验 | **E2** | OB v27 `vsac27_Release.exe` IDA：`sub_14066C890` / `sub_14066C880` / `sub_14066C8B0` / `sub_14066C900` / `sub_140635B30` |
| `sys_0(0x700000..0x700003)` 语义 | **E2** | IDA `sub_1406958A0` 及其被调用者 |
| `sys_41` 指令表构建 / 输入判定 | **E2** | IDA `sub_14067AE10`（引擎自带符号 `fnc_Bscr_ChrsysCommandChecker`）、`sub_140665A10`、`sub_140665ED0`、`sub_1406652E0` |
| 0x700002 route/flags 54 组常量表 | **E2** | IDA `sub_140695450` 栈常量复原，并与旧 B4AC `func_786` 公式 9 组逐一吻合 |
| 脚本侧注册/相位/行加载 写法 | **E2** | 12 份本地 vanilla 新世代 2.c 结构一致（工具批量验证 0 错误） |
| 单个 archetype 参数列（0x0B..0x67）的业务含义 | **E1** | 仅从 FA Unicorn 2.c 读到消费者，未实机 |
| 任何"改了会怎样"的玩家行为 | **E0/待实机** | 本页不给行为级结论 |

**Sources（只读）:**

```text
Param  E:\XB\mod\041cpm\015gndmuc_008faunig_001\chrsysparam.csyspm   (49216 B, unit 15008001)
Msc    E:\XB\mod\040msc\015gndmuc_008faunig_001\{0.c,2.c,2.txt}
Binary E:\OBHK0.3_v27\vsac27_Release.exe  (IDA, base 0x140000000)
批量   E:\XB\mod\041cpm\**\chrsysparam.csyspm (50 份) + 12 份配对新世代 MSC
```

**Related:**

- 世代分类：[msc-generation-param-bridge-comparison](./msc-generation-param-bridge-comparison.md)
- 输入边界：[0c-to-2c-input-action-boundary](./0c-to-2c-input-action-boundary.md)
- 证据协议：[msc-evidence-grade-and-ingame-audit-protocol](./msc-evidence-grade-and-ingame-audit-protocol.md)

---

## 1. 一句话

"新脚本"型 MSC 把**动作注册表搬出了脚本**：`chrsysparam.csyspm` 的 table0 是一张 `N x 128`
的 u32 动作矩阵，引擎用它把**输入**解析成**行号**，脚本再用行号取出 action hash、archetype
group 和三个相位函数键，于是 `0.c` 不再有 if-chain、`2.c` 不再有硬编码 `func_241` 列表。
**行是数据，行为仍在 2.c**；一行只有指到 2.c 里真实存在的函数键时才会做事。

## 2. 怎么判断一台机体是不是"新脚本"

| 判据 | 新脚本（external action table） | 经典本地 selector |
|------|--------------------------------|-------------------|
| `chrsysparam.csyspm` 大小 | table0 `N x 128`（本地样本 26..96 行） | 68 B，两张 1x1 空表 |
| `0.c` | `sys_41(0x1, global48, global2, ...)` 取行号 | `func_143` if-chain 直接选 hash |
| `2.c` | 有 `sys_0(0x700001, 0)` 注册循环 | 无任何 `0x7000xx` |
| 动作数量上限 | 128 条指令记录（引擎硬上限） | 由脚本长度决定 |

本地 50 份 `chrsysparam.csyspm` 中 21 份是大表、29 份是 68 B 退化表；两种世代在 OB v27
同时存在且都被引擎接受。

## 3. 容器格式（E2）

```text
0x00 u32 magic   0xB4ACACAF   loader 校验（sub_14066C890）
0x04 u32 version 0x00010000   loader 校验（sub_14066C880）
0x08 u32 unit id (Character ID, 例 15008001)   引擎不读
0x0C u32 reserved (0)
0x10 u32 table count (恒为 2)                  引擎不读
0x14 u32 -> table0 (action,     marker 0xA8BBBAB9)
0x18 u32 -> table1 (transition, marker 0xA8BAA9BA)

table = { u32 marker, u32 rows, u32 columns, u32 reserved, u32 cells[rows*columns] }
cell(row, field) = table + 0x10 + 4 * (row * columns + field)
```

要点：

1. **field 下标 = 列下标（0 基）**，没有任何偏移。`sub_14066C8B0` 直接算
   `4*(field + row*columns)`；越界返回 0 而不是崩溃。
   （更正：早期 Hambrabi 笔记写的 "column = field+1" 只是当时的列计数口径，不是引擎行为。）
2. 加载器 `sub_140635B30` 只校验 magic + version，**不校验 unit id、表数量、行列数**。
   magic/version 不对 → 指针不入座 → `0x700001` 恒返回 0 → 整机没有任何可输入动作。
3. 本地 50 份样本布局完全规范：table0 紧跟 0x1C 头、table1 紧跟 table0、文件无尾随字节。
   仓库解析器按此严格校验，任何偏差直接报错而不是猜测。
4. table1 启用时是 `N x 35`（本地最大 71 行）；未启用时 1x1。

## 4. native 消费者全景（E2）

### 4.1 `sys_0` 家族（`sub_1406958A0`）

| 调用 | 行为 |
|------|------|
| `sys_0(0x700000, table, row, field)` | 读一个 cell；table 0=动作表 1=转移表 |
| `sys_0(0x700001, table)` | 返回该表 rows |
| `sys_0(0x700002, group, sub, row[, flag])` | sub=0 取 route，sub=1 取 flags（见 4.3） |
| `sys_0(0x700003, actionHash, 1 << form)` | 按 hash 反查行号（见 4.4） |
| `sys_1(0x7xxxxx, ...)` | **空桩**（`xor eax,eax; ret`）——脚本无法在运行时写表 |

### 4.2 `sys_41` = `CMotionScriptService::fnc_Bscr_ChrsysCommandChecker`

引擎自带符号。`0.c` 用两个子命令：

- `sys_41(0, 4)`（所有本地新世代 0.c 都是这一句）：把 table0 的 **1..N-1 行**压成
  **最多 0x80 = 128 条** 17-dword 指令记录，再排序建索引。**行 0 永远被跳过。**
- `sys_41(1, global48, global2, func_123(), global20, func_97(0x71), <cond>, global28|global29, global30, global11)`：
  按当前输入遍历记录，返回命中的**行号**。

指令记录的取值（`sub_140665A10`）：

| record | 来源 | 说明 |
|--------|------|------|
| r0 | 行号 | 返回值 |
| r1 | `1 << (f03 % 100)`（f03==300 → 0x2000） | 按钮位 |
| r2/r3 | f04 归一化 | 方向 / 条件 |
| r4 | `f03/f08/f09/f10` 组合出的标志字 | 见下 |
| r5 | `f03/100 + 1` | 蓄力段位 |
| r6 | `1<<f01 \| 1<<f104..109` | 形态掩码，**0 = 所有形态** |
| r7..r10 | f05 / f06 / f07 / (f04==71) | 状态门 |
| r11/r12 | f08 归一化 | 武装槽 |
| r13 | **f0x2E action hash** | 反查键 |
| r14/r15/r16 | f0x42 / f0x70 / f0x6F | 资源门 + 两个未定位消费者 |

`r4` 标志位：bit0 = **可被输入选中**（`f03 != 400 && f03%100 != 31 && f10 != 39`）；
0x10/0x20/0x40/0x80 = `f03%100` 为 1/10/11/12；0x100/0x800 = 武装槽门；0x200/0x400/0x1000 =
空弹策略（f09）。**排序后只遍历 bit0 为真的记录**，所以 `f03=31/400`、`group=0x27` 的行
永远不可能被摇杆/按钮直接选中，只能走派生或脚本。

排序（`sub_140665ED0` + `sub_140666510`）优先级：可输入 > f04≥100 条件行 > 有方向要求的行 >
`f04==71` > 行号小者。**同一按钮下方向行天然排在中立行前面**，所以不需要在数据里做优先级。

输入判定（`sub_1406652E0`）逐项过滤：禁用集 0x1E → 形态掩码 → 地空掩码 f06 → 按住判定 f07
→ f42 资源 → 按钮位 f03 → 条件 f04-100 → 方向（格斗行改读 `global48` 的方向键位）→ f05
状态 → 蓄力段位 → 弹药（`sub_1406662C0/3A0`）→ 每帧抑制集 0x1F。返回值三种：

```text
row                      正常命中
row(slot) | 0x10000000   命中但弹药空/上锁：0.c 走 func_98 空枪路径
0x20000000               本帧被抑制集 0x1F 挡下：0.c 直接 return
```

### 4.3 route/flags 常量表（`sub_140695450`，54 组）

`sys_0(0x700002, group, 0, row)` = 组常量 route；
`sys_0(0x700002, group, 1, row)` = `选中的组 flags | 基值 | 0x400?`，其中

```text
基值   = (field 0x03 > 300) ? 0x200 : 0x20000
0x400  = (field 0x2C != 0)
选中值 = (field 0x6E != 0 && 该组有 alt) ? alt : 主 flags
```

54 组常量已完整复原并写进 `chrsysparam_schema.rs::ROUTE_TABLE`（与旧 embedded B4AC
`func_786` 能覆盖的 9 组逐一吻合）。**group ≥ 0x36 会越过表尾读栈**——引擎没有边界检查，
所以编辑器把它判为错误。

### 4.4 `0x700003` 派生反查（`sub_140665930`）

遍历指令记录：`record.r13 == key` 且（`r6 == 0` 或 `r6 & (1<<form)`）且 **hash 不在禁用集
0x1E** 时记下 `r0`；循环不提前退出，所以**重复 hash 取最后一条**。找不到返回 -1。

### 4.5 两个集合

| 集合 | 写入者 | 作用 |
|------|--------|------|
| `0x1E` | `0.c func_150/151`、`2.c` | 持久禁用动作；输入与派生反查都跳过 |
| `0x1F` | `2.c`，每帧 `sys_1(0x10006,0x1f)` 清空 | 本帧抑制；值为 0 → 输入返回 0x20000000 |

## 5. 人类视角：一行数据到底指挥了什么

读一行时按这条链读，四段都能在文件里落地：

```text
[0.c 输入]                      [chrsysparam 行]                [2.c 脚本]                 [后续]
按钮位  f03%100          ->    行号 = sys_41(1, ...)      ->   func_241(f2E, 组ENTER)  ->  派生 f30..f39
方向    f04              ->    f2E action hash                 slot 0x11 = f7C ENTER       延迟 f59..f62
形态    f01/f68..f6D     ->    f0A archetype group             slot 0x10 = f02 TICK        转移 f7E..f7F
武装    f08/f09          ->    route/flags (0x700002)          slot 0x12 = f7D EXIT
```

以 **全装备独角兽 (15008001)** 为例（E1，脚本读取 + 工具复核）：

- 2.c `func_285` 是注册循环，`func_309` 是 group→ENTER 解析器（15 个 case），
  `func_437` 是相位解析器（275 个 case），`func_311` 是取 cell 的包装。
- 行装载 `func_303/304/305/306` 把 0x02..0x7F 几乎所有列塞进 `global501..global611`，
  所以"某一列具体是什么"要看**该组的 ENTER/相位函数怎么用那个 global**。
- 三个相位槽的时机（读 `func_298/299/300/301`）：
  **f7C = ENTER**（同时应用 f2D 摇杆混合、f56 的 `sys_4C(0x8,…)`）、
  **f02 = 每帧 TICK**、**f7D = EXIT/中断**。
- 行 88：`f03=10`（觉醒技 0x400）、`f01=0` 且 `f68=1,f69=2` → 三形态通用，
  group 0x0D → `func_382`，钩子 `func_1242/1243/1244`，派生行 89（10 帧后）。
- 形态分层一目了然：`f01=0` 全装甲、`f01=1` 装甲排除、`f01=2` NT-D；
  行 49..52 是 NT-D 专属、带 `f42=1` 资源门、三个相位键为 0（纯 group 行为）。

### 5.1 从一行找到老写法的 START / SHOOT / NO_AMMO / END（E1）

新世代没有取消四相位，只是把它藏进了 **group 的 ENTER 函数**。三步：

1. 在表里筛出目标行（`commandType % 100` = 按钮位，`formIndex` = 形态）；
2. 读该行 `archetypeGroup`，在 2.c 的 group 解析器里取 ENTER 函数；
3. 在 ENTER 函数里找这四个赋值，它们就是四相位：

```text
global670 = START      global646 = SHOOT
global661 = NO_AMMO    global671 = END
```

相位 id 常量不变：`0x44D` start / `0x44E` shoot / `0x44F` no_ammo / `0x450` end
（写进 `global505/global506`）。行自带的 `0x7C / 0x02 / 0x7D` 三个钩子是**这一行专属**的
ENTER / 每帧 / EXIT，与四相位并存，不是替代关系。

FA Unicorn (15008001) 的实测结果，特格（`commandType % 100 == 9`）：

| 形态 | 行 | group | ENTER | START | SHOOT | NO_AMMO | END | 行钩子 enter/tick/exit |
|---|---|---|---|---|---|---|---|---|
| 0 全装甲 | 9 (N) / 10 (方向) | `0x35` | `func_418` | `func_420` | `func_421` | `func_422` | `func_423` | `func_1029/1030/1031` |
| 1 装甲排除 | 24 (N) / 25 (方向) | `0x35` | `func_418` | 同上 | 同上 | 同上 | 同上 | 同上 |
| 2 NT-D | 49..52 | `0x26` | `func_359` → `func_350` | 无 | `func_1311` | 未设 | 无 | 无（字段为 0）|
| 0（另一条） | 7 | `0x1F` | `func_356` | 非四相位原型（`global653/654/655`） | | | | `func_1032/1033/1034` |

两个要点：

- group `0x35` 的 SHOOT `func_421` 里是 `sys_51(0x20000, 0, 0x2, global540, global541)`，即**独立援护召唤**；
  `global540 = field 0x1E`、`global541 = field 0x1F`。FA Unicorn 这四行 `0x1E = 0`，
  `0x1F` = `8`（N）/ `9`（方向）——改援护就是改这一格。
- group `0x26` 的 ENTER `func_350` 是 `func_437(global538)` 再直接调用，也就是**把 field `0x1C` 当函数键**
  （NEXA-N 同款）。NT-D 特格的 `0x1C = 0xBF4422AE` → `func_1308`，它自己再装 `global646 = func_1311`。
  所以同一列在不同 group 里可能是动作 hash，也可能是函数键。

## 6. 字段表

### 6.1 table0（动作表，128 列）

| 列 | 名称 | 等级 | 含义 |
|---|------|------|------|
| 0x01 | formIndex | E2 | 形态位 `1<<v`；与 0x68..0x6D 合并；无位 = 所有形态 |
| 0x02 | phaseTickKey | E2 | 相位解析器键 → 每帧 TICK |
| 0x03 | commandType | E2 | `%100` = global48 按钮位下标；31/400 不可输入；300 觉醒；`/100+1` 蓄力段；>300 改基 flags |
| 0x04 | leverMask | E2 | 普通行 = global2 杆位（0x04前 0x08后 0x10左 0x20右）；格斗行改映射到方向键位；≥100 条件；71 特殊；派生行存 0x40..0x46 调度类 |
| 0x05/0x06/0x07 | 状态门 | E2（结构）/E0（语义） | 对应 record r7/r8/r9 |
| 0x08 | armsSlot | E2 | 0..4 槽，5 = 不查弹；≥100 走 reload 门 |
| 0x09 | emptyAmmoPolicy | E2 | 1 空弹转空枪路径；2 直接忽略；3 含上锁 |
| 0x0A | archetypeGroup | E2 | 0x700002 组 + 2.c ENTER；必须 ≤ 0x35；39 不可输入 |
| 0x0B..0x2B | archetype 参数 | E1 | 由组决定；常见：0x1C/0x1D 动作 hash（`sys_47(0x2)`），0x1E..0x22 时间点/弹 hash（`sys_47(0xF)`/`sys_4F`），0x25..0x27 `sys_46(0x2)` 位移 |
| 0x2C | routeFlag400 | E2 | 非 0 给 flags 加 0x400 |
| 0x2D | steeringMix | E1 | ENTER 摇杆混合：0 默认 / 负 = 不可转向 / 正 = 加强 |
| 0x2E | actionHash | E2 | 唯一键；`func_241`、hash→row 映射、`0x700003` |
| 0x30..0x39 | derivedActionHash0..9 | E2 | 派生链；配 0x59..0x62 的帧延迟 |
| 0x42 | requiresResource42 | E2（结构） | 资源为空时该行被拒 |
| 0x44..0x46 | motionTuning | E1 | `sys_46(0x5, ...)`；负值装载时变 100 |
| 0x56 | enterPoseLayer | E1 | ENTER 的 `sys_4C(0x8, v)` |
| 0x59..0x62 | derivedDelay0..9 | E1 | 派生延迟帧 |
| 0x68..0x6D | extraFormIndex0..5 | E2 | 追加形态位，-1 未用 |
| 0x6E | routeAltSelector | E2 | 选 0x1B/0x1E/0x1F/0x20 组的 alt flags |
| 0x6F/0x70 | 指令记录 r16/r15 | E2（拷贝）/E0（语义） | 消费者未定位，保持工作行的值 |
| 0x7C / 0x7D | phaseEnterKey / phaseExitKey | E2 | ENTER / EXIT 钩子 |
| 0x7E / 0x7F | transitionRangeFirst/Last | E1 | table1 行区间（0 基，-1 为无） |

### 6.2 table1（转移表，35 列，E2 跨 3 机体一致）

`0x01/0x1F..0x22` 源 action hash、`0x02` 状态、`0x04/0x05` 返回值、`0x06` 模式、
`0x1C` 判定函数键、`0x1D/0x1E` 时间窗。

## 7. 编辑规则（能改什么、改了要同步什么）

**纯数据改（不动 2.c）**：按钮/方向/形态归属、武装槽与空弹策略、派生链目标与延迟、
摇杆混合、archetype 参数值、复制一行做"同招不同方向/形态"。

**必须同时改 2.c**：

| 改动 | 需要的脚本配套 |
|------|----------------|
| 新增行并要求新行为 | 相位键要能在相位解析器命中：新写函数 + 新 case，或复用现成键 |
| 改 `archetypeGroup` | 目标组必须在 group 解析器里有 ENTER（否则 `func_241(hash, 0)`，可输入行会变哑弹） |
| 改 `actionHash` | 其它行的派生键、脚本里对该 hash 的显式引用都要跟着改 |
| 删除行 | 任何把该行 hash 当派生目标的行必须先断开（工具会拦） |

**硬约束（引擎给的，工具全部做成校验）**：

1. 行 0 保留；动作行最多 **128** 条（第 129 行起不会进指令表）。
2. `actionHash` 非 0 且唯一（重复时 hash→row 映射只留最后一条）。
3. `archetypeGroup ≤ 0x35`。
4. 派生 hash 必须存在某一行；跨形态派生会被警告（`0x700003` 按当前形态过滤）。
5. `0x7E/0x7F` 要么同为 -1，要么是 table1 的合法闭区间。
6. 相位键必须能在 2.c 相位解析器里解析。
7. 行号只在运行期由 hash 映射/`0x700003` 得到，**脚本里没有硬编码行号**（FA Unicorn 已核
   对），所以增删行不会打乱脚本；但删除 table1 行会移动区间，需要重映射（工具自动处理）。

## 8. 能不能在"新版本 MSC"里退回旧写法？

分三层回答：

1. **引擎层：可以。** OB v27 同时接受两种世代，经典 selector 机体本身就带 68 B 退化
   `chrsysparam`。把一台机体整体改回经典写法（`0.c` if-chain + `2.c` 固定 `func_241`
   注册 + 68 B 表）在引擎看来完全合法。
2. **脚本层：代价是重写 2.c。** 新世代 2.c 的 archetype 函数全部通过
   `func_311(global496, field)` 取当前行参数；表空了这些参数读回 0，招式会变成空动作。
   所以"只删表、留 2.c"是行不通的——要退回旧写法就得把每个 archetype 的参数改写成字面量，
   等于把动作表内联进脚本（这正是旧 MBON `sys_2D/sys_2C` embedded B4AC 做的事）。
3. **混合层：推荐做法。** 保留表驱动的原生动作，另外用经典手法加"自制招"：
   `0.c` 里在 `sys_41` 之外补 if-chain 调 `func_95(自制hash, route, flags, cat)`，
   `2.c` 里 `func_241(自制hash, 回调)` 自注册（未知 depiction id 会走
   `sys_1(0x10004, 0x2, hash, 0x1)`）。注意这种动作**没有行上下文**：
   `global496` 会解析成行 0（全 0）。若需要借参数，可以在进入时把 `global511` 设成某个模板
   行号，`func_302` 会用它替代 hash 查表结果。

**结论：** 不依赖 `chrsysparam` 是可行的，但它是"改世代"而不是"关开关"；对新世代机体，
把表当成一等公民来编辑（本次交付的工具链）成本远低于把 2.c 回退成经典写法。

## 9. 工具链（本次落地）

| 层 | 位置 | 能力 |
|----|------|------|
| 格式 | `src-tauri/src/format/chrsysparam.rs` | 表感知无损解析/构建；严格校验规范布局；字节级往返 |
| 字段 schema | `format/chrsysparam_schema.rs` | 每列名称/分区/格式/证据等级/说明 + 54 组 route 表复刻 |
| 人类 JSON | `format/chrsysparam_document.rs` | `exvs2.chrsysparam.document.v1`：每行 128 个具名字段，hash/mask 走十六进制字符串；导入严格（缺列、未知键、行号错位都报错） |
| 语义校验 | `format/chrsysparam_validate.rs` | 第 7 节全部硬约束 → error/warning |
| MSC 链接 | `format/chrsysparam_msc_links.rs` | 从 2.c 识别注册循环/组解析器/相位解析器/行装载；原始指针用 2.txt `+0x30` 反查 |
| CLI | `exvs2-json inspect/edit --type chrsysparam [--msc-dir <MSC 目录>]` | 行摘要 + 钩子函数名 + 校验 + 完整文档；`setChrSysField` / `appendChrSysRow` / `deleteChrSysRow` / `replaceChrSysDocument` |
| GUI | EXVS2 Workspace → **Unit MSC Workspace → Action table** | 自动定位配对 `041cpm/<unit>/chrsysparam.csyspm`，自动链接当前 MSC 目录的 2.c，行列表/行详情/链路视图/校验/克隆/删除/JSON 进出 |

验证：FA Unicorn 二进制与人类 JSON 双向字节一致；12 份本地新世代机体批量 inspect
**0 错误、0 个未解析原始指针**，仅 2 条"派生目标只存在于其他形态"警告。

## 10. 未解决 / 下一步

- 指令记录 r15/r16（列 0x70/0x6F）的消费者未定位，值一律保持工作行原值。
- 列 0x05/0x06/0x07/0x42 的门控结构是 E2，但"哪个状态/哪种资源"仍是 E0。
- 0x0B..0x67 的 archetype 参数需要按 group 逐组做消费者归档（建议下一步：每组挑一行，
  从 ENTER + 三相位追到 `sys_4F/sys_46/sys_47` 出口）。
- 所有编辑效果仍是 E1/E2；任何"改了会怎样"的断言必须按证据协议做实机（H/P/F 预注册、
  单变量）后才能升到 E3。
