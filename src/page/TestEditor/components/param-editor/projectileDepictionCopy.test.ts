import { describe, expect, it } from "vitest"
import type { EffectFolderInventory, EffectFolderFileItem } from "@/services/effectFolder/effectFolderService"
import {
  createDefaultEfxbnPolicies,
  findProjectileDepictionEntryIndex,
  validateEfxbnCopyPolicies,
  formatHashLeBytes,
  isProjectileDepictionTableFileType,
  listProjectileDepictionHashRows,
  mergeProjectileDepictionEntry,
  pathsReferToSameFile,
  PROJECTILE_DEPICTION_HASH_FIELDS,
  resolveProjectileDepictionHashes,
  selectedEffectItemsFromResolutions,
  sourceResolveBlocksCopy,
  validateEfxbnCopyPolicy,
  toEffectFolderCopyEfxbnPolicies,
  previewEfxbnOutputPath,
} from "./projectileDepictionCopy"
import type { TypedParamEntry, TypedParamFile } from "./typedParamTypes"

const MAIN_EFFECT_UNSIGNED = 742107763

function makeHash(unsigned: number) {
  return {
    signed: unsigned | 0,
    unsigned: unsigned >>> 0,
    hex: `0x${(unsigned >>> 0).toString(16).toUpperCase().padStart(8, "0")}`,
  }
}

function makeEfxbn(overrides: Partial<EffectFolderFileItem> = {}): EffectFolderFileItem {
  return {
    fileIndex: 107,
    fileType: ".efxbn",
    actualExt: ".efxbn",
    fileUrl: "info/107.efxbn",
    fileBaseName: "107",
    name: "107",
    path: "E:/XB/mod/006effect/014gndm00_016jagdac_001/info/107.efxbn",
    hash: makeHash(MAIN_EFFECT_UNSIGNED),
    unk2: null,
    missing: false,
    ...overrides,
  }
}

function emptyInventory(overrides: Partial<EffectFolderInventory> = {}): EffectFolderInventory {
  return {
    effectRoot: "E:/XB/mod/006effect/014gndm00_016jagdac_001",
    structureJsonPath: "E:/XB/mod/006effect/014gndm00_016jagdac_001_structure.json",
    summary: {
      totalFiles: 1,
      efxbnCount: 1,
      modelCount: 0,
      textureCount: 0,
      unresolvedModelIds: [],
      unresolvedTextureIds: [],
      commonModelIds: [],
      commonTextureIds: [],
    },
    efxbns: [makeEfxbn()],
    models: [],
    textures: [],
    otherFiles: [],
    commonPack: null,
    warnings: [],
    ...overrides,
  }
}

function sampleEntry(): TypedParamEntry {
  return {
    entryId: 0x75516b0d,
    depictionType: 0,
    mainEffectHash: MAIN_EFFECT_UNSIGNED,
    subEffectHash: 0,
    scale: 1,
    modelHash: 0,
    trailEffectHash: 0,
    hasHitEffect: 1,
    trailLength: 0,
    soundEffectHash: 0,
    renderMode: 1,
    materialHash: 0,
    zOffset: 0,
    spawnEffectHash: 0,
    behaviorFlags: 0,
    destroyEffectHash: 0,
  }
}

function sampleFile(entries: TypedParamEntry[]): TypedParamFile {
  return {
    header: { entrySize: 60 },
    fieldSpecs: [],
    entryIds: entries.map((entry, index) => (typeof entry.entryId === "number" ? entry.entryId : index)),
    entries,
    trailingData: [],
  }
}

describe("isProjectileDepictionTableFileType", () => {
  it("is true only for projectile_depiction_table", () => {
    expect(isProjectileDepictionTableFileType("projectile_depiction_table")).toBe(true)
    expect(isProjectileDepictionTableFileType("bulletparam")).toBe(false)
  })
})

describe("listProjectileDepictionHashRows", () => {
  it("lists every hash field including zeros and skips has_hit_effect", () => {
    const rows = listProjectileDepictionHashRows(sampleEntry())
    expect(rows.map((row) => row.key)).toEqual(PROJECTILE_DEPICTION_HASH_FIELDS.map((field) => field.key))
    expect(rows.some((row) => row.key === "has_hit_effect")).toBe(false)
    expect(rows).toHaveLength(8)

    expect(rows.some((row) => row.key === "hasHitEffect" || row.key === "has_hit_effect")).toBe(false)

    const main = rows.find((row) => row.key === "mainEffectHash")
    expect(main?.unsigned).toBe(MAIN_EFFECT_UNSIGNED)
    expect(main?.hex).toBe("0x2C3BAA73")
    expect(main?.leBytes).toBe("73 AA 3B 2C")
    expect(main?.empty).toBe(false)

    const sub = rows.find((row) => row.key === "subEffectHash")
    expect(sub?.empty).toBe(true)
    expect(sub?.hex).toBe("0x00000000")
  })

  it("still reads legacy snake_case keys if a caller has not camelCased the entry", () => {
    const rows = listProjectileDepictionHashRows({
      entryId: 0x75516b0d,
      main_effect_hash: MAIN_EFFECT_UNSIGNED,
    })
    expect(rows.find((row) => row.key === "mainEffectHash")?.unsigned).toBe(MAIN_EFFECT_UNSIGNED)
  })
})

describe("formatHashLeBytes", () => {
  it("prints little-endian bytes for the user example hash", () => {
    expect(formatHashLeBytes(MAIN_EFFECT_UNSIGNED)).toBe("73 AA 3B 2C")
  })
})

describe("resolveProjectileDepictionHashes", () => {
  it("resolves mainEffectHash 742107763 to efxbn fileIndex 107", () => {
    const resolutions = resolveProjectileDepictionHashes(sampleEntry(), emptyInventory())
    const main = resolutions.find((row) => row.key === "mainEffectHash")
    expect(main?.status).toBe("resolved")
    expect(main?.efxbn?.fileIndex).toBe(107)
    expect(sourceResolveBlocksCopy(resolutions)).toBe(false)

    const selected = selectedEffectItemsFromResolutions(resolutions)
    expect(selected).toHaveLength(1)
    expect(selected[0]).toMatchObject({ category: "efxbn" })
  })

  it("errors when a non-zero efxbn hash is missing from the source pack", () => {
    const resolutions = resolveProjectileDepictionHashes(sampleEntry(), emptyInventory({ efxbns: [] }))
    const main = resolutions.find((row) => row.key === "mainEffectHash")
    expect(main?.status).toBe("error")
    expect(sourceResolveBlocksCopy(resolutions)).toBe(true)
  })

  it("treats a non-zero sound hash as informational, not a copy blocker", () => {
    const resolutions = resolveProjectileDepictionHashes(
      { ...sampleEntry(), soundEffectHash: 99 },
      emptyInventory(),
    )
    const sound = resolutions.find((row) => row.key === "soundEffectHash")
    expect(sound?.status).toBe("info")
    expect(sourceResolveBlocksCopy(resolutions)).toBe(false)
  })

  it("errors when the structure hit is missing on disk", () => {
    const resolutions = resolveProjectileDepictionHashes(
      sampleEntry(),
      emptyInventory({ efxbns: [makeEfxbn({ missing: true })] }),
    )
    expect(resolutions.find((row) => row.key === "mainEffectHash")?.status).toBe("error")
  })

  it("deep-searches modelHash and materialHash as EFXBN when those hashes live on efxbn items", () => {
    const modelHash = 0x6601eb9d
    const materialHash = 0x166b1f12
    const inventory = emptyInventory({
      efxbns: [
        makeEfxbn(),
        makeEfxbn({
          fileIndex: 64,
          name: "64",
          fileBaseName: "64",
          fileUrl: "info/64.efxbn",
          path: "E:/XB/mod/006effect/014gndm00_016jagdac_001/info/64.efxbn",
          hash: makeHash(modelHash),
        }),
        makeEfxbn({
          fileIndex: 32,
          name: "32",
          fileBaseName: "32",
          fileUrl: "info/32.efxbn",
          path: "E:/XB/mod/006effect/014gndm00_016jagdac_001/info/32.efxbn",
          hash: makeHash(materialHash),
        }),
      ],
    })
    const resolutions = resolveProjectileDepictionHashes(
      { ...sampleEntry(), modelHash, materialHash },
      inventory,
    )
    const model = resolutions.find((row) => row.key === "modelHash")
    const material = resolutions.find((row) => row.key === "materialHash")
    expect(model?.status).toBe("resolved")
    expect(model?.efxbn?.fileIndex).toBe(64)
    expect(material?.status).toBe("resolved")
    expect(material?.efxbn?.fileIndex).toBe(32)
    expect(sourceResolveBlocksCopy(resolutions)).toBe(false)

    const selected = selectedEffectItemsFromResolutions(resolutions)
    expect(
      selected
        .map((item) => (item.category === "efxbn" ? item.item.fileIndex : -1))
        .sort((left, right) => left - right),
    ).toEqual([32, 64, 107])
  })
})

describe("validateEfxbnCopyPolicy", () => {
  const destNames = new Set(["107.efxbn"])
  const destHashes = new Set([MAIN_EFFECT_UNSIGNED])
  const policy = createDefaultEfxbnPolicies([
    { category: "efxbn", item: makeEfxbn() },
  ])[0]

  it("rejects a silent copy when dest already has the name or hash", () => {
    const result = validateEfxbnCopyPolicy(policy, destNames, destHashes)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/already has this EFXBN hash/i)
  })

  it("accepts overwrite or keep when dest already has the hash", () => {
    expect(validateEfxbnCopyPolicy({ ...policy, action: "overwrite" }, destNames, destHashes).ok).toBe(true)
    expect(validateEfxbnCopyPolicy({ ...policy, action: "keep" }, destNames, destHashes).ok).toBe(true)
  })

  it("rejects a copy that keeps a dest file name already used by another hash", () => {
    const clash = validateEfxbnCopyPolicy({ ...policy, hashUnsigned: 1, destName: "107.efxbn" }, destNames, new Set())
    expect(clash.ok).toBe(false)
    expect(clash.error).toMatch(/already has this EFXBN file name/i)
  })

  it("accepts a renamed copy when dest has the name but not the hash", () => {
    const renamed = validateEfxbnCopyPolicy(
      { ...policy, destName: "107_copy.efxbn", hashUnsigned: 1 },
      destNames,
      new Set(),
    )
    expect(renamed.ok).toBe(true)
  })

  it("rejects keep when dest does not already have the hash", () => {
    expect(validateEfxbnCopyPolicy({ ...policy, action: "keep" }, destNames, new Set()).ok).toBe(false)
  })

  it("rejects path-like destination names", () => {
    const result = validateEfxbnCopyPolicy(
      { ...policy, destName: "..\\evil.efxbn", hashUnsigned: 1, action: "copy" },
      new Set(),
      new Set(),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/single file name/i)
  })

  it("rejects two copy policies that claim the same destination name", () => {
    const first = { ...policy, destName: "copied.efxbn", hashUnsigned: 1 }
    const second = { ...policy, fileIndex: 108, destName: "copied.efxbn", hashUnsigned: 2 }
    const results = validateEfxbnCopyPolicies([first, second], emptyInventory({ efxbns: [] }))
    expect(results[0]?.ok).toBe(true)
    expect(results[1]?.ok).toBe(false)
    expect(results[1]?.error).toMatch(/already uses that destination file name/i)
  })

  it("maps drafts onto rust policies", () => {
    expect(toEffectFolderCopyEfxbnPolicies([{ ...policy, action: "keep" }])).toEqual([
      { fileIndex: 107, destFileName: null, overwrite: false, skip: true },
    ])
  })
})

describe("previewEfxbnOutputPath", () => {
  const dest = emptyInventory({
    effectRoot: "E:/XB/mod/006effect/0xDEST",
    efxbns: [
      makeEfxbn({
        path: "E:/XB/mod/006effect/0xDEST/info/107.efxbn",
        hash: makeHash(MAIN_EFFECT_UNSIGNED),
      }),
    ],
  })
  const policy = createDefaultEfxbnPolicies([{ category: "efxbn", item: makeEfxbn() }])[0]

  it("predicts a new file beside existing dest efxbn files", () => {
    const preview = previewEfxbnOutputPath({ ...policy, destName: "copied.efxbn", hashUnsigned: 1 }, dest)
    expect(preview.outputPath.replace(/\//g, "\\")).toBe("E:\\XB\\mod\\006effect\\0xDEST\\info\\copied.efxbn")
    expect(preview.sourcePath).toContain("107.efxbn")
  })

  it("uses the existing dest file path for overwrite and keep", () => {
    const overwrite = previewEfxbnOutputPath({ ...policy, action: "overwrite" }, dest)
    expect(overwrite.outputPath.replace(/\//g, "\\")).toBe("E:\\XB\\mod\\006effect\\0xDEST\\info\\107.efxbn")
    const keep = previewEfxbnOutputPath({ ...policy, action: "keep" }, dest)
    expect(keep.outputPath.replace(/\//g, "\\")).toBe("E:\\XB\\mod\\006effect\\0xDEST\\info\\107.efxbn")
  })
})

describe("mergeProjectileDepictionEntry", () => {
  it("appends a new entry id and replaces an existing one", () => {
    const source = sampleEntry()
    const empty = sampleFile([])
    const appended = mergeProjectileDepictionEntry(empty, source, "append")
    expect(appended.entries).toHaveLength(1)
    expect(findProjectileDepictionEntryIndex(appended, 0x75516b0d)).toBe(0)

    const updated = { ...source, scale: 2 }
    const replaced = mergeProjectileDepictionEntry(appended, updated, "replace")
    expect(replaced.entries).toHaveLength(1)
    expect(replaced.entries[0]?.scale).toBe(2)
  })

  it("throws when replace cannot find the entry id", () => {
    expect(() => mergeProjectileDepictionEntry(sampleFile([]), sampleEntry(), "replace")).toThrow(
      /no entry 0x75516B0D/i,
    )
  })
})

describe("pathsReferToSameFile", () => {
  it("treats slash direction and trailing separators as the same Windows path", () => {
    expect(
      pathsReferToSameFile(
        "E:/XB/mod/006effect/projectile_depiction_table.bin",
        "E:\\XB\\mod\\006effect\\projectile_depiction_table.bin\\",
      ),
    ).toBe(true)
    expect(pathsReferToSameFile("E:/a.bin", "E:/b.bin")).toBe(false)
    expect(pathsReferToSameFile("", "E:/a.bin")).toBe(false)
  })
})
