# scene-info-textures process

## Context

- User asked for the Scene Editor left texture list to show all `.nutexb`, not only textures referenced by loaded models.
- User specifically called out extracted stage folders like `E:\XB\解包\com\test\0x16F73C97\0\0\textures`.
- Project docs state model textures are consolidated under the shared content-level `textures/` folder, while environment textures under `info/fog`, `info/light`, and `info/post_effect` are not model textures and stay under `info/` in both editing and packable layouts.

## Decisions

- Added `TextureEntryScope = "model" | "info"` to `TextureManagerEntry`.
- Added `InfoTextureCategory = "fog" | "light" | "post_effect"` for info entries.
- Treat top-level Add Texture as model texture add only.
- Keep info textures visible and preview/export/copyable.
- Info texture replace writes in place to the existing `info/*/*.nutexb` path, and does not participate in the shared model `textures/` save manifest.
- Info texture delete remains blocked until there is an explicit info-specific removal design.
- Filter info textures out of:
  - model texture save manifest
  - model material texture picker suggestions
  - model add duplicate detection

## Implementation Notes

- `sceneTextureManagerEntries.ts`
  - `listStageTextureFilePaths` now returns a structured inventory with `modelTexturePaths` and `infoTexturePaths`.
  - Scans all `.nutexb` recursively under shared `textures/`.
  - Scans `.nutexb` recursively under `info/fog`, `info/light`, and `info/post_effect`.
- `SceneTextureManager.tsx`
  - Splits the left texture list into `Model textures` and `Info textures`.
  - Shows info category badges for fog, light, and post effect.
  - Info entries can be replaced in place, exported, previewed, and copied.
  - Prevents info entries from using model remove actions.
- `sceneTextureConvert.ts`
  - Added `replaceNutexbInPlace`.
  - For selected `.nutexb`, copies it over the target path using Tauri fs.
  - For selected image files, converts directly into the target `.nutexb` path.
- `page.tsx`
  - Passes both model and info path inventories through all stage load paths.
- `sceneTextureSaveCollector.ts`
  - Ignores non-model entries when building the model texture save manifest.
- `SceneTextureSelectPicker.tsx`
  - Ignores info entries when building numatb material texture suggestions.
- `sceneTextureAddPlan.ts`
  - Ignores info entries when checking model texture add duplicates.

## Verification

- Passed:
  - `npm test -- src/page/SceneEdit/utils/sceneTextureManagerEntries.test.ts src/page/SceneEdit/utils/sceneTextureSaveCollector.test.ts src/page/SceneEdit/utils/sceneTextureAddPlan.test.ts src/page/SceneEdit/components/SceneTextureSelectPicker.test.tsx src/page/SceneEdit/store/sceneTextureManagerStore.test.ts`
  - 5 test files, 46 tests.
- Passed after info replace support:
  - `npm test -- src/page/SceneEdit/utils/sceneTextureConvert.test.ts src/page/SceneEdit/utils/sceneTextureManagerEntries.test.ts src/page/SceneEdit/utils/sceneTextureSaveCollector.test.ts src/page/SceneEdit/utils/sceneTextureAddPlan.test.ts src/page/SceneEdit/components/SceneTextureSelectPicker.test.tsx src/page/SceneEdit/store/sceneTextureManagerStore.test.ts`
  - 6 test files, 49 tests.
- Passed:
  - `git diff --check`
- Ran:
  - `npx tsc --noEmit --pretty false`
- Result:
  - Failed only on pre-existing unrelated test type errors in `sceneDaeSessionImport.test.ts` and `sceneModelReplacePreview.test.ts`; no diagnostics were reported for the changed texture files.
