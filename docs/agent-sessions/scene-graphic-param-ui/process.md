# Scene Graphic Param UI Process

## Context

- User reported that the Scene Editor right-side Graphic UI was coercing numeric `0`/`1` values into `On`/`Off`, which prevented later numeric edits.
- User also reported poor `onChange` performance when editing scenes with very large Three.js geometry.
- Read startup context:
  - `AGENTS.md`
  - `.cursor/rules/custom-rules.mdc`
  - `docs/scene-editor-user-guide.md`
- CodeGraph context pointed the work at:
  - `src/page/SceneEdit/components/GraphicParamPanel.tsx`
  - `src/page/SceneEdit/utils/graphicParamInspector.ts`
  - `src/page/SceneEdit/components/SceneCsvEditorPanels.test.tsx`

## Decisions

- Removed scalar boolean detection from the Graphic Param inspector. `0` and `1` are valid numeric values here, not UI booleans.
- Kept direct text input for scalar values so values can move freely between `0`, `1`, decimals, and non-slider text fields.
- Reduced heavy scene update pressure by moving scalar and color channel inputs to draft-local editing. They now call `onValueChange` only on blur or Enter.
- Reduced slider update pressure by committing slider values only on release via `onValueCommit`.
- Escape reverts local draft state and skips the next blur commit.

## Verification

- `npm test -- src/page/SceneEdit/components/SceneCsvEditorPanels.test.tsx src/page/SceneEdit/utils/graphicParamInspector.test.ts`
  - Passed: 2 files, 6 tests.
- `git diff --check`
  - Passed with line-ending warnings only.
- `npx tsc --noEmit --pretty false`
  - Failed only in unrelated existing test files:
    - `src/page/SceneEdit/utils/sceneDaeSessionImport.test.ts`
    - `src/page/SceneEdit/utils/sceneModelReplacePreview.test.ts`

## Notes

- No dev server was started.
- Existing texture-manager worktree changes were left untouched.
