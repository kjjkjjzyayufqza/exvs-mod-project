# EXVS2 JSON CLI (`exvs2-json`)

AI-facing read-only CLI for converting known EXVS2 binary/resource files into
structured JSON. It lives in the Tauri Rust crate and reuses the same parsers as
the desktop editor backend.

Design background: `docs/superpowers/specs/2026-06-28-exvs2-binary-json-cli-design.md`

Cross-repo pickup note for projectile hook work:
`docs\EXVS2JsonCli.md`

## Source Layout

| Path | Role |
|------|------|
| `src-tauri/src/exvs2_json_cli.rs` | Shared CLI core (`inspect`, `correlate`, JSON envelope) |
| `src-tauri/src/bin/exvs2_json.rs` | Binary entry point |
| `src-tauri/tests/exvs2_json_cli_test.rs` | Integration tests (default `cargo test` target) |

Parser reuse:

- `.jnttbl` → `src-tauri/src/jnttbl_format.rs`
- `character_id_table.bin` → same layout as `src/models/characterIdTable.ts`
- Typed param tables → `src-tauri/src/format/{vernier_table,armsparam,bulletparam,projectile_depiction_table}.rs`
- SSBH model files → `ssbh_data` (`SkelData`, `MeshData`, `ModlData`) via the same parsers as UnitEdit / FBX round-trip

## How To Run

From `src-tauri/`:

```powershell
cargo run --bin exvs2_json -- --help
cargo run --bin exvs2_json -- inspect "<path>" --summary --pretty
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

## Supported Inspect Types

| `--type` alias | `detectedType` | Auto-detect signal |
|----------------|----------------|--------------------|
| `jnttbl` | `jnttbl` | `JNTT` magic or `.jnttbl` |
| `character-id-table` | `character_id_table` | magic `A9 B8 AB CE` or filename |
| `vernier-table` | `vernier_table` | filename contains `vernier_table` |
| `armsparam` | `armsparam` | filename |
| `bulletparam` | `bulletparam` | filename |
| `projectile-depiction-table` | `projectile_depiction_table` | filename |
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

## Guardrails

The CLI avoids overclaiming:

- A JNT bone hash proves model support, not task activation.
- A vernier row proves resource support, not runtime gate state.
- `arms_param.is_vernier` is not `task_param+5`.
- ATWiki names are player-facing vocabulary, not binary evidence.
- Effect id alone is not behavior identity; require hitgroup, bone, gate, and
  model availability.

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
- Mutation/repack CLI commands
