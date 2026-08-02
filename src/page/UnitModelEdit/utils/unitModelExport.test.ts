import { describe, expect, it } from "vitest";

import type { SsbhModelPreviewInstance } from "@/components/ssbh-model-preview/types";
import {
  buildUnitModelDiskExportDialogState,
  buildUnitModelExportDialogState,
  filterUnitModelInstancesByLabel,
  getUnitModelExportCapabilities,
  isUnitModelInstanceFbxExportable,
  nextUniqueExportName,
  resolveUnitModelDiskModelFolderPath,
  resolveUnitModelFolderNameFromPath,
  resolveUnitModelInstanceLabel,
} from "./unitModelExport";

function createInstance(
  id: string,
  overrides: {
    sourceKind?: "disk" | "memory";
    rootFolder?: string;
    displayLabel?: string;
    modlPath?: string;
  } = {},
): SsbhModelPreviewInstance {
  const sourceKind = overrides.sourceKind ?? "disk";
  // Default package identity is the models/<folder> name used by Model Manager.
  const packageLabel = overrides.displayLabel ?? id;
  const rootFolder = overrides.rootFolder ?? `E:/unit/models/${packageLabel}`;
  const modlPath = overrides.modlPath ?? `${rootFolder}/body.numdlb`;
  return {
    id,
    modlPath,
    displayLabel: overrides.displayLabel ?? id,
    bundle: {
      rootFolder,
      modlPath,
      meshPath: `${rootFolder}/body.numshb`,
      skelPath: null,
      matlPaths: [],
      modl: null,
      mesh: null,
      skel: null,
      matl: null,
      textureRefs: [],
      resolvedNutexbPaths: [],
      textureResolve: [],
      warnings: [],
      sourceKind,
    },
  };
}

describe("nextUniqueExportName", () => {
  it("deduplicates colliding base names", () => {
    const used = new Set<string>();
    expect(nextUniqueExportName("body", used)).toBe("body");
    expect(nextUniqueExportName("body", used)).toBe("body_1");
    expect(nextUniqueExportName("body", used)).toBe("body_2");
  });

  it("sanitizes invalid filename characters", () => {
    const used = new Set<string>();
    expect(nextUniqueExportName('a/b:c', used)).toBe("a_b_c");
  });
});

describe("isUnitModelInstanceFbxExportable", () => {
  it("accepts disk instances with a NUMDLB path", () => {
    expect(isUnitModelInstanceFbxExportable(createInstance("a"))).toBe(true);
  });

  it("rejects memory-only instances", () => {
    expect(
      isUnitModelInstanceFbxExportable(
        createInstance("mem", { sourceKind: "memory", rootFolder: "/virtual/mem" }),
      ),
    ).toBe(false);
  });
});

describe("buildUnitModelExportDialogState", () => {
  it("includes all loaded disk models without hidden filtering", () => {
    const instances = [
      createInstance("inst-a", { displayLabel: "Alpha" }),
      createInstance("inst-b", { displayLabel: "Beta" }),
    ];
    const state = buildUnitModelExportDialogState(instances);
    expect(state).not.toBeNull();
    expect(state!.targets).toHaveLength(2);
    expect(state!.targets.map((t) => t.name)).toEqual(["Alpha", "Beta"]);
    expect(state!.targets.every((target) => target.rootPath?.endsWith("body.numdlb"))).toBe(true);
    expect(state!.skipped).toHaveLength(0);
  });

  it("deduplicates export filenames for colliding labels", () => {
    const instances = [
      createInstance("inst-a", { displayLabel: "body" }),
      createInstance("inst-b", { displayLabel: "body" }),
    ];
    const state = buildUnitModelExportDialogState(instances);
    expect(state!.targets.map((t) => t.name)).toEqual(["body", "body_1"]);
  });

  it("includes disk instances and skips memory instances", () => {
    const instances = [
      createInstance("disk", { displayLabel: "Disk" }),
      createInstance("memory", { sourceKind: "memory", displayLabel: "Memory" }),
    ];
    const state = buildUnitModelExportDialogState(instances);
    expect(state!.targets.map((target) => target.nodeId)).toEqual(["disk"]);
    expect(state!.skipped).toEqual([
      { instanceId: "memory", label: "Memory", reason: "memory_source" },
    ]);
  });

  it("returns null for memory-only instances", () => {
    const instances = [createInstance("memory", { sourceKind: "memory", displayLabel: "Mem" })];
    expect(buildUnitModelExportDialogState(instances)).toBeNull();
  });

  it("returns null when a disk instance has no NUMDLB path", () => {
    const instances = [createInstance("missing", { modlPath: "" })];
    expect(buildUnitModelExportDialogState(instances)).toBeNull();
  });
});

describe("getUnitModelExportCapabilities", () => {
  it("enables export for disk-backed SSBH models", () => {
    const instances = [createInstance("disk-a"), createInstance("disk-b")];
    expect(getUnitModelExportCapabilities(instances)).toEqual({
      fbxCount: 2,
      canExport: true,
    });
  });

  it("disables export for memory-only models", () => {
    const instances = [createInstance("memory-a", { sourceKind: "memory" })];
    expect(getUnitModelExportCapabilities(instances)).toEqual({
      fbxCount: 0,
      canExport: false,
    });
  });
});

describe("resolveUnitModelFolderNameFromPath", () => {
  it("extracts models/<folder> from a numdlb path", () => {
    expect(
      resolveUnitModelFolderNameFromPath(
        "E:/unit/026gnbelt/models/015gndmuc_004deltpl_001_body_normal/026gnbelt_003delatkai_001.numdlb",
      ),
    ).toBe("015gndmuc_004deltpl_001_body_normal");
  });

  it("extracts models/<folder> from a model folder path", () => {
    expect(
      resolveUnitModelFolderNameFromPath(
        "E:/unit/026gnbelt/models/015gndmuc_004deltpl_001_body_normal",
      ),
    ).toBe("015gndmuc_004deltpl_001_body_normal");
  });
});

describe("filterUnitModelInstancesByLabel", () => {
  it("matches instances by models folder identity case-insensitively", () => {
    const instances = [
      createInstance("inst-a", {
        displayLabel: "Alpha",
        rootFolder: "E:/unit/models/Alpha",
      }),
      createInstance("inst-b", {
        displayLabel: "Beta",
        rootFolder: "E:/unit/models/Beta",
      }),
    ];
    expect(filterUnitModelInstancesByLabel(instances, "beta")).toEqual([instances[1]]);
  });

  it("matches Model Manager folder labels when displayLabel is a renamed numdlb stem", () => {
    // Real unit packs often rename the .numdlb while keeping models/<folder> identity.
    const inst = createInstance("inst-body", {
      displayLabel: "026gnbelt_003delatkai_001",
      rootFolder: "E:/unit/models/015gndmuc_004deltpl_001_body_normal",
      modlPath:
        "E:/unit/models/015gndmuc_004deltpl_001_body_normal/026gnbelt_003delatkai_001.numdlb",
    });
    expect(
      filterUnitModelInstancesByLabel([inst], "015gndmuc_004deltpl_001_body_normal"),
    ).toEqual([inst]);
    // Secondary: still match by numdlb stem for inspector / legacy callers.
    expect(filterUnitModelInstancesByLabel([inst], "026gnbelt_003delatkai_001")).toEqual([inst]);
  });

  it("falls back to root folder basename when display label is absent", () => {
    const inst = createInstance("inst-x", {
      displayLabel: "",
      rootFolder: "E:/unit/models/BodyArmor",
    });
    delete (inst as Partial<SsbhModelPreviewInstance>).displayLabel;
    expect(filterUnitModelInstancesByLabel([inst], "BodyArmor")).toEqual([inst]);
  });

  it("returns empty array when no instance matches", () => {
    const instances = [
      createInstance("inst-a", {
        displayLabel: "Alpha",
        rootFolder: "E:/unit/models/Alpha",
      }),
    ];
    expect(filterUnitModelInstancesByLabel(instances, "Missing")).toEqual([]);
  });
});

describe("resolveUnitModelInstanceLabel", () => {
  it("prefers models/<folder> identity over numdlb stem displayLabel", () => {
    const inst = createInstance("x", {
      displayLabel: "026gnbelt_003delatkai_001",
      rootFolder: "E:/unit/models/015gndmuc_004deltpl_001_body_normal",
      modlPath:
        "E:/unit/models/015gndmuc_004deltpl_001_body_normal/026gnbelt_003delatkai_001.numdlb",
    });
    expect(resolveUnitModelInstanceLabel(inst)).toBe("015gndmuc_004deltpl_001_body_normal");
  });

  it("uses parent folder of a loose .numdlb when path has no models segment", () => {
    const inst = createInstance("x", {
      displayLabel: "Custom",
      rootFolder: "E:/loose/body",
      modlPath: "E:/loose/body/body.numdlb",
    });
    expect(resolveUnitModelInstanceLabel(inst)).toBe("body");
  });
});

describe("buildUnitModelDiskExportDialogState", () => {
  it("builds a disk-backed export target under models/<label>", () => {
    const state = buildUnitModelDiskExportDialogState(
      "E:/unit/026gnbelt",
      "015gndmuc_004deltpl_001_body_normal",
    );
    expect(state).not.toBeNull();
    expect(state!.targets).toHaveLength(1);
    expect(state!.targets[0]).toMatchObject({
      name: "015gndmuc_004deltpl_001_body_normal",
      rootPath: "E:/unit/026gnbelt/models/015gndmuc_004deltpl_001_body_normal",
      type: "ssbh",
    });
  });

  it("rejects path-like labels", () => {
    expect(buildUnitModelDiskExportDialogState("E:/unit", "../escape")).toBeNull();
    expect(resolveUnitModelDiskModelFolderPath("E:/unit", "a/b")).toBeNull();
  });
});
