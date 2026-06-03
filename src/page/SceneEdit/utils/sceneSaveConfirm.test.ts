import { beforeEach, describe, expect, it } from "vitest";
import { useSceneDirtyStore } from "../store/sceneDirtyStore";
import {
  buildSaveChangePreview,
  buildSavePipelineNotes,
  buildSaveResultSummary,
} from "./sceneSaveConfirm";

function resetStore() {
  useSceneDirtyStore.getState().reset();
}

describe("sceneSaveConfirm", () => {
  beforeEach(resetStore);

  it("buildSaveChangePreview returns empty preview when nothing is dirty", () => {
    const preview = buildSaveChangePreview(useSceneDirtyStore.getState());
    expect(preview.hasChanges).toBe(false);
    expect(preview.added).toEqual([]);
    expect(preview.modified).toEqual([]);
    expect(preview.deleted).toEqual([]);
    expect(preview.globalChanges).toEqual([]);
  });

  it("buildSaveChangePreview groups added, modified, deleted, and global changes", () => {
    const store = useSceneDirtyStore.getState();
    store.markObjectAdded("new_box");
    store.markObjectModified("stage_floor", "transform");
    store.markObjectModified("stage_floor", "material");
    store.markObjectDeleted("old_tree");
    store.markGlobalDirty("graphicParams");
    store.markGlobalDirty("placementOrder");

    const preview = buildSaveChangePreview(useSceneDirtyStore.getState());
    expect(preview.hasChanges).toBe(true);
    expect(preview.added).toEqual(["new_box"]);
    expect(preview.modified).toEqual([
      { folderName: "stage_floor", fields: ["Transform", "Material"] },
    ]);
    expect(preview.deleted).toEqual(["old_tree"]);
    expect(preview.globalChanges).toEqual([
      "Graphic parameters (graphic_param.csv)",
      "Object placement (placement.csv)",
    ]);
  });

  it("buildSavePipelineNotes mentions conversion and deletion when applicable", () => {
    const preview = buildSaveChangePreview(useSceneDirtyStore.getState());
    preview.added.push("new_obj");
    preview.deleted.push("old_obj");

    const notes = buildSavePipelineNotes(preview);
    expect(notes).toContain("Convert new imported DAE objects to SSBH model folders");
    expect(notes).toContain("Permanently delete removed object folders from disk");
    expect(notes).toContain("Rebuild stage structure JSON from disk");
  });

  it("buildSaveResultSummary describes completed save actions", () => {
    const store = useSceneDirtyStore.getState();
    store.markObjectAdded("new_box");
    store.markObjectModified("floor", "transform");
    store.markGlobalDirty("placementOrder");

    const preview = buildSaveChangePreview(useSceneDirtyStore.getState());
    const lines = buildSaveResultSummary(preview, {
      convertedCount: 1,
      failedCount: 0,
      failedNames: [],
      deletedCount: 0,
      migratedTextures: 2,
    });

    expect(lines).toContain("Added 1 object(s): new_box");
    expect(lines).toContain("Converted 1 imported DAE object(s) to SSBH");
    expect(lines).toContain("Updated floor: Transform");
    expect(lines).toContain("Wrote Object placement (placement.csv)");
    expect(lines).toContain("Collected 2 texture(s) into textures/");
    expect(lines).toContain("Rebuilt stage structure JSON");
  });

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
});
