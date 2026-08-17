import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  EffectFolderFileItem,
  EffectFolderHash,
  EffectFolderInventory,
  EffectFolderModel,
} from "@/services/effectFolder/effectFolderService";
import { EffectFolderResolutionPanel } from "./EffectFolderResolutionPanel";

function hash(signed: number): EffectFolderHash {
  return {
    signed,
    unsigned: signed >>> 0,
    hex: `0x${(signed >>> 0).toString(16).toUpperCase().padStart(8, "0")}`,
  };
}

function model(modelHash: EffectFolderHash): EffectFolderModel {
  return {
    name: modelHash.hex,
    hash: modelHash,
    entryIndex: 0,
    folderUnk3: 0,
    files: [],
    missingRequiredExts: [],
  };
}

function texture(textureHash: EffectFolderHash, name: string): EffectFolderFileItem {
  return {
    fileIndex: 0,
    fileType: ".nutexb",
    actualExt: ".nutexb",
    fileUrl: "",
    fileBaseName: name,
    name,
    path: `E:\\XB\\mod\\006effect\\000common_001\\0\\0\\1\\${name}.nutexb`,
    hash: textureHash,
    unk2: null,
    missing: false,
  };
}

function inventory(overrides: Partial<EffectFolderInventory> = {}): EffectFolderInventory {
  return {
    effectRoot: "E:\\XB\\mod\\006effect\\pack",
    structureJsonPath: "E:\\XB\\mod\\006effect\\pack_structure.json",
    summary: {
      totalFiles: 0,
      efxbnCount: 0,
      modelCount: 0,
      textureCount: 0,
      unresolvedModelIds: [],
      unresolvedTextureIds: [],
      commonModelIds: [],
      commonTextureIds: [],
    },
    efxbns: [],
    models: [],
    textures: [],
    otherFiles: [],
    commonPack: null,
    warnings: [],
    ...overrides,
  };
}

describe("EffectFolderResolutionPanel", () => {
  it("reports what the shared pack supplied and where it lives", () => {
    render(
      <EffectFolderResolutionPanel
        inventory={inventory({
          summary: {
            ...inventory().summary,
            commonModelIds: [hash(0x328d9438 | 0)],
            commonTextureIds: [hash(0xad0769f6 | 0), hash(7)],
          },
          commonPack: {
            effectRoot: "E:\\XB\\mod\\006effect\\000common_001",
            structureJsonPath: "E:\\XB\\mod\\006effect\\000common_001_structure.json",
            models: [model(hash(0x328d9438 | 0))],
            textures: [],
          },
        })}
      />,
    );

    expect(screen.getByText("Shared pack")).toBeInTheDocument();
    expect(screen.getByText("E:\\XB\\mod\\006effect\\000common_001")).toBeInTheDocument();
    expect(screen.getByText("1 model indexed")).toBeInTheDocument();
    expect(screen.getByText("0 textures indexed")).toBeInTheDocument();
    expect(
      screen.getByText("Resolved 1 model reference and 2 texture references from the shared pack."),
    ).toBeInTheDocument();
  });

  it("names each shared resource so it can be found in the other pack", () => {
    const sphereHash = hash(0x328d9438 | 0);
    const colorHash = hash(0xad0769f6 | 0);
    render(
      <EffectFolderResolutionPanel
        inventory={inventory({
          summary: {
            ...inventory().summary,
            commonModelIds: [sphereHash],
            commonTextureIds: [colorHash],
          },
          commonPack: {
            effectRoot: "E:\\XB\\mod\\006effect\\000common_001",
            structureJsonPath: "E:\\XB\\mod\\006effect\\000common_001_structure.json",
            models: [{ ...model(sphereHash), name: "eff_000common_000common_001_sphere_001" }],
            textures: [texture(colorHash, "eff_000common_000common_001_color_001")],
          },
        })}
      />,
    );

    expect(screen.getByText("eff_000common_000common_001_sphere_001")).toBeInTheDocument();
    expect(screen.getByText("eff_000common_000common_001_color_001")).toBeInTheDocument();
  });

  it("falls back to the raw ID when the shared pack cannot name a reference", () => {
    render(
      <EffectFolderResolutionPanel
        inventory={inventory({
          summary: { ...inventory().summary, commonModelIds: [hash(0x44444444 | 0)] },
          commonPack: {
            effectRoot: "E:\\XB\\mod\\006effect\\000common_001",
            structureJsonPath: "E:\\XB\\mod\\006effect\\000common_001_structure.json",
            models: [],
            textures: [],
          },
        })}
      />,
    );

    expect(screen.getByText("0x44444444")).toBeInTheDocument();
  });

  it("lists unresolved IDs separately from shared-pack resolutions", () => {
    render(
      <EffectFolderResolutionPanel
        inventory={inventory({
          summary: {
            ...inventory().summary,
            commonModelIds: [hash(1)],
            unresolvedModelIds: [hash(0x11111111 | 0)],
            unresolvedTextureIds: [hash(0x22222222 | 0)],
          },
          commonPack: {
            effectRoot: "E:\\XB\\mod\\006effect\\000common_001",
            structureJsonPath: "E:\\XB\\mod\\006effect\\000common_001_structure.json",
            models: [],
            textures: [],
          },
        })}
      />,
    );

    expect(screen.getByText("Unresolved references")).toBeInTheDocument();
    expect(screen.getByText("0x11111111")).toBeInTheDocument();
    expect(screen.getByText("0x22222222")).toBeInTheDocument();
    expect(
      screen.getByText("Resolved 1 model reference and 0 texture references from the shared pack."),
    ).toBeInTheDocument();
  });

  it("states plainly when no shared pack sits beside the opened pack", () => {
    render(<EffectFolderResolutionPanel inventory={inventory()} />);

    expect(screen.getByText(/not found next to this pack/i)).toBeInTheDocument();
  });

  it("says the opened pack is the shared pack instead of reporting it missing", () => {
    render(
      <EffectFolderResolutionPanel
        inventory={inventory({ effectRoot: "E:\\XB\\mod\\006effect\\000common_001" })}
      />,
    );

    expect(screen.getByText(/this is the shared pack/i)).toBeInTheDocument();
    expect(screen.queryByText(/not found next to this pack/i)).toBeNull();
  });

  it("keeps unrelated inventory warnings in their own group", () => {
    render(
      <EffectFolderResolutionPanel
        inventory={inventory({ warnings: ["Duplicate texture hash 0x00000001."] })}
      />,
    );

    expect(screen.getByText("Duplicate texture hash 0x00000001.")).toBeInTheDocument();
  });
});
