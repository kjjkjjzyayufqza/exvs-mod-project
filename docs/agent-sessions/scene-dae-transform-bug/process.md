# Scene DAE Transform Bug Process

## Goal

Fix imported DAE transform editing in SceneEdit so Quick Import and Import with Config previews respond to translate, rotate, and scale in the Three.js viewport.

## Context

- User reports `position x` changes to values such as `-36.308`, but the DAE model remains visually at the map center.
- Test asset folder: `D:/output/exvs2/zabanya`.
- Relevant docs read:
  - `docs/scene-editor-user-guide.md`
  - `docs/superpowers/plans/2026-05-18-scene-editor-havok-import-pipeline.md`
  - `docs/agent-sessions/scene-dae-ssbh-save/process.md`
- Relevant files inspected:
  - `src/page/SceneEdit/page.tsx`
  - `src/page/SceneEdit/components/MapViewport.tsx`
  - `src/page/SceneEdit/components/SceneTransformControls.tsx`
  - `src/page/SceneEdit/components/dae-import/DaeImportConfigModal.tsx`
  - `src/page/SceneEdit/utils/daeExportImport.ts`
  - `src/page/SceneEdit/utils/importedDaeSceneNormalize.ts`

## Notes

- Existing code stores imported DAE transforms in `ImportedDaeObject.transform`.
- `ImportedDaeGroup` renders a wrapper `<group>` with the transform, then a `<primitive>` built by `buildImportedDaeDisplayRoot`.
- Existing normalize tests cover parent movement and a Zabanya fixture, but they do not cover the full R3F component/state path.
- Root cause found: Zabanya DAE files use skinned/controller data. The preview path treated skinned content as a live `SkinnedMesh`, so actor `position` could move the wrapper/gizmo while visible vertices still kept their bind-pose offset from the actor pivot.
- Dragging also synced imported DAE transforms to React state on every gizmo frame, unlike the existing placement/base gizmo commit-only policy, which could fight R3F object mutation during drag.

## Implementation

- Bake imported DAE preview meshes into static world-space geometry for display, including `SkinnedMesh` vertices via `applyBoneTransform`.
- Recenter the baked preview geometry around its visual bounding-box center so the actor pivot controls the visible model center.
- Force the imported DAE wrapper to apply the current transform in a layout effect, so property-panel edits and gizmo commits cannot leave R3F's primitive object stale.
- Changed imported DAE gizmo drag handling to invalidate during drag and commit transform state on mouse-up, matching the project gizmo sync policy.
- Added regression coverage for an offset baked DAE and all available Zabanya DAE fixtures:
  - `D:/output/exvs2/zabanya/backpack_up.dae`
  - `D:/output/exvs2/zabanya/body.dae`
  - `D:/output/exvs2/zabanya/backpack_bottom.dae`

## Verification

- `npm test -- src/page/SceneEdit/utils/importedDaeSceneNormalize.test.ts src/page/SceneEdit/utils/importedDaeSceneNormalize.zabanya.integration.test.ts` -> passed, 2 files / 5 tests.
- `npm test -- src/page/SceneEdit/utils/importedDaeSceneNormalize.test.ts src/page/SceneEdit/utils/importedDaeSceneNormalize.zabanya.integration.test.ts src/page/SceneEdit/utils/sceneEditorGizmoSync.test.ts` -> first failed because current Three.js exposes `SkinnedMesh.applyBoneTransform`, not `boneTransform`.
- `npm test -- src/page/SceneEdit/utils/importedDaeSceneNormalize.test.ts src/page/SceneEdit/utils/importedDaeSceneNormalize.zabanya.integration.test.ts src/page/SceneEdit/utils/sceneEditorGizmoSync.test.ts` -> passed after switching to `applyBoneTransform`, 3 files / 10 tests.
- User then reported imported DAE became invisible. Follow-up root cause: `applyBoneTransform()` requires the original vertex position in the target vector before applying skinning. The previous fix passed an uninitialized/reused vector, which could corrupt baked geometry.
- Fixed by calling `_skinnedVertex.fromBufferAttribute(position, i)` before `applyBoneTransform()`.
- Added Zabanya regression assertions that baked preview bounding boxes remain finite and non-empty.
- `npm test -- src/page/SceneEdit/utils/importedDaeSceneNormalize.test.ts src/page/SceneEdit/utils/importedDaeSceneNormalize.zabanya.integration.test.ts src/page/SceneEdit/utils/sceneEditorGizmoSync.test.ts` -> passed after the visibility fix, 3 files / 10 tests.
- User then reported FHM2D-loaded sub-model gizmos appear at map center and cannot be dragged while base gizmo works.
- Root cause: `StageModelGroup` and `EffectMarker` still passed `groupRef`/`groupRef.current` directly into `SceneTransformControls`. On the first render where the gizmo is requested, `groupRef.current` can still be null; no later render is guaranteed just because the ref was assigned, so the transform gizmo can remain at origin without an attached target.
- Fixed `StageModelGroup` and `EffectMarker` to use callback refs plus `gizmoTarget` state, matching the imported DAE fix: render `SceneTransformControls` only after a real `THREE.Group` target exists.
- `npm test -- src/page/SceneEdit/utils/sceneEditorGizmoSync.test.ts src/page/SceneEdit/utils/importedDaeSceneNormalize.test.ts src/page/SceneEdit/utils/importedDaeSceneNormalize.zabanya.integration.test.ts` -> passed, 3 files / 10 tests.
- Code review subagent could not run due regional model availability.
- `ReadLints` on edited SceneEdit files -> no linter errors.
- `npx tsc --noEmit` -> failed on existing unrelated `src/page/SceneEdit/utils/sceneSessionService.test.ts(140,41)` mock typing error: `Value of type 'Mock<Procedure | Constructable>' is not callable`.
