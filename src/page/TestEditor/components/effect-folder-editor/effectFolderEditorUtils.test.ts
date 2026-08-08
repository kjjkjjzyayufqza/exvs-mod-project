import { describe, expect, it } from "vitest";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import type { EfxbnEffectSummary } from "@/services/effectFolder/effectFolderService";
import "./EffectFolderCopyDialog";
import { makeEfxbnEffectBlock } from "./efxbnTestFactory";
import {
  buildEffectFolderCopyPlan,
  effectListItemKey,
  filterEffectListItems,
  formatEffectFolderHash,
  parseHashInput,
  effectFolderHashMatchesQuery,
  resolveEffectPackFromFolderPath,
  resolveEffectPackFromStructureJson,
  toEffectFolderSelections,
  type EffectListItem,
} from "./effectFolderEditorUtils";

describe("formatEffectFolderHash", () => {
  it("shows hex and signed int32 together", () => {
    expect(formatEffectFolderHash({ signed: -1111592982, unsigned: 3183374314, hex: "0xBDBE6FEA" })).toBe(
      "0xBDBE6FEA (-1111592982)",
    );
  });
});

describe("effectFolderHashMatchesQuery", () => {
  const hash = { signed: -1111592982, unsigned: 3183374314, hex: "0xBDBE6FEA" };

  it("matches hex and decimal queries", () => {
    expect(effectFolderHashMatchesQuery(hash, "bdbe6fea")).toBe(true);
    expect(effectFolderHashMatchesQuery(hash, "-1111592982")).toBe(true);
    expect(effectFolderHashMatchesQuery(hash, "missing")).toBe(false);
  });
});

describe("parseHashInput", () => {
  it("parses hex and decimal hash inputs", () => {
    expect(parseHashInput("0xBDBE6FEA")).toBe(-1111592982);
    expect(parseHashInput("-1111592982")).toBe(-1111592982);
    expect(parseHashInput("")).toBeNull();
    expect(parseHashInput("not-a-hash")).toBeNull();
  });
});

describe("resolveEffectPackFromStructureJson", () => {
  it("resolves configured effect pack from sibling structure json", () => {
    const pack = resolveEffectPackFromStructureJson(
      "E:/workspace",
      "E:/workspace/006effect/0xBDBE6FEA_structure.json",
      DEFAULT_TEST_EDITOR_WORKSPACE,
    );

    expect(pack).not.toBeNull();
    expect(pack?.routeId).toBe("unit.effect");
    expect(pack?.folderPath.replace(/\\/g, "/")).toBe("E:/workspace/006effect/0xBDBE6FEA");
  });
});

describe("resolveEffectPackFromFolderPath", () => {
  it("resolves an effect pack directly from its folder path", () => {
    const pack = resolveEffectPackFromFolderPath(
      "E:/workspace",
      "E:/workspace/006effect/0xBDBE6FEA",
      DEFAULT_TEST_EDITOR_WORKSPACE,
    );

    expect(pack).not.toBeNull();
    expect(pack?.routeId).toBe("unit.effect");
    expect(pack?.folderPath.replace(/\\/g, "/")).toBe("E:/workspace/006effect/0xBDBE6FEA");
    expect(pack?.structureJsonPath.replace(/\\/g, "/")).toBe(
      "E:/workspace/006effect/0xBDBE6FEA_structure.json",
    );
  });
});

describe("effect list helpers", () => {
  const efxbnItem: EffectListItem = {
    category: "efxbn",
    item: {
      fileIndex: 3,
      fileType: ".efxbn",
      actualExt: ".efxbn",
      fileUrl: "info/effect_a.efxbn",
      fileBaseName: "effect_a",
      name: "effect_a",
      path: "E:/workspace/006effect/0xHASH/info/effect_a.efxbn",
      hash: { signed: 123, unsigned: 123, hex: "0x0000007B" },
      unk2: "00000000",
      missing: false,
    },
  };

  it("builds stable keys and selections", () => {
    expect(effectListItemKey(efxbnItem)).toBe("efxbn:3");
    expect(toEffectFolderSelections([efxbnItem])).toEqual([{ kind: "efxbn", fileIndex: 3 }]);
  });

  it("filters by label and path", () => {
    expect(filterEffectListItems([efxbnItem], "effect_a")).toHaveLength(1);
    expect(filterEffectListItems([efxbnItem], "missing-term")).toHaveLength(0);
  });
});

describe("buildEffectFolderCopyPlan", () => {
  const modelHash = { signed: 100, unsigned: 100, hex: "0x00000064" };
  const textureHash = { signed: 101, unsigned: 101, hex: "0x00000065" };
  const efxbnHash = { signed: 200, unsigned: 200, hex: "0x000000C8" };

  const modelItem: EffectListItem = {
    category: "models",
    model: {
      name: "model_a",
      hash: modelHash,
      entryIndex: 1,
      folderUnk3: 0,
      files: [
        {
          fileIndex: 10,
          fileType: ".numdlb",
          actualExt: ".numdlb",
          fileUrl: "models/model_a/model.numdlb",
          fileBaseName: "model",
          name: "model.numdlb",
          path: "E:/src/models/model_a/model.numdlb",
          hash: null,
          unk2: null,
          missing: false,
        },
      ],
      missingRequiredExts: [],
      materialTextureIds: [textureHash],
    },
  };

  const textureItem: EffectListItem = {
    category: "textures",
    item: {
      fileIndex: 5,
      fileType: ".nutexb",
      actualExt: ".nutexb",
      fileUrl: "tex/tex_a.nutexb",
      fileBaseName: "tex_a",
      name: "tex_a",
      path: "E:/src/tex/tex_a.nutexb",
      hash: textureHash,
      unk2: null,
      missing: false,
    },
  };

  const efxbnWithRefs: EffectListItem = {
    category: "efxbn",
    item: {
      fileIndex: 3,
      fileType: ".efxbn",
      actualExt: ".efxbn",
      fileUrl: "info/effect_a.efxbn",
      fileBaseName: "effect_a",
      name: "effect_a",
      path: "E:/src/info/effect_a.efxbn",
      hash: efxbnHash,
      unk2: null,
      missing: false,
      efxbn: {
        path: "E:/src/info/effect_a.efxbn",
        magic: "EFXB",
        versionOrFlags: 0,
        fileSize: 0,
        actualSize: 0,
        effectCount: 1,
        curveKeyCount: 0,
        controlLookupRegionOffset: 0,
        controlLookupRegionSize: 0,
        controlLookupRegionEnd: 0,
        modelControlConfigCount: 0,
        modelControlRegionOffset: 0,
        modelControlRegionSize: 0,
        trailingOffset: 0,
        modelIds: [modelHash],
        animationIds: [],
        modelControlTextureIds: [],
        controlLookupEntries: [],
        effects: [],
        modelControls: [],
        textureParameters: [],
        todo: { unknowns: [] },
      },
    },
  };

  it("includes an efxbn, its source model, and the model material texture", () => {
    const plan = buildEffectFolderCopyPlan({
      selectedItems: [efxbnWithRefs],
      allItems: [efxbnWithRefs, modelItem, textureItem],
    });

    expect(plan.summary.selectedCount).toBe(1);
    expect(plan.summary.efxbnCount).toBe(1);
    expect(plan.summary.modelCount).toBe(1);
    expect(plan.summary.textureCount).toBe(1);
    expect(plan.dependencies).toHaveLength(2);
    expect(plan.transferFiles.length).toBeGreaterThanOrEqual(3);
    expect(plan.warnings).toHaveLength(0);
  });

  it("does not treat control-reference lookup indexes as fileIndex dependencies", () => {
    const modelFileIndex = 10;
    const textureFileIndex = 5;
    const efxbnWithIdTable: EffectListItem = {
      category: "efxbn",
      item: {
        ...efxbnWithRefs.item,
        efxbn: {
          ...efxbnWithRefs.item.efxbn!,
          modelIds: [],
          modelControlTextureIds: [],
          effects: [
            makeEfxbnEffectBlock({
              index: 0,
              idTable: [
                { flag: 1, id: textureFileIndex },
                { flag: 1, id: modelFileIndex },
                { flag: 1, id: 0 },
              ],
            }),
          ],
        },
      },
    };

    const plan = buildEffectFolderCopyPlan({
      selectedItems: [efxbnWithIdTable],
      allItems: [efxbnWithIdTable, modelItem, textureItem],
    });

    expect(plan.summary.modelCount).toBe(0);
    expect(plan.summary.textureCount).toBe(0);
    expect(plan.dependencies).toHaveLength(0);
    expect(plan.warnings).toHaveLength(0);
  });

  it("includes model-control texture hashes", () => {
    const controlTexHash = textureHash;
    const efxbnWithControlTex: EffectListItem = {
      category: "efxbn",
      item: {
        ...efxbnWithRefs.item,
        efxbn: {
          ...efxbnWithRefs.item.efxbn!,
          modelIds: [],
          modelControlTextureIds: [controlTexHash],
          effects: [],
        },
      },
    };

    const plan = buildEffectFolderCopyPlan({
      selectedItems: [efxbnWithControlTex],
      allItems: [efxbnWithControlTex, textureItem],
    });

    expect(plan.summary.textureCount).toBe(1);
    expect(plan.dependencies[0]?.category).toBe("texture");
  });

  it("keeps a content-detected NUANMB in the EFXBN closure when it is also selected", () => {
    const animationHash = { signed: 300, unsigned: 300, hex: "0x0000012C" };
    const animationItem: EffectListItem = {
      category: "other",
      item: {
        fileIndex: 8,
        fileType: ".efxbn",
        actualExt: ".nuanmb",
        fileUrl: "animations/129.efxbn",
        fileBaseName: "129",
        name: "129.efxbn",
        path: "E:/src/animations/129.efxbn",
        hash: animationHash,
        unk2: null,
        missing: false,
      },
    };
    const efxbnWithAnimation: EffectListItem = {
      category: "efxbn",
      item: {
        ...efxbnWithRefs.item,
        efxbn: {
          ...efxbnWithRefs.item.efxbn!,
          modelIds: [],
          animationIds: [animationHash],
        },
      },
    };

    const plan = buildEffectFolderCopyPlan({
      selectedItems: [efxbnWithAnimation, animationItem],
      allItems: [efxbnWithAnimation, animationItem],
    });

    expect(plan.summary.animationCount).toBe(1);
    expect(plan.summary.unsupportedCount).toBe(1);
    expect(plan.dependencies).toHaveLength(1);
    expect(plan.dependencies[0]?.category).toBe("animation");
    expect(plan.dependencies[0]?.files[0]).toMatchObject({
      name: "129.efxbn",
      actualExt: ".nuanmb",
    });
    expect(plan.transferFiles.map((file) => file.category)).toEqual(["efxbn", "animation"]);
  });

  it("ignores resource IDs absent from the source inventory as global", () => {
    const plan = buildEffectFolderCopyPlan({
      selectedItems: [efxbnWithRefs],
      allItems: [efxbnWithRefs, textureItem],
    });

    expect(plan.summary.modelCount).toBe(0);
    expect(plan.summary.textureCount).toBe(0);
    expect(plan.warnings).toHaveLength(0);
  });

  it("marks unsupported other selections and warns", () => {
    const other: EffectListItem = {
      category: "other",
      item: {
        fileIndex: 9,
        fileType: ".bin",
        actualExt: ".bin",
        fileUrl: "misc/data.bin",
        fileBaseName: "data",
        name: "data",
        path: "E:/src/misc/data.bin",
        hash: null,
        unk2: null,
        missing: false,
      },
    };
    const plan = buildEffectFolderCopyPlan({
      selectedItems: [other],
      allItems: [other],
    });

    expect(plan.summary.unsupportedCount).toBe(1);
    expect(plan.summary.transferFileCount).toBe(0);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });
});
