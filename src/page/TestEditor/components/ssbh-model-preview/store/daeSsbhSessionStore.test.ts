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
  canConvert: true,
  geometryNames: ["bodyShape"],
  boneCount: 12,
  upAxis: "y_up",
  warnings: [],
  errors: [],
};

describe("daeSsbhSessionStore loadAnalysis material profiles", () => {
  beforeEach(() => {
    useDaeSsbhSessionStore.getState().resetSession();
  });

  it("resets cached texture paths when resetMaterialProfiles is true", () => {
    const store = useDaeSsbhSessionStore.getState();
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
