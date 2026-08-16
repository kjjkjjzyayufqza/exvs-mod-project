import { describe, expect, test } from "vitest";
import {
  EFFECT_FOLDER_COMMON_PACK_NAME,
  inferEffectFolderCommonPackPath,
  isEffectFolderCommonPackRoot,
} from "./effectFolderCommonPack";

describe("inferEffectFolderCommonPackPath", () => {
  test("resolves the shared pack as a sibling of the opened pack", () => {
    expect(
      inferEffectFolderCommonPackPath(
        "E:\\XB\\mod\\006effect\\wing_gundam_zero_rebellion_effect",
      ),
    ).toBe("E:\\XB\\mod\\006effect\\000common_001");
  });

  test("normalizes posix separators and trailing separators", () => {
    expect(
      inferEffectFolderCommonPackPath("E:/XB/mod/006effect/gundam_002chrgel/"),
    ).toBe("E:\\XB\\mod\\006effect\\000common_001");
  });

  test("works for the unpacked tree, which uses the same 006effect layout", () => {
    expect(
      inferEffectFolderCommonPackPath("E:\\XB\\unpacked\\com\\file\\006effect\\028gunwtv_001gunwtv_001"),
    ).toBe("E:\\XB\\unpacked\\com\\file\\006effect\\000common_001");
  });

  test("returns null for the common pack itself so it is never indexed twice", () => {
    expect(
      inferEffectFolderCommonPackPath("E:\\XB\\mod\\006effect\\000common_001"),
    ).toBeNull();
  });

  test("throws when the path has no parent to search", () => {
    expect(() => inferEffectFolderCommonPackPath("006effect")).toThrow(
      /Cannot infer common effect pack path/,
    );
  });
});

describe("isEffectFolderCommonPackRoot", () => {
  test("recognizes the shared pack by its folder name, case-insensitively", () => {
    expect(isEffectFolderCommonPackRoot("E:\\XB\\mod\\006effect\\000common_001")).toBe(true);
    expect(isEffectFolderCommonPackRoot("E:/XB/mod/006effect/000COMMON_001/")).toBe(true);
    expect(isEffectFolderCommonPackRoot("E:\\XB\\mod\\006effect\\gundam_002chrgel")).toBe(false);
  });

  test("exposes the pack name so callers do not hardcode it", () => {
    expect(EFFECT_FOLDER_COMMON_PACK_NAME).toBe("000common_001");
  });
});
