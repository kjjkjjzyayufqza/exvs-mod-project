import { beforeEach, describe, expect, it } from "vitest";
import { useSceneDirtyStore } from "./sceneDirtyStore";

function resetStore() {
  useSceneDirtyStore.getState().reset();
}

describe("sceneDirtyStore", () => {
  beforeEach(resetStore);

  it("starts with no changes", () => {
    const s = useSceneDirtyStore.getState();
    expect(s.hasAnyChanges()).toBe(false);
    expect(s.getAddedObjects()).toEqual([]);
    expect(s.getModifiedObjects()).toEqual([]);
    expect(s.getDeletedObjects()).toEqual([]);
  });

  it("markObjectAdded creates entry with changeType added", () => {
    const s = useSceneDirtyStore.getState();
    s.markObjectAdded("box01");
    const state = useSceneDirtyStore.getState();
    expect(state.hasAnyChanges()).toBe(true);
    expect(state.getAddedObjects()).toEqual(["box01"]);
    const entry = state.objects["box01"];
    expect(entry?.changeType).toBe("added");
  });

  it("markObjectModified creates entry with changeType modified and sets field flag", () => {
    const s = useSceneDirtyStore.getState();
    s.markObjectModified("box01", "transform");
    const state = useSceneDirtyStore.getState();
    expect(state.getModifiedObjects()).toEqual(["box01"]);
    const entry = state.objects["box01"];
    expect(entry?.changeType).toBe("modified");
    expect(entry?.modifiedFields.transform).toBe(true);
    expect(entry?.modifiedFields.material).toBe(false);
  });

  it("markObjectModified on existing modified entry preserves other field flags", () => {
    const s = useSceneDirtyStore.getState();
    s.markObjectModified("box01", "transform");
    s.markObjectModified("box01", "material");
    const entry = useSceneDirtyStore.getState().objects["box01"];
    expect(entry?.modifiedFields.transform).toBe(true);
    expect(entry?.modifiedFields.material).toBe(true);
    expect(entry?.modifiedFields.textures).toBe(false);
  });

  it("markObjectDeleted sets changeType deleted", () => {
    const s = useSceneDirtyStore.getState();
    s.markObjectModified("box01", "transform");
    s.markObjectDeleted("box01");
    const state = useSceneDirtyStore.getState();
    expect(state.getDeletedObjects()).toEqual(["box01"]);
    expect(state.getModifiedObjects()).toEqual([]);
  });

  it("markObjectDeleted on an added object removes the entry entirely", () => {
    const s = useSceneDirtyStore.getState();
    s.markObjectAdded("newObj");
    expect(useSceneDirtyStore.getState().hasAnyChanges()).toBe(true);
    s.markObjectDeleted("newObj");
    const state = useSceneDirtyStore.getState();
    expect(Object.keys(state.objects).length).toBe(0);
    expect(state.hasAnyChanges()).toBe(false);
  });

  it("markObjectModified on a deleted object is a no-op", () => {
    const s = useSceneDirtyStore.getState();
    s.markObjectDeleted("box01");
    s.markObjectModified("box01", "transform");
    const entry = useSceneDirtyStore.getState().objects["box01"];
    expect(entry?.changeType).toBe("deleted");
    expect(entry?.modifiedFields.transform).toBe(false);
  });

  it("markObjectModified on an added object is a no-op", () => {
    const s = useSceneDirtyStore.getState();
    s.markObjectAdded("newObj");
    s.markObjectModified("newObj", "textures");
    const entry = useSceneDirtyStore.getState().objects["newObj"];
    expect(entry?.changeType).toBe("added");
    expect(entry?.modifiedFields.textures).toBe(false);
  });

  it("hasAnyChanges returns true when only global field is dirty", () => {
    const s = useSceneDirtyStore.getState();
    expect(s.hasAnyChanges()).toBe(false);
    s.markGlobalDirty("graphicParams");
    expect(useSceneDirtyStore.getState().hasAnyChanges()).toBe(true);
  });

  it("markGlobalDirty sets the placementOrder flag", () => {
    const s = useSceneDirtyStore.getState();
    s.markGlobalDirty("placementOrder");
    expect(useSceneDirtyStore.getState().global.placementOrder).toBe(true);
    expect(useSceneDirtyStore.getState().global.graphicParams).toBe(false);
  });

  it("reset clears all objects and global state", () => {
    const s = useSceneDirtyStore.getState();
    s.markObjectAdded("a");
    s.markObjectModified("b", "hkt");
    s.markGlobalDirty("graphicParams");
    s.reset();
    const state = useSceneDirtyStore.getState();
    expect(Object.keys(state.objects).length).toBe(0);
    expect(state.global.graphicParams).toBe(false);
    expect(state.global.placementOrder).toBe(false);
    expect(state.hasAnyChanges()).toBe(false);
  });

  it("resetObject removes a single object entry", () => {
    const s = useSceneDirtyStore.getState();
    s.markObjectAdded("a");
    s.markObjectModified("b", "transform");
    s.resetObject("a");
    const state = useSceneDirtyStore.getState();
    expect("a" in state.objects).toBe(false);
    expect("b" in state.objects).toBe(true);
  });

  it("getDeletedObjects / getAddedObjects / getModifiedObjects filter correctly", () => {
    const s = useSceneDirtyStore.getState();
    s.markObjectAdded("new1");
    s.markObjectAdded("new2");
    s.markObjectModified("mod1", "material");
    s.markObjectDeleted("del1");
    const state = useSceneDirtyStore.getState();
    expect(state.getAddedObjects().sort()).toEqual(["new1", "new2"]);
    expect(state.getModifiedObjects()).toEqual(["mod1"]);
    expect(state.getDeletedObjects()).toEqual(["del1"]);
  });

  it("markObjectDeleted on a non-existent object creates deleted entry", () => {
    const s = useSceneDirtyStore.getState();
    s.markObjectDeleted("nonexistent");
    expect(useSceneDirtyStore.getState().getDeletedObjects()).toEqual(["nonexistent"]);
  });

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
});
