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

## Practical next step for the tool

Extend `native_truth.json` with a first-class `action_names` map (`{ "0xF48D2D49": "mainShot", ... }`)
and add a TS/Python pass `renameByActionHashDictionary(2.c, dictionary)` that supersedes the
mask-based `mscActionRename.ts` while keeping the mask pass as a fallback labeler for unmapped hashes.
