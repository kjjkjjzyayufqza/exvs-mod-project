import { describe, expect, it, beforeEach } from "vitest";
import { collectTextureSaveManifest } from "./sceneTextureSaveCollector";
import { useSceneTextureManagerStore, type TextureManagerEntry } from "../store/sceneTextureManagerStore";

function makeEntry(overrides: Partial<TextureManagerEntry> = {}): TextureManagerEntry {
  return {
    id: `test_${Math.random().toString(36).slice(2)}`,
    filename: "test.nutexb",
    status: "existing",
    scope: "model",
    infoCategory: null,
    format: "BC7_UNORM",
    width: 512,
    height: 512,
    sizeBytes: 1048576,
    referencedBy: [],
    thumbnailDataUrl: null,
    nutexbPath: "D:/stage/textures/test.nutexb",
    sourceImagePath: null,
    ...overrides,
  };
}

describe("sceneTextureSaveCollector", () => {
  beforeEach(() => {
    useSceneTextureManagerStore.getState().clear();
  });

  it("returns empty manifest when store is empty", () => {
    const manifest = collectTextureSaveManifest();
    expect(manifest.existing).toEqual([]);
    expect(manifest.added).toEqual([]);
    expect(manifest.removed).toEqual([]);
  });

  it("collects removed existing textures pending deletion", () => {
    useSceneTextureManagerStore
      .getState()
      .setEntries([
        makeEntry({ id: "e1", status: "existing", filename: "diffuse.nutexb", nutexbPath: "D:/t/diffuse.nutexb" }),
      ]);
    useSceneTextureManagerStore.getState().removeEntry("e1");
    const manifest = collectTextureSaveManifest();
    expect(manifest.removed).toEqual([
      { filename: "diffuse.nutexb", nutexbPath: "D:/t/diffuse.nutexb" },
    ]);
  });

  it("collects existing entries with nutexbPath", () => {
    const entry = makeEntry({ id: "e1", filename: "diffuse.nutexb", nutexbPath: "D:/textures/diffuse.nutexb" });
    useSceneTextureManagerStore.getState().setEntries([entry]);
    const manifest = collectTextureSaveManifest();
    expect(manifest.existing).toEqual([{ filename: "diffuse.nutexb", nutexbPath: "D:/textures/diffuse.nutexb" }]);
    expect(manifest.added).toEqual([]);
  });

  it("skips existing entries with null nutexbPath", () => {
    const entry = makeEntry({ id: "e1", status: "existing", nutexbPath: null });
    useSceneTextureManagerStore.getState().setEntries([entry]);
    const manifest = collectTextureSaveManifest();
    expect(manifest.existing).toEqual([]);
  });

  it("collects added entries", () => {
    const entry = makeEntry({
      id: "a1",
      filename: "new_tex.nutexb",
      status: "added",
      nutexbPath: "D:/tmp/new_tex.nutexb",
      sourceImagePath: "D:/output/new_tex.png",
    });
    useSceneTextureManagerStore.getState().setEntries([entry]);
    const manifest = collectTextureSaveManifest();
    expect(manifest.existing).toEqual([]);
    expect(manifest.added).toEqual([{ filename: "new_tex.nutexb", nutexbPath: "D:/tmp/new_tex.nutexb", sourceImagePath: "D:/output/new_tex.png" }]);
  });

  it("handles mixed entries correctly", () => {
    useSceneTextureManagerStore.getState().setEntries([
      makeEntry({ id: "e1", filename: "existing1.nutexb", status: "existing", nutexbPath: "D:/a.nutexb" }),
      makeEntry({ id: "e2", filename: "existing2.nutexb", status: "existing", nutexbPath: null }),
      makeEntry({ id: "a1", filename: "added1.nutexb", status: "added", nutexbPath: null, sourceImagePath: "D:/img.png" }),
    ]);
    const manifest = collectTextureSaveManifest();
    expect(manifest.existing).toHaveLength(1);
    expect(manifest.existing[0].filename).toBe("existing1.nutexb");
    expect(manifest.added).toHaveLength(1);
    expect(manifest.added[0].filename).toBe("added1.nutexb");
  });

  it("does not collect info folder textures into the model texture manifest", () => {
    useSceneTextureManagerStore.getState().setEntries([
      makeEntry({
        id: "info1",
        filename: "fog_lut.nutexb",
        scope: "info",
        infoCategory: "fog",
        nutexbPath: "D:/stage/info/fog/fog_lut.nutexb",
      }),
      makeEntry({
        id: "model1",
        filename: "wall.nutexb",
        nutexbPath: "D:/stage/textures/wall.nutexb",
      }),
    ]);
    const manifest = collectTextureSaveManifest();
    expect(manifest.existing).toEqual([
      { filename: "wall.nutexb", nutexbPath: "D:/stage/textures/wall.nutexb" },
    ]);
    expect(manifest.added).toEqual([]);
  });
});
