import { describe, expect, it } from "vitest";
import {
  buildImportedDaeStageRegistrationPlan,
  buildImportedDaeSsbhConvertParams,
  createImportedDaePlacementRow,
  createImportedDaeJnttblBytes,
  sanitizeSsbhBaseName,
} from "./sceneDaeSsbhSave";

describe("sceneDaeSsbhSave", () => {
  it("sanitizes imported DAE names for generated SSBH files and folders", () => {
    expect(sanitizeSsbhBaseName("Boss Sword:lod/0")).toBe("Boss_Sword_lod_0");
    expect(() => sanitizeSsbhBaseName("   ")).toThrow("Imported DAE name");
  });

  it("builds TestEditor-compatible DAE to SSBH conversion parameters for all analyzed geometries", () => {
    const params = buildImportedDaeSsbhConvertParams({
      stageRoot: "E:/stage/root",
      objectName: "Boss Sword",
      geometryNames: ["mesh_a", "mesh_b"],
      scaleFactor: 1,
      upAxis: "y_up",
    });

    expect(params.outputDir).toBe("E:/stage/root/Boss_Sword/0");
    expect(params.baseFilename).toBe("Boss_Sword");
    expect(params.includeGeometryNames).toEqual(["mesh_a", "mesh_b"]);
    expect(params.numdlbEntries).toEqual([
      { meshObjectName: "mesh_a", meshObjectSubindex: 0, materialLabel: "pbr1Mtl" },
      { meshObjectName: "mesh_b", meshObjectSubindex: 0, materialLabel: "pbr1Mtl" },
    ]);
    expect(params.writeNumdlb).toBe(true);
    expect(params.writeNumshb).toBe(true);
    expect(params.writeNusktb).toBe(true);
    expect(params.writeNumatb).toBe(true);
    expect(params.writeMayaProfile).toBe(true);
  });

  it("allocates a unique direct stage model folder for imported DAE conversion", () => {
    const plan = buildImportedDaeStageRegistrationPlan({
      stageRoot: "E:/stage/root/",
      objectName: "Boss Sword.dae",
      existingFolderNames: ["base", "info", "Boss_Sword", "Boss_Sword_1", "textures"],
    });

    expect(plan.baseFilename).toBe("Boss_Sword_2");
    expect(plan.folderName).toBe("Boss_Sword_2");
    expect(plan.outputDir).toBe("E:/stage/root/Boss_Sword_2/0");
  });

  it("allocates imported DAE folders after existing stage object folders to preserve object numbers", () => {
    const plan = buildImportedDaeStageRegistrationPlan({
      stageRoot: "E:/stage/root",
      objectName: "fullout.dae",
      existingFolderNames: ["001stage001_object_box01", "base", "info", "sky"],
    });

    expect(plan.folderName).toBe("zzzz_import_fullout");
    expect(plan.outputDir).toBe("E:/stage/root/zzzz_import_fullout/0");
  });

  it("creates an OBJECT placement row that references the converted stage object index", () => {
    const row = createImportedDaePlacementRow({
      objectIndex: 7,
      transform: {
        posX: 10,
        posY: 20,
        posZ: 30,
        rotX: 45,
        rotY: 90,
        rotZ: 135,
        scaleX: 1.25,
        scaleY: 1.5,
        scaleZ: 1.75,
      },
    });

    expect(row.vdkType).toBe("OBJECT");
    expect(row.objectNumber).toBe(7);
    expect(row.posX).toBe(10);
    expect(row.rotY).toBe(90);
    expect(row.scaleZ).toBe(1.75);
    expect(row.rawFields).toEqual([
      "VDK_TYPE", "OBJECT",
      "VDK_OBJECTNUMBER", "7",
      "VDK_PROGRAMID", "0",
      "VDK_POSITION_X", "10",
      "VDK_POSITION_Y", "20",
      "VDK_POSITION_Z", "30",
      "VDK_ROTATION_X", "45",
      "VDK_ROTATION_Y", "90",
      "VDK_ROTATION_Z", "135",
      "VDK_SCALE_X", "1.25",
      "VDK_SCALE_Y", "1.5",
      "VDK_SCALE_Z", "1.75",
    ]);
  });

  it("creates a table-shaped placement row when the stage placement CSV has a header", () => {
    const row = createImportedDaePlacementRow({
      objectIndex: 7,
      placementHeader: [
        "VDK_TYPE",
        "VDK_OBJECTNUMBER",
        "VDK_POS_X",
        "VDK_POS_Y",
        "VDK_POS_Z",
        "VDK_ROT_X",
        "VDK_ROT_Y",
        "VDK_ROT_Z",
        "VDK_SCALE_X",
        "VDK_SCALE_Y",
        "VDK_SCALE_Z",
        "VDK_PROGRAMID",
      ],
      transform: {
        posX: 10,
        posY: 20,
        posZ: 30,
        rotX: 45,
        rotY: 90,
        rotZ: 135,
        scaleX: 1.25,
        scaleY: 1.5,
        scaleZ: 1.75,
      },
    });

    expect(row.objectNumber).toBe(7);
    expect(row.rawFields).toEqual([
      "OBJECT",
      "7",
      "10",
      "20",
      "30",
      "45",
      "90",
      "135",
      "1.25",
      "1.5",
      "1.75",
      "0",
    ]);
  });

  it("creates a JNTT joint table binary for converted imported DAE skeletons", () => {
    const bytes = createImportedDaeJnttblBytes(2);

    expect([...bytes]).toEqual([
      0x4A, 0x4E, 0x54, 0x54,
      0x01, 0x00, 0x00, 0x00,
      0x02, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x00, 0x00,
    ]);
  });
});
