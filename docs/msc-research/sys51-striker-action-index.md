# Independent striker MSC internals and `sys_51` action index

**Date:** 2026-08-29
**Status:** E2 action-index ABI (`sys_51` arg5 ↔ `sys_0(0xd0003)` ↔
`ACTION_MASK_UNKNOWN_*`); E1 `516gundmw_001wgzero_001` vs playable
`016gundmw_001wgzero_001`; E3 spawn-only 2026-08-29 (Rebellion front/back
`sys_51(..., 0, 0x4)` produced the unit). Arg5 native write is not IDA-pinned.
**Kind:** syscall / striker MSC. Cluster `striker-sys51`.
**Primary trees:**
`E:\XB\mod\040msc\516gundmw_001wgzero_001` (striker `516001001`),
`E:\XB\mod\040msc\516gundmw_003talgs3_001` (striker `516003001`, EW vanilla
slot1), `E:\XB\mod\040msc\016gundmw_001wgzero_001` (playable `16001001`).

**Related:**

- Two summon systems / host `0.c` gate:
  [sys51-independent-striker-vs-automata](./sys51-independent-striker-vs-automata.md)
- Table / packs: `docs/striker-research/exvs2-striker-system.md`
- Host input boundary:
  [0c-to-2c-input-action-boundary](./0c-to-2c-input-action-boundary.md)
- Registry J1/J2/J3:
  [msc-falsified-negatives-registry](./msc-falsified-negatives-registry.md) §J
- Vs Player HUD OOB (对战崩、训练不崩；不是 `sys_51`):
  [vs-player-hud-cost-index-oob](./vs-player-hud-cost-index-oob.md)

Do not mix this with `native-unit-task` automata.

---

## Grade table

| Claim | Grade | Evidence |
|-------|-------|----------|
| Independent `5xxxxxxxx` spawn only via `sys_51(0x20000, 0, 0x2, slot, type)` | E3 spawn; E2 call-shape | Rebellion 2026-08-29; 453 five-arg calls / 173 `2.c` files, arg3 always `0x2` |
| Arg4 = strikertable slot (`0`=slot1, `1`=slot2) | E2 | 257×`0`, 109×`1` |
| Arg5 = **action index** the spawned unit enters | E2 | Hosts pass `0`–`0xd`; 83 striker `0.c` switch `sys_0(0xd0003)` onto consecutive hashes; those hashes are the extra `func_241` `ACTION_MASK_UNKNOWN_*`; some `2.c` bodies also read `d0003` |
| Arg5 is stored as `sys_0(0xd0003)` on the spawned unit | E2 circumstantial | No MSC `sys_1(0xd0003, …)` writer in the corpus. The only small integer supplied at spawn is arg5. IDA not running this session |
| `516001001` only wires index `0` → `0x2a253f72` | E1 | `func_155` + `func_241` |
| EW host 前后/左右/N → arg5 `0x4` / `0x5` / `0x6` | E1 | `016` `ACTION_AB_SUB` / `func_909` |
| Striker `0.c` thinker is `func_147`, not a player `func_143` | E1 | `sys_1(0x10001, 0, 0x1, 0x6a13)` vs `0.txt` |
| Vanilla EW-as-striker `func_155` has no C call site | E1 | 83 `5*` `0.c` define the switch; C call sites ≈ 0 |

A source-only reading does not prove in-game “type 0 plays clip X”. That is E3.

---

## 1. One-sentence ABI

```text
sys_51(0x20000, 0, 0x2, slot_index, action_index)
```

- `0x20000` — independent-striker domain.
- arg2 `0` — unused in these call sites.
- arg3 `0x2` — family; not a HUD slot. **453/453** corpus hits.
- arg4 `slot_index` — `strikertable[host][slot]` character id (`0` or `1`).
- arg5 `action_index` — **which action the spawned striker enters**.
  Script-side name of that integer is `sys_0(0xd0003)`.

`sys_4F(0x7, slot, 1)` is ammo consume after spawn. It does not pick the
character and it does not pick the action.

Owner-settled 2026-08-29: this is **not** automata / host `bulletparam` summon.

---

## 2. Host: how arg5 is chosen (EW / RX)

### 2.1 EW Zero playable `016gundmw_001wgzero_001`

`ACTION_AB_SUB` samples stick into `global200`, then `func_909` fires **one**
call, always slot `0` (vanilla row = Tallgeese III `516003001`):

| Stick (`global87`) | `global200` | `sys_51` arg5 |
|--------------------|-------------|----------------|
| `0x4` or `0x8` (前后) | `0x1` | **`0x4`** |
| `0x30` (左右) | `0x2` | **`0x5`** |
| else (N) | `0` | **`0x6`** |

```text
sys_51(0x20000, 0, 0x2, 0, 0x4/0x5/0x6)
sys_4F(0x7, 0x1, 0x1)
```

Earlier notes that said EW uses type `0` / `0x4` / `0x6` were wrong on the N
value. Vanilla EW never passes `0` here.

Rebellion currently copies the 前后 call (`arg5 = 0x4`) onto host
`900000004` with slot1 = `516001001`. Spawn of the **unit** is E3. Whether
that unit entered a type-`0x4` attack is **not** E3.

### 2.2 RX-78-2 `001gundam_001gundam_001`

Two calls (two strikertable slots), then `sys_4F(0x7, 0x2, 0x1)`:

```text
global200 == 0x1:  (slot 0, type 0x4) + (slot 1, type 0)
else:              (slot 0, type 0x3) + (slot 1, type 0x3)
```

Arg5 `0` is a real vanilla value, not a sentinel.

### 2.3 Corpus (173 files, 453 calls)

Arg5 constants seen: `0`–`0xd` plus a few temps (`var0`/`var1`/`var2`).
Most common immediates: `0x1` (77), `0` (58), `0x2` (52), `0x3` (47),
`0x4` (41), `0x5` (27), `0x6` (23). Wider than EW's 4/5/6.

---

## 3. Striker `0.c` is not a player selector

Compare the same unit as playable vs striker.

| | Playable `016` | Striker `516` |
|--|--|--|
| `0.c` functions | 145, last `func_144` | 157, last `func_156` |
| `2.c` functions | 1026 | 916 |
| `func_241` | **56** (full arsenal) | **10 unique hashes** |
| `func_95` submits | 22 | 1 (in `func_155`) |
| `0x10001` thinker | `0x5fef` = player `func_143` | `0x6a13` ≈ `func_147` |
| `func_143` | `global48` bits → weapon hashes | resolver for `0x1ad4e055` only |

Playable `func_143` (excerpt):

```text
global48 & 0x80
  sys_0(0x90000, 1) && d0001 && !d000b
    func_95(0x23df217e, ...)          // ACTION_AB_SUB
```

Striker `func_147` (the actual thinker):

```text
global57 = 0x4ac375c7;     // default: striker work loop
func_13();
func_135();                // param 0xa60b0684 → global108
func_137(global108);       // 0x10002 resolvers, not player bits
```

`global48` is still sampled in `func_6` (shared prelude) and written to
`0x10001` slot 0. Nothing in striker `0.c` maps those bits to a weapon
ACTION. Copying this `0.c` onto a playable unit will not restore buttons.

`check_msc_opaque_func_ptrs.py` reports `0x6a13` as “should be `func_143`”.
That heuristic is for playable units. On a striker the thinker is `func_147`.

### 3.1 `1.c`

Playable `func_3` is empty. Striker writes:

```text
sys_1(0xd0008, 0, 0x3e, 0xadc2880);
```

Same `d000*` family as the host assist-ready gates, different id. Native
table; no owner semantics yet (E0 if named).

---

## 4. How arg5 becomes an ACTION (the index)

Two layers, same integer:

```text
host 2.c     sys_51(..., action_index)
native       writes that integer onto the spawned unit
striker 0.c  sys_0(0xd0003)  == that integer
striker 2.c  func_241(hash_i, ACTION_MASK_UNKNOWN_*)
```

### 4.1 Script map (`0.c` `func_155` / neighbour)

Pattern across **83** `5*` striker `0.c` files:

```text
var0 = sys_0(0xd0003);
if (var0 == 0) func_95(<hash0>, 0x1, …, 0x1f);
else if (var0 == 1) func_95(<hash1>, …);
…
```

Only fire when already in the default loop:

```text
global8 == 0x4ac375c7 && global15 == 0x1
```

`516gundmw_003talgs3_001` (vanilla EW slot1) maps **seven** indices:

| `d0003` / arg5 | Hash | `2.c` `func_241` name | Shape (E1) |
|----------------|------|------------------------|------------|
| `0` | `0xa24678af` | `ACTION_MASK_UNKNOWN` | `func_586` + 676–679 quartet; start motion `0x2f44695e` |
| `1` | `0x9d3423af` | `ACTION_MASK_UNKNOWN_ALT_2` | same C body as index `2`; inner `d0003==1` vs else |
| `2` | `0x437a9c3b` | `ACTION_MASK_UNKNOWN_ALT_2` | same body |
| `3` | `0x3b28f155` | `ACTION_MASK_UNKNOWN_ALT_4` | `func_488` + `func_219(0x6cde1c34)` melee-style |
| `4` | `0xc7120ebe` | `ACTION_MASK_UNKNOWN_ALT_5` | `func_219(0x69910ab1)` — **EW 前后** |
| `5` | `0xba551db1` | `ACTION_MASK_UNKNOWN_ALT_6` | `func_586` quartet — **EW 左右** |
| `6` | `0x6be560e6` | `ACTION_MASK_UNKNOWN_ALT_7` | `func_308(..., 0x9392af57, ...)` — **EW N** |

The decompiler suffix (`ALT_5`) is **not** the index. Use `d0003` / `func_241`
order, not the `ACTION_*` name.

`ACTION_MASK_UNKNOWN_ALT_2` itself reads `sys_0(0xd0003)` to pick an inner
variant. That is `2.c` consuming the same index the host passed. E2.

### 4.2 `516001001` (EW Zero as striker) only implements index `0`

```text
func_155:
    if (sys_0(0xd0003) == 0
        && global8 == 0x4ac375c7 && global15 == 0x1)
        func_95(0x2a253f72, 0x1, 0x2, 0x1f);

func_241(0x2a253f72, ACTION_MASK_UNKNOWN);
```

`ACTION_MASK_UNKNOWN` on this unit is melee-style:

```text
func_488();
func_219(0x464e9aaa);
callFunc3(func_904);
```

There is **no** `func_241` for indices `1`–`6`. Passing EW host values
`0x4` / `0x5` / `0x6` at this id has no matching attack body.

To put `516001001` into its only authored attack:

```text
sys_51(0x20000, 0, 0x2, 0, 0x0)
```

`0x0` and `0` are the same index.

### 4.3 The `0.c` switch is usually not called from C

83 striker `0.c` files define the `d0003` → `func_95` switch. A glob for
`func_155(` call sites on `5*/0.c` is effectively empty (the switch sometimes
lives in `func_156` instead; still no tick caller).

Vanilla per-tick is:

```text
func_94: func_0(); func_148(); func_149();   // last two empty
```

So either native applies arg5 → pending hash without that C call, or it
invokes the switch by script offset. Either way, **`2.c` `func_241` for that
hash is load-bearing**. An index with no `func_241` cannot depict.

Do not delete the `0.c` map as “dead” without an IDA/runtime check.

---

## 5. Shared lifecycle hashes (not the action index)

Every sampled striker `2.c` also registers this baseline (EW striker = 9 +
the one attack; Tallgeese adds `0x7c7d0136` and extra attacks):

| Hash | EW striker handler | Role (E1) |
|------|--------------------|-----------|
| `0x4ac375c7` | `func_856` | default work loop; `func_69(0x33)` |
| `0xc3e64564` | `func_858` | exit; `sys_0(0xd000c) >= 0x64` resolvers send here; `sys_51(global776)` then `func_65()` |
| `0x10abcd8e` | `func_863` | approach / translation; `func_69(0x1d)` |
| `0x906cbad0` | `func_867` | chase; `sys_0(0x40000/1/2)` |
| `0x4cdc9902` | `func_869` | hit |
| `0xef809e66` | `func_871` | down |
| `0xf5f21169` | `func_412` | air idle |
| `0x14b0aea3` | `func_414` | land |
| `0x1ad4e055` | `func_650` | stun |

`0x10abcd8e` / `0x4ac375c7` / `0x906cbad0` / `0xc3e64564` do **not** appear
in the playable `016` `func_241` table. They are striker-only.

`sys_51(global776)` / `sys_51(0x20001, 0x8)` on these bodies are the
**presentation / self-unregister** family, not independent-striker spawn.

### 5.1 `func_137(global108)` is a second axis

`func_135` reads param hash `0xa60b0684` into `global108` (`0`–`0xb`).
`func_137` then optionally registers resolvers for `0x906cbad0` /
`0x10abcd8e` / `0x7c7d0136`.

That is **which movement resolvers this striker kind owns**, not the host
arg5 attack index. Do not treat `global108` as `d0003`.

---

## 6. Lifecycle (striker unit)

| Phase | Owner | What happens |
|-------|-------|----------------|
| ENTER (host) | host `0.c` gate then host `2.c` | `0x90000`/`d0001`/`d000b` then `sys_51(0x20000, 0, 0x2, slot, index)` |
| ENTER (striker) | native + striker `func_147` | unit id from table; `d0003` = index; default hash `0x4ac375c7` |
| ACTIVE | striker `2.c` | indexed `ACTION_MASK_UNKNOWN_*` plus movement hashes |
| EXIT | resolvers on `d000c >= 0x64` | `0xc3e64564` → `sys_51(global776)` + `func_65()` |
| INTERRUPT | shared hashes | hit `0x4cdc9902`, down `0xef809e66` |
| RESPAWN | host | next `sys_51` after native ready (`d0001`) |

Host `d0001`/`d000b` (assist-ready) and striker `d0003` (action index) and
striker `d000c` (lifetime) are **three different native fields**.

---

## 7. What “normal MSC” vs this MSC means in practice

| Job | Playable MSC | This striker MSC |
|-----|----------------|------------------|
| Player buttons | `0.c func_143` | not present |
| Weapon table | 50+ `func_241` | lifecycle + N indexed attacks |
| Who picks the attack | player bit | **host `sys_51` arg5** |
| Who spawns it | player select | host `sys_51` + `strikertable` |

To add a new attack to `516001001`:

1. Author a `2.c` body and `func_241(hash, …)` **and**
2. Add `d0003 == k` → `func_95(hash, …)` on the striker `0.c` map **and**
3. Have the **host** pass `sys_51(..., k)`.

Changing only the host index without a matching `func_241` leaves the unit
on `0x4ac375c7`. Copying EW's `0x4`/`0x5`/`0x6` onto `516001001` copies
Tallgeese's index space, not EW-as-striker's.

---

## 8. Do not

- Treat arg5 as “approach type” without the `d0003` / `ACTION_MASK_UNKNOWN_*`
  map. Stick 前后/左右/N **selects an index**; the striker's `2.c` decides
  what that index depicts.
- Copy EW host `0x4`/`0x5`/`0x6` onto `516001001` and expect Tallgeese
  attacks. This id only registers index `0` → `0x2a253f72`.
- Put the host `d0001` gate on N/left/right homemade sub-shot.
- Route this into `native-unit-task` / host `bulletparam` summon.
- Assume `func_155` is the in-game submit path just because the map is
  written there. Native may apply the index first. Prove with IDA or a
  one-variable in-game index change.

---

## 9. Still open (not this note's settled set)

1. IDA: `sys_51(0x20000)` handler writes which native field (`d0003`?).
2. Does native `func_95` the mapped hash, or only set `d0003` and expect
   the `0.c` switch / offset call?
3. Indices `0x7`–`0xd` used by some hosts: which strikers implement them?
4. `0xd0008` / `0xa60b0684` / `0xd000c` exact native names.
5. Rebellion `sys_51(..., 0, 0x4)` vs `0x0` on `516001001`: unit spawn is
   E3; attack body is untested. One-variable next build: change **only**
   arg5 `0x4` → `0x0`.

Pre-register if that build is requested:

```text
H  arg5 0x0 enters 0x2a253f72 on 516001001; 0x4 stays on 0x4ac375c7 or no unique clip
P  0x0: melee-style clip 0x464e9aaa / ACTION_MASK_UNKNOWN; 0x4: work-loop only
F  0x0 and 0x4 look identical, or 0x0 still shows no unique attack
```
