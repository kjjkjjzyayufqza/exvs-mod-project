# Wing Zero Rebellion：鸟形态输入映射（0.c only，对照 TV Zero）

**Date:** 2026-08-14  
**Status:** 实机确认主射已在鸟形态被挡住（0.c `func_143` 修正后）  
**Kind:** MSC form / input-map 规范（可复用）  
**Primary trees:**

```text
Target  E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\
Source  E:\XB\mod\040msc\028gunwtv_001gunwtv_001\
```

**Related:**

- 形态移植总计划：`docs/msc-research/2026-08-09-wing-zero-rebellion-transform-port-plan.md`
- Agent 前置：`docs/agent-sessions/2026-08-09-wing-zero-rebellion-transform-handoff.md`
- Thinker 偏移雷区：`docs/agent-sessions/2026-08-13-msc-0c-function-pointer-offset-bug.md`
- 0.c→2.c 边界：`docs/msc-research/0c-to-2c-input-action-boundary.md`
- 鸟近战全走 N：`docs/msc-research/wing-zero-rebellion-bird-melee-n-followup.md`

---

## 一句话

鸟形态能不能出主射 / 副射 / 格斗，**只改 `0.c` 的 `func_143`（以及同文件上的 cancel resolver）**，按 TV Zero 做 `global39` 分流；**不要**在 `2.c` 的 `ACTION_A_SHOT` 等入口硬 `return`。  
**不要把 TV 的 input-bit 语义原样套到 Rebellion**——两边 bit 含义不同，误封 `0x100`、漏掉 `0x1` 会继续放行主射。

---

## 1. 分层：谁负责形态武器表

| 层 | 职责 | TV Zero 做法 | Rebellion 正确做法 |
|----|------|--------------|-------------------|
| `2.c` | 写 form id、播变形、挂件/loadout | `sys_1(0x10000,0,0x17,global143)`；鸟=`0x1` | 同左；鸟=**`0x2`** |
| `0.c` `func_4` | 每帧读 form | `global39 = sys_0(0x10000,0,0x17)` | 同左 |
| `0.c` `func_143` | **输入 bit → action hash** | `if (global39==0)` / `else if (global39==0x1)` 两套 `func_95` | `if (global39==0)` / `else`（鸟 `0x2` 等非 0） |
| `2.c` `ACTION_*` | 执行已选中的 hash | **不**按 form early-return | **同样不要**硬拦 |

```text
2.c  publish form:  sys_1(0x10000, 0, 0x17, global143)
0.c  read form:     global39 = sys_0(0x10000, 0, 0x17)   // func_4
0.c  map inputs:    func_143 → func_95(actionHash, ...)  // thinker
engine dispatch:    actionHash → 2.c func_241 registry → ACTION_*
```

### 1.1 Thinker 调用链（0.c）

```text
func_8
  → func_9
      → func_42 / func_41     // 高优先级 cancel / 槽位解析（可另加 form gate）
      → func_79
          → (*sys_0(0x10001,0,0x1))()   // 必须是 func_143 符号，不是 0x5fef
              → func_95(hash, ...)      // 写待提交 action
  → func_10                   // 把选中结果写回 engine 表
```

Thinker 注册（`func_92`）必须用符号，避免 body 变大后偏移错位：

```c
sys_1(0x10001, 0, 0x1, func_143);  // OK
// sys_1(0x10001, 0, 0x1, 0x5fef);  // BAD after any growth before func_143
```

详见 [function-pointer offset bug](../agent-sessions/2026-08-13-msc-0c-function-pointer-offset-bug.md)。

### 1.2 禁止的错误改法

```c
// BAD — 不是 TV 模式；也绕不过已经选中的 hash 以外的路径设计
void ACTION_A_SHOT()
{
    if (global143 != 0) return;
    ...
}
```

形态武器表属于 **selector（0.c）**，不是 **action body（2.c）**。

---

## 2. Form id 取值

| 机体 | 鸟形态 `global143` / `global39` | 普通形态 |
|------|--------------------------------|----------|
| TV Zero `028gunwtv_001gunwtv_001` | `0x1` | `0` |
| Rebellion `wing_gundam_zero_rebellion_msc` | **`0x2`** | `0` |

Rebellion 的 `func_143` 用 `global39 != 0`（或显式 `== 0x2`）进鸟分支即可；**不要**照抄 TV 的 `== 0x1` 当唯一条件，否则鸟形态永远走普通表。

---

## 3. 关键：input bit 布局机种相关

`func_143` 读的是本机 `0.c` 里的 **input mask**（Rebellion 为 `global48`；TV 为 `global49`——全局编号会随反编译漂移，以本机 `func_8` 里 `sys_1(0x10000,0,0x31, …)` 发布的那个变量为准）。

**bit 含义必须以本机 `func_143` 的 `func_95` 目标 hash + `2.c` `func_241` 注册表为准**，不能假设“所有机体 0x100 都是主射”。

### 3.1 Rebellion 实测映射（正常形态分支）

证据：`wing_gundam_zero_rebellion_msc\0.c` `func_143` + `2.c` `func_241` 注释注册。

| Input bit | Action hash（代表） | `2.c` 注册 | 语义 |
|-----------|---------------------|------------|------|
| **`0x1`** | **`0x7cd11119`** | `ACTION_A_SHOT` | **主射** |
| `0x2` | `0x178d1109` | `ACTION_B_MELEE` | 近战 |
| `0x4` / `0x8` / `0x10` / `0x20` | 方向近战系列 | `ACTION_B_MELEE_DIR_*` 等 | 方向格 |
| `0x80` | `0x23df217e` / `0x7c1d57c2` | `ACTION_AB_SUB*` | 副射 |
| `0x100` | `0x20923fb6` / `0x8d3a4411` | `ACTION_AC_SPECIAL_SHOT*` | **特射**（不是主射） |
| `0x200` | `0xc805dc33` / `0x66eb879f` | `ACTION_BC_SPECIAL_MELEE*` | 特格 |
| `0x400` + `0xc0000` 条件 | `0x888d9b7d` / `0x7bba02e9` | 觉醒技等 | partner/final 风格 |
| `0x800` | `0x26b438ba` / `0x849559da` | `ACTION_CHARGE_SHOT*` | 蓄力射 |
| `0x1000` | `0x616971ce` | `ACTION_MASK_1000` | 掩码类 |

### 3.2 TV Zero 对照（鸟 / 普通共有的 bit 语义差异）

证据：`028gunwtv_001gunwtv_001\0.c` `func_143` + `2.c` `func_241`。

| Input bit | TV Zero `func_143` + `func_241`（2026-08-15 对照源文件） | Rebellion 语义 |
|-----------|-----------------|----------------|
| **`0x1`** | **射击 / 主射**。普通：`0x5a653671` / `0x20923fb6` / `0x10fd160c`。鸟：`0x2194f05d` / `0x476fac14` / `0x16ed34c0`（`ACTION_A_SHOT_STATE_0*`，由 `global157` 三态分流） | **主射** `0x7cd11119` |
| **`0x100`** | **特射**。普通多 hash `ACTION_AC_SPECIAL_SHOT*`。鸟：`0xd94d608f` `ACTION_AC_SPECIAL_SHOT_ALT_9` | **特射** |
| `0x80` | 副射；鸟换 `ACTION_AB_SUB_ALT_2/3/4` | 副射 |
| `0x200` | 特格。鸟：左右 `ACTION_BC_SPECIAL_MELEE_ALT_5`，N `ALT_7` | 特格 |

### 3.3 曾踩的坑（已修）

1. 按 TV 语义在鸟分支“去掉 `0x100` 主射”，但 Rebellion 鸟分支仍保留：

   ```c
   else if (global48 & 0x1)
       func_95(0x7cd11119, 0, 0x1, 0);  // 主射！
   ```

2. 于是鸟形态仍能触发主射。  
3. 正确修法：在 **Rebellion 自己的 bit 表** 上，鸟分支不映射 `0x1`（以及副射/特射/近战/蓄力等未准备飞行武器 hash 的 bit）。

---

## 4. Rebellion 鸟形态 `func_143` 当前策略（2026-08-15）

| 策略 | 内容 |
|------|------|
| 普通形态 `global39 == 0` | 保留完整 `func_95` 表 |
| 鸟形态 `0x1` 主射 | `0x476fac14` `ACTION_A_SHOT_BIRD`（空弹 `func_98(0)`）。**不要**接地面 `0x7cd11119`（`func_884` 会卸鸟挂件）。`2.c` 必须按 TV `ALT_2` 关对锁、禁止 `func_76(0x38)` |
| 鸟形态近战 | **全部走 N**：`global48 & 0x3e` → `0x928ca34f` `func_937`。飞行中按格斗时 `func_81` 会清掉 `0x2`，必须连 `0x4/0x8/0x10/0x20` 一起收。不分流 `0x8b97920e`。拆鸟交给 `func_41`，不要抄 Delta 切模型 |
| 鸟形态其它武装 | 仍不映射副射/特射/蓄力；`0x200` 仍是解除 `0xa02d57dc` |
| 可选保留 | partner/`0x400` + `0xc0000` 条件那条 |
| 不在本文件做的事 | 不在 `2.c` `ACTION_*` 加 form `return` |

`ACTION_A_SHOT_BIRD` 对照 TV `0x476fac14` `ACTION_A_SHOT_STATE_0_ALT_2`：

- `func_593` 四槽：`676` start / `677` shoot / `678` **no_ammo** / `679` end。
- **关掉自动对锁**：`global689 = 0xffffffff`，`global452/453/454 = 0`，`global693 = 0`。不要沿用 `func_586` 默认的 `689=0xa` 和转身插值——那就是 wiki 变形特射「对准敌人前进」同一套 `func_302` / yaw。
- **不要** `func_76(0x38)`。TV 用 `func_308` 在本 action handle 上播鸟 loop（TV `0xcf3250eb`，Rebellion `0x9de587ce`）。占用变形 loop 槽时，被打取消会卡在飞行态。
- 相位结束用 `func_91()`，被打断才能离开 shoot / no_ammo。
- 弹体仍是 `sys_4F(0, 0, 0x860a72cd)`。不要 `func_884`。

TV 鸟分支（`global39 == 0x1`）会给 `0x100`/`0x200`/`0x80` 等换 **另一套 hash**；那是“有飞行武装”的完整产品。Rebellion 副射/特射/蓄力在没有对应 bird hash 之前仍用 **空映射** 硬禁；近战已接 `0x928ca34f`。武装表仍只改 `0.c` selector。

受击 / 倒地走移植计划的 **FORCED_RECOVERY**。完整证据、hash 表、作废修法和 TV 对照见
[飞行打断后动作≠形态](./wing-zero-rebellion-flight-interrupt-form.md)。

- `func_15` 的 `var1` 中断块：鸟形态直接回站立 slot `0x2`，不要回 `0x18`。
- `func_143` **禁止**在离开飞行动作后补交 `0x77b100ff`。鸟 `0x200` 仍是官方解除 `0xa02d57dc`。
- `2.c` `func_41`：`global143==2` 且当前动作不是 enter/loop/exit/鸟主射时，立刻拆 form。
- `2.c` `func_882`（对应 TV `func_888` → `func_1077`）：鸟形态同样拆 form。

`func_16`–`func_20` / `func_41` / `func_42` 的鸟形态 `return 0` 仍保留，只挡地面武装解析，不能用来代替拆形态。

---

## 5. 修改与验证清单

### 5.1 改什么

1. **只 repack `0.c`**（除非 `2.c` 另有变形/挂件工作）。  
2. `func_143` 鸟分支按 **§3.1 Rebellion bit 表** 决定保留/删除 `func_95`。  
3. Thinker 保持 `func_143` 符号。  
4. AI 改块遵守 `docs/msc-research/msc-ai-edit-block-rule.md`。

### 5.2 怎么证明“主射 bit 是谁”

1. 在 `0.c` `func_143` 找到 `func_95(0x……)`。  
2. 在 `2.c` 搜 `func_241(0x……, …)`。  
3. 看注释/回调名是否为 `ACTION_A_SHOT` / 主射逻辑。  
4. **禁止**仅因 TV 文档写 `0x100 = 主射` 就改 Rebellion。

### 5.3 实机

| 形态 | 期望 |
|------|------|
| 普通 `global143==0` | 主射/副射/格斗正常 |
| 鸟 `global143==0x2` | 主射进 `ACTION_A_SHOT_BIRD`；近战 `0x2` 进 `0x928ca34f` `func_937`（全 N）；副射/特射仍不从 thinker 进入；`0x200` 仍解除 |
| 变形进出 | form 清回 0 后武装恢复 |

**2026-08-14：** 用户确认按 §4 修掉鸟分支 `0x1 → 0x7cd11119` 后，鸟形态主射已正确被挡。

---

## 6. 给后续 Agent 的硬规则

1. **Form 武器/动作表 = `0.c` `func_143`，不是 `2.c` `ACTION_*`。**  
2. **Bit 语义 per-unit：** 先本机 `func_95`+`func_241`，再对照 TV。  
3. **Rebellion 主射 bit = `0x1`，不是 TV 的 `0x100`。**  
4. **鸟 form id = `0x2`，不是 TV 的 `0x1`。**  
5. **Thinker 第四参必须是 `func_143` 符号。**  
6. 完整 TV 飞行武装 = 第二套 hash +（可选）`0x10001` 表 swap；未 port 前用空映射禁武装。
7. **飞行打断 = FORCED_RECOVERY**，详见 [flight-interrupt-form](./wing-zero-rebellion-flight-interrupt-form.md)。不要重排 `0x77b100ff`。

---

## 7. 开放项

| ID | 项 | 状态 |
|----|----|------|
| O1 | Port TV 鸟形态专用主射/副射 hash 到 Rebellion | 主射薄壳已接（单 hash / 单弹，无三态蓄力）；副射未做 |
| O2 | Port TV `sys_1(0x10001,0x3/0x4,…)` 资源表切换 | 未做 |
| O3 | 是否把 Rebellion 鸟 id 从 `0x2` 改成 TV `0x1` 以对齐表下标 | 开放；当前保持 `0x2` |
| O4 | 鸟形态是否允许 boost/step（`func_42` 全挡的副作用） | 按产品再调 |
