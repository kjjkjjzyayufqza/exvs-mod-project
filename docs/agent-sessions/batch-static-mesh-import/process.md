# Batch Static Mesh Import - Process

## Goal

Add batch FBX/DAE to SSBH inside the Scene Editor static mesh import workflow.
Every item writes directly to disk and must also generate `map_hit.hkt`; no
SceneEdit memory session is used.

## Relevant docs read

- `docs/agent-sessions/scene-dae-ssbh-save/process.md`
- `docs/agent-sessions/fbx-import-transform-fix/process.md`
- `docs/agent-sessions/numatb-template-config/process.md`
- `docs/superpowers/specs/2026-05-18-scene-editor-havok-import-pipeline-design.md`
- `docs/havok-xml-import-feature.md`

## Findings

- `scene_convert_static_mesh_to_stage_files_streamed` already accepts a source
  file path, output root, and `ImportConfig`.
- The command converts through temporary artifact paths, writes SSBH files to
  `{outputRoot}/{baseFilename}/0`, and writes HKT to
  `{outputRoot}/{baseFilename}/map_hit.hkt`.
- The command does not require a `SceneMemorySession`, so it is the correct
  backend boundary for this feature.
- HKT generation currently returns warnings instead of failing the entire
  command. The batch layer must treat `hktGenerated === false` as an item
  failure because HKT is mandatory for this tool.
- Batch execution should be serial. FBX parsing and Havok conversion are
  expensive and may invoke the same external Havok tool.
- Existing DAE/FBX analyzers provide geometry validation and source up-axis.
- Existing HKT simplify controls and direct conversion progress events can be
  reused.

## Design

- Add a second import action beside the existing Scene Editor static mesh import
  button.
- Open the existing `DaeImportConfigModal` in a forced batch-to-disk mode.
- Reuse `DaeImportSsbhFullPanel` so NUMDLB mapping, NUMATB templates, texture
  profile editing, missing texture paths, and reference validation behave the
  same as single-file import.
- Apply the configured NUMATB profiles to every selected source.
- Analyze selected sources serially and mark non-convertible inputs as blocked.
- Use one output root and shared SSBH/HKT settings. Each output folder keeps the
  source filename.
- Remap each source's analyzed geometry names to the configured material labels
  before conversion.
- Validate every source path against the final NUMATB texture references before
  closing the modal or invoking conversion.
- Execute items serially and continue reporting individual failures.
- Block execution when Havok Content Tools is unavailable, the output directory
  is missing, analysis is incomplete, a source is invalid, or a texture
  reference cannot be resolved.

## Verification

- RED: the batch default-config test failed because
  `createBatchDaeImportConfig` did not exist.
- GREEN: focused Scene Editor import tests passed after implementation.
- `npx vitest run` for import defaults, session config mapping, full SSBH panel,
  and HKT simplify controls: PASS, 4 files / 24 tests.
- `npx vite build`: PASS.
- `git diff --check`: PASS with line-ending warnings only.
- Full `npx tsc --noEmit` reports only the 6 unrelated pre-existing fixture
  errors in `sceneDaeSessionImport.test.ts` and
  `sceneModelReplacePreview.test.ts`.

## Implementation

- Added a batch import icon beside the existing Scene Editor static mesh import
  icon. There is no separate route or page.
- Added multi-file FBX/DAE selection and serial source analysis in Scene Editor.
- Added `batchDisk` mode to the existing import modal.
- Batch mode always builds `ImportConfig` with `loadToScene=false`,
  `convertToSsbh=true`, `generateHkt=true`, and `directToDisk=true`.
- The modal exposes the existing full NUMATB template/profile editor and HKT
  simplification settings. One shared configuration is propagated to every
  selected source while preserving each source-derived output name.
- Per-file analyzed geometry names are remapped to the configured NUMDLB
  material labels before invoking conversion.
- Texture reference validation is run for every selected source. Missing or
  invalid NUTEXB references keep the modal open and show the blocking error.
- Every item calls `scene_convert_static_mesh_to_stage_files_streamed`, so source
  paths and generated artifacts remain disk-backed rather than entering a
  SceneEdit memory session.
- HKT availability is checked before execution. A backend result with
  `hktGenerated=false` is treated as a failed item even when SSBH files were
  generated.
- Batch execution is serial and continues after individual failures.
