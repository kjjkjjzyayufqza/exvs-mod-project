/**
 * Simulation test: Adding SSBH models to a scene and verifying
 * that placement objectNumbers are auto-calculated correctly.
 *
 * Simulates real CSV data from: com/test/0x16F73C97/0/0/info/placement.csv
 */
import { describe, expect, it } from "vitest";
import type { PlacementRow } from "../types/placement";
import {
  applySubModelChangesAndRemap,
  createDefaultPlacementForModel,
  type SubModelChange,
  type SubModelRef,
} from "./applySubModelChanges";

// ─── Helper: parse placement.csv line into PlacementRow ───

function parsePlacementCsvLine(line: string): PlacementRow {
  const fields = line.split(",");
  let vdkType = "";
  let objectNumber: number | null = null;
  let posX = 0, posY = 0, posZ = 0;
  let rotX = 0, rotY = 0, rotZ = 0;

  for (let i = 0; i + 1 < fields.length; i += 2) {
    const key = fields[i].trim().toUpperCase();
    const val = fields[i + 1]?.trim() ?? "";
    switch (key) {
      case "VDK_TYPE": vdkType = val; break;
      case "VDK_OBJECTNUMBER": objectNumber = Number.parseInt(val); break;
      case "VDK_POSITION_X": posX = Number.parseFloat(val); break;
      case "VDK_POSITION_Y": posY = Number.parseFloat(val); break;
      case "VDK_POSITION_Z": posZ = Number.parseFloat(val); break;
      case "VDK_ROTATION_X": rotX = Number.parseFloat(val); break;
      case "VDK_ROTATION_Y": rotY = Number.parseFloat(val); break;
      case "VDK_ROTATION_Z": rotZ = Number.parseFloat(val); break;
    }
  }

  return {
    vdkType,
    objectNumber,
    posX, posY, posZ,
    rotX, rotY, rotZ,
    scaleX: 1, scaleY: 1, scaleZ: 1,
    rawFields: fields,
  };
}

// ─── Real data from 0x16F73C97 placement.csv ───

const REAL_PLACEMENT_CSV = [
  "VDK_TYPE,SKY,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,0.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,0.0,VDK_ROTATION_X,0.0,VDK_ROTATION_Y,0.0,VDK_ROTATION_Z,0.0,VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,1",
  "VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,250.0,VDK_POSITION_Y,-2.0,VDK_POSITION_Z,-250.0,VDK_ROTATION_X,0.0,VDK_ROTATION_Y,0.0,VDK_ROTATION_Z,0.0,VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,0,VDK_PROGRAMID,0,VDK_HITPOINT,UNBREAKABLE,VDK_SHADOW_CAST,TRUE",
  "VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,250.0,VDK_POSITION_Y,-2.0,VDK_POSITION_Z,250.0,VDK_ROTATION_X,0.0,VDK_ROTATION_Y,0.0,VDK_ROTATION_Z,0.0,VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,0,VDK_PROGRAMID,0,VDK_HITPOINT,UNBREAKABLE,VDK_SHADOW_CAST,TRUE",
  "VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,-250.0,VDK_POSITION_Y,-2.0,VDK_POSITION_Z,-250.0,VDK_ROTATION_X,0.0,VDK_ROTATION_Y,0.0,VDK_ROTATION_Z,0.0,VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,0,VDK_PROGRAMID,0,VDK_HITPOINT,UNBREAKABLE,VDK_SHADOW_CAST,TRUE",
  "VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,-250.0,VDK_POSITION_Y,-2.0,VDK_POSITION_Z,250.0,VDK_ROTATION_X,0.0,VDK_ROTATION_Y,0.0,VDK_ROTATION_Z,0.0,VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,0,VDK_PROGRAMID,0,VDK_HITPOINT,UNBREAKABLE,VDK_SHADOW_CAST,TRUE",
];

describe("Simulation: Add SSBH model to scene → auto-calculate placement objectNumbers", () => {
  // Base state: the test stage has 1 model folder "boxA" (objectIndex=0) and a SKY (objectNumber=1)
  const baseModels: SubModelRef[] = [
    { folderName: "boxA", objectIndex: 0 },
  ];

  function loadBaseEntries(): PlacementRow[] {
    return REAL_PLACEMENT_CSV.map(parsePlacementCsvLine);
  }

  it("Scenario 1: Add new SSBH model after boxA → boxA=0, newModel=1, SKY=2", () => {
    const entries = loadBaseEntries();
    const changes: SubModelChange[] = [
      { type: "add", folderName: "newModel_ssbh", insertAt: 1 },
    ];

    const result = applySubModelChangesAndRemap(entries, baseModels, changes);

    // Model list: boxA=0, newModel_ssbh=1
    expect(result.subModels).toEqual([
      { folderName: "boxA", objectIndex: 0 },
      { folderName: "newModel_ssbh", objectIndex: 1 },
    ]);

    // All 4 OBJECT placements still reference boxA → objectNumber stays 0
    const objects = result.entries.filter((e) => e.vdkType === "OBJECT");
    expect(objects).toHaveLength(4);
    for (const obj of objects) {
      expect(obj.objectNumber).toBe(0);
    }

    // SKY gets objectNumber = totalModelCount = 2
    const sky = result.entries.find((e) => e.vdkType === "SKY")!;
    expect(sky.objectNumber).toBe(2);

    // Now create default placement for the new model
    const newPlacement = createDefaultPlacementForModel("newModel_ssbh", 1);
    expect(newPlacement.objectNumber).toBe(1);
    expect(newPlacement.vdkType).toBe("OBJECT");

    // Final scene has 5 OBJECT rows + 1 SKY
    const finalEntries = [...result.entries, newPlacement];
    expect(finalEntries.filter((e) => e.vdkType === "OBJECT")).toHaveLength(5);
    expect(finalEntries.filter((e) => e.vdkType === "SKY")).toHaveLength(1);
  });

  it("Scenario 2: Add new model BEFORE boxA → newModel=0, boxA=1, SKY=2", () => {
    const entries = loadBaseEntries();
    const changes: SubModelChange[] = [
      { type: "add", folderName: "gundam_ssbh", insertAt: 0 },
    ];

    const result = applySubModelChangesAndRemap(entries, baseModels, changes);

    expect(result.subModels).toEqual([
      { folderName: "gundam_ssbh", objectIndex: 0 },
      { folderName: "boxA", objectIndex: 1 },
    ]);

    // boxA placements now point to 1 (shifted)
    const objects = result.entries.filter((e) => e.vdkType === "OBJECT");
    for (const obj of objects) {
      expect(obj.objectNumber).toBe(1);
    }

    // SKY = 2
    const sky = result.entries.find((e) => e.vdkType === "SKY")!;
    expect(sky.objectNumber).toBe(2);

    // Verify rawFields also updated
    for (const obj of objects) {
      const idx = obj.rawFields.indexOf("VDK_OBJECTNUMBER");
      expect(obj.rawFields[idx + 1]).toBe("1");
    }
  });

  it("Scenario 3: Add new model + delete boxA → only newModel remains", () => {
    const entries = loadBaseEntries();
    const changes: SubModelChange[] = [
      { type: "add", folderName: "replacement_ssbh", insertAt: 0 },
      { type: "remove", folderName: "boxA" },
    ];

    const result = applySubModelChangesAndRemap(entries, baseModels, changes);

    expect(result.subModels).toEqual([
      { folderName: "replacement_ssbh", objectIndex: 0 },
    ]);

    // All old boxA placements are removed (boxA was deleted)
    const objects = result.entries.filter((e) => e.vdkType === "OBJECT");
    expect(objects).toHaveLength(0);

    // SKY = 1 (1 model)
    const sky = result.entries.find((e) => e.vdkType === "SKY")!;
    expect(sky.objectNumber).toBe(1);

    // Create placement for replacement
    const newPlacement = createDefaultPlacementForModel("replacement_ssbh", 0);
    const finalEntries = [...result.entries, newPlacement];
    expect(finalEntries.filter((e) => e.vdkType === "OBJECT")).toHaveLength(1);
    expect(finalEntries[1].objectNumber).toBe(0);
  });

  it("Scenario 4: Complex multi-model stage — add 2 models, remove 1", () => {
    // A more complex stage with multiple models
    const complexModels: SubModelRef[] = [
      { folderName: "ground", objectIndex: 0 },
      { folderName: "building_A", objectIndex: 1 },
      { folderName: "building_B", objectIndex: 2 },
      { folderName: "debris", objectIndex: 3 },
    ];
    const entries: PlacementRow[] = [
      parsePlacementCsvLine("VDK_TYPE,SKY,VDK_OBJECTNUMBER,4"),
      parsePlacementCsvLine("VDK_TYPE,OBJECT,VDK_OBJECTNUMBER,0,VDK_POSITION_X,0.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,0.0"),
      parsePlacementCsvLine("VDK_TYPE,OBJECT,VDK_OBJECTNUMBER,1,VDK_POSITION_X,100.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,50.0"),
      parsePlacementCsvLine("VDK_TYPE,OBJECT,VDK_OBJECTNUMBER,1,VDK_POSITION_X,-100.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,50.0"),
      parsePlacementCsvLine("VDK_TYPE,OBJECT,VDK_OBJECTNUMBER,2,VDK_POSITION_X,200.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,0.0"),
      parsePlacementCsvLine("VDK_TYPE,OBJECT,VDK_OBJECTNUMBER,3,VDK_POSITION_X,50.0,VDK_POSITION_Y,-5.0,VDK_POSITION_Z,30.0"),
      parsePlacementCsvLine("VDK_TYPE,EFFECT,VDK_EFFECT_ID,EFF_SMOKE_001,VDK_POSITION_X,0.0,VDK_POSITION_Y,10.0,VDK_POSITION_Z,0.0"),
    ];

    // Operation: remove building_B, add "ms_ssbh" at index 2, add "colony_ssbh" at end
    const changes: SubModelChange[] = [
      { type: "remove", folderName: "building_B" },
      { type: "add", folderName: "ms_ssbh", insertAt: 2 },
      { type: "add", folderName: "colony_ssbh", insertAt: 4 },
    ];

    const result = applySubModelChangesAndRemap(entries, complexModels, changes);

    // After remove building_B: [ground:0, building_A:1, debris:2]
    // After add ms_ssbh at 2:   [ground:0, building_A:1, ms_ssbh:2, debris:3]
    // After add colony_ssbh at 4: [ground:0, building_A:1, ms_ssbh:2, debris:3, colony_ssbh:4]
    expect(result.subModels).toEqual([
      { folderName: "ground", objectIndex: 0 },
      { folderName: "building_A", objectIndex: 1 },
      { folderName: "ms_ssbh", objectIndex: 2 },
      { folderName: "debris", objectIndex: 3 },
      { folderName: "colony_ssbh", objectIndex: 4 },
    ]);

    // Verify remapping:
    // SKY = 5 (total models)
    const sky = result.entries.find((e) => e.vdkType === "SKY")!;
    expect(sky.objectNumber).toBe(5);

    // ground stays 0
    const groundPlacements = result.entries.filter(
      (e) => e.vdkType === "OBJECT" && e.objectNumber === 0,
    );
    expect(groundPlacements).toHaveLength(1);

    // building_A stays 1
    const buildingAPlacements = result.entries.filter(
      (e) => e.vdkType === "OBJECT" && e.objectNumber === 1,
    );
    expect(buildingAPlacements).toHaveLength(2); // had 2 instances

    // building_B was removed → its placement (was obj=2) is gone
    // debris was 3 → now 3
    const debrisPlacements = result.entries.filter(
      (e) => e.vdkType === "OBJECT" && e.objectNumber === 3,
    );
    expect(debrisPlacements).toHaveLength(1);

    // EFFECT has no objectNumber logic → passes through
    const effects = result.entries.filter((e) => e.vdkType === "EFFECT");
    expect(effects).toHaveLength(1);

    // Total: 1 SKY + 1 ground + 2 building_A + 1 debris + 1 EFFECT = 6
    // (building_B's 1 placement was removed)
    expect(result.entries).toHaveLength(6);

    // Create placements for the new models
    const msPlacement = createDefaultPlacementForModel("ms_ssbh", 2);
    const colonyPlacement = createDefaultPlacementForModel("colony_ssbh", 4);
    expect(msPlacement.objectNumber).toBe(2);
    expect(colonyPlacement.objectNumber).toBe(4);
  });

  it("Scenario 5: Reorder models → all placements remap to new indices", () => {
    const models: SubModelRef[] = [
      { folderName: "alpha", objectIndex: 0 },
      { folderName: "beta", objectIndex: 1 },
      { folderName: "gamma", objectIndex: 2 },
    ];
    const entries: PlacementRow[] = [
      parsePlacementCsvLine("VDK_TYPE,SKY,VDK_OBJECTNUMBER,3"),
      parsePlacementCsvLine("VDK_TYPE,OBJECT,VDK_OBJECTNUMBER,0,VDK_POSITION_X,10.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,0.0"),
      parsePlacementCsvLine("VDK_TYPE,OBJECT,VDK_OBJECTNUMBER,1,VDK_POSITION_X,20.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,0.0"),
      parsePlacementCsvLine("VDK_TYPE,OBJECT,VDK_OBJECTNUMBER,2,VDK_POSITION_X,30.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,0.0"),
    ];

    // Reverse order: gamma→0, beta→1, alpha→2
    const changes: SubModelChange[] = [
      { type: "reorder", order: ["gamma", "beta", "alpha"] },
    ];

    const result = applySubModelChangesAndRemap(entries, models, changes);

    expect(result.subModels).toEqual([
      { folderName: "gamma", objectIndex: 0 },
      { folderName: "beta", objectIndex: 1 },
      { folderName: "alpha", objectIndex: 2 },
    ]);

    // alpha was 0 → now 2
    const alpha = result.entries.find((e) => e.posX === 10)!;
    expect(alpha.objectNumber).toBe(2);

    // beta was 1 → still 1
    const beta = result.entries.find((e) => e.posX === 20)!;
    expect(beta.objectNumber).toBe(1);

    // gamma was 2 → now 0
    const gamma = result.entries.find((e) => e.posX === 30)!;
    expect(gamma.objectNumber).toBe(0);

    // SKY = 3 (unchanged, 3 models)
    const sky = result.entries.find((e) => e.vdkType === "SKY")!;
    expect(sky.objectNumber).toBe(3);
  });
});
