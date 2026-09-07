# EXVS2 JSON CLI (`exvs2-json`)

AI-facing CLI for converting known EXVS2 binary/resource files into structured
JSON and applying scoped JSON edit requests to formats with lossless builders.
It lives in the Tauri Rust crate and reuses the same parsers as the desktop
editor backend.

Design background: `docs/superpowers/specs/2026-06-28-exvs2-binary-json-cli-design.md`

## Source Layout

| Path | Role |
|------|------|
| `src-tauri/src/exvs2_json_cli/` | Shared CLI core (`inspect`, `edit`, `correlate`, JSON envelope) |
| `src-tauri/src/bin/exvs2_json.rs` | Binary entry point |
| `src-tauri/tests/exvs2_json_cli_test.rs` | Integration tests (default `cargo test` target) |

Parser reuse:

- `.jnttbl` → `src-tauri/src/jnttbl_format.rs`
- `character_id_table.bin` → same layout as `src/models/characterIdTable.ts`
- Typed param tables → `src-tauri/src/format/{vernier_table,armsparam,bulletparam,projectile_depiction_table,hitgroupiddef,interactionid,grapparam}.rs`
- SSBH model files → `ssbh_data` (`SkelData`, `MeshData`, `ModlData`) via the same parsers as UnitEdit / FBX round-trip

## How To Run

From `src-tauri/`:

```powershell
cargo run --bin exvs2_json -- --help
cargo run --bin exvs2_json -- inspect "<path>" --summary --pretty
cargo run --bin exvs2_json -- edit "<path>" --request "<edit.json>" --output "<new-path>" --pretty
cargo run --bin exvs2_json -- correlate --unit 001GUNDAM/005GYAN00/001 --weapon SuibakuMissile --id 10050102 --pretty
```

After a release build, the executable is `exvs2_json.exe` under
`src-tauri/target/release/`. The CLI name in JSON output is always `exvs2-json`.

## Commands

### `inspect`

```powershell
exvs2-json inspect "<known-exvs2-file-path>" [--type <type>] [--pretty] [--summary] [--raw-fields] [--roundtrip-check]
```

- Auto-detects type from magic bytes and filename when possible.
- Use `--type` when param-bin magic is present but the filename is ambiguous.
- `--summary` returns compact AI pickup (recommended for large files such as
  `character_id_table.bin` and `.numshb`).
- `--raw-fields` adds per-entry hash/name/offset dumps for typed param tables.
  For `.numshb`, `--raw-fields` includes full vertex attribute buffers.
- `--roundtrip-check` parses and rebuilds formats that already have lossless
  builders (`jnttbl`, typed param tables, `character_id_table`). For SSBH
  files (`nusktb`, `numshb`, `numdlb`) it reports rebuild size and warns when
  the rewrite is not byte-identical (expected for Skel/Mesh/Modl).

### `correlate`

```powershell
exvs2-json correlate --unit <bucket> --weapon <task-name> --id <dispatcher-id> [--pretty]
  [--player-facing-name <name>] [--atwiki-url <url>]
  [--ida-dispatcher <sym>] [--ida-wrapper <sym>] [--ida-constructor <sym>]
  [--task-class <name>] [--object-size <hex>]
```

Produces one JSON skeleton for joining unit/weapon/IDA/resource/runtime evidence.
It does **not** call IDA or scan resource folders automatically yet; paste IDA
evidence with the optional flags.

### `edit`

```powershell
exvs2-json edit "<known-exvs2-file-path>" --request "<edit.json>" --output "<new-file>" [--type <type>] [--pretty] [--dry-run]
exvs2-json edit "<known-exvs2-file-path>" --request-json "<json>" --output "<new-file>" [--type <type>] [--pretty] [--dry-run]
```

Applies an AI-facing JSON edit request and returns a JSON report with
`reportType: "edit"`, `operationsApplied`, byte lengths, warnings, and a compact
post-edit preview. `--dry-run` returns the report and rebuilt bytes in memory
for tests/API callers but does not write `--output`.

Supported edit types are intentionally limited to formats with byte-identical
builders:

- `jnttbl`
- `character-id-table`
- `vernier-table`
- `armsparam`
- `bulletparam`
- `speedparam`
- `projectile-depiction-table`
- `hitgroupiddef`
- `interactionid`
- `grapparam`
- `navi-list`
- `pilot-list`

SSBH files (`nusktb`, `numshb`, `numdlb`) remain inspect-only because their
rewrite path may be semantically valid but not byte-identical.

Example request:

```json
{
  "type": "bulletparam",
  "operations": [
    {
      "op": "setParamField",
      "entryId": 10,
      "field": "initialAngle",
      "value": 2.5
    }
  ]
}
```

Supported operations:

- `jnttbl`: `addJnttblEntry`, `setJnttblEntry`, `deleteJnttblEntry`
- `character_id_table`: `setCharacterResource`, `upsertCharacterRow`,
  `deleteCharacterRow`
- typed param tables: `setParamField`, `copyParamEntry`, `upsertParamEntry`,
  `deleteParamEntry`

For typed param tables, `copyParamEntry` and newly inserted `upsertParamEntry`
rows are inserted by unsigned `entryId` order. Official Param samples keep the
entry-id table sorted, and native lookup may assume that order. Do not append a
new CRC row after larger IDs merely because the rebuilt file parses or passes a
tool-side round-trip.

## Supported Inspect Types

| `--type` alias | `detectedType` | Auto-detect signal |
|----------------|----------------|--------------------|
| `jnttbl` | `jnttbl` | `JNTT` magic or `.jnttbl` |
| `character-id-table` | `character_id_table` | magic `A9 B8 AB CE` or filename |
| `vernier-table` | `vernier_table` | filename contains `vernier_table` |
| `armsparam` | `armsparam` | filename |
| `bulletparam` | `bulletparam` | filename |
| `projectile-depiction-table` | `projectile_depiction_table` | filename |
| `hitgroupiddef` | `hitgroupiddef` | filename |
| `interactionid` | `interactionid` | filename |
| `grapparam` | `grapparam` | filename |
| `navi-list` | `navi_list` | filename contains `navi_list` (`.vgsht2` / `.bin`) |
| `pilot-list` | `pilot_list` | filename contains `pilot_list` (`.vgsht2` / `.bin`) |
| `nusktb` | `nusktb` | `.nusktb`, or `HBSS` + `LEKS` tag at `0x10` |
| `numshb` | `numshb` | `.numshb`, or `HBSS` + `HSEM` tag at `0x10` |
| `numdlb` | `numdlb` | `.numdlb` / `.nusrcmdlb`, or `HBSS` + `LDOM` tag at `0x10` |

### SSBH inspect notes

- Default `numshb` output omits vertex buffers; use `--raw-fields` only when you
  explicitly need full geometry JSON.
- `nusktb` full output includes bone transforms; `--summary` keeps names and
  parent indices only.
- `numdlb` links sibling `.nusktb`, `.numshb`, and `.numatb` filenames.

## JSON Envelope

Every `inspect` response includes:

```json
{
  "tool": "exvs2-json",
  "schemaVersion": 1,
  "sourcePath": "E:\\...",
  "detectedType": "vernier_table",
  "byteLength": 2680,
  "endianness": {
    "hashMatching": "little-endian",
    "displayCanConvert": true
  },
  "warnings": [],
  "data": {}
}
```

Hash-like fields use this shape:

```json
{
  "value": 932581107,
  "hex": "0x379612F3",
  "rawLeBytes": "F3 12 96 37"
}
```

Use `rawLeBytes` for IDA byte search. Use `hex` for human-readable correlation.

## Type Notes

### `jnttbl`

- Bone list with file offset, duplicate-hash warnings, `idaBytePattern`.
- `--roundtrip-check` uses `serialize_jnttbl`.

### `character_id_table`

- Rows expose `characterId` plus six signed resource columns:
  `model`, `effect`, `sound`, `param`, `msc`, `motion`.
- Each column includes signed `value`, unsigned `hex`, and `rawLeBytes`.
- Verified sample:
  `E:\XB\解包\com\file\012list\0x036B9E67\character_id_table.bin`
  → `1695` rows, entry size `0x18`.

### `vernier_table`

- Full parse uses `vernier_table.rs` schema.
- `--summary` emits `enabledFollowBoneRows` (`isEnabled` + `isFollowBone`).
- Verified sample:
  `E:\XB\解包\com\file\002chara\0x46DE9B9C\vernier_table_001gundam_005gyan00_001.bin`
  → `14` entries, `6` enabled follow-bone rows including `0xF7070A81`.

### `armsparam`

- Includes `fieldNotes.isVernier`: parser field `0x5B072B6C` is **not** the same
  as task runtime `task_param+5` vernier-controller gate.

### `bulletparam` / `projectile_depiction_table`

- Named fields from command pools; do not infer gameplay move names without
  explicit local or atwiki mapping.
- `bulletparam` names include legacy inferred labels. Do not treat
  `hitboxWidth`, `hitboxHeight`, `hitboxDepth`, `collisionHeight`, or
  `blastRadius` as proven physical-collider controls without checking the
  native consumer path.
- For custom Gyan ship id `900300001`, those collision-looking fields match
  native Suibaku `10050102`; the proven direction is a scoped native
  `CShellCollision` multi-sphere patch, not a data-only bulletparam edit.

### `hitgroupiddef` / `interactionid` / `grapparam` (hitbox tables)

The three melee-hitbox tables share the standard param-bin container and the full
typed-param edit op set (`setParamField`, `copyParamEntry`, `upsertParamEntry`,
`deleteParamEntry`). Rebuilds are byte-identical (verified across all 87 table
files under `E:\XB\mod\041cpm` and `E:\XB\解包\com\file\041cpm`). Field names
follow the corrected, binary-proven schema in `docs/hitbox-research/`; legacy
pre-correction names (`groupId`, `boneHash`, `receiveMode`, …) are rejected as
unknown fields — there is no alias fallback.

**hitgroupiddef** (`docs/hitbox-research/02-hitbox-volume-engine.md`, binary-proven):

- One row = ONE SPHERE in bone space: center `centerX`/`centerY`/`centerZ`,
  radius `sphereRadius` (f32, untransformed by the bone matrix).
- `shapeMode`: `0` = static sphere, `1` = frame-swept capsule between prev/current
  frame centers.
- `interactionId`: foreign key to `interactionid.entryId`, armed by MSC
  `func_148(interactionId)`; it is **not** a bone hash.
- `boneId`: attachment bone id resolved through the skeleton bone-id→index map.
- `collisionFlags`: row class — `0` attack, `1` hurtbox, `2` third class.
- `unused3284a82d` / `unused42ee5ca2` / `unused458398bb` / `unusedAce03d8e` /
  `unusedDbe70d18`: DEAD — the engine never reads them (02 §7). They are parsed
  and rebuilt only for byte-faithful round-trips; editing them has no effect.

**interactionid** (`docs/hitbox-research/03-hit-effect-taxonomy.md` §1):

- Binary-proven fields: `damage` (displayed damage 1:1), `downValue` (wiki down
  value ×100, decrementing budget), `correctionPct`, `damageMultGate`,
  `damageMultGate2`, `visualEffectClass`, `victimGaugeAdd`, `knockbackDirModeA`,
  `knockbackDirModeB`, `downAccumQuarter`, `rehitInterval`, `targetFilter`,
  `interactionClass`, `maxHitCount`, `knockbackType` (mechanism proven).
- UNVERIFIED (legacy guessed names with no proven read site — 03 §4): `stunValue`,
  `stunFrame`, `hitstopFrame`, `knockbackDistance`, `groundBounce`, `hitLevel`,
  `canTech`, `seHash`, `damageRate`, `hitEffectId`, `interactCategory`,
  `unkBarrierHash`, `wallBounceType`, `untechableFrame`, `interactId`.
- `interactTargetHash` is a subsystem selector (melee vs other), not an entry
  reference and not a bone (01 §3.5).

**grapparam** (`docs/hitbox-research/01-melee-hitbox-architecture.md` §5.2):

- Move-level melee table (frames/behaviour), bound via MSC `func_219(hash)`;
  all 16 field hashes are read by `sys_0(0x60002, entryId, fieldHash)`.
- CAUTION: `damage` / `correctionPct` / `downValue` here are NOT the wiki-visible
  displayed damage / correction / down values — those live in `interactionid`
  (03 §2.1). Do not edit grapparam damage expecting displayed damage to change.
- `grapPriority` and `downValueLast` are multiplied by 100 on load.
- `reach` uses a different coordinate system from `sphereRadius`; conversion is
  UNPROVEN (01 §7).

Example edit request:

```json
{
  "type": "hitgroupiddef",
  "operations": [
    { "op": "setParamField", "entryId": 1, "field": "sphereRadius", "value": 3.25 }
  ]
}
```

### `navi_list` / `pilot_list`

Both are standard `param_bin` tables (magic `0xCDABB8A9`, same as
`series_list` / `character_list`), not encrypted blobs. Strings use the shared
obfuscated trailing string pool.

| File | Role | Sample path |
|------|------|-------------|
| `navi_list` | Support navi (刷卡左边 + 战斗中说话) | `012list/navi_list/navi_list.vgsht2` |
| `pilot_list` | MS pilot presentation codes / costume resource keys | `012list/pilot_list/pilot_list.vgsht2` |

**navi_list** notable fields:

- `characterUniqueId` — small navi id (ハロ=1, ララァ=2, …); multiple rows share
  one id when costumes differ
- `costumeIndex` — `0` default outfit, `1+` alternate
- `displayName` — decoded Japanese name
- `seriesListEntryId` — foreign key to `series_list.entryIds`

**pilot_list** notable fields:

- `pilotNameShort` / `pilotNameFull` — internal codes (`PS001A01`, `P001A01`),
  not Japanese display names (those live on `character_list` + localization)
- `msPilotLabel` / `pilotLabel` — `S_MS_PILOT_###` / `S_PILOT_###`
- `seriesListEntryId` — foreign key to `series_list.entryIds`

`--summary` lists compact name rows; full inspect dumps all named fields.
`--roundtrip-check` uses the shared list builder (byte-identical when unedited).
Edit ops: same typed-param set (`setParamField`, `copyParamEntry`,
`upsertParamEntry`, `deleteParamEntry`), including kind-7 string rewrites.

## Guardrails

The CLI avoids overclaiming:

- A JNT bone hash proves model support, not task activation.
- A vernier row proves resource support, not runtime gate state.
- `arms_param.is_vernier` is not `task_param+5`.
- ATWiki names are player-facing vocabulary, not binary evidence.
- Effect id alone is not behavior identity; require hitgroup, bone, gate, and
  model availability.
- Parser field names are not runtime proof. For projectile collision changes,
  confirm the native task/vtable consumer before relying on a field label.
- `roundtripCheck.byteIdentical` proves parser/builder self-consistency, not
  native runtime validity. In particular, an older `exvs2-json` build could
  append copied Param rows out of unsigned `entryId` order and still round-trip;
  current copy/upsert insertion preserves sorted order.
- Hitbox tables: only fields marked PROVEN in `docs/hitbox-research/` have
  binary-verified consumers. UNVERIFIED interactionid fields keep legacy guessed
  names and may do nothing. The five `unused*` hitgroupiddef fields are dead.
- grapparam damage-like fields are move-level bookkeeping, not the displayed
  damage; displayed damage/correction/down values live in interactionid.

## Testing

Default workspace test scope is intentionally narrow to avoid compiling legacy
heavy targets:

```powershell
cd src-tauri
cargo test
```

This runs only `tests/exvs2_json_cli_test.rs`. Legacy utility bins remain available
under the `legacy-cli-tools` Cargo feature when explicitly needed.

## Not Implemented Yet

- `--xref` automatic Tauri/atwiki lookup
- Automatic resource-folder join inside `correlate`
- IDA JSON/CSV import
- SSBH mutation/repack commands
