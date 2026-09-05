# Rebellion empty 前后副射：`func_309` fire SE retrigger

**Date:** 2026-09-05
**Status:** E1 source-pinned; L3 untested
**Kind:** MSC reached-time latch (`func_309` is not an edge)
**Primary tree:** `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c`

**Related:**

- Striker spawn gate: [sys51-independent-striker-vs-automata](./sys51-independent-striker-vs-automata.md)
- Homemade N/L/R 副射 clock is a different action: [homemade-motion-clock-vs-game-frame](./homemade-motion-clock-vs-game-frame.md)
- `func_309` trap: [msc-falsified-negatives-registry](./msc-falsified-negatives-registry.md) §H (homemade folders). This page is the **stock** empty-click / ammo 前后副射 path, not homemade `tks11a`.

---

## 一句话

Normal-form front/back 副射 empty-click (`0x7c1d57c2` → `func_912`) and the ammo spawn path (`0x53554243` → `func_909`) both fire `sys_58` under unlatched `func_309(global20, 0x1f4)`. `func_309` is reached-time: once the clip passes 5f it stays true every tick. Latch with action scratch `global241`.

---

## Lifecycle

| Phase | Empty `ACTION_AB_SUB_ALT_2` / `func_912` | Ammo `ACTION_AB_SUB` / `func_909` |
|-------|------------------------------------------|-----------------------------------|
| ENTER | `0.c` `sys_0(0x90000,1)==0` → `0x7c1d57c2` | `0x90000,1` plus `d0001 && !d000b` → `0x53554243` |
| ACTIVE | `sys_47(0x2, … 0x6d145136 …)` then every tick `func_309(…, 0x1f4)` | `sys_47(0x2, … 0xdce9175f …)` then every tick spawn + consume + SE |
| EXIT | `func_309(…, 0x578)` sets `global252` | `func_91()` |
| INTERRUPT | action switch wipes 240-253 | same |
| RESPAWN | `func_874` / `func_73` | same |

`0.c` does **not** require slot-2 特射/照射 ammo. Empty **slot 1** (ASSIST / 前后副射) is what selects ALT_2. If the player emptied 照射 but slot 1 still has ammo, they hit `func_909` instead. Both bodies need the latch.

Vanilla `016gundmw` `func_912` / `func_909` are the same unlatched shape. Do not treat copying EW as a fix.

Do not wait homemade folders on `func_309` (registry H1). These two paths use stock `sys_47(0x2)` clips.

```text
H7  hypothesis: one-shot global241 around func_309 0x1f4 stops the looping fire SE on empty 前后副射 (and the ammo sys_51/sys_58 body)
P7  prediction: empty front/back 副射 plays 0x76b41e21 once; ammo front/back spawns and consumes once
F7  falsifier: SE still loops; OR the click is silent; OR 516001001 stops spawning when ammo remains
```
