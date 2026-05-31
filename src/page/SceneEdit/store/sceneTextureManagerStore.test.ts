import { describe, expect, it, beforeEach } from "vitest";
import {
  useSceneTextureManagerStore,
  findEntryByFilename,
  type TextureManagerEntry,
} from "./sceneTextureManagerStore";

function makeEntry(
  overrides: Partial<TextureManagerEntry> = {}
): TextureManagerEntry {
  return {
    id: `test_${Math.random().toString(36).slice(2)}`,
    filename: "diffuse.nutexb",
    status: "existing",
    format: "BC7_UNORM",
    width: 1024,
    height: 1024,
    sizeBytes: 5242880,
    referencedBy: ["base"],
    thumbnailDataUrl: null,
    nutexbPath: "D:/stage/textures/diffuse.nutexb",
    sourceImagePath: null,
    ...overrides,
  };
}

describe("sceneTextureManagerStore", () => {
  beforeEach(() => {
    useSceneTextureManagerStore.getState().clear();
  });

  it("has correct initial state", () => {
    const state = useSceneTextureManagerStore.getState();
    expect(state.entries).toEqual([]);
    expect(state.selectedId).toBeNull();
    expect(state.searchQuery).toBe("");
  });

  it("setEntries sets entries array", () => {
    const entries = [makeEntry({ id: "a" }), makeEntry({ id: "b" })];
    useSceneTextureManagerStore.getState().setEntries(entries);
    expect(useSceneTextureManagerStore.getState().entries).toEqual(entries);
  });

  it("addEntry appends new entry", () => {
    const e1 = makeEntry({ id: "a" });
    const e2 = makeEntry({ id: "b" });
    const { addEntry } = useSceneTextureManagerStore.getState();
    addEntry(e1);
    addEntry(e2);
    const ids = useSceneTextureManagerStore.getState().entries.map((e) => e.id);
    expect(ids).toEqual(["a", "b"]);
  });

  it("removeEntry removes by id", () => {
    useSceneTextureManagerStore
      .getState()
      .setEntries([makeEntry({ id: "a" }), makeEntry({ id: "b" })]);
    useSceneTextureManagerStore.getState().removeEntry("a");
    const ids = useSceneTextureManagerStore.getState().entries.map((e) => e.id);
    expect(ids).toEqual(["b"]);
  });

  it("removeEntry clears selectedId if removed entry was selected", () => {
    useSceneTextureManagerStore.getState().setEntries([makeEntry({ id: "a" })]);
    useSceneTextureManagerStore.getState().setSelectedId("a");
    useSceneTextureManagerStore.getState().removeEntry("a");
    expect(useSceneTextureManagerStore.getState().selectedId).toBeNull();
  });

  it("removeEntry keeps selectedId if different entry removed", () => {
    useSceneTextureManagerStore
      .getState()
      .setEntries([makeEntry({ id: "a" }), makeEntry({ id: "b" })]);
    useSceneTextureManagerStore.getState().setSelectedId("a");
    useSceneTextureManagerStore.getState().removeEntry("b");
    expect(useSceneTextureManagerStore.getState().selectedId).toBe("a");
  });

  it("replaceEntry partially updates entry by id", () => {
    useSceneTextureManagerStore
      .getState()
      .setEntries([makeEntry({ id: "a", width: 512 })]);
    useSceneTextureManagerStore.getState().replaceEntry("a", { width: 2048 });
    expect(useSceneTextureManagerStore.getState().entries[0].width).toBe(2048);
  });

  it("setSelectedId updates selectedId", () => {
    useSceneTextureManagerStore.getState().setSelectedId("x");
    expect(useSceneTextureManagerStore.getState().selectedId).toBe("x");
  });

  it("setSearchQuery updates searchQuery", () => {
    useSceneTextureManagerStore.getState().setSearchQuery("normal");
    expect(useSceneTextureManagerStore.getState().searchQuery).toBe("normal");
  });

  it("setThumbnail updates thumbnailDataUrl for specific entry", () => {
    useSceneTextureManagerStore
      .getState()
      .setEntries([makeEntry({ id: "a" }), makeEntry({ id: "b" })]);
    useSceneTextureManagerStore.getState().setThumbnail("b", "data:image/png;base64,abc");
    const state = useSceneTextureManagerStore.getState();
    expect(state.entries[0].thumbnailDataUrl).toBeNull();
    expect(state.entries[1].thumbnailDataUrl).toBe("data:image/png;base64,abc");
  });

  it("updateReferences updates referencedBy for specific entry", () => {
    useSceneTextureManagerStore
      .getState()
      .setEntries([makeEntry({ id: "a", referencedBy: ["old"] })]);
    useSceneTextureManagerStore.getState().updateReferences("a", ["mat1", "mat2"]);
    expect(useSceneTextureManagerStore.getState().entries[0].referencedBy).toEqual([
      "mat1",
      "mat2",
    ]);
  });

  it("clear resets everything", () => {
    useSceneTextureManagerStore.getState().setEntries([makeEntry({ id: "a" })]);
    useSceneTextureManagerStore.getState().setSelectedId("a");
    useSceneTextureManagerStore.getState().setSearchQuery("test");
    useSceneTextureManagerStore.getState().removeEntry("a");
    useSceneTextureManagerStore.getState().clear();
    const state = useSceneTextureManagerStore.getState();
    expect(state.entries).toEqual([]);
    expect(state.selectedId).toBeNull();
    expect(state.searchQuery).toBe("");
    expect(state.removedExisting).toEqual([]);
  });

  it("removeEntry records an existing texture for deletion on save", () => {
    useSceneTextureManagerStore
      .getState()
      .setEntries([
        makeEntry({ id: "a", status: "existing", filename: "diffuse.nutexb", nutexbPath: "D:/t/diffuse.nutexb" }),
      ]);
    useSceneTextureManagerStore.getState().removeEntry("a");
    expect(useSceneTextureManagerStore.getState().removedExisting).toEqual([
      { filename: "diffuse.nutexb", nutexbPath: "D:/t/diffuse.nutexb" },
    ]);
  });

  it("removeEntry does not record an added texture", () => {
    useSceneTextureManagerStore
      .getState()
      .setEntries([makeEntry({ id: "a", status: "added", nutexbPath: "D:/tmp/new.nutexb" })]);
    useSceneTextureManagerStore.getState().removeEntry("a");
    expect(useSceneTextureManagerStore.getState().removedExisting).toEqual([]);
  });

  it("removeEntry does not record the same filename twice", () => {
    useSceneTextureManagerStore
      .getState()
      .setEntries([
        makeEntry({ id: "a", status: "existing", filename: "shared.nutexb" }),
        makeEntry({ id: "b", status: "existing", filename: "Shared.nutexb" }),
      ]);
    useSceneTextureManagerStore.getState().removeEntry("a");
    useSceneTextureManagerStore.getState().removeEntry("b");
    expect(useSceneTextureManagerStore.getState().removedExisting).toHaveLength(1);
  });

  it("markTexturesSaved promotes added entries and clears removals", () => {
    useSceneTextureManagerStore
      .getState()
      .setEntries([
        makeEntry({ id: "a", status: "existing", filename: "old.nutexb" }),
        makeEntry({ id: "b", status: "added", filename: "new.nutexb" }),
      ]);
    useSceneTextureManagerStore.getState().removeEntry("a");
    useSceneTextureManagerStore.getState().markTexturesSaved();
    const state = useSceneTextureManagerStore.getState();
    expect(state.entries.every((e) => e.status === "existing")).toBe(true);
    expect(state.removedExisting).toEqual([]);
  });
});

describe("findEntryByFilename", () => {
  it("finds entry case-insensitively", () => {
    const entries = [makeEntry({ id: "a", filename: "Diffuse.nutexb" })];
    expect(findEntryByFilename(entries, "diffuse.nutexb")?.id).toBe("a");
    expect(findEntryByFilename(entries, "DIFFUSE.NUTEXB")?.id).toBe("a");
  });

  it("returns undefined when not found", () => {
    const entries = [makeEntry({ filename: "normal.nutexb" })];
    expect(findEntryByFilename(entries, "missing.nutexb")).toBeUndefined();
  });
});
