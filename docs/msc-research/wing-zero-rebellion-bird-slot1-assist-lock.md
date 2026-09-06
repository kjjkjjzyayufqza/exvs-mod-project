# Rebellion 飞行第二槽：地面援护红锁不应带到鸟副射

**Date:** 2026-09-05
**Status:** E1 source-pinned; user symptom E3 (red on bird HUD slot 1); fix L3 untested
**Kind:** HUD `sys_4F(0x16)` sealed bit vs BindSlot
**Primary tree:** `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c`

**Related:**

- Independent striker spawn: [sys51-independent-striker-vs-automata](./sys51-independent-striker-vs-automata.md)
- Slot 3 FLYING hide is a different `0x16` (I5): [wing-zero-rebellion-slot3-flying-land-reload](./wing-zero-rebellion-slot3-flying-land-reload.md)
- BindSlot parks unused rows at slot 9: [wing-zero-rebellion-unused-form-reload-group-b](./wing-zero-rebellion-unused-form-reload-group-b.md)
- Native `0x16` → byte 322: [exvs-msc-syscall-4f-native-handler](../exvs-msc-syscall-4f-native-handler.md)

---

## 一句话

地面前后副射把独立援护叫出去后，`func_1037` 会把 HUD **slot 1** 写成 `sys_4F(0x16, 1, 1)`（红锁）。进鸟只 `BindSlot` 成 `trans_mode_sub`，**不清 byte 322**。`func_875` 在 `global143==0x2` 时已经停掉 `func_1037`，所以红态黏在飞行第二槽上。进鸟后对 slot 1 一次性 `sys_4F(0x16, 1, 0)`。出鸟不要自己写 `0x16`：`func_1037` 会按 NPC 是否还在重新上锁。

---

## User symptom (E3 display, 2026-09-05)

地面第二槽 = 副射 / ASSIST `0x11BE199D`。前后副射召唤 NPC 后该格变红。切飞行后第二槽（鸟副射 `0x04DC0DEE`）仍红。用户：无玩法影响，只是不该把锁态带进飞行第二槽。

---

## Lifecycle

| Phase | Slot 1 row | Slot 1 `0x16` (byte 322) |
|-------|------------|--------------------------|
| ENTER bird (`rebellion_transform_start`) | `sys_4F(0xb, 1, 0x04DC0DEE)` after `global143=0x2` | one-shot `sys_4F(0x16, 1, 0)` |
| ACTIVE bird | stays `trans_mode_sub` | `func_875` skips `func_1037`; do not per-tick rewrite |
| EXIT / INTERRUPT | `rebellion_restore_normal_hand_weapons` → ASSIST `0x11BE199D` | inherit: `func_1037` resumes when `global143!=0x2` |
| RESPAWN | `func_874` then `func_1034(0)` | `func_874` already `sys_4F(0x16, 1, 0)` |

`rebellion_transform_cut_in_loop` (ground special-N dash) 也 `install_bird_weapon_bar`，但 `global143=0`。门在 `global143==0x2`，dash HUD 仍由 `func_1037` 维护。那是另一条路径，不是这次的飞行形态。

---

## State ownership

| State | Owner | ENTER bird | EXIT / INTERRUPT | RESPAWN |
|-------|-------|------------|------------------|---------|
| HUD slot 1 row | `install` / `restore` BindSlot | `0x04DC0DEE` | `0x11BE199D` | `func_1034(0)` |
| HUD slot 1 byte 322 | form 0: `func_1037`; form 2: ENTER one-shot | **reset 0** | **inherit** to `func_1037` | `func_874` reset 0 |
| `sys_0(0xd0001/0xd000b, 0)` | native striker | preserve | preserve | native rebuild |
| HUD slot 3 byte 322 | never write (I5) | preserve | preserve | `func_874` `0x16` slot 2 then slot 1, not slot 3 |

`d0001 && d000b` 是 EW 援护占用门（与 `0.c` 的召唤 ready 门 `d0001 && !d000b` 互补）。MSC 只把它译成 slot 1 红锁。鸟副射不走 `sys_51`，不该显示这把锁。

BindSlot 写 byte **318**（`0x15` reload pause），不写 byte **322**。换行不会自动摘红。

---

## Why skip-only was not enough

2026-08-22 `func_875` 已在鸟形态跳过 `func_1037` / `func_1038`（隔离地面 slot 1 维护）。那只停止**继续写**，没有把上一帧的 `0x16=1` 清掉。Delta Plus 飞机形态同样跳过普通 `0x16` 维护；Rebellion 还多了 slot 1 换行，所以必须在 BindSlot 之后显式清。

---

## What changed (one variable)

`rebellion_install_bird_weapon_bar`：BindSlot 之后，若 `global143==0x2`，`sys_4F(0x16, 0x1, 0)`。

不改 `func_1037`。不写 slot 3 / slot 2 / slot 4 的 `0x16`。不在鸟形态每 tick 清。

```text
H  hypothesis: sticky byte 322 on HUD slot 1 is why bird sub looks sealed; BindSlot does not clear it; one-shot 0x16=0 after bird BindSlot unseals
P  prediction: spawn 前后 NPC → ground slot 1 red → transform → bird slot 1 not red and still usable; untransform while NPC lives → ground ASSIST red again; FLYING slot 3 never red
F  falsifier: bird slot 1 still red after transform; OR bird sub cannot fire; OR return-to-ground ASSIST not red while NPC lives; OR slot 3 FLYING turns red (I5)
```

If F is “still red in bird”, native may rewrite 322 while the striker lives — next build may add a bird-form per-tick `sys_4F(0x16, 1, 0)` in `func_875`. Do not add that in the same pack as this ENTER one-shot.

---

## Do not

| Move | Why |
|------|-----|
| `sys_4F(0x16, 3, …)` to hide FLYING | I5: slot 3 becomes red disable |
| Skip `func_1037` forever / on EXIT | Ground ASSIST must re-lock while the NPC is out |
| Per-tick `0x16=0` in the same build | One variable; ENTER first |
| `sys_4F(0x16, 1, 1)` in bird form | Would reseal `trans_mode_sub` |
| Treat this as ammo / `0x15` / group B | Red seal is byte 322, not reload |

---

## Evidence

| Claim | Grade | Basis |
|-------|-------|-------|
| `func_1037` writes slot 1 `0x16` from `d0001 && d000b` | E1 | `2.c` `func_1037` |
| `0x16=1` is HUD red disable | E3 | I5 on slot 3 FLYING; same subcmd |
| BindSlot does not clear byte 322 | E2 native + E3 symptom | IDA BindSlot → 318; user red after row swap |
| `func_875` skip leaves sticky 322 | E1 | skip has no `0x16=0` |
| ENTER one-shot unseals bird slot 1 | E0 until in-game | this pack |
