# 0.c 到 2.c：输入、action hash、BD / step 边界怎么串起来

样本目录：

```text
E:\XB\解包\com\file\0xBDBE6FEA\
```

本页把同一机体目录里的 `0.c` 和 `2.c` 放到一条流水线里看。结论先说清楚：

```text
0.c 更像 input/action selector 和共通动作选择层。
2.c 更像 depiction/action output 层。
```

**Form / 变形态武器表：** 只在 `0.c` `func_143` 按 form id 分流 input bit → action hash（TV Zero 模式）。不要在 `2.c` `ACTION_*` 里按 form early-return。  
**Bit 语义 per-unit：** 例如 Rebellion 主射是 bit `0x1`，TV 主射是 bit `0x100`。完整案例见 [Wing Zero Rebellion 鸟形态 0.c 输入映射](./wing-zero-rebellion-bird-form-0c-input-map.md)。

这能解释一个之前容易混掉的问题：

```text
玩家按射击 / 格斗 / 特格 / 特射 / 方向 / BD
  不是直接跳进 2.c 的某个 ACTION_*。

更可能是：
  0.c 读取输入和 engine 状态
  -> 选出 action hash
  -> 写进 0x10000 / 0x10001 / 0x10002 这些 engine 表
  -> 2.c 每帧读取这些表
  -> 2.c func_44/52 把 action hash 调度到 ACTION_* callback
  -> 2.c segment 输出 sys_4F / sys_51 / sys_46 / sys_53 / sys_4B / sys_47
```

## 引用规则

这页里的 `ACTION_*` 现在统一视为 legacy alias，不再当主键。

写研究结论时按这个顺序引用：

1. `action hash`
2. `0.c` action index / `2.c` slot
3. 当前 `func_N`
4. `ACTION_*`（如果 legacy alias 还成立，再补）

换句话说：

```text
正确：0xf48d2d49 -> action index 0x0 -> 当前 2.c callback func_915 -> legacy alias ACTION_A_SHOT
错误：这个就是 ACTION_A_SHOT，所以以后都叫 ACTION_A_SHOT
```

## 1. 当前源码快照

`0.c`：

```text
source: E:\XB\解包\com\file\0xBDBE6FEA\0.c
sha256: 9EC31CCB370770863F2FB020A8CFA699DFE53D1ED76636F5BDCC136314AF26C0
lineCount: 3525
functionCount: 145
```

`2.c`：

```text
source: E:\XB\解包\com\file\0xBDBE6FEA\2.c
sha256: 1BE5DACB24FC6565680CC15C4B4045FEC80229E958D690E5AE8BABE973224589
lineCount: 29664
functionCount: 1047
```

## 2. `0.c` 的主循环形状

`0.c:2274-2280`：

```c
void main()
{
    sys_2(0, 0x2, func_8);
    sys_2(0, 0x3, func_89);
    sys_2(0, 0x4, func_90);
    func_92();
    callFunc3(func_94);
}
```

`0.c:2358-2363`：

```c
void func_94()
{
    func_0();
    func_136();
    func_137();
}
```

`0.c:110-126`：

```c
void func_0()
{
    func_1();
    var0 = sys_0(0x10000, 0, 0x33);
    if (var0 != 0)
    {
        func_120(var0);
    }
    func_103();
    ...
    func_3();
    func_138();
    func_6();
}
```

判断：

| 代码形状 | 结论 |
|---|---|
| `main -> func_92 -> callFunc3(func_94)` | `0.c` 也有启动初始化和每帧 loop |
| `func_94 -> func_0` | `func_0` 是主要每帧处理 |
| `func_0 -> func_1/3/6/103/138` | 每帧更新输入、状态、action 选择、写回 engine 表 |

人话：

```text
0.c 每帧先读输入和 engine 状态，再把“本帧选出来的动作/方向/按钮 mask”写回共享表。
```

## 3. `0.c func_2`：把原始方向/按钮读成 bit mask

`0.c:137-190`：

```c
global2 = 0;
if (sys_0(0x20000, 0x2)) { global2 |= 0x4; }
if (sys_0(0x20000, 0x3)) { global2 |= 0x8; }
if (sys_0(0x20000, 0x4)) { global2 |= 0x10; }
if (sys_0(0x20000, 0x5)) { global2 |= 0x20; }
if (sys_0(0x20000, 0x8)) { global2 |= 0x100; }
if (sys_0(0x20000, 0x6)) { global2 |= 0x40; }
if (sys_0(0x20000, 0x7)) { global2 |= 0x80; }
if (sys_0(0x20000, 0x9)) { global2 |= 0x200; }
if (sys_0(0x20000, 0xa)) { global2 |= 0x400; }
if (sys_0(0x20000, 0xb)) { global2 |= 0x800; }
if (sys_0(0x20000, 0xc)) { global2 |= 0x1000; }
if (sys_0(0x20000, 0xd)) { global2 |= 0x2000; }
global4 = ~global1 & global2;
global6 = ~global2 & global1;
if (!(global2 & 0x3c))
{
    global2 |= 0x2;
}
```

判断：

| 值 | 当前读法 |
|---|---|
| `global2` | 当前帧 held input / direction / button bit mask |
| `global4 = ~global1 & global2` | pressed edge |
| `global6 = ~global2 & global1` | released edge |
| `0x3c` | 方向组，和 Notion 记录的 `0x4/0x8/0x10/0x20` 对应 |
| 没方向时 `global2 |= 0x2` | neutral / no direction bit |

结合 Notion 记录：

| bit | 人话候选 |
|---|---|
| `0x4` | 前 |
| `0x8` | 后 |
| `0x10` | 左 |
| `0x20` | 右 |
| `0x3c` | 任意方向 |

这解释了 `2.c` 里为什么经常看到：

```c
if (global172 & 0x10) ...
if (global172 & 0x20) ...
if (global200 == 1) ...
```

`2.c` 不是直接读摇杆原始输入，而是在消费上游已经整理过的方向 bit。

## 4. `0.c func_6/10`：把 input/action 状态写回 `0x10000`

`0.c:313-326`：

```c
sys_1(0x10000, 0, 0x7, global2);
sys_1(0x10000, 0, 0x8, global4);
sys_1(0x10000, 0, 0x9, global6);
...
global48 = func_81(var1, var2);
sys_1(0x10001, 0x1, 0, global48);
```

`0.c:483-494`：

```c
sys_1(0x10000, 0, 0x10, global49);
sys_1(0x10000, 0, 0x11, global51);
sys_1(0x10000, 0, 0x13, global50);
sys_1(0x10000, 0, 0x14, global52);
sys_1(0x10000, 0, 0x1c, global61);
sys_1(0x10000, 0, 0x1d, global43);
sys_1(0x10000, 0, 0x1a, global62);
sys_1(0x10000, 0, 0x27, global53);
sys_1(0x10000, 0, 0x34, global54);
sys_1(0x10000, 0, 0x28, global55);
```

判断：

| 共享槽 | 当前读法 |
|---|---|
| `0x10000,0,0x7` | held input bit mask |
| `0x10000,0,0x8` | pressed edge bit mask |
| `0x10000,0,0x9` | released edge bit mask |
| `0x10001,0x1,0` | filtered actionable button mask / action request mask |
| `0x10000,0,0x10/11/13/14...` | action selector 输出状态 |

人话：

```text
0.c 是把输入和状态写进共享表的人。
2.c 的 func_20/21/22/23/4 再从这些共享表读取。
```

这就是为什么在 `2.c` 里看到 `sys_0(0x10000,...)` 时，不应该把它看成“直接读键盘/手柄”。它读的是 `0.c` 和 engine 共同维护后的状态。

## 5. `0.c func_13/14/83/84`：action id 表和 callback 表

`0.c:541-573`：

```c
sys_1(0x10000, 0x1, 0, 0xc858da63);
sys_1(0x10000, 0x1, 0x1, 0x4cdc9902);
sys_1(0x10000, 0x1, 0x2, 0x6d00aeaa);
...
sys_1(0x10000, 0x1, 0x24, 0xf32aa1ba);
sys_1(0x10000, 0x1, 0x25, 0x900ab393);
sys_1(0x10000, 0x1, 0x28, 0x27786a84);
```

`0.c:576-608`：

```c
func_83(0, 0);
func_83(0x1, func_15);
func_83(0x2, func_16);
func_83(0x3, func_17);
...
func_83(0x23, func_40);
```

`0.c:2213-2221`：

```c
void func_83(int arg0, int arg1)
{
    var2 = sys_0(0x10000, 0x1, arg0);
    if (var2 != 0)
    {
        sys_1(0x10002, 0, var2, arg1);
    }
}
```

`0.c:2223-2235`：

```c
int func_84(int arg0)
{
    var1 = sys_0(0x10000, 0x1, arg0);
    if (var1 != 0)
    {
        if (sys_0(0x10003, 0, var1))
        {
            return sys_0(0x10002, 0, var1);
        }
    }
    return 0;
}
```

判断：

```text
0.c func_13: index -> action hash
0.c func_14/83: action hash -> selector callback
0.c func_84: 用 index 查 action hash，再查 selector callback
```

注意这里是 group `0`：

```text
sys_1(0x10002, 0, actionHash, selectorCallback)
```

而 `2.c` 的 action output registry 是 group `0x2`：

```text
2.c func_1043 -> func_241(hash, ACTION_*)
2.c func_44 -> sys_0(0x10002, 0x2, actionHash) -> sys_2(... ACTION_*)
```

这说明同一个 action hash 可以在不同层有不同 callback 表：

| group | 层 | 用途 |
|---|---|---|
| `0` | `0.c` | action selector / 判断某 action 是否能作为本帧候选 |
| `0x2` | `2.c` | depiction output / 真正进入 `ACTION_*` 表现脚本 |

## 6. `0.c func_143`：最关键的 action selector

`0.c:3349-3501` 是当前最有价值的上游证据。它把 `global48` 输入 mask、方向、ammo、boost / lock / cancel 状态，转成 `2.c` 也认识的 action hash。

关键片段：

```c
else if (global48 & 0x100)
{
    if (!(sys_0(0x90000, 0x2) == 0))
    {
        if (global2 & 0x3c)
        {
            ...
            func_95(0x23df217e, 0x1, 0x401, 0x8);
        }
        else if (...)
        {
            func_95(0x23df217e, 0x1, 0x401, 0x8);
        }
    }
    else
    {
        func_98(0x2);
    }
}
else if (global48 & 0x200)
{
    if (sys_0(0x60000) > 0)
    {
        if (global2 & 0x30)
        {
            func_95(0x193fe550, 0x1, 0x2, 0x9);
        }
        else
        {
            func_95(0x6ab12717, 0x1, 0x2, 0x9);
        }
    }
}
else if (global48 & 0x80)
{
    if (global2 & 0x3c)
    {
        func_95(0x6ab85f0d, 0, 0x1, 0x7);
    }
    else
    {
        func_95(0x31f61d6c, 0x1, 0x1, 0x7);
    }
}
else if (global48 & 0x1)
{
    if (sys_0(0x90000, 0) == 0)
    {
        func_95(0x7158fa47, 0, 0x401, 0);
    }
    else
    {
        func_95(0xf48d2d49, 0, 0x1, 0);
    }
}
...
else if (global48 & 0x2)
{
    func_95(0x178d1109, 0x1, 0x2, 0x1);
}
```

把 hash 对回 `2.c func_1043`：

| `0.c func_143` 条件 | 选出的 action hash | `2.c func_1043` callback / legacy alias | 玩家语义 |
|---|---|---|---|
| `global48 & 0x1`，slot 0 有 ammo | `0xf48d2d49` | `ACTION_A_SHOT` | 主射 |
| `global48 & 0x1`，slot 0 空 | `0x7158fa47` | `ACTION_A_SHOT_STATE_0` | 主射空弹 / 状态 0 |
| `global48 & 0x80`，无方向 | `0x31f61d6c` | `ACTION_AB_SUB` | N 副射 |
| `global48 & 0x80`，有方向 | `0x6ab85f0d` | `ACTION_AB_SUB_DIRECTIONAL` | 方向副射 |
| `global48 & 0x100`，slot 2 可用 | `0x23df217e` | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | 特射 / 援护 |
| `global48 & 0x200`，左右方向 `global2 & 0x30` | `0x193fe550` | `ACTION_BC_SPECIAL_MELEE` | 方向特格 / 横特格候选 |
| `global48 & 0x200`，非左右 | `0x6ab12717` | `ACTION_BC_SPECIAL_MELEE_ALT_2` | N/前后特格候选 |
| `global48 & 0x2` | `0x178d1109` | `ACTION_B_MELEE` | N 格 |
| `global48 & 0x4/0x8/0x10/0x20` | `0xa2236f44 / 0xe962048 / 0xa1635c24` | `ACTION_B_MELEE_DIR_*` | 方向格斗 |

这个表是目前最重要的“按键到 `2.c`”证据。重点是 `action hash`，不是
`ACTION_*` 字符串本身。

人话：

```text
0.c func_143 是 action selector。
它不发子弹、不放镜头、不挂模型。
它只决定“本帧应该提交哪个 action hash 给后续脚本”。
```

## 7. `func_95`：提交 action 候选

`0.c:2365-2379`：

```c
void func_95(int arg0, int arg1, int arg2, int arg3)
{
    if (arg2 & 0x800)
    {
        global22 = 0x2;
    }
    else
    {
        global22 = 0x1;
    }
    global25 = arg0;
    global23 = arg1;
    global24 = arg2;
    global26 = arg3;
}
```

判断：

| 字段 | 当前读法 |
|---|---|
| `arg0` | 选出的 action hash |
| `arg1` | priority / cancel type / immediate flag 候选 |
| `arg2` | route / mask / action property 候选 |
| `arg3` | action kind / command type / slot kind 候选 |
| `global22` | action request state |
| `global25` | pending action hash |
| `global23/24/26` | pending action metadata |

它不是 output，也不是具体武装。它是 selector 层的“提交候选动作”。

这解释了 `2.c` 里的读法：

```text
2.c func_4 / func_44 看到的 global5 / global3 / sys_0(0x10000,...)，
已经是 0.c 选择后的 action hash 和 metadata。
```

## 8. `func_98`：空弹 / 失败反馈候选

`0.c:2417-2432`：

```c
void func_98(int arg0)
{
    if (arg0 == 0x7)
    {
        sys_1(0xb000a);
    }
    else if (arg0 >= 0)
    {
        global54 = 0x80000000 | arg0;
    }
    else
    {
        sys_1(0xb0006);
    }
    global67 = 0x1;
}
```

在 `func_143` 里，武装不可用时会调用：

```c
func_98(0x2); // 特射 slot 不可用分支
func_98(0x1); // 副射 slot 不可用分支
```

人话：

```text
func_98 更像“输入成立但资源不满足”的失败反馈 / empty slot / buzzer 状态，而不是动作本体。
```

模组意义：

- 改 ammo slot 或 weapon availability 时，不只看 `2.c sys_4F`。
- 还要检查 `0.c func_143` 里是否用 `sys_0(0x90000, slot)` 决定能不能进入 action。

## 9. 0.c 到 2.c 的完整主射例子

玩家目标：

```text
按主射，slot 0 有 ammo，进入 2.c 主射并发弹。
```

跨脚本链：

```text
0.c func_2
  -> sys_0(0x20000,...) 读输入
  -> global2/global4/global6 输入 bit / edge

0.c func_6
  -> sys_1(0x10000,0,0x7/0x8/0x9, input bits)
  -> 写共享输入状态

0.c func_143
  -> global48 & 0x1
  -> sys_0(0x90000, 0) != 0
  -> func_95(0xf48d2d49, 0, 0x1, 0)

0.c func_95
  -> global25 = 0xf48d2d49
  -> global23/global24/global26 = metadata

共享表 / engine
  -> 2.c func_4 读 pending action / 状态
  -> 2.c func_44 commit global5 -> global3
  -> sys_0(0x10002,0x2,0xf48d2d49)
  -> ACTION_A_SHOT

2.c ACTION_A_SHOT
  -> global680 = func_915
  -> global681 = 0
  -> ranged runtime

2.c func_915
  -> sys_4F(0, 0, 0xcc9f6df0)
```

改主射时分层：

| 目标 | 应看层 |
|---|---|
| 主射是否能进入 | `0.c func_143` 的 `global48 & 1` 和 `sys_0(0x90000,0)` |
| 主射进入哪个当前 callback / legacy alias | `0.c func_95` 的 hash + `2.c func_1043` |
| 主射发什么弹 | `2.c func_915 -> sys_4F` |
| 主射弹速/伤害/判定 | `arms_param` / `bullet_param` |
| 主射能不能 BDC | `2.c func_914/915 func_123` + `2.c func_11` gate |

## 10. 0.c 到 2.c 的特格例子

玩家目标：

```text
按特格，根据方向进不同特格。
```

跨脚本链：

```text
0.c func_2
  -> global2 包含方向 bit

0.c func_143
  -> global48 & 0x200
  -> sys_0(0x60000) > 0
  -> if (global2 & 0x30)
        func_95(0x193fe550, 0x1, 0x2, 0x9)
     else
        func_95(0x6ab12717, 0x1, 0x2, 0x9)

2.c func_1043
  -> 0x193fe550 = ACTION_BC_SPECIAL_MELEE
  -> 0x6ab12717 = ACTION_BC_SPECIAL_MELEE_ALT_2

2.c ACTION_BC_SPECIAL_MELEE
  -> global609 = func_940
  -> func_502 driver

2.c func_940
  -> reads global172 & 0x10 / 0x20
  -> sys_46(0, direction-derived value)
```

关键判断：

```text
方向特格是否进入哪个 action，是 0.c func_143 的 selector 逻辑。
特格进入后横移多远，是 2.c func_940 的 action-local movement 逻辑。
普通 BD / step 基础性能仍不在这条 action-local sys_46 里。
```

## 11. BD / step 的边界

OverBoost wiki 的玩家语义：

- BD 是跳跃键两次触发，可按方向移动，并能取消大多数射击和格斗。
- step 是同方向输入两次，出瞬间切诱导和枪口补正。
- boost gauge 会被跳、BD、step、变形、停足武装、格斗等消耗。
- OH 后 BD、step、变形和部分武装不可用，落地硬直变大。

在当前脚本证据里，应拆成四层：

| 层 | 证据入口 | 模组意义 |
|---|---|---|
| 原始输入 / 方向 bit | `0.c func_2 -> sys_0(0x20000,...) -> global2/global4/global6` | 判断方向、按下、松开 |
| action 选择 | `0.c func_143 -> func_95(actionHash,...)` | 判断按键组合进入哪个 action |
| 全局 gate / OH / cancel | `0.c func_143` 的 `0xc000*`、`sys_0(0x60000)`，`2.c func_11` | 判断能不能进入、能不能 cancel |
| 动作内移动 | `2.c ACTION_* segment -> sys_46` | 改某一招自己的横移 / 突进 |
| 基础 BD / step 性能 | `speed_param` / `character_param` | 改普通 BD 距离、step、boost 量 |

所以不要这样命名：

```text
sys_46 = BD
func_940 = BD
0xf48d2d49 = A button
```

更稳的命名：

```text
0.c func_2 = input bit sampler
0.c func_143 = common action selector
0.c func_95 = pending action writer
2.c func_1043 = depiction action registry
2.c func_44 = depiction action commit
2.c func_940 = BC special melee action-local movement segment
```

## 12. 模组开发时怎么用这页

### 改“能不能按出来”

先看 `0.c`：

```text
func_143
  -> 输入 bit 条件
  -> ammo / boost / lock / cancel 条件
  -> func_95(actionHash,...)
```

例如特射按不出来，先看：

```text
global48 & 0x100
sys_0(0x90000, 0x2)
sys_0(0xd0001/d000b)
func_95(0x23df217e,...)
```

### 改“按出来后做什么”

再看 `2.c`：

```text
func_1043
  -> ACTION_*
  -> runtime setup
  -> segment output
```

例如特射换援护，先看：

```text
2.c ACTION_AC_SPECIAL_SHOT_DIRECTIONAL
  -> func_952
  -> sys_51(0x20000,0,0x2,index,type)
```

### 改“基础移动性能”

不要从 `2.c func_940` 开始。先看资源：

```text
speed_param
character_param
boost_gauge / boost_dash / step fields
```

再回头看：

```text
0.c func_143 是否允许进入动作
2.c func_11 是否允许 cancel / OH continuation
2.c action segment 是否有动作内 sys_46
```

## 13. 当前仍需深化

这页把 `0.c -> 2.c` 的脚本边界补上了，但还有几块不能硬命名：

| 区域 | 当前证据 | 还缺什么 |
|---|---|---|
| `0x20000` 原始输入 subcommand | `0.c func_2` 已按 bit mask 采样 | 每个 subcommand 到物理按键的最终 native 映射 |
| `global48` button mask | `func_81` 过滤后写 `0x10001,0x1,0`，`func_143` 消费 | 每一位到 UI 按键的完整命名 |
| `func_95` arg1/arg2/arg3 | 明确携带 action metadata | 每个字段的最终 native 名和边界 |
| `0xc000*` gate | `0.c func_143` 和 `2.c func_11` 都读取 | native 状态槽含义 |
| 普通 BD / step | 已确定不等于单一 `sys_46` | 资源字段和 native movement handler 对照 |

## 14. 交叉引用

- `2.c` 源码证据走读：[2c-source-proof-walkthrough-for-modders.md](./2c-source-proof-walkthrough-for-modders.md)
- 系统控制面矩阵：[system-control-surface-matrix.md](./system-control-surface-matrix.md)
- 操作手册：[msc-modder-operating-manual.md](./msc-modder-operating-manual.md)
- input/action 研究旧入口：[../exvs-msc-input-action-weapon-pipeline.md](../exvs-msc-input-action-weapon-pipeline.md)
- 资源字段映射：[../command_mapping.md](../command_mapping.md)
- OverBoost wiki システム：https://w.atwiki.jp/exvs2ob/pages/593.html
- OverBoost wiki テクニック：https://w.atwiki.jp/exvs2ob/pages/683.html
- OverBoost wiki 初心者指南：https://w.atwiki.jp/exvs2ob/pages/559.html
- OverBoost wiki ブーストゲージ说明：https://w.atwiki.jp/exvs2ob/pages/560.html
- OverBoost wiki 用语集：https://w.atwiki.jp/exvs2ob/pages/82.html
