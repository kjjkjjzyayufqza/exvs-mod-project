import { describe, expect, it } from "vitest";
import {
  buildLegacySlotSubfolderDeletePath,
  canReplaceModelNode,
  resolveLegacyModelSubfolderUnderSlot,
  resolveModelReplaceTarget,
} from "./sceneModelReplace";

describe("sceneModelReplace", () => {
  describe("canReplaceModelNode", () => {
    it("returns true for the base node", () => {
      expect(canReplaceModelNode({ role: "base" })).toBe(true);
    });
    it("returns true for any sub-model node (including sky)", () => {
      expect(canReplaceModelNode({ role: "sub_model" })).toBe(true);
    });
    it("returns false for not-yet-saved imports and other roles", () => {
      expect(canReplaceModelNode({ role: "imported_dae" })).toBe(false);
      expect(canReplaceModelNode({ role: "collision" })).toBe(false);
      expect(canReplaceModelNode({ role: "placement" })).toBe(false);
    });
  });

  describe("resolveModelReplaceTarget", () => {
    const subModels = [{ folderName: "stage_floor" }, { folderName: "sky" }];
    it("resolves the base node id to a base target", () => {
      expect(resolveModelReplaceTarget("base", subModels)).toEqual({
        folderName: "base",
        isBase: true,
      });
    });
    it("resolves a sub-model node id to a sub-model target", () => {
      expect(resolveModelReplaceTarget("stage_floor", subModels)).toEqual({
        folderName: "stage_floor",
        isBase: false,
      });
    });
    it("resolves the sky node id to a sub-model target", () => {
      expect(resolveModelReplaceTarget("sky", subModels)).toEqual({
        folderName: "sky",
        isBase: false,
      });
    });
    it("returns null for an unknown node id", () => {
      expect(resolveModelReplaceTarget("ghost", subModels)).toBeNull();
    });
  });

  describe("resolveLegacyModelSubfolderUnderSlot", () => {
    it("returns the named subfolder for legacy base layouts", () => {
      const bundle = {
        modlPath:
          "E:/XB/com/test/0x16F73C97/0/0/base/001stage001_base/0/001stage001_base.numdlb",
      };
      expect(resolveLegacyModelSubfolderUnderSlot(bundle, "base")).toBe("001stage001_base");
    });

    it("returns null when the model already uses slot/0 layout", () => {
      const bundle = {
        modlPath: "E:/stage/0/0/base/0/base.numdlb",
      };
      expect(resolveLegacyModelSubfolderUnderSlot(bundle, "base")).toBeNull();
    });

    it("returns null when modlPath is missing", () => {
      expect(resolveLegacyModelSubfolderUnderSlot(null, "base")).toBeNull();
    });
  });

  describe("buildLegacySlotSubfolderDeletePath", () => {
    it("joins slot folder and legacy subfolder for executeDelete", () => {
      expect(buildLegacySlotSubfolderDeletePath("base", "001stage001_base")).toBe(
        "base/001stage001_base",
      );
    });
  });
});
