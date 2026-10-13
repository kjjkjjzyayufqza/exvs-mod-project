import { describe, expect, it } from "vitest";
import type { PlacementRow } from "../types/placement";
import {
  ensureSkyPlacementObjectNumber,
  reassignObjectPlacementsOffSky,
  resolveSkyPlacementObjectNumber,
} from "./ensureSkyPlacementObjectNumber";

function placement(
  type: string,
  objectNumber: number | null,
  rawFields?: string[],
): PlacementRow {
  return {
    vdkType: type,
    objectNumber,
    posX: 0,
    posY: 0,
    posZ: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    rawFields: rawFields ?? ["VDK_TYPE", type],
  };
}

describe("resolveSkyPlacementObjectNumber", () => {
  it("uses the sky sub-model objectIndex when present", () => {
    const subModels = [
      { folderName: "obj_a", objectIndex: 0 },
      { folderName: "obj_b", objectIndex: 1 },
      { folderName: "sky", objectIndex: 2 },
    ];
    expect(resolveSkyPlacementObjectNumber(subModels)).toBe(2);
  });

  it("falls back to non-sky count when sky folder is missing from bundle", () => {
    const subModels = [
      { folderName: "obj_a", objectIndex: 0 },
      { folderName: "obj_b", objectIndex: 1 },
    ];
    expect(resolveSkyPlacementObjectNumber(subModels)).toBe(2);
  });
});

describe("reassignObjectPlacementsOffSky", () => {
  it("moves an OBJECT that shares the sky number onto the unused import index", () => {
    const subModels = [
      { folderName: "ground", objectIndex: 0 },
      { folderName: "zzzz_import_gundam", objectIndex: 63 },
      { folderName: "sky", objectIndex: 64 },
    ];
    const entries = [
      placement("OBJECT", 0, ["VDK_TYPE", "OBJECT", "VDK_OBJECTNUMBER", "0"]),
      placement("SKY", 64, ["VDK_TYPE", "SKY", "VDK_OBJECTNUMBER", "64"]),
      placement("OBJECT", 64, ["VDK_TYPE", "OBJECT", "VDK_OBJECTNUMBER", "64"]),
    ];
    const result = reassignObjectPlacementsOffSky(entries, subModels);
    expect(result[0].objectNumber).toBe(0);
    expect(result[1].objectNumber).toBe(64);
    expect(result[2].objectNumber).toBe(63);
    const idx = result[2].rawFields.indexOf("VDK_OBJECTNUMBER");
    expect(result[2].rawFields[idx + 1]).toBe("63");
  });

  it("moves a sky-numbered OBJECT onto an import that already has an instance", () => {
    const subModels = [
      { folderName: "zzzz_import_gundam", objectIndex: 63 },
      { folderName: "sky", objectIndex: 64 },
    ];
    const entries = [
      placement("SKY", 64, ["VDK_TYPE", "SKY", "VDK_OBJECTNUMBER", "64"]),
      placement("OBJECT", 63, ["VDK_TYPE", "OBJECT", "VDK_OBJECTNUMBER", "63"]),
      placement("OBJECT", 64, ["VDK_TYPE", "OBJECT", "VDK_OBJECTNUMBER", "64"]),
    ];
    const result = reassignObjectPlacementsOffSky(entries, subModels);
    expect(result.map((entry) => entry.objectNumber)).toEqual([64, 63, 63]);
  });
});

describe("ensureSkyPlacementObjectNumber", () => {
  it("returns entries unchanged when no SKY type is present", () => {
    const entries = [
      placement("OBJECT", 0),
      placement("OBJECT", 1),
      placement("EFFECT", null),
    ];
    const result = ensureSkyPlacementObjectNumber(entries, 2);
    expect(result).toEqual(entries);
  });

  it("sets SKY objectNumber to modelFolderCount", () => {
    const entries = [
      placement("OBJECT", 0),
      placement("OBJECT", 1),
      placement("SKY", null, ["VDK_TYPE", "SKY"]),
    ];
    const result = ensureSkyPlacementObjectNumber(entries, 2);
    expect(result[2].objectNumber).toBe(2);
  });

  it("sets SKY objectNumber to 0 when modelFolderCount is 0", () => {
    const entries = [
      placement("SKY", null, ["VDK_TYPE", "SKY"]),
      placement("EFFECT", null),
    ];
    const result = ensureSkyPlacementObjectNumber(entries, 0);
    expect(result[0].objectNumber).toBe(0);
    expect(result[1]).toEqual(entries[1]);
  });

  it("does not change SKY if objectNumber already matches modelFolderCount", () => {
    const skyRaw = ["VDK_TYPE", "SKY", "VDK_OBJECTNUMBER", "2"];
    const entries = [
      placement("OBJECT", 0),
      placement("OBJECT", 1),
      placement("SKY", 2, skyRaw),
    ];
    const result = ensureSkyPlacementObjectNumber(entries, 2);
    expect(result[2].objectNumber).toBe(2);
    expect(result[2].rawFields).toEqual(skyRaw);
  });

  it("updates rawFields VDK_OBJECTNUMBER when objectNumber is wrong", () => {
    const entries = [
      placement("OBJECT", 0),
      placement("OBJECT", 1),
      placement("SKY", 1, ["VDK_TYPE", "SKY", "VDK_OBJECTNUMBER", "1"]),
    ];
    const result = ensureSkyPlacementObjectNumber(entries, 2);
    expect(result[2].objectNumber).toBe(2);
    const idx = result[2].rawFields.indexOf("VDK_OBJECTNUMBER");
    expect(idx).toBeGreaterThan(-1);
    expect(result[2].rawFields[idx + 1]).toBe("2");
  });

  it("appends VDK_OBJECTNUMBER to rawFields when not present", () => {
    const entries = [
      placement("OBJECT", 0),
      placement("SKY", null, ["VDK_TYPE", "SKY"]),
    ];
    const result = ensureSkyPlacementObjectNumber(entries, 1);
    expect(result[1].objectNumber).toBe(1);
    const idx = result[1].rawFields.indexOf("VDK_OBJECTNUMBER");
    expect(idx).toBeGreaterThan(-1);
    expect(result[1].rawFields[idx + 1]).toBe("1");
  });

  it("uses modelFolderCount regardless of OBJECT objectNumbers", () => {
    const entries = [
      placement("OBJECT", 0),
      placement("OBJECT", 5),
      placement("SKY", null, ["VDK_TYPE", "SKY"]),
    ];
    const result = ensureSkyPlacementObjectNumber(entries, 2);
    expect(result[2].objectNumber).toBe(2);
  });

  it("is case insensitive for SKY type matching", () => {
    const entries = [
      placement("OBJECT", 0),
      placement("sky", null, ["VDK_TYPE", "sky"]),
    ];
    const result = ensureSkyPlacementObjectNumber(entries, 1);
    expect(result[1].objectNumber).toBe(1);
  });

  it("does not mutate the original entries array", () => {
    const original = [
      placement("OBJECT", 0),
      placement("SKY", null, ["VDK_TYPE", "SKY"]),
    ];
    const snapshot = JSON.parse(JSON.stringify(original));
    ensureSkyPlacementObjectNumber(original, 1);
    expect(original).toEqual(snapshot);
  });
});
