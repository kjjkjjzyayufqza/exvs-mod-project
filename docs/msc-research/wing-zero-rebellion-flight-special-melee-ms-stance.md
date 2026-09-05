# Rebellion：飞行特格落地要恢复进鸟前的枪/刀

**Date:** 2026-09-05
**Status:** E1 source-pinned; in-game H3 untested
**Kind:** MSC `2.c` MS hand stance latch (`global170`)
**Primary tree:** `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c`

**Related:**

- 落地链：[wing-zero-rebellion-flight-hit-air-hold-and-special-melee-cancel](./wing-zero-rebellion-flight-hit-air-hold-and-special-melee-cancel.md)
- 形态 ≠ 动作：[wing-zero-rebellion-flight-interrupt-form](./wing-zero-rebellion-flight-interrupt-form.md)
- 地面副射弹数（Param，无 MSC）：`0x11BE199D` ASSIST

---

## 一句话

`global170==0` 是双枪，`func_884` 的 else 是刀。进鸟时锁存这个值。飞行特格落地不要再写死 `global170=1`。自然解除和其它飞行动作本来就按当前 `global170` 重建手持；特格 B 段 Folder `0x33B742CD` 之后必须再 `func_884` 一次，否则会停在刀模型。

不要把锁存套到地面 dash：dash 的 `global143` 保持 `0`，手持仍走当时的 `global170`。

---

## 生命周期

| Phase | 特格落地 `0xc0b814ff` / `0x8d96c52f` / `0x279f0da4` | 其它鸟→MS |
|-------|-----------------------------------------------------|-----------|
| ENTER | 仍保鸟。锁存已在 `0x9475130e` phase 0 写好 | `rebellion_saved_ms_stance = global170` |
| ACTIVE | 鸟主射/CS/侧转会把 `global170` 写成 1（motion 表），锁存不动 | 同左 |
| EXIT | B 结束：锁存 → `func_884` | `rebellion_restore_ms_after_bird` |
| INTERRUPT | `rebellion_interrupt_bird_form_to_ground` 走同一 helper | 同左 |
| RESPAWN | `func_874`：`global170=0` 且锁存=0 | 同左 |

## 状态所有权

| State | Owner | ENTER | EXIT / INTERRUPT |
|-------|--------|-------|------------------|
| `rebellion_saved_ms_stance` | `transform_start` | 写当前 `global170` | preserve；`func_874` reset 0 |
| `global170` | 近战/射击 tick + restore | 锁存后允许鸟动作改成 1 | 从锁存写回，再 `func_884` |
| 手持模型 | `func_884` | 鸟里卸掉 | 按锁存重建。dash **不**用锁存 |

## 预注册

```text
H3  hypothesis: 枪形态进鸟后打飞行特格，落地 idle 仍是双枪
P3  prediction: 与飞行主射/侧转后再解除相同，双手步枪；刀形态进鸟则落地仍是刀
F3  falsifier: 枪进鸟 → 特格后仍是刀，或刀进鸟 → 特格后变成枪

H4  hypothesis: 地面副射 ASSIST 弹仓 2、type 2，打空才转圈
P4  prediction: 第一发不 reload，第二发打完才 360f 回弹
F4  falsifier: 第一发后就开始 reload，或仍只有 1 发
```

## 不要做

- 不要在 `rebellion_bird_special_melee_natural_exit` 写死 `global170=1`（TV `func_1077` 刀落地，不能当 Rebellion 的 EXIT）。
- 不要为了修特格而强制双枪：那会弄坏 刀→鸟→刀。
- 不要把锁存写进 `cut_in_loop` / dash restore。
- 不要改 `0.c` selector 或 `func_41` 特格白名单来修手持。

## 证据

| 结论 | 等级 | 依据 |
|---|---|---|
| `global170==0` → `func_884` 双枪 `0xcb1fd274` / `0x521683ce` | E1 | target `func_884` |
| 特格 natural_exit 曾写死 `global170=1` | E1 | 改前 `rebellion_bird_special_melee_natural_exit` |
| 强制双枪弄坏 刀→鸟→刀 | E3- historical | restore 旁注释 |
| 枪进鸟 → 特格后仍双枪 | E0 until H3 | 待实机 |
| ASSIST `0x11BE199D` 改前 1 发 type 2 | E1 | `exvs2-json inspect` 2026-09-05 |
