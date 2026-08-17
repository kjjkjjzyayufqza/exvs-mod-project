# EXVS Common Bundle

## Goal

Add a standalone `ExvsCommon` Rust domain and Unit Model Editor profile for the fixed OB v27 package `0xCB665375`, extracted from DPLCache into `Extract Output Path/002chara/000common_000common_001` with content-based auto naming and complete model/texture editing.

## Decisions

- Source is DPLCache only; MOD is never an extraction fallback.
- Rust handler is `format/exvs_common.rs`; legacy Unit Model extraction remains unchanged.
- Common identity is fixed `HashName=0xCB665375`.
- Layout uses `models`, `textures`, `camera`, `system`, and `control` under one `002chara` package.
- Camera/system resources are visible but read-only; models/textures support full CRUD.
- SHL supports types 0..7; newly added models write type 3 (Part). Automatic model CRUD synchronization, and unrestricted advanced edits with warnings.
- Unknown resources extract to a stable fallback name and block repack.

## Progress

- Isolated worktree: `feat/exvs-common-bundle`.
- Baseline Unit Model/workspace path tests: 14 passed.
- Added `Fhm2dFormat::ExvsCommon` / `exvs_common` CLI and memory-preview labels.
- Added standalone `format/exvs_common.rs` with fixed path resolution, SHA-256/content naming,
  semantic extraction, explicit manifest, atomic backup/swap, standalone validation, fixed mod
  repack, model/texture transactions, and SHL synchronization.
- Real package acceptance covers 43 physical payloads, 48 visible logical resources, 53 preserved
  structure item references, 5 deduplicated textures, and 0 unknown resources.
- Added Unit Model Editor Common Profile entry/dialog, profile validation and repack routing,
  runtime model-ID input, model/texture CRUD routing, read-only camera/system surfacing, and
  context-aware SHL types 0..7.
- Legacy Unit Model extraction and Test Editor Character ID Model action were not changed.

## Verification

- `cargo test --test exvs_common_bundle_test`: 7 passed, including real extract -> validate ->
  repack -> re-extract round-trip, overwrite backup, DPLCache byte preservation, model add/remove,
  texture add/remove, and SHL duplicate/range behavior.
- Targeted frontend Vitest: 32 passed across Common service/dialog/toolbar, model service, repack,
  and SHL editor tests.
- `pnpm exec tsc --noEmit` reaches only two pre-existing unrelated errors in
  `daeSsbhTypes.ts:318` and `BulletPropertyPanel.tsx:227`; no Common Profile TypeScript error remains.
- `cargo test --lib` remains unsuitable as a narrow gate because unrelated Effect Folder cfg-test
  fixtures currently fail to compile; the dedicated integration target is the semantic gate.
