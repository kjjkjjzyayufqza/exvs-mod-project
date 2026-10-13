# Akatsuki striker — per-action backpack (Oowashi / Shiranui)

Scope: InRepoWork, analysis only. OB v27 (`vsac27_Release.exe`, `OBHK0.3_v27`).
Input: a co-modder's failure report plus the working copies of the striker's
model / MSC / Param packages (local only, `E:\XB\some_bug\`, never committed).

Unit identity: striker `521015001` = Akatsuki, Oowashi pack
(`characterid_021destny_015akatki_001.bin` = `0x1F0E0ED9`). Packages from
`tools/ob_unit.json`: model `0x57F95B5E`, motion `0x793F73DD`, MSC `0xD992FC4F`,
param `0x8869C657`. Player Akatsuki `21015001`: model `0xCCD61019`, motion
`0xE210389A`.

Evidence grades: IDA = E2 (static native proof), asset reads = E1/E2, nothing
here was run in game by this session.

## Goal

Show the Oowashi backpack in striker action index 0 and the Shiranui backpack in
action index 1. Attempt C (add a seventh SHL record `0xC8037486`, add model
folder `0/0/6` with Shiranui, attach `0xC8037486` from `2.c`) did not crash but
showed no backpack. The report asked which extra registration was missing.

## Answer in one paragraph

No extra table is missing. A new SHL record with a free id creates a part
`CShell` from model folder `0/0/<folder>`, and `sys_4B(0x2, id, …)` finds it,
makes it visible and mounts it. The model id is a plain key with no name-hash
check: the Jesta follow-assist mod registered nine new SHL records with CRC32
ids and they rendered in game (mounted by the C++ plugin, not `sys_4B`). The index-1
symptom of attempt C is fully explained by the script: during that test the
whole loadout in `func_995` was still gated by `if (sys_0(0xd0003) == 0)`
(striker action index 0 only). The index-0 symptom (Shiranui attached but not
drawn, Oowashi thruster effects still visible) is **not** explained by any
static rule found; it needs the controlled re-test below.

## Settled engine facts (IDA, OB v27)

### Model package builder — `sub_1408EBBC0` (`Exvs2ResourceInstance`)

Root children by index: 0 `characterid`, 1 `shell_*.shl`, 2 models (`0/0`),
3 ragdoll (`0/1`), 4 empty (`0/2`), 5 helper bones (`0/3`), 6 dynamic bones
(`0/4`), then `vernier_table` and `effect_project`.

- Every child folder of `0/0` becomes one `ModelDataSet`
  (`ModelDataSet::SetupNewFormat`, `sub_1402EE420`). Item role tags in the
  structure `unk2`: `0x10` skeleton, `0x20` texture folder, `0x21` material,
  `0x30` mesh, `0x40` model (needs the mesh first), `0x50` joint table,
  `0x60`/`0x61` animation. Any other tag throws.
- Per model folder the builder pushes the `ModelDataSet`, its `NuModel`
  (`+0x50`), its secondary material list (`+0x28`) and its joint table (`+0x58`)
  into parallel vectors. The SHL `folder_index` indexes these vectors.
- `0/3/i` (`.nuhlpb`) is bound to **model folder i** by position: the helper is
  built against `NuModel[i]`'s skeleton. `0/4/i` (`.nudnbb`) likewise. The file
  names the extractor gives the `.nuhlpb` items are labels only. Vanilla proof:
  `0/3/0` (extracted as `wep_oowashi00.nuhlpb`, 2736 bytes) holds body bone names
  (`KATA_L`, `HIZA_L`, …) and binds to model 0 = `body_normal`.

### SHL loader — `sub_140629DD0` → `sub_14062A3E0`

Record layout (0x20 bytes, after the 0x10 header):

| Offset | Meaning (proven) |
|---|---|
| `+0x00` | model id — free key into the shell maps, no hash check |
| `+0x04` | type: 0/5 body, 1/3/6 part, 4 other object, 2 projectile spawn descriptor |
| `+0x08` | model folder index (`0/0/<n>`) |
| `+0x0C` | only read for type 0/5 |
| `+0x10` | helper-bone vector index; bounds-checked (crash) for types 2/3/6 |
| `+0x14` | second resource index (0 in every sampled record), passed to the part |

- Type 0/5 → main map (`sub_1405E9580`); the first one becomes the active body.
- Type 1/3/6 → `sub_140629F00` builds a `CShell` (`sub_1406141E0`: visible
  `+0x60` = 0, mount bone `+0xC8` = -1, parent `+0xCC` = 0, enable `+0xD8` = 1)
  and `sub_1405E9500` inserts it into the part map (shell collection `+0x48`);
  an existing id is not replaced.
- Types 2/3/6 also append a spawn descriptor (`sub_1405E9400`).
- Global type-6 shells from the common SHL are added by `sub_14062A280`.

### `sys_4B` — `sub_14067F620`

- Case 2: `sub_14035D8D0` searches the main map, then the part map, and returns
  0 when the id is absent. The handler then writes `+0x60 = 1`, so an
  unregistered id is a null write — attempt A's crash. The fourth argument is
  looked up with `sub_14067AF10`, which throws `invalid unordered_map<K, T> key`
  on a miss. `sub_1405E7EC0` → `sub_140614430` stores parent / bone / parent id
  (`+0xC0` / `+0xC8` / `+0xCC`).
- Case 4 (`sub_1405E8990`) returns registered **and** visible.
- Case 0x13 (`sub_14067F0C0`) writes an alias map at shell collection `+0x1D8`:
  `alias[arg1] = arg2`. Native per-unit init uses the same insert
  (`sub_140610170`; `sub_14036B780` registers 24 pairs after `sub_14060C980`).

### Motion bundle playback — `sub_1405E98C0`

For a folder-format motion (entry type 2), clip 0 plays on the body. Each further
clip carries a model id (the structure item `unk2`). The engine plays it on the
part with that id; if no part has that id it resolves the alias map
(`sub_1405E8600`). An invisible target part is mounted on the body at its stored
bone and stays invisible (only `0xF71889A5`, `0x0D17B4C6`, `0x0A511381` are
forced visible). Parts parented to the body that are not channels of the bundle
(`sub_1405E8680`, alias-aware) restart their own pose layer when visible. A
missing channel never hides a part.

## Asset facts

| Item | Value |
|---|---|
| Vanilla striker SHL | body `0x3F5A73D4` (f0); Oowashi `0x106F8954` t3 f1; shield `0x67EBDD5F` t3 f2; rifle `0x52363F8D` t3 f3; left hand `0x0D5AFD1A` t1 f4; right hand `0x3ABB1A89` t1 f5 |
| Player SHL (14 records) | body `0x785E37BE`; Oowashi `0xFD575A6B` t3 f1; **Shiranui `0xC8037486` t3 f2**; shield `0xE7BBC2DF` t3 f4 |
| Striker motion `0x793F73DD` bundle channels | player ids: body `0x785E37BE` ×11, shield `0xE7BBC2DF` ×8, Oowashi `0xFD575A6B` ×7, **Shiranui `0xC8037486` ×4** (guard family) |
| Striker `func_995` | `sys_4B(0x13, 0xfd575a6b, 0x106f8954)` — routes the player-id Oowashi channels to the striker's own Oowashi |
| Player Shiranui attach | `sys_4B(0x2, 0xc8037486, 0xc7ff0ad8, 0x4b55406e, 0x785e37be)` |
| `0x4B55406E` | Shiranui wepdef pose; present in player motion `0/0`, **absent** from striker motion |
| `0x3859A866` | Oowashi wepdef pose (both packs); identity on `GBL_RT` / `CENTER_RT` / `BP`, no zero scale |

The striker motion package was authored with the player's model ids, which is
why `0xC8037486` "matches" across packages: the co-modder copied the player's
Shiranui id, and the motion data already uses it. It is not a packer-generated
value.

The "unk2 (LE (structure))" field the report saw is the motion-package editor
field: folder-bundle child item `unk2` = channel model id
(`docs/model-attachment-and-motion-bundle.md`). It is not part of the model
package.

`sys_0(0xd0003)` is the striker action index (`sys_51` argument 5), see
`docs/msc-research/sys51-striker-action-index.md`.

## What attempt C actually ran (rebuilt from the backup timestamps)

| Time (2026-10-13) | Change |
|---|---|
| 01:14 | `0.c` swaps index 0 / 1 (ported action `0x4C096D39` becomes index 0) |
| ~03:40 | Attempt B: Shiranui files copied over the Oowashi folder |
| 05:28 | `0.c` swaps back: index 0 = original `0x7C5F9EE3`, index 1 = ported `0x4C096D39` |
| 05:33 | SHL record 6 `folder` 2 → 6 |
| 05:50 → 07:28 | **Tested state**: the two loadout `sys_4B(0x2, …)` calls use `0xc8037486`; alias, effects and `sys_4B(0x4, …)` still use `0x106f8954`; `func_995` still has `if (var0 == 0)` |
| 07:28 | Backpack id rolled back; the loadout made unconditional |

Consequences:

1. Index 1 (ported action) never ran `func_1004`: no backpack, rifle, shield or
   hands. Its "no backpack" result says nothing about the SHL record.
2. The thruster effects are `sys_47(0x11, 0x106f8954, …)` in `func_978`, gated
   by `global4 != 0x4c096d39`, not by attach state. In index 0 the bundles'
   `0xFD575A6B` channels are aliased to the unattached Oowashi, which mounts it
   invisibly on the body — exactly "effects without a model".
3. Index 0: `0xC8037486` was attached, visible, parented to the body and has
   no hiding channel. Static analysis predicts it is drawn. **Open.**

## Other defects in the working copy

- `Model_57F95B5E_structure.json` items 74 / 75 point to
  `wep_shiranui00.nusktb` / `.numshb`, but the files on disk are now named
  `__maya__`. Repacking from this JSON fails or packs stale data.
- `0/3/4` (extracted as `body_normal.nuhlpb`) now holds the 2736-byte body
  helper and binds to model 4 (`wep_handl_ngr00`). Vanilla is 88 bytes. The
  "vanilla nuhlpb ownership is swapped" remark in the report is the extractor
  label, not a real difference. Restore 88 bytes.
- The report calls `0x0D5AFD1A` / `0x3ABB1A89` shield and sword. They are the
  left / right gripping hands (type 1, folders 4 / 5, mounts `0x8` / `0xC`).
- Attempt C kept the Oowashi pose `0x3859A866` for Shiranui. Using the correct
  `0x4B55406E` requires copying that clip into the striker motion package first,
  or `sub_14067AF10` throws.

## Next in-game checks (H / P / F, one variable per build)

Base: current `2.c` (loadout unconditional), test action index 0 only.

| # | Change | P (expected) | F (falsifier) |
|---|---|---|---|
| E1 | SHL record 6 → folder **1**, slot 1 (two records may share a folder; the player SHL does it); attach `0xC8037486` | Oowashi geometry visible under the new id | Invisible → the new-id path fails at runtime; add the probe |
| E2 | SHL record 1 (`0x106F8954`) → folder **6**, slot 6; attach `0x106F8954` | Shiranui visible | Invisible → folder `0/0/6` (content or packing) is at fault |
| E3 | E1 and E2 pass: record 6 folder 6, attach `0xC8037486` with pose `0x4B55406E` copied into motion `0/0` | Shiranui visible in index 0 | Invisible with E1 and E2 passing → interaction of id and folder; probe |

Probe (OBHK plugin, if any check fails): after `func_1005`, dump each part map
entry: id, `+0x60`, `+0xC0`, `+0xC8`, `+0xCC`, `+0xD8`, model pointer, mesh count.

Per-action target once E3 passes: keep both records (`0x106F8954` f1,
`0xC8037486` f6); in the loadout branch on `sys_0(0xd0003)`: index 0 attaches
`0x106f8954` with `0x3859a866` and keeps the alias; index 1 attaches
`0xc8037486` with `0x4b55406e`. Follow the MSC evidence gate
(`docs/msc-research/msc-evidence-grade-and-ingame-audit-protocol.md`) before
editing `2.c`.

## Local evidence (not committed)

- Bug folder: `E:\XB\some_bug\` (report, model / MSC / param working copies,
  timestamped backups).
- Vanilla extracts used for comparison: `fhm2d-extract` of `0x57F95B5E`,
  `0xCCD61019`, `0x793F73DD`, `0xE210389A` from
  `E:\OBHK0.3_v27\data\x64\dplcache_release\` into a session scratch folder.
