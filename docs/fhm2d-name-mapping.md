# FHM2D name mapping

This project uses `src/assets/fhm2d-name-map.generated.json` as the default
hash-to-readable-name dictionary for extracted FHM2D workspaces.

## Sources

- `E:\XB\解包\vs2\x64`
- `E:\XB\解包\vs2\bak`
- `E:\XB\解包\vs2\meta`
- `ai_string_v1.txt`
- `ai_string_v14.txt`
- `E:\XB\解包\com\file\012list\character_list\character_list.json`
- `E:\OBHK0.3_v27\data\x64\dplcache_release`
- `tools\ob_unit.json`
- `tools\fhm2d_name_mapping_overrides.json`

The EXVS2 entries come from `0xHASH_meta.bin` source paths and are marked
`exact-meta-path`. OB-only entries can be inferred from extracted structure JSON
payload names plus `ai_string_*.txt`; those are marked
`inferred-ob-ai-string`. OB unit asset hashes from `tools\ob_unit.json` are
marked `ob-unit-list`. OB param workspaces that expose a character ID in
`chrsysparam.csyspm` are marked `ob-param-unit-id`. Research-backed local
overrides are kept in `tools\fhm2d_name_mapping_overrides.json`. Real OB
dplcache packages that are not covered by the higher-confidence sources are
read directly from `.fhm2d`; entries with internal file names are marked
`ob-dplcache-internal`, and entries with no usable internal name are marked
`ob-dplcache-fallback`.

## Naming policy

- `hashName` always keeps the game-facing `0xXXXXXXXX` name.
  `ob_unit.json` sometimes stores a 1–7 hex-digit value such as `0x06044d2`;
  the generator left-pads that exact token to 8 digits (`0x006044D2`) instead
  of dropping the row. Path search still requires 8 hex digits so names like
  `001gundam_017dom000_001` are not treated as hashes.
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
- Generic metadata folders such as `090sound/voicetable`,
  `060navi/voicetable`, and `091waveform/voice/pilot` use the concrete source
  file stem when the folder name itself is too generic.
- GUI flash packs under `009gui/flash/*` use concrete bundle folders from the
  metadata source paths, such as `navi_bt_021_o01`, instead of generic
  `flash_navi_battle_<hash>` names.
- Motion metadata that mixes `000common` and unit-specific folders prefers the
  unit-specific package path when available.
- Motion package-name collisions use the concrete `.nuanmb` file prefix shape
  `<motion-group>_<unit>` instead of the full route context
  `<motion-group>_<series>_<unit>`. For example,
  `003motion/001hito/002zgundm/002zgundm_005gunmk2_001` becomes
  `001hito_002zgundm_005gunmk2_001_<hash>`, not
  `001hito_002zgundm_002zgundm_005gunmk2_001_<hash>`.
- OB AI string and character-ID-backed unit names use the full lower-snake unit
  ID, preserving the leading numeric series and variant:
  `ai_CHR_014GNDM00_007REBONS_001` becomes
  `014gndm00_007rebons_001`. The older short form, such as
  `gndm00_007rebons`, is retained only as an alias.
- OB structure JSON files use the hash from the file name when present, and
  fall back to the internal `HashName` field for semantic paths such as
  `002chara/gundam_005gyan00_structure.json`.
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
  --ob-dplcache-root "E:\OBHK0.3_v27\data\x64\dplcache_release" `
  --ai-string "ai_string_v1.txt" `
  --ai-string "ai_string_v14.txt" `
  --character-list "E:\XB\解包\com\file\012list\character_list\character_list.json" `
  --ob-unit "tools\ob_unit.json" `
  --manual-overrides "tools\fhm2d_name_mapping_overrides.json" `
  --output "src\assets\fhm2d-name-map.generated.json"
```

## Validate Against Real OB Files

Use the validation tool after regenerating the mapping. It scans the actual OB
flat dplcache directory and reports coverage, unresolved hashes, hash-suffix
names, duplicate names, and optional metadata source-path coverage.

```powershell
python tools\validate_fhm2d_name_mapping.py `
  --ob-root "E:\OBHK0.3_v27\data\x64\dplcache_release" `
  --meta-root "E:\XB\解包\vs2\meta" `
  --sample-limit 20 `
  --max-missing 0 `
  --max-generic-gui 0 `
  --max-invalid-names 0 `
  --verify-ob-parse `
  --max-ob-parse-failures 0
```

Useful stricter gates:

- `--fail-on-missing` fails when any real OB `.fhm2d` hash has no mapping.
- `--fail-on-hash-suffix` fails when any mapped name still ends in `_XXXXXXXX`.
- `--max-missing N` and `--max-hash-suffix N` can lock a known baseline while
  allowing the current incomplete corpus to remain inspectable.
- `--verify-ob-parse` parses every real OB `.fhm2d` metadata/record table with
  the same parser used by the generator.
- `--verify-ob-record-data` also decompresses/copies every parsed subfile
  payload. This is intentionally opt-in because it performs much heavier I/O.
- `--max-ob-parse-failures N` and `--max-ob-record-data-failures N` can turn
  those parser audits into gates.
- `--report-json <path>` writes the full machine-readable report.

Current generated stats:

- `20742` total entries
- `10135` `exact-meta-path` entries
- `3246` `ob-unit-list` entries
- `6098` `ob-dplcache-internal` entries
- `1258` `ob-dplcache-fallback` entries
- `1` `ob-param-unit-id` entry
- `3` `inferred-ob-ai-string` entries
- `1` `manual-research-note` entry
- `4243` entries matched to `character_list.json` character evidence
- `52` current formal `E:\XB\解包\com\file\*\*_structure.json` structure hashes checked
- `52` current formal OB structure hashes mapped
- `0` current OB structure hashes remain unresolved
- `0` generic GUI names of the form `image_<hash>`, `flash_<hash>`, or `font_<hash>`
- `0` duplicate route/name pairs

Current real OB validation baseline against
`E:\OBHK0.3_v27\data\x64\dplcache_release`:

- `19119` real OB `.fhm2d` files scanned
- `19119` OB hashes mapped (`100.0%`)
- `0` OB hashes still missing from the mapping
- `3508` mapped OB entries still end in a hash suffix and need better naming
  evidence/rules
- `0` generic GUI names of the form `image_<hash>`, `flash_<hash>`, or
  `font_<hash>`
- `0` invalid mapped names
- `0` duplicate route/name pairs

Current `ob-dplcache-fallback` reason breakdown:

- `1044` empty packages (`fileCount = 0`)
- `146` single-file pure `.bin` packages
- `55` two-file pure `.bin` packages
- `9` four-file pure `.bin` packages
- `4` other pure `.bin` package sizes (`3`, `5`, `9`, and `17` files)
- `0` parser-error fallbacks

Metadata audit:

- `22890` metadata files were scanned under `E:\XB\解包\vs2\meta`.
- `21778` metadata files contain source paths under `app\data`/`x64`.
- `1112` metadata files do not contain usable source paths and cannot produce a
  path-backed `exact-meta-path` entry.
- `618770` metadata source-path strings were inspected.
- `209474` unique metadata source paths were observed.
- `0` metadata files with source paths are missing from the generated mapping.
- `1546` metadata files with source paths are mapped by a non-exact source
  such as the OB unit hash table because that source produces a less generic
  unit-facing name.

Real OB FHM2D parse audit with `--verify-ob-parse`:

- `19119` real OB `.fhm2d` files parsed
- `0` parser failures
- `383025` total subfile records
- `346929` non-`.bin` subfile records
- Full payload verification with `--verify-ob-record-data` also passed:
  `0` record data failures across the same `383025` records.
- Top parsed record types:
  - `183227` `.nuanmb`
  - `107834` `.nutexb`
  - `36096` `.bin`
  - `15615` `.numatb`
  - `10796` `.nusktb`
  - `10795` `.numdlb`
  - `10795` `.numshb`
  - `6399` `.nuhlpb`
  - `769` `.nus3bank`
  - `646` `.nudnbb`

`character_list.json` does not currently contain the observed FHM2D pack hashes
from `E:\XB\解包\com\file`; it is used as character evidence after a package
path, AI string, OB unit table row, or `chrsysparam.csyspm` exposes a unit ID.
