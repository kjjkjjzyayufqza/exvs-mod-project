import { beforeEach, describe, expect, it } from "vitest";
import type { MatlDataJson } from "../daeSsbhTypes";
import type { SsbhDaeAnalysisReport } from "../ssbhDaeIoService";
import { flattenEntryToAttributes } from "./matlEntryFlat";
import {
  buildAnalysisLoadKey,
  shouldPreserveMaterialProfilesOnAnalysisLoad,
  useDaeSsbhSessionStore,
} from "./daeSsbhSessionStore";

function readTexturePath(file: MatlDataJson, paramId: string): string | undefined {
  for (const entry of file.entries) {
    for (const row of entry.textures ?? []) {
      if (row.param_id === paramId) {
        return row.data == null ? "" : String(row.data);
      }
    }
  }
  return undefined;
}

const sampleAnalysis: SsbhDaeAnalysisReport = {
  daePath: "C:/models/body.dae",
  canConvert: true,
  meshRows: [],
  geometryNames: ["bodyShape"],
  boneCount: 12,
  boneNames: [],
  upAxis: "y_up",
  warnings: [],
  blockingErrors: [],
};

describe("daeSsbhSessionStore loadAnalysis material profiles", () => {
  beforeEach(() => {
    useDaeSsbhSessionStore.getState().resetSession();
  });

  it("resets cached texture paths when resetMaterialProfiles is true", () => {
    const store = useDaeSsbhSessionStore.getState();
    const initialRevision = store.numatbProfileReplacementRevision;
    store.setSourcePath("C:/models/previous.dae");
    store.setProfileFile("maya", {
      major_version: 1,
      minor_version: 6,
      entries: [
        {
          material_label: "pbr1Mtl",
          shader_label: "",
          textures: [{ param_id: "DiffuseMap", data: "textures/old_session_diffuse" }],
        },
      ],
    });

    store.loadAnalysis(sampleAnalysis, { resetMaterialProfiles: true });

    const next = useDaeSsbhSessionStore.getState();
    expect(readTexturePath(next.mayaFile, "DiffuseMap")).toBe("");
    expect(readTexturePath(next.nustFile, "BaseColorMap")).toBe("");
    expect(next.selectedTemplateId).toBeNull();
    expect(next.numatbProfileReplacementRevision).toBe(initialRevision + 2);
  });

  it("preserves user-edited texture paths on re-analyze for the same source", () => {
    const store = useDaeSsbhSessionStore.getState();
    const sourcePath = "C:/models/current.dae";
    store.setSourcePath(sourcePath);
    store.loadAnalysis(sampleAnalysis, { resetMaterialProfiles: true });

    const afterFirstLoad = useDaeSsbhSessionStore.getState();
    const diffuseIndex = flattenEntryToAttributes(afterFirstLoad.mayaFile.entries[0]).findIndex(
      (attribute) => attribute.param_id === "DiffuseMap",
    );
    expect(diffuseIndex).toBeGreaterThanOrEqual(0);
    store.updateProfileAttribute("maya", 0, diffuseIndex, { String: "textures/user_diffuse" });

    store.loadAnalysis(sampleAnalysis);

    const next = useDaeSsbhSessionStore.getState();
    expect(readTexturePath(next.mayaFile, "DiffuseMap")).toBe("textures/user_diffuse");
  });

  it("syncs up axis from analysis when the value is valid", () => {
    const store = useDaeSsbhSessionStore.getState();
    store.setUpAxis("y_up");

    store.loadAnalysis({ ...sampleAnalysis, upAxis: "z_up" });

    expect(useDaeSsbhSessionStore.getState().upAxis).toBe("z_up");
  });

  it("supports no conversion as an analysis up axis", () => {
    const store = useDaeSsbhSessionStore.getState();
    store.setUpAxis("z_up");

    store.loadAnalysis({ ...sampleAnalysis, upAxis: "none" });

    expect(useDaeSsbhSessionStore.getState().upAxis).toBe("none");
  });
});

describe("daeSsbhSessionStore template application", () => {
  beforeEach(() => {
    useDaeSsbhSessionStore.getState().resetSession();
  });

  it("increments the profile replacement revision every time a template is applied", () => {
    const template = {
      id: "template-a",
      name: "Template A",
      description: "",
      sourceFileName: null,
      updatedAt: "2026-06-12T00:00:00.000Z",
      mayaFile: {
        major_version: 1,
        minor_version: 6,
        entries: [],
      },
      nustFile: {
        major_version: 1,
        minor_version: 6,
        entries: [],
      },
    };
    useDaeSsbhSessionStore.setState({
      templateLibrary: { version: 1, templates: [template] },
    });

    const firstRevision =
      useDaeSsbhSessionStore.getState().numatbProfileReplacementRevision;
    useDaeSsbhSessionStore.getState().applyTemplateById(template.id);
    const secondRevision =
      useDaeSsbhSessionStore.getState().numatbProfileReplacementRevision;
    useDaeSsbhSessionStore.getState().applyTemplateById(template.id);

    expect(secondRevision).toBe(firstRevision + 1);
    expect(useDaeSsbhSessionStore.getState().numatbProfileReplacementRevision).toBe(
      secondRevision + 1,
    );
  });
});

describe("daeSsbhSessionStore analysis load helpers", () => {
  it("buildAnalysisLoadKey combines source path and geometry names", () => {
    expect(buildAnalysisLoadKey("C:/a.dae", ["meshA", "meshB"])).toBe(
      "C:/a.dae\u0000meshA\u0001meshB",
    );
    expect(buildAnalysisLoadKey(null, ["meshA"])).toBeNull();
  });

  it("shouldPreserveMaterialProfilesOnAnalysisLoad respects reset flag and loaded key", () => {
    const key = buildAnalysisLoadKey("C:/a.dae", ["meshA"]);
    const state = {
      loadedAnalysisKey: key,
      mayaFile: {
        major_version: 1,
        minor_version: 6,
        entries: [{ material_label: "pbr1Mtl", shader_label: "", textures: [] }],
      },
    };

    expect(shouldPreserveMaterialProfilesOnAnalysisLoad(state, key)).toBe(true);
    expect(shouldPreserveMaterialProfilesOnAnalysisLoad(state, key, true)).toBe(false);
    expect(
      shouldPreserveMaterialProfilesOnAnalysisLoad(state, buildAnalysisLoadKey("C:/b.dae", ["meshA"])),
    ).toBe(false);
  });
});
