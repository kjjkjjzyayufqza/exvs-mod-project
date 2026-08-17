import { describe, expect, it } from "vitest";
import {
  analyzeTextureAddCandidates,
  buildExistingTextureKeys,
  findTextureEntryForDuplicate,
  isReplaceableDuplicate,
  normalizeTextureNameKey,
  type AnalyzedAddCandidate,
  type InternalNameReader,
  type RawAddFile,
} from "./sceneTextureAddPlan";
import type { TextureManagerEntry } from "../store/sceneTextureManagerStore";

function makeEntry(overrides: Partial<TextureManagerEntry> = {}): TextureManagerEntry {
  return {
    id: `e_${Math.random().toString(36).slice(2)}`,
    filename: "diffuse.nutexb",
    status: "existing",
    scope: "model",
    infoCategory: null,
    format: "BC7_UNORM",
    width: 1024,
    height: 1024,
    sizeBytes: 0,
    referencedBy: [],
    thumbnailDataUrl: null,
    nutexbPath: "D:/stage/textures/diffuse.nutexb",
    sourceImagePath: null,
    ...overrides,
  };
}

function readerFrom(map: Record<string, string>): InternalNameReader {
  return async (path: string) => map[path] ?? null;
}

const noInternalNames: InternalNameReader = async () => null;

describe("normalizeTextureNameKey", () => {
  it("strips extension, directory, and lowercases", () => {
    expect(normalizeTextureNameKey("Diffuse.nutexb")).toBe("diffuse");
    expect(normalizeTextureNameKey("D:/stage/textures/Normal.NUTEXB")).toBe("normal");
    expect(normalizeTextureNameKey("metal.png")).toBe("metal");
    expect(normalizeTextureNameKey("  spaced.tga  ")).toBe("spaced");
  });

  it("keeps multi-dot stems intact apart from the final extension", () => {
    expect(normalizeTextureNameKey("foo.bar.nutexb")).toBe("foo.bar");
  });
});

describe("buildExistingTextureKeys", () => {
  it("indexes filenames and authoritative internal names", async () => {
    const entries = [
      makeEntry({ filename: "diffuse.nutexb", nutexbPath: "D:/t/diffuse.nutexb" }),
    ];
    const keys = await buildExistingTextureKeys(
      entries,
      readerFrom({ "D:/t/diffuse.nutexb": "stage_diffuse_albedo" }),
    );
    expect(keys.has("diffuse")).toBe(true);
    expect(keys.has("stage_diffuse_albedo")).toBe(true);
  });

  it("does not index info folder textures for model texture additions", async () => {
    const entries = [
      makeEntry({
        filename: "fog_lut.nutexb",
        nutexbPath: "D:/stage/info/fog/fog_lut.nutexb",
        scope: "info",
        infoCategory: "fog",
      }),
    ];
    const keys = await buildExistingTextureKeys(entries, readerFrom({
      "D:/stage/info/fog/fog_lut.nutexb": "fog_lut",
    }));
    expect(keys.has("fog_lut")).toBe(false);
  });
});

describe("analyzeTextureAddCandidates", () => {
  it("flags a candidate whose base name matches an existing texture", async () => {
    const entries = [makeEntry({ filename: "diffuse.nutexb" })];
    const files: RawAddFile[] = [
      { sourcePath: "C:/in/diffuse.png", filename: "diffuse.png" },
    ];
    const [candidate] = await analyzeTextureAddCandidates(files, entries, noInternalNames);
    expect(candidate.duplicate).toBe(true);
    expect(candidate.duplicateReason).toBe("filename");
    expect(candidate.duplicateOf).toBe("diffuse.nutexb");
  });

  it("ignores file extension when comparing names", async () => {
    const entries = [makeEntry({ filename: "normal.nutexb" })];
    const files: RawAddFile[] = [
      { sourcePath: "C:/in/normal.tga", filename: "normal.tga" },
    ];
    const [candidate] = await analyzeTextureAddCandidates(files, entries, noInternalNames);
    expect(candidate.duplicate).toBe(true);
  });

  it("flags a nutexb candidate whose internal name matches an existing texture", async () => {
    // Existing texture file is named on disk differently from its internal name.
    const entries = [
      makeEntry({ filename: "tex_0001.nutexb", nutexbPath: "D:/t/tex_0001.nutexb" }),
    ];
    const files: RawAddFile[] = [
      { sourcePath: "C:/in/renamed.nutexb", filename: "renamed.nutexb" },
    ];
    const reader = readerFrom({
      "D:/t/tex_0001.nutexb": "shared_grass",
      "C:/in/renamed.nutexb": "shared_grass",
    });
    const [candidate] = await analyzeTextureAddCandidates(files, entries, reader);
    expect(candidate.duplicate).toBe(true);
    expect(candidate.duplicateReason).toBe("internal-name");
  });

  it("flags the second of two same-named candidates in one batch", async () => {
    const files: RawAddFile[] = [
      { sourcePath: "C:/a/grass.png", filename: "grass.png" },
      { sourcePath: "C:/b/grass.dds", filename: "grass.dds" },
    ];
    const [first, second] = await analyzeTextureAddCandidates(files, [], noInternalNames);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.duplicateReason).toBe("batch-duplicate");
  });

  it("accepts a unique candidate", async () => {
    const entries = [makeEntry({ filename: "diffuse.nutexb" })];
    const files: RawAddFile[] = [
      { sourcePath: "C:/in/specular.png", filename: "specular.png" },
    ];
    const [candidate] = await analyzeTextureAddCandidates(files, entries, noInternalNames);
    expect(candidate.duplicate).toBe(false);
    expect(candidate.duplicateReason).toBeNull();
    expect(candidate.nutexbFilename).toBe("specular.nutexb");
    expect(candidate.isNutexb).toBe(false);
  });

  it("marks nutexb candidates and records their internal name", async () => {
    const files: RawAddFile[] = [
      { sourcePath: "C:/in/cliff.nutexb", filename: "cliff.nutexb" },
    ];
    const [candidate] = await analyzeTextureAddCandidates(
      files,
      [],
      readerFrom({ "C:/in/cliff.nutexb": "cliff_internal" }),
    );
    expect(candidate.isNutexb).toBe(true);
    expect(candidate.internalName).toBe("cliff_internal");
    expect(candidate.duplicate).toBe(false);
  });
});

describe("isReplaceableDuplicate / findTextureEntryForDuplicate", () => {
  function makeCandidate(
    overrides: Partial<AnalyzedAddCandidate> = {},
  ): AnalyzedAddCandidate {
    return {
      id: "C:/in/a.png",
      sourcePath: "C:/in/a.png",
      filename: "a.png",
      nutexbFilename: "a.nutexb",
      isNutexb: false,
      internalName: null,
      duplicate: true,
      duplicateReason: "filename",
      duplicateOf: "diffuse.nutexb",
      ...overrides,
    };
  }

  it("treats filename and internal-name collisions as replaceable", () => {
    expect(
      isReplaceableDuplicate(makeCandidate({ duplicateReason: "filename" })),
    ).toBe(true);
    expect(
      isReplaceableDuplicate(makeCandidate({ duplicateReason: "internal-name" })),
    ).toBe(true);
  });

  it("does not allow batch-duplicate or unique rows to replace", () => {
    expect(
      isReplaceableDuplicate(makeCandidate({ duplicateReason: "batch-duplicate" })),
    ).toBe(false);
    expect(
      isReplaceableDuplicate(
        makeCandidate({ duplicate: false, duplicateReason: null, duplicateOf: null }),
      ),
    ).toBe(false);
  });

  it("resolves the existing model entry by duplicateOf filename", () => {
    const entries = [
      makeEntry({ id: "e1", filename: "diffuse.nutexb", scope: "model" }),
      makeEntry({
        id: "info1",
        filename: "diffuse.nutexb",
        scope: "info",
        infoCategory: "fog",
      }),
    ];
    const found = findTextureEntryForDuplicate(
      entries,
      makeCandidate({ duplicateOf: "diffuse.nutexb" }),
    );
    expect(found?.id).toBe("e1");
  });

  it("returns null when no matching model entry exists", () => {
    const found = findTextureEntryForDuplicate(
      [makeEntry({ filename: "other.nutexb" })],
      makeCandidate({ duplicateOf: "missing.nutexb" }),
    );
    expect(found).toBeNull();
  });
});
