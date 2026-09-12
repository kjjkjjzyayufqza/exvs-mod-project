# Two EXVS2 special-summon systems: independent striker vs automata

**Date:** 2026-08-29
**Status:** E3 in-game confirmed (2026-08-29) Rebellion front/back spawn after
`0.c` gate restore; E1 arg4=slot / two-system routing; E2 arg5=action index
in `sys51-striker-action-index.md`.
**Kind:** syscall / striker. Do not route `sys_51(0x20000, …)` independent
units into `native-unit-task`.

**Related:** `docs/striker-research/exvs2-striker-system.md`,
`docs/unit-task-automata-summon-analysis.md`,
`docs/msc-research/delta-kai-funnel-assist-slot2.md`,
`docs/msc-research/sys51-striker-action-index.md`

---

## Owner correction (do not reverse)

EXVS2 has **two** special-summon systems. They share English words like
"assist" / "援护" in notes, and both can appear near `sys_51` in `2.c`.
They are not interchangeable.

| | Independent striker | Weapon automata |
|--|--|--|
| Example | `516001001` (and every other `5xxxxxxxx` strikertable id) | throwshield, hammershot, host-owned summon weapons |
| Identity | Full character id. Own model / MSC / param / motion / sound packs via `character_id_table` | Not a character id. Lives on the **host** as a weapon |
| Tables | `strikertable` (`0xFEEB79F0`) host → slot1/slot2; `foroutgamearmsparam_striker` | host `armsparam` / `bulletparam` / depiction |
| How it is spawned | **MSC `sys_51` only.** No bulletparam summon row required | Host weapon pipeline (unit-task automata, `CUnitTaskAutomata*`) |
| What `sys_51` looks up | Current **host** character id in `strikertable`, then the slot named by the call | Host weapon / automata resources |

**Do not** tell a later agent that independent strikers are spawned by
`CBattleStrikerManager` without MSC, or that `sys_51(0x20000, 0, 0x2, …)` is
"only automata". That mix-up is how a working `sys_51` plus a filled
`strikertable` still gets dismissed as "wrong syscall".

Vanilla still uses a **second** `sys_51` shape (`sys_51(0x20001, 0x8)` and
similar 2-arg forms) in presentation code. That family is not this table.

---

## `sys_51` 5-arg shape used for independent strikers

Vanilla independent-striker calls look like:

```text
sys_51(0x20000, 0, 0x2, slot_index, type)
```

| Arg | Observed values | E1 reading |
|---|---|---|
| 1 | `0x20000` | independent-striker domain |
| 2 | `0` | unused / reserved in these call sites |
| 3 | `0x2` | family; **not** a HUD slot |
| 4 | `0` or `1` | **strikertable slot index** (0 = slot1, 1 = slot2) |
| 5 | `0`–`0xd` (EW 前后/左右/N = `0x4`/`0x5`/`0x6`) | **action index** the spawned striker enters (`sys_0(0xd0003)`). Not “approach type”. Owner: `sys51-striker-action-index.md` |

EW `ACTION_AB_SUB` (preserved on Rebellion as `func_909`) uses **one** call,
always `slot_index = 0`, action index `0x4` / `0x5` / `0x6` by stick
(前后 / 左右 / N), then `sys_4F(0x7, 0x1, 0x1)`. Vanilla EW does **not**
pass index `0`. `516001001` only registers index `0` → `0x2a253f72`.

RX / Delta **special** uses **two** calls, then `sys_4F(0x7, 0x2, 0x1)`:

```text
N:   (0, 0x2) + (1, 0x4)
dir: (0, 0x5) + (1, 0x6)
```

`sys_4F(0x7, slot, 1)` is ammo consume **after** spawn in those vanilla
bodies. It is not what selects `516001001`. The character id comes from
`strikertable[host][slot_index]`. Rebellion 2026-08-29 **E3**: spawn still
worked with `sys_4F` left commented out (test convenience). Do not treat
consume as the spawn selector.

Vanilla EW `16001001` row is `slot1 = 516003001`, `slot2 = 0`. So EW's
`sys_51(..., 0, 0x4)` names **Tallgeese III**, not `516001001`.
`516001001` is the EW-as-striker id; it is only spawned if some host row
actually stores it in the slot the call indexes.

---

## `0.c` gate (load-bearing)

Independent-striker `sys_51` is not enough by itself. EW `0.c` only
submits the ACTION after:

```text
global48 & 0x80                    // sub-shot
sys_0(0x90000, 0x1) != 0           // host HUD slot 1 has ammo
sys_0(0xd0001, 0) && !sys_0(0xd000b, 0)   // native assist-ready
func_95(<ACTION_AB_SUB hash>, ...)
```

Empty slot 1 uses `0x7c1d57c2` (`ACTION_AB_SUB_ALT_2`), not the spawn
ACTION.

If `0.c` skips those checks, `2.c` still plays the clip and can still
reach `sys_51`, but native drops the spawn: **motion yes, unit no**.

On Rebellion, put this gate **only** on front/back (`global2 & 0xc` →
`0x53554243`). N/left/right stays `0x23df217e` `SUB_SHOT_CUSTOM` with
**no** `d0001` / `0x90000` gate.

---

## Rebellion runtime (2026-08-29)

**Status:** E3 in-game confirmed (2026-08-29): restoring the front/back
`0.c` gate made `516001001` appear. `sys_4F(0x7, 0x1, 0x1)` was **not**
restored.

Target `2.c` `func_909`:

```text
sys_47(... 0xdce9175f ...)          stock EW sub-shot clip
if (func_309(global20, 0x1f4))
    sys_51(0x20000, 0, 0x2, 0, 0x4)  slot_index=0, type=0x4 (EW front/back)
    // sys_4F(0x7, 0x1, 0x1) commented out
    sys_58(0, 0x216a12ff)
```

First in-game: action motion played; `516001001` did not appear.

Not a wrong syscall class, not a strikertable miss, not a homemade
`func_309` miss (clip `0xdce9175f` is stock). Disk audit: game
`mod\0xFEEB79F0.fhm2d` inner bytes md5-matched workspace;
`900000004` slot1=`516001001`; `sys_51` 4th arg `0` = slot1.

One-variable fix: restore EW `0.c` gates on **front/back only**. After
repack, `516001001` spawned. **E3.**

Do not "fix" a no-spawn by grafting unit-task automata or a host
bulletparam summon row onto `516001001`. Do not put the `d0001` gate on
N/left/right homemade sub-shot.

### File audit 2026-08-29 (read, not guessed)

| Item | Result |
|------|--------|
| Workspace `041cpm/strikertable/strikertable.vgsht1` | `900000004` slot1=`516001001` slot2=`0` (152 rows) |
| Game `mod\0xFEEB79F0.fhm2d` inner bytes | **md5-identical** to workspace |
| `sys_51` 4th arg `0` | matches **slot1**, not slot2 |
| `516001001` `character_id_table` + six packs | present (dplcache) |
| `foroutgamearmsparam_striker` `516001001` | present |
| Host MSC `mod\0xE20A6BCB.fhm2d` | packed 13:32 after `2.dscex` 13:28 |
| Motion `0xdce9175f` | in Rebellion motion structure (folder 109 / `assist11a`) |
| EW vanilla `func_909` 前后 | `sys_51(..., 0, 0x4)` **same call**, then `sys_4F(0x7, 0x1, 0x1)` |
| EW vanilla `0.c` 副射 | `sys_0(0x90000, 1)` and `d0001 && !d000b` **before** `func_95` |
| Rebellion `0.c` 副射 前后 (before fix) | no ammo / `d0001` gate; always submitted `0x53554243` |
| Rebellion `0.c` 副射 前后 (after fix) | EW gate on `global2 & 0xc` only; N/left/right ungated |
| Rebellion `func_909` | `sys_4F(0x7, 0x1, 0x1)` left commented; spawn still **E3** |

Table + slot_index were not the miss. The host `0.c` had dropped the EW
enter gate; `2.c` `sys_51` was already the right call. `sys_4F` consume
was not required for this spawn test.

---

## Agent routing

`--match` keywords `sys_51` / `516001001` / `strikertable` / independent
striker must land on cluster `striker-sys51` **before** `native-unit-task`.
Automata docs stay valid for throwshield / hammershot / host-weapon
summons only.

## Vs HUD crash is a different bug

Rebellion 对战里「一召唤就崩」、训练不崩，**不是** `sys_51` 类错误，也不是
J2 那种不出机体。崩点是 `CAcSeqBattleFlow_Player` 费用/段位 HUD 用 hashmap
payload `+0x10` 无边界索引 `CBattleManager+0x2C284`（RVA `0x7CE3B6`）。
训练同槽虚表是空函数。Owner：
[vs-player-hud-cost-index-oob](./vs-player-hud-cost-index-oob.md)。
Registry J3。不要为这个 AV 改 MSC。
