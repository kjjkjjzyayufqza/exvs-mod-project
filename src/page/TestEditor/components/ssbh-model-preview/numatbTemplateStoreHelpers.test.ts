import { describe, expect, it } from "vitest";
import { createEmptyNumatbFile, type NumdlbMappingRow } from "./daeSsbhTypes";
import { EXVS_MAYA_TEMPLATE_FIXTURE, EXVS_NUST_TEMPLATE_FIXTURE } from "./exvsNumatbFixtures";
import { flattenEntryToAttributes } from "./store/matlEntryFlat";
import {
  collectMissingTexturePathSlotRefsForExportSession,
  collectMissingTexturePathSlots,
  collectMissingTexturePathsForExportSession,
  collectNumatbEmptyTexturePathErrors,
  mirrorTexturePathOntoOtherProfile,
  syncProfilesWithMappings,
  upsertProfileEntriesFromTemplate,
} from "./store/numatbTemplateStoreHelpers";

describe("numatb template helpers", () => {
  const rows: NumdlbMappingRow[] = [
    {
      meshObjectName: "bodyShape",
      meshObjectSubindex: 0,
      materialLabel: "bodyMaterial",
    },
    {
      meshObjectName: "weaponShape",
      meshObjectSubindex: 0,
      materialLabel: "weaponMaterial",
    },
  ];

  it("clones maya template attributes for mapped material labels", () => {
    const result = upsertProfileEntriesFromTemplate(
      createEmptyNumatbFile(),
      EXVS_MAYA_TEMPLATE_FIXTURE,
      rows,
      "maya",
    );

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].material_label).toBe("bodyMaterial");
    expect(result.entries[1].material_label).toBe("weaponMaterial");
    expect(result.entries[0].shader_label).toBe("");
    expect(flattenEntryToAttributes(result.entries[0]).map((attribute) => attribute.param_id)).toEqual(
      expect.arrayContaining(["BlendState0", "RasterizerState0", "DiffuseMap", "DiffuseSampler"]),
    );
  });

  it("clones nust template attributes and preserves runtime shader naming", () => {
    const result = upsertProfileEntriesFromTemplate(
      createEmptyNumatbFile(),
      EXVS_NUST_TEMPLATE_FIXTURE,
      rows,
      "nust",
    );

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].material_label).toBe("bodyMaterial");
    expect(result.entries[0].shader_label).toBe("vsngCharaBasic");
    expect(flattenEntryToAttributes(result.entries[0]).map((attribute) => attribute.param_id)).toEqual(
      expect.arrayContaining(["DiffuseCubeMap", "BaseColorMap", "DiffuseSampler", "EmissiveScale"]),
    );
  });

  it("keeps maya and nust profiles aligned with current numdlb mappings", () => {
    const initial = syncProfilesWithMappings(createEmptyNumatbFile(), createEmptyNumatbFile(), rows);
    expect(initial.mayaFile.entries.map((entry) => entry.material_label)).toEqual([
      "bodyMaterial",
      "weaponMaterial",
    ]);
    expect(initial.nustFile.entries.map((entry) => entry.material_label)).toEqual([
      "bodyMaterial",
      "weaponMaterial",
    ]);

    const reducedRows: NumdlbMappingRow[] = [rows[0]];
    const reduced = syncProfilesWithMappings(initial.mayaFile, initial.nustFile, reducedRows);
    expect(reduced.mayaFile.entries.map((entry) => entry.material_label)).toEqual(["bodyMaterial"]);
    expect(reduced.nustFile.entries.map((entry) => entry.material_label)).toEqual(["bodyMaterial"]);
  });

  it("collectMissingTexturePathSlots flags RoughnessMap only when UseRoughnessMap is true", () => {
    const file = createEmptyNumatbFile();
    file.entries.push({
      material_label: "m1",
      shader_label: "",
      textures: [],
      textures2: [{ param_id: "RoughnessMap", data: "" }],
      booleans: [{ param_id: "UseRoughnessMap", data: false }],
    });
    expect(collectMissingTexturePathSlots(file)).toEqual([]);

    file.entries[0].booleans = [{ param_id: "UseRoughnessMap", data: true }];
    expect(collectMissingTexturePathSlots(file)).toEqual([
      "m1 → RoughnessMap (textures2)",
    ]);
  });

  it("collectMissingTexturePathSlots flags base color when slot exists and NormalMap only when UseNormalMap is true", () => {
    const file = createEmptyNumatbFile();
    file.entries.push({
      material_label: "m1",
      shader_label: "",
      textures: [],
      textures2: [{ param_id: "BaseColorMap", data: undefined as unknown as string }],
    });
    file.entries.push({
      material_label: "m2",
      shader_label: "",
      textures: [],
      textures2: [{ param_id: "NormalMap", data: null as unknown as string }],
      booleans: [{ param_id: "UseNormalMap", data: true }],
    });
    expect(collectMissingTexturePathSlots(file)).toEqual([
      "m1 → BaseColorMap (textures2)",
      "m2 → NormalMap (textures2)",
    ]);
  });

  it("collectMissingTexturePathSlots validates Texture1 only when the entry declares it", () => {
    const file = createEmptyNumatbFile();
    file.entries.push({
      material_label: "m1",
      shader_label: "",
      textures: [],
      textures2: [{ param_id: "BaseColorMap", data: "path/to/base" }],
    });
    // No Texture1 row -> Texture1 is not forced.
    expect(collectMissingTexturePathSlots(file)).toEqual([]);

    // Declaring an empty Texture1 -> flagged.
    file.entries[0].textures2?.push({ param_id: "Texture1", data: "" });
    expect(collectMissingTexturePathSlots(file)).toEqual(["m1 → Texture1 (textures2)"]);

    // Filling it -> complete again.
    file.entries[0].textures2 = [
      { param_id: "BaseColorMap", data: "path/to/base" },
      { param_id: "Texture1", data: "path/to/tex" },
    ];
    expect(collectMissingTexturePathSlots(file)).toEqual([]);
  });

  it("collectNumatbEmptyTexturePathErrors formats backend-style messages for both profiles", () => {
    const mayaFile = createEmptyNumatbFile();
    mayaFile.entries.push({
      material_label: "m_sky",
      shader_label: "",
      textures: [],
      textures2: [{ param_id: "Texture1", data: "" }],
    });
    const nustFile = createEmptyNumatbFile();
    nustFile.entries.push({
      material_label: "m_sky",
      shader_label: "",
      textures: [],
      textures2: [{ param_id: "Texture1", data: "" }],
    });

    const errors = collectNumatbEmptyTexturePathErrors(
      { mayaFile, nustFile },
      {
        modelName: "sky/0",
        mayaNumatbName: "001stage001_sky__maya__.numatb",
        nustNumatbName: "001stage001_sky__nust__.numatb",
      },
    );

    expect(errors.map((error) => error.message)).toEqual([
      "Model 'sky/0': material 'm_sky' texture parameter 'Texture1' (textures2) has an empty path (001stage001_sky__maya__.numatb).",
      "Model 'sky/0': material 'm_sky' texture parameter 'Texture1' (textures2) has an empty path (001stage001_sky__nust__.numatb).",
    ]);
    expect(errors[0].profile).toBe("maya");
    expect(errors[1].profile).toBe("nust");
    expect(errors[0].isTextures2).toBe(true);
  });

  it("collectNumatbEmptyTexturePathErrors skips a profile whose numatb file is absent", () => {
    const file = createEmptyNumatbFile();
    file.entries.push({
      material_label: "m_sky",
      shader_label: "",
      textures: [],
      textures2: [{ param_id: "Texture1", data: "" }],
    });

    const errors = collectNumatbEmptyTexturePathErrors(
      { mayaFile: file, nustFile: file },
      { modelName: "sky/0", mayaNumatbName: null, nustNumatbName: "sky__nust__.numatb" },
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].profile).toBe("nust");
    expect(errors[0].numatbName).toBe("sky__nust__.numatb");
  });

  it("collectMissingTexturePathSlotRefsForExportSession returns structured slot refs", () => {
    const maya = createEmptyNumatbFile();
    maya.entries.push({
      material_label: "m1",
      shader_label: "",
      textures: [{ param_id: "DiffuseMap", data: "" }],
    });
    const nust = createEmptyNumatbFile();
    nust.entries.push({
      material_label: "m2",
      shader_label: "",
      textures: [],
      textures2: [{ param_id: "BaseColorMap", data: "" }],
    });

    const refs = collectMissingTexturePathSlotRefsForExportSession(maya, nust, {
      writeNumatb: true,
      writeMayaProfile: true,
    });

    expect(refs).toEqual([
      {
        profile: "maya",
        materialLabel: "m1",
        paramId: "DiffuseMap",
        materialIndex: 0,
        attributeIndex: 0,
        value: "",
        textureDataKind: "String",
      },
      {
        profile: "nust",
        materialLabel: "m2",
        paramId: "BaseColorMap",
        materialIndex: 0,
        attributeIndex: 0,
        value: "",
        textureDataKind: "String1",
      },
    ]);
  });

  it("collectMissingTexturePathsForExportSession only checks profiles that will be written", () => {
    const maya = createEmptyNumatbFile();
    maya.entries.push({
      material_label: "a",
      shader_label: "",
      textures: [{ param_id: "BaseColorMap", data: "" }],
    });
    const nust = createEmptyNumatbFile();
    nust.entries.push({
      material_label: "b",
      shader_label: "",
      textures: [{ param_id: "BaseColorMap", data: "" }],
    });
    const onlyNustBase = collectMissingTexturePathsForExportSession(maya, nust, {
      writeNumatb: true,
      writeMayaProfile: false,
    });
    expect(onlyNustBase).toEqual([
      "Nust profile: b → BaseColorMap",
    ]);
  });

  it("collectMissingTexturePathsForExportSession validates every material entry by default", () => {
    const maya = createEmptyNumatbFile();
    maya.entries.push({
      material_label: "mappedMtl",
      shader_label: "",
      textures: [{ param_id: "DiffuseMap", data: "filled" }],
    });
    maya.entries.push({
      material_label: "extraMtl",
      shader_label: "",
      textures: [{ param_id: "Texture1", data: "" }],
    });
    const out = collectMissingTexturePathsForExportSession(maya, createEmptyNumatbFile(), {
      writeNumatb: false,
      writeMayaProfile: true,
    });
    expect(out).toEqual([
      "Maya profile: extraMtl → Texture1",
    ]);
  });

  it("collectMissingTexturePathsForExportSession can narrow checks with materialLabels", () => {
    const maya = createEmptyNumatbFile();
    maya.entries.push({
      material_label: "onlyMapped",
      shader_label: "",
      textures: [{ param_id: "DiffuseMap", data: "" }],
    });
    maya.entries.push({
      material_label: "extraUnused",
      shader_label: "",
      textures: [{ param_id: "Texture1", data: "" }],
    });
    const out = collectMissingTexturePathsForExportSession(maya, createEmptyNumatbFile(), {
      writeNumatb: false,
      writeMayaProfile: true,
      materialLabels: ["onlyMapped"],
    });
    expect(out).toEqual([
      "Maya profile: onlyMapped → DiffuseMap",
    ]);
  });

  it("mirrorTexturePathOntoOtherProfile copies path to the same material label and param id", () => {
    const nust = createEmptyNumatbFile();
    nust.entries.push({
      material_label: "pbr1Mtl",
      shader_label: "vsngCharaBasic",
      textures: [{ param_id: "BaseColorMap", data: "" }],
    });
    const out = mirrorTexturePathOntoOtherProfile(nust, "pbr1Mtl", "BaseColorMap", { String: "model/body_BC" });
    const tex = out.entries[0].textures?.find((row) => String(row.param_id) === "BaseColorMap");
    expect(tex?.data).toBe("model/body_BC");
  });

  it("mirrorTexturePathOntoOtherProfile leaves target unchanged when param id is absent", () => {
    const nust = createEmptyNumatbFile();
    nust.entries.push({
      material_label: "pbr1Mtl",
      shader_label: "vsngCharaBasic",
      textures: [],
    });
    const out = mirrorTexturePathOntoOtherProfile(nust, "pbr1Mtl", "BaseColorMap", { String: "model/body_BC" });
    expect(flattenEntryToAttributes(out.entries[0])).toHaveLength(0);
  });
});
