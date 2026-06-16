import { describe, expect, it } from "vitest";
import {
  getBaseName,
  getParentDir,
  inferUnitModelModOutputPath,
  inferUnitModelOutputPath,
  inferUnitModelStructurePath,
  normalizeUnitModelPackStem,
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

  it("infers mod-folder fhm2d path from structure stem", () => {
    expect(
      inferUnitModelModOutputPath(
        "E:/Games/exvs/mod",
        "E:\\XB\\解包\\com\\file\\0xAF73362C_structure.json",
      ),
    ).toBe("E:\\Games\\exvs\\mod\\0xAF73362C.fhm2d");
  });

  it("strips trailing separators on the mod folder", () => {
    expect(
      inferUnitModelModOutputPath(
        "E:\\Games\\exvs\\mod\\",
        "E:\\XB\\com\\0x49235031.json",
      ),
    ).toBe("E:\\Games\\exvs\\mod\\0x49235031.fhm2d");
  });

  it("throws when the mod folder is empty", () => {
    expect(() =>
      inferUnitModelModOutputPath("", "E:\\XB\\com\\0x49235031_structure.json"),
    ).toThrow(/OB Mod folder is not configured/);
  });

  it("normalizes a lowercase hash stem to the game's uppercase-hex pack name", () => {
    expect(normalizeUnitModelPackStem("0xa258a522")).toBe("0xA258A522");
    // Already-uppercase and the lowercase `0x` prefix are preserved.
    expect(normalizeUnitModelPackStem("0xAF73362C")).toBe("0xAF73362C");
    // Non-hash stems are left untouched.
    expect(normalizeUnitModelPackStem("custom_model")).toBe("custom_model");
  });

  it("emits an uppercase-hex pack name for a lowercase structure json (mod folder)", () => {
    expect(
      inferUnitModelModOutputPath(
        "E:\\OBHK0.3_v27\\data\\x64\\mod",
        "E:\\XB\\解包\\com\\file\\0xa258a522_structure.json",
      ),
    ).toBe("E:\\OBHK0.3_v27\\data\\x64\\mod\\0xA258A522.fhm2d");
  });

  it("emits an uppercase-hex pack name for a lowercase structure json (sibling output)", () => {
    expect(
      inferUnitModelOutputPath(
        "E:\\XB\\解包\\com\\file\\0xa258a522",
        "E:\\XB\\解包\\com\\file\\0xa258a522_structure.json",
      ),
    ).toBe("E:\\XB\\解包\\com\\file\\0xA258A522.fhm2d");
  });
});

