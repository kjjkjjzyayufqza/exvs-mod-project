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
- table0 data starts at `0x2C` (`0x1C + 0x10`) and ends at `0x6E2C`
- table1 offset is `0x6E2C`
- table1 marker is `0xA8BAA9BA`
- table1 shape is `1 x 1`
- table1 data starts at `0x6E3C` (`0x6E2C + 0x10`) and ends at `0x6E40`

This matches the native IDA finding:

- `0x700000` reads from `env[11]`
- `env[11]` is initialized from the runtime object field populated by init
  input `a2 + 168`
- `a2 + 168` is validated as magic `0xB4ACACAF` and version `0x10000`
- the native reader treats `+0x14/+0x18` as subtable offsets and reads a
  row/column u32 matrix

Each subtable has a 16-byte header:

```text
u32 marker
u32 row_count
u32 column_count
u32 reserved_or_zero
```

The matrix payload starts at `subtable_offset + 0x10`, not
`subtable_offset + 0x0C`. This matters for any future parser, exporter, or
binary rebuilder.

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
- changing route/condition fields interpreted through `0x700002`; after the
  old B4AC comparison, the strongest first-pass candidates are `0x03`, `0x2C`,
  and `0x6E`, while `0x1C..0x22` should be preserved as callback-specific
  action parameters unless proven otherwise

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

## Editing boundary: MSC-only edits vs paired metadata edits

The correct long-term model is not "MSC source is the only editable truth".
For the newer format, action selection is split across two files:

```text
MSC .c/.mscsb
  -> callback implementation and script-side dispatch behavior

Param/chrsysparam.csyspm
  -> action rows, hashes, groups, categories, phase keys, and route metadata
```

Therefore future MSC editing does not always require changing
`chrsysparam.csyspm`, but the editor must know when the paired metadata is part
of the same logical edit.

Safe MSC-only edits:

- changing internal logic inside an existing callback
- changing constants, timings, or effects used only inside that callback
- preserving the same action row, action hash, group, category, and phase keys

Paired edits that need `chrsysparam.csyspm` support:

- adding or deleting an action
- moving a callback to a different action row
- changing the action hash in field `0x2E`
- changing group routing in field `0x0A`
- changing category/input fields `0x03/0x04`
- changing phase callback keys `0x02/0x7C/0x7D`
- changing route/condition fields interpreted through `0x700002`

Because `chrsysparam.csyspm` is binary, the user should not be expected to edit
it directly. Tooling should expose it through a structured row model and rebuild
the binary with exact preservation of unknown fields.

## Current `0x700002` evidence: route enum plus flags mask

The current evidence does not prove the native field-to-bit mapping yet, but it
does prove what the two `0x700002` outputs become in script state.

`0.c func_145()` reads:

```c
var6 = sys_0(0x700002, group, 0, recordIndex, 1);
var7 = sys_0(0x700002, group, 1, recordIndex, 1) | extraFlags;
func_95(actionHash, var6, var7, category);
```

`0.c func_95()` then stores:

```c
global25 = actionHash;
global23 = routeEnum;  // 0x700002 subfield 0
global24 = flagsMask;  // 0x700002 subfield 1
global26 = category;
```

and `flagsMask & 0x800` selects action state `global22 = 2`; otherwise
`global22 = 1`.

`2.c func_872()` performs the same two reads and passes them to `func_81()`.
`2.c func_81()` stores:

```c
global67 = routeEnum;
global52 = flagsMask;
global25 = actionHash;
global50 = category;
```

with one additional rule: if `routeEnum == 2`, it is replaced with the previous
`global174`. So subfield `0` is a small route/side/state enum, not a hash or
callback. Subfield `1` is a bitmask consumed throughout the action state
machine.

The shared runtime slots mirror this state in both directions:

```text
0.c writes 0x10000[0x1c] = routeEnum, 0x10000[0x1d] = flagsMask
2.c writes 0x10000[0x1e] = routeEnum, 0x10000[0x1f] = flagsMask
```

### Field-shape evidence from large `chrsysparam` samples

Only two local `chrsysparam.csyspm` files currently contain meaningful large
main tables:

- `0x38C44F75`: unit `59001001`, table0 `55 x 128`
- `0x31A97FD4`: unit `33004001`, table0 `72 x 128`

Their fields `0x1C..0x22` are clearly group-specific, not one flat structure:

- groups `0x0C` / `0x0D`: dense `0x1C..0x22` records, usually several hash-like
  values plus small timing/window values
- groups `0x1F` / `0x1D`: compact records, mostly `0x1C` plus a small value in
  `0x1D`
- group `0x27`: no `0x1C`; uses `0x1D`, `0x1F`, `0x20`, `0x21`, `0x22`
  consistently, likely a separate route/condition shape
- group `0x03`: mixed hash and small numeric fields
- field `0x6E` is not common. It is absent in the `59001001` sample and appears
  only in a small subset of `33004001` rows. In `0x693F756D/2.c`, field `0x6E`
  is read directly into `global912` by `func_870()`; it is not yet proven to be
  part of the native `0x700002` decode.

Current boundary before the old-script comparison: `0x700002` is a native
group-specific decoder from the action row to route enum and flags mask. The
exact input fields were still unresolved at this point.

## Old embedded B4AC reveals the likely `0x700002` formula

The old EXVS1-style file `G:\1. Gundam - 1011.c` contains a script-side
equivalent of the missing native `0x700002` behavior.

Its `func_138(actionCallback, routeEnum, flagsMask, category)` is structurally
equivalent to new `2.c func_81()`:

```c
if (flagsMask & 0x800)
    state = 2;
else
    state = 1;

if (routeEnum == 2)
    routeEnum = previousRoute;

global88/global67 = routeEnum;
global91/global52 = flagsMask;
global93/global25 = actionCallbackOrHash;
global82/global50 = category;
```

The caller `func_786(rowIndex, category)` reads the embedded B4AC row through
`func_796(row, field)` / `sys_2C(0x3,row,field)` and builds route/flags from a
small set of fields:

```c
extra400 = field_0x2C == 1 ? 0x400 : 0;
baseFlag = field_0x03 > 0x12C ? 0x200 : 0x20000;
group = field_0x0A;
groupExtra = field_0x6E;
```

Observed old-script mapping:

| group | route | flags expression |
|---:|---:|---|
| `0x00` | `0` | `0x1 + extra400 + baseFlag` |
| `0x03` | `1` | `0x1 + extra400 + baseFlag` |
| `0x05` | `1` | `0x1 + extra400 + baseFlag` |
| `0x0C` | `1` | `0x2 + extra400 + baseFlag` |
| `0x0D` | `1` | `0x2 + extra400 + baseFlag` |
| `0x10` | `1` | `0x1 + extra400 + baseFlag` |
| `0x15` | `1` | `0x401 + baseFlag` |
| `0x1F` | `1` | `(field_0x6E ? 0x402 : 0x4) + baseFlag` |
| `0x2D` | `1` | `0x2 + extra400 + baseFlag` |

This strongly suggests that new native `0x700002(group,subfield,row)` performs
the same calculation for at least the overlapping groups.

Applying this old formula to the local large new tables produces plausible
new route/flag values:

- `0x38C44F75` / unit `59001001`:
  - group `0x03` -> route `1`, flags `0x20001`
  - group `0x0C` / `0x0D` -> route `1`, flags `0x20002`
  - group `0x10` -> route `1`, flags `0x20001`
  - group `0x1F` -> route `1`, flags `0x20004`
- `0x31A97FD4` / unit `33004001`:
  - rows with `field_0x03 > 0x12C` drop the base flag from `0x20000` to
    `0x200`, e.g. group `0x0C` -> `0x202`
  - group `0x1F` with `field_0x6E = 1` yields `0x20402`

Important correction: fields `0x1C..0x22` should no longer be treated as the
primary `0x700002` inputs. In the old embedded script, those fields are loaded
later by the selected action callbacks as move-specific parameters. They are
still action-row metadata and must be preserved/editable, but they are not the
first target for route/flags reconstruction.

Still unresolved:

- whether native `0x700002` uses the exact old formula for every overlapping
  group
- route/flags rules for new-only groups such as `0x0F`, `0x13`, `0x25`,
  `0x26`, `0x27`, `0x28`, and `0x29`
- whether group `0x13` inherits group `0x10` route/flags, since the current
  `0x693F756D/2.c func_873()` maps both to the same callback

## Editing implication: MSC-only edits vs paired Param edits

The current evidence means future MSC editing should be classified before
writing files.

Edits that only change the body of an already-registered callback can usually
remain MSC-only. Examples: changing logic inside the selected `2.c` callback,
changing calls/effects/timers inside an existing action implementation, or
renaming symbols in the workspace for readability.

Edits that change the action row model require paired `chrsysparam.csyspm`
support. Examples:

- adding/removing an action row
- changing the action hash stored at field `0x2E`
- changing the action group at field `0x0A`
- changing the phase callback keys at fields `0x02`, `0x7C`, or `0x7D`
- changing fields that feed route/flags, currently strong candidates
  `0x03`, `0x2C`, and `0x6E`
- making a new action selectable through the game's normal action table path

This does not mean users should hand-edit a binary file. `chrsysparam.csyspm`
is binary, but its large table is a regular little-endian `u32` matrix:
header `0xB4ACACAF`, subtable headers, then fixed-width rows. The editor should
eventually expose a structured export/import view for action rows, preserve all
unknown fields exactly, and rebuild the binary table only from that structured
model.

Therefore the correct design is a paired `Msc + Param` workspace, not a
dictionary. Auto-rename can read `chrsysparam.csyspm` as evidence without
modifying it; real action-metadata edits need a safe round-trip writer for the
same file.

## Table1 and derived-action evidence

Added `tools/research_chrsysparam_action_report.py` to join these evidence
sources:

- `Param/chrsysparam.csyspm` table0/table1 rows
- matching `Msc/2.c func_873(group)` group resolver
- matching `Msc/2.txt` function pointer list
- matching `Msc/2.c func_975(hash)` phase/predicate callback resolver

For `59001001` (`Param=0x38C44F75`, `Msc=0x693F756D`), the structured group
summary is:

| group | group callback | route evidence | count |
|---:|---|---|---:|
| `0x03` | `func_950` | old formula covered | 5 |
| `0x0C` | `func_924` | old formula covered | 8 |
| `0x0D` | `func_942` | old formula covered | 2 |
| `0x0F` | `func_946` | route unknown | 3 |
| `0x10` | `func_956` | old formula covered | 2 |
| `0x13` | `func_956` | route unknown | 3 |
| `0x1F` | `func_916` | old formula covered | 7 |
| `0x25` | `func_919` | route unknown | 2 |
| `0x26` | `func_919` | route unknown | 2 |
| `0x27` | none | phase callbacks only | 17 |
| `0x28` | none | phase callbacks only | 2 |
| `0x29` | none | phase callbacks only | 1 |

The important correction is that groups `0x27`, `0x28`, and `0x29` are not
empty or useless rows. They are not handled by `func_873(group)`, but their
fields `0x02`, `0x7C`, and `0x7D` still resolve through `func_975()` into real
phase callbacks. For example, `59001001` group `0x27` rows resolve to phase
triples such as `func_1004/func_1003/func_1005`, `func_1007/func_1006/func_1008`,
and so on.

Auto-rename implication:

- rows with a group callback can get names like
  `ACTION_ROW_16_GROUP_1F_FUNC_916`
- rows with no group callback but real phase callbacks should get names like
  `ACTION_ROW_12_GROUP_27_PHASE0_func_1004`, not be hidden or collapsed into
  "unknown"
- route/flags remain unknown for new-only groups until native `0x700002` or
  runtime evidence confirms the formulas

### Table0 field ranges into table1

`2.c func_869()` loads table0 fields `0x7E` and `0x7F` into `global894` and
`global895`. If either field is non-negative, the script adds `1`:

```c
global894 = func_875(global798, 0x7e);
global895 = func_875(global798, 0x7f);
if (field_0x7e >= 0) global894 += 1;
if (field_0x7f >= 0) global895 += 1;
```

`func_962()` then iterates `global894..global895`, and `func_963()` reads
`sys_0(0x700000, 0x1, transitionRow, field)`. Therefore table0 fields
`0x7E/0x7F` are zero-based ranges into table1, while script-side row access is
one-based.

The `33004001` sample (`Param=0x31A97FD4`) confirms this:

| table0 row | action hash | group | raw range | table1 row | table1 action |
|---:|---:|---:|---:|---:|---:|
| 20 | `0x280BEB91` | `0x27` | `0..0` | 1 | `0x280BEB91` |
| 18 | `0x2B58E76E` | `0x1F` | `1..1` | 2 | `0x2B58E76E` |
| 37 | `0x58921C28` | `0x27` | `2..2` | 3 | `0x58921C28` |
| 42 | `0x7AE860E7` | `0x27` | `3..3` | 4 | `0x7AE860E7` |

### Table1 transition row semantics

`2.c func_963()` gives the first reliable semantics for table1:

- fields `0x01`, `0x1F`, `0x20`, `0x21`, `0x22`: action hashes that can match
  the current action hash (`global855`)
- field `0x02`: required state value checked against `global808`
- field `0x06`: transition mode (`0`, `1`, `2`, `3`, `4`, `5` observed in code)
- field `0x1C`: optional predicate callback hash, resolved by `func_975()`
- fields `0x1D`, `0x1E`: timing/window thresholds
- fields `0x04`, `0x05`: returned values used by the transition decision

This means future export/import cannot be table0-only. A correct action editor
must preserve and eventually expose table1 rows plus table0 `0x7E/0x7F` ranges.

### Derived-action lookup through `0x700003`

There are two script-side entry points into the same derived-action path.

`2.c func_900(delay,key)` accepts a key from script logic, calls native
`0x700003`, stores the returned row into the next free `global936..global945`
slot, and schedules the matching `func_928..func_937` callback.

`2.c func_921(slot,defaultDelay)` reads the current table0 row's fields
`0x30..0x39` as keys and `0x59..0x62` as per-slot delays, calls native
`0x700003`, and receives another action row index:

```c
candidateRow = sys_0(0x700003, keyFromField_0x30_to_0x39, 1 << global143);
```

Both paths then use the returned row's field `0x04` to schedule
`func_536(mask, delay, callback)` and eventually call `func_928..func_937`.
Those callbacks set `global813` to the candidate row, call `func_874()`, and
then `func_938()` decides whether to run a special phase-only handler
(`0x27/0x28/0x29`) or fall back to `func_872(candidateRow, 0)`.

Sample validation:

- `59001001` / `0x38C44F75`: every nonzero derived key in fields `0x30..0x39`
  matches a table0 action hash in field `0x2E`; all 42 derived links resolve to
  a target row.
- `33004001` / `0x31A97FD4`: every nonzero derived key also resolves to a
  table0 action hash; all 39 derived links resolve to a target row.
- both checked table0 samples have unique nonzero action hashes
  (`59001001`: `54/54`, `33004001`: `71/71`), so they cannot prove duplicate-key
  variant selection.

So the current best evidence is:

```text
0x700003(actionHashKey, 1 << global143) -> matching table0 action row index
```

The mask argument probably selects the correct variant when the same key has
multiple row candidates. The checked samples do not yet prove the native
variant-selection rule.

Observed target `field 0x04` to schedule-mask mapping comes directly from
`func_900()` / `func_921()`:

| target field `0x04` | scheduled mask |
|---:|---:|
| `0x00` | `0x001` |
| `0x04` | `0x002` |
| `0x08` | `0x004` |
| `0x10` | `0x008` |
| `0x20` | `0x010` |
| `0x40` | `0x020` |
| `0x41` | `0x040` |
| `0x42` | `0x080` |
| `0x43` | `0x100` |
| `0x44` | `0x400` |
| `0x45` | `0x200` |
| `0x46` | `0x800` |

Field `0x58` is loaded separately (`global906`) and should not be treated as
slot-0 delay.

For `59001001`, the derived links show common chains such as:

```text
row 20 group 0x0C slot 0 delay 11 -> row 21 group 0x27 phase-only
row 20 group 0x0C slot 1 delay 6  -> row 38 group 0x0C func_924, schedule 0x002
row 20 group 0x0C slot 2 delay 11 -> row 41 group 0x0C func_924, schedule 0x100
row 42 group 0x27 slot 0 delay 30 -> row 43 group 0x1F func_916
row 47 group 0x0F slot 0 delay 0  -> row 48 group 0x29 phase-only, schedule 0x800
```

This gives auto-rename another useful evidence layer: a phase-only row can
still receive a meaningful name from its source row and derived slot, for
example `ACTION_ROW_20_DERIVED_SLOT_0_TO_ROW_21_GROUP_27`.

### Old embedded B4AC confirms the derived-action model

Added `tools/research_old_b4ac_action_report.py` to parse old embedded
`sys_2D(0x3,row,field,value)` rows and report derived links from the old action
matrix.

In `G:\1. Gundam - 1011.c`, the equivalent functions are:

| old function | new function | role |
|---|---|---|
| `func_822(delay,key)` | `func_900(delay,key)` | script-provided derived lookup |
| `func_837(slot,defaultDelay)` | `func_921(slot,defaultDelay)` | row-field derived lookup |
| `func_501(mask,delay,callback)` | `func_536(mask,delay,callback)` | schedule derived callback |
| `func_844..func_853` | `func_928..func_937` | candidate row entry callbacks |

The old lookup call is:

```c
candidateRow = sys_74(0x9, actionHashKey, global306);
```

The file comments state that MBON uses `1 << global306` instead of `global306`
directly. That matches the newer script-side form:

```c
candidateRow = sys_0(0x700003, actionHashKey, 1 << global143);
```

So `0x700003` is very likely the new native wrapper for the same
`actionHashKey + unitModeFlag` derived-row lookup that old embedded scripts
performed with `sys_74(0x9, ...)`.

Old sample validation:

- `G:\1. Gundam - 1011.c`: 29 action rows, 29 unique action hashes
- 19 derived links from fields `0x30..0x39`
- every derived key resolves to a target row's field `0x2E`
- no duplicate-key case is present, so variant-selection remains unproven

The old per-slot delay mapping also matches the corrected new mapping: keys are
fields `0x30..0x39`, while delays are fields `0x59..0x62`. Field `0x58` is not
slot 0 delay.

The old `field 0x04` schedule encoding differs from the newer sample encoding:

| schedule mask | old field `0x04` | new field `0x04` |
|---:|---:|---:|
| `0x001` | `0x00` | `0x00` |
| `0x002` | `0x08` | `0x04` |
| `0x004` | `0x04` | `0x08` |
| `0x008` | `0x02` | `0x10` |
| `0x010` | `0x01` | `0x20` |
| `0x020` | `0x10` | `0x40` |
| `0x040` | `0x11` | `0x41` |
| `0x080` | `0x12` | `0x42` |
| `0x100` | `0x13` | `0x43` |
| `0x200` | `0x15` | `0x45` |
| `0x400` | `0x14` | `0x44` |
| `0x800` | `0x16` | `0x46` |

This reinforces the earlier rule: auto-rename can share the same evidence model
across old embedded B4AC and new external `chrsysparam`, but field-value
decoders must be version-aware.

## Explicit answer: does MSC editing require `chrsysparam` editing?

Not every MSC edit requires editing `chrsysparam.csyspm`.

Function renaming in decompiled C is a tooling-only symbol change. The game does
not know those function names, so auto-renaming `2.c` callbacks does not require
any `chrsysparam.csyspm` change.

MSC-only edits are also reasonable when the mod only changes code inside an
existing callback and preserves the same external action contract:

- same action row
- same action hash in field `0x2E`
- same group key in field `0x0A`
- same category/input fields such as `0x03/0x04`
- same phase keys in `0x02/0x7C/0x7D`
- same derived-action keys and transition ranges

Paired edits are required when the edit changes the action contract rather than
only the callback implementation. In that case, MSC and `Param/chrsysparam.csyspm`
are two halves of the same runtime behavior. Examples:

- adding a new action that must be selected by the action system
- deleting or replacing an action row
- changing action hash linkage
- moving behavior to a different group or phase path
- changing derived-action links through fields `0x30..0x39`
- changing transition ranges in `0x7E/0x7F` or table1 transition rows

The practical conclusion is that `chrsysparam.csyspm` should not be exposed as a
raw binary editing requirement. The workspace needs a structured action-row
artifact that can be exported, edited, and rebuilt while preserving all unknown
fields exactly. Until that exists, the safe editor policy should be:

1. allow MSC-only callback/symbol edits;
2. warn when an edit changes row/hash/group/category/phase/derived/transition
   metadata;
3. block or mark those edits as incomplete unless the paired Param file can be
   rebuilt.

## Human-readable Param evidence v0

Added `tools/research_chrsysparam_human_export.py` as the first concrete bridge
from raw `chrsysparam.csyspm` binary data to a human-readable research artifact.

This is intentionally not a name dictionary. It exports the action/transition
evidence that the runtime already uses:

```text
chrsysparam.csyspm
  -> research.chrsysparam.human.v0 JSON
     -> table metadata
     -> row records
     -> known semantic fields
     -> full raw u32 cells for exact preservation
```

For table0 action rows, the JSON exposes:

- action hash from field `0x2E`
- group from field `0x0A`
- group callback resolved from matching `2.c func_873()` and `2.txt`
- category/input evidence from fields `0x03/0x04`
- old-formula route/flags coverage when known
- phase callback keys from `0x02/0x7C/0x7D`, resolved through `2.c func_975()`
- derived-action keys from `0x30..0x39`
- per-slot delays from `0x59..0x62`
- table1 transition range fields `0x7E/0x7F`
- the complete raw row as hex `u32` cells

For table1 transition rows, the JSON exposes:

- current/extra action-hash match fields `0x01/0x1F/0x20/0x21/0x22`
- state field `0x02`
- transition mode field `0x06`
- returned fields `0x04/0x05`
- predicate callback key field `0x1C`
- timing fields `0x1D/0x1E`
- the complete raw row

This gives the workspace a concrete path toward a human-readable version:

```text
MSC .c/.mscsb
  + Param/chrsysparam.csyspm
  -> action evidence JSON
  -> user-readable/editable action model
  -> exact-preserving Param rebuild
```

Local duplicate-key scan result:

- 7 local `chrsysparam.csyspm` files were found under `E:\XB\解包\com\file`.
- 5 are placeholder `1 x 1` table pairs.
- `0x31A97FD4` has `71/71` unique nonzero action hashes.
- `0x38C44F75` has `54/54` unique nonzero action hashes.
- no local duplicate action-hash sample exists yet, so `0x700003` variant
  selection remains unproven.

The exporter already records `duplicate_action_hashes` and every derived key's
`candidate_rows`, so the next duplicate sample can be inspected directly in the
same human-readable artifact.

## Human-readable MSC project bundle v0

Added `tools/research_msc_project_human_bundle.py` to combine script-side MSC
evidence and Param evidence into one project-level JSON document:

```text
research.msc_project.human_bundle.v0
  unit identity
  resource ids
  MSC script files present
  group resolver from 2.c func_873 + 2.txt
  phase resolver case count from 2.c func_975
  embedded research.chrsysparam.human.v0 Param export
  action_summary[]
  function_candidates{}
  unresolved{}
```

`function_candidates` is deliberately an evidence index, not a final rename
dictionary. It maps existing script functions to one or more candidate labels,
each backed by action row, action hash, group, and phase/role evidence. This is
the right shape for a future human-readable workflow:

```text
func_1004
  -> ACTION_ROW_012_PHASE_0
     evidence: row 12, group 0x27, action hash 0x270DE97B, phase key ...
```

The 59001001 bundle currently reports:

- 3 MSC scripts present: `0.c`, `1.c`, `2.c`
- 9 group resolver entries from `func_873()`
- 162 phase resolver cases from `func_975()`
- 54 action rows
- 150 script functions with candidate evidence
- 30 rows whose route/flags are not covered by the old B4AC formula
- 20 rows with no direct group callback
- 0 unresolved phase keys
- 0 missing derived-action targets

This advances the target from "auto rename 2.c callbacks" to a broader
human-readable architecture:

```text
Msc + Param
  -> evidence bundle
  -> candidate semantic labels
  -> unresolved reverse-work list
  -> later editable model + exact binary rebuild
```

Current hard boundary: IDA MCP tools are not exposed in this Codex session, and
the local Param samples have no duplicate action hashes. Native `0x700003`
duplicate-key variant selection therefore remains an explicit unresolved item,
not a guessed rule.

## Category-bit evidence for safer readable names

The old TypeScript helper `mscActionRename.ts` maps old `0.c func_143()` branch
masks to fixed action stems such as `A_SHOT`, `B_MELEE`, `AB_SUB`,
`AC_SPECIAL_SHOT`, and `BC_SPECIAL_MELEE`. That is a branch-mask rename path.

The newer `59001001` flow does not expose the same branch mask. It computes a
row-derived category in `0.c func_144()`:

```c
category = field_0x03 % 0x64;
if (category == 1) {
    category = remap(field_0x04);
}
```

The user-provided old EXVS1-style file contains the same category-derivation
shape, but the `field_0x04` values differ by version:

| category | old field `0x04` | new field `0x04` |
|---:|---:|---:|
| `0x04` | `0x01`, `0x03` | `0x20`, `0x30` |
| `0x03` | `0x02` | `0x10` |
| `0x05` | `0x04` | `0x08` |
| `0x02` | `0x08`, `0x0C`, `0x0F` | `0x04`, `0x0C`, `0x3C` |

The old file has explicit comments proving only the first two category bits:

```text
global51 & 0x1 = Shooting
global51 & 0x2 = Melee
```

Therefore the current safe interpretation is bit evidence, not full label
evidence:

- `category & 0x1` -> shooting-type evidence
- `category & 0x2` -> melee-type evidence
- higher bits such as `0x04`, `0x08`, and `0x1C` remain unnamed

Updated human-readable exporters now include:

- `category.computed`
- `category.gameplay_type_bits.shooting_bit`
- `category.gameplay_type_bits.melee_bit`
- `category.gameplay_type_bits.unknown_bits`
- `category_summary` in the project bundle

For `59001001`, this produces category distribution:

| category | rows | known bit evidence |
|---:|---:|---|
| `0x00` | 2 | none |
| `0x01` | 1 | shooting |
| `0x02` | 2 | melee |
| `0x04` | 1 | unknown `0x04` |
| `0x05` | 1 | shooting + unknown `0x04` |
| `0x06` | 1 | melee + unknown `0x04` |
| `0x07` | 3 | shooting + melee + unknown `0x04` |
| `0x08` | 4 | unknown `0x08` |
| `0x09` | 4 | shooting + unknown `0x08` |
| `0x0A` | 2 | melee + unknown `0x08` |
| `0x0B` | 1 | shooting + melee + unknown `0x08` |
| `0x1F` | 32 | shooting + melee + unknown `0x1C` |

This is why first-pass readable labels should stay evidence-shaped, for
example:

```text
ACTION_ROW_003_CAT_0B_GROUP_03
ACTION_ROW_012_CAT_1F_GROUP_27_PHASE_0
```

Do not emit `ACTION_SUB`, `ACTION_SPECIAL_SHOT`, or `ACTION_SPECIAL_MELEE`
solely from these category values yet. Those require further `sys_41`
input-selection evidence or native handler confirmation.
