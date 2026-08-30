import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

import {
  addUnitModelWeaponIcon,
  isWeaponIconFileUrl,
  listUnitModelWeaponIcons,
  removeUnitModelWeaponIcon,
  reorderUnitModelWeaponIcons,
  weaponIconHudLabel,
} from "./unitModelWeaponIconService";

describe("unitModelWeaponIconService", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("lists icons with Windows paths", async () => {
    invoke.mockResolvedValue({ folderPresent: true, icons: [], warnings: [] });
    await listUnitModelWeaponIcons("E:/unit/pkg", "E:/unit/pkg_structure.json");
    expect(invoke).toHaveBeenCalledWith("list_unit_model_weapon_icons", {
      modelRoot: "E:\\unit\\pkg",
      structureJsonPath: "E:\\unit\\pkg_structure.json",
    });
  });

  it("adds an icon at a HUD index", async () => {
    invoke.mockResolvedValue({ folderPresent: true, icons: [], warnings: [] });
    await addUnitModelWeaponIcon({
      modelRoot: "E:/unit/pkg",
      structureJsonPath: "E:/unit/pkg_structure.json",
      sourcePath: "E:/icons/new.nutexb",
      targetFilename: "016_001_001_custom.nutexb",
      insertAt: 3,
    });
    expect(invoke).toHaveBeenCalledWith("add_unit_model_weapon_icon", {
      modelRoot: "E:\\unit\\pkg",
      structureJsonPath: "E:\\unit\\pkg_structure.json",
      sourcePath: "E:\\icons\\new.nutexb",
      targetFilename: "016_001_001_custom.nutexb",
      insertAt: 3,
    });
  });

  it("reorders by fileIndex permutation", async () => {
    invoke.mockResolvedValue({ folderPresent: true, icons: [], warnings: [] });
    await reorderUnitModelWeaponIcons({
      modelRoot: "E:/unit/pkg",
      structureJsonPath: "E:/unit/pkg_structure.json",
      fileIndices: [19, 16, 18],
    });
    expect(invoke).toHaveBeenCalledWith("reorder_unit_model_weapon_icons", {
      modelRoot: "E:\\unit\\pkg",
      structureJsonPath: "E:\\unit\\pkg_structure.json",
      fileIndices: [19, 16, 18],
    });
  });

  it("removes by fileIndex", async () => {
    invoke.mockResolvedValue({ folderPresent: false, icons: [], warnings: [] });
    await removeUnitModelWeaponIcon({
      modelRoot: "E:/unit/pkg",
      structureJsonPath: "E:/unit/pkg_structure.json",
      fileIndex: 21,
    });
    expect(invoke).toHaveBeenCalledWith("remove_unit_model_weapon_icon", {
      modelRoot: "E:\\unit\\pkg",
      structureJsonPath: "E:\\unit\\pkg_structure.json",
      fileIndex: 21,
    });
  });

  it("detects weapon_icon fileUrl segments", () => {
    expect(isWeaponIconFileUrl(".\\PKG\\weapon_icon\\jump.nutexb")).toBe(true);
    expect(isWeaponIconFileUrl("PKG/textures/albedo.nutexb")).toBe(false);
    expect(isWeaponIconFileUrl(undefined)).toBe(false);
  });

  it("labels HUD indices from structure order", () => {
    expect(weaponIconHudLabel(0)).toBe("HUD 0");
    expect(weaponIconHudLabel(6)).toBe("HUD 6");
  });
});
