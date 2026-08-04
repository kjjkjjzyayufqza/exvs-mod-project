import { describe, expect, it } from "vitest";
import type {
  EffectFolderFileItem,
  EffectFolderHash,
  EffectFolderInventory,
  EffectFolderModel,
  EfxbnSummary,
} from "@/services/effectFolder/effectFolderService";
import "./EffectFolder3dPreview";
import {
  buildEffectFolderPreviewPlan,
  evaluateEfxbnControl,
  evaluateEfxbnUvTransform,
} from "./effectFolderPreviewPlan";

function hash(signed: number): EffectFolderHash {
  return {
    signed,
    unsigned: signed >>> 0,
    hex: `0x${(signed >>> 0).toString(16).toUpperCase().padStart(8, "0")}`,
  };
}

function file(
  path: string,
  actualExt: string,
  fileHash: EffectFolderHash | null = null,
): EffectFolderFileItem {
  return {
    fileIndex: 0,
    fileType: actualExt,
    actualExt,
    fileUrl: "",
    fileBaseName: path,
    name: path,
    path,
    hash: fileHash,
    unk2: null,
    missing: false,
  };
}

function model(modelHash: EffectFolderHash, numdlbPath: string): EffectFolderModel {
  return {
    name: modelHash.hex,
    hash: modelHash,
    entryIndex: 0,
    folderUnk3: 0,
    files: [file(numdlbPath, ".numdlb")],
    missingRequiredExts: [],
  };
}

function inventory(
  models: EffectFolderModel[],
  otherFiles: EffectFolderFileItem[],
  textures: EffectFolderFileItem[] = [],
): EffectFolderInventory {
  return {
    effectRoot: "E:\\effect",
    structureJsonPath: "E:\\effect_structure.json",
    summary: {
      totalFiles: 0,
      efxbnCount: 0,
      modelCount: models.length,
      textureCount: 0,
      unresolvedModelIds: [],
    },
    efxbns: [],
    models,
    textures,
    otherFiles,
    warnings: [],
  };
}

describe("buildEffectFolderPreviewPlan", () => {
  it("preserves repeated effect instances and resolves only source-local models and animations", () => {
    const localModelHash = hash(101);
    const externalModelHash = hash(202);
    const localAnimationHash = hash(303);
    const externalAnimationHash = hash(404);
    const localModel = model(localModelHash, "E:\\effect\\model\\main.numdlb");
    const localAnimation = file("E:\\effect\\motion\\main.nuanmb", "nuanmb", localAnimationHash);
    const summary = {
      effects: [
        { index: 0, modelHash: localModelHash, animationHash: localAnimationHash, modelControlIndices: [-1, -1, -1, -1] },
        { index: 1, modelHash: localModelHash, animationHash: hash(0), modelControlIndices: [-1, -1, -1, -1] },
        { index: 2, modelHash: externalModelHash, animationHash: externalAnimationHash, modelControlIndices: [-1, -1, -1, -1] },
      ],
      modelControls: [],
      controlLookupEntries: [],
      textureParameters: [],
    } as unknown as EfxbnSummary;
    const efxbnFile = { ...file("E:\\effect\\167.efxbn", "efxbn", hash(167)), efxbn: summary };

    const plan = buildEffectFolderPreviewPlan(
      { category: "efxbn", item: efxbnFile },
      inventory([localModel], [localAnimation]),
    );

    expect(plan?.targets.map((target) => target.effectIndex)).toEqual([0, 1]);
    expect(plan?.targets.map((target) => target.modelPath)).toEqual([
      localModel.files[0].path,
      localModel.files[0].path,
    ]);
    expect(plan?.targets[0].animationPath).toBe(localAnimation.path);
    expect(plan?.targets[1].animationPath).toBeNull();
    expect(plan?.unresolvedModelHashes).toEqual([externalModelHash]);
    expect(plan?.unresolvedAnimationHashes).toEqual([externalAnimationHash]);
  });

  it("evaluates direct and clamped linear EFXBN controls on the runtime 0 to 100 scale", () => {
    const entries = [
      { index: 0, keyF32Bits: 0, key: 0, valueF32Bits: 0, value: 2 },
      { index: 1, keyF32Bits: 0, key: 50, valueF32Bits: 0, value: 6 },
      { index: 2, keyF32Bits: 0, key: 100, valueF32Bits: 0, value: 4 },
    ];
    const reference = {
      index: 12,
      name: "ctrl12",
      rawOffset: 0xb0,
      runtimeOffset: 0xb8,
      selector: 3,
      lookupIndex: 0,
    };

    expect(evaluateEfxbnControl({ ...reference, selector: 1, lookupIndex: 1 }, entries, 25)).toBe(6);
    expect(evaluateEfxbnControl(reference, entries, -10)).toBe(2);
    expect(evaluateEfxbnControl(reference, entries, 25)).toBe(4);
    expect(evaluateEfxbnControl(reference, entries, 75)).toBe(5);
    expect(evaluateEfxbnControl(reference, entries, 120)).toBe(4);
  });

  it("binds effect model-control slots to source-local texture files", () => {
    const textureHash = hash(505);
    const textureFile = file("E:\\effect\\texture\\flare.nutexb", "nutexb", textureHash);
    const parameter = {
      index: 0,
      colorMapHash: textureHash,
    };
    const summary = {
      effects: [
        {
          index: 0,
          modelHash: hash(0),
          animationHash: hash(0),
          modelControlIndices: [0, -1, -1, -1],
        },
      ],
      modelControls: [parameter],
      controlLookupEntries: [],
      textureParameters: [parameter],
    } as unknown as EfxbnSummary;
    const efxbnFile = { ...file("E:\\effect\\flare.efxbn", "efxbn"), efxbn: summary };

    const plan = buildEffectFolderPreviewPlan(
      { category: "efxbn", item: efxbnFile },
      inventory([], [], [textureFile]),
    );

    expect(plan?.textureBindings).toHaveLength(1);
    expect(plan?.textureBindings[0]).toMatchObject({
      effectIndex: 0,
      controlIndex: 0,
      file: textureFile,
    });
    expect(plan?.localTextureCount).toBe(1);
    expect(plan?.unresolvedTextureHashes).toEqual([]);
  });

  it("reconstructs shader atlas, scroll, and reverse UV transforms", () => {
    const base = {
      textureWidth: 256,
      textureHeight: 128,
      uvPatternType: 2,
      uvAnimationFrameNum: 8,
      uvAnimationFrameWidth: 64,
      uvAnimationFrameHeight: 64,
      uvAnimationFrameNumByLine: 4,
      uvAnimationFrameTime: 2,
      uvAnimationStartFrame: 1,
      uvScrollSpeed: 0,
      uvScrollLimit: 0,
      uvScrollDirection: 0,
      uvU: [0, 256, 256, 0],
      uvV: [0, 0, 128, 128],
      uvScrollModelSpeedU: 0,
      uvScrollModelSpeedV: 0,
      textureSettingFlags: 0,
      uvRandomOffsetU: 0,
      uvRandomOffsetV: 0,
      reverseU: 0,
      reverseV: 0,
    } as EfxbnSummary["modelControls"][number];

    expect(evaluateEfxbnUvTransform(base, 4)).toEqual({
      scale: [0.25, 0.5],
      offset: [0.5, 0],
    });
    expect(evaluateEfxbnUvTransform({ ...base, reverseU: 1, reverseV: 1 }, 4)).toEqual({
      scale: [-0.25, -0.5],
      offset: [0.75, 0.5],
    });
    expect(evaluateEfxbnUvTransform({
      ...base,
      uvPatternType: 1,
      uvScrollSpeed: 8,
      uvScrollLimit: 64,
      uvScrollDirection: Math.PI / 2,
    }, 2)).toEqual({
      scale: [1, 1],
      offset: [expect.closeTo(0, 8), 0.125],
    });

    expect(evaluateEfxbnUvTransform({
      ...base,
      uvPatternType: 3,
      uvAnimationFrameNum: 4,
      uvAnimationFrameNumByLine: 2,
    }, 99, { particleSeed: 7 })).toEqual(
      evaluateEfxbnUvTransform({
        ...base,
        uvPatternType: 3,
        uvAnimationFrameNum: 4,
        uvAnimationFrameNumByLine: 2,
      }, 0, { particleSeed: 7 }),
    );
  });

  it("builds a plain model preview and ignores texture entries", () => {
    const modelHash = hash(-55);
    const localModel = model(modelHash, "E:\\effect\\model\\plain.numdlb");
    const sourceInventory = inventory([localModel], []);

    expect(buildEffectFolderPreviewPlan({ category: "models", model: localModel }, sourceInventory)?.targets[0])
      .toMatchObject({ modelHash, modelPath: localModel.files[0].path, animationPath: null });
    expect(
      buildEffectFolderPreviewPlan(
        { category: "textures", item: file("E:\\effect\\texture.nutexb", "nutexb") },
        sourceInventory,
      ),
    ).toBeNull();
  });
});
