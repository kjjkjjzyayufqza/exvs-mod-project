# MSC Auto-Rename: Old vs New, and the External-File Question

Goal: determine how the "new" MSC auto-rename works and what external file it should reference,
grounded in the actual EXVS2 resource dump at `e:\XB\解包\vs2\x64`.

## Two distinct auto-rename systems

| | OLD (0.bin -> 2.bin) | NEW (hash dispatch) |
|---|---|---|
| Implementation | `src/page/TestEditor/utils/mscActionRename.ts` | not yet implemented as a generic pass |
| Key in script | action MASK (`global48 & 0xMASK`) parsed from `0.c func_143` | action HASH `func_241(0xHASH, cb)` / `bindActionHashHandler(0xHASH, cb)` |
| Names produced | generic A/B/C semantics (A_SHOT, B_MELEE, AB_SUB...) | per-action callback name |
| Source of truth | derived dynamically in-pack from `0.c` control flow | **unknown**; no complete action-hash record file has been found |
| Scope | tuned to one script layout (func_143/func_95/func_241) | must be per-script dynamic mapping, not dictionary lookup |

The action hash is the real dispatch key (see `docs/exvs-msc-input-action-weapon-pipeline.md`):
input -> `pendingActionHash` -> `activeActionHash` -> `sys_0(0x10002,0x2,hash)` fetches the
registered callback. The values are action-hash-like dispatch keys, but the resource file that
records their original names has **not** been found.

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

**46 of 54 action hashes do not appear in ANY scanned resource file.** There is no evidence for a
complete EXVS resource file that can be used as `action_hash -> name`. The tool design must treat
the action hash source as unsolved rather than fill the gap with a dictionary.

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

## Corrected Conclusion: no dictionary path

2026-06-02 correction from user direction:

- The user explicitly does **not** want an `action_hash -> name` dictionary.
- Do not design the new auto-rename as "look up hash in JSON, then rename".
- The old rename path did not depend on a dictionary. It dynamically inferred fixed gameplay
  labels such as Shoot/射击, Melee/格斗, Sub/副射, Special Shoot/特射, and
  Special Melee/特格 from script structure.
- The new rename path should follow the same spirit: dynamically map script routes and derive
  names from observed control/resource relationships.
- So far, we have **not** found the file that records the new action hash names.

## What the current external evidence means

1. In our tooling, the external file that replaces the `0.c`-derived heuristic is
   `tools/mappings/exvs_0xF1EF3B32.native_truth.json`, specifically its `callback_bindings_seed`
   (`action_hash -> callback_symbol_hint`). This must be treated as historical evidence from one
   analyzed common script, not as the desired product design for new MSC auto-rename.

2. In native EXVS resources, the only file family that shares the action-hash space is the
   character system param `.csyspm` (`041cpm/chrsys/`). It can corroborate and scope the ~8 core
   system actions (including main shot) but is NOT a complete or human-readable name source.

3. Therefore the new auto-rename cannot be backed by a single known EXVS data file today. It should
   be a dynamic mapping pass:
   - parse `2.c` action registration (`func_241` / `bindActionHashHandler`)
   - parse the slot-callback and slot-hash tables
   - trace each action callback into slot/resource usage
   - infer stable gameplay labels from the graph, known fixed gameplay categories, and decoded
     per-unit labels
   - report unresolved action hashes instead of pretending a dictionary exists

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

### 3. The ammo bundle appears later, as resource semantics, not as the primary action-name source

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

### 4d. 2026-06-02 continuation: new MSC has an action-slot layer in `0.c`

Further research on `E:\XB\解包\com\file\0x693F756D\0.c` found that the new-style action hashes
are not only registered in `2.c`.

`0.c func_13()` initializes:

```c
sys_1(0x10000, 0x1, slot, actionHash);
```

Examples:

| action slot | action hash |
|---:|---:|
| `0x2` | `0x6d00aeaa` |
| `0x3` | `0x9cf36e1b` |
| `0xa` | `0xf5f21169` |
| `0x1d` | `0xdabb0543` |
| `0x24` | `0xf32aa1ba` |
| `0x25` | `0x900ab393` |
| `0x28` | `0x27786a84` |

`0.c func_14()` then binds those action slots to selector callbacks through:

```c
func_83(slot, selectorCallback);
```

`func_83()` resolves the slot to the action hash and registers:

```c
sys_1(0x10002, 0, actionHash, selectorCallback);
```

This is a better dynamic-mapping surface than any dictionary idea:

- `func_13()` gives `actionSlot -> actionHash`
- `func_14()` gives `actionSlot -> selectorCallback`
- selector callbacks can return other action slots with `sys_0(0x10000, 0x1, targetSlot)`
- the route graph can be analyzed to infer fixed gameplay categories and fallback chains

### 4e. `sys_41` / `0x700000` are the likely native source path

`0.c func_143()` now points to a more important native layer:

```c
var0 = sys_41(...);
var1 = func_144(var0);
func_145(var0, var1, 0);
```

`func_145()` reads an action record:

```c
var3 = sys_0(0x700000, 0, arg0, 0x2e);
var4 = sys_0(0x700000, 0, arg0, 0xa);
var6 = sys_0(0x700002, var4, 0, arg0, 1);
var7 = sys_0(0x700002, var4, 1, arg0, 1) | arg2;
func_95(var3, var6, var7, arg1);
```

Current interpretation:

- `sys_41(...)` returns an action-record index or handle.
- `0x700000` field `0x2e` is the action hash.
- `0x700000` field `0x3` is an action category/type.
- `0x700000` field `0x4` is an input/direction mask.
- `0x700000` field `0xa` links into `0x700002`.

So the correct "where is the action hash recorded?" research target is no longer only `2.c`
registration. It is the native backing store for `sys_41`, `0x700000`, and `0x700002`.

### 4f. Two-level `2.c` tracing is required

`2.c` dynamic tracing must not map `func_69(actionSlot)` directly to `func_1221()` using the same
slot number. The real route is usually:

```text
actionHash -> actionCallback -> func_69(actionSlot)
  -> sys_0(0x10001, 0x2, actionSlot) -> slotCallback
  -> func_74(innerSlot, delay)
  -> sys_0(0x10001, 0x3 + global170, innerSlot) -> slotHash/resource
```

Examples from `0x693F756D/2.c`:

| action hash | traced route |
|---:|---|
| `0x6d00aeaa` | `func_390 -> actionSlot 0x1 -> func_1124 -> innerSlot 0x0 -> 0x1f588bd9` |
| `0x9cf36e1b` | `func_392 -> actionSlot 0x2 -> func_1125 -> innerSlots 0x2/0x4/0x3 -> 0x377e9872 / 0xf0b3ea12 / 0xd74ba485` |
| `0x86d45295` | `func_437 -> actionSlot 0x1d -> func_1137 -> innerSlots 0x1/0x0/0x29 -> 0xe53bc97 / 0x1f588bd9 / 0xf270ea6a` |
| `0xf32aa1ba` | `func_480 -> actionSlot 0x34 -> func_1148..1152 -> innerSlot 0x4e -> conditional hashes` |
| `0x900ab393` | `func_482 -> actionSlot 0x35 -> func_1158 -> innerSlot 0x4f -> 0xb189334e` |

This confirms the new no-dictionary rename route should build an action graph first, then attach
fixed gameplay labels and param labels only after the route is understood.

### 4g. 2026-06-03 update: `0x700000` is a dynamic action-record source

Further cross-sample research found the strongest current answer to the
"where is the action hash recorded?" question.

In `0x700000`-style new `2.c` files, the action hashes are imported at runtime
from native action records, not only from static `func_241(0xHASH, callback)`
lines.

Concrete sample:

- `E:\XB\解包\com\file\0x693F756D\2.c`
- dynamic registration function: `func_849`

Key pattern:

```c
var0 = sys_0(0x700001, 0);
var1 = 0x1;
while (var1 < var0)
{
    var2 = sys_0(0x700000, 0, var1, 0x2e);
    var3 = sys_0(0x700000, 0, var1, 0xa);
    var4 = func_873(var3);
    func_241(var2, var4);
    var1++;
}
```

Current interpretation:

- `0x700001` returns the action-record count.
- `0x700000` is the action-record table.
- `0x700000` field `0x2e` is the action hash.
- `0x700000` field `0xa` is a group/type key.
- A local resolver such as `func_873` maps that group/type key to the script
  callback.
- `func_241(var2, var4)` registers the imported action hash and callback.

This changes the external-file question:

- We have still not found the file backing the action records.
- But the script-visible runtime source is now identified as
  `0x700000` / `0x700001` / `0x700002`.
- The next native task is to use IDA to find which loader populates those
  tables.

The same dynamic registration function also records reverse and phase-callback
tables:

```c
sys_1(0x10002, 0x1f, actionHash, recordIndex);
sys_1(0x10001, 0x10, recordIndex, func_975(func_875(recordIndex, 0x2)));
sys_1(0x10001, 0x11, recordIndex, func_975(func_875(recordIndex, 0x7c)));
sys_1(0x10001, 0x12, recordIndex, func_975(func_875(recordIndex, 0x7d)));
```

Runtime usage:

- active action hash (`global4`) is resolved through
  `sys_0(0x10002, 0x1f, global4)` into an action-record index
- `0x10001,0x10/0x11/0x12` then provide init/tick/end callback functions
  for that record

This is a dynamic mapping surface, not a dictionary surface.

### 4h. Cross-sample stability and raw function refs

Local scan results:

- 6 directories with both `0.c` and `2.c`
- 30 directories with parseable `2.c` action-graph registrations
- 15 `2.c` files using `0x700000` / `0x700001` / `0x700002`

The `0.c` base action-slot table is identical across all 6 checked `0.c`
samples. It defines 30 base `actionSlot -> actionHash` pairs. Most new
`0x700000`-style `2.c` files register a subset of this base table plus the
common extra `0x613494c8`.

`0x613494c8` is not in the `0.c` base action-slot table, but it appears broadly
in `2.c` registrations. In checked samples it binds to `func_58`, whose body is
empty, so it should be treated as a no-op/system placeholder rather than a
weapon/action name.

One tooling issue is now clear:

- `0x693F756D/2.c func_873()` returns raw function-ref constants such as
  `0x3b343`.
- `2.txt` shows the actual callback is `0x3b343 + 0x30 = func_950`.
- Other samples already decompile the same pattern as `return func_945;`, etc.

So the new dynamic extractor must resolve both forms:

- direct `return func_N`
- raw `return 0x...` where `raw + 0x30` hits a script entry pointer

The existing mapping model already supports `decode_add = 48`, but the current
native-truth mapping has empty `script_functions`, and the AST symbolizer only
rewrites call arguments, not return constants. That is why this dynamic resolver
is still partially raw in the generated `.c`.

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

1. **Dynamic action mapping layer**:
   parse the script's registration and routing graph. The output is an action graph, not a lookup
   table. This now includes both static registrations and dynamic action-record imports:
   `0x700000 record -> action_hash -> action_callback -> phase callbacks -> resource usage`.
2. **Script-structure layer**:
   parse `func_1219` / `func_1220` / `func_1221` so the tool understands
   action callback -> slot callback -> slot-hash-table routing. Also discover the
   dynamic registration function by the `sys_0(0x700001, 0)` plus
   `func_241(var2, var4)` pattern.
3. **Per-unit semantic enrichment layer**:
   cross-reference callback/resource hashes against the unit's param bundle
   (`bulletparam`, `interactionid`, `chrsysparam`, etc.)
4. **Kind-7 label decode layer**:
   decode `action_label_offset` / `resource_label_offset` using the existing
   `obf_string` transform already used by `characterlist`

So the earlier conclusion still holds in spirit:

- the ammo bundle is **not** the complete action-hash name source

But it should now be refined to:

- the new auto-rename path is probably **hybrid**
- no shared hash dictionary should be assumed or chosen
- fixed gameplay words such as Shoot/射击, Melee/格斗, and Sub/副射 should be derived dynamically
  from the script route, like the old mask-based path
- per-unit params contribute weapon semantics
- per-unit kind-7 labels contribute directly readable names for
  weapon/resource/order/movement surfaces
- unresolved action hashes stay unresolved and visible until the actual recording source is found

## Practical next step for the tool

1. Add a TS/Python dynamic action graph extractor that parses:
   - `func_1219` action registrations
   - `func_1220` slot-callback registrations
   - `func_1221` slot-hash registrations
   - direct `sys_4F/sys_58/sys_47` resource hashes
2. Preserve the old fixed-word naming style for gameplay categories:
   - Shoot / 射击
   - Melee / 格斗
   - Sub / 副射
   - Special Shoot / 特射
   - Special Melee / 特格
   - Awakening Skill / 觉醒技
   but derive those labels from dynamic route evidence rather than from a hash dictionary.
3. Use the unit's param bundle to append semantic suffixes only when the traced callback actually
   reaches matching resource / label evidence.
4. Implement kind-7 label decoding in the parser/UI path before claiming the params can provide
   final human-readable weapon names in-app
5. Keep a visible "unresolved action hash" report. The correct long-term research question remains:
   where, if anywhere, EXVS records the original action hash names.

## 2026-06-03 correction: new action records are in `chrsysparam.csyspm`

The concrete sample from the user is unit `59001001`:

```json
{
  "id": 59001001,
  "Param": 952389493,
  "Msc": 1765766509
}
```

Hex mapping:

- `59001001` -> `0x038448A9`
- `Param 952389493` -> `0x38C44F75`
- `Msc 1765766509` -> `0x693F756D`

This pairs the MSC scripts with the param bundle:

```text
Msc   -> E:\XB\解包\com\file\0x693F756D\
Param -> E:\XB\解包\com\file\0x38C44F75\
```

The file-side backing source for `sys_0(0x700000, ...)` is:

```text
E:\XB\解包\com\file\0x38C44F75\chrsysparam.csyspm
```

For this sample:

- file magic is `0xB4ACACAF`
- version/type is `0x00010000`
- header id is `0x038448A9`
- table0 offset is `0x1C`
- table0 marker is `0xA8BBBAB9`
- table0 shape is `55 x 128` u32 values
- table1 offset is `0x6E2C`
- table1 marker is `0xA8BAA9BA`
- table1 shape is `1 x 1`

This matches the native IDA finding:

- `0x700000` reads from `env[11]`
- `env[11]` is initialized from the runtime object field populated by init
  input `a2 + 168`
- `a2 + 168` is validated as magic `0xB4ACACAF` and version `0x10000`
- the native reader treats `+0x14/+0x18` as subtable offsets and reads a
  row/column u32 matrix

The existing repo parser in `src-tauri/src/format/chrsysparam.rs` should not be
used as semantic truth for this feature yet. It currently treats `0x10` as a
flat count of 20-byte entries. In the real large table, `0x10 == 2` means there
are two subtables, and table0 is the action matrix.

### Correct auto-rename source chain

The new chain is now:

```text
resource list
  -> Param hash
  -> chrsysparam.csyspm
  -> table0 action matrix row
  -> field 0x2e action hash
  -> field 0x0a group key
  -> Msc/2.c group resolver, e.g. func_873(group)
  -> func_241(actionHash, callback)
```

`Msc/0.c` supplies the gameplay category layer:

```c
var1 = sys_0(0x700000, 0, recordIndex, 0x3) % 0x64;
var2 = sys_0(0x700000, 0, recordIndex, 0x4);
```

So labels such as Shoot/射击, Melee/格斗, Sub/副射, Special Shoot/特射, and
Special Melee/特格 should be derived from `0.c func_144()` plus
`chrsysparam` fields `0x03/0x04`. They must not come from a user-maintained
dictionary.

The next analysis target is field semantics for the `chrsysparam` action
matrix, especially:

- `0x03`: base category/type
- `0x04`: input/category refinement mask
- `0x0a`: group key into the local `2.c` resolver
- `0x2e`: action hash
- `0x02`, `0x7c`, `0x7d`: phase callback keys
- `0x1c` through `0x22` and `0x6e`: route/condition fields still requiring
  script usage analysis

## 2026-06-03 row-level mapping for `59001001`

This section records the current dynamic mapping evidence for the user's
sample. It is not an action-hash dictionary. The unit-specific source is still:

```text
Msc   -> E:\XB\解包\com\file\0x693F756D\
Param -> E:\XB\解包\com\file\0x38C44F75\
```

### `func_873(group)` callback resolver

`2.c` registers imported action records with:

```c
var0 = sys_0(0x700001, 0);
var1 = 1;
while (var1 < var0) {
    var2 = sys_0(0x700000, 0, var1, 0x2e);
    var3 = sys_0(0x700000, 0, var1, 0xa);
    var4 = func_873(var3);
    func_241(var2, var4);
    var1++;
}
```

For `0x693F756D/2.c`, the resolver currently maps:

| group | resolver return | `+0x30` function |
|---:|---:|---|
| `0x03` | `0x3B343` | `func_950` |
| `0x0C` | `0x39689` | `func_924` |
| `0x0D` | `0x3A9E1` | `func_942` |
| `0x0F` | `0x3AEEF` | `func_946` |
| `0x10` | `0x3BBFE` | `func_956` |
| `0x13` | `0x3BBFE` | `func_956` |
| `0x1F` | `0x388B1` | `func_916` |
| `0x25` | `0x38BD3` | `func_919` |
| `0x26` | `0x38BD3` | `func_919` |

Groups `0x27`, `0x28`, and `0x29` appear in the matrix but are not handled by
this resolver. `func_873()` returns `0` for them, so an auto-renamer must not
invent callback names for those groups. They may still have phase callback
records through fields `0x02/0x7C/0x7D`.

### `func_144(row)` category derivation

`0.c` derives a runtime category from fields `0x03/0x04`:

```text
derived = field_0x03 % 0x64
if derived == 1:
  field_0x04 == 0x20 -> 4
  field_0x04 == 0x10 -> 3
  field_0x04 == 0x08 -> 5
  field_0x04 == 0x04 -> 2
  field_0x04 == 0x0C -> 2
  field_0x04 == 0x30 -> 4
  field_0x04 == 0x3C -> 2
```

The old fixed gameplay words, such as Shoot/射击, Melee/格斗, Sub/副射,
Special Shoot/特射, and Special Melee/特格, should be treated as a small
category vocabulary after this dynamic category is derived. They are not an
`action_hash -> name` dictionary. The exact numeric category-to-word alignment
still needs one more verification pass against `sys_41` input selection or
runtime traces before the tool should claim high confidence labels.

Current core rows where `field_0x03 == 1`:

| row | action hash | field `0x04` | derived category | group | callback |
|---:|---|---:|---:|---:|---|
| 20 | `0x178D1109` | `0x00` | `1` | `0x0C` | `func_924` |
| 25 | `0x84BD2B08` | `0x04` | `2` | `0x1F` | `func_916` |
| 27 | `0x0E962048` | `0x30` | `4` | `0x0C` | `func_924` |
| 32 | `0x58CC87CE` | `0x08` | `5` | `0x0D` | `func_942` |
| 38 | `0x446C1D89` | `0x04` | `2` | `0x0C` | `func_924` |

No row in this sample currently produces derived category `3` through
`field_0x04 == 0x10`.

### Phase callbacks from `func_975`

`2.c` also writes three per-record phase callback slots:

```c
sys_1(0x10001, 0x10, row, func_975(func_875(row, 0x2)));
sys_1(0x10001, 0x11, row, func_975(func_875(row, 0x7c)));
sys_1(0x10001, 0x12, row, func_975(func_875(row, 0x7d)));
```

`func_975` currently contains 162 hash-to-function cases. For this sample,
every nonzero `0x02/0x7C/0x7D` field in the action matrix resolves to a local
script function. This gives the renamer a second dynamic naming layer:

```text
action row -> phase0/phase1/phase2 hash -> func_975 -> phase callback function
```

Example core rows:

| row | action hash | action callback | phase0 `0x02` | phase1 `0x7C` | phase2 `0x7D` |
|---:|---|---|---|---|---|
| 20 | `0x178D1109` | `func_924` | `func_1019` | `func_1018` | `func_1020` |
| 25 | `0x84BD2B08` | `func_916` | `func_1034` | `func_1033` | `func_1035` |
| 27 | `0x0E962048` | `func_924` | `func_1040` | `func_1039` | `func_1041` |
| 32 | `0x58CC87CE` | `func_942` | `func_1055` | `func_1054` | `func_1056` |
| 38 | `0x446C1D89` | `func_924` | `func_1073` | `func_1072` | `func_1074` |

Rows with `group 0x25/0x26` may have no phase callbacks in this table; their
fields are zero.

### Practical rename contract

The next implementation should build an evidence object per action row:

```text
unit id
msc hash
param hash
row index
action hash from field 0x2e
derived category from fields 0x03/0x04
group key from field 0x0a
action callback from 2.c resolver
phase callbacks from fields 0x02/0x7c/0x7d via func_975
source paths and confidence flags
```

Suggested naming behavior:

1. Prefer category-derived names only after numeric category labels are
   verified for the script family.
2. Until then, use deterministic evidence names such as
   `ACTION_CAT_02_ROW_25`, `ACTION_GROUP_1F_ROW_25`, or
   `ACTION_ROW_25_FUNC_916`.
3. Rename phase callbacks as children of their row, for example
   `ACTION_ROW_25_PHASE_0`, `ACTION_ROW_25_PHASE_1`,
   `ACTION_ROW_25_PHASE_2`, until phase semantics are known.
4. Keep unresolved groups visible. Do not hide them behind guessed names.
5. Keep the action hash as evidence or collision suffix, not as the primary
   source of meaning.

## Old EXVS1-style in-MSC B4AC comparison

User-provided comparison file:

```text
G:\1. Gundam - 1011.c
```

The file is valuable because it shows the same action-record concept before it
was externalized into `chrsysparam.csyspm`. In this older script, the action
matrix is embedded in MSC code:

```c
sys_74(0);
add_B4AC();       // generated from MBON 011.bin, according to file comments
sys_74(0x2);
func_764();
```

`add_B4AC()` writes records directly with:

```c
sys_2D(0x3, row, field, value);
```

and the script later reads logical action dataset `n` with:

```c
sys_2C(0x3, 0x11 + n - 1, field);
```

This is functionally the same role as the newer external table access:

```c
sys_0(0x700000, 0, row, field);
```

The old file comments explicitly state that `sys_0(0x30013, 0, row, field)`
is the newer substitute for this `sys_2C(0x3, 0x11 + row - 1, field)` read.

### Storage and access equivalence

| Concept | Old in-MSC file | New `59001001` sample |
|---|---|---|
| Storage | `add_B4AC()` emits `sys_2D(0x3,row,field,value)` | `Param/chrsysparam.csyspm` table0 |
| Main read | `sys_2C(0x3, 0x11 + idx - 1, field)` / `func_796(idx,field)` | `sys_0(0x700000,0,row,field)` / `func_875(row,field)` |
| Record count | hardcoded `0x1E`, comment says MBON `011.bin` offset `0x20` | `sys_0(0x700001,0)` |
| Selection | `sys_74(0x3, ...)` returns dataset index | `sys_41(...)` returns record index |
| Category fields | `field 0x03/0x04` | `field 0x03/0x04` |
| Group field | `field 0x0A` -> `func_786()` handler switch | `field 0x0A` -> `func_873(group)` |
| Action hash / ID | `field 0x2E` | `field 0x2E` |
| Phase hashes | `field 0x02/0x7C/0x7D` -> `func_926()` | `field 0x02/0x7C/0x7D` -> `func_975()` |

The old file also includes the same B4AC section markers in comments:

```text
A8 BB BA B9 = main 0x80 batch
A8 BA A9 BA = extra variable section
```

and has an inline literal write of `0xA8BAA9BA` at the end of the main embedded
table:

```c
sys_2D(0x3, 0x2D, 0x80, 0xA8BAA9BA);
```

This matches the marker family observed in the newer
`0x38C44F75/chrsysparam.csyspm` file. The old C file does not need to contain
the `0xA8BBBAB9` marker as a normal literal because the table is already
expanded into `sys_2D` writes.

### Category derivation similarity

The old script derives the same runtime category from `field 0x03/0x04`, but
the `field 0x04` encoding differs:

```text
old:
  field 0x04 == 0x01 -> category 4
  field 0x04 == 0x02 -> category 3
  field 0x04 == 0x04 -> category 5
  field 0x04 == 0x08 / 0x0C / 0x0F -> category 2
  field 0x04 == 0x03 -> category 4

new:
  field 0x04 == 0x20 / 0x30 -> category 4
  field 0x04 == 0x10 -> category 3
  field 0x04 == 0x08 -> category 5
  field 0x04 == 0x04 / 0x0C / 0x3C -> category 2
```

So the semantic rule is stable, but the bit encoding moved between generations.
This supports a dynamic field-based category derivation rather than an
`action_hash -> name` dictionary.

### Old core category rows

Rows `0x11..0x2D` in the old embedded table correspond to logical datasets
`1..29`. The rows that derive the old core categories `1..5` are:

| MSC row | logical row | field `0x03` | field `0x04` | category | group | action hash / ID |
|---:|---:|---:|---:|---:|---:|---|
| `0x1B` | 11 | `0x01` | `0x00` | 1 | `0x0C` | `0xDB2CA8B5` |
| `0x20` | 16 | `0x01` | `0x08` | 2 | `0x0C` | `0x8C02D1FC` |
| `0x22` | 18 | `0x01` | `0x03` | 4 | `0x0C` | `0x137D0C4E` |
| `0x29` | 25 | `0x01` | `0x04` | 5 | `0x0C` | `0x7ABD7BF6` |

The quick sample did not contain a core row deriving category `3`.

### Phase callback equivalence

Old `func_766()` creates three phase callback tables from the same row fields:

```c
sys_2D(0x3, 0xd, row, func_926(func_796(row, 0x2)));
sys_2D(0x3, 0xe, row, func_926(func_796(row, 0x7c)));
sys_2D(0x3, 0xf, row, func_926(func_796(row, 0x7d)));
```

This is directly analogous to the new sample:

```c
sys_1(0x10001, 0x10, row, func_975(func_875(row, 0x2)));
sys_1(0x10001, 0x11, row, func_975(func_875(row, 0x7c)));
sys_1(0x10001, 0x12, row, func_975(func_875(row, 0x7d)));
```

Examples from the old file:

| logical row | action hash / ID | phase0 | phase1 | phase2 |
|---:|---|---|---|---|
| 16 | `0x8C02D1FC` | `func_1034` | `func_1033` | `func_1035` |
| 25 | `0x7ABD7BF6` | `func_1088` | `func_1087` | `func_1089` |

### Group-handler similarity and unresolved groups

Old `func_786()` switches on `field 0x0A` and routes to action handlers:

```text
0x00 -> func_861
0x03 -> func_865
0x05 -> func_871
0x0C -> func_840
0x0D -> func_857
0x10 -> func_877
0x15 -> func_883
0x1F -> func_889
0x2D -> func_892
```

The embedded rows still contain groups such as `0x27` and `0x28` that this
handler switch does not resolve. This mirrors the newer `59001001` case where
`group 0x27/0x28/0x29` exist in `chrsysparam.csyspm` but `func_873()` returns
`0`.

### `field 0x2E` bridge from old masks to new hashes

The old file contains an important comment:

```text
For MBON, instead of using the global81 flag, they use the hash stored at 0x2e.
0x2e hash is used for assigning extra_B4AC.
```

Because the older target lacks `sys_74(0xd, hash, mode)`, this script implements
`parse_B4AC_0x2e(hashOrId)` by hand and converts `field 0x2E` back into the old
concentrated `global81`-style category value. This is strong evidence that
`field 0x2E` is the compatibility bridge between old mask routing and new
hash/ID routing.

### `parse_Melee_Var` is related but not the primary action matrix

The large tail function:

```c
parse_Melee_Var(set_hash, var_hash)
```

is not an action-name table. Its call sites load melee parameter variables by
`set_hash + var_hash`. It shows the same migration pattern: data that is likely
external/newer-engine parameter data has been inlined into the older MSC. It
should be treated as a secondary parameter surface, similar in spirit to the
extra B4AC variables, not as `action_hash -> name`.

### Updated conclusion

The old file and new `chrsysparam.csyspm` are not merely superficially similar.
They implement the same row/field action-record model:

```text
action selection -> row index -> fields 0x03/0x04/0x0A/0x2E/0x02/0x7C/0x7D
```

The main generation change is storage and syscall access:

```text
old compatibility MSC: inline sys_2D/sys_2C table
new native MSC: external chrsysparam.csyspm + 0x700000 syscalls
```

For auto-rename, this comparison strengthens the current design:

1. Pair `Msc` and `Param` dynamically.
2. Parse the action rows, whether embedded or external.
3. Derive category, group callback, and phase callbacks from row fields.
4. Keep `field 0x2E` as evidence and dispatch key.
5. Do not use a user-maintained action-hash dictionary.

## Key design answer: can `chrsysparam.csyspm` enable old-style rename?

Yes, `chrsysparam.csyspm` is enough to implement the new equivalent of the old
`0.c -> helper -> 2.c` rename chain, but it is not enough by itself to recover
all final human-readable action names.

The new rename chain should be:

```text
resource list
  -> Msc / Param pair
  -> Param/chrsysparam.csyspm table0 action row
  -> field 0x03/0x04 derived category
  -> field 0x2E action hash
  -> field 0x0A group
  -> Msc/2.c group resolver, e.g. func_873(group)
  -> func_241(actionHash, callback)
  -> field 0x02/0x7C/0x7D phase hashes
  -> func_975/hash resolver phase callbacks
```

So the relationship is:

```text
old: 0.c input mask -> helper derives action type -> 2.c callback rename
new: chrsysparam row -> category/group/hash evidence -> 2.c callback/phase rename
```

The first implementation should therefore produce evidence-based names such as:

```text
ACTION_ROW_25_CAT_02_GROUP_1F
ACTION_ROW_25_FUNC_916
ACTION_ROW_25_PHASE_0
ACTION_ROW_25_PHASE_1
ACTION_ROW_25_PHASE_2
```

After category-number-to-gameplay-label alignment is verified, those names can
be upgraded to stable gameplay vocabulary such as Shoot, Melee, Sub, Special
Shot, and Special Melee. Until then, the tool must not claim exact labels such
as `副射` or `特射` solely from `chrsysparam`.

## Editing implication: MSC changes may also require `chrsysparam` changes

For future modding workflows, `chrsysparam.csyspm` should be treated as action
metadata, not just rename metadata.

If an edit only changes the implementation of an existing callback function in
MSC, and it keeps the same action rows, groups, hashes, category, and phase
keys, `chrsysparam.csyspm` usually does not need to change.

If an edit changes action selection or registration semantics, then
`chrsysparam.csyspm` probably must change together with MSC. Examples:

- adding or removing an action row
- changing an action hash or ID in `field 0x2E`
- changing input/category behavior in `field 0x03/0x04`
- changing group routing in `field 0x0A`
- assigning different phase callbacks through `field 0x02/0x7C/0x7D`
- changing route/condition fields such as `0x1C..0x22` or `0x6E`

This is the same relationship as the older embedded B4AC table, except that
the table is now an external binary file. The toolchain should eventually expose
`chrsysparam.csyspm` as a human-readable structured artifact, for example:

```text
chrsysparam.csyspm
  -> action_rows.json / action_rows.yaml
  -> edited rows
  -> rebuild chrsysparam.csyspm
```

The row artifact should preserve unknown fields and round-trip the binary
exactly unless the user edits specific fields. That avoids forcing users to edit
raw binary while still keeping MSC and its action metadata consistent.
