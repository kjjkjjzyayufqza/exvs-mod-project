# Rebellion 飞行中觉醒：武装栏变回 normal

**Date:** 2026-09-06
**Status:** E1 source-pinned; L3 untested
**Kind:** HUD BindSlot ownership (burst `global23` vs bird bar)
**Primary trees:**

```text
MSC     E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c
Param   E:\XB\mod\041cpm\wing_gundam_zero_rebellion_param\armsparam.bin
```

**Related:**

- Slot 3 FLYING / FLYING_EX: [wing-zero-rebellion-slot3-flying-land-reload.md](./wing-zero-rebellion-slot3-flying-land-reload.md)
- Ground 特射 EX BindSlot: [wing-zero-rebellion-normal-special-shot-ex.md](./wing-zero-rebellion-normal-special-shot-ex.md)
- Dash keeps `global143=0`: [wing-zero-rebellion-special-n-bird-dash.md](./wing-zero-rebellion-special-n-bird-dash.md)

---

## 一句话

觉醒时 `func_879` 会 `func_1034(3)`，把 HUD slot 2/3 绑成地面 `TWINBUSTERRIFLE_EX` / `FLYING_EX`。旧保护只看 `global143 == 0x2`。飞行栏是否在栏上，以 `rebellion_bird_weapon_bar_installed` 为准；觉醒边沿重装鸟栏，不要绑地面 EX。

---

## 1. 玩家看到的（待 E3）

飞行模式、变形 start、或任意进飞路径中按觉醒键：武装栏变成 normal 形态栏，机体仍在飞。正确应保持飞行栏（slot 0/1/2 鸟行，slot 3 卸掉）。

---

## 2. Source（E1）

`func_11` 觉醒：`global23 = 1`，并 `sys_4F(0x14, 1)`；部分机 `sys_4F(0x13)`。每帧 `func_26` → `func_879`。

`func_1034(3)` 只绑地面觉醒行：

| Slot | Bind |
|------|------|
| 2 | `0x54424558` TWINBUSTERRIFLE_EX |
| 3 | `0x8D5B747A` FLYING_EX |

鸟栏是另一套：`0x77A3426B` / `0x04DC0DEE` / `0x233C4626`，slot 3 `sys_4F(0xB, 3, 0)`。

2026-08-29 的 gate 是 `if (global143 != 0x2) func_1034(3/4)`。这挡不住：

| 路径 | `global143` | 鸟栏 |
|------|-------------|------|
| `rebellion_transform_cut_in_loop` 特格 N 冲刺 | **0**（故意） | `install` |
| `func_450` 变形 ENTER 到 slot 0x23 第一拍之前 | 仍是 0 | 未装或刚装 |
| 官方 start/loop 之后 | 0x2 | 已装。若 native `0x13`/`0x14` 把 manager 打回出击默认栏，skip 不会重装鸟栏 |

`sys_4F(0x13)` / `0x14` 对 HUD 行是否硬重置仍是 L2。MSC 侧可证明的是：地面 BindSlot 会盖住鸟栏，且 skip 不会修复。

---

## 3. 当前契约（E1，2026-09-06）

| 时机 | 政策 |
|------|------|
| `rebellion_install_bird_weapon_bar` | `rebellion_bird_weapon_bar_installed = 1` |
| `rebellion_restore_normal_hand_weapons` / `func_874` | latch = 0；`global770 = 0` 以便出鸟后若仍觉醒可 `func_1034(3)` |
| `func_879` 且 latch | `global23` 边沿（`global770`）重装鸟栏。不 `func_1034(3/4)` |
| `func_879` 且非 latch | 原样 `func_1034(3/4)`（FLYING_EX + 特射 EX） |
| 仍跑 | `func_314(0xf6c1a9c1)` |

不要每 tick BindSlot。不要给 FLYING 开 group B。不要 `sys_4F(0x16)` 藏 slot 3。

---

## 4. 生命周期 / 所有权

| State | Owner | ENTER | ACTIVE | EXIT | INTERRUPT | RESPAWN |
|-------|--------|-------|--------|------|-----------|---------|
| 鸟 HUD 0/1/2 + 卸 3 | install / restore | install + latch 1 | 觉醒边沿再 install | restore MS + latch 0 | restore | `func_1034(0)` + latch 0 |
| `global770` | `func_879` | 0 | 鸟栏上只标边沿；出鸟后 0 | 0 | 0 | 0 |
| `global23` | `func_11` | preserve | preserve | preserve | preserve | 0 via vanilla |
| FLYING / FLYING_EX | `func_1034(3/4)` | 不绑 | 仅非鸟栏 | 出鸟后下一拍可 3 | 同 EXIT | spawn FLYING |

---

## 5. 实机（未跑）

```text
H9  hypothesis: burst during transform start / analog 0x77b100ff / dash keeps bird HUD
P9  prediction: slots 0-2 stay trans_mode rows; slot 3 stays empty; no FLYING cell
F9  falsifier: MS rifles + 飞翔 return; OR slot 3 starts 5s in air (I4); OR leaving burst while still flying swaps to MS EX
```

---

## 6. 不要再做

| 做法 | 为什么 |
|------|--------|
| 只用 `global143 == 0x2` 跳过 `func_1034(3)` | 冲刺鸟栏 `global143=0`；skip 也不修 native 重置 |
| 鸟形态整函数 `return` `func_879` | 停掉 `func_314` 翼维护 |
| 出鸟后仍把 latch 留着 | 觉醒中出鸟就再也换不上 FLYING_EX |
| 给鸟行再抄一套 `func_1034(3)` 地面 EX | 那正是本 bug |
