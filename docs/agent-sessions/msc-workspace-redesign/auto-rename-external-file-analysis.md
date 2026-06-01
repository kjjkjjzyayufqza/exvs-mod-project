# MSC Auto-Rename: Old vs New, and the External-File Question

Goal: determine how the "new" MSC auto-rename works and what external file it should reference,
grounded in the actual EXVS2 resource dump at `e:\XB\解包\vs2\x64`.

## Two distinct auto-rename systems

| | OLD (0.bin -> 2.bin) | NEW (hash dispatch) |
|---|---|---|
| Implementation | `src/page/TestEditor/utils/mscActionRename.ts` | not yet implemented as a generic pass |
| Key in script | action MASK (`global48 & 0xMASK`) parsed from `0.c func_143` | action HASH `func_241(0xHASH, cb)` / `bindActionHashHandler(0xHASH, cb)` |
| Names produced | generic A/B/C semantics (A_SHOT, B_MELEE, AB_SUB...) | per-action callback name |
| Source of truth | derived in-pack from `0.c` | an external dictionary keyed by action hash |
| Scope | tuned to one script layout (func_143/func_95/func_241) | character-agnostic if the dictionary is complete |

The action hash is the real dispatch key (see `docs/exvs-msc-input-action-weapon-pipeline.md`):
input -> `pendingActionHash` -> `activeActionHash` -> `sys_0(0x10002,0x2,hash)` fetches the
registered callback. The hashes are CRC32 of authoring-time identifiers.

## Evidence: where do the action hashes live?

Method: extracted every `func_241(0xHASH,...)` / `bindActionHashHandler(0xHASH,...)` binding from the
analyzed common pack `E:\XB\解包\com\file\0xF1EF3B32\2.c` (**54 distinct action hashes**), then
byte-scanned the EXVS2 resource tree for those 32-bit values.

Endianness note: param files store hashes little-endian (data); MSC bytecode stores opcode params
big-endian. The scan used LE, so it finds hashes in param data but not inside `.mscsb` bytecode.

| Resource area | Action hashes found |
|---|---|
| `041cpm/chrsys/*.csyspm` (character system param) | **8 / 54** |
| `041cpm/arms_param`, `bullet_param`, `character_param`, `grap_param`, `hitgroup`, `interaction`, `shell`, `speed_param`, `striker`, `character_id` | 0 / 54 |
| `100system`, `012list`, `020common`, `800etcetera`, `060navi`, `011camera`, `005renderinfo` | 0 / 54 |
| `040msc` (120 MB of MSC, scanned LE) | 0 (hashes are BE inside bytecode) |

**46 of 54 action hashes do not appear in ANY resource file.** They are CRC32 of identifiers that
only exist at authoring time. There is no EXVS resource that is a complete `hash -> name` dictionary.

The 8 action hashes present in `.csyspm` (LE), i.e. the system/core subset that needs per-character
system params:

```
0x0E962048  0x178D1109  0x241FE4D0  0x3AC14535
0xA2236F44  0xCCE1225F  0xDBA6C1CC  0xF48D2D49 (main shot)
```

`0xF48D2D49` (main shot) appears in 15 different characters' `.csyspm`, confirming the action hash
vocabulary is **global/shared** (main shot has the same hash for every character) and that
`0xF1EF3B32` is almost certainly the **common ("com") action-framework MSC**, not a single unit.

The localized command list `010localizedtext/commandlist/*.ntx` does NOT contain these hashes and is
encrypted/packed localized UI text. It is not a hash->name source.

## Conclusion: what the "external file" is, and what it should be

1. In our tooling, the external file that replaces the `0.c`-derived heuristic is
   `tools/mappings/exvs_0xF1EF3B32.native_truth.json`, specifically its `callback_bindings_seed`
   (`action_hash -> callback_symbol_hint`). That dictionary is currently hand/tool-seeded from
   behavioral reverse-engineering plus `tools/crc32_reverse_search.py`.

2. In native EXVS resources, the only file family that shares the action-hash space is the
   character system param `.csyspm` (`041cpm/chrsys/`). It can corroborate and scope the ~8 core
   system actions (including main shot) but is NOT a complete or human-readable name source.

3. Therefore the new auto-rename cannot be backed by a single EXVS data file. The right design is a
   versioned JSON dictionary `action_hash -> name`, populated from three sources, in priority order:
   - behavioral names already recovered in `2.c` analysis,
   - CRC32 reverse-search hits (`crc32_reverse_search.py`),
   - `.csyspm` cross-reference for the system-action subset.
   Auto-rename then becomes: parse `2.c` `func_241`/`bindActionHashHandler` bindings -> look up each
   hash in the dictionary -> rename the callback. This is character-agnostic and external-file
   driven, matching the "depends on an external file" recollection.

## Refinement from per-unit sample `0x693F756D` / `0x38C44F75`

Using the concrete unit sample:

- MSC: `E:\XB\解包\com\file\0x693F756D`
- param/ammo bundle: `E:\XB\解包\com\file\0x38C44F75`

the picture becomes more precise.

### 1. This sample is structurally incompatible with the old mask renamer

The old TS helper `mscActionRename.ts` assumes:

- `0.c func_143`
- nested `global48 & MASK` branches
- `func_95(hash, callback, ...)`

But in `0x693F756D/0.c`, `func_143()` instead does:

- `var0 = sys_41(...)`
- `var1 = func_144(var0)`
- `func_145(var0, var1, 0)`

So the legacy mask-based rename path is not just incomplete here; it is the wrong structural model.

### 2. New-style dispatch is layered: action hash -> callback -> slot callback -> slot-hash table

The `2.c` registration table is in `func_1219()`:

- `func_241(0x6d00aeaa, func_390)`
- `func_241(0x9cf36e1b, func_392)`
- ...
- `func_241(0x900ab393, func_482)`

For many of these callbacks, the first real branch is not direct resource spawn, but:

- `func_69(slot)` inside the action callback
- `func_69()` loads `sys_0(0x10001, 0x2, slot)` and executes it immediately
- that slot table is populated by `func_1220()` via
  `sys_1(0x10001, 0x2, slot, func_112x/func_115x)`

Examples:

- `0x6d00aeaa -> func_390 -> func_69(0x1) -> func_1124`
- `0x9cf36e1b -> func_392 -> func_69(0x2) -> func_1125`
- `0x900ab393 -> func_482 -> func_69(0x35) -> func_1158`

Those slot callbacks frequently call `func_74(slotB, delay)`, which resolves a second table:

- `func_74()` -> `func_79()`
- `func_79()` loads `sys_0(0x10001, 0x3 + global170, slotB)`
- `func_1221()` pre-populates that table with `sys_1(0x10001, 0x3, slotB, hash)`

Examples:

- `func_1124` uses `func_74(0, 0xA)` -> slot-hash `0x1f588bd9`
- `func_1125` uses slots `2/3/4` -> `0x377e9872 / 0xd74ba485 / 0xf0b3ea12`
- `func_1158` uses `func_74(0x4F, 0)` -> slot-hash `0xb189334e`

Across the sample, this `0x10001,0x3` slot table contains **38 unique hashes**.
Byte-scanning the full `0x38C44F75` param bundle shows **none of those 38 hashes occur in the bundle**.

So this second hash table is **internal script-side state/motion/action data**, not the ammo file.

### 3. The ammo bundle appears later, as resource semantics, not as the primary action-name dictionary

The sample still uses the external param bundle heavily, but at a different layer:

- `func_1158()` directly issues six `sys_4F(0, 0x5, 0x...)` calls whose hashes exist in `bulletparam.bin`
- the same function also hits `interactionid.bin` via `sys_58(0, 0x2d1b6b6d)`
- other functions hit `chrsysparam.csyspm` (`0x56a95d29`, `0xaca6604a`, `0x8bae1423`, ...)

Concrete traced example:

- `0x900ab393 -> func_482 -> func_69(0x35) -> func_1158`
- `func_1158` uses bullet hashes:
  - `0x9700595f`
  - `0x0e0908e5`
  - `0x790e3873`
  - `0xe76aadd0`
  - `0x906d9d46`
  - `0x0964ccfc`
- and later an interaction hash `0x2d1b6b6d`

This is strong evidence that the external param/ammo pack is a **secondary semantic layer**:
it tells us what concrete projectile / interaction / system resources a callback uses,
but it does **not** by itself provide the primary `action_hash -> callback_name` mapping.

### 4. There is a directly usable label surface in params, but the current toolchain does not decode it yet

One important codebase-level finding changes the implementation roadmap:

- `armsparam.rs`, `characterparam.rs`, and `speedparam.rs` all declare:
  - `0xE6213731` -> `action_label_offset` (kind 7)
  - `0xF3C4CAE9` -> `resource_label_offset` (kind 7)
- `command_mapping.md` also marks them as shared string/blob references

The current generic parser still does **not** resolve kind-7 strings:

- `src-tauri/src/commands.rs parse_command_table_file()` returns kind `7` as raw `u32`
- `value_string` stays `None`

But the decode rule is now identified:

- kind-7 label records in `armsparam` / `characterparam` / `speedparam`
  are encoded with the **same `obf_string` byte transform already used by**
  `src-tauri/src/format/characterlist.rs`
- they should be decoded from **byte 0 of the pointed record**, not from a
  secondary inner offset

That means the problem is no longer "reverse an unknown blob format".
The problem is now "wire the existing obfuscated-string decoder into the param pipeline".

### 4b. The kind-7 blobs already have a repeatable binary record shape

Further byte-level inspection of the currently extracted param bundles under
`E:\XB\解包\com\file` makes the label-blob picture sharper:

- scanned files:
  - `7` `armsparam.bin`
  - `7` `characterparam.bin`
  - `7` `speedparam.bin`
- valid `action_label_offset` / `resource_label_offset` pairs observed:
  - `42` arms pairs
  - `12` character pairs
  - `15` speed pairs

Across **all** of those observed pairs:

- `resource_label_offset` always points to a fixed-length `0x1C` binary record
- every resource record starts with the same 4-byte head:
  - `83 9F 86 0A`
- every resource record ends with the same 4-byte tail:
  - `42 FC 19 00`
- `action_label_offset < resource_label_offset` in every valid pair

And the action records are family-typed rather than generic text:

- `armsparam action_label` records always start with:
  - `8B AA 36 0A`
- `characterparam action_label` records always start with:
  - `8F A7 22 EA`
- `speedparam action_label` records always start with:
  - `A3 96 32 0A`

The strongest relationship is in `armsparam`:

- for every same-entry action/resource pair, bytes `4..26` are identical
- only the first 4 bytes differ (`8B AA 36 0A` vs `83 9F 86 0A`)
- after that shared body, the action record continues with extra action-specific bytes
  before its terminating `00`

So `armsparam` is not storing two unrelated strings. It is storing two related binary
label records with:

- a shared middle body
- a record-type-specific head
- an action-only tail extension

One more important negative result:

- byte-scanning `vs2\x64/010localizedtext`, `020common`, and `100system` for the exact sample
  `0x38C44F75` resource-label record found **no matches**
- the exact sample record only appears in:
  - `0x38C44F75/armsparam.bin`
  - `0x38C44F75/characterparam.bin`
  - `0x38C44F75/speedparam.bin`

The earlier "fixed binary record" observation was real, but the meaning is now clearer:

- `83 9F 86 0A ...` is simply an obfuscated string starting with `CHR_...`
- `8B AA 36 0A ...` is an obfuscated string starting with `GUN_...`
- `8F A7 22 EA ...` is an obfuscated string starting with `ORDER_...`
- `A3 96 32 0A ...` is an obfuscated string starting with `SKL_...`

Batch validation over the currently extracted corpus (`7` arms + `7` character + `7` speed files)
decoded **100%** of observed label records into plausible ASCII/identifier-style names:

- `42 / 42` arms action labels
- `42 / 42` arms resource labels
- `12 / 12` character action labels
- `12 / 12` character resource labels
- `15 / 15` speed action labels
- `15 / 15` speed resource labels

Examples:

- arms resource:
  - `CHR_059NEXTGN_001NEXTGE_001`
- arms action:
  - `GUN_059NEXTGN_001NEXTGE_001_BOMBER_KNUCKLE_ERUPTION`
  - `GUN_021DESTNY_001STRKFR_001_FULLBURST`
  - `GUN_015GNDMUC_004DELTPL_001_BEAMRIFLE`
- character action:
  - `ORDER_0`
  - `ORDER_1`
  - `ORDER_2`
- speed action:
  - `SKL_MOVE`
  - `SKL_MOVE_SEED`
  - `SKL_MOVE_BARST`

So kind-7 is not merely a promising clue anymore.
It is a confirmed human-readable naming surface stored inside the unit's external param bundle.

### 4c. At least one decoded label is directly consumed by the script

For the concrete sample `0x693F756D` / `0x38C44F75`:

- `speedparam.bin` decodes entry id `0xC2B19D12` as `SKL_MOVE`
- the script `2.c` initializes:
  - `global142 = 0xc2b19d12`
- later the script repeatedly queries:
  - `sys_0(0x60006, global142, <speedparam field hash>)`

Those field hashes (`0x607C25BC`, `0x97BE8DFC`, `0x7C2572A1`, etc.) match the
`speedparam` command pool.

So the decoded kind-7 label is not just editor-facing metadata.
It is the readable name of a script-consumed param key/state (`SKL_MOVE`).

### 5. The repository currently references, but does not ship, the CRC32 reverse-search tool

Docs reference `tools/crc32_reverse_search.py`, but the file is not present in the repo.
Only the planning doc exists:

- `docs/superpowers/plans/2026-04-03-crc32-reverse-search-tool.md`

So the current codebase has:

- docs/plans for CRC32 reverse lookup
- no checked-in implementation

This means a future rename pipeline cannot depend on that script today without first building it.

## Updated implementation direction

The refined model is now:

1. **Primary callback naming layer**:
   a versioned `action_hash -> name` dictionary (global/shared vocabulary)
2. **Script-structure layer**:
   parse `func_1219` / `func_1220` / `func_1221` so the tool understands
   action callback -> slot callback -> slot-hash-table routing
3. **Per-unit semantic enrichment layer**:
   cross-reference callback/resource hashes against the unit's param bundle
   (`bulletparam`, `interactionid`, `chrsysparam`, etc.)
4. **Kind-7 label decode layer**:
   decode `action_label_offset` / `resource_label_offset` using the existing
   `obf_string` transform already used by `characterlist`

So the earlier conclusion still holds in spirit:

- the ammo bundle is **not** the complete action-hash dictionary

But it should now be refined to:

- the new auto-rename path is probably **hybrid**
- global action names come from a shared hash dictionary
- per-unit params contribute weapon semantics
- per-unit kind-7 labels contribute directly readable names for
  weapon/resource/order/movement surfaces

## Practical next step for the tool

1. Extend `native_truth.json` with a first-class `action_names` map
   (`{ "0xF48D2D49": "mainShot", ... }`)
2. Add a TS/Python pass `renameByActionHashDictionary(2.c, dictionary)` for the primary names
3. Add a second pass that parses:
   - `func_1219` action registrations
   - `func_1220` slot-callback registrations
   - `func_1221` slot-hash registrations
   - direct `sys_4F/sys_58/sys_47` resource hashes
4. Use the unit's param bundle to append low- or medium-confidence semantic suffixes
5. Implement kind-7 label decoding in the parser/UI path before claiming the params can provide
   final human-readable weapon names in-app
