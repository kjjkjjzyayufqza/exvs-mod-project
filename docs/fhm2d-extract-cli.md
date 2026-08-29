# FHM2D Extract CLI (`fhm2d-extract`)

Standalone CLI for unpacking OB `.fhm2d` archives with **required** naming type
and explicit **folder** / **flat** disk layout. Mirrors the thin-bin + library
CLI core pattern used by `exvs2-json`.

Cross-agent hub: `AGENTS.md` · Artifact rule:
`.cursor/rules/fhm2d-extract-artifacts.mdc` · Global: custom-rules §7c.

| Path | Role |
|------|------|
| `src-tauri/src/fhm2d_extract_cli/` | Shared CLI core (args, usage, run) |
| `src-tauri/src/bin/fhm2d_extract.rs` | Binary entry |
| `src-tauri/src/format/fhm2d.rs` | Extract + naming + write layout |
| `src-tauri/tests/fhm2d_extract_cli_test.rs` | Integration tests |
| `src-tauri/target/debug/fhm2d_extract.exe` | Agent default binary |

## Agent policy (mandatory)

1. **Prefer this CLI** for terminal / agent unpack of OB `.fhm2d`. Do not use
   legacy `fhm2d_extract_folder` unless the user asks (`legacy-cli-tools`).
2. **Debug only** for normal work: `cargo build --bin fhm2d_extract` (no
   `--release` unless the user requests it).
3. **All outputs under `tmp/`**: every persisted artifact from preparing,
   running, or validating this CLI must go under the repository-root `tmp/`
   tree. Prefer `tmp/fhm2d-extract/<task>/`.
4. **Never** extract beside the source `.fhm2d`, into game `data\x64`, workspace
   `com\file` trees, `docs/`, `src-tauri/`, or the repo root unless the user
   explicitly requests that path.
5. From repo root use `tmp/...`; from `src-tauri/` use `../tmp/...`.

Covered artifacts: `--output` folders, sibling `*_structure.json`, `meta.bin`,
redirected stdout/stderr logs, reports, diffs, and temporary fixtures.

## Build / Run

From `src-tauri/` (debug only for normal agent work):

```powershell
cargo build --bin fhm2d_extract
cargo run --bin fhm2d_extract -- --help

$task = "..\tmp\fhm2d-extract\<task>"
New-Item -ItemType Directory -Force $task | Out-Null

.\target\debug\fhm2d_extract.exe "<source.fhm2d>" `
  --output "$task\pack" `
  --type motion `
  --layout folder `
  2>&1 | Tee-Object -FilePath "$task\extract.log"

.\target\debug\fhm2d_extract.exe "<source.fhm2d>" `
  -o "$task\pack_flat" `
  -t character `
  -l flat
```

## Required flags

| Flag | Meaning |
|------|---------|
| `SOURCE_FHM2D` | Input `.fhm2d` path (read-only) |
| `--output` / `-o` | Output directory — **must be under `tmp/` for agent runs** |
| `--type` / `-t` | Naming type — **no default**; must be set |
| `--layout` / `-l` | `folder` or `flat` — **no default** |

### Types

`character`, `effect`, `motion`, `msc`, `sound`, `character_param`,
`character_cost`, `striker_table`, `all_nutexb`, `stage_list`

Legacy `fhm2d_*` ids (e.g. `fhm2d_motion`) are also accepted.

### Layouts

| Value | Behavior |
|-------|----------|
| `folder` | Preserve SubFileStructure relative paths under `out_dir` |
| `flat` | Write basenames only under `out_dir` (no nested archive folders) |

Layout is independent of type: any type can use folder or flat.

## Output

- Files under `--output`
- Structure sidecar: `<out_dir>_structure.json` next to the output folder name  
  (example: `--output tmp/fhm2d-extract/t/pack` →
  `tmp/fhm2d-extract/t/pack_structure.json`)
- Optional `--write-meta-bin` → `meta.bin` inside the output directory
- Naming warnings print to stderr; process still exits 0 when files were written

## Relation to other tools

- **Test Editor** idtable extract still uses Tauri `extract_fhm2d_to_folder`
  (layout defaults: motion/effect → folder, others → flat). That UI path writes
  to configured workspace/extract folders, not this agent `tmp/` policy.
- Stage SceneEdit rename extract and unit-model regroup extract are separate
  commands; format pitfalls live in `.cursor/skills/fhm2d-format/SKILL.md`.
- Legacy bin `fhm2d_extract_folder` remains behind `legacy-cli-tools` and is not
  the default agent CLI.
