# 2026-10-01 efxbn name recovery (handoff)

## Goal

When an effect pack (`006effect`) is unpacked, give each `.efxbn` its real file name
(`eff_028gunwtv_013talgs2_001_laser_004.efxbn`) instead of its sub-file index (`16.efxbn`).
Repacking must stay byte-identical. Status: researched and verified on data, **not implemented**.

## Current behavior

- `src-tauri/src/format/fhm2d.rs`, `apply_effect_shallow_parent_resource_names` (around line 1621):
  - a payload starting with `EFXB` keeps its index as the base name: `format!("{base}.efxbn")`, around line 1680;
  - textures (`.nutexb`) and models get their names because those files store the name inside them.
- The test at around line 2428 asserts `.\pack\0\0\167.efxbn`; it changes with this feature.
- Effect folder editor (`src-tauri/src/format/effect_folder.rs`, `copy_effect_folder_selection_with_policies`):
  - copies an efxbn together with the textures / models it references (closure);
  - keeps or rewrites the Item hash (`unk3`).
  - Observed 2026-10-01 copying talgs2 `16.efxbn` / `25.efxbn` into a new pack:
    - the copies became `16_copy` / `25_copy` with new hashes `0x97E6A9AC` / `0x209AC19F`;
    - the texture kept its name and hash;
    - `SubFileStructure` was updated, `SubFileParseStructure` was not.
    - A depiction that should show the copies must use the new hashes.

## Facts (verified 2026-10-01)

1. **An efxbn holds no name**: no name string and no hash of its own name. Checked on all 14 Tallgeese II efxbn.
   The only crc32 values inside an efxbn are the models / textures it references.
2. **The name hash is the directory Item's `unk3`**:
   - In `<pack>_structure.json`, `SubFileParseStructure` -> every `Item` has `unk3` (signed i32).
   - `unk3` = zlib `crc32(ASCII file name without extension)`.
   - The same holds for textures. Tallgeese II `eff_028gunwtv_013talgs2_001_thunder_001.nutexb` has `unk3` 516630982 = `0x1ECB29C6`.
   - Items with the same base name share the hash. FAUC texture `aura_001` and `73.efxbn` both have `unk3` 132420348.
   - `unk2` is `01000000` on textures and `00000000` on efxbn Items.
   - Tallgeese II pack `0xE9683E75`:

     | file | `unk3` | name |
     |---|---|---|
     | `16.efxbn` | -470817491 = `0xE3EFE52D` | `eff_028gunwtv_013talgs2_001_laser_004` |
     | `25.efxbn` | 176963608 = `0x0A8C4018` | `eff_028gunwtv_013talgs2_001_laser_002` |
3. **The game looks effects up by this hash.** A projectile depiction row stores crc32 of the effect file name:
   - Tallgeese II depiction `0x37EB51C1` -> `materialHash` `0xE3EFE52D`, `destroyEffectHash` `0x0A8C4018`;
   - common model `0x7C142897` = `eff_000common_000common_001_laser_031`.
   So a name that crc32-matches `unk3` is the real name.
4. **Coverage of a name dictionary** over every pack in `E:\XB\mod\006effect` (750 efxbn Items):
   - 587 resolve from crc32 of the file names in the old named unpack `E:\XB\解包\vs2\x64\006effect\chara\**`.
     It holds 2,241 file names: models, textures and efxbn. 428 of the 587 are byte-identical to that named file; 158 differ (mods / version).
   - Of the 128 that are left (packs with standard names), 117 resolve from generated names `eff_<pack>_<kind>_<nnn>`:
     - `<pack>` = the structure `Name`, for example `053gbftry_005tsient_001`;
     - `<kind>` = the 476 kinds parsed from the named unpack by regex `eff_\d{3}[a-z0-9]+_\d{3}[a-z0-9]+_\d{3}_([a-z0-9]+)_\d{3}$`;
     - `<nnn>` = `001`..`099`.
   - 11 stay unresolved, in `053gbftry_005tsient_001` and `059nextgn_002nextgx_001`.
   - Packs with custom names (`wing_gundam_zero_rebellion_effect`, `gundam_002chrgel`) were not counted. Their `<pack>` should come from the original unit:
     - the `HashName` -> `routeId: unit.effect` entry of `src/assets/fhm2d-name-map.generated.json`;
     - or the `copy-as-new from 0x...` source in `E:\XB\mod\resource_registry.json`.

Evidence scripts (Python, outside this repo):
- `E:\research\EXVS2-POC\docs\agent-sessions\fauc-full-armor-unicorn-mod\scripts\efxbn_unk3_check.py`: unk3 -> name from the named unpack, plus a byte comparison;
- `...\efxbn_guess_check.py`: generated names for the rest.

## Implementation plan

1. Build a dictionary `crc32 -> name` at unpack time. Do not commit a name list (game material). Sources, in order:
   - a. names already known in the same pack: texture and model base names, since an efxbn often shares its base name with a texture;
   - b. a user-configured named-unpack directory, scanned for file base names (optional setting);
   - c. generated `eff_<unitPack>_<kind>_<nnn>`. `<kind>` comes from a + b plus a small built-in seed list. `<unitPack>` is the structure `Name`, or the original unit name for packs with custom names.
2. In `apply_effect_shallow_parent_resource_names`, for an `EFXB` payload:
   - look up the Item's `unk3` (as u32) in the dictionary;
   - one match: name the file `<name>.efxbn` and set `fileBaseName`;
   - no match, or two names with the same crc32: keep `<index>.efxbn` and add a warning with the hash.
3. Repack:
   - `unk3` must come from the structure JSON, never be recomputed from the file name;
   - renaming must not change the hash unless the user asks;
   - when a user adds a new named efxbn, `unk3` = crc32(name) is the right default.
   - Check `repack_effect_folder_from_structure` (`effect_folder.rs`) and `fhm2d_pack.rs` for both rules.
4. Update the `167.efxbn` test and add one for a dictionary hit and one for a miss.

## Acceptance

- Unpacking `0xE9683E75.fhm2d` names `16` / `25` as `eff_028gunwtv_013talgs2_001_laser_004` / `_laser_002`.
- On the packs under `E:\XB\mod\006effect`, at least 704 of 750 efxbn are named; the rest keep their index, each with a warning that carries the hash.
- Unpack -> repack of an untouched effect pack is byte-identical to the original `.fhm2d`.
