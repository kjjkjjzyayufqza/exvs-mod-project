# Unit Model Editor Process

## Context

- Project is a Tauri v2 app. Native filesystem access must use Tauri plugins or
  Rust commands.
- `docs/checklist/repack-stage-fhm2d-checklist.md` is the source for SSBH model
  structure invariants such as `unk2`, texture container flags, and required
  model files.
- Unit model packages are not stage packages. The validator intentionally ignores
  stage-only `info`, `base`, `sky`, HKT, CSV, and SPBIN checks.

## Real Sample Findings

- Sample folder:
  `E:\XB\解包\com\file\0xAF73362C`
- Sibling structure JSON:
  `E:\XB\解包\com\file\0xAF73362C_structure.json`
- The folder is flat on disk. It does not contain physical per-model `0/1`
  texture directories.
- The `_structure.json` contains 14 model groups under the unit model tree.
- The folder has 14 `.numdlb`, 28 `.numatb`, 14 `.nusktb`, 14 `.numshb`, 14
  `.jnttbl`, 14 `.nuhlpb`, 32 `.nutexb`, and one `.shl`.
- The `.shl` file begins with `SHLL`; offset `0x0c` stores the model count as LE
  u32. In the sample this value is 14.
- Unit `.numatb` item nodes may have `unk3=1`; this should not be treated as a
  stage-rule failure.
- Some unit model groups order the two material pairs as `maya, nust`, while
  others order them as `nust, maya`. The reliable pairing rule is the structure
  adjacency: a texture container folder is paired with the following `.numatb`
  item.

## Commands Run

- `git status --short`
- `rg --files docs | rg "(repack|stage|fhm2d|numatb|unit|model|scene|shl|nuhlpb)"`
- `rg -n "shl|nuhlpb|validate_unit|exvs_stage_validate|repack_fhm2d|ssbh-model-preview|SsbhModelPreview|MainView|InfoPanel|RouterItems|sidebarRouteUrls" ...`
- `Format-Hex -Path 'E:\XB\解包\com\file\0xAF73362C\shell_026gnbelt_002nitngl_001.shl' -Count 256`

## Implementation Notes

- Use `_structure.json` as the authoritative texture-container source for unit
  model repack validation.
- Reuse existing `repack_fhm2d` after validation passes.
- Keep the 3D viewport components functionally unchanged during the move.
- Moved `src/page/TestEditor/components/ssbh-model-preview/` to
  `src/components/ssbh-model-preview/` and updated imports to the shared path.
- Added `/UnitModelEdit` after Scene Edit in the sidebar. TestEditor no longer
  owns the 3D View tab or model preview/motion/DAE inspector tabs.
- Unit Model Editor uses the moved viewport and inspector panels, plus a new
  tool panel for folder selection, validation, validation-gated repack, output
  reveal, and AI review payload copy.
- Output reveal uses `@tauri-apps/plugin-opener` `revealItemInDir`, not a shell
  command.
- Model-group detection still treats a folder with SSBH model files but missing
  texture containers as a model group, so missing container errors are reported
  instead of being skipped.

## Verification Log

- `cargo test unit_model_validate --manifest-path src-tauri\Cargo.toml -- --nocapture`
  - PASS: 7 tests.
  - Includes real `0xAF73362C` validation.
  - Includes real `0xAF73362C` repack smoke test to a temporary output path.
  - Includes missing-texture-container model group detection.
- `cargo check --manifest-path src-tauri\Cargo.toml`
  - PASS with existing warnings in unrelated files.
- `npx vitest run src/page/UnitModelEdit/utils/unitModelRepackService.test.ts`
  - PASS: 4 tests.
- `npx vitest run src/components/ssbh-model-preview/boneRuntime.test.ts src/components/ssbh-model-preview/previewUvFlip.test.ts src/components/ssbh-model-preview/matlDataJsonRustCompat.test.ts`
  - PASS: 5 tests.
- `npx tsc --noEmit`
  - BLOCKED by existing SceneEdit errors:
    `sceneEditRndSizePersistence.test.ts` store typing and `DdsFormat` imports
    from `@/lib/ddsFormats`.
