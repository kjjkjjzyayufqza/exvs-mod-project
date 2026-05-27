import { describe, expect, it } from "vitest";
import type { PlacementRow } from "../types/placement";
import { remapPlacementObjectNumbers } from "./remapPlacementObjectNumbers";

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

type SubModelRef = { folderName: string; objectIndex: number };

describe("remapPlacementObjectNumbers", () => {
  it("returns entries unchanged when subModels have not changed", () => {
    const models: SubModelRef[] = [
      { folderName: "aaa", objectIndex: 0 },
      { folderName: "bbb", objectIndex: 1 },
    ];
    const entries = [
      placement("OBJECT", 0),
      placement("OBJECT", 1),
      placement("EFFECT", null),
    ];
    const result = remapPlacementObjectNumbers(entries, models, models);
    expect(result).toEqual(entries);
  });

  it("removes OBJECT rows whose model was deleted", () => {
    const oldModels: SubModelRef[] = [
      { folderName: "aaa", objectIndex: 0 },
      { folderName: "bbb", objectIndex: 1 },
    ];
    const newModels: SubModelRef[] = [
      { folderName: "aaa", objectIndex: 0 },
    ];
    const entries = [
      placement("OBJECT", 0, ["VDK_TYPE", "OBJECT", "VDK_OBJECTNUMBER", "0"]),
      placement("OBJECT", 1, ["VDK_TYPE", "OBJECT", "VDK_OBJECTNUMBER", "1"]),
    ];
    const result = remapPlacementObjectNumbers(entries, oldModels, newModels);
    expect(result).toHaveLength(1);
    expect(result[0].objectNumber).toBe(0);
  });

  it("remaps indices when the first model is deleted", () => {
    const oldModels: SubModelRef[] = [
      { folderName: "aaa", objectIndex: 0 },
      { folderName: "bbb", objectIndex: 1 },
      { folderName: "ccc", objectIndex: 2 },
    ];
    const newModels: SubModelRef[] = [
      { folderName: "bbb", objectIndex: 0 },
      { folderName: "ccc", objectIndex: 1 },
    ];
    const entries = [
      placement("OBJECT", 0, ["VDK_TYPE", "OBJECT", "VDK_OBJECTNUMBER", "0"]),
      placement("OBJECT", 1, ["VDK_TYPE", "OBJECT", "VDK_OBJECTNUMBER", "1"]),
      placement("OBJECT", 2, ["VDK_TYPE", "OBJECT", "VDK_OBJECTNUMBER", "2"]),
    ];
    const result = remapPlacementObjectNumbers(entries, oldModels, newModels);
    expect(result).toHaveLength(2);
    expect(result[0].objectNumber).toBe(0);
    expect(result[1].objectNumber).toBe(1);
    const idx0 = result[0].rawFields.indexOf("VDK_OBJECTNUMBER");
    expect(result[0].rawFields[idx0 + 1]).toBe("0");
    const idx1 = result[1].rawFields.indexOf("VDK_OBJECTNUMBER");
    expect(result[1].rawFields[idx1 + 1]).toBe("1");
  });

  it("remaps when a model is added before existing ones", () => {
    const oldModels: SubModelRef[] = [
      { folderName: "ccc", objectIndex: 0 },
    ];
    const newModels: SubModelRef[] = [
      { folderName: "aaa", objectIndex: 0 },
      { folderName: "ccc", objectIndex: 1 },
    ];
    const entries = [
      placement("OBJECT", 0, ["VDK_TYPE", "OBJECT", "VDK_OBJECTNUMBER", "0"]),
    ];
    const result = remapPlacementObjectNumbers(entries, oldModels, newModels);
    expect(result).toHaveLength(1);
    expect(result[0].objectNumber).toBe(1);
    const idx = result[0].rawFields.indexOf("VDK_OBJECTNUMBER");
    expect(result[0].rawFields[idx + 1]).toBe("1");
  });

  it("handles simultaneous add and delete", () => {
    const oldModels: SubModelRef[] = [
      { folderName: "aaa", objectIndex: 0 },
      { folderName: "bbb", objectIndex: 1 },
    ];
    const newModels: SubModelRef[] = [
      { folderName: "bbb", objectIndex: 0 },
      { folderName: "ddd", objectIndex: 1 },
    ];
    const entries = [
      placement("OBJECT", 0, ["VDK_TYPE", "OBJECT", "VDK_OBJECTNUMBER", "0"]),
      placement("OBJECT", 1, ["VDK_TYPE", "OBJECT", "VDK_OBJECTNUMBER", "1"]),
    ];
    const result = remapPlacementObjectNumbers(entries, oldModels, newModels);
    expect(result).toHaveLength(1);
    expect(result[0].objectNumber).toBe(0);
  });

  it("preserves non-OBJECT rows unchanged", () => {
    const oldModels: SubModelRef[] = [{ folderName: "aaa", objectIndex: 0 }];
    const newModels: SubModelRef[] = [];
    const effect = placement("EFFECT", null);
    const sky = placement("SKY", 1);
    const entries = [effect, sky, placement("OBJECT", 0)];
    const result = remapPlacementObjectNumbers(entries, oldModels, newModels);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(effect);
    expect(result[1]).toEqual(sky);
  });

  it("preserves OBJECT rows with null objectNumber", () => {
    const oldModels: SubModelRef[] = [{ folderName: "aaa", objectIndex: 0 }];
    const entries = [placement("OBJECT", null)];
    const result = remapPlacementObjectNumbers(entries, oldModels, []);
    expect(result).toHaveLength(1);
    expect(result[0].objectNumber).toBeNull();
  });

  it("preserves OBJECT rows with unknown objectNumber defensively", () => {
    const oldModels: SubModelRef[] = [{ folderName: "aaa", objectIndex: 0 }];
    const newModels: SubModelRef[] = [{ folderName: "aaa", objectIndex: 0 }];
    const entries = [placement("OBJECT", 99)];
    const result = remapPlacementObjectNumbers(entries, oldModels, newModels);
    expect(result).toHaveLength(1);
    expect(result[0].objectNumber).toBe(99);
  });

  it("appends VDK_OBJECTNUMBER when rawFields lack it", () => {
    const oldModels: SubModelRef[] = [{ folderName: "aaa", objectIndex: 0 }];
    const newModels: SubModelRef[] = [{ folderName: "aaa", objectIndex: 5 }];
    const entries = [placement("OBJECT", 0, ["VDK_TYPE", "OBJECT"])];
    const result = remapPlacementObjectNumbers(entries, oldModels, newModels);
    expect(result[0].objectNumber).toBe(5);
    const idx = result[0].rawFields.indexOf("VDK_OBJECTNUMBER");
    expect(idx).toBeGreaterThan(-1);
    expect(result[0].rawFields[idx + 1]).toBe("5");
  });

  it("does not mutate the original entries", () => {
    const oldModels: SubModelRef[] = [
      { folderName: "aaa", objectIndex: 0 },
      { folderName: "bbb", objectIndex: 1 },
    ];
    const newModels: SubModelRef[] = [
      { folderName: "bbb", objectIndex: 0 },
    ];
    const entries = [
      placement("OBJECT", 0, ["VDK_TYPE", "OBJECT", "VDK_OBJECTNUMBER", "0"]),
      placement("OBJECT", 1, ["VDK_TYPE", "OBJECT", "VDK_OBJECTNUMBER", "1"]),
    ];
    const snapshot = JSON.parse(JSON.stringify(entries));
    remapPlacementObjectNumbers(entries, oldModels, newModels);
    expect(entries).toEqual(snapshot);
  });
});
