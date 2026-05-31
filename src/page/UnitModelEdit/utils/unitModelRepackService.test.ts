import { describe, expect, it } from "vitest";
import {
  getBaseName,
  getParentDir,
  inferUnitModelOutputPath,
  inferUnitModelStructurePath,
  toWindowsPath,
} from "./unitModelRepackService";

describe("unitModelRepackService path helpers", () => {
  it("normalizes slashes to Windows style", () => {
    expect(toWindowsPath("E:/XB/解包/com/file/0xAF73362C")).toBe(
      "E:\\XB\\解包\\com\\file\\0xAF73362C",
    );
  });

  it("extracts parent and basename with trailing slash", () => {
    const path = "E:\\XB\\解包\\com\\file\\0xAF73362C\\";
    expect(getParentDir(path)).toBe("E:\\XB\\解包\\com\\file");
    expect(getBaseName(path)).toBe("0xAF73362C");
  });

  it("infers sibling structure json path", () => {
    expect(inferUnitModelStructurePath("E:\\XB\\解包\\com\\file\\0xAF73362C")).toBe(
      "E:\\XB\\解包\\com\\file\\0xAF73362C_structure.json",
    );
  });

  it("infers output fhm2d path from structure stem", () => {
    expect(
      inferUnitModelOutputPath(
        "E:\\XB\\解包\\com\\file\\0xAF73362C",
        "E:\\XB\\解包\\com\\file\\0xAF73362C_structure.json",
      ),
    ).toBe("E:\\XB\\解包\\com\\file\\0xAF73362C.fhm2d");
  });
});

