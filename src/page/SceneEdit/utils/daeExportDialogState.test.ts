import { describe, expect, it } from "vitest";
import {
  buildDaeExportDialogState,
  canExportNodeRoleToDae,
} from "./daeExportDialogState";

describe("canExportNodeRoleToDae", () => {
  it("allows base, sub_model, and imported_dae", () => {
    expect(canExportNodeRoleToDae("base")).toBe(true);
    expect(canExportNodeRoleToDae("sub_model")).toBe(true);
    expect(canExportNodeRoleToDae("imported_dae")).toBe(true);
  });

  it("rejects placement and effect roles", () => {
    expect(canExportNodeRoleToDae("placement")).toBe(false);
    expect(canExportNodeRoleToDae("effect")).toBe(false);
  });
});

describe("buildDaeExportDialogState", () => {
  it("builds ssbh target for sub_model folder id", () => {
    const result = buildDaeExportDialogState({
      nodeIds: ["001stage001"],
      baseModel: null,
      subModels: [
        {
          folderName: "001stage001",
          bundle: { rootFolder: "C:/stage/001stage001" },
        },
      ],
      importedDaeIds: new Set(),
      exportObjects: [],
    });

    expect(result?.targets).toEqual([
      {
        nodeId: "001stage001",
        name: "001stage001",
        rootPath: "C:/stage/001stage001",
        type: "ssbh",
      },
    ]);
    expect(result?.threeObjects).toEqual([]);
  });

  it("pairs imported dae with viewport export object when present", () => {
    const object = {} as never;
    const result = buildDaeExportDialogState({
      nodeIds: ["dae-1"],
      baseModel: null,
      subModels: [],
      importedDaeIds: new Set(["dae-1"]),
      exportObjects: [{ name: "dae-1", object }],
    });

    expect(result?.targets[0]?.type).toBe("imported-dae");
    expect(result?.threeObjects[0]?.object).toBe(object);
  });
});
