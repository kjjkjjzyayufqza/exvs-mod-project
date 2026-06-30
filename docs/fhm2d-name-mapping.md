# FHM2D name mapping

This project uses `src/assets/fhm2d-name-map.generated.json` as the default
hash-to-readable-name dictionary for extracted FHM2D workspaces.

## Sources

- `E:\XB\解包\vs2\x64`
- `E:\XB\解包\vs2\bak`
- `E:\XB\解包\vs2\meta`
- `ai_string_v1.txt`
- `ai_string_v14.txt`
- `E:\XB\解包\com\file\012list\0xDFD38C70\character_list.json`
- `tools\ob_unit.json`
- `tools\fhm2d_name_mapping_overrides.json`

The EXVS2 entries come from `0xHASH_meta.bin` source paths and are marked
`exact-meta-path`. OB-only entries can be inferred from extracted structure JSON
payload names plus `ai_string_*.txt`; those are marked
`inferred-ob-ai-string`. OB unit asset hashes from `tools\ob_unit.json` are
marked `ob-unit-list`. OB param workspaces that expose a character ID in
`chrsysparam.csyspm` are marked `ob-param-unit-id`. Research-backed local
overrides are kept in `tools\fhm2d_name_mapping_overrides.json`.

## Naming policy

- `hashName` always keeps the game-facing `0xXXXXXXXX` name.
- `name` is the editable workspace folder and structure JSON stem.
- For EXVS2 meta paths, `name` is usually the pack directory basename, such as
  `001gundam_002chrgel_001`.
- High-level route/category folders such as `006effect/chara/001gundam` are
  preserved as evidence in `packagePath` and `categoryPath`, but are not included
  in `name` unless needed to avoid collisions.
- GUI image packs use the full metadata path instead of stopping at
  `009gui/image`: single-file packs use the file stem, multi-file packs use the
  deepest common folder, and small same-folder subsets include their file stems.
  For example, `0xA0253AA0` maps to `009gui/image/ser/ser_ms` and uses
  `ser_ms`, not `image_a0253aa0`.
- OB AI string names use lower-snake style and drop the leading numeric series
  and default `_001` variant: `ai_CHR_014GNDM00_007REBONS_001` becomes
  `gndm00_007rebons`.
- Names are unique within each route. If two entries would produce the same
  `name`, the generator first adds category path context, then appends the hash
  suffix only when still necessary.

## Route profiles

| Prefix | Pack-root rule |
| --- | --- |
| `001stage` | `001stage/<stage>` |
| `002chara` | `002chara/<unit>` |
| `003motion` | `003motion/<motion-group>/<series>/<unit>` |
| `004ragdoll` | `004ragdoll/<unit>` |
| `006effect` | `006effect/chara/<series>/<unit>` or category fallback |
| `009gui` | image packs use file stem or deepest common folder; flash packs use deepest common folder |
| `012list` | `012list/<list-kind>` |
| `040msc` | `040msc/<unit>` |
| `041cpm` | `041cpm/<param-kind>/<unit-or-table>` when present |
| `090sound` / `091waveform` | sound table or waveform category, made unique by category/hash as needed |

## Generate

```powershell
python tools\build_fhm2d_name_mapping.py `
  --reference-root "E:\XB\解包\vs2\x64" `
  --reference-root "E:\XB\解包\vs2\bak" `
  --meta-root "E:\XB\解包\vs2\meta" `
  --ob-file-root "E:\XB\解包\com\file" `
  --ai-string "ai_string_v1.txt" `
  --ai-string "ai_string_v14.txt" `
  --character-list "E:\XB\解包\com\file\012list\0xDFD38C70\character_list.json" `
  --ob-unit "tools\ob_unit.json" `
  --manual-overrides "tools\fhm2d_name_mapping_overrides.json" `
  --output "src\assets\fhm2d-name-map.generated.json"
```

Current generated stats:

- `13384` total entries
- `10135` `exact-meta-path` entries
- `3246` `ob-unit-list` entries
- `1` `ob-param-unit-id` entry
- `1` `manual-research-note` entry
- `1` `inferred-ob-ai-string` entry
- `4018` entries matched to `character_list.json` character evidence
- `42` current formal `E:\XB\解包\com\file\*\*_structure.json` structure hashes checked
- `42` current formal OB structure hashes mapped
- `0` current OB structure hashes remain unresolved
- `0` generic GUI names of the form `image_<hash>`, `flash_<hash>`, or `font_<hash>`
- `0` duplicate route/name pairs

Metadata audit:

- `22890` metadata files were scanned under `E:\XB\解包\vs2\meta`.
- `21778` metadata files contain source paths under `app\data`/`x64`.
- `1112` metadata files do not contain usable source paths and cannot produce a
  path-backed `exact-meta-path` entry.

`character_list.json` does not currently contain the observed FHM2D pack hashes
from `E:\XB\解包\com\file`; it is used as character evidence after a package
path, AI string, OB unit table row, or `chrsysparam.csyspm` exposes a unit ID.
