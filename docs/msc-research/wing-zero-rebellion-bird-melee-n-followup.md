# Wing Zero Rebellion：鸟形态近战全走 N（特格后格斗 `0x928ca34f`）

**Date:** 2026-08-20  
**Status:** 2026-08-22 实机确认飞行近战不再下坠；effect group 与相关 Step 修复亦已实机确认
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

最终实机结论（2026-08-22）：飞行形态按近战进入 `0x928CA34F` 后，机体
不再因拆除鸟形态而立刻受重力下坠。决定性修复不是新造一条飞行移动，
而是让 form teardown 只为这个动作保留空中状态，同时恢复动作原本的
`func_489` 格斗推进 driver。

---

## 最终实机闭环：为什么现在不再下坠（2026-08-22）

### 实机结果

用户在重新 compile/repack 后明确确认：**飞行模式近战会下坠的问题已经修好**。
本结论把此前“source 已修、待实机”升级为 runtime-confirmed。该次确认针对
不下坠问题；同批加入的飞行 CSA/CSB 仍需分别记录实机结果。

### 原始失败链

鸟形态近战不是在原地修改 `global143` 后继续飞，而是提交一个普通近战
action，再通过 `func_41` 的 FORCED_RECOVERY 拆除形态：

```text
0.c func_143
  global48 & 0x3E
  -> func_95(0x928CA34F, 1, 2, 1)

2.c action commit
  -> global3 = 0x928CA34F
  -> func_41 sees global143 == 2 and a non-flight action
  -> rebellion_interrupt_bird_form_to_ground()
```

旧 teardown 无条件执行：

```c
func_169(0x4000);
func_296(0x3e8, 0);
```

第一句清除飞行专用 `global24 & 0x4000` 是正确的；第二句把
`sys_1(0x30001, ...)` movement/air-hold 状态也关掉。问题在于 action
切换与 `func_489` 初始化存在帧序：若 teardown 在 `func_490` 已完成之后
关闭 `0x30001`，后续只跑 `func_491`，没有第二次初始化来重新打开空中状态，
于是动作和刀光继续播放，机体却开始受重力下坠。

### 第一版修复为何又造成“不前进”

第一版保住了空中状态，却把 `func_938` 从 `func_489` 换成 `func_502`，
并尝试首 tick 写一次 `sys_46(0x5)`。静态检查全部通过，但用户实机确认
机体不再朝敌人前进。

根因是两个 driver 的职责不同：

```text
func_489 melee runtime
  -> func_490
      -> func_526
          global507 = global379
          global508 = global380
      -> func_491
          -> func_516(global507, global175)
              target yaw/pitch + forward magnitude -> sys_46

func_502 special-movement runtime
  -> func_503/504
      steering delta / facing interpolation
```

`func_502` 可以转向，但不会替代 `func_526/func_516` 的普通格斗前进状态机。
一次性的 `sys_46(0x5)` 也没有成为该 action 的持续推进 owner。这说明
“能朝向目标”与“每帧向目标推进”是两条不同状态链。

### Param 证据排除了错误的换-row方案

当前目标 `grapparam.bin` 已用 `exvs2-json` 实际解析，共 12 rows：

- 当前 N 派生 row `0x68C7334E`：`trackingFrame=180`；
- 普通 N 格 row `0x159D8BC7`：`trackingFrame=180`。

因此此前“`0x68C7334E` 导致 `global507==0`”的推断是错的。把动作换成
`0x159D8BC7` 不会增加追踪量，反而会改 `grapTotalFrame`、起手、收招等
动作参数。最终实现保留 `0x68C7334E`，不修改 grapparam。

### 最终正确实现

#### 1. 在 teardown 前保存动作来源

`func_41` 在 `global143` 仍为鸟形态 `2`、`global3` 已经是
`0x928CA34F` 时设置：

```c
rebellion_bird_n_melee_from_flight = 0x1;
```

任何其他 action 都先清除此状态。这样记录的是“本次 `func_937` 从鸟形态
进入”，而不是把 action hash 错当成 form。

#### 2. 拆 form，但只为鸟来源近战保留 air hold

`rebellion_interrupt_bird_form_to_ground()` 仍完整执行：

- `global143 = 0`；
- `global142 = 0xC2B19D12` 普通 speed row；
- `func_169(0x4000)` 清旧飞控 bit；
- 卸载鸟挂件并恢复普通手持武器和武装栏。

唯一例外是：

```c
if (rebellion_bird_n_melee_from_flight == 0)
{
    func_296(0x3e8, 0);
}
```

所以近战依然真正退出鸟形态，但不会在 action 初始化的边界把空中保持关掉。
受击、倒地、站立、其他 cancel 因为 latch 已清，仍执行原来的关闭逻辑。

#### 3. 保留动作自己的 grapparam 与 motion owner

`func_937` 最终保持：

```c
func_488();
func_219(0x68c7334e);
global602 = func_939;
callFunc3(func_938);
```

`func_939/940/941` 继续拥有原有 motion、刀光、连段和判定；没有复制
Delta Plus 模型切换，也没有换成普通 N 格 Param。

#### 4. 恢复 `func_489` 每帧推进

最终 `func_938` 只有：

```c
func_489();
```

`func_488` 先把 `global612` 清零。`func_490` 初始化时因此走空中分支，
调用 `func_168(0x1000000)` 与 `func_296(0x3e8,1)`；`func_526` 从
`0x68C7334E` 加载追踪时间/推进状态，随后 `func_491 -> func_516` 每帧按
锁定目标的 yaw/pitch 与 `global507` 写移动。旧 flight channel `0x8` 也由
该正常 melee runtime 清理，不再需要自制 seed。

#### 5. EXIT / INTERRUPT / RESPAWN 对称清理

| 生命周期 | 所有权与行为 |
|---|---|
| ENTER | `func_41` 在清 form 前记录 bird origin；`func_937` 还有一次幂等兜底 |
| ACTIVE | `func_489`、`func_526`、`func_491/516` 拥有空中追踪与推进；`func_939+` 拥有动作表现 |
| NATURAL EXIT | 下一 action 进入 `func_41`，因 hash 不再是 `0x928CA34F` 而清 latch |
| HIT/CANCEL/DOWN | 新 action 先清 latch，再走统一 teardown，`func_296(0x3e8,0)` 恢复执行 |
| RESPAWN/REINITIALIZE | `func_874` 显式清 latch，`func_1034(0)` 重建正常武装 bank |

### 为什么静态 GREEN 不能提前宣称修好

失败的第一版同样通过 AI block、opaque pointer、`msclang` 编译与代码形态
测试，但这些只能证明脚本结构合法，不能证明 `sys_46` native movement bus
的运行结果。最终闭环依赖三类证据同时成立：

1. 当前 target `grapparam.bin` 的真实 row 值；
2. TV Wing / Delta Plus 都使用的 `func_489` 完整推进链；
3. 用户重新 repack 后的实机“不再下坠”确认。

以后 movement 类 MSC 修改必须保留“静态通过”和“实机通过”的证据等级差异。

### Git 历史证明：这不是一次就成功的修改

MSC 仓库根目录是 `E:\XB\mod\040msc`。对
`wing_gundam_zero_rebellion_msc/0.c`、`2.c` 使用 `git log --follow` 与
逐 commit diff 后，可以把失败过程钉到真实版本，而不是只靠聊天记忆。

| 阶段 | Git / 快照证据 | 实际改动 | 结果与判定 |
|---|---|---|---|
| V1 复杂悬停方案 | `760f14a`，2026-08-21 21:36，MSC diff `+155/-22` | 新增 `from_flight + pending` 两个 latch；`func_41` 隐藏 `0x4000`；`func_937/938` 每帧重写 `func_168/func_296`，另加 `rebellion_bird_n_melee_hold_air()`、`sys_46(0x5)` 与垂直通道清零 | 逻辑过度耦合 movement bus；下一版本整套撤回，证明没有成为稳定解 |
| V2 全量回退 | `4a90ac1`，2026-08-22 13:39，MSC diff `+171/-232` | 删除两个 latch、hold helper、每帧 air 写入和自制 seed；`func_937/938` 回到原始 `func_219(0x68C7334E) + func_489`；teardown 恢复无条件 `func_296(0x3E8,0)` | 推进 driver 回来了，但下坠根因也随无条件 teardown 一起回来 |
| V3 转去处理另一条鸟特格 | `e9239b5`，2026-08-22 14:27，MSC diff `+95/-20` | 新增 `0xC0B814FF` 单阶段鸟特格与 `0x1192E91E` motion handler | 这是 `0x200` 鸟特格，不是 `0x928CA34F` 飞行近战重力解法；不能混为一次成功 |
| V4 `func_502` 失败版 | `tmp/msc/20260822-wing-rebellion-flight-charge-melee-fix/2.before.c`，SHA-256 `C1FD55C8...B9919EB`；E-009 | 单 latch 保留 air hold，但把 `func_938` 换为 `func_502`，首 tick 写 `sys_46(0x5)` | 静态全绿，实机却不朝敌人前进；该设计已作废 |
| V5 最终成功版 | 当前 working tree `2.c`，SHA-256 `660B20D2...040403F`；E-010 | 保留单 latch 与 conditional teardown；删除 `func_502`/自制 seed；恢复原 row 与 `func_489` | 用户实机确认不再下坠；这是当前 runtime truth |

#### `760f14a` 为什么值得保留

这个 commit 很重要，因为它显示我们早已碰到正确问题——bird action 需要在
拆 form 后保留 air hold——但当时把太多职责塞进同一个补丁：

```text
func_41 发布假 global24
+ pending/from_flight 双 latch
+ func_937 手工改 global379/global390/global613
+ hold_air helper
+ sys_46(0x5) seed
+ func_938 每帧 func_168/func_296
+ 动作后再清垂直通道
```

这使“状态穿越 teardown”和“动作推进算法”纠缠在一起。即使某一帧看起来
不下坠，也难判断是谁生效、谁覆盖谁。`4a90ac1` 把整套删掉，是这条路线
没有收敛的直接 Git 证据。

#### `4a90ac1` 为什么仍然没有解决

回退恢复了 `func_489`，所以普通格斗推进 owner 回来了；但同时把
`rebellion_interrupt_bird_form_to_ground()` 恢复成：

```c
func_169(0x4000);
func_296(0x3e8, 0);
```

也就是说，它撤掉了错误复杂度，却连“鸟来源近战必须保留 air hold”这个
正确条件一起删掉。这个版本很适合作为反例：**恢复动作 driver 不等于恢复
跨 form 的空中状态。**

#### 为什么最终方案比历史版本小

最终成功版只保留两个不可替代的职责：

1. `func_41` 在 form 尚未清除时记录 `0x928CA34F` 的 bird origin；
2. teardown 只对这个来源跳过 `func_296(0x3E8,0)`，随后仍用原始
   `func_219(0x68C7334E) -> func_489`。

推进、朝向、motion、判定都交还原系统；补丁只解决生命周期边界。这也是
经过多次失败后真正收敛出来的原则：**修 state ownership，不重写 movement
algorithm。**

#### Git 边界说明

当前 `git status` 仍显示 `0.bscex / 0.c / 2.c / 2.dscex` 为 modified，
所以最终成功版目前是 working-tree truth，还不是一个新 commit。最新
`func_502` 失败版也没有独立 commit；它由精确 `2.before.c`、E-009、E-010
和用户实机反馈补齐。完整证据链因此是：

```text
Git commits
  + exact before snapshots
  + Param inspection
  + static/compile gates
  + user in-game results
```

不能只看最后一份 `2.c`，也不能只看 commit subject（其中多个 subject 只有
`c` / `ｃ`）；判断某次尝试做了什么必须以 diff 为准。

### 禁止回退的硬规则

1. 禁止再次把鸟来源 `func_938` 改成 `func_502`。
2. 禁止用一次 `sys_46(0x5)` 代替 `func_489` 每帧推进。
3. 禁止把 `0x68C7334E` 换成 `0x159D8BC7` 来修重力。
4. 禁止把 `0x928CA34F` 加进 flight allowlist；动作必须拆 form/挂件。
5. 禁止恢复 teardown 对该来源动作的无条件 `func_296(0x3e8,0)`。
6. 禁止删除“其他 action / func_874 清 latch”的反向清理。

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

### 2026-08-22 第一版 source（实机失败，已作废）

第一版把鸟来源 `func_938` 从 `func_489` 改成 `func_502`，并尝试首 tick
写一次 `sys_46(0x5)`。用户实机确认结果是：动作不再朝敌人前进。

失败原因已经用当前 target Param 与调用链闭合：

- `func_502` 负责 special-movement 转向，不执行普通格斗的
  `func_526 -> global507/global508 -> func_516` 前进状态机。
- `0x68C7334E` grapparam row 真实存在，`trackingFrame=180`，不是此前文档
  推断的 `global507==0`；换成普通 N 格 row `0x159D8BC7` 的同字段仍是 180，
  只会额外改变动作总帧、起手、收招等无关参数。
- 所以“换 row”与“继续补 `sys_46(0x5)`”都不是根因修复。

### 当前 source 修正（2026-08-22 实机确认不再下坠）

- `func_41` 仍在拆 form 前记录 `rebellion_bird_n_melee_from_flight`；其他 action 与 `func_874` 清除它。
- `rebellion_interrupt_bird_form_to_ground()` 对鸟来源近战保留空中状态；受击、倒地和其他 cancel 仍关闭。
- `func_937` 保持原 `func_219(0x68C7334E)`、原 motion callback `func_939`。
- `func_938` 已恢复 `func_489()`，不再调用 `func_502`，也不再写自制 `sys_46(0x5)` seed。

这使前进/朝向重新由 TV Wing、Delta Plus 同样使用的 `func_489` 家族负责，
同时避免 teardown 把空中状态提前关掉。`0x928CA34F` 仍不加入 flight
allowlist；鸟挂件和 form 会正常拆除。

静态测试、Param row 验证、AI block、opaque pointer 与编译均通过；用户
随后实机确认飞行近战不再下坠。该结果是本页最终 runtime 结论。

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
| `0x800` | `0x2194f05d` | `ACTION_CHARGE_SHOT_BIRD` | CSA，复用鸟主射逻辑 |
| `0x1000` | `0x616971ce` | `ACTION_MASK_1000` | CSB，拆鸟后执行普通 Zero System |
| `0x80` / `0x100` | （无） | — | 仍空映射 |

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
| O2 | 同帧拆鸟若闪挂件：`func_937` 入口显式 `rebellion_interrupt_bird_form_to_ground()` | source 已做，待实机 |
| O3 | TV 鸟特格落地三 hash | 未做；别和本页混 |
