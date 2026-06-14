# UI Performance Optimization

## Scope

- Reduce interaction stalls across pages and shared UI components.
- Prioritize shared shells, large lists, modal drag/resize behavior, tree views, and page-level state updates.
- Keep changes incremental and verified; broad completion requires repeated page audits.

## Current Pass

- [x] Read project rules, frontend patterns, and relevant performance/session docs.
- [x] Scan for modal drag handlers, context providers, virtualized lists, and unvirtualized list rendering.
- [x] Apply first batch of cross-page UI performance fixes.
- [x] Run focused tests and type checks for touched areas.
- [x] Record findings, commands, and remaining hotspots in `process.md`.

## Completed In This Pass

- [x] Virtualized `UnitList` search results and moved filtering to `useDeferredValue + useMemo`.
- [x] Virtualized `ResourceRegistryDataTable` row rendering while preserving table sorting.
- [x] Replaced global `Fhm2dInitModal` and `RepackModal` old drag windows with `AppRndModalShell`.
- [x] Removed the unused `useDraggableModal` hook and direct `react-draggable` dependency.
- [x] Virtualized large `GraphicParamPanel` categories in Scene Editor.
- [x] Virtualized NUMATB material attribute rows in `NumatbMaterialEntryEditor` with measured dynamic row heights.
- [x] Virtualized TestEditor typed param entry rows, field rows, and hex preview rows.
- [x] Virtualized TestEditor quick-add selected file rows.
- [x] Replaced Scene/Unit texture preview, add, and replace windows with `AppRndModalShell`.
- [x] Replaced the DAE import window's private `react-rnd` implementation with `SceneEditRndModalShell`.
- [x] Virtualized texture add candidates and the Unit Model texture inventory.
- [x] Virtualized shared TestEditor entry lists, ChrSys rows, and Card Icon batch add/replace rows.
- [x] Reduced direct `react-rnd` usage to the two shared modal shell components.
- [x] Deleted unreachable legacy `MSCEdit` page files after confirming there is no route or import.
- [x] Virtualized legacy `UnitEdit` character rows and deferred character ID filtering.
- [x] Removed per-keystroke directory reads from `FilesEdit`; filtering is now deferred and in memory.
- [x] Virtualized `FilesEdit` rows and reduced per-file editor dialogs to one shared resize shell.
- [x] Virtualized MiscTools NUMATB material and attribute rows.
- [x] Reduced MiscTools NUMATB delete confirmations to one instance and migrated the editor to `AppRndModalShell`.
- [x] Stabilized `AppRndModalShell` dimension dependencies by numeric values instead of caller object identity.
- [x] Migrated Unit Model repack/extract, FHM2D memory preview, Settings, DAE export, Scene import/save progress, template JSON, and image conversion tools to `AppRndModalShell`.
- [x] Replaced all remaining business-page `Dialog` shells in TestEditor, Repack, and Scene Havok generation with `AppRndModalShell`.
- [x] Removed the last business imports of `@/components/ui/dialog`; remaining matches are only the dialog component itself and `filePathInput` type names.
- [x] Virtualized large model preview inspector/timeline lists and sampled dense bone key markers.
- [x] Optimized selected-file image tool lists and removed the base64 preview pipeline from `ImgToNutexbTool`.
- [x] Virtualized NUMDLB material mapping rows and deferred mapping-table filtering.
- [x] Virtualized live NUMATB validation errors in Scene detail views.
- [x] Virtualized and reduced search work in the Stage icon index picker.

## Remaining Hotspots For Later Passes

- Manually profile a real large NUMATB sample in the Unit Model Editor to confirm pointerdown/pointerup stays responsive after mapping and attribute virtualization.
- Continue auditing high-volume validation/error views against large real files.
- Add targeted perf tests for `ResourceRegistryDataTable` and `GraphicParamPanel` large-row caps if these areas keep growing.
