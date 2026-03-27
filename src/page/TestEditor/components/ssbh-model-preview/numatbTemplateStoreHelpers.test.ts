import { describe, expect, it } from "vitest";
import { createEmptyNumatbFile, type NumdlbMappingRow } from "./daeSsbhTypes";
import { EXVS_MAYA_TEMPLATE_FIXTURE, EXVS_NUST_TEMPLATE_FIXTURE } from "./exvsNumatbFixtures";
import { syncProfilesWithMappings, upsertProfileEntriesFromTemplate } from "./store/numatbTemplateStoreHelpers";

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

    expect(result.Matl.V16.entries).toHaveLength(2);
    expect(result.Matl.V16.entries[0].material_label).toBe("bodyMaterial");
    expect(result.Matl.V16.entries[1].material_label).toBe("weaponMaterial");
    expect(result.Matl.V16.entries[0].shader_label).toBe("");
    expect(result.Matl.V16.entries[0].attributes.map((attribute) => attribute.param_id)).toEqual(
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

    expect(result.Matl.V16.entries).toHaveLength(2);
    expect(result.Matl.V16.entries[0].material_label).toBe("bodyMaterial");
    expect(result.Matl.V16.entries[0].shader_label).toBe("vsngCharaBasic");
    expect(result.Matl.V16.entries[0].attributes.map((attribute) => attribute.param_id)).toEqual(
      expect.arrayContaining(["DiffuseCubeMap", "BaseColorMap", "DiffuseSampler", "EmissiveScale"]),
    );
  });

  it("keeps maya and nust profiles aligned with current numdlb mappings", () => {
    const initial = syncProfilesWithMappings(createEmptyNumatbFile(), createEmptyNumatbFile(), rows);
    expect(initial.mayaFile.Matl.V16.entries.map((entry) => entry.material_label)).toEqual([
      "bodyMaterial",
      "weaponMaterial",
    ]);
    expect(initial.nustFile.Matl.V16.entries.map((entry) => entry.material_label)).toEqual([
      "bodyMaterial",
      "weaponMaterial",
    ]);

    const reducedRows: NumdlbMappingRow[] = [rows[0]];
    const reduced = syncProfilesWithMappings(initial.mayaFile, initial.nustFile, reducedRows);
    expect(reduced.mayaFile.Matl.V16.entries.map((entry) => entry.material_label)).toEqual(["bodyMaterial"]);
    expect(reduced.nustFile.Matl.V16.entries.map((entry) => entry.material_label)).toEqual(["bodyMaterial"]);
  });
});
