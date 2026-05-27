import { describe, expect, it } from "vitest";
import type { PlacementRow } from "../types/placement";
import {
  applySubModelChangesAndRemap,
  createDefaultPlacementForModel,
  type SubModelChange,
  type SubModelRef,
} from "./applySubModelChanges";

function placement(
  type: string,
  objectNumber: number | null,
  overrides?: Partial<PlacementRow>,
): PlacementRow {
  const rawFields = ["VDK_TYPE", type];
  if (objectNumber !== null) {
    rawFields.push("VDK_OBJECTNUMBER", String(objectNumber));
  }
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
    rawFields,
    ...overrides,
  };
}

describe("applySubModelChangesAndRemap", () => {
  describe("add model", () => {
    it("adds a model at the end — no remap needed for existing", () => {
      const models: SubModelRef[] = [
        { folderName: "boxA", objectIndex: 0 },
        { folderName: "sky", objectIndex: 1 },
      ];
      const entries = [
        placement("OBJECT", 0),
        placement("SKY", 1),
      ];
      const changes: SubModelChange[] = [
        { type: "add", folderName: "newModel", insertAt: 1 },
      ];

      const result = applySubModelChangesAndRemap(entries, models, changes);

      // newModel inserted at 1, sky moves to 2
      expect(result.subModels).toEqual([
        { folderName: "boxA", objectIndex: 0 },
        { folderName: "newModel", objectIndex: 1 },
        { folderName: "sky", objectIndex: 2 },
      ]);
      // boxA stays 0
      expect(result.entries[0].objectNumber).toBe(0);
      // SKY gets totalModelCount = 3
      expect(result.entries[1].objectNumber).toBe(3);
    });

    it("adds a model at index 0 — shifts all existing", () => {
      const models: SubModelRef[] = [
        { folderName: "boxA", objectIndex: 0 },
      ];
      const entries = [
        placement("OBJECT", 0),
        placement("OBJECT", 0),
      ];
      const changes: SubModelChange[] = [
        { type: "add", folderName: "newFirst", insertAt: 0 },
      ];

      const result = applySubModelChangesAndRemap(entries, models, changes);

      expect(result.subModels[0].folderName).toBe("newFirst");
      expect(result.subModels[1].folderName).toBe("boxA");
      // All boxA placements now point to index 1
      expect(result.entries[0].objectNumber).toBe(1);
      expect(result.entries[1].objectNumber).toBe(1);
    });

    it("adds model in the middle — original example: boxA=0, sky=1, add newModel → boxA=0, newModel=1, sky=2", () => {
      const models: SubModelRef[] = [
        { folderName: "boxA", objectIndex: 0 },
        { folderName: "sky_model", objectIndex: 1 },
      ];
      const entries = [
        placement("OBJECT", 0), // boxA
        placement("OBJECT", 1), // sky_model
        placement("SKY", 1),
      ];
      const changes: SubModelChange[] = [
        { type: "add", folderName: "newModel", insertAt: 1 },
      ];

      const result = applySubModelChangesAndRemap(entries, models, changes);

      expect(result.subModels).toEqual([
        { folderName: "boxA", objectIndex: 0 },
        { folderName: "newModel", objectIndex: 1 },
        { folderName: "sky_model", objectIndex: 2 },
      ]);
      expect(result.entries[0].objectNumber).toBe(0); // boxA unchanged
      expect(result.entries[1].objectNumber).toBe(2); // sky_model shifted
      expect(result.entries[2].objectNumber).toBe(3); // SKY = total model count
    });
  });

  describe("remove model", () => {
    it("removes a model — drops its placements and shifts down", () => {
      const models: SubModelRef[] = [
        { folderName: "boxA", objectIndex: 0 },
        { folderName: "boxB", objectIndex: 1 },
        { folderName: "boxC", objectIndex: 2 },
      ];
      const entries = [
        placement("OBJECT", 0),
        placement("OBJECT", 1), // will be removed
        placement("OBJECT", 2),
        placement("SKY", 3),
      ];
      const changes: SubModelChange[] = [
        { type: "remove", folderName: "boxB" },
      ];

      const result = applySubModelChangesAndRemap(entries, models, changes);

      expect(result.subModels).toEqual([
        { folderName: "boxA", objectIndex: 0 },
        { folderName: "boxC", objectIndex: 1 },
      ]);
      // boxA stays 0, boxB placement removed, boxC becomes 1
      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].objectNumber).toBe(0);
      expect(result.entries[1].objectNumber).toBe(1); // was boxC(2)
      expect(result.entries[2].objectNumber).toBe(2); // SKY = 2 models
    });

    it("removes the first model — all shift down", () => {
      const models: SubModelRef[] = [
        { folderName: "aaa", objectIndex: 0 },
        { folderName: "bbb", objectIndex: 1 },
        { folderName: "ccc", objectIndex: 2 },
      ];
      const entries = [
        placement("OBJECT", 0), // aaa - will be dropped
        placement("OBJECT", 1), // bbb → 0
        placement("OBJECT", 2), // ccc → 1
      ];
      const changes: SubModelChange[] = [
        { type: "remove", folderName: "aaa" },
      ];

      const result = applySubModelChangesAndRemap(entries, models, changes);

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].objectNumber).toBe(0);
      expect(result.entries[1].objectNumber).toBe(1);
    });
  });

  describe("simultaneous add and remove", () => {
    it("add one + remove one in sequence", () => {
      const models: SubModelRef[] = [
        { folderName: "boxA", objectIndex: 0 },
        { folderName: "boxB", objectIndex: 1 },
      ];
      const entries = [
        placement("OBJECT", 0), // boxA
        placement("OBJECT", 1), // boxB - will be removed
        placement("SKY", 2),
      ];
      const changes: SubModelChange[] = [
        { type: "remove", folderName: "boxB" },
        { type: "add", folderName: "newModel", insertAt: 1 },
      ];

      const result = applySubModelChangesAndRemap(entries, models, changes);

      // After remove: [boxA:0]
      // After add at 1: [boxA:0, newModel:1]
      expect(result.subModels).toEqual([
        { folderName: "boxA", objectIndex: 0 },
        { folderName: "newModel", objectIndex: 1 },
      ]);
      expect(result.entries).toHaveLength(2); // boxB placement dropped
      expect(result.entries[0].objectNumber).toBe(0); // boxA
      expect(result.entries[1].objectNumber).toBe(2); // SKY = 2 models
    });

    it("remove + add at same position (replacement)", () => {
      const models: SubModelRef[] = [
        { folderName: "old", objectIndex: 0 },
      ];
      const entries = [
        placement("OBJECT", 0),
      ];
      const changes: SubModelChange[] = [
        { type: "remove", folderName: "old" },
        { type: "add", folderName: "replacement", insertAt: 0 },
      ];

      const result = applySubModelChangesAndRemap(entries, models, changes);

      expect(result.subModels).toEqual([
        { folderName: "replacement", objectIndex: 0 },
      ]);
      // Old placement is dropped because "old" folder was removed
      expect(result.entries).toHaveLength(0);
    });
  });

  describe("reorder", () => {
    it("reverses model order — remaps all placements", () => {
      const models: SubModelRef[] = [
        { folderName: "aaa", objectIndex: 0 },
        { folderName: "bbb", objectIndex: 1 },
        { folderName: "ccc", objectIndex: 2 },
      ];
      const entries = [
        placement("OBJECT", 0), // aaa → 2
        placement("OBJECT", 1), // bbb → 1
        placement("OBJECT", 2), // ccc → 0
      ];
      const changes: SubModelChange[] = [
        { type: "reorder", order: ["ccc", "bbb", "aaa"] },
      ];

      const result = applySubModelChangesAndRemap(entries, models, changes);

      expect(result.subModels).toEqual([
        { folderName: "ccc", objectIndex: 0 },
        { folderName: "bbb", objectIndex: 1 },
        { folderName: "aaa", objectIndex: 2 },
      ]);
      expect(result.entries[0].objectNumber).toBe(2); // aaa
      expect(result.entries[1].objectNumber).toBe(1); // bbb (unchanged)
      expect(result.entries[2].objectNumber).toBe(0); // ccc
    });
  });

  describe("edge cases", () => {
    it("preserves EFFECT entries with no objectNumber", () => {
      const models: SubModelRef[] = [{ folderName: "a", objectIndex: 0 }];
      const entries = [
        placement("EFFECT", null),
        placement("OBJECT", 0),
      ];
      const changes: SubModelChange[] = [
        { type: "remove", folderName: "a" },
      ];

      const result = applySubModelChangesAndRemap(entries, models, changes);

      // EFFECT preserved, OBJECT dropped
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].vdkType).toBe("EFFECT");
    });

    it("preserves OBJECT with null objectNumber unchanged", () => {
      const models: SubModelRef[] = [{ folderName: "a", objectIndex: 0 }];
      const entries = [placement("OBJECT", null)];
      const changes: SubModelChange[] = [
        { type: "add", folderName: "b", insertAt: 0 },
      ];

      const result = applySubModelChangesAndRemap(entries, models, changes);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].objectNumber).toBeNull();
    });

    it("preserves OBJECT with unknown objectNumber defensively", () => {
      const models: SubModelRef[] = [{ folderName: "a", objectIndex: 0 }];
      const entries = [placement("OBJECT", 99)];
      const changes: SubModelChange[] = [
        { type: "add", folderName: "b", insertAt: 0 },
      ];

      const result = applySubModelChangesAndRemap(entries, models, changes);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].objectNumber).toBe(99);
    });

    it("does not mutate original entries", () => {
      const models: SubModelRef[] = [
        { folderName: "a", objectIndex: 0 },
        { folderName: "b", objectIndex: 1 },
      ];
      const entries = [
        placement("OBJECT", 0),
        placement("OBJECT", 1),
      ];
      const snapshot = JSON.parse(JSON.stringify(entries));
      const changes: SubModelChange[] = [
        { type: "remove", folderName: "a" },
      ];

      applySubModelChangesAndRemap(entries, models, changes);
      expect(entries).toEqual(snapshot);
    });

    it("updates rawFields VDK_OBJECTNUMBER when remapping", () => {
      const models: SubModelRef[] = [
        { folderName: "a", objectIndex: 0 },
        { folderName: "b", objectIndex: 1 },
      ];
      const entries = [
        placement("OBJECT", 1), // b → will become 0
      ];
      const changes: SubModelChange[] = [
        { type: "remove", folderName: "a" },
      ];

      const result = applySubModelChangesAndRemap(entries, models, changes);
      const idx = result.entries[0].rawFields.indexOf("VDK_OBJECTNUMBER");
      expect(idx).toBeGreaterThan(-1);
      expect(result.entries[0].rawFields[idx + 1]).toBe("0");
    });

    it("handles empty model list", () => {
      const models: SubModelRef[] = [];
      const entries = [placement("SKY", 0)];
      const changes: SubModelChange[] = [
        { type: "add", folderName: "first", insertAt: 0 },
      ];

      const result = applySubModelChangesAndRemap(entries, models, changes);
      expect(result.subModels).toEqual([{ folderName: "first", objectIndex: 0 }]);
      expect(result.entries[0].objectNumber).toBe(1); // SKY = 1 model
    });

    it("handles multiple adds in sequence", () => {
      const models: SubModelRef[] = [
        { folderName: "existing", objectIndex: 0 },
      ];
      const entries = [
        placement("OBJECT", 0),
        placement("SKY", 1),
      ];
      const changes: SubModelChange[] = [
        { type: "add", folderName: "new1", insertAt: 0 },
        { type: "add", folderName: "new2", insertAt: 2 },
      ];

      const result = applySubModelChangesAndRemap(entries, models, changes);

      // After first add at 0: [new1:0, existing:1]
      // After second add at 2: [new1:0, existing:1, new2:2]
      expect(result.subModels).toEqual([
        { folderName: "new1", objectIndex: 0 },
        { folderName: "existing", objectIndex: 1 },
        { folderName: "new2", objectIndex: 2 },
      ]);
      expect(result.entries[0].objectNumber).toBe(1); // existing shifted
      expect(result.entries[1].objectNumber).toBe(3); // SKY = 3 models
    });
  });
});

describe("createDefaultPlacementForModel", () => {
  it("creates valid OBJECT placement with correct objectIndex", () => {
    const result = createDefaultPlacementForModel("myModel", 5);

    expect(result.vdkType).toBe("OBJECT");
    expect(result.objectNumber).toBe(5);
    expect(result.posX).toBe(0);
    expect(result.posY).toBe(0);
    expect(result.posZ).toBe(0);

    const idx = result.rawFields.indexOf("VDK_OBJECTNUMBER");
    expect(idx).toBeGreaterThan(-1);
    expect(result.rawFields[idx + 1]).toBe("5");
  });

  it("includes essential VDK fields", () => {
    const result = createDefaultPlacementForModel("test", 0);

    expect(result.rawFields).toContain("VDK_TYPE");
    expect(result.rawFields).toContain("VDK_INITIAL_SPAWN");
    expect(result.rawFields).toContain("VDK_HITPOINT");
    expect(result.rawFields).toContain("VDK_SHADOW_CAST");
  });
});
