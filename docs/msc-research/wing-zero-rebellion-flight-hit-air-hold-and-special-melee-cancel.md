# Wing Zero Rebellion：飞行特射/变形受击下坠 + 飞行特格

**Date:** 2026-08-30  
**Status:** keep-air E1 source-pinned (H1/H2 untested). Special-melee dive restored (2026-08-23). Cancel window E1 (`func_123(0x3bf)` wait/ground); H5 untested in-game. F7/F8/F9 E3-.  
**Kind:** MSC `2.c` interrupt air-hold; bird special-melee dive rollback  
**Primary tree:** `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\`

**Related:**

- 近战不下坠：[wing-zero-rebellion-bird-melee-n-followup](./wing-zero-rebellion-bird-melee-n-followup.md)
- 打断政策：[wing-zero-rebellion-flight-interrupt-form](./wing-zero-rebellion-flight-interrupt-form.md)
- TV 落地链：[tv-wing-zero-flight-special-melee-landing-copy-list](./tv-wing-zero-flight-special-melee-landing-copy-list.md)
- 已接受下落链：[2026-08-23-wing-zero-flight-special-melee-debug](../agent-sessions/2026-08-23-wing-zero-flight-special-melee-debug.md)

---

## 一句话

飞行特射 / 变形 start/end 中弹仍走 keep-air（`func_296(0x3e8, 1)`）。飞行特格**不再**保形、取消窗、或可选落地超时：整段退回 2026-08-23 用户评价「目前这个很不错」的 A→wait 直到 `!func_287(0x3ed)`。ENTER 会 `interrupt` 拆鸟，这是普通身 Folder `0x1192E91E` 能播的前提，不是新回归。

---

## 1. 受击下坠（特射 / 变形 start、end）

### 生命周期

| Phase | 特射 `0xd94d608f` | 变形 start `0x9475130e` | 变形 end `0xa02d57dc` |
|-------|-------------------|-------------------------|------------------------|
| ENTER | keep_form；676 `func_351(0)` 足止 | `func_296(1)` + `func_167(0x1008000)` | **已经** `func_296(0)` |
| ACTIVE | tick `func_593(); func_167(0x1004000)` | analog-ish start tick | 解除 tick |
| EXIT | 679 `release_flight_owner` | 接到 loop `0x77b100ff` | 自然回普通 |
| INTERRUPT | 旧：`release_flight_owner` 再 FORCED_RECOVERY `func_296(0)` | FORCED_RECOVERY `func_296(0)` | 电机已关，再 teardown |
| RESPAWN | `func_874` 清 latch | 同左 | 同左 |

FORCED_RECOVERY 仍拆 form（`global143=0`、shell、wing refresh）。不重排 `0x77b100ff`。

### 状态所有权

| State | Owner | ENTER | EXIT | INTERRUPT |
|-------|--------|-------|------|-----------|
| `global143` | transform / FORCED_RECOVERY | 特射 keep 0x2 | 自然 679 仍鸟 | 拆到 0 |
| `sys_1(0x30001)` / `func_296(0x3e8)` | analog / 特射 / teardown | 特射足止后仍靠 tick `func_167` | 679 还 analog | **keep air：保持或重开 1**；近战仍 `from_flight`；落地特格 ENTER 仍 0 |
| analog profile | 676 `func_351(0)` | 足止 | 679 / idle re-arm 还 profile 2 | **受击不要** `release_flight_owner` |
| `rebellion_keep_air_on_teardown` | `func_41` 同 tick | 0 | 0 | 离开特射/变形到非 analog/idle 时置 1 |

### 当前实现（E1）

`rebellion_teardown_should_keep_air_hold()`：

- `from_flight` 仍走原来的 skip-`func_296(0)`。
- 落地三 hash / `0x7e08fcc9` ENTER **必须**关电机（下落特格要掉）。
- `keep_form`、`keep_air` latch、或 `global7` 是 `0xd94d608f` / `0x9475130e` / `0xa02d57dc` 时 `func_296(1)`。
- `global7 == 0x77b100ff` **不要** keep air，否则特格 ENTER 也会悬停。

`func_41`：受击不再先 `release_flight_owner` 再拆电机。

### 预注册

```text
H1  hypothesis: 飞行特射中被打，受击硬直留在高度上，不立刻被重力扯下去
P1  prediction: 受击动作在空中播完，然后普通空中 idle / 下落
F1  falsifier:  中弹当下机体明显下坠

H2  hypothesis: 变形 start 或 end 中被打同样留高度
P2  prediction: 同 H1；start 仍拆鸟；end 若电机已关会再 func_296(1)
F2  falsifier:  变形过程中弹立刻下坠
```

---

## 2. 飞行特格：退回 2026-08-23 下落链

对照与失败实验：

- **已接受基线（2026-08-23 阶段 13）**：A `0x1192E91E` 到 frame 18 / `0x708` → wait 关电机 → 只等 `!func_287(0x3ed)` → 接地播 B `0x33B742CD`。A ENTER 调用 `rebellion_interrupt_bird_form_to_ground()`，再播普通身 Folder。视觉会变普通，下落动作在。
- **F7**：A 段 `func_123(0x200)` + `func_233(0x7e, 0)` → 起始特格/近战自取消，一按丢失。
- **F8**：wait 用 `func_309(global20, 0x960)` → A 已走完 `0x708`，约 6f 空中 fallback 掐掉动作。
- **F9**：ENTER 保形（三 hash 进 `func_41` allowlist 与 `func_882` skip，A 去掉 `interrupt`）仍播 `0x1192E91E`。用户第三次仍报「还是一样改坏了」。copy-list probe：普通身 motion 不能在 bird owner 上启动。

当前 `ACTION_BC_SPECIAL_MELEE_BIRD_LANDING` 下落链仍是 2026-08-23：A ENTER `interrupt`，A 到 `0x708`，wait 只等 `!func_287(0x3ed)`。取消只加一件事：wait / ground 每 tick `func_123(0x3bf)` + `func_123(0xc00000)`。A 段不开窗（F7）。没有 `func_233` / `func_81` / `0x9a5` / `wait_remain`。

`0x3bf` = 主射 `0x1` + 格斗 `0x3e` + 副射 `0x80` + 特射 `0x100` + 特格 `0x200`。ENTER 已拆鸟，取消走普通形态 `0.c` 表。

### 预注册（本包）

```text
H5  hypothesis: A 播完进入 wait 后，func_123(0x3bf)+0xc00000 允许特格/主射/副射/特射/格斗取消下落
P5  prediction: 不按取消时 A→wait→接地 B 仍在；wait 或 B 期间按那些键会切走
F5  falsifier:  仍只能 BD 直到落地；或一按下 A 就丢动作（说明 0x200 开到了 A 段）
```

---

## 不要做

- 不要把飞行 loop 受击也改成 keep air（用户说那条已经修过；`global7==0x77b100ff` 会破坏特格下落）。
- 不要在 A 段 `func_123(0x200)` 或 `func_233(0x7e, 0)`（F7）。取消窗只在 wait / ground：`func_123(0x3bf)` + `func_123(0xc00000)`。
- 不要 `func_309(global20, 0x960)` 当 wait 超时（F8）。基线 wait **只**等 `!func_287(0x3ed)`。
- 不要 `func_81(0x928ca34f)` 当飞行特格 N 取消。
- 不要 `func_123(0x9a5)`。
- 不要再对飞行特格做 ENTER 保形（F9），除非先换成鸟 owner 能播的片。
- 不要改 `0.c` selector 类别来躲 `func_882`。
