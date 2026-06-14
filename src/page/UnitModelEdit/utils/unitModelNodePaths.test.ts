import { describe, it, expect } from "vitest";

import { normalizeComparePath, resolveUnitModelNodeAbsPath } from "./unitModelNodePaths";

describe("normalizeComparePath", () => {
  it("lower-cases, forward-slashes, and trims a trailing slash", () => {
    expect(normalizeComparePath("E:\\Out\\Model\\M.Numatb")).toBe("e:/out/model/m.numatb");
  });

  it("trims a trailing slash", () => {
    expect(normalizeComparePath("E:/out/dir/")).toBe("e:/out/dir");
  });
});

describe("resolveUnitModelNodeAbsPath", () => {
  it("joins the structure-json directory with the structure-relative fileUrl (windows output)", () => {
    expect(
      resolveUnitModelNodeAbsPath(
        "E:\\out\\0xABE08869_structure.json",
        "0xABE08869/textures/body.nutexb",
      ),
    ).toBe("E:\\out\\0xABE08869\\textures\\body.nutexb");
  });

  it("normalizes backslashes already present in fileUrl and strips leading separators", () => {
    expect(
      resolveUnitModelNodeAbsPath("E:\\out\\pkg_structure.json", "\\pkg\\model_a\\m.numatb"),
    ).toBe("E:\\out\\pkg\\model_a\\m.numatb");
  });
});
