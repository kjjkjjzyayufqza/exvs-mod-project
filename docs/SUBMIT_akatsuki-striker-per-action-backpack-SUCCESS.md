
# Per-action backpack switching on the akatsuki striker — implemented and verified

**Date:** 2026-10-14
**Status:** **verified in-game** (working)
**Related:** `2026-10-14-akatsuki-striker-per-action-backpack.md` (analysis + test plan), `shl-format-analysis.md`, `exvs-msc-syscall-4b-notes.md`

## 1. Result

| Action (striker action index) | Backpack shown |
|---|---|
| index 0 (original action) | **Oowashi** |
| index 1 (ported combo: beam CS → relay → back-melee rifle throw) | **Shiranui** |

Verified: correct from the very first frame after the summon (including the entry motion), correct after the relay into the second segment, correct when switching back and forth between indices.

## 2. What was done

### 2.1 Register a new equipment id in the pack's own `shell_*.shl`

`002chara/Model_57F95B5E/shell_021destny_015akatki_001.shl` (208 B / 5 records → 240 B / 6 records):

```
header 48 B : magic "SHLL" | +0x04 = 100 | +0x0C = record count + 1 | +0x10 = root object id
records 32 B: modelId, modelType, folderIndex, slotIndex, w0, w3, u4, u5

[0] 0x106F8954 type=3 folder=1 slot=1 w0=1   Oowashi backpack
[1] 0x67EBDD5F type=3 folder=2 slot=1 w0=2   shield
[2] 0x52363F8D type=3 folder=3 slot=1 w0=3   rifle
[3] 0x0D5AFD1A type=1 folder=4 slot=1 w0=4   left-hand hold model
[4] 0x3ABB1A89 type=1 folder=5 slot=1 w0=5   right-hand hold model
[5] 0xC8037486 type=3 folder=6 slot=1 w0=6   ★ Shiranui backpack (added by us)
```

- `folderIndex` was confirmed to be **the name of the packed `0\0\<N>\` sub-directory** (checked by unpacking with `fhm2d_extract.exe -t character -l folder`): in this pack `0\0\6` = `wep_shiranui00`.
- `+0x0C` was set to 7 (= record count + 1); `+0x10` was left at the pack's own value (`0x3F5A73D4`, which is also the 5th argument of every `sys_4B(0x2, …)` call in this pack).
- Consistent with the earlier analysis: **no other table needs to be synchronised**; `modelId` is just a key.

### 2.2 Per-action attach / detach (all inside the summoned unit's MSC)

**(a) At summon time — choose by the striker action index.** Immediately **after** the loadout's own attach of the default backpack:

```c
sys_4B(0x2, 0x106f8954, 0xc7ff0ad8, 0x3859a866, 0x3f5a73d4);   /* default: Oowashi (existing line) */
if (sys_0(0xd0003) == 0)
{
    sys_4B(0x3, 0xc8037486);
    sys_4B(0x2, 0x106f8954, 0xc7ff0ad8, 0x3859a866, 0x3f5a73d4);
}
else
{
    sys_4B(0x3, 0x106f8954);
    sys_4B(0x2, 0xc8037486, 0xc7ff0ad8, 0x3859a866, 0x3f5a73d4);
}
```

> `sys_0(0xd0003)` returns the action index the host passed in
> (`sys_51(0x20000, 0, 0x2, slot, actionIndex)`).
> **It must run *after* the default attach** — inserting it before meant the default attach immediately
> overwrote it, and the first visible frame was still the old backpack.

**(b) In the ported action's tick, frame 1** (inside the existing `if (global4 == 0x4c096d39)` block, frame-1 guarded):

```c
if (func_309(global20, 0x64))          /* frame 1; 100 units = 1 frame */
{
    sys_4B(0x3, 0x106f8954);
    sys_4B(0x2, 0xc8037486, 0xc7ff0ad8, 0x3859a866, 0x3f5a73d4);
}
```

**(c) Repeat once in the second segment of the relayed combo** (the rifle-throw action's tick), because the relay otherwise reverts the look.

**(d) Restores in other actions must be guarded by the action hash**, otherwise they fire during the relay:

```c
if (global4 == 0x7c5f9ee3)             /* only inside action index 0 */
if (func_309(global20, 0x64))
{
    sys_4B(0x3, 0xc8037486);
    sys_4B(0x2, 0x106f8954, 0xc7ff0ad8, 0x3859a866, 0x3f5a73d4);
}
```

**Design rule:** every segment of an action chain asserts its own appearance (idempotent). This is far more robust than relying on exit timing.

## 3. Root causes of "registered but never rendered"

### 3.1 Cause 1 — the packer followed a stale `*_structure.json` entry into a different asset

`002chara/Model_57F95B5E_structure.json` entries **[74]/[75]** pointed at the **no-prefix** names:

```
[74] ..._wep_shiranui00.nusktb
[75] ..._wep_shiranui00.numshb
```

while the correct Shiranui asset is the **prefixed** six-file set
(`.jnttbl`, `.numdlb`, `__maya__.numatb`, `__maya__.numshb`, `__maya__.nusktb`, `__nust__.numatb`).
The no-prefix `X.numshb`/`X.nusktb` belong to **another (pbr1) asset branch** that was left in the same folder.

So the packer packed the wrong mesh:

| | correct (reference / after fix) | what the pack actually contained |
|---|---|---|
`__maya__.numshb` | **462,440 B / `AEFE8FF4020F710E`** | **545,744 B / `6D327851E4017D7A`** |
`__maya__.nusktb` | 8,616 B / `275C40678F0376AB` | the other branch's skeleton |

Consequence chain (this fully explains the symptom):
1. the packed mesh's objects are `(SHAPE_ROOTShape,0)` + **`(SHAPE_ROOTShape__sub1,0)`**;
2. the `numdlb` (identical in both packs, hash `BFFBF2246B712230`) only declares material entries for `(SHAPE_ROOTShape,0)` and `(…,1)`;
3. ⇒ the second object (2022 verts = backpack body + DRAGOONs) has **no material sphere** ⇒ **the part is not drawn at all**, while the entry itself is valid and visible (no crash).

This is consistent with the "not rendering = wrong material sphere or missing material" rule — here the mismatch is between mesh objects and the `numdlb` material entries, not in the material files themselves (both `numatb` files and all 22 textures compared byte-identical, SHA-256, zero differences).

### 3.2 Cause 2 — after removing the stray files, the structure entry dangled ⇒ repack failure

The fix is **not** to delete the entries (that shifts the packed `0\0\<N>\` numbering), but to

> **rename entries [74]/[75] in place to the prefixed filenames** (record count and order unchanged ⇒ the `0\0\<N>\` numbering does not shift).

The same two entries were fixed in `akzmodel_structure.json`. After the fix, the packed `__maya__.numshb` is 462,440 B / `AEFE8FF4020F710E` and `__maya__.nusktb` is 8,616 B / `275C40678F0376AB` — exactly the expected values.

### 3.3 Additional cleanup

- Model package source folders must not contain backup files (`*.bak`, "备份"/"改前", `_备份_` folders): they get packed and can disturb the packer's file selection.
- Each sub-package folder must contain **only the six files of one asset branch**.

## 4. Confirmations of the earlier analysis

- Adding a `shell_*.shl` record needs **no other table sync**; the loader builds a part from `0/0/<folderIndex>` keyed by `modelId`, and `sys_4B(0x2, modelId, …)` finds it, marks it visible and attaches it to a bone.
- `modelId` is just a key: not a name hash, not generated by the packing tool.
- Referencing an id that is not registered in this pack ⇒ `sys_4B(2)` gets a null pointer but still writes the visibility flag ⇒ **crash** (reproduced twice, reverted).
- `sys_4B(0x13, A, B)` is an alias table (tracks of A are redirected to B); the assist's action package already contained four guard tracks keyed `0xC8037486` because it was copied from the player version.
- `0/3/i` (`.nuhlpb`) and `0/4/i` (`.nudnbb`) are bound **by position** to the i-th model; the extractor's filenames are meaningless.
- Action-package `unk2` (folder-format sub-clips) is the model id that sub-clip drives.

## 5. Checklist for reuse (multi-form / equipment-swapping units)

1. In the reference unit, find the target sub-package and its `.shl` record → copy `modelType`/`slotIndex`; `folderIndex` must be the **post-pack** directory number; `w0` = `folderIndex`.
2. Append the record to this pack's `.shl` and set `+0x0C` = record count + 1; keep `+0x10` at this pack's own value.
3. Put the **complete six files of one asset branch** into `models/<subpackage>/` and **update `*_structure.json` fileUrl accordingly**.
4. Pack the model package → **unpack and verify** directory number and mesh size/hash.
5. Script: `sys_4B(0x2, newId, bone, actionHash, parent)` to attach; switch per action / per summon-time as in section 2.
6. Pack the MSC package and test; if the striker table was touched, **fully restart the game** (it is not hot-read).

## 6. Reproduction data

| File | Size | sha16 |
|---|---|---|
`040msc/Msc_D992FC4F/2.c` | 602,544 B | `7502633ba6563cd1` |
`040msc/Msc_D992FC4F/2.dscex` | 257,008 B | `2a578517c6b0eaa2` |
`002chara/Model_57F95B5E/shell_021destny_015akatki_001.shl` | 240 B (6 records) | — |
`H:\obv27\obv27\data\x64\mod\0x57F95B5E.fhm2d` | 10,280,412 B | packed `0\0\6\` = Shiranui (`__maya__.numshb` 462,440 B / `aefe8ff4020f710e`) |

Unpack command used for verification:

```
fhm2d_extract.exe <pkg> -o <dir> -t character -l folder 2> stderr.txt
```
