# UI Performance Optimization Process

## 2026-06-14 Startup

- Read `AGENTS.md`.
- Read `.cursor/rules/custom-rules.mdc`.
- Read frontend performance skill guidance from `frontend-patterns`.
- Searched `docs/` for UI/performance/editor/modal/tree related Markdown.
- Read relevant prior docs:
  - `docs/superpowers/plans/2026-04-19-r3f-scaling-performance.md`
  - `docs/agent-sessions/ssbh-model-optimization/process.md`
  - `docs/agent-sessions/ssbh-model-optimization/todo.md`
  - `docs/agent-sessions/scene-import-optimization/process.md`
  - `docs/superpowers/specs/2026-06-14-unit-model-editor-ssbh-file-editing-design.md`

## Initial Evidence

- The previous NUMATB drag stall was caused by pointerdown/pointerup updating Unit Model page-level viewport suspend state, which invalidated `SsbhModelPreviewProvider` while a large editor UI was mounted.
- Current broad scan shows the project already has targeted virtualization in several high-volume editors and Scene/TestEditor lists.
- Remaining high-risk patterns found in the first scan:
  - `src/components/Fhm2dInitModal.tsx` still uses the old `useDraggableModal` window and renders `filteredItems.map(...)` directly.
  - `src/page/UnitList/page.tsx` renders `filteredUnits.map(...)` directly.
  - `src/page/ResourceRegistry/components/ResourceRegistryDataTable.tsx` renders every row from `table.getRowModel().rows`.
  - Some Scene modal variants still manage drag position locally rather than using the shared RND shell, but they are narrower texture dialogs.

## Changes Made

- Added `src/components/AppRndModalShell.tsx`, a page-store-agnostic `react-rnd` shell for global app modals.
  - It does not call Scene Editor viewport suspend state.
  - It persists resized dimensions when a `storageKey` is supplied.
  - It updates React state only on drag/resize stop, not during pointer move.
- Migrated `src/components/Fhm2dInitModal.tsx` to `AppRndModalShell`.
  - Removed `useDraggableModal` usage.
  - Made the list section fill the resized modal height.
- Migrated `src/components/RepackModal.tsx` from direct `react-draggable` to `AppRndModalShell`.
- Deleted `src/hooks/useDraggableModal.ts`.
- Removed the direct `react-draggable` dependency from `package.json` and regenerated `pnpm-lock.yaml`.
  - `react-draggable` remains in the lockfile only as a transitive dependency of `react-rnd`.
- Updated `src/page/UnitList/page.tsx`.
  - Search filtering now uses `useDeferredValue` and `useMemo` instead of a derived-state effect.
  - The unit result list is rendered through `@tanstack/react-virtual`.
- Updated `src/page/ResourceRegistry/components/ResourceRegistryDataTable.tsx`.
  - Large sorted row models render via a virtualizer plus spacer rows.
  - Header sorting and existing table actions are unchanged.
- Updated `src/page/TestEditor/components/resource-registry/ResourceRegistryView.tsx`.
  - The table card now uses `overflow-hidden`; the virtualized table owns the scroll container.
- Updated `src/page/SceneEdit/components/GraphicParamPanel.tsx`.
  - Categories at or below 24 rows keep the simple render path.
  - Larger categories use `@tanstack/react-virtual` with measured rows, preserving slider/color row height differences.

## Verification

- `pnpm vitest run src/page/SceneEdit/components/VirtualizedList.perf.test.tsx` — PASS, 18 tests.
- `pnpm vitest run src/page/SceneEdit/components/VirtualizedList.perf.test.tsx src/page/SceneEdit/components/SceneEditRndModalShell.test.tsx` — PASS, 25 tests.
- `pnpm vitest run src/page/SceneEdit/components/SceneCsvEditorPanels.test.tsx src/page/SceneEdit/utils/graphicParamInspector.test.ts` — PASS, 9 tests.
- `pnpm tsc --noEmit --pretty false 2>&1 | Select-String -Pattern "AppRndModalShell|Fhm2dInitModal|RepackModal|UnitList|ResourceRegistryDataTable|ResourceRegistryView|GraphicParamPanel"` — no touched-file matches.
- `pnpm tsc --noEmit --pretty false` — FAILS on pre-existing unrelated test fixture errors:
  - `src/page/SceneEdit/utils/sceneDaeSessionImport.test.ts`
  - `src/page/SceneEdit/utils/sceneModelReplacePreview.test.ts`
  - `src/services/resourceRegistry/stageRegistrySync.test.ts`
- `rg -n 'useDraggableModal|from "react-draggable"|from ''react-draggable''|<Draggable' src package.json` — no matches.
- `git diff --check` — PASS; Git reports only CRLF working-copy warnings.

## Next Pass Candidates

- `src/page/SceneEdit/components/TexturePreviewModal.tsx`, `TextureAddConfirmModal.tsx`, and `TextureReplaceModal.tsx`: still have local RND shell implementations and should be reviewed for consistency.
- `src/page/TestEditor/components/repack-folder-structure/QuickAddFilesModal.tsx`: renders file rows directly and can grow with folder size.
- `src/page/TestEditor/components/param-editor/TypedParamDataPanel.tsx`: preview row rendering should be checked against realistic large command-table data.

## 2026-06-14 Continuation: NUMATB And TestEditor Large Render Pass

### Evidence

- Re-read project/session context and TestEditor-related docs before editing:
  - `docs/superpowers/specs/2026-05-11-test-editor-redesign-design.md`
  - `docs/superpowers/plans/2026-05-11-test-editor-redesign.md`
  - `docs/agent-sessions/param-editor-rewrite/process.md`
- CodeGraph pointed the NUMATB drag stall path at:
  - `src/components/ssbh-model-preview/NumatbEditorModalWindow.tsx`
  - `src/components/ssbh-model-preview/NumatbTemplateEditorModalBody.tsx`
  - `src/components/ssbh-model-preview/components/NumatbMaterialEntryEditor.tsx`
- `NumatbTemplateEditorModalBody` already virtualized material rows, but `NumatbMaterialEntryEditor` still rendered every flattened material attribute and every nested editor control.
- TestEditor also had heavy always-mounted rows in:
  - `src/page/TestEditor/components/param-editor/TypedParamDataPanel.tsx`
  - `src/page/TestEditor/components/repack-folder-structure/QuickAddFilesModal.tsx`

### Changes Made

- Updated `src/components/ssbh-model-preview/components/NumatbMaterialEntryEditor.tsx`.
  - Attribute rows now render through `@tanstack/react-virtual`.
  - Rows are measured with `measureElement` so JSON/text-area attributes keep their real dynamic height.
  - The mounted controls now scale with the visible viewport instead of total attribute count, reducing work during modal activation/drag pointer events.
- Updated `src/page/TestEditor/components/param-editor/TypedParamDataPanel.tsx`.
  - Entry search results are virtualized.
  - Field rows are virtualized and measured for variable editor heights.
  - Hex preview rows are rendered by a virtualized `HexPreviewRows` component instead of three full-column `.map(...)` passes.
- Updated `src/page/TestEditor/components/repack-folder-structure/QuickAddFilesModal.tsx`.
  - Selected file rows now use a virtualized scroll body while preserving per-row selection, type select, and remove actions.

### Verification

- `pnpm vitest run src/components/ssbh-model-preview/numatbTemplateStoreHelpers.test.ts src/components/ssbh-model-preview/store/daeSsbhSessionStore.test.ts src/page/TestEditor/components/param-editor/paramEntryUtils.test.ts src/page/TestEditor/components/param-editor/ParamEditorView.test.tsx` — PASS, 4 files / 32 tests.
- `pnpm tsc --noEmit --pretty false 2>&1 | Select-String -Pattern "NumatbMaterialEntryEditor|NumatbTemplateEditorModalBody|QuickAddFilesModal|TypedParamDataPanel"` — no touched-file matches.
- `git diff --check` — PASS; Git reports only CRLF working-copy warnings.
- `pnpm tsc --noEmit --pretty false` — still FAILS on pre-existing unrelated test fixture errors:
  - `src/page/SceneEdit/utils/sceneDaeSessionImport.test.ts`
  - `src/page/SceneEdit/utils/sceneModelReplacePreview.test.ts`
  - `src/services/resourceRegistry/stageRegistrySync.test.ts`

### Remaining

- Validate with a real large NUMATB file in the Unit Model Editor and check pointerdown/pointerup timings after the attribute virtualization.
- Continue broad UI audit on Scene texture dialogs and remaining TestEditor import/list editors.

## 2026-06-14 Continuation: Shared Modal And Batch List Pass

### Evidence

- The three reusable texture dialogs each maintained a private `react-rnd` implementation:
  - `TexturePreviewModal`
  - `TextureAddConfirmModal`
  - `TextureReplaceModal`
- `DaeImportConfigModal` duplicated Scene modal size persistence, position clamping, viewport suspend, drag state, and resize state.
- `TextureAddConfirmModal`, Unit Model textures, Card Icon batch add/replace, shared param entry lists, and ChrSys rows still mounted every row/control.
- Scene Texture Manager was inspected and already used the shared threshold-based `VirtualizedList`.

### Changes Made

- Extended `AppRndModalShell` with:
  - `headerActions` for compact preview controls.
  - `resizable={false}` for fixed-size workflows.
- Migrated all three shared texture dialogs to `AppRndModalShell`.
  - Existing texture preview zoom controls now live in the shared header action area.
  - Existing persisted texture preview/add sizes keep their current storage keys.
- Virtualized texture add candidate rows so only visible thumbnails and format selectors mount.
- Extended `SceneEditRndModalShell` with optional `getInitialPosition`.
  - Defaults remain unchanged for cascading Scene windows.
  - DAE import uses the option to preserve centered opening behavior.
- Migrated `DaeImportConfigModal` from its private `Rnd` state implementation to `SceneEditRndModalShell`.
  - Preview and SSBH modes retain separate persisted size keys.
  - Viewport suspend remains provided by the shared Scene shell.
- Virtualized `UnitModelTexturePanel` with measured dynamic rows.
  - Search uses `useDeferredValue`.
  - External texture focus uses `scrollToIndex`, so offscreen focused rows still become visible.
- Virtualized remaining high-volume TestEditor controls:
  - `EntryListPanel`
  - `ChrSysDataPanel`
  - `CardIconBatchReplaceDialog`
  - `CardIconAddDialog`
- ChrSys edits now copy the entry array and replace one row instead of mapping every row callback.

### Verification

- `pnpm vitest run src/page/SceneEdit/components/SceneEditRndModalShell.test.tsx src/components/AppRndModalShell.test.tsx src/page/SceneEdit/components/VirtualizedList.perf.test.tsx src/page/TestEditor/components/param-editor/ParamEditorView.test.tsx src/page/TestEditor/components/param-editor/paramEntryUtils.test.ts src/page/UnitModelEdit/utils/unitModelRepackService.test.ts` — PASS, 6 files / 40 tests.
- Added `AppRndModalShell.test.tsx` for shared header actions and disabled resizing.
- Added shared Scene shell coverage for custom initial positioning.
- Touched-file TypeScript filtering produced no matching errors.
- `rg -l 'from "react-rnd"' src -g "*.tsx"` now returns only:
  - `src/components/AppRndModalShell.tsx`
  - `src/page/SceneEdit/components/SceneEditRndModalShell.tsx`
- `git diff --check` — PASS; only working-copy line-ending warnings.
- Full `pnpm tsc --noEmit --pretty false` still fails only on the previously recorded unrelated fixture errors in:
  - `sceneDaeSessionImport.test.ts`
  - `sceneModelReplacePreview.test.ts`
  - `stageRegistrySync.test.ts`

### Next Pass Candidates

- `src/page/UnitEdit/components/CharacterList.tsx`
- `src/page/FilesEdit/components/FileList.tsx`
- `src/page/MSCEdit/components/FileList.tsx`
- `src/page/MiscTools/components/numatb-editor/NumatbEditor.tsx`
- Large Stage icon picker and validation/error dialog result lists.

## 2026-06-14 Continuation: Legacy Page And NUMATB Drag Pass

### Evidence

- Project docs identify `src/page/MSCEdit` as an obsolete duplicate of the current TestEditor MSC workspace.
- Source and route searches found no import or route for `MSCEdit`; its two files only referenced each other.
- `FilesEdit/components/FileList.tsx` performed `readDir(folderPath)` for every search keystroke, then used `files.find(...)` for every filtered result.
- FilesEdit mounted a complete Radix dialog/editor subtree for every editable file row.
- MiscTools NUMATB mounted:
  - every material row,
  - one `AlertDialog` per material,
  - every attribute input for the selected material,
  - the old fixed Radix dialog shell.
- `AppRndModalShell` depended on the `dimensions` object identity, so inline dimension objects could retrigger size synchronization effects after unrelated parent renders.

### Changes Made

- Deleted the unreachable legacy files:
  - `src/page/MSCEdit/page.tsx`
  - `src/page/MSCEdit/components/FileList.tsx`
- Updated `src/page/UnitEdit/components/CharacterList.tsx`.
  - Character ID filtering uses `useDeferredValue`.
  - Character cards use measured virtual rows.
- Updated `src/page/FilesEdit/components/FileList.tsx`.
  - Search and extension filtering now operate on the existing `files` prop in memory.
  - Filtering is deferred and naturally sorted by a pure helper.
  - File rows use fixed-height virtualization and stable path keys.
  - Preview dimensions are bounded so images cannot resize rows.
  - Only one file editor is mounted and it now uses `AppRndModalShell`.
- Added `fileListUtils.ts` and focused filtering tests.
- Updated MiscTools `NumatbEditor.tsx`.
  - Material rows use fixed-height virtualization.
  - Selected material attributes use measured virtualization.
  - Material deletion uses one controlled `AlertDialog`.
  - The old Radix dialog was replaced by `AppRndModalShell`.
  - Action controls wrap within smaller resized widths.
- Updated `AppRndModalShell.tsx`.
  - Dimension inputs are memoized from primitive numeric fields.
  - Resize effects and callbacks no longer churn when callers recreate an equivalent dimensions object.

### Verification

- `pnpm vitest run src/page/FilesEdit/components/FileList.test.ts src/components/AppRndModalShell.test.tsx` — PASS, 2 files / 4 tests.
- `pnpm vite build` — PASS, 3592 modules transformed.
- `pnpm tsc --noEmit --pretty false` — no new touched-file errors; still fails only on previously recorded unrelated fixture errors in:
  - `sceneDaeSessionImport.test.ts`
  - `sceneModelReplacePreview.test.ts`
  - `stageRegistrySync.test.ts`
- `rg` confirms no remaining `MSCEdit`, direct `react-draggable`, or non-shell direct `react-rnd` references.
- `git diff --check` — PASS; only working-copy line-ending warnings.
- Prettier is not installed in this project, so `pnpm exec prettier --write ...` was unavailable.

### Next Pass Candidates

- Stage icon picker grouping and thumbnail decode behavior with large datasets.
- Validation/error result dialogs that mount all rows or details.
- Remaining TestEditor character/series import and selection lists.

## 2026-06-14 Continuation: Full Old Dialog Shell Cleanup And Model Preview Lists

### Evidence

- A broad scan for old dialog shells used:
  - `rg -n "<Dialog" src -g "*.tsx"`
  - `rg -n "@/components/ui/dialog" src -g "*.tsx"`
- Remaining business-page old shells were concentrated in:
  - TestEditor import/info/replace dialogs.
  - Repack template selection.
  - Scene Havok `GenerateHktFromModelDialog`.
  - Unit Model and Scene progress/export dialogs.
  - MiscTools image/template helpers.
- Model preview inspector/timeline still had large rendered lists and dense marker layers that could increase work while a NUMATB modal was mounted.

### Changes Made

- Migrated additional resize-shell workflows to `AppRndModalShell`:
  - `SettingsDialog`
  - `DaeExportDialog`
  - `StageImportProgressDialog`
  - `SaveProgressDialog`
  - `UnitModelRepackDialog`
  - `UnitModelExtractDialog`
  - `Fhm2dMemoryPreviewModal`
  - `TemplateJsonGenerator`
  - `ImageResizeTool`
  - `ImageCompressTool`
  - `ImgToNutexbTool`
  - TestEditor Quick Add, resource registry, collision, typed-param hex preview, card icon add/replace, series image replace, character/stage/series import/info dialogs.
  - Repack template picker.
  - Scene Havok generate-HKT window.
- Removed remaining business imports of `@/components/ui/dialog`; final matches are only:
  - `src/components/ui/dialog.tsx`
  - `src/components/ui/filePathInput.tsx` type names containing `Dialog`.
- Added `VirtualizedSelectedFileList` for image tools.
- Optimized image tools:
  - Parallelized selected path basename resolution.
  - Reused a virtualized selected-file list.
  - Removed `ImgToNutexbTool`'s `readFile`/base64 preview pipeline in favor of direct Tauri asset preview URLs.
- Optimized model preview UI:
  - Virtualized `SsbhModelPreviewInspector` collection, mesh, and bone lists.
  - Memoized inspector debug/bone data.
  - Virtualized/deferred timeline bone filtering.
  - Memoized timeline ruler/grid/keyframe layers.
  - Sampled rendered bone key markers to cap dense marker DOM while preserving full counts.
- Migrated FilesEdit title-only `DialogHeader/DialogTitle` usage to local headings.

### Verification

- Repeated `pnpm vite build` after each migration batch — PASS.
- Final `pnpm vite build` — PASS, 3593 modules transformed.
- Final old-dialog scan:
  - `rg -n "<Dialog|@/components/ui/dialog" src -g "*.tsx"` returned no business-page `Dialog` shell/import matches.
  - Remaining matches are the dialog component implementation and `DialogDefaultPathMap` type names in `filePathInput`.

### Remaining

- Run manual runtime profiling with a real large Unit Model NUMATB file and verify pointerdown/pointerup timings around the NUMATB resize shell.
- Keep auditing high-volume picker/error views with real project data; most known old shell migrations are complete, but data-specific hotspots may remain.

## 2026-06-14 Continuation: NUMATB Drag/Resize Responsiveness

### Evidence

- User reported large NUMATB data making the resize modal hard to operate:
  - `[Violation] 'pointerdown' handler took 154ms`
  - `[Violation] 'pointerup' handler took 152ms`
- Focused scans and CodeGraph context showed remaining high-volume render paths near model/NUMATB workflows:
  - `NumdlbMaterialMappingEditor` mounted every mapping row and every `datalist` option.
  - `NumatbValidationErrorsPanel` mounted every live validation error inside a short scroll area.
  - `StageIconIndexPickerPopover` could render/search large index sets and decode many thumbnails.

### Changes Made

- `NumdlbMaterialMappingEditor`
  - Replaced full `filteredEntries.map(...)` rendering with `@tanstack/react-virtual`.
  - Added `useDeferredValue` for filter input so typing and drag/resize are less likely to block on filtering.
  - Capped `datalist` suggestions to 200 options; all labels can still be typed manually.
  - Kept edit callbacks mapped to the original row indexes.
- `NumatbValidationErrorsPanel`
  - Replaced full error list rendering with a virtualized list.
  - Preserved copy-all behavior for complete error output.
- `StageIconIndexPickerPopover`
  - Virtualized stage icon rows.
  - Reworked search to precompute searchable labels by available icon index.
  - Limited full `0..maxIndex` scanning to purely numeric queries.
  - Added async image decoding for picker thumbnails.
- Added targeted tests for the new virtualized NUMDLB and NUMATB error paths.

### Verification

- `pnpm vite build` — PASS, 3593 modules transformed.
- `pnpm vitest run src/page/TestEditor/components/stage-list/StageIconIndexPickerPopover.test.tsx src/page/SceneEdit/components/StageValidationErrorDialog.test.tsx src/page/TestEditor/components/character-list/FontCoverageErrorDialog.test.tsx` — PASS, 3 files / 3 tests.
- `pnpm vitest run src/components/ssbh-model-preview/components/NumdlbMaterialMappingEditor.test.tsx src/page/SceneEdit/components/detail-view/NumatbValidationErrorsPanel.test.tsx src/page/TestEditor/components/stage-list/StageIconIndexPickerPopover.test.tsx src/page/SceneEdit/components/StageValidationErrorDialog.test.tsx src/page/TestEditor/components/character-list/FontCoverageErrorDialog.test.tsx` — PASS, 5 files / 5 tests.
- `git diff --check` — PASS; only existing working-copy CRLF warnings.
- `pnpm tsc --noEmit --pretty false` — FAIL only on previously recorded unrelated fixture errors:
  - `src/page/SceneEdit/utils/sceneDaeSessionImport.test.ts`
  - `src/page/SceneEdit/utils/sceneModelReplacePreview.test.ts`
  - `src/services/resourceRegistry/stageRegistrySync.test.ts`

### Remaining

- Manual runtime profiling is still needed with a real large Unit Model NUMATB file to confirm pointerdown/pointerup timings under the actual modal drag path.
- Continue scanning other high-volume model/session side panels if the large sample still shows event handler violations.
