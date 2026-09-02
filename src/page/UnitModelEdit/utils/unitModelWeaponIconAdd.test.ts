import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TextureAddSelection } from "@/page/SceneEdit/components/TextureAddConfirmModal";
import type { AnalyzedAddCandidate } from "@/page/SceneEdit/utils/sceneTextureAddPlan";
import type { TextureManagerEntry } from "@/page/SceneEdit/store/sceneTextureManagerStore";
import { applyWeaponIconAddSelections, type WeaponIconAddDeps } from "./unitModelWeaponIconAdd";
import type { UnitModelWeaponIconInventory } from "./unitModelWeaponIconService";

function candidate(overrides: Partial<AnalyzedAddCandidate> = {}): AnalyzedAddCandidate {
  return {
    id: "C:/in/custom.png",
    sourcePath: "C:/in/custom.png",
    filename: "custom.png",
    nutexbFilename: "custom.nutexb",
    isNutexb: false,
    internalName: null,
    duplicate: false,
    duplicateReason: null,
    duplicateOf: null,
    ...overrides,
  };
}

function entry(overrides: Partial<TextureManagerEntry> = {}): TextureManagerEntry {
  return {
    id: "weapon_icon_16",
    filename: "custom.nutexb",
    status: "existing",
    scope: "model",
    infoCategory: null,
    format: "BC7_UNORM",
    width: 128,
    height: 128,
    sizeBytes: 41648,
    referencedBy: ["HUD 0"],
    thumbnailDataUrl: null,
    nutexbPath: "E:/unit/pkg/weapon_icon/custom.nutexb",
    sourceImagePath: null,
    ...overrides,
  };
}

function emptyInventory(): UnitModelWeaponIconInventory {
  return {
    modelRoot: "E:/unit/pkg",
    structureJsonPath: "E:/unit/pkg_structure.json",
    folderPresent: true,
    icons: [],
    warnings: [],
  };
}

function makeDeps(): WeaponIconAddDeps & {
  convertImageToNutexb: ReturnType<typeof vi.fn>;
  replaceNutexbInPlace: ReturnType<typeof vi.fn>;
  addUnitModelWeaponIcon: ReturnType<typeof vi.fn>;
  invalidateNutexbInternalName: ReturnType<typeof vi.fn>;
} {
  return {
    convertImageToNutexb: vi.fn().mockResolvedValue({
      outputNutexbPath: "C:/tmp/custom.nutexb",
      previewPngPath: "C:/tmp/custom.png",
      nutexbName: "custom",
    }),
    replaceNutexbInPlace: vi.fn().mockResolvedValue(null),
    addUnitModelWeaponIcon: vi.fn().mockResolvedValue(emptyInventory()),
    invalidateNutexbInternalName: vi.fn((_path: string) => undefined),
  };
}

describe("applyWeaponIconAddSelections", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("converts a PNG then adds the nutexb into weapon_icon via addUnitModelWeaponIcon", async () => {
    const selection: TextureAddSelection = {
      candidate: candidate(),
      ddsFormat: "BC7RgbaUnorm",
      replace: false,
    };

    const result = await applyWeaponIconAddSelections(
      {
        modelRoot: "E:/unit/pkg",
        structureJsonPath: "E:/unit/pkg_structure.json",
        selections: [selection],
        existingEntries: [],
      },
      deps,
    );

    expect(deps.convertImageToNutexb).toHaveBeenCalledWith({
      sourcePath: "C:/in/custom.png",
      ddsFormat: "BC7RgbaUnorm",
    });
    expect(deps.addUnitModelWeaponIcon).toHaveBeenCalledWith({
      modelRoot: "E:/unit/pkg",
      structureJsonPath: "E:/unit/pkg_structure.json",
      sourcePath: "C:/tmp/custom.nutexb",
      targetFilename: "custom.nutexb",
    });
    expect(deps.replaceNutexbInPlace).not.toHaveBeenCalled();
    expect(result.addedCount).toBe(1);
    expect(result.replacedCount).toBe(0);
    expect(result.inventory).toEqual(emptyInventory());
  });

  it("copies an existing nutexb without converting", async () => {
    const selection: TextureAddSelection = {
      candidate: candidate({
        id: "C:/in/jump.nutexb",
        sourcePath: "C:/in/jump.nutexb",
        filename: "jump.nutexb",
        nutexbFilename: "jump.nutexb",
        isNutexb: true,
      }),
      ddsFormat: "BC7RgbaUnorm",
      replace: false,
    };

    await applyWeaponIconAddSelections(
      {
        modelRoot: "E:/unit/pkg",
        structureJsonPath: "E:/unit/pkg_structure.json",
        selections: [selection],
        existingEntries: [],
      },
      deps,
    );

    expect(deps.convertImageToNutexb).not.toHaveBeenCalled();
    expect(deps.addUnitModelWeaponIcon).toHaveBeenCalledWith({
      modelRoot: "E:/unit/pkg",
      structureJsonPath: "E:/unit/pkg_structure.json",
      sourcePath: "C:/in/jump.nutexb",
      targetFilename: "jump.nutexb",
    });
  });

  it("replaces an existing HUD icon in place and does not append a new slot", async () => {
    const selection: TextureAddSelection = {
      candidate: candidate({
        duplicate: true,
        duplicateReason: "filename",
        duplicateOf: "custom.nutexb",
      }),
      ddsFormat: "BC3RgbaUnorm",
      replace: true,
    };
    const existing = entry();

    const result = await applyWeaponIconAddSelections(
      {
        modelRoot: "E:/unit/pkg",
        structureJsonPath: "E:/unit/pkg_structure.json",
        selections: [selection],
        existingEntries: [existing],
      },
      deps,
    );

    expect(deps.replaceNutexbInPlace).toHaveBeenCalledWith({
      sourcePath: "C:/in/custom.png",
      targetNutexbPath: "E:/unit/pkg/weapon_icon/custom.nutexb",
      ddsFormat: "BC3RgbaUnorm",
    });
    expect(deps.addUnitModelWeaponIcon).not.toHaveBeenCalled();
    expect(deps.convertImageToNutexb).not.toHaveBeenCalled();
    expect(deps.invalidateNutexbInternalName).toHaveBeenCalledWith(
      "E:/unit/pkg/weapon_icon/custom.nutexb",
    );
    expect(result.addedCount).toBe(0);
    expect(result.replacedCount).toBe(1);
    expect(result.inventory).toBeNull();
  });

  it("throws when a replace selection has no matching HUD icon", async () => {
    const selection: TextureAddSelection = {
      candidate: candidate({
        duplicate: true,
        duplicateReason: "filename",
        duplicateOf: "missing.nutexb",
      }),
      ddsFormat: "BC7RgbaUnorm",
      replace: true,
    };

    await expect(
      applyWeaponIconAddSelections(
        {
          modelRoot: "E:/unit/pkg",
          structureJsonPath: "E:/unit/pkg_structure.json",
          selections: [selection],
          existingEntries: [entry()],
        },
        deps,
      ),
    ).rejects.toThrow(/matching weapon icon not found/i);
    expect(deps.replaceNutexbInPlace).not.toHaveBeenCalled();
    expect(deps.addUnitModelWeaponIcon).not.toHaveBeenCalled();
  });
});
