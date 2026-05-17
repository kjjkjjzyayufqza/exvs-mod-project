# Scene DAE SSBH Save Process

## Goal

Add a persistent SceneEdit gizmo size setting, fix imported DAE transform editing, and add support for saving imported DAE files to SSBH using the existing TestEditor DAE conversion path.

## Startup Context

- Read `AGENTS.md`.
- Read `.cursor/rules/custom-rules.mdc`.
- Read relevant SceneEdit documentation:
  - `docs/superpowers/specs/2026-05-17-unreal-transform-gizmo-design.md`
  - `docs/superpowers/plans/2026-05-14-sceneedit-nutexb-texture-pipeline.md`
  - `docs/agent-sessions/scene-editor-feature-audit/process.md`
- Queried Context7 for Tauri v2 store usage and confirmed `Store.load("settings.json")`, `get`, `set`, and `save` are the supported API shape.

## Commands

- `Get-Content -Path AGENTS.md`
- `Get-Content -Path .cursor\rules\custom-rules.mdc`
- `rg --files docs | rg "(?i)(scene|ssbh|dae|collada|model|animation|nusktb|format|asset|editor|mesh|save|tauri|config|store|msc)"`
- `rg --files | rg "(?i)(SceneEdit|SceneEditor|TestEditor|ssbh|dae|collada|config|store|gizmo|transform|save)"`
- Context7 `/tauri-apps/plugins-workspace` query for plugin-store persistence.

## Notes

- Existing config persistence is `src/store/configStore.ts` backed by `@tauri-apps/plugin-store` and `settings.json`.
- Existing DAE to SSBH conversion command is `ssbh_convert_dae_to_ssbh`, exposed through `ssbhDaeIoService.ts`.
- Large DAE conversion can be slow, so the implementation should use existing async Tauri commands and front-end busy state.

## Implementation

- Added `sceneEditorSettings.ts` for the `sceneEditGizmoSize` config key and value normalization.
- Extended `useConfigStore` to load/save `sceneEditGizmoSize` in Tauri `settings.json`.
- Added a SceneEdit toolbar popover slider for gizmo size and wired the value into all SceneEdit transform controls.
- Added `sceneDaeSsbhSave.ts` for imported DAE output naming and TestEditor-compatible conversion parameter generation.
- Extended SceneEdit save so disk-backed stages write CSV files and convert every imported DAE actor into a direct stage SSBH model folder.
- Imported DAE internal mesh transforms are baked into the generated DAE before invoking `ssbh_convert_dae_to_ssbh`; the SceneEdit actor transform is written to the generated `OBJECT` placement row so reloads preserve editable placement transforms.
- Imported DAE import, duplicate, paste, delete, and transform edits now mark the SceneEdit session dirty.
- Continued implementation moved imported DAE SSBH output from `<stageRoot>/imported_dae_ssbh/<objectName>/` to direct stage model folders under `<stageRoot>/<objectName>/`, because the backend stage loader only scans direct stage root subdirectories as model candidates.
- SceneEdit save now allocates collision-free direct model folder names, writes a local-space baked DAE, converts it with the existing TestEditor SSBH path, reloads the stage bundle to read the backend-computed `objectIndex`, appends generated `OBJECT` placement rows, writes `placement.csv`, and reloads the saved bundle so imported DAE actors become normal stage objects.
- Generated placement rows match the existing placement CSV shape. Header-based placement files receive table rows; key/value placement files receive key/value rows.
- Continued implementation added repack mapping support for imported DAE saves:
  - SceneEdit creates an empty `<model>.jnttbl` next to generated `.numdlb/.numshb/.nusktb/.numatb` files.
  - SceneEdit resolves the nearest hash-named pack root from the stage root, for example `E:/XB/.../16F73C97/0/0` -> `E:/XB/.../0x16F73C97_structure.json`.
  - After writing converted SSBH files and CSVs, SceneEdit scans the hash pack folder and writes a repack-ready structure JSON containing only game-ready file types, excluding editor intermediates such as `.dae`, `.log`, `.png`, `.fbx`, and `.json`.
  - After writing the structure JSON, SceneEdit invokes the existing `repackFolderUsingStructure` flow so the hash-named stage pack is repacked automatically.

## Pipeline Extraction (continued session)

- Extracted `saveImportedDaeObjectsAsSsbh`, `collectStagePackFiles`, `writeStagePackStructureJson`, and `handleSave` core logic from `page.tsx` into `sceneSavePipeline.ts`.
- Moved `createBakedImportedDaeExportObject`, `applyTransformDataToObject`, `joinTauriPath`, `fileExtension` into the pipeline module.
- Replaced serial `for...of` DAE conversion loop with `Promise.all` after serial folder name pre-allocation via `allocateAllFolderPlans`.
- Added `DaeConversionOutcome` type with `ok`/`error` status for partial failure handling.
- Added `StageSaveProgress` callback for real-time toast updates during multi-DAE saves.
- `handleSave` in `page.tsx` now calls `executeStageSave(...)` and handles partial/full success/failure with differentiated toast messages.
- Removed ~170 lines of inline callback code from `page.tsx` and 6 now-unused imports.
- Added `sceneSavePipeline.test.ts` with 4 tests for bake/skinned/empty/transform scenarios.

## Verification

- `npm test -- src/page/SceneEdit/utils/sceneEditorSettings.test.ts src/page/SceneEdit/utils/sceneDaeSsbhSave.test.ts` -> failed first because the new modules did not exist.
- `npm test -- src/page/SceneEdit/utils/sceneEditorSettings.test.ts src/page/SceneEdit/utils/sceneDaeSsbhSave.test.ts` -> passed, 4 tests.
- `npm test -- src/page/SceneEdit/utils/sceneEditorSettings.test.ts src/page/SceneEdit/utils/sceneDaeSsbhSave.test.ts src/page/SceneEdit/utils/sceneEditorGizmoSync.test.ts src/page/SceneEdit/utils/sceneEditorSelection.test.ts` -> passed, 13 tests.
- `npx tsc --noEmit` -> passed.
- `npm run build` -> passed. Existing Vite warnings remain: large chunk size and plugin timing warnings.
- `npm test -- src/page/SceneEdit/utils/sceneDaeSsbhSave.test.ts` -> failed as expected after adding tests for direct model folder output and generated placement rows.
- `npm test -- src/page/SceneEdit/utils/sceneDaeSsbhSave.test.ts` -> passed, 4 tests.
- `npm test -- src/page/SceneEdit/utils/sceneDaeSsbhSave.test.ts` -> failed as expected after adding a header-shaped placement row regression test.
- `npm test -- src/page/SceneEdit/utils/sceneDaeSsbhSave.test.ts` -> passed, 5 tests.
- `npm test -- src/page/SceneEdit/utils/sceneDaeSsbhSave.test.ts src/page/SceneEdit/utils/sceneEditorSettings.test.ts src/page/SceneEdit/utils/sceneEditorGizmoSync.test.ts src/page/SceneEdit/utils/sceneEditorSelection.test.ts src/page/SceneEdit/utils/sceneCsvEditors.test.ts` -> passed, 5 files and 26 tests.
- `npx tsc --noEmit` -> passed.
- `npm run build` -> passed. Existing Vite warnings remain: large chunk size and plugin timing warnings.
- `npm test -- src/page/SceneEdit/utils/sceneStageStructure.test.ts` -> failed as expected because the new structure mapping module did not exist.
- `npm test -- src/page/SceneEdit/utils/sceneStageStructure.test.ts` -> failed once on deterministic file ordering, then passed after preserving input order.
- `npm test -- src/page/SceneEdit/utils/sceneStageStructure.test.ts src/page/SceneEdit/utils/sceneDaeSsbhSave.test.ts` -> passed, 2 files and 8 tests.
- `npm test -- src/page/SceneEdit/utils/sceneStageStructure.test.ts src/page/SceneEdit/utils/sceneDaeSsbhSave.test.ts src/page/SceneEdit/utils/sceneEditorSettings.test.ts src/page/SceneEdit/utils/sceneEditorGizmoSync.test.ts src/page/SceneEdit/utils/sceneEditorSelection.test.ts src/page/SceneEdit/utils/sceneCsvEditors.test.ts` -> passed, 6 files and 29 tests.
- `npx tsc --noEmit` -> passed.
- `npm run build` -> passed. Existing Vite warnings remain: large chunk size and plugin timing warnings.
- After wiring automatic repack:
  - `npm test -- src/page/SceneEdit/utils/sceneStageStructure.test.ts src/page/SceneEdit/utils/sceneDaeSsbhSave.test.ts src/page/SceneEdit/utils/sceneEditorSettings.test.ts src/page/SceneEdit/utils/sceneEditorGizmoSync.test.ts src/page/SceneEdit/utils/sceneEditorSelection.test.ts src/page/SceneEdit/utils/sceneCsvEditors.test.ts` -> passed, 6 files and 29 tests.
  - `npx tsc --noEmit` -> passed.
  - `npm run build` -> passed. Existing Vite warnings remain: large chunk size and plugin timing warnings.
