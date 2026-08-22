# Wing Zero Rebellion：鸟形态近战全走 N（特格后格斗 `0x928ca34f`）

**Date:** 2026-08-20  
**Status:** 脚本已改；2026-08-21 实机确认 effect group 分流及持枪空中左 Step 修复
**Kind:** MSC `0.c` bird selector（对照 Delta Plus WR 近战，不切模型）  
**Primary tree:** `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\`

**Related:**

- 鸟输入表：[wing-zero-rebellion-bird-form-0c-input-map](./wing-zero-rebellion-bird-form-0c-input-map.md)
- 拆 form：[wing-zero-rebellion-flight-interrupt-form](./wing-zero-rebellion-flight-interrupt-form.md)
- Delta Plus WR 飞行系统：`docs/msc-research/delta-plus-transform-flight-system.md`  
  官方源：`E:\XB\解包\com\file\040msc\0x04AD9F33\`
- TV 鸟特格落地是**另一套**三 hash，见 [tv-wing-zero-flight-special-melee-landing-copy-list](./tv-wing-zero-flight-special-melee-landing-copy-list.md)。**不要**和本页混改。

---

## 一句话

鸟形态按格斗（`global48 & 0x2`）一律提交地面「特格后再按格斗」的 **N 段** `0x928ca34f` → `2.c` `func_937`。  
Rebellion 只有一个模型，**不抄** Delta Plus `func_888(0x8)` 切主 body。拆飞行态交给现有 `func_41`。

---

## 对照：Delta Plus 飞行近战在做什么

源：`0x04AD9F33` `0.c` WR 分支（`global20 & 0x4000`）+ `2.c`。

| 层 | Delta Plus | Rebellion 本改 |
|----|------------|----------------|
| Selector | WR `0x2` → **唯一** `0x1b89c323`（无方向分流） | 鸟 `0x2` → **唯一** `0x928ca34f` |
| 入口 | `func_241(..., func_1032)` | 已有 `func_241(0x928ca34f, func_937)`，不新建入口 |
| 回身 | `func_1034` 首帧 `func_888(0x8)` → `func_1038`：WR shell `0xcb05586` → 主 body `0xab9c3043`，`global143=0` | **不做**。单模型，只换动作 |
| Effect | `sys_4A(0, 0xdc4314cd, 0xab9c3043, …)` 挂主 body | `0xdc4314cd` 挂 `global20`，使用 group `0x6` / slot `0`；`func_939` 的 `0x2133778d` 保持 group `0x7` / slot `0` |
| 近战动作 | `func_308(…, 0x426c761b)` → `func_1035` / `0x9ffaaf9e` | `func_937` / `func_939`：`0xf105c00f` 等 |

Delta `func_1034` 关键序（不要搬到 Rebellion `func_937`）：

```text
func_888(0x8)     // 切回主 body
func_887()        // 普通 loadout
func_308(..., 0x426c761b, ..., 0x1f4, 0)
sys_4A(0, 0xdc4314cd, 0xab9c3043, ...)
func_531(func_1035)
```

`func_308` 的 `0x1f4` 是 blend（`/ 0x64 = 5`），不是 seek。Rebellion `func_939` 同样传 `0x1f4`，从飞行直接进这段不是“跳过半段动画”。

---

## Rebellion 目标动作：特格后再按格斗的 N 段

地面 `ACTION_BC_SPECIAL_MELEE` / `ALT_2` 取消窗（`func_233(0x7e, 0x8680)`）：

| 条件 | hash | `2.c` |
|------|------|-------|
| 无左右 | **`0x928ca34f`** | **`func_937`** |
| `global87 & 0x30` | `0x8b97920e` | `func_942` |
| 同 handler | `0xb9a1f08c` | `func_942` |

产品决定（2026-08-20）：鸟形态 **全走 N**，不分流 `0x8b97920e`。

`func_937` 是完整 action 入口（`func_488` + `func_219(0x68c7334e)` + `func_939`），不是必须先播特格才能接的残段。首帧会 `func_884()` / `func_1027(0x2)` 重建手武器，并挂 `0x2133778d`。

---

## `sys_4A` effect group 冲突（2026-08-21 实机已证）

`0xdc4314cd` 位于 common effect，资源可由 Rebellion 生成。此前看不到它的
原因不是资源缺失、model 绑定失败或没有进入 `func_937`，而是它与第一刀
`0x2133778d` 在同一 tick 使用了相同的 effect group `0x7`。后生成的
`0x2133778d` 覆盖先生成的 `0xdc4314cd`。

本项目当前已证的调用形态是：

```text
sys_4A(0, effectHash, model, bind, group, slot)
```

因此这里的冲突维度是第五参 `group`，不是最后一参 `slot`。仅把
`0xdc4314cd` 从 `0x7/0` 改成 `0x7/1` 仍不足以隔离；该方案已被实机结果
作废。通过实机验证的分流是：

```c
sys_4A(0, 0xdc4314cd, global20, 0x1, 0x6, 0);
sys_4A(0, 0x2133778d, global20, 0x1, 0x7, 0);
```

所有权：

| Effect | Group | Slot | 生命周期 |
|--------|------:|-----:|----------|
| 飞行近战入口 `0xdc4314cd` | `0x6` | `0` | from-flight 入口 effect |
| 第一刀 `0x2133778d` | `0x7` | `0` | `func_939` 生成，`func_940` 清理 |

硬规则：这两个 effect 不要复用 group `0x7`。common 只保证 effect 资源可用，
不会避免同一 group 内的后写覆盖。

---

## 持枪空中左 Step 结束闪变形动作（2026-08-21 实机已修）

实机特征：面向锁定目标、持枪、空中双击左方向触发 Step，随后完全松开
方向键；Step body 结束切入收招时闪出变形动作再恢复。持刀、地面和其它
方向不复现。

逐函数对比当前 Rebellion 与原版 `016gundmw_001wgzero_001\2.c`：

```text
func_69 / func_79 / func_99 / func_100
func_423 / func_424 / func_425 / func_426
func_861 / func_862
```

以上 Step 方向、位移、结束与 motion callback 函数全部相同。实际链路为：

```text
0xff098547 / func_423                 Step body
  -> 0x506ac760 / func_425            Step end
  -> air: callback 0x19 + direction
  -> left direction 1: func_862
  -> air motion 0x22 + 1 = slot 0x23
  -> func_79: table 0x3 + global170
```

决定性差异只有持枪表的该槽：

```text
original 016 table 0x3 / slot 0x23 = 0xfd853f6b
Rebellion   table 0x3 / slot 0x23 = 0xa621fd5e
Rebellion transform enter slot 0x37 = 0xa621fd5e
```

所以 Step action 没有提交 `0x9475130e`；其结束 callback 直接播放了与变形
enter 相同的 motion。只有 `global170=0` 的枪表、空中左方向会命中
`0x3/0x23`，与全部实机限定一致。此前修改 `0.c func_124()` 的 transform
gate 实机无效，现已撤回。

当前唯一修改：恢复 table `0x3/0x23 = 0xfd853f6b`；table `0x3/0x37`、
`0x4/0x37` 均保持用户确认存在的 `0xa621fd5e`。此前崩溃测试同时使用了
不存在的 `0x5efd21a6`，无法隔离变量；本次不再使用该值。未新增或修改
NUANMB/FHM2D。

### 最终实机结论与硬规则

2026-08-21 用户重新 compile/repack 后确认：持枪、空中、面向锁定目标，
双击左方向并完全松开，Step 收招不再闪变形动作。

必须保持：

```text
table 0x3 / slot 0x23 = 0xfd853f6b  gun air-left Step end
table 0x3 / slot 0x37 = 0xa621fd5e  transform enter
table 0x4 / slot 0x37 = 0xa621fd5e  transform enter
```

后续移植或整理 `func_1042` 时：

1. `0x3/0x23` 是原版持枪空中左 Step 收招槽，禁止覆盖为变形 motion。
2. 新变形 motion 只占新增的 `0x37/0x38/0x3b`；不得复用原有 Step 槽。
3. 本问题不改 `0.c func_124()`。它是方向双击 transform gate，不是本次
   松键后闪动作的根因。
4. 禁止把 `slot 0x37` 改成不存在的 `0x5efd21a6`；已证工作值是
   `0xa621fd5e`。
5. 禁止为此新增、替换或重新打包 NUANMB/FHM2D；修复只需恢复 MSC
   motion table 映射。
6. 最窄实机回归：持枪空中左 Step 松键无闪；其它方向、持刀不变；正常
   变形 enter 仍播放。

### 前后输入防御起手闪变形动作（2026-08-21，脚本已修）

实机现象：空中输入前后防御时，先闪一次变形动作，再进入正常防御；地面
未观察到同样现象。

当前 Rebellion 与原版 `016gundmw_001wgzero_001\2.c` 的防御链逐函数一致：

```text
0.c func_67 / func_68
  -> 0xdabb0543 / 2.c func_427
  -> func_69(0x2b)
  -> callback func_866
  -> ground: motion slot 0x46
  -> air:    motion slot 0x49
  -> func_79: table 0x3 + global170
```

`func_67/68/427/428/429/866/867/868` 与原版完全相同。决定性差异只在
`global170=1` 的持刀 motion table：

```text
original table 0x4 / slot 0x46 = 0xd87e3617  guardbgn_stk_air_fr
current  table 0x4 / slot 0x46 = 0xa621fd5e  transform enter (broken)
original table 0x4 / slot 0x49 = 0xd87e3617  guardbgn_stk_air_fr
current  table 0x4 / slot 0x49 = 0xa621fd5e  transform enter (broken)
```

修复：恢复 `0x4/0x46`、`0x4/0x49` 为原版 `0xd87e3617`。持枪表
`0x3/0x46`、`0x3/0x49` 保持 `0x3711a4f5`；变形 enter `0x37` 保持
`0xa621fd5e`。未新增或修改 NUANMB/FHM2D。

硬规则：transform motion 只写新增 `0x37/0x38/0x3b`，禁止覆盖原版
`0x46/0x49` 防御起手槽。最窄实机回归：持刀空中前后防御直接进入防御；
地面防御、持枪防御、正常变形均不变。

---

## 实际改动（只改 `0.c` selector）

文件：`wing_gundam_zero_rebellion_msc\0.c` `func_143` 鸟分支（`global39 != 0`）。

**顺序（必须）：** `0x400` 觉醒 → `0x1` 鸟主射 → **`0x200` 解除 `0xa02d57dc`** → 然后才是近战。特格解除必须赢过格斗。

```c
else if (global48 & 0x200)
{
    func_95(0xa02d57dc, 0x1, 0x4, 0x9);
}
else if (global48 & 0x3e)
{
    func_95(0x928ca34f, 0x1, 0x2, 0x1);
}
```

`func_95` 参数与地面特格 N 派生 `func_81(0x928ca34f, 0x1, 0x2, 0x1)` 一致。

### 没改的

| 项 | 原因 |
|----|------|
| `2.c` `func_937` / `func_942` | 地面特格派生仍走同一 handler |
| `func_41` 白名单 | `0x928ca34f` **不准**加入；进近战必须拆鸟 |
| Delta `func_888(0x8)` / `func_1038` | 双模型切换，Rebellion 无第二壳体 |
| `0x4/0x8/0x10/0x20` | 第一刀只认中格 bit `0x2`（见下方开放项） |
| 鸟 `0x200` | 仍是官方解除，不是 TV 特格落地 |

---

## `func_937` 两段刀（已用源码钉死）

同一 motion `0xf105c00f`，`func_308(model, hash, rate, arg3, arg4)` → `sys_47(0x2, model, hash, rate, arg4, arg3/0x64, 0)`：

| 段 | 函数 | start (`arg4`) | blend (`arg3/0x64`) | 判定 |
|----|------|-----------------|---------------------|------|
| 第一刀 | `func_939` | `0` | 特格接上：`0x1f4/0x64=5`；鸟：`0` | 刀光 `0x2133778d`；**无** `func_148` 判定 |
| 第二刀 | `func_940` | **`0x960`** | `0` | `func_148(0x36c1a250)` @ `0xaf0` |
| 第三刀 | `func_941`（`0x1` 连段） | 另一 clip `0x869b12ff` | | 再一次 `func_148` |

鸟里曾经「只有第二刀」：`0x1f4` 去混飞行 loop 时钟，第一段被当成已经播过，马上 `func_531` → `func_940` 从 `0x960` 起。地面特格接 N 有特格姿势，混 5 档是对的。鸟必须 `start=0, blend=0`。

地面「特格 + N 点两下」= 特格自己的判定 + 再进 `func_937` 这两段。不是 `func_937` 里再点两次。

---

## 重力 / 惯性（2026-08-20 实机；2026-08-21 补位移）

`func_937` **自己不抗重力、也不负责「向前飞」**。地面「特格 → N」能平飞，是因为 **N 特格 `func_933` 已经种好位移**，`func_44` 换招时清不掉 `sys_46(0x5)` 那颗种子。鸟从飞行 loop 进同一个 `func_937` 时没有这颗种子，再把 `0x1` 通道全清掉，就只剩往下掉。

N 特格（`global775==0`）在 `func_933` 里实际写了：

```c
sys_46(0x5, 0x64, 0, 0x64);                 // 起手 dash seed（func_44 不清 0x5）
func_168(0x1000000);
func_296(0x3e9, 0);
sys_4C(0x8, 0x3);                            // 每帧
// motion 0x3e8 之后：
sys_46(0x1, 0x2, 0, 0xffffdcd8, 0xf0);       // 面内、俯仰 -90°、向前
sys_46(0x2, 0x3, 0, 0xffffdcd8, 0x12c);
sys_46(0x1, 0x4, 0, 0, 0);                   // 垂直通道清零
```

然后 `func_81(0x928ca34f)`。`func_44` 只清 `sys_46(0x1, 1/2/3/4)`，**不清 `0x5`**。

鸟进 `func_937` 时缺的就是这套；不能在入口把 `0x1,0x2` 也刹停。

---

地面「特格 → N 格」看起来像 `func_937` 无视重力。鸟形态直接进同一个函数会落地，因为：

1. `rebellion_interrupt_bird_form_to_ground()` 无条件 `func_296(0x3e8, 0)` → `sys_1(0x30001, 0)`，关掉飞行/悬停。
2. `func_937` 走 `func_489`，只在 **第一次** `func_490` 里按 `global612` 决定要不要再打开 `0x3e8`。若 `func_41` 拆 form 发生在 `func_490` **之后**，悬停被关死，后面只有 `func_491`，重力一直开。
3. 飞行 loop 还占用 `sys_46(0x8, …)`，`func_44` 只清 `0x1` 通道，飞行速度会留下来。

地面特格接 N 能站住，是因为特格已经 `func_168(0x1000000)` + `func_296(0x3e8, 1)`（`func_502` 空中分支 / `func_933`），`func_44` 不清这些旗。

### 补丁（`2.c`，不是改 selector；2026-08-21）

只跳过 `func_296(0x3e8,0)`、只种一次 `sys_46` **不够**。`func_937` 若仍走地面 `func_489`：

```text
func_491 -> func_516(global507, global175)
  sys_46(0x1, 0x2, yaw, pitch, global507)
  sys_46(0x8, 0, 0, 0)
```

`global507==0` 时每帧把面内推力写成 0，并清飞行 `0x8`。入口种的 `0x5` / `-90°` 最多活一帧，看起来和没补丁一模一样。拆鸟后身体是立着的，`-90°` 还会变成俯冲。

对照：同机 `ACTION_BC_SPECIAL_MELEE_ALT_2` / `func_935` 每帧 `func_296(0x3e8,1)` + `func_502`。

| 位置 | 做法 |
|------|------|
| latch | `rebellion_bird_n_melee_pending`：interrupt 时 `global3` 或 `global5` 已是 `0x928ca34f`，或 `func_937` 见 `global143==2` |
| `func_937` from-flight | 按 `func_935` 装 `global609=func_939`、`global452/453/454=0x64`、`func_167(0x1000000)`。`sys_4A(0, 0xdc4314cd, global20, 0x1, 0x6, 0)` 挂本机 body，避开第一刀的 group `0x7` |
| `func_938` | from-flight：**只** `func_502`（不要 `func_489`）。地面特格→N 仍 `func_489` |
| `hold_air` | 一次：去 fly bit、开 `0x30001`、`global142=0xc2b19d12`、清 `sys_46(0x8)`。**不**写 `-90°`，**不**把 `global507` 置 0 再喂给 `func_516` |
| interrupt | from-flight **换** `global142`，**不** `func_296(0x3e8,0)`。受击/站立仍关悬停并清 latch |

地面特格→N 不置 latch，不吃 WR FX，也不改 `func_167`。

**不要**把 `0x928ca34f` 加进 `func_41` 白名单（那会保留鸟 form + 飞控）。

---

## 拆鸟怎么发生（不要再写一遍 teardown）

`2.c` `func_41`：`global143 == 0x2` 且当前动作不是

- `0x9475130e` enter
- `0x77b100ff` loop
- `0xa02d57dc` exit
- `0x476fac14` 鸟主射

则 `rebellion_interrupt_bird_form_to_ground()`：`global143=0`、普通 speed 行、关飞控 `func_296(0x3e8,0)`、卸鸟挂件、还手武器。

`func_44` 把 `global3` 换成 `0x928ca34f` 后，同一套发布会拆 form。可能有一帧「旧 form + 新动作」；`func_939` 首帧自己 `func_884()` 作武器后盾。若实机先闪鸟挂件再出刀，再考虑在 `func_937` 入口显式调一次 interrupt——那是增强，不是本改缺口。

鸟 `func_42` 仍 `return 0`（挡地面 resolver）。近战必须从 `func_143` 出，和鸟主射同一条 thinker 路。

---

## 鸟分支当前表（2026-08-20）

| Input | hash | `2.c` | 语义 |
|-------|------|-------|------|
| `0x1` 有弹 | `0x476fac14` | `ACTION_A_SHOT_BIRD` | 鸟主射 |
| `0x1` 空弹 | `func_98(0)` | — | 空弹提示 |
| **`0x2`** | **`0x928ca34f`** | **`func_937`** | **近战，全 N** |
| `0x200` | `0xa02d57dc` | `func_464` | 官方解除 |
| `0x400` + burst | `0x888d9b7d` / `0x7bba02e9` | 觉醒 | 可选保留 |
| `0x4/0x8/0x10/0x20` | （无） | — | **故意未接** |
| `0x80` / `0x100` / `0x800` | （无） | — | 仍空映射 |

---

## 禁止

1. 不要在 `2.c` `ACTION_*` / `func_937` 里按 `global143` early-return。形态武器表只在 `0.c` `func_143`。
2. 不要把 `0x928ca34f` 加进 `func_41` 飞行白名单，否则近战期间飞控和鸟挂件还在。
3. 不要抄 Delta `func_888(0x8)` 切 `0xab9c3043`。Rebellion 的 `func_888` 是枪 TRS，不是切身。
4. 不要把本页接到 TV 鸟特格落地（`0x8D96C52F` / `0x279F0DA4` / `0xC0B814FF`，`ACTION_BC_SPECIAL_MELEE_ALT_5/7`）。
5. 不要分流 `0x8b97920e`，除非产品改口。
6. 鸟 `func_143` **禁止**在离开飞行动作后补交 `0x77b100ff`。

---

## 验证

```text
python .\tools\check_msc_ai_blocks.py "e:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.c"
python .\tools\check_msc_opaque_func_ptrs.py "e:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.c"
```

两则 2026-08-20 均为 OK。新 `else if` 写在 2026-08-13 外层 AI block 内（嵌套块会被 checker 拒绝）。

实机（repack MSC；Auto-repack 会删同名 `.vgsht2`）：

1. 飞行中格 → `func_937` 刀光/位移，立刻拆鸟。
2. 方向+格斗：若无招，见开放项。
3. 鸟主射中按格斗：`func_16`–`func_20` 仍可能挡 cancel，不在本改范围。
4. 2026-08-21 实机：`0xdc4314cd` 使用 `0x6/0`、`0x2133778d` 使用 `0x7/0` 时，两者不再发生后写覆盖。

---

## 开放项

| ID | 项 | 状态 |
|----|----|------|
| O1 | `func_81` 在有方向时清 `0x2`。鸟分支已改为 `global48 & 0x3e` 全进 `0x928ca34f` | 已改 2026-08-20 |
| O2 | 同帧拆鸟若闪挂件：`func_937` 入口显式 `rebellion_interrupt_bird_form_to_ground()` | 未做 |
| O3 | TV 鸟特格落地三 hash | 未做；别和本页混 |
