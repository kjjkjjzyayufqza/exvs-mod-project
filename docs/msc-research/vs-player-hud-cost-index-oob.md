# Vs Player HUD cost-table OOB (`sub_1407CE240`)

**Date:** 2026-09-07
**Status:** E2 OB IDA (`vsac27_Release.exe` / `ida-24616`); crash RVA
`0x7CE3B6` E3-observed in vs 2v2 log `EXVS2-debug-20260907-222220.log`;
native skip patch and hashmap `+0x10` writer **untested** (not E3).
**Kind:** native vs HUD (not MSC `X.c`, not `sys_51` class). Cluster
`striker-sys51`.
**IDA:** `E:\OBHK0.3_v27\vsac27_Release.exe.i64`, image base `0x140000000`.
In-scope OB only.

**Related:**

- Spawn ABI / `0.c` gate:
  [sys51-independent-striker-vs-automata](./sys51-independent-striker-vs-automata.md)
- Arg5 action index:
  [sys51-striker-action-index](./sys51-striker-action-index.md)
- Table / packs: `docs/striker-research/exvs2-striker-system.md`
- Registry J1–J3:
  [msc-falsified-negatives-registry](./msc-falsified-negatives-registry.md) §J
- Battle-manager global: `kBattleManagerGlobalAbs = 0x1421158A0`, depot `+0x2BF10`

Do not mix this with the Wing Zero Rebellion **transform** bootstrap.
Do not “fix” it by grafting automata or editing `sys_51`.

---

## Grade table

| Claim | Grade | Evidence |
|-------|-------|----------|
| Fault insn is `mov ecx, [r13+rax*8+2C284h]` at `0x1407CE3B6` (`sub_1407CE240`) | E2 IDA + E3- log | Hex-Rays; crash `rva=0x7CE3B6` |
| Index `v23` is hashmap payload `+0x10` (character id is `+0x0C`) | E2 | `sub_140DBDA70` → `sub_140DBDA90` → `sub_140754FC0`; stack `v22`/`v23` |
| Table length is **11** (indices `0..10`); sibling `sub_1407D90B0` skips `v60 >= 0xB` | E2 | Hex-Rays of both functions, same `+180868` |
| `7CE240` has **no** `>= 0xB` check | E2 | Hex-Rays; asm at `0x1407CE3B6` indexes immediately |
| Hashmap miss on a **non-empty** map copies **sentinel+0x30** (can be dirty) | E2 | `sub_140DBDA90` `sub_140754FC0(a2, v8 + 48)` |
| Empty map zeros payload, `+0x10 = 0` (safe) | E2 | same function `LABEL_13` |
| `respawn_cost` helper `sub_140532860(id)` uses hash `0x7D1A0ACF` (2098858703); failure returns 0 and **cannot** produce a multi-GB address | E2 | Hex-Rays |
| Vs Player `vtbl+0xD0` = `sub_1407D01C0` → `7CE720` → `7C8B60` → `7CE120` → **`7CE240`** | E2 | RTTI `.?AVCAcSeqBattleFlow_Player@SEQ@@`; vftable `0x141383240+0xD0` |
| Training `vtbl+0xD0` = `sub_140033290` (`nu::SetVirtualDebugValue`), empty body | E2 | Training ctor `sub_1407DFFC0`; vftable `0x141384A90+0xD0` |
| Player factory allocates `0x1DD0` and constructs `sub_1407C8060`; Training factory allocates `0xD70` and constructs `sub_1407DFFC0` | E2 | `sub_140758A30` / `sub_14075A050` |
| Shared base `sub_1407C2DD0` (via `sub_140888560`) writes `this+0x7DC = -1`; later `sub_1407C32D0` (from shared proc `sub_14088BA20`) writes the `CSeqBattleApp` id at `+2012` | E2 | Hex-Rays; both vftables slot 2 = `0x14088A1F0` |
| `7C32D0` does **not** `12D020`; `124560` → `129FA0` → `12D020(flow, CSeqBattleApp)` fills `flow+56` | E2 | Hex-Rays `1AD420`/`124440`/`124560`/`129FA0`/`12D020` (ida-32440) |
| `7CE120` AVs in `DBDA30(0)` if `12CFD0` misses; empty hashmap (`+81776==0`) skips the `7CE240` loop | E2 | Hex-Rays `7CE120` / `DBDA30` |
| `DC6740` (`CSeqBattleApp` vtbl+0x10) allocates `CBattleManager` (`0x5B0B0`) into `qword_1421158A0` | E2 | Hex-Rays `DBB780`/`12BD60`/`DC6740` |
| `7CE240` code xrefs: `7CE120` only. `7CE120` from vs `7C8B60` and Replay `7E2B60` | E2 | xrefs |
| Character-list skip (`qword_142115660` vtbl `+8/+16/+32`) zero-fills **without** reading `+0x2C284` | E2 | `7CE240` first OR |
| Independent `5xxxxxxxx` typically take that skip; playable custom host `900000004` (AI 5/5) does not | E0/E1 | matches AiContextProbe; not dumped live hashmap |
| Skip predicates `vtbl+8/+16/+32` walk **baked** `.rdata` tree `dword_1412E3EC0` (929 slots), not disk `character_list` | E2 | `sub_140459CE0` / `459C80` / `459D80`; flags `+4 & 0x40` / `& 6` / `& 8` |
| `900000004` and `516001001` are **absent** from that baked tree (search 0 hits) | E2 | IDA `find_bytes` on `vsac27_Release` |
| Disk `character_list` / MSC / strikertable / `0x7D1A0ACF` cost cannot close this AV | E2 | skip is exe-baked; cost mapper returns 0–3 or 0 |
| The 11-slot array is **not** a known pack (`character_cost`, CharacterList, characterparam) | E2 | `CBattleStatusManager` ctor `sub_1405BF290` zeros 11 QWORDs at `+0x1CC`; writer `sub_1405C1750` |
| Logged AV at `rank_root_0` is HUD collect, not `sys_51` throwing | E2 call graph + E3- timing | `516001001` is constructed at load (`sub_14060C980`); `sys_51` only activates |
| Adding `v23 >= 0xB` → existing zero-fill (`loc_1407CE3CB`) stops the AV | E0 until patched and run | spec-identical to `7D90B0`; **not E3** |
| MSC `sys_51` / `0.c` gate / automata can stop this AV | **rejected E2** | crash is Player HUD; Training never enters this function |

---

## 1. One-sentence cause

Vs `CAcSeqBattleFlow_Player` one-shot cost/rank collect indexes
`CBattleManager+0x2C284` with hashmap field **payload+0x10** and **does not
clamp it to `0..10`**. Training’s matching vtable slot is an empty function,
so the same data never faults there.

---

## 2. Fault instruction

```text
1407CE3A8  mov eax, [rsp+138h+var_D8]          ; v23 = payload+0x10
1407CE3AC  mov dword ptr [rsp+138h+var_108+4], eax
1407CE3B0  movsd xmm1, [rsp+138h+var_108]      ; PAIR64(v23, respawn_cost)
1407CE3B6  mov ecx, [r13+rax*8+2C284h]         ; ★ unbounded; r13 = qword_1421158A0
```

Hex-Rays (`sub_1407CE240`):

```c
v19 = __PAIR64__(v23, sub_140532860(v22));   // v22 = character id at +0x0C
v16 = *(DWORD *)(v9 + 8LL * v23 + 180868);   // +0x2C284
```

`180868 == 0x2C284`. Logged read `0x2467588C27C` means `v23` itself is
character-id-sized or dirty sentinel data, not `0..10`.

Nested first line `faulting rva=0x61BE9E7FD` in the same report is a
non-canonical RIP from the same access. Trust **`rva=0x7CE3B6`**.

POC `CrashReport.cpp` callers are a **raw `.text` pointer scan**, not unwind.
Extra frames (`operator new`, etc.) are stale. Use the IDA call graph.

---

## 3. Skip OR vs sibling bound

`7CE240` zero-fills and **does not** read the table when **any** of:

1. `CharacterList` vtbl+8 (`id`)
2. vtbl+16 (`id`)
3. vtbl+32 (`id`)
4. depot lookup `sub_140365460(manager+0x2BF08)` fails

Asm skip target: `loc_1407CE3CB`. Character-list helpers are already named
in the IDB (`CharacterList_ReadU32ByHashOrZero` at `0x140531B80`, etc.).
List global: `qword_142115660`.

Sibling `sub_1407D90B0` uses the **same** table and the **same** payload
field (`v60`) but:

```c
if (list_vtbl8(id) || v60 >= 0xB)
    continue;   // skip this hashmap entry
*(manager + 8 * v60 + 0x2C284);
```

**11 slots, indices 0–10.** `7CE240` omits `v23 >= 0xB`. That is the AV.

### 3.1 The 11-slot table is engine RAM, not a known file

The crash indexes **slot contents** at `CBattleManager+0x2C284`. That array is
not `character_cost`, not disk `character_list`, not characterparam, and not
strikertable.

| Object | What it actually is | Slot count |
|--------|---------------------|------------|
| Crash table | `VDK::GAM::CBattleStatusManager` in-RAM field | **11** QWORDs (`0..10`) |
| `character_cost` / `foroutgamecharacterparam_{playable,boss,zako}.bin` | Per-unit Cost+HP (`CharacterCostEachSize == 8`) | Hundreds of character ids |
| Baked CharacterList tree `dword_1412E3EC0` | HUD skip flags (`vtbl+8/+16/+32`) | 929 ids |
| `sub_140532930` cost tiers | Maps 1500/2000/2500/3000 → **0–3** | 4 values, hardcoded again at StatusManager `+57556` |

Layout (E2 ctor `sub_1405BF290`, reset `sub_1405C11F0`):

- `CBattleManager+0x2C0B8` = `CBattleStatusManager`
- StatusManager `+0x1CC` = manager `+0x2C284` = 11 × 8-byte slots (two dwords each)
- Sibling 11 × 8-byte array at StatusManager `+548` (reset writes `256000` into the second dword)
- Ctor immediately stores `1500/2000/2500/3000` at `+57556` — **different field**, same class

The only non-zero slot writer found is `sub_1405C1750(status, index, pair)`
(`mov [rdx+1CCh], eax`). Code xrefs: only `sub_1405D99B0`, which is called from:

- `sub_140DC4500` — battle-manager property jumptable case 1031
- `sub_1407B77D0` — vs/event init writes **immediates** `0x1770` (6000) into
  slots 0 and 1; slot 1 may become `0x7D0` (2000) when a hash equals
  `0x250A1720`

No `mov [mgr+2C284]` from a parsed pack was found (AOB store at that
displacement: 0 hits). Editing `character_cost` therefore cannot change this
array, and cannot stop the AV: the faulting operand is the **index**
(payload `+0x10`), not the value stored in a legal slot.

Later `7C8B60` also indexes `+0x2C284` with a copied node field
(`*((unsigned int *)v14 + 4)`). Captured RIP was `7CE3B6`, so the unbounded
**fill** ran first. If `7CE240` zero-fills, `7CE120` does not append
(`if (v9[0]) sub_1407D32B0`), so the later index is also protected.

---

## 4. Hashmap layout (unit `+0x13F60`)

`sub_140DBDA90` looks up key `a3` in `a1+81760` (`+0x13F60`):

| Result | Copy | `payload+0x10` |
|--------|------|----------------|
| empty map | `memset` + explicit zeros | **0** (safe) |
| hit | `sub_140754FC0(dst, node+6)` = node `+0x30` | record field `+0x40` |
| miss, map **non-empty** | `sub_140754FC0(dst, sentinel+48)` | **dirty sentinel** |

`sub_140754FC0` copies `*(DWORD *)(src+16)` onto `dst+16`. That dword is
`v23`.

`sub_140DBAEB0` is one writer: it copies a full payload from `a2` (including
`a2+16`) into the map. Who **computes** a legal `0..10` for vs cost-slot is
**not** pinned this session.

Two crash-data hypotheses (both E0 until a live dump):

1. Hit: playable custom host `900000004` has `+0x10` = character id / garbage.
2. Miss: key not in the map; sentinel `+0x30+0x10` is dirty.

Independent striker `516001001` is usually filtered by the character-list
skip before the table read. The dangerous record is the **playable** host
that list-vtbl does **not** skip.

---

## 5. Why 对战 / 训练 / 单人 diverge

| Mode | Class | `vtbl+0xD0` (from `Proc_UpdateBattle` `sub_14088AA00`) |
|------|-------|------|
| **对战** | `SEQ::CAcSeqBattleFlow_Player` | `sub_1407D01C0` → `7CE720` → `7C8B60` → **`7CE240`** |
| **训练** | `SEQ::CAcSeqBattleFlow_Training` | `sub_140033290` empty stub |
| Skeleton base | `CAcSeqStandardBattleFlowSkeleton` | same stub `0x140033290` |
| Replay | `SEQ::CAcSeqBattleFlow_Replay` | `sub_1407E3560` still reaches `7CE240` via `7E2B60` (not the user scenario) |

Player ctor: `sub_1407C8060` (vftable `0x141383240`).
Training ctor: `sub_1407DFFC0` (vftable `0x141384A90`).

`7C8B60` xrefs: **only** `7CE720`. `7CE720` xrefs: **only** `7D01C0`.
That collect is Player-vs HUD exclusive.

`7CE720` gates (explains “same process, first vs survived, next vs died”):

1. `*(byte*)(this+6712)` / `+0x1A38` already set → return 0 (no fill).
2. Child `*(this+1176)` `vtbl+584` (`0x248`) true → skip fill, but
   `7D01C0` still latches `+0x1A38`.
3. Timer `+1184/+1188` valid and `elapsed <= 300` → same skip+latch.
4. Else `7C8B60` (fill).

Arcade / 单人, if they still use `BattleFlow_Player`, can live via gate 2
(non-vs rule / no `COutHudVs` rank cards). Training never enters `7CE720`.
2v2 vs logs `add_pilot_mc` ×4 and `rank_root_0..3`.

Do **not** poke Training `vtbl+0xD0` to `7D01C0`: Training is `0xD70` bytes
and `7CE720` reads `this+0x1A38`. Local simulation of the **same** collect
is a direct native call to `7CE120` (the only code xref of `7CE240`) **after**
`12CFD0(flow, flow+2012)` succeeds **and** `DBDA30(CSeqBattleApp)` at `+81776`
is non-zero. `7C32D0` only writes the id and queues `1AD420`; it does not
insert. `124560` (from the main tick `19E9C0`) calls `129FA0` then
`12D020(flow, CSeqBattleApp)`. Calling `7CE120` before that insert AVs in
`DBDA30(0)`. Calling it on an inserted app with an empty hashmap is safe
but never enters `7CE240`. Do **not** call `7C8B60` / `7CE720` on Training.
That path is shared; it does not draw vs `rank_root` cards.

`sys_51` does **not** construct `516001001`. Load-time
`sub_14060C980` does. The logged AV is ~1 s after the first `rank_root_0`,
before a completed 前后副射 in that sample. Summon can still *add* a bad
hashmap record (E0); it is not required to explain this particular log.

---

## 6. Call chain (real)

```text
CAcSeqBattleFlow_Player::Proc_UpdateBattle    sub_14088AA00
  vtbl+0xD0 → sub_1407D01C0
    sub_1407CE720                             // latch / vtbl+0x248 / 300-tick
      sub_1407C8B60                           // vs cost collect
        sub_1407CE120                         // for i in hashmap count
          sub_1407CE240                       // ★ unbounded [mgr+0x2C284+8*index]
```

`7CE240` xrefs: `7CE120` only. `7CE120` also from Replay `7E2B60`.
Patching `7CE240` covers Player **and** Replay.

`7CE120` / `7CE240` both resolve the unit via `12CFD0(a1, a1+2012)` then
`*(a1 + 16*slot + 56)`. That pointer is `CSeqBattleApp` (`sub_140DB8F90`,
alloc `0xB5950`), not a playable unit object. `DBDA30` / `DBDA40` /
`DBDA70` read the app hashmap at `+81760`. `7C32D0` (`88BA20`) constructs
that app through `DBB780` → `12BD60` → `DC6740` (which also creates
`CBattleManager` at `qword_1421158A0`) and writes `flow+2012 = app+44`.
The 64-slot table on the **flow** is filled later by `12D020` from
`124560`/`129FA0`, not by `7C32D0`. Training and Player share `88A1F0` →
`88BA20`; Training `vtbl+0x80` / `+0x88` are the empty stub `0x140033290`.
`88BE10` (and `88A360` if `7C4250` is true) is the post-bind idle proc
(`return 0`, leaves `+1128` set so `1AD390` re-enters next tick).

---

## 7. Hook vs files (answer)

**To stop the vs AV you need a native hook / local exe instruction patch.
Editing resource files is not enough.**

| Edit | Stops `0x7CE3B6`? | Why |
|------|-------------------|-----|
| MSC `sys_51` / `0.c` / automata | No | Crash is Player HUD, not spawn |
| `strikertable` / `character_id_table` / striker packs | No | Load/spawn path; not `7CE240` |
| Disk `character_list` (`0xDFD38C70`) | No | Skip flags live in exe `.rdata` `dword_1412E3EC0`, 929 baked IDs. Custom `900000004` is not in that tree. Adding a disk row does not change `vtbl+8/+16/+32` |
| CharacterList / characterparam cost `0x7D1A0ACF` | No | `sub_140532930` maps 1500/2000/2500/3000 → **0–3**; unknown → **0**. That value is the **other** dword next to `v23`, not the unbounded index |
| `character_cost` / `foroutgamecharacterparam_*.bin` | No | Per-unit Cost+HP table. The 11-slot array is `CBattleStatusManager` RAM filled by `5C1750`, not that pack |
| Play Training / skip vs 2v2 | Avoids, does not fix | Training `vtbl+0xD0` is an empty stub |
| Hook / patch `7CE240` `v23 >= 0xB` → `loc_1407CE3CB` | Yes (spec; untested E3) | Same guard `7D90B0` already has |
| Patch baked `.rdata` to give `900000004` skip flags | Would skip HUD, still an **exe** edit | Hides the playable host from vs cost collect; worse than a bounds check |

Do **not** commit a patched `vsac27_Release.exe` into git (UnlicensedGameMaterial).
Do **not** edit Rebellion `sys_51` / EW `0.c` `d0001` gate / automata for this AV.

---

## 8. How to fix (ranked)

### A. Native skip in `7CE240` (recommended crash-stop)

**Spec:** copy `7D90B0`: if `v23 >= 0xB`, take the existing zero-fill
(`loc_1407CE3CB`). Do **not** clamp the index to `0` (that would read the
wrong cost slot and lie on the HUD).

Suggested insertion (semantic, not a finished AOB): after the character-list
vtbl+32 test at `0x1407CE31E` (`jnz loc_1407CE3CB`), before depot
`sub_140365460`:

```text
cmp dword ptr [rsp+138h+var_D8], 0Bh    ; v23
jae loc_1407CE3CB                       ; zero-fill, v9[0]=0, 7CE120 will not append
```

`v23` is already filled by `sub_140DBDA70` before that point.

Side effect: that hashmap entry is omitted from vs cost collect. For a
custom host with a garbage slot this is “no cost card” instead of AV.
Vanilla units with `0..10` are unchanged.

Implementation venue: a local native function detour of `7CE240`. Peek
dest is **0xA0** (`sub_140DBDA90` memset); HUD output is **32** bytes
inside caller `v9[40]`. Do not mix those sizes. Do not record that hook
project in this tree.

This repository documents the spec; it does not ship the exe.

### B. Data: write a legal `0..10` into payload `+0x10`

Root-cause for custom `900000004` if match-make never assigns a vs cost
slot. Writer of `a2+16` into `sub_140DBAEB0` is **not** pinned. Also harden
`sub_140DBDA90` miss path (do not copy sentinel+0x30 as a value).

Larger blast radius. Prefer A first so vs is playable, then dump live
`+0x13F60` for `900000004` / `516001001` to see whether B is still needed.

### C. Make the host take the character-list skip

The skip is **not** a disk `character_list` flag. It is baked IDs plus bits
in `dword_1412E3EC0`. Patching that table in the exe would still be an exe
edit, and would hide a playable host from vs cost HUD. Rejected versus A.

### D. MSC

Rejected. Spawn ABI is settled (J1/J2). This function is not a syscall.

---

## 9. Pre-registered in-game matrix (before any patch)

Patch A is one variable. Do not also change MSC in the same build.

```text
H  after 7CE240 skips v23>=0xB, vs 2v2 with Rebellion+516 no longer AVs at 0x7CE3B6
P  rank_root_0..3 complete; 前后副射 still spawns 516001001; vanilla cost cards still draw
F  still AV at 0x7CE3B6  OR  516 does not spawn  OR  a vanilla 2v2 cost/rank HUD is missing/wrong
```

Discriminators (even without a patch):

1. Vs enter, **no buttons**. Crash at `rank_root` + `0x7CE3B6` → HUD fill, not summon.
2. Training: spam 前后副射 → expect no crash (vtable stub).
3. Vs wait until `rank_root_0..3` done, **then** 副射. Crash then → post-summon hashmap; no crash → this log’s “summon” is coincidence.

Logged crashing match (`22:24:33`): `15009001` / `900000004` / `516001001`
(contexts `0/5` NO AI) / `1006001` / `2005001` / `502001001`. Same process
earlier vs with Rebellion+516 **survived** `rank_root` — consistent with
`7CE720` latch, not with “516 presence at load is sufficient”.

---

## 10. Remaining unknowns

- Live dump of unit `+0x13F60` payload `+0x0C/+0x10` for `900000004` and
  `516001001` in vs vs training.
- Who writes payload `+0x10` (match-make / cost band). `sub_140DBAEB0`
  only copies it. The **table cells** are `CBattleStatusManager+0x1CC`
  (`5C1750`); that is a different object from the index.
- Arcade/单人: `BattleFlow_Player` plus `vtbl+0x248` skip, or a different
  flow class. Not required to explain Training.
- `flow+1176` child class that implements `vtbl+0x248` / `vtbl+0x130`.
- Whether `0x7D1A0ACF` exists for `900000004` (failure returns 0; not the AV).

---

## 11. Agent routing

`--match` keywords `7CE3B6` / `7CE240` / `CAcSeqBattleFlow_Player` /
`对战崩溃` / `召唤就崩` land on cluster `striker-sys51`. Read this note
**and** the spawn owner notes. Do not open the transform bootstrap to
explain this AV.
)
