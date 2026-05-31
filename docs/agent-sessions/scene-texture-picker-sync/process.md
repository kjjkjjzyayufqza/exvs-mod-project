# scene-texture-picker-sync — process

## Context

- User report: Scene Editor `Textures` tab edits (`add` / `remove` / `replace`) did not appear to update the selectable texture values inside `Import Static Mesh` in real time.
- Initial suspicion was a store split between texture management and static-mesh import UI.

## Investigation

- Read project guidance and relevant Scene Editor docs before editing.
- Confirmed `SceneTextureManager` writes to `useSceneTextureManagerStore`.
- Confirmed `Import Static Mesh` texture suggestions come from `SceneTextureSelectPicker`, which also reads `useSceneTextureManagerStore`.
- Added a focused picker regression test and verified plain add/remove store updates already propagate correctly.
- Root cause turned out not to be a second store:
  - `SceneTextureSelectPicker` caps the no-query menu to the first 80 options.
  - Newly added textures are appended to the end of the store list.
  - Replaced entries keep their logical filename, so entries near the end of large lists still stayed outside the visible 80-item window.
  - In large stages this looked like the picker was stale, even though the store was updating.

## Fix

- Added `recentEntryIds` tracking to `sceneTextureManagerStore`.
- `addEntry` and `replaceEntry` now bump the touched entry into a recent-priority list.
- `removeEntry`, `setEntries`, `markTexturesSaved`, and `clear` keep that recent list consistent.
- `SceneTextureSelectPicker` now orders suggestions as:
  1. current selected texture value (if it exists in scene textures)
  2. recently added/replaced entries
  3. remaining scene textures in normal order
- This preserves the existing 80-item no-query cap while making recent edits visible immediately.

## Files Changed

- `src/page/SceneEdit/components/SceneTextureSelectPicker.tsx`
- `src/page/SceneEdit/components/SceneTextureSelectPicker.test.tsx`
- `src/page/SceneEdit/store/sceneTextureManagerStore.ts`
- `src/page/SceneEdit/store/sceneTextureManagerStore.test.ts`

## Verification

- `npm test -- src/page/SceneEdit/components/SceneTextureSelectPicker.test.tsx src/page/SceneEdit/store/sceneTextureManagerStore.test.ts`
  - Result: pass (`22` tests)
- `ReadLints` on changed files
  - Result: no linter errors after replacing Tailwind arbitrary z-index classes with canonical forms

## Notes

- Attempted automated subagent review for `code-reviewer` and `typescript-reviewer`, but the local environment rejected the default subagent model provider in this region. Performed manual diff review plus targeted regression verification instead.

## Follow-up: Missing Unused Textures In Texture List

### User Report

- User reported that a stage folder already contained many files under `textures/`, but the SceneEdit texture list did not show them all.
- Example path from the report: `E:\XB\解包\com\test\0x16F73C97\0\0\textures`.

### Investigation

- Traced the texture-list seed path in `SceneEdit`.
- Confirmed the initial list was built only from `bundle.resolvedNutexbPaths`.
- `resolvedNutexbPaths` only contains textures currently referenced by loaded model/material bundles.
- Result: `.nutexb` files already present on disk but not referenced by any current model/material were invisible in the texture list.

### Fix

- Extracted texture-list construction into `src/page/SceneEdit/utils/sceneTextureManagerEntries.ts`.
- Added `listStageTextureFilePaths(stageRoot)` to read the shared `textures/` folder via Tauri filesystem APIs and collect all on-disk `.nutexb` files.
- Added `collectSceneTextureManagerEntries(...)` to union:
  - referenced bundle textures
  - additional `.nutexb` files found under `textures/`
- Updated `SceneEdit` stage load paths to seed `useSceneTextureManagerStore` from that union, so currently unused textures now appear in the list too.
- Memory-session paths such as `memory://stage` intentionally skip disk enumeration.

### Verification

- Added regression test:
  - `src/page/SceneEdit/utils/sceneTextureManagerEntries.test.ts`
  - Covers unreferenced shared-folder textures being included in the texture list.
- Ran:
  - `npm test -- src/page/SceneEdit/utils/sceneTextureManagerEntries.test.ts src/page/SceneEdit/components/SceneTextureSelectPicker.test.tsx src/page/SceneEdit/store/sceneTextureManagerStore.test.ts`
  - Result: pass (`25` tests)
- Ran `ReadLints` on:
  - `src/page/SceneEdit/utils/sceneTextureManagerEntries.ts`
  - `src/page/SceneEdit/utils/sceneTextureManagerEntries.test.ts`
  - `src/page/SceneEdit/page.tsx`
  - Result: no linter errors

### Review Note

- Attempted `typescript-reviewer` again after the follow-up change.
- The environment still rejected the subagent model provider in this region, so final review remained manual plus targeted regression verification.

## Follow-up: Picker Could Not Match Full Texture Paths

### User Report

- User reported that the UI under `Fill every texture path parameter for profiles you export` still could not choose an existing texture such as:
  - `E:\XB\解包\com\test\0x16F73C97\0\0\textures\atlas_66bdf54d_0.nutexb`

### Investigation

- Traced the UI chain:
  - `MissingTexturePathFillPanel`
  - `SceneTextureSelectPicker`
- Confirmed picker options are stored/displayed as texture basenames with `.nutexb` stripped.
- Confirmed search filtering was still using the raw input text.
- Result:
  - typing or pasting a full path such as `...\textures\atlas_66bdf54d_0.nutexb`
  - or even a suffixed filename such as `atlas_66bdf54d_0.nutexb`
  did not match the existing option `atlas_66bdf54d_0`, so the real texture looked unavailable even though it was already in the store.

### Fix

- Added `normalizeTextureBasename(...)` in `src/page/SceneEdit/components/SceneTextureSelectPicker.tsx`.
- Picker now normalizes user input by:
  - trimming whitespace
  - stripping parent folders / full path prefixes
  - stripping a trailing `.nutexb`
- Applied that normalization consistently to:
  - search filtering
  - exact-match detection
  - Enter-key commits
  - blur commits
  - selected-option highlighting

### Verification

- Added regression test:
  - `src/page/SceneEdit/components/SceneTextureSelectPicker.test.tsx`
  - Covers entering a full disk path and verifying the picker matches `atlas_66bdf54d_0` and commits the basename.
- Ran:
  - `npm test -- src/page/SceneEdit/components/SceneTextureSelectPicker.test.tsx src/page/SceneEdit/utils/sceneTextureManagerEntries.test.ts src/page/SceneEdit/store/sceneTextureManagerStore.test.ts`
  - Result: pass (`26` tests)
- Ran `ReadLints` on:
  - `src/page/SceneEdit/components/SceneTextureSelectPicker.tsx`
  - `src/page/SceneEdit/components/SceneTextureSelectPicker.test.tsx`
  - Result: no linter errors

### Review Note

- Attempted `typescript-reviewer` for this follow-up change as well.
- The environment still rejected the subagent model provider in this region, so review remained manual plus targeted regression verification.

## Follow-up: Unreferenced Atlas Still Hidden In Default Picker List

### User Report

- User showed a screenshot where `atlas_66bdf54d_0.nutexb` was visible in the SceneEdit `Textures` panel, but still did not appear in the default dropdown for `Fill every texture path parameter for profiles you export`.

### Investigation

- Verified the texture was already in `useSceneTextureManagerStore`; this was no longer a missing-files problem.
- Traced the remaining behavior to `SceneTextureSelectPicker`.
- Confirmed the picker still preserves a no-query cap (`80` options).
- Confirmed merged shared-folder textures were appended after referenced bundle textures.
- Result:
  - unreferenced textures from `textures/` could exist in the store
  - and even pass the earlier path-normalization fix
  - but still remain invisible in the default empty-query dropdown because the first `80` suggestions were consumed by referenced textures.

### Fix

- Updated `buildOrderedTextureOptions(...)` in `src/page/SceneEdit/components/SceneTextureSelectPicker.tsx`.
- Ordering is now:
  1. current selected value
  2. recently edited entries
  3. unreferenced shared textures (`referencedBy.length === 0`)
  4. remaining referenced textures
- This keeps the existing performance cap, but surfaces atlas-style fill candidates much earlier in the default list.

### Verification

- Added regression test:
  - `src/page/SceneEdit/components/SceneTextureSelectPicker.test.tsx`
  - Covers an unreferenced shared texture staying visible even when the default list is capped.
- Ran:
  - `npm test -- src/page/SceneEdit/components/SceneTextureSelectPicker.test.tsx src/page/SceneEdit/utils/sceneTextureManagerEntries.test.ts src/page/SceneEdit/store/sceneTextureManagerStore.test.ts`
  - Result: pass (`27` tests)
- Ran `ReadLints` on:
  - `src/page/SceneEdit/components/SceneTextureSelectPicker.tsx`
  - `src/page/SceneEdit/components/SceneTextureSelectPicker.test.tsx`
  - Result: no linter errors

### Review Note

- Automated `typescript-reviewer` remained unavailable in this region.
- Final review for this follow-up was manual plus targeted regression verification.
