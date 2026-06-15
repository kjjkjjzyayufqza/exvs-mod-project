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

## 2026-06-12 Texture/Preview Pass

### Context Gathered

- Re-read `AGENTS.md`, `.cursor/rules/custom-rules.mdc`, and relevant Scene
  Editor texture docs/session notes before changing code.
- Compared Unit Model Editor against Scene Editor texture flow:
  - Scene uses add/replace/preview/export modals and conversion helpers in
    `src/page/SceneEdit/components` and `src/page/SceneEdit/utils`.
  - Unit repack is `_structure.json` driven, so Unit texture edits should update
    `SubFileData` directly and write/delete files in the selected unit folder.
- Existing preview issues:
  - Canvas DPR was reset on resize once, but resizable panel layout can settle
    after that first frame, leaving a blurry stretched drawing buffer.
  - Texture decode updates happen while the canvas is in demand frameloop, so a
    finished decode can need an explicit invalidate.
  - Bone joint handles were small, depth-tested transparent spheres, making
    joints inside meshes hard to see and select.

### Implementation Notes

- Added `src-tauri/src/format/unit_model_textures.rs`.
  - `list_unit_model_textures` reads `_structure.json`, lists `.nutexb`
    `SubFileData`, resolves disk paths, reads nutexb info, counts
    `SubFileStructure` item refs, and parses `.numatb` texture refs.
  - `add_unit_model_nutexb` copies a source `.nutexb` into the unit root and
    appends a `.nutexb` `SubFileData` entry with a structure-relative `fileUrl`.
  - `remove_unit_model_nutexb` only removes unreferenced textures and refuses to
    delete files outside the selected unit root.
- Registered Unit texture commands in `stage_commands.rs` and `lib.rs`.
- Added `UnitModelTexturePanel` and `unitModelTextureService`.
  - Right-side Unit tab now exposes `.nutexb` list view, preview, export PNG,
    add, replace, remove, refresh, and copy-path actions.
  - Reuses Scene Editor `TextureAddConfirmModal`, `TextureReplaceModal`,
    `TexturePreviewModal`, conversion helpers, duplicate analysis, and thumbnail
    cache.
  - Texture edits dispatch a local `unit-model-textures-changed` event so the
    left validation/repack panel clears stale results.
- Preview fixes:
  - `AdaptiveCanvasPerformanceController` now reasserts DPR/size over two RAFs
    after resize.
  - `CanvasContentInvalidator` invalidates on texture-data/material-binding
    changes.
  - Bone joint handles are non-depth-tested, render above mesh, and have a new
    `bonePointSize` slider in the inspector.

### Verification Log

- `cargo test --lib unit_model_textures --manifest-path src-tauri\Cargo.toml -- --nocapture`
  - PASS: 2 tests.
- `cargo test --lib unit_model --manifest-path src-tauri\Cargo.toml -- --nocapture`
  - PASS: 9 tests, including existing Unit validation/repack smoke coverage and
    new Unit texture helpers.
- `cargo check --lib --manifest-path src-tauri\Cargo.toml`
  - PASS.
- `npx vitest run src/page/UnitModelEdit/utils/unitModelRepackService.test.ts`
  - PASS: 7 tests.
- `npx tsc --noEmit --pretty false`
  - BLOCKED by pre-existing SceneEdit test type errors:
    `sceneDaeSessionImport.test.ts` static mesh result/null matl fixtures and
    `sceneModelReplacePreview.test.ts` `displayLabel`.
  - Filtered output for Unit/preview files showed no new matching errors.
- `cargo test unit_model_textures --manifest-path src-tauri\Cargo.toml -- --nocapture`
  - BLOCKED by unrelated bin target compile errors in `perf_preview_hkt.rs` and
    `gen_hkt_variants.rs` missing `quad_merge_enabled`.
- `git diff --check`
  - PASS; only line-ending warnings from the dirty working tree.

## 2026-06-12 Follow-up Fixes

### Findings

- White-texture-after-load can still happen when a draw gets a partial PBR
  material before all texture slots decode. Later `map`/slot props update, but
  Three material recompilation is not guaranteed. Hide/show remounts the mesh,
  which explains why manual visibility toggling fixes it.
- The texture pool key did not include decoded content identity. Replacing or
  reloading a same-path/same-dimension texture could reuse the old GPU texture.
- Skeleton display only controlled line rendering. Bone joint hit spheres were
  still rendered by `BonePreviewRig`.
- Preview collection `replace_items` auto-activated the first item, and
  `append_items` auto-activated the last appended item.
- Canvas DPR could still be lowered by the adaptive performance controller after
  resize, leaving a low-resolution drawing buffer.

### Changes

- Added decoded texture object identity to the texture pool key and material key
  in `SsbhModelCanvas`.
- The PBR/basic material key now changes with texture slot paths/data versions,
  forcing material remount when decoded data arrives.
- `showSkeleton` now defaults to `false`; reset display settings also restores it
  to `false`.
- `BonePreviewRig` keeps internal bone groups for skinning but hides joint
  handles and TransformControls when Skeleton display is off.
- Preview collection replacement/append now leaves every item inactive and
  unselected by default.
- The canvas DPR controller now uses base DPR whenever motion is not active and
  adds a ResizeObserver pass over the canvas parent.

### Verification Log

- `cargo test --lib preview_collection --manifest-path src-tauri\Cargo.toml -- --nocapture`
  - PASS: 7 tests.
- `cargo test --lib unit_model --manifest-path src-tauri\Cargo.toml -- --nocapture`
  - PASS: 9 tests.
- `cargo check --lib --manifest-path src-tauri\Cargo.toml`
  - PASS.
- `npx vitest run src/page/UnitModelEdit/utils/unitModelRepackService.test.ts`
  - PASS: 7 tests.
- `npx tsc --noEmit --pretty false` filtered for Unit/SSBH preview identifiers
  - No matching new errors. Full `tsc` remains blocked by existing SceneEdit test
    type errors.

## 2026-06-12 Texture Detail / AI Payload Follow-up

### Findings

- Unit texture preview reused the 64px thumbnail decode context when opening the
  detail modal. The shared modal also capped preview PNG generation at 512px, so
  large textures appeared as a small fixed preview instead of fitting the
  available detail viewport.
- Unit texture inventory refresh still selected the first texture when no prior
  selection survived, which violated the no-default-selection behavior expected
  for open/load flows.
- The Unit texture panel had only per-texture export. Batch export should use
  the Unit `_structure.json` texture inventory instead of recursively exporting
  every `.nutexb` in the folder.
- The old AI review payload only copied the validation result. It did not expose
  validator logic, parsed asset data, preview state, material bindings, texture
  inventory, or disk assets needed for AI review.

### Changes

- `TexturePreviewModal` now fits the image to the preview viewport at 100%,
  supports wheel zoom, zoom in/out buttons, and reset.
- `sceneTextureThumbnail` now allows 4096px preview PNG data URLs for the modal.
  Unit thumbnails still use the 64px thumbnail context; Unit detail previews use
  a full-resolution decode context.
- `UnitModelTexturePanel` now has batch PNG export, clears selection on root
  change, keeps refresh from auto-selecting the first texture, and no longer
  renders the bottom `fileIndex/size/format/dimensions` strip.
- Added `unitModelAiReviewPayload`.
  - Includes validator rule phases and judgement per phase.
  - Includes the exact validation result.
  - Includes structure JSON parse data, Unit texture inventory, preview
    instances/bundles/draws/material bindings/render settings, decoded texture
    summaries, and recursive disk asset parse results.
  - Parses `.numdlb/.numshb/.nusktb/.numatb` with
    `ssbh_load_ssbh_file_as_json`, `.nutexb` with `nutexb_read_info`,
    `.jnttbl` with `jnttbl_read_file`, and `.shl` headers in TypeScript.
- `UnitModelToolsPanel` now auto-runs validation when copying the AI review
  payload if no validation result exists yet.

### Verification Log

- `cargo check --lib --manifest-path src-tauri\Cargo.toml`
  - PASS.
- `npx vitest run src/page/UnitModelEdit/utils/unitModelRepackService.test.ts`
  - PASS: 7 tests.
- `npx tsc --noEmit --pretty false` filtered for
  `UnitModelEdit|TexturePreviewModal|sceneTextureThumbnail`
  - No matching new errors.
- Full `npx tsc --noEmit --pretty false`
  - Still blocked by pre-existing SceneEdit test fixture errors in
    `sceneDaeSessionImport.test.ts` and `sceneModelReplacePreview.test.ts`.
- `git diff --check`
  - PASS; only line-ending warnings from the dirty working tree.

## 2026-06-12 AI Payload Compaction Follow-up

### Changes

- Changed `unitModelAiReviewPayload` to emit review summaries for the largest
  payload sources instead of raw parsed data.
- `.numshb` payloads now keep file metadata, object names, subindex,
  parent-bone names, vertex/index counts, attribute counts, binary slice
  metadata, and bone influence counts. Raw vertex/index/normal/UV arrays are
  omitted.
- `.nusktb`/bundle skeleton data now keeps bone names, parent indices,
  billboard type, and transform presence. Raw bone transform matrices are
  omitted.
- `.jnttbl` payloads now omit the hex dump but keep entries and nusktb probe
  metadata.
- Payload version bumped to `3` and includes a `compaction` note describing what
  was omitted.

### Verification Log

- `npx vitest run src/page/UnitModelEdit/utils/unitModelRepackService.test.ts`
  - PASS: 7 tests.
- `npx tsc --noEmit --pretty false` filtered for
  `unitModelAiReviewPayload|UnitModelEdit|TexturePreviewModal|sceneTextureThumbnail`
  - No matching new errors. Full `tsc` still has the known unrelated SceneEdit
    test fixture errors.

## 2026-06-14 Modal Shell Cleanup

### Findings

- The SSBH file editors in Unit Model Editor already use the shared
  `useSsbhFileEditorSessions` + `SsbhFileEditorHosts` path.
- The remaining old Unit Model modal artifact was
  `UnitModelFloatingModalShell`, used only by `UnitModelDaeExchangeModal`.
- The shared `SceneEditRndModalShell` already supports host-specific viewport
  suspend injection through `viewportSuspend`, so Unit Model does not need its
  own duplicate shell.

### Changes

- Replaced `UnitModelDaeExchangeModal`'s `UnitModelFloatingModalShell` usage
  with `SceneEditRndModalShell`.
- Injected Unit Model's `onViewportSuspendChange` behavior through
  `viewportSuspend`, with cleanup on unmount so the viewport cannot stay
  suspended if the modal closes during pointer interaction.
- Deleted `src/page/UnitModelEdit/components/UnitModelFloatingModalShell.tsx`.

### Verification Log

- `rg -n "UnitModelFloatingModalShell|FloatingModalShell" src docs`
  - PASS: no matches.
- `pnpm vitest run src/page/UnitModelEdit/utils/unitModelNodePaths.test.ts src/page/UnitModelEdit/utils/unitModelStructureTree.test.ts src/components/ssbh-model-preview/useSsbhFileEditorSessions.test.ts src/page/SceneEdit/components/SceneEditRndModalShell.test.tsx`
  - PASS: 4 files, 16 tests.
- `pnpm tsc --noEmit --pretty false`
  - BLOCKED by existing unrelated errors in SceneEdit/resourceRegistry test
    fixtures; no errors matched `UnitModelDaeExchangeModal`,
    `UnitModelFloatingModalShell`, or `SceneEditRndModalShell`.
- `pnpm eslint ...`
  - NOT RUN: project has no `eslint` command or dependency configured.

## 2026-06-14 SSBH File Editor RND Cleanup

### Findings

- Unit Model tree double-click/right-click opens `.numatb`, `.numdlb`,
  `.nuhlpb`, and `.jnttbl` through the shared `SsbhFileEditorHosts` path.
- Those editor windows still used the legacy `useDraggableModal` hook and
  hand-written fixed-width `Card` shells, so double-clicking a `.numatb` node
  produced the old floating window instead of the resizable RND modal shell.
- `JnttblEditorModalWindow` and `EffectProjectEditorModalWindow` also had old
  DOM z-layer setter plumbing. They now keep compatibility with the existing
  host/session code while rendering through the RND shell.
- The Unit Model structure tree row already handled click/double-click/context
  menu interactions, but the row/button classes did not force `cursor-pointer`.

### Changes

- Added `SsbhEditorModalWindowShell`, a shared wrapper around
  `SceneEditRndModalShell` with per-editor dimensions and persisted RND size
  keys.
- Replaced legacy draggable shells in:
  - `NumatbEditorModalWindow`
  - `NumdlbEditorModalWindow`
  - `NuhlpbEditorModalWindow`
  - `JnttblEditorModalWindow`
  - `EffectProjectEditorModalWindow`
- Threaded optional `viewportSuspend` through the SSBH editor hosts and passed a
  callback-backed Unit Model viewport suspend interaction from `page.tsx`.
- Added optional `closeDisabled` to `SceneEditRndModalShell` so migrated editor
  windows keep the old "cannot close while saving" behavior.
- Added explicit `cursor-pointer` classes to interactive Unit Model structure
  tree rows and row buttons.

### Verification Log

- `rg -n "useDraggableModal|FloatingModalShell|style=\\{\\{ position: ['\\\"]absolute|pointer-events-auto w-\\[" src\\components\\ssbh-model-preview src\\page\\UnitModelEdit`
  - PASS: no matches.
- `pnpm vitest run src/page/UnitModelEdit/utils/unitModelNodePaths.test.ts src/page/UnitModelEdit/utils/unitModelStructureTree.test.ts src/components/ssbh-model-preview/useSsbhFileEditorSessions.test.ts src/page/SceneEdit/components/SceneEditRndModalShell.test.tsx`
  - PASS: 4 files, 16 tests.
- `pnpm vitest run src/components/ssbh-model-preview`
  - PASS: 24 files, 116 tests.
- `pnpm tsc --noEmit --pretty false`
  - BLOCKED by existing unrelated errors in
    `src/page/SceneEdit/utils/sceneDaeSessionImport.test.ts`,
    `src/page/SceneEdit/utils/sceneModelReplacePreview.test.ts`, and
    `src/services/resourceRegistry/stageRegistrySync.test.ts`.
- `pnpm tsc --noEmit --pretty false 2>&1 | Select-String -Pattern "ssbh-model-preview|UnitModelEdit|SceneEditRndModalShell|NumatbEditorModalWindow|NumdlbEditorModalWindow|NuhlpbEditorModalWindow|JnttblEditorModalWindow|EffectProjectEditorModalWindow"`
  - PASS: no matching new errors for touched files.
- `git diff --check`
  - PASS: no whitespace errors; only existing line-ending warnings from the
    dirty working tree.

## 2026-06-14 NUMATB Drag Performance

### Findings

- Browser logs showed `pointerdown` / `pointerup` handlers taking about 150ms
  while dragging the NUMATB editor.
- The immediate cause was not RND's drag math. SSBH editor drag events were
  wired to Unit Model's `setDaeModalViewportSuspend`, which changes
  `previewSuspended` on `SsbhModelPreviewProvider`.
- `previewSuspended` is part of the large preview context value, so every
  pointerdown/up on an editor drag forced provider/context consumers to update.
  With a large NUMATB form mounted under the same tree, that made drag start and
  drag end block the UI.
- NUMATB already virtualizes the material list, but the selected material's
  attribute editor renders all attributes. That remains a possible follow-up for
  editing latency, but it is not required to remove the pointerdown/up stalls.

### Changes

- `SsbhEditorModalWindowShell` now uses a no-op viewport suspend interaction
  unless a host explicitly passes one. This keeps SSBH file editor dragging out
  of the Scene/UnitModel viewport-suspend store/state path by default.
- `UnitModelEditWorkspace` no longer passes the state-backed
  `useCallbackModalViewportSuspendInteraction(setDaeModalViewportSuspend)` into
  `SsbhFileEditorHosts`; the DAE exchange modal still uses viewport suspend.
- Added `skipActivate` plumbing from SSBH editor hosts to the RND shell. A window
  that is already topmost for its editor type does not schedule another z-index
  raise on drag start, avoiding redundant heavy editor rerenders.

### Verification Log

- `rg -n "useCallbackModalViewportSuspendInteraction|ssbhEditorViewportSuspend|viewportSuspend=\\{ssbhEditorViewportSuspend\\}|NOOP_VIEWPORT_SUSPEND|skipActivate" src\\components\\ssbh-model-preview src\\page\\UnitModelEdit\\page.tsx`
  - PASS: Unit Model no longer passes `ssbhEditorViewportSuspend`; no-op suspend
    and `skipActivate` are present in SSBH editor shell/hosts.
- `pnpm vitest run src/page/UnitModelEdit/utils/unitModelNodePaths.test.ts src/page/UnitModelEdit/utils/unitModelStructureTree.test.ts src/components/ssbh-model-preview/useSsbhFileEditorSessions.test.ts src/page/SceneEdit/components/SceneEditRndModalShell.test.tsx`
  - PASS: 4 files, 16 tests.
- `pnpm vitest run src/components/ssbh-model-preview`
  - PASS: 24 files, 116 tests.
- `pnpm tsc --noEmit --pretty false`
  - BLOCKED by existing unrelated test fixture errors in SceneEdit and
    resourceRegistry.
- `pnpm tsc --noEmit --pretty false 2>&1 | Select-String -Pattern "ssbh-model-preview|UnitModelEdit|SceneEditRndModalShell|NumatbEditorModalWindow|NumdlbEditorModalWindow|NuhlpbEditorModalWindow|JnttblEditorModalWindow|EffectProjectEditorModalWindow"`
  - PASS: no matching new errors for touched files.
- `git diff --check`
  - PASS: no whitespace errors; only existing line-ending warnings from the
    dirty working tree.

## 2026-06-14 NUMATB Profile Loading Parity

### Findings

- Unit Model and Scene Editor render the same shared NUMATB editor body and RND
  modal shell.
- Their loading models differ:
  - Scene Editor resolves maya/nust paths and reads both files into one
    `NumatbModalBundle`.
  - `useSsbhFileEditorSessions` reads only the clicked file and initializes the
    other profile with `createEmptyNumatbFile()`.
- The same single-profile assumption is present in Unit Model reload and save:
  reload discards the sister profile, while save writes only the clicked
  profile and then marks the complete two-profile draft clean.
- `unit-model-structure-tree.json` contains 67 NUMATB files for 23 model groups:
  each group has a maya file, a base nust file, and an `_m001__nust__` variant.
  Opening an `_m001__nust__` file therefore needs a fallback from the
  non-existent `_m001__maya__` name to the base `__maya__` profile.

### Changes

- Keep the shared NUMATB editor UI and RND shell.
- Changed the canonical shared file-session hook to load, reload, and save both
  profile paths using Scene Editor semantics.
- Preserve the clicked profile as the initially active tab.
- Added an `_mNNN__nust__` to base `__maya__` fallback for Unit Model variants.
- Moved the profile path resolver and two-profile bundle builder into
  `numatbEditorUtils.ts`; Scene Editor and Unit Model now use the same helpers.
- Added profile paths to shared NUMATB sessions so save writes both loaded
  profiles instead of marking an unwritten sister draft clean.

### Verification Log

- Real sample `E:\XB\解包\com\file\0xEE39E2DD`
  - 67 NUMATB files: 23 maya, 44 nust, 0 empty files.
- Regression test before fix:
  - 3 failures: sister profile empty, `_m001` maya fallback missing, save wrote
    only one profile.
- `pnpm vitest run src/components/ssbh-model-preview/useSsbhFileEditorSessions.test.ts src/page/SceneEdit/hooks/useSceneDetailView.test.tsx`
  - PASS: 2 files, 7 tests.
- `pnpm vitest run src/components/ssbh-model-preview`
  - PASS: 24 files, 119 tests.
- `pnpm vitest run src/page/UnitModelEdit/utils/unitModelNodePaths.test.ts src/page/UnitModelEdit/utils/unitModelStructureTree.test.ts`
  - PASS: 2 files, 6 tests.
- `pnpm tsc --noEmit --pretty false`
  - BLOCKED only by existing unrelated SceneEdit/resourceRegistry test fixture
    errors; no errors matched the changed NUMATB files.
- `git diff --check`
  - PASS: no whitespace errors; only existing line-ending warnings.

## 2026-06-14 NUMATB AI Copy Action

### Finding

- `NumatbTemplateEditorModalBody` only renders its Copy JSON button when
  `onCopyProfilesJson` is provided.
- Scene Detail View provides the callback and builds a full two-profile
  clipboard payload.
- `NumatbEditorModalWindow`, used by Unit Model Editor and other windowed file
  sessions, did not provide the callback, so the button was absent from the DOM.

### Changes

- Added the same full maya/nust clipboard export to the shared window component.
- Uses the current draft bundle, not a fresh single-file disk read.
- Includes both resolved profile paths and a model name derived from the NUMATB
  basename for AI analysis context.

### Verification Log

- Regression test before fix:
  - FAIL: `Copy NUMATB profiles as JSON` was absent from the window DOM.
- `pnpm vitest run src/components/ssbh-model-preview/NumatbEditorModalWindow.test.tsx src/components/ssbh-model-preview/copyNumatbProfilesJson.test.ts src/components/ssbh-model-preview/useSsbhFileEditorSessions.test.ts`
  - PASS: 3 files, 10 tests.
- `pnpm vitest run src/components/ssbh-model-preview`
  - PASS: 25 files, 120 tests.
- Filtered `pnpm tsc --noEmit --pretty false`
  - PASS: no errors matched the changed NUMATB window/session files.
- `git diff --check`
  - PASS: no whitespace errors; only existing line-ending warnings.

## 2026-06-15 Add Folder + Replace Model UX Design Refresh

### Context Gathered

- Re-read `AGENTS.md` and `.cursor/rules/custom-rules.mdc`.
- Searched `docs/` for unit model, replace, folder, NUMDLB, JNTTBL, and NUMATB
  references.
- Read the existing `docs/agent-sessions/unit-model-editor/add-replace-model-design.md`.
- Read `docs/superpowers/specs/2026-06-14-unit-model-editor-ssbh-file-editing-design.md`.
- Read `docs/checklist/repack-stage-fhm2d-checklist.md` for SSBH item ordering and
  required file/type-tag context.
- Used CodeGraph to inspect `UnitModelModelManagerPanel`,
  `UnitModelSourceValidationPreview`, `validate_unit_model_source_folder`,
  `add_unit_model_model`, and `replace_unit_model_model`.
- Applied the `frontend-design-direction` skill for the UI direction: dense,
  quiet, scannable production tooling using existing shadcn/lucide patterns.

### Findings

- The old add/replace design doc was stale: it said replace did not exist, but
  `replace_unit_model_model` is already implemented and registered through Tauri.
- The existing frontend exposes add-from-FBX/DAE, add-from-folder preview, and
  remove. A replace row action/modal is not wired in `UnitModelModelManagerPanel`.
- Source folder validation requires exactly one NUMDLB, NUMSHB, NUSKTB, JNTTBL,
  and exactly two NUMATB files (`__maya__` and `__nust__`), with parse checks and
  `jnttbl.bone_count == nusktb.bones.len()`.
- Existing source validation reports texture refs found in the source folder vs
  missing from source, but does not itself resolve whether missing refs already
  exist in the package shared texture pool.
- Backend replace preserves the target model group position, rewrites the new
  NUMDLB `model_name` to the target name, swaps model group children in place,
  dedupes/copies textures, filters old unreferenced files, and keeps target
  NUHLPB.

### Design Decisions

- Treat Add as a non-destructive validate -> preview -> commit flow.
- Treat Replace as an in-place content swap, never remove+append.
- Preserve target model identity and order during Replace.
- Add a backend replacement preview command so skeleton/material/texture diffs
  are computed consistently with Rust parsing and pool resolution.
- Keep target NUHLPB by default in phase 1; show a prominent warning when the
  source skeleton differs. Optional future mode can add keep/reset/auto.
- Block commits only on hard invalidity; skeleton/material differences are
  warnings because intentional replacements can change them.

### Artifact

- Updated `docs/agent-sessions/unit-model-editor/add-replace-model-design.md`
  with the refreshed product/technical design, backend preview shape, UI plan,
  mutation safety rules, tests, and implementation phases.

## 2026-06-15 Add Folder + Replace Model Implementation

### Changes

- Added Rust replacement preview DTOs and
  `preview_unit_model_model_replacement` in
  `src-tauri/src/format/unit_model_models.rs`.
- The preview reuses the prepared-folder source validation, locates the target
  model group from `_structure.json`, preserves target identity/order in the
  report, compares skeleton bone names, JNTTBL counts, and material labels, and
  computes a pool-aware texture commit plan.
- Registered the preview command in `stage_commands.rs` and `lib.rs`.
- Added `previewUnitModelModelReplacement` and matching TypeScript response
  types in `unitModelModelService.ts`.
- Made Add folder preview pool-aware by querying the package texture inventory:
  material refs already in the shared pool are shown as reused, refs present only
  in the source folder are shown as copied, and refs missing from both are hard
  blockers.
- Added the row-level Replace action in `UnitModelModelManagerPanel`.
- Added `UnitModelReplaceFolderModal` with target lock, source validation,
  skeleton/material/texture diff sections, warnings, blockers, and disabled
  confirmation while blockers remain.
- Shared `UnitModelSourceValidationPreview` between Add and Replace, with mode
  specific NUHLPB copy/keep text.
- Added Rust tests for replacement preview identity/compatibility and texture
  pool preference, and frontend service test coverage for the preview IPC call.

### Verification Log

- `cargo test --manifest-path src-tauri/Cargo.toml unit_model_models --lib`
  - PASS: 10 tests.
  - Existing warnings remain in `unit_model_repack.rs` for unused helper
    functions.
- `npm test -- src/page/UnitModelEdit/utils/unitModelModelService.test.ts`
  - PASS: 1 file, 3 tests.
- `npx vite build`
  - PASS: production client build completed.
- `npx tsc --noEmit`
  - BLOCKED by existing unrelated test fixture errors in
    `src/page/SceneEdit/utils/sceneDaeSessionImport.test.ts`,
    `src/page/SceneEdit/utils/sceneModelReplacePreview.test.ts`, and
    `src/services/resourceRegistry/stageRegistrySync.test.ts`.
- `git diff --check`
  - PASS: no whitespace errors; only existing line-ending warnings from the
    dirty working tree.

### Notes

- During verification, a broad `rustfmt` invocation briefly formatted unrelated
  Rust modules through `lib.rs`; those unrelated formatting-only edits were
  reverted with a scoped reverse patch. The remaining dirty files match the
  prior working-tree scope plus this Add/Replace implementation.
- Full app typecheck still needs the unrelated SceneEdit/resourceRegistry test
  fixture cleanup listed in `todo.md`.

## 2026-06-16 Verification Gate Cleanup

### Changes

- Updated stale TypeScript test fixtures that were blocking full project
  typecheck:
  - `sceneDaeSessionImport.test.ts` now returns the full
    `StaticMeshDirectConvertResult` mock shape and passes non-null empty NUMATB
    profiles into `buildSsbhSessionImportConfig`.
  - `sceneModelReplacePreview.test.ts` now matches the current
    `SsbhModelPreviewBundle` shape (`modl`, `skel`, `matl`, `textureResolve`)
    and no longer sets the removed bundle-level `displayLabel`.
  - `stageRegistrySync.test.ts` now includes `seedVerified` on
    `StageRegistrySlotInput` fixtures.
- Fixed two `ssbh_motion` regression tests by making their translation override
  intent explicit. Current runtime semantics keep skeleton/rest translation when
  `override_translation=false`; these tests are about track/name mapping, so the
  transform tracks now set `override_translation=true`.
- Made the optional real-sample Unit Model repack smoke skip when the local
  `0xA258a522_structure.json` exists but referenced files are incomplete. This
  keeps full `cargo test` independent from partially copied local samples while
  still running the smoke when the sample tree is complete.
- Stabilized the HKT XML winding regression by making
  `shape_preserving_simplify` iterate coplanar region IDs in sorted order.
  A full rerun had exposed nondeterministic output from `HashMap::values()`
  in `production_hkt_xml_preserves_upward_plane_winding`.
- Checked the user-reported test cleanup state: no tracked `.test.ts` or
  `.test.tsx` files are deleted. The only staged deletion currently visible is
  `.codegraph/daemon.pid`.

### Verification Log

- `npx tsc --noEmit --pretty false`
  - PASS.
- `npm test -- src/page/SceneEdit/utils/sceneDaeSessionImport.test.ts src/page/SceneEdit/utils/sceneModelReplacePreview.test.ts src/services/resourceRegistry/stageRegistrySync.test.ts src/page/UnitModelEdit/utils/unitModelModelService.test.ts`
  - PASS: 4 files, 27 tests.
- Targeted Rust reruns:
  - `cargo test --manifest-path src-tauri/Cargo.toml ssbh_motion::normalize_frame_tests::animate_skel_cpu_maps_transform_track_by_name_not_first_track --lib`
  - `cargo test --manifest-path src-tauri/Cargo.toml ssbh_motion::normalize_frame_tests::animate_skel_cpu_maps_namespaced_node_names_to_skeleton_names --lib`
  - `cargo test --manifest-path src-tauri/Cargo.toml format::unit_model_repack::tests::real_sample_0xa258a522_repack_skips_missing_legacy_shl_when_present --lib`
  - `cargo test --manifest-path src-tauri/Cargo.toml havok_collision_encode::tests::production_hkt_xml_preserves_upward_plane_winding --lib -- --nocapture`
  - PASS: each targeted test passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`
  - PASS: 320 passed, 0 failed, 10 ignored in the main lib test target; all bin/example/doc test phases and the ignored-only stage bundle target completed successfully.
  - Remaining output is warning-only: existing unused helper/import/variable/dead-code warnings.
- `git diff --check`
  - PASS: no whitespace errors; only existing line-ending warnings from the dirty working tree.
