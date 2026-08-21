# Wing Zero Rebellion：飞行打断后「动作不是飞、操作还是飞」

**Date:** 2026-08-16  
**Status:** 源码钉死；实机需随 0.c+2.c 一起 repack 再验 T-08/T-09  
**Kind:** MSC form / interrupt 规范  
**Primary trees:**

```text
Target  E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\
Source  E:\XB\mod\040msc\028gunwtv_001gunwtv_001\
```

**Related:**

- 形态状态机：`docs/msc-research/2026-08-09-wing-zero-rebellion-transform-port-plan.md` §8、§18–19（T-08/T-09）
- 鸟输入表：`docs/msc-research/wing-zero-rebellion-bird-form-0c-input-map.md`
- Agent 前置：`docs/agent-sessions/2026-08-09-wing-zero-rebellion-transform-handoff.md`

---

## 一句话

动作 hash 和鸟形态是两套字段。打断只换动作，**不会**清 `global143`。  
Rebellion 飞行不完整，受击必须走移植计划的 **FORCED_RECOVERY**（回到普通形态 + 地面操作）。  
**禁止**在打断后把人再排回 `0x77b100ff`。那会变成：画面已是站立/受击，操作仍是飞行。

TV 完整机体可以继续保鸟形态并回飞行 loop。不要把 TV 这条照搬到 Rebellion。

---

## 1. 两套字段

`2.c` `func_41` 每帧发布：

| Engine field | `2.c` 写 | `0.c` 读 | 含义 |
|--------------|----------|----------|------|
| `0` | `global3` | `global8` | 当前动作 hash |
| `0x17` | `global143` | `global39` | 形态：`0` 普通 / `0x2` 鸟 |

改 `global3` 不会写 `0x17`。  
enter / loop / exit（`0x9475130e` / `0x77b100ff` / `0xa02d57dc`）以及鸟主射 `0x476fac14` 都把 `global143` **保持为 `0x2`**。离开这些 hash 本身不清形态。

`global143 = 0` 的合法落点：

- 初始化
- `rebellion_transform_end` 完成段
- `rebellion_interrupt_bird_form_to_ground()`（FORCED_RECOVERY helper）

---

## 2. 动作 hash 身份（打断相关）

Rebellion `0.c` `func_13` 槽表 + `2.c` `func_241`：

| Slot | Hash | `2.c` | 角色 |
|------|------|-------|------|
| `0x1` | `0x4cdc9902` | `func_47` | 受击/默认回退动作 |
| `0x2` | `0x6d00aeaa` | `func_390` | 地面待机 |
| `0xa` | `0xf5f21169` | `func_412` | 空中 idle / 下落 |
| `0x17` | `0x9475130e` | `func_450` + slot `0x23` | 变形进入 |
| `0x18` | `0x77b100ff` | `func_452` + slot `0x24` | 飞行 loop |
| `0x19` | `0xa02d57dc` | `func_464` + slot `0x25` | 官方解除 |
| `0x21` | `0x1ad4e055` | `func_5` 排队 | 受击/硬直类 |
| `0x22` | `0xef809e66` | `func_5` 排队 | 倒地类 |
| （thinker） | `0x476fac14` | `ACTION_A_SHOT_BIRD` | 鸟主射 |

空中 idle **不是** `0x6d00aeaa`。只认站立待机的拆除门闩会漏掉受击、倒地、空中 idle。

---

## 3. 用户现象与错误修法

实机（2026-08-16）：

1. 飞行中被打 / 任何中断 → 看起来站着，走不了，只能跳，攻击怪。
2. 再修之后：动作已经不是飞行，**操作仍是飞行**。

根因链：

```text
打断
  -> 当前动作换成 0x4cdc9902 / 0x1ad4e055 / 0xef809e66 / 0xf5f21169 / 0x6d00aeaa
  -> global143 仍是 0x2
  -> 0.c func_4 读到 global39 != 0
  -> thinker 走鸟输入图（0x1 = 鸟主射，0x200 = 解除）
  -> 若再补交 0x77b100ff
       func_452 -> func_69(0x24) + func_296(0x3e8, 1) + func_453/454
       飞行 yaw/pitch/roll 重新武装
```

作废修法（不要恢复）：

| 修法 | 为什么错 |
|------|----------|
| `func_15`–`func_20` 鸟形态整函数 `return 0` | 挡掉 TV 用的 slot `0x18` 重选，人掉进站立却仍是鸟 form |
| 鸟 `func_15` 默认回 slot `0x18` | 操作被重新武装成飞行 |
| `func_143` 离开四飞行 hash 后补交 `0x77b100ff` | 受击动作播完立刻又进 loop |
| `func_41` 只在 `global3 == 0x6d00aeaa` 时拆 form | 受击/倒地/空中 idle 过不了门闩 |

`func_16`–`func_20`、`0.c` `func_41`/`func_42` 的鸟形态 `return 0` **可以留**：它们只挡地面武装解析，不是拆形态。

---

## 4. 官方解除 vs 受击选择器

官方解除：

```text
0xa02d57dc -> func_464 -> func_69(0x25) -> rebellion_transform_end
  后段：global143=0，speed 0xC2B19D12，func_296(0x3e8,0)，还手持武器
```

受击 / 默认回退选的是 **slot `0x18`（loop）**，不是 slot `0x19`（解除）。  
`func_15` 只有 `global20 & 0x10000` 才选 `0x19`。  
thinker 只把输入 `0x200` 映射到解除。

因此「只有自然变形解除才清 form」不成立：FORCED_RECOVERY 必须在打断路径自己拆 form。

TV 对照：

- TV 打断期间也继续发布鸟形态，受击恢复倾向回 `0x77b100ff`，不清 form。
- TV `func_888` 在 `global24 & 0x1c000` 时调 `func_1077()` 清形态。
- Rebellion 对应钩子是 `func_882`，原先**不会**清 `global143` / speed row。
- TV 鸟 `0x200` 映射的是专用特格 hash（`0x8d96c52f` / `0x279f0da4` / `0xc0b814ff`），不是 `0xa02d57dc`。Rebellion 用 `0xa02d57dc` 是本机官方解除，不要改回 TV 特格 hash（那些 action 没 port）。

---

## 5. 当前正确实现（2026-08-16）

### 5.1 `0.c` `func_15`

`var1`（`func_88` / 中断）且 `global39 != 0`：直接 `return sys_0(0x10000, 0x1, 0x2)`（站立）。  
不要回 `0x18`。  
`var1` 之后的地面近战段仍可 `global39 != 0` 则 `return 0`。

### 5.2 `0.c` `func_143` 鸟分支

- `0x1` → `0x476fac14`（有弹）/ `func_98(0)`（空弹）
- `0x200` → `0xa02d57dc`（官方解除）
- `0x2` → `0x928ca34f`（特格后 N 格 `func_937`；全方向同一 hash。不进飞行白名单，拆鸟交给 `func_41`）
- `0x400` + burst 条件保留
- **禁止** else 补交 `0x77b100ff`

### 5.3 `2.c` `func_41`（发布 `0x17` 之前）

`global143 == 0x2` 且当前动作 **不是**：

- `0x9475130e` enter
- `0x77b100ff` loop
- `0xa02d57dc` exit
- `0x476fac14` 鸟主射

则立刻 `rebellion_interrupt_bird_form_to_ground()`。  
鸟近战 `0x928ca34f` **不要**加进这张白名单。

覆盖：站立 `0x6d00aeaa`、空中 idle `0xf5f21169`、受击 `0x4cdc9902`、`0x1ad4e055`、倒地 `0xef809e66`，以及其它地面动作。

### 5.4 `2.c` `func_882`

对应 TV `func_888` → `func_1077`。`global143 == 0x2` 时同样调 helper。

### 5.5 helper

`rebellion_interrupt_bird_form_to_ground()` 必须幂等：

- `global143 = 0`
- `global142 = 0xC2B19D12`
- `func_296(0x3e8, 0)`（`sys_1(0x30001, 0)`，关飞行移动）
- 拆鸟挂件
- `rebellion_restore_normal_hand_weapons()` / `func_884()`

---

## 6. 给后续 Agent 的硬规则

1. **打断 ≠ 清形态。** 先看 `global143`，不要只看当前动作 hash。
2. **Rebellion 受击走 FORCED_RECOVERY，不走 TV 的回 loop。**
3. **不要** `func_143` 补交 `0x77b100ff` 当「掉出飞行」的修复。
4. **不要**只对 `0x6d00aeaa` 拆 form。
5. **不要**在鸟形态把 `func_15` 整函数 `return 0` 当恢复策略。
6. 官方解除 `0xa02d57dc` 仍留给玩家特格 / `0x19`；打断不要假装已经走了这条链。

---

## 7. 未在实机逐帧 dump 的不确定项

这些不影响上面的政策，只是还没抓过一帧 `global3`/`global143` 对照：

- 并非每次 cancel 都已证明是 `0x4cdc9902`。
- `0x21` / `0x22` 是受击/倒地类，不是逐条 motion 名。
- `0.c` `func_4` 与 `2.c` `func_41` 的同帧先后未测，可能有一帧「旧 form + 新动作」。
- `global20 & 0x10000`（选官方 `0x19`）在 Rebellion 受击时会不会亮，未观察。
- 鸟形态 BD 是否走 `func_464` 未证明；`func_42` 鸟形态 `return 0` 是挡住 resolver，不是拆除。

---

## 8. 为什么绕了这么久（2026-08-16 复盘）

不是缺 TV 对照，是连错了层，又用下一刀去补上一刀的症状。

1. **第一刀打在主射 `2.c`。** 用户说飞行被打断卡住时，先被收成「不完整鸟主射」。改了 `ACTION_A_SHOT_BIRD` 的 `func_76(0x38)` / 对锁参数。真问题在 **打断后谁重选动作、谁清 `global143`**，主射只是其中一条入口。
2. **把 TV 的「受击后继续飞」套到不完整 Rebellion 上。** TV 有完整鸟武装和 `func_1078` 表切换，回 `0x77b100ff` 是对的。移植计划 §8 / T-08·T-09 已经写了 FORCED_RECOVERY。后来仍按 TV 把 `func_15` 导向 slot `0x18`、`func_143` 补交 loop，直接造成「动作不是飞、操作还是飞」。
3. **动作 hash 和形态被当成同一件事。** 打断只换 `global3`/`global8`，`0x17`/`global143` 仍是 `0x2`。拆 form 又只认站立 `0x6d00aeaa`，受击 `0x4cdc9902`、空中 idle `0xf5f21169`、slot `0x21`/`0x22` 全漏。
4. **更早的「安全闸」变成地雷。** `func_15`–`func_20` 鸟形态整函数 `return 0` 写进输入表当补偿。它挡的是中断后重选 slot 的正路，不是地面近战那么简单。
5. **文档互相打架，后写的错结论赢了。** 2026-08-09 计划要强制回地面；2026-08-13/16 输入表和补丁走 TV 保形态。没有把 T-09 当验收门，只能靠用户一局一局报下一半症状。
6. **没有一帧 `global3` + `global143` 对照。** 视觉（站着）和操作（还能飞）被拆开描述后，两次修分别只治其中一半。

以后飞行打断先读本文件和计划 §8，不要先改鸟主射，也不要先抄 TV `func_15` → `0x18`。
