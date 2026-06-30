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
| `009gui` | single-file packs use file stem; multi-file packs use category plus collision suffix |
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

- `13385` total entries
- `10135` `exact-meta-path` entries
- `3246` `ob-unit-list` entries
- `1` `ob-param-unit-id` entry
- `1` `manual-research-note` entry
- `2` `inferred-ob-ai-string` entries
- `4019` entries matched to `character_list.json` character evidence
- `48` current `E:\XB\解包\com\file` structure hashes checked
- `48` current OB structure hashes mapped
- `0` current OB structure hashes remain unresolved
- `0` duplicate route/name pairs

`character_list.json` does not currently contain the observed FHM2D pack hashes
from `E:\XB\解包\com\file`; it is used as character evidence after a package
path, AI string, OB unit table row, or `chrsysparam.csyspm` exposes a unit ID.
