import { describe, expect, it } from "vitest";
import type { AssetRefInfo } from "./assetRef";
import { mergeResolvedAssetRefs } from "./mergeAssetRefs";

function ref(partial: Partial<AssetRefInfo> & Pick<AssetRefInfo, "fieldKey" | "rawValue">): AssetRefInfo {
  return {
    routeId: "unit.model",
    hashHex: "0x00000001",
    sourceFilePath: "",
    modFilePath: "",
    sourceExists: null,
    modExists: null,
    workspaceExists: null,
    workspacePack: {
      configured: {
        routeId: "unit.model",
        prefix: "002chara",
        routeRootPath: "E:/ws/002chara",
        hashHex: "0x00000001",
        folderPath: "E:/ws/002chara/0x00000001",
        structureJsonPath: "E:/ws/002chara/0x00000001_structure.json",
        packKey: "002chara/0x00000001",
      },
      existing: null,
      sourceLayout: "missing",
      folderExists: false,
      structureJsonExists: false,
      duplicateLayout: false,
    },
    workspaceFolderPath: "E:/ws/002chara/0x00000001",
    isModel: true,
    isEffectAsset: false,
    isParamAsset: false,
    isMscAsset: false,
    isMotionAsset: false,
    isSoundAsset: false,
    ...partial,
  };
}

describe("mergeResolvedAssetRefs", () => {
  it("reuses previous refs when rawValue is unchanged (keeps probe results)", () => {
    const probed = ref({
      fieldKey: "Effect",
      rawValue: 42,
      sourceExists: true,
      modExists: false,
      workspaceExists: true,
    });
    const pathOnly = ref({
      fieldKey: "Effect",
      rawValue: 42,
      sourceExists: null,
      modExists: null,
      workspaceExists: null,
    });

    const merged = mergeResolvedAssetRefs({ Effect: probed }, { Effect: pathOnly });
    expect(merged.Effect).toBe(probed);
    expect(merged.Effect?.sourceExists).toBe(true);
  });

  it("takes the incoming ref when rawValue changes", () => {
    const oldRef = ref({ fieldKey: "Sound", rawValue: 1, sourceExists: true });
    const nextRef = ref({ fieldKey: "Sound", rawValue: 2, sourceExists: null });
    const merged = mergeResolvedAssetRefs({ Sound: oldRef }, { Sound: nextRef });
    expect(merged.Sound).toBe(nextRef);
    expect(merged.Sound?.rawValue).toBe(2);
  });

  it("returns the same map reference when nothing logical changed", () => {
    const a = ref({ fieldKey: "Model", rawValue: 9, sourceExists: true });
    const prev = { Model: a };
    const merged = mergeResolvedAssetRefs(prev, {
      Model: ref({ fieldKey: "Model", rawValue: 9, sourceExists: null }),
    });
    expect(merged).toBe(prev);
  });
});
