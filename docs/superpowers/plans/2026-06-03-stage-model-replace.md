# Stage Model Replace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user replace ANY on-disk stage SSBH model — the `base` model or any sub-model (including `sky`) — by importing a new DAE/FBX, mirroring sub-model import, with a deferred (commit-on-Save) flow and zero Rust changes.

**Architecture:** `base`, every sub-model, and `sky` are all SSBH models stored at `{folder}/0/...` (`base` at `base/`, `sky` at `sky/`, others at `{name}/`). Right-click any such node in the Outliner → reuse `DaeImportConfigModal` → import through the scene session with `ssbhConfig.baseFilename = {folderName}` → swap the in-scene preview immediately → record the replacement in page state + a dirty-store flag. On the next Save, a new pipeline "replace" phase wipes the old `{folderName}/` folder and re-targets the session import so `collect_save_artifacts` writes the new model to `{folderName}/0/...`. Replacing a same-named folder changes no model-folder count, so object indices and the SKY placement row stay stable.

**Tech Stack:** React + TypeScript (Tauri v2 frontend), Zustand (+immer) store, Vitest. Rust backend unchanged.

**Spec:** `docs/superpowers/specs/2026-06-02-base-sky-model-replace-design.md` (scope generalized from base/sky to all stage SSBH models).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/page/SceneEdit/utils/sceneModelReplace.ts` | Replace types (`ModelReplaceTargetInfo`, `ModelReplacement`) + pure node/id→target resolution | **Create** |
| `src/page/SceneEdit/utils/sceneModelReplace.test.ts` | Unit tests for the helpers | **Create** |
| `src/page/SceneEdit/store/sceneDirtyStore.ts` | Track `replacedModels` (folder-name keyed flags) | Modify |
| `src/page/SceneEdit/store/sceneDirtyStore.test.ts` | Replacement-flag tests | Modify |
| `src/page/SceneEdit/utils/sceneSaveConfirm.ts` | Surface "replaced" in change preview + result summary | Modify |
| `src/page/SceneEdit/utils/sceneSaveConfirm.test.ts` | Replacement preview/summary tests | Modify |
| `src/page/SceneEdit/components/SaveConfirmDialog.tsx` | Render the "Replace N model(s)" section | Modify |
| `src/page/SceneEdit/utils/sceneSaveFolderPipeline.ts` | New "replace" phase: clean folder + re-target session import; `replacedCount` in result | Modify |
| `src/page/SceneEdit/utils/sceneSaveFolderPipeline.test.ts` | Replace-phase tests | Modify |
| `src/page/SceneEdit/components/SceneOutliner.tsx` | `onReplaceModel` prop + "Replace Model…" context-menu item | Modify |
| `src/page/SceneEdit/page.tsx` | State, `handleReplaceModel`, `processModelReplacement`, modal routing, save wiring, clear-on-success | Modify |

`sceneSaveFhm2dPipeline.ts` needs **no change**: `SaveFhm2dParams = SaveFolderParams & {...}` and it spreads `...folderParams` into `executeSaveFolderPipeline`, so `modelReplacements` and `replacedCount` flow through automatically.

**Key codebase facts the plan relies on (verified):**
- `scene_memory_session.rs::collect_save_artifacts` writes every pending import to `{base_filename}/0/...` with no special-casing (lines 522–534). So `baseFilename = {folderName}` lands at `{folderName}/0/...` for base, sky, or any sub-model.
- `base` renders from page state `baseModel: SsbhModelPreviewBundle | null`. Every sub-model (incl. `sky`) is a `subModels` entry `{ folderName, objectIndex, bundle }`. `sceneBuildImportPreviewBundle(...)` returns an `SsbhModelPreviewBundle`. So preview swap = `setBaseModel(bundle)` for base, else replace the matching `subModels` entry's `bundle`.
- The folder save pipeline already calls `sceneSaveAsFolder(sessionId, stageRoot)` in Phase 7, which writes all converted session imports. The replace phase only needs to (a) clean the old folder and (b) ensure the session import is converted with `baseFilename = folderName`.
- Outliner node ids: base node id is `"base"` (role `"base"`); each sub-model node id equals its `folderName` (role `"sub_model"`); `sky` is a sub-model named `"sky"`. Not-yet-saved imports use role `"imported_dae"` and are intentionally excluded (replace targets on-disk models only).
- Re-replacing the same folder in one session is last-wins: `collect_save_artifacts` iterates pending imports in push order and both write to the same `{folder}/0/...` path, so the latest import overwrites the earlier one. Harmless extra write; final disk state is correct.

---

### Task 1: Model-replace types and resolution helpers

**Files:**
- Create: `src/page/SceneEdit/utils/sceneModelReplace.ts`
- Test: `src/page/SceneEdit/utils/sceneModelReplace.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/page/SceneEdit/utils/sceneModelReplace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  canReplaceModelNode,
  resolveModelReplaceTarget,
} from "./sceneModelReplace";

describe("sceneModelReplace", () => {
  describe("canReplaceModelNode", () => {
    it("returns true for the base node", () => {
      expect(canReplaceModelNode({ role: "base" })).toBe(true);
    });
    it("returns true for any sub-model node (including sky)", () => {
      expect(canReplaceModelNode({ role: "sub_model" })).toBe(true);
    });
    it("returns false for not-yet-saved imports and other roles", () => {
      expect(canReplaceModelNode({ role: "imported_dae" })).toBe(false);
      expect(canReplaceModelNode({ role: "collision" })).toBe(false);
      expect(canReplaceModelNode({ role: "placement" })).toBe(false);
    });
  });

  describe("resolveModelReplaceTarget", () => {
    const subModels = [{ folderName: "stage_floor" }, { folderName: "sky" }];
    it("resolves the base node id to a base target", () => {
      expect(resolveModelReplaceTarget("base", subModels)).toEqual({
        folderName: "base",
        isBase: true,
      });
    });
    it("resolves a sub-model node id to a sub-model target", () => {
      expect(resolveModelReplaceTarget("stage_floor", subModels)).toEqual({
        folderName: "stage_floor",
        isBase: false,
      });
    });
    it("resolves the sky node id to a sub-model target", () => {
      expect(resolveModelReplaceTarget("sky", subModels)).toEqual({
        folderName: "sky",
        isBase: false,
      });
    });
    it("returns null for an unknown node id", () => {
      expect(resolveModelReplaceTarget("ghost", subModels)).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/page/SceneEdit/utils/sceneModelReplace.test.ts`
Expected: FAIL — "Failed to resolve import ./sceneModelReplace".

- [ ] **Step 3: Write minimal implementation**

Create `src/page/SceneEdit/utils/sceneModelReplace.ts`:

```ts
/**
 * Stage model replacement: shared types and pure resolution helpers.
 *
 * `base`, every sub-model, and `sky` are all SSBH models stored at {folder}/0/...
 * Replacement imports a new DAE/FBX whose on-disk folder name is forced to the
 * target folder, then wipes and rewrites that folder on save.
 */

/** A resolved replace target: the on-disk folder plus whether it is the base slot. */
export interface ModelReplaceTargetInfo {
  /** Disk folder name: "base", "sky", or a sub-model folder. */
  folderName: string;
  /** True for the base model (rendered from page state baseModel). */
  isBase: boolean;
}

/** A staged, not-yet-committed model replacement. */
export interface ModelReplacement extends ModelReplaceTargetInfo {
  sessionImportId: string;
  sourcePath: string;
  sourceName: string;
}

/** True when the outliner node is an on-disk SSBH model (base or sub-model). */
export function canReplaceModelNode(node: { role: string }): boolean {
  return node.role === "base" || node.role === "sub_model";
}

/**
 * Resolve an outliner node id to a replace target, or null when the node is not an
 * on-disk model. base → {folderName:"base", isBase:true}; a sub-model id (incl.
 * "sky") → {folderName, isBase:false}.
 */
export function resolveModelReplaceTarget(
  nodeId: string,
  subModels: ReadonlyArray<{ folderName: string }>,
): ModelReplaceTargetInfo | null {
  if (nodeId === "base") {
    return { folderName: "base", isBase: true };
  }
  const sub = subModels.find((s) => s.folderName === nodeId);
  if (sub) {
    return { folderName: sub.folderName, isBase: false };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/page/SceneEdit/utils/sceneModelReplace.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/page/SceneEdit/utils/sceneModelReplace.ts src/page/SceneEdit/utils/sceneModelReplace.test.ts
git commit -m "feat(scene): add stage model-replace types and resolution helpers"
```

---

### Task 2: Dirty-store replacement tracking

**Files:**
- Modify: `src/page/SceneEdit/store/sceneDirtyStore.ts`
- Test: `src/page/SceneEdit/store/sceneDirtyStore.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the `describe("sceneDirtyStore", ...)` block in `src/page/SceneEdit/store/sceneDirtyStore.test.ts` (before its closing `});`):

```ts
  it("markModelReplaced flags the folder and surfaces it via getReplacedModels", () => {
    const s = useSceneDirtyStore.getState();
    s.markModelReplaced("base");
    const state = useSceneDirtyStore.getState();
    expect(state.hasAnyChanges()).toBe(true);
    expect(state.getReplacedModels()).toEqual(["base"]);
  });

  it("getReplacedModels returns each replaced folder", () => {
    const s = useSceneDirtyStore.getState();
    s.markModelReplaced("sky");
    s.markModelReplaced("stage_floor");
    expect(useSceneDirtyStore.getState().getReplacedModels().sort()).toEqual([
      "sky",
      "stage_floor",
    ]);
  });

  it("reset clears replaced models", () => {
    const s = useSceneDirtyStore.getState();
    s.markModelReplaced("sky");
    useSceneDirtyStore.getState().reset();
    const state = useSceneDirtyStore.getState();
    expect(state.getReplacedModels()).toEqual([]);
    expect(state.hasAnyChanges()).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/page/SceneEdit/store/sceneDirtyStore.test.ts`
Expected: FAIL — `markModelReplaced is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/page/SceneEdit/store/sceneDirtyStore.ts`:

3a. Add the field to `SceneDirtyState`:

```ts
interface SceneDirtyState {
  objects: Record<string, ObjectDirtyEntry>;
  global: GlobalDirtyState;
  replacedModels: Record<string, boolean>;
}
```

3b. Add the actions to `SceneDirtyActions` (next to `markGlobalDirty` / `getDeletedObjects`):

```ts
  markModelReplaced: (folderName: string) => void;
  getReplacedModels: () => string[];
```

3c. Initialize state (next to the `global:` initializer):

```ts
    objects: {} as Record<string, ObjectDirtyEntry>,
    global: { graphicParams: false, placementOrder: false, textures: false },
    replacedModels: {} as Record<string, boolean>,
```

3d. Extend `hasAnyChanges`:

```ts
    hasAnyChanges: () => {
      const state = get();
      if (Object.keys(state.objects).length > 0) return true;
      if (Object.values(state.replacedModels).some(Boolean)) return true;
      return (
        state.global.graphicParams ||
        state.global.placementOrder ||
        state.global.textures
      );
    },
```

3e. Add the two action implementations (after `markGlobalDirty`):

```ts
    markModelReplaced: (folderName) => {
      set((state) => {
        state.replacedModels[folderName] = true;
      });
    },

    getReplacedModels: () => {
      const { replacedModels } = get();
      return Object.keys(replacedModels).filter((name) => replacedModels[name]);
    },
```

3f. Clear in `reset`:

```ts
    reset: () => {
      set((state) => {
        state.objects = {};
        state.global = { graphicParams: false, placementOrder: false, textures: false };
        state.replacedModels = {} as Record<string, boolean>;
      });
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/page/SceneEdit/store/sceneDirtyStore.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/page/SceneEdit/store/sceneDirtyStore.ts src/page/SceneEdit/store/sceneDirtyStore.test.ts
git commit -m "feat(scene): track model replacement flags in scene dirty store"
```

---

### Task 3: Surface replacements in the save-change preview

**Files:**
- Modify: `src/page/SceneEdit/utils/sceneSaveConfirm.ts`
- Modify: `src/page/SceneEdit/components/SaveConfirmDialog.tsx`
- Test: `src/page/SceneEdit/utils/sceneSaveConfirm.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the `describe("sceneSaveConfirm", ...)` block in `src/page/SceneEdit/utils/sceneSaveConfirm.test.ts` (before its closing `});`):

```ts
  it("buildSaveChangePreview includes replaced models and marks hasChanges", () => {
    const store = useSceneDirtyStore.getState();
    store.markModelReplaced("base");
    const preview = buildSaveChangePreview(useSceneDirtyStore.getState());
    expect(preview.hasChanges).toBe(true);
    expect(preview.replaced).toEqual(["base"]);
  });

  it("buildSaveResultSummary reports replaced models", () => {
    const store = useSceneDirtyStore.getState();
    store.markModelReplaced("stage_floor");
    const preview = buildSaveChangePreview(useSceneDirtyStore.getState());
    const summary = buildSaveResultSummary(preview, {
      convertedCount: 0,
      failedCount: 0,
      failedNames: [],
      deletedCount: 0,
      migratedTextures: 0,
    });
    expect(summary).toContain("Replaced stage_floor model");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/page/SceneEdit/utils/sceneSaveConfirm.test.ts`
Expected: FAIL — `preview.replaced` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/page/SceneEdit/utils/sceneSaveConfirm.ts`:

3a. Add `replaced` to `SaveChangePreview`:

```ts
export type SaveChangePreview = {
  added: string[];
  modified: SaveModifiedObjectPreview[];
  deleted: string[];
  replaced: string[];
  globalChanges: string[];
  hasChanges: boolean;
};
```

3b. In `buildSaveChangePreview`, replace the `const hasChanges = ...` / `return ...` block:

```ts
  const replaced = store.getReplacedModels();

  const hasChanges =
    added.length > 0 ||
    modified.length > 0 ||
    deleted.length > 0 ||
    replaced.length > 0 ||
    globalChanges.length > 0;

  return { added, modified, deleted, replaced, globalChanges, hasChanges };
```

3c. In `buildSaveResultSummary`, insert after the `if (preview.deleted.length > 0) { ... }` block and before the `for (const change of preview.globalChanges)` loop:

```ts
  for (const folderName of preview.replaced) {
    lines.push(`Replaced ${folderName} model`);
  }
```

3d. In `buildSavePipelineNotes`, after the `if (preview.deleted.length > 0)` block:

```ts
  if (preview.replaced.length > 0) {
    notes.push("Swap replaced model folders with the new import");
  }
```

3e. In `src/page/SceneEdit/components/SaveConfirmDialog.tsx`, add `FolderSync` to the lucide-react import:

```ts
import { FolderMinus, FolderPlus, FolderPen, FolderSync, Info } from "lucide-react";
```

After `const modifiedItems = ...`, add:

```ts
  const replacedItems = preview.replaced.map((folderName) => `${folderName} model`);
```

Add this `<ChangeSection>` right after the "Delete" section and before the "Update N scene file" section:

```tsx
            <ChangeSection
              title={`Replace ${preview.replaced.length} model${preview.replaced.length !== 1 ? "s" : ""}`}
              icon={<FolderSync className="h-4 w-4 shrink-0" />}
              toneClass="text-blue-600 dark:text-blue-400"
              items={replacedItems}
            />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/page/SceneEdit/utils/sceneSaveConfirm.test.ts`
Expected: PASS (existing + 2 new; the empty-preview test still passes since it does not assert on `replaced`).

- [ ] **Step 5: Commit**

```bash
git add src/page/SceneEdit/utils/sceneSaveConfirm.ts src/page/SceneEdit/utils/sceneSaveConfirm.test.ts src/page/SceneEdit/components/SaveConfirmDialog.tsx
git commit -m "feat(scene): show model replacement in save-change preview"
```

---

### Task 4: Save-folder pipeline replace phase

**Files:**
- Modify: `src/page/SceneEdit/utils/sceneSaveFolderPipeline.ts`
- Test: `src/page/SceneEdit/utils/sceneSaveFolderPipeline.test.ts`

For each replacement: `executeDelete(stageRoot, [folderName])` → `resolveSessionImportConfigForSave(sessionId, sessionImportId, folderName)` → `retargetAndReconvertSessionImport(...)` (force `baseFilename = folderName`, reconvert). Phase 7's existing `sceneSaveAsFolder` then writes `{folderName}/0/...`.

- [ ] **Step 1: Write the failing test**

Append inside the `describe("sceneSaveFolderPipeline", ...)` block in `src/page/SceneEdit/utils/sceneSaveFolderPipeline.test.ts` (before its closing `});`):

```ts
  it("replaces a model: cleans the target folder and re-targets the session import", async () => {
    const params = makeParams({
      sceneSessionId: "session-1",
      modelReplacements: [
        {
          folderName: "stage_floor",
          isBase: false,
          sessionImportId: "imp-1",
          sourcePath: "E:/m/floor.dae",
          sourceName: "floor.dae",
        },
      ],
    });

    const result = await executeSaveFolderPipeline(params);

    expect(result.success).toBe(true);
    expect(result.replacedCount).toBe(1);
    expect(result.hasStructuralChanges).toBe(true);
    expect(mockExecuteDelete).toHaveBeenCalledWith("E:/stage/16F73C97/0/0", ["stage_floor"]);
    expect(mockResolveSessionImportConfigForSave).toHaveBeenCalledWith(
      "session-1",
      "imp-1",
      "stage_floor",
    );
    expect(mockRetargetAndReconvertSessionImport).toHaveBeenCalledWith(
      "session-1",
      "imp-1",
      expect.any(Object),
      "stage_floor",
    );
    expect(mockSceneSaveAsFolder).toHaveBeenCalledWith("session-1", "E:/stage/16F73C97/0/0");
  });

  it("leaves replacedCount at 0 and no structural change when there are no replacements", async () => {
    const result = await executeSaveFolderPipeline(makeParams());
    expect(result.replacedCount).toBe(0);
    expect(result.hasStructuralChanges).toBe(false);
  });

  it("fails the save when a replacement is requested without a scene session", async () => {
    const params = makeParams({
      sceneSessionId: null,
      modelReplacements: [
        {
          folderName: "base",
          isBase: true,
          sessionImportId: "imp-2",
          sourcePath: "E:/m/base.dae",
          sourceName: "base.dae",
        },
      ],
    });
    const result = await executeSaveFolderPipeline(params);
    expect(result.success).toBe(false);
    expect(mockExecuteDelete).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/page/SceneEdit/utils/sceneSaveFolderPipeline.test.ts`
Expected: FAIL — `modelReplacements` unknown param / `result.replacedCount` undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/page/SceneEdit/utils/sceneSaveFolderPipeline.ts`:

3a. Add the type import (after the `import { ... } from "./sceneDaeSessionImport";` line):

```ts
import type { ModelReplacement } from "./sceneModelReplace";
```

3b. Add `modelReplacements` to `SaveFolderParams` (after `sceneSessionId`):

```ts
  sceneSessionId: string | null;
  modelReplacements?: ReadonlyArray<ModelReplacement>;
  onProgress: (step: SaveStepInfo) => void;
```

3c. Add `replacedCount` to `SaveFolderResult` (after `deletedCount`):

```ts
  deletedCount: number;
  replacedCount: number;
  migratedTextures: number;
```

3d. In `executeSaveFolderPipeline`, add `modelReplacements` to the destructuring of `params` (after `sceneSessionId`), and add the counter next to `let deletedCount = 0;`:

```ts
    sceneSessionId,
    modelReplacements,
    onProgress,
    onDeleteConfirm,
  } = params;

  let deletedCount = 0;
  let replacedCount = 0;
```

3e. Update the delete-cancel early return to include `replacedCount: 0`:

```ts
        return {
          success: false,
          convertedCount: 0,
          failedCount: 0,
          failedNames: [],
          convertedDaeObjectIds: [],
          deletedCount: 0,
          replacedCount: 0,
          migratedTextures: 0,
          reloadedBundle: null,
          hasStructuralChanges: false,
        };
```

3f. Insert the replace phase immediately after Phase 1 (the delete block) and before Phase 2 (`// Phase 2: Convert new objects`):

```ts
  // Phase 1b: Replace models (deferred commit). For each replaced folder, wipe the
  // existing folder, then re-target the session import to that folder name so
  // collect_save_artifacts writes it to {folderName}/0/... during Phase 7's
  // sceneSaveAsFolder. Replacing a same-named folder changes no model-folder count,
  // so object indices stay stable.
  const replacements = modelReplacements ?? [];
  if (replacements.length > 0) {
    emitStep(onProgress, "replace", `Replacing models (0/${replacements.length})...`, "running");
    if (!sceneSessionId) {
      emitStep(
        onProgress,
        "replace",
        "Replacing models...",
        "error",
        undefined,
        "No scene session available for model replacement",
      );
      return {
        success: false,
        convertedCount: 0,
        failedCount: 0,
        failedNames: [],
        convertedDaeObjectIds: [],
        deletedCount,
        replacedCount: 0,
        migratedTextures: 0,
        reloadedBundle: null,
        hasStructuralChanges: false,
      };
    }

    let done = 0;
    for (const replacement of replacements) {
      await executeDelete(stageRoot, [replacement.folderName]);
      const importConfig = await resolveSessionImportConfigForSave(
        sceneSessionId,
        replacement.sessionImportId,
        replacement.folderName,
      );
      await retargetAndReconvertSessionImport(
        sceneSessionId,
        replacement.sessionImportId,
        importConfig,
        replacement.folderName,
      );
      done++;
      emitStep(onProgress, "replace", `Replacing models (${done}/${replacements.length})...`, "running");
    }
    replacedCount = replacements.length;
    emitStep(
      onProgress,
      "replace",
      `Replacing models (${replacements.length}/${replacements.length})...`,
      "done",
      `${replacedCount} replaced`,
    );
  }
```

3g. Extend `hasStructuralChanges` near Phase 10:

```ts
  const hasStructuralChanges = convertedCount > 0 || deletedCount > 0 || replacedCount > 0;
```

3h. Add `replacedCount` to the final success return (after `deletedCount`):

```ts
    deletedCount,
    replacedCount,
    migratedTextures,
```

> Note: the pipeline signals failure by returning `success: false` with an error step (see the delete-cancel path), not by throwing. The page guarantees a session before staging a replacement, so the no-session guard is defensive and follows the file's existing convention.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/page/SceneEdit/utils/sceneSaveFolderPipeline.test.ts`
Expected: PASS (existing + 3 new). Existing tests still pass: `modelReplacements` defaults to `[]` (phase skipped) and every return now carries `replacedCount`.

- [ ] **Step 5: Commit**

```bash
git add src/page/SceneEdit/utils/sceneSaveFolderPipeline.ts src/page/SceneEdit/utils/sceneSaveFolderPipeline.test.ts
git commit -m "feat(scene): add model replace phase to save-folder pipeline"
```

---

### Task 5: Outliner "Replace Model…" context-menu item

**Files:**
- Modify: `src/page/SceneEdit/components/SceneOutliner.tsx`

Threads a new `onReplaceModel?: (nodeId: string) => void` prop to the per-node context menu and shows "Replace Model…" gated by `canReplaceModelNode` (unit-tested in Task 1). Verification here is typecheck + manual.

- [ ] **Step 1: Add imports**

Add `FolderSync` to the `lucide-react` import list (next to `Download`), and add:

```ts
import { canReplaceModelNode } from "../utils/sceneModelReplace";
```

- [ ] **Step 2: Add the prop to `SceneOutlinerProps`**

After `onExportDae?: (nodeId: string) => void;`:

```ts
  onReplaceModel?: (nodeId: string) => void;
```

- [ ] **Step 3: Destructure it in `SceneOutliner`**

Add `onReplaceModel,` to the destructured props of `SceneOutliner` (next to `onExportDae,`).

- [ ] **Step 4: Pass it through both render branches**

In `renderFlatRow`, add `onReplaceModel={onReplaceModel}` to the `<OutlinerNodeRow ... />` in **both** the `case "group-child":` and `case "node":` branches (next to `onExportDae={onExportDae}`). Add `onReplaceModel` to `renderFlatRow`'s `useCallback` dependency array (next to `onExportDae`).

- [ ] **Step 5: Thread through `OutlinerNodeRow`**

Add `onReplaceModel` to `OutlinerNodeRow`'s destructured params and prop type:

```ts
  onExportDae?: (nodeId: string) => void;
  onReplaceModel?: (nodeId: string) => void;
```

Pass it to `<NodeContextMenuContent ... />` at the bottom of `OutlinerNodeRow` (next to `onExportDae={onExportDae}`):

```tsx
        onExportDae={onExportDae}
        onReplaceModel={onReplaceModel}
```

- [ ] **Step 6: Add the menu item in `NodeContextMenuContent`**

Add `onReplaceModel` to `NodeContextMenuContent`'s destructured params and prop type (same two lines as Step 5). After the `supportsExportDae` constant, add:

```ts
  const supportsReplaceModel = canReplaceModelNode(node) && Boolean(onReplaceModel);
```

Render right after the `supportsExportDae` block (before the "Copy" item):

```tsx
      {supportsReplaceModel && (
        <>
          <ContextMenuItem onClick={() => onReplaceModel!(node.id)}>
            <FolderSync className="mr-2 h-3.5 w-3.5" />
            Replace Model...
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
```

- [ ] **Step 7: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: No **new** errors referencing `SceneOutliner.tsx`.

- [ ] **Step 8: Commit**

```bash
git add src/page/SceneEdit/components/SceneOutliner.tsx
git commit -m "feat(scene): add Replace Model context-menu item for stage models"
```

---

### Task 6: Page integration — trigger, processing, modal routing, save wiring

**Files:**
- Modify: `src/page/SceneEdit/page.tsx`

Verification is typecheck + the Task 7 manual E2E checklist.

- [ ] **Step 1: Add imports**

In the import block that pulls from `./utils/...`, add:

```ts
import {
  resolveModelReplaceTarget,
  type ModelReplaceTargetInfo,
  type ModelReplacement,
} from "./utils/sceneModelReplace";
```

- [ ] **Step 2: Add state**

Next to `const [daeImportEntries, ...]` / `const [showDaeImportModal, ...]` (around line 623):

```ts
  const [modelReplacements, setModelReplacements] = useState<ModelReplacement[]>([]);
  const [replaceTarget, setReplaceTarget] = useState<ModelReplaceTargetInfo | null>(null);
```

- [ ] **Step 3: Add `handleReplaceModel`**

Place after `handleImportDae` (around line 2969):

```ts
  const handleReplaceModel = useCallback(
    async (nodeId: string) => {
      const target = resolveModelReplaceTarget(nodeId, subModels);
      if (!target) {
        toast.error("This node cannot be replaced");
        return;
      }
      const selected = await open({
        multiple: false,
        filters: [{ name: "Static Mesh", extensions: ["dae", "fbx"] }],
        defaultPath: await getStoredDialogDefaultPath(SCENE_IMPORT_DAE_CONFIG_DIALOG_PATH_KEY),
      });
      if (!selected) return;
      const filePath = Array.isArray(selected) ? selected[0] : selected;
      if (!filePath) return;
      await rememberStoredDialogSelection(SCENE_IMPORT_DAE_CONFIG_DIALOG_PATH_KEY, filePath, "file");

      const fileName = filePath.split(/[/\\]/).pop() ?? "model.dae";
      const sourceFormat = detectStaticMeshImportFormat(fileName);
      // Force the on-disk folder name to the replace target so the new model is
      // written to {folderName}/0/... on save.
      const config = createDefaultDaeImportConfig(target.folderName);
      config.outputDirectory = stageRoot;
      const entry: DaeImportEntry = {
        importId: `dae_cfg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        fileName,
        filePath,
        sourceFormat,
        analysis: null,
        config,
        analyzing: true,
        analyzeError: null,
      };

      setReplaceTarget(target);
      setDaeImportEntries([entry]);
      setShowDaeImportModal(true);

      try {
        const analysis =
          sourceFormat === "fbx"
            ? await invoke("ssbh_analyze_fbx", { fbxPath: filePath })
            : await invoke("ssbh_analyze_dae", { daePath: filePath });
        const typedAnalysis = analysis as DaeImportEntry["analysis"];
        setDaeImportEntries((prev) =>
          prev.map((e) =>
            e.importId === entry.importId && typedAnalysis
              ? {
                  ...e,
                  analysis: typedAnalysis,
                  config: syncDaeImportConfigUpAxisFromAnalysis(e.config, typedAnalysis),
                  analyzing: false,
                }
              : e,
          ),
        );
      } catch (err) {
        setDaeImportEntries((prev) =>
          prev.map((e) =>
            e.importId === entry.importId
              ? { ...e, analyzing: false, analyzeError: String(err) }
              : e,
          ),
        );
      }
    },
    [stageRoot, subModels],
  );
```

- [ ] **Step 4: Add `processModelReplacement`**

Place right after `processSsbhSessionImport` (after line ~3198):

```ts
  const processModelReplacement = useCallback(
    async (entry: DaeImportEntry, target: ModelReplaceTargetInfo) => {
      const sessionState = useDaeSsbhSessionStore.getState();

      let activeSessionId = sceneSessionId;
      if (!activeSessionId) {
        if (stageRoot) {
          const opened = await sceneOpenFolder(stageRoot);
          activeSessionId = opened.sessionId;
          setSceneSessionId(opened.sessionId);
        } else {
          activeSessionId = await sceneSessionCreate({ type: "new" });
          setSceneSessionId(activeSessionId);
        }
      }

      if (!target.isBase && !subModels.some((s) => s.folderName === target.folderName)) {
        toast.error(`Model slot "${target.folderName}" not found in the loaded stage`);
        return;
      }

      try {
        staticMeshProgressActiveRef.current = true;
        setImportProgress({
          open: true,
          progress: 0,
          steps: createStaticMeshImportSteps(entry.fileName, false),
        });

        // baseFilename forced to the target folder; collect_save_artifacts writes the
        // converted model to {folderName}/0/... on the next save.
        const importConfig = buildSsbhSessionImportConfig(entry.config, sessionState, target.folderName);
        const result = await importDaeThroughSceneSession({
          sessionId: activeSessionId,
          filePath: entry.filePath,
          name: target.folderName,
          importConfig,
          onProgress: handleStaticMeshProgress,
        });
        if (!result.ssbhGenerated) {
          throw new Error("SSBH conversion did not produce in-memory artifacts");
        }

        applyStaticMeshProgressUpdate({
          step: "preview",
          label: "Receiving viewport preview bundle from Rust...",
          detail: "Large mesh preview data may take time to cross IPC.",
          progress: 94,
        });
        const previewBundle = await sceneBuildImportPreviewBundle({
          sessionId: activeSessionId,
          importId: result.importId,
          stageRoot,
          sourcePath: entry.filePath,
        });
        for (const warning of previewBundle.warnings) {
          toast.warning(warning);
        }

        // Swap the in-scene preview for the target slot.
        if (target.isBase) {
          setBaseModel(previewBundle);
        } else {
          setSubModels((prev) =>
            prev.map((s) =>
              s.folderName === target.folderName ? { ...s, bundle: previewBundle } : s,
            ),
          );
        }

        setModelReplacements((prev) => [
          ...prev.filter((r) => r.folderName !== target.folderName),
          {
            folderName: target.folderName,
            isBase: target.isBase,
            sessionImportId: result.importId,
            sourcePath: entry.filePath,
            sourceName: entry.fileName,
          },
        ]);
        useSceneDirtyStore.getState().markModelReplaced(target.folderName);

        applyStaticMeshProgressUpdate({
          step: "done",
          label: "Model replacement staged",
          progress: 100,
        });
        toast.success(`Staged ${target.folderName} model replacement. Save the stage to commit.`);
      } catch (err) {
        toast.error(
          `Replace ${target.folderName} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        staticMeshProgressActiveRef.current = false;
        setImportProgress((prev) => ({ ...prev, open: false }));
      }
    },
    [
      sceneSessionId,
      stageRoot,
      subModels,
      handleStaticMeshProgress,
      applyStaticMeshProgressUpdate,
    ],
  );
```

- [ ] **Step 5: Route the modal's `onImport` to the replace flow**

Make this the **first** statement inside the modal's `onImport={async () => { ... }}` (around line 4435), before the existing `setShowDaeImportModal(false)`:

```ts
              if (replaceTarget) {
                setShowDaeImportModal(false);
                const replaceEntries = [...daeImportEntries];
                setDaeImportEntries([]);
                const target = replaceTarget;
                setReplaceTarget(null);
                if (replaceEntries[0]) {
                  await processModelReplacement(replaceEntries[0], target);
                }
                return;
              }
```

- [ ] **Step 6: Clear `replaceTarget` on modal cancel**

In the modal's `onCancel`, add `setReplaceTarget(null);`:

```ts
            onCancel={() => {
              setShowDaeImportModal(false);
              setDaeImportEntries([]);
              setReplaceTarget(null);
            }}
```

- [ ] **Step 7: Wire the Outliner prop**

In `<SceneOutliner ... />` (around line 4028), add (next to `onExportDae={handleExportDaeFromOutliner}`):

```tsx
                    onReplaceModel={handleReplaceModel}
```

- [ ] **Step 8: Pass `modelReplacements` into both save pipelines**

In `handleSaveFolder`, add `modelReplacements,` to the `executeSaveFolderPipeline({ ... })` argument (after `sceneSessionId,`). In `handleSaveFhm2d`, add `modelReplacements,` to the `executeSaveFhm2dPipeline({ ... })` argument (after `sceneSessionId,`). Add `modelReplacements` to the dependency array of **both** `useCallback`s.

- [ ] **Step 9: Clear staged replacements on successful save**

In **both** `handleSaveFolder` and `handleSaveFhm2d`, immediately after `useSceneDirtyStore.getState().reset();` (success path), add:

```ts
      setModelReplacements([]);
```

(After a structural save the bundle reloads via `applyBundle`, repopulating `baseModel`/`subModels` from disk truth.)

- [ ] **Step 10: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: No **new** errors referencing `page.tsx`.

- [ ] **Step 11: Commit**

```bash
git add src/page/SceneEdit/page.tsx
git commit -m "feat(scene): wire stage model replace trigger, staging, and save commit"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full Scene Editor test suite**

Run: `pnpm exec vitest run src/page/SceneEdit`
Expected: PASS — all suites green, including the new tests from Tasks 1–4.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: No new type errors in the touched files (compare to the pre-existing SceneEdit baseline).

- [ ] **Step 3: Manual E2E checklist (app already running; do not start a dev server)**

Replace base:
1. Open a stage folder that has a `base/` model.
2. Right-click `base` → **Replace Model...** → pick a DAE/FBX → confirm in the import modal.
3. Viewport base preview swaps; "Staged base model replacement" toast appears.
4. **Save as Folder** → confirm dialog shows "Replace 1 model → base model" → save.
5. On disk: `base/0/base.numdlb` (+ siblings) reflect the new model; old stem files gone. Outliner reloads, still one `base` node.

Replace a regular sub-model:
6. Right-click a sub-model (e.g. `stage_floor`) → **Replace Model...** → pick a file → confirm → save.
7. On disk: `stage_floor/0/...` updated. Its object index and placement row are unchanged; other objects unaffected.

Replace sky:
8. Right-click `sky` → **Replace Model...** → pick a file → save.
9. On disk: `sky/0/...` updated; `info/placement.csv` still has exactly one `SKY` row with `VDK_OBJECTNUMBER` equal to the model-folder count (unchanged).

Save FHM2D after replace:
10. Replace any model, then **Save as FHM2D** → packs successfully; the new model is present in the packed stage.

Negative / guard checks:
11. Right-click a not-yet-saved imported DAE (role `imported_dae`) → **Replace Model...** is **absent**.
12. Cancel the import modal mid-replace → no staging; `hasAnyChanges` unaffected by the cancelled replace.

- [ ] **Step 4: Final commit (if verification fixes were needed)**

```bash
git add -A
git commit -m "test(scene): verify stage model replace end-to-end"
```

---

## Notes / Known Limitations

- **Scope**: replace targets on-disk SSBH models only — `base`, any sub-model, and `sky` (a sub-model named "sky"). Not-yet-saved imports (`imported_dae`) are excluded; re-import to change those.
- **Textures**: the new model's numatb references must resolve in the shared `textures/` folder or `runNumatbPreflight` blocks Save (same as adding a sub-model). Supply missing textures via the Texture Manager. No new texture logic here.
- **Wholesale replace**: cleaning `{folderName}/` removes any non-`0/` attachments (e.g. an old `map_hit.hkt`). Collision regenerates separately via "Generate HKT"; if the import modal's "generate HKT" is checked, the new HKT flows through `collect_save_artifacts` automatically.
- **Index stability**: replacing a same-named folder adds/removes no model folders, so object indices and the SKY placement row are preserved.
- **Re-replace in one session**: last-wins (later pending import overwrites the earlier at the same `{folder}/0/...` path). Harmless extra write; final state correct.
- **Staged-but-unsaved**: until Save, on-disk operations that resolve against `{folder}/0/...` (HKT, export) still see the old model — consistent with how added sub-models are not on disk until save. Not saving = undo.
