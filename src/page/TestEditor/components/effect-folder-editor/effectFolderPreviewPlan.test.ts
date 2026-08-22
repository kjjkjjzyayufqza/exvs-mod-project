import { describe, expect, it } from "vitest";
import type {
  EffectFolderCommonPack,
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
  resolveEfxbnColorMapBinding,
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
  commonPack: EffectFolderCommonPack | null = null,
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
      unresolvedTextureIds: [],
      commonModelIds: [],
      commonTextureIds: [],
    },
    efxbns: [],
    models,
    textures,
    otherFiles,
    commonPack,
    warnings: [],
  };
}

function commonPack(
  models: EffectFolderModel[],
  textures: EffectFolderFileItem[] = [],
): EffectFolderCommonPack {
  return {
    effectRoot: "E:\\006effect\\000common_001",
    structureJsonPath: "E:\\006effect\\000common_001_structure.json",
    models,
    textures,
  };
}

describe("buildEffectFolderPreviewPlan", () => {
  it("keeps the preview scene mounted while live scalar and curve edits update its plan", () => {
    const localModelHash = hash(101);
    const localModel = model(localModelHash, "E:\\effect\\model\\main.numdlb");
    const summary = {
      effects: [
        {
          index: 0,
          modelHash: localModelHash,
          animationHash: hash(0),
          lifeTimeBase: 30,
          colorTextureParameterIndex: [-1, -1],
          uvTextureParameterIndex: [-1, -1],
        },
      ],
      modelControls: [],
      controlLookupEntries: [
        { index: 0, keyF32Bits: 0, key: 0, valueF32Bits: 0, value: 1 },
      ],
      textureParameters: [],
    } as unknown as EfxbnSummary;
    const efxbnFile = { ...file("E:\\effect\\live.efxbn", "efxbn"), efxbn: summary };
    const sourceInventory = inventory([localModel], []);
    const initial = buildEffectFolderPreviewPlan(
      { category: "efxbn", item: efxbnFile },
      sourceInventory,
      summary,
    );
    const editedSummary = {
      ...summary,
      effects: [{ ...summary.effects[0], lifeTimeBase: 90 }],
      controlLookupEntries: [{ ...summary.controlLookupEntries[0], value: 0.25 }],
    } as unknown as EfxbnSummary;

    const edited = buildEffectFolderPreviewPlan(
      { category: "efxbn", item: efxbnFile },
      sourceInventory,
      editedSummary,
    );

    expect(edited?.effectBlocks[0].lifeTimeBase).toBe(90);
    expect(edited?.controlLookupEntries[0].value).toBe(0.25);
    expect(edited?.key).toBe(initial?.key);
  });

  it("preserves repeated effect instances and resolves only source-local models and animations", () => {
    const localModelHash = hash(101);
    const externalModelHash = hash(202);
    const localAnimationHash = hash(303);
    const externalAnimationHash = hash(404);
    const localModel = model(localModelHash, "E:\\effect\\model\\main.numdlb");
    const localAnimation = file("E:\\effect\\motion\\main.nuanmb", "nuanmb", localAnimationHash);
    const summary = {
      effects: [
        { index: 0, modelHash: localModelHash, animationHash: localAnimationHash, colorTextureParameterIndex: [-1, -1], uvTextureParameterIndex: [-1, -1] },
        { index: 1, modelHash: localModelHash, animationHash: hash(0), colorTextureParameterIndex: [-1, -1], uvTextureParameterIndex: [-1, -1] },
        { index: 2, modelHash: externalModelHash, animationHash: externalAnimationHash, colorTextureParameterIndex: [-1, -1], uvTextureParameterIndex: [-1, -1] },
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

  it("resolves models and colour maps that only exist in the shared common pack", () => {
    const sharedModelHash = hash(0x328d9438 | 0);
    const sharedTextureHash = hash(0xad0769f6 | 0);
    const missingModelHash = hash(909);
    const sharedModel = model(sharedModelHash, "E:\\006effect\\000common_001\\0\\0\\101\\sphere.numdlb");
    const sharedTexture = file(
      "E:\\006effect\\000common_001\\0\\0\\102\\color.nutexb",
      "nutexb",
      sharedTextureHash,
    );
    const summary = {
      effects: [
        { index: 0, modelHash: sharedModelHash, animationHash: hash(0), colorTextureParameterIndex: [0, -1], uvTextureParameterIndex: [-1, -1] },
        { index: 1, modelHash: missingModelHash, animationHash: hash(0), colorTextureParameterIndex: [-1, -1], uvTextureParameterIndex: [-1, -1] },
      ],
      modelControls: [{ index: 0, colorMapId: sharedTextureHash.signed, colorMapHash: sharedTextureHash }],
      controlLookupEntries: [],
      textureParameters: [],
    } as unknown as EfxbnSummary;
    const efxbnFile = { ...file("E:\\effect\\33.efxbn", "efxbn", hash(33)), efxbn: summary };

    const plan = buildEffectFolderPreviewPlan(
      { category: "efxbn", item: efxbnFile },
      inventory([], [], [], commonPack([sharedModel], [sharedTexture])),
    );

    expect(plan?.targets.map((target) => target.modelPath)).toEqual([sharedModel.files[0].path]);
    expect(plan?.targets.map((target) => target.source)).toEqual(["common"]);
    expect(plan?.textureBindings[0].file?.path).toBe(sharedTexture.path);
    expect(plan?.textureBindings[0].source).toBe("common");
    expect(plan?.commonModelCount).toBe(1);
    expect(plan?.commonTextureCount).toBe(1);
    expect(plan?.unresolvedModelHashes).toEqual([missingModelHash]);
    expect(plan?.unresolvedTextureHashes).toEqual([]);
  });

  it("marks pack-local resources as pack-sourced even when a shared pack is indexed", () => {
    const localModelHash = hash(101);
    const localModel = model(localModelHash, "E:\\effect\\model\\main.numdlb");
    const shadowedModel = model(localModelHash, "E:\\006effect\\000common_001\\0\\0\\1\\other.numdlb");
    const summary = {
      effects: [
        { index: 0, modelHash: localModelHash, animationHash: hash(0), colorTextureParameterIndex: [-1, -1], uvTextureParameterIndex: [-1, -1] },
      ],
      modelControls: [],
      controlLookupEntries: [],
      textureParameters: [],
    } as unknown as EfxbnSummary;
    const efxbnFile = { ...file("E:\\effect\\1.efxbn", "efxbn", hash(1)), efxbn: summary };

    const plan = buildEffectFolderPreviewPlan(
      { category: "efxbn", item: efxbnFile },
      inventory([localModel], [], [], commonPack([shadowedModel])),
    );

    expect(plan?.targets[0].modelPath).toBe(localModel.files[0].path);
    expect(plan?.targets[0].source).toBe("pack");
    expect(plan?.commonModelCount).toBe(0);
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
          colorTextureParameterIndex: [0, -1],
          uvTextureParameterIndex: [-1, -1],
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
      slot: "color0",
      controlIndex: 0,
      file: textureFile,
    });
    expect(resolveEfxbnColorMapBinding(plan!, 0)?.file).toBe(textureFile);
    expect(plan?.localTextureCount).toBe(1);
    expect(plan?.unresolvedTextureHashes).toEqual([]);
  });

  it("never promotes a UV-offset map into the primary colour slot", () => {
    // Real shape: 453 of the shipped blocks leave `colorTextureParameterIndex[0]` pointing at a
    // parameter with no colour map while `uvTextureParameterIndex[0]` carries a distortion map.
    // Example: mod/006effect/053gbftry_005tsient_001/0/0/150.efxbn block 1.
    const distortionHash = hash(606);
    const distortionFile = file("E:\\effect\\texture\\offset.nutexb", "nutexb", distortionHash);
    const emptyColorParameter = { index: 0, colorMapHash: hash(0) };
    const uvOffsetParameter = { index: 1, colorMapHash: distortionHash };
    const summary = {
      effects: [
        {
          index: 0,
          modelHash: hash(0),
          animationHash: hash(0),
          colorTextureParameterIndex: [0, -1],
          uvTextureParameterIndex: [1, -1],
        },
      ],
      modelControls: [emptyColorParameter, uvOffsetParameter],
      controlLookupEntries: [],
      textureParameters: [emptyColorParameter, uvOffsetParameter],
    } as unknown as EfxbnSummary;
    const efxbnFile = { ...file("E:\\effect\\distorted.efxbn", "efxbn"), efxbn: summary };

    const plan = buildEffectFolderPreviewPlan(
      { category: "efxbn", item: efxbnFile },
      inventory([], [], [distortionFile]),
    );

    expect(plan?.textureBindings.map((binding) => binding.slot)).toEqual(["color0", "uv0"]);
    // The colour slot keeps its own (empty) parameter instead of adopting the distortion map.
    expect(resolveEfxbnColorMapBinding(plan!, 0)?.parameter).toBe(emptyColorParameter);
    expect(resolveEfxbnColorMapBinding(plan!, 0)?.file).toBeNull();
    expect(plan?.textureBindings[1].file).toBe(distortionFile);
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
