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
| 鸟形态 `0x1` 主射 | `0x476fac14` `ACTION_A_SHOT_BIRD`（空弹 `func_98(0)`）。**不要**接地面 `0x7cd11119`（`func_884` 会卸鸟挂件） |
| 鸟形态其它武装 | 仍不映射副射/特射/特格/近战/蓄力 |
| 可选保留 | partner/`0x400` + `0xc0000` 条件那条 |
| 不在本文件做的事 | 不在 `2.c` `ACTION_*` 加 form `return` |

`ACTION_A_SHOT_BIRD` 不播新射击 motion：`func_76(0x38, 4, 0)` 复用变形 loop（表 `0x38` / `0x9de587ce`），再 `sys_4F(0, 0, 0x860a72cd)`。

TV 鸟分支（`global39 == 0x1`）会给 `0x100`/`0x200`/`0x80` 等换 **另一套 hash**；那是“有飞行武装”的完整产品。Rebellion 在没有对应 bird action hash 之前，用 **空映射** 等价于硬禁普通武装，且仍符合 **只改 0.c selector** 的架构。

可选补强（仍在 `0.c`，非 TV 原文但合理）：

- `func_15`–`func_20`：鸟形态 return 0，挡 cancel 表上的地面近战解析  
- `func_41` / `func_42`：鸟形态 return 0，挡高优先级 resolver 仍吐普通槽 hash  

TV 本体依赖 `sys_1(0x10001,0x3/0x4,…)` 资源表切换；Rebellion 未完整 port 时，上述 gate 是补偿，不是替代 `func_143` 分流。

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
| 鸟 `global143==0x2` | 主射进 `ACTION_A_SHOT_BIRD`（飞行 loop + 空中主射弹）；副射/特射/近战仍不从 thinker 进入 |
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

---

## 7. 开放项

| ID | 项 | 状态 |
|----|----|------|
| O1 | Port TV 鸟形态专用主射/副射 hash 到 Rebellion | 主射薄壳已接（单 hash / 单弹，无三态蓄力）；副射未做 |
| O2 | Port TV `sys_1(0x10001,0x3/0x4,…)` 资源表切换 | 未做 |
| O3 | 是否把 Rebellion 鸟 id 从 `0x2` 改成 TV `0x1` 以对齐表下标 | 开放；当前保持 `0x2` |
| O4 | 鸟形态是否允许 boost/step（`func_42` 全挡的副作用） | 按产品再调 |
