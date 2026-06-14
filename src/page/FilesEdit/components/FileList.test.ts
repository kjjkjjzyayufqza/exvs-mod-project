import { describe, expect, it } from "vitest";
import { filterFiles } from "./fileListUtils";

describe("filterFiles", () => {
  const files = [
    { name: "model10.numatb", path: "C:/assets/model10.numatb", string: "ten" },
    { name: "MODEL2.NUMATB", path: "C:/assets/MODEL2.NUMATB", string: "two" },
    { name: "model1.nutexb", path: "C:/assets/model1.nutexb", previewPath: "C:/preview.png" },
  ];

  it("filters in memory by case-insensitive name and extension", () => {
    expect(filterFiles(files, "model", "numatb").map((file) => file.name)).toEqual([
      "MODEL2.NUMATB",
      "model10.numatb",
    ]);
  });

  it("keeps enriched metadata without mutating the source array", () => {
    const result = filterFiles(files, "model1", "all");

    expect(result).toEqual([
      expect.objectContaining({
        name: "model1.nutexb",
        previewPath: "C:/preview.png",
      }),
      expect.objectContaining({
        name: "model10.numatb",
        string: "ten",
      }),
    ]);
    expect(files.map((file) => file.name)).toEqual([
      "model10.numatb",
      "MODEL2.NUMATB",
      "model1.nutexb",
    ]);
  });
});
