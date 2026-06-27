import { describe, expect, it } from "vitest";

import type { SsbhModelPreviewInstance } from "@/components/ssbh-model-preview/types";
import {
  buildUnitModelExportDialogState,
  filterUnitModelInstancesByLabel,
  getUnitModelExportCapabilities,
  isUnitModelInstanceFbxExportable,
  nextUniqueExportName,
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
  const rootFolder = overrides.rootFolder ?? `E:/unit/models/${id}`;
  return {
    id,
    modlPath: overrides.modlPath ?? `${rootFolder}/body.numdlb`,
    displayLabel: overrides.displayLabel ?? id,
    bundle: {
      rootFolder,
      modlPath: `${rootFolder}/body.numdlb`,
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

describe("filterUnitModelInstancesByLabel", () => {
  it("matches instances by display label case-insensitively", () => {
    const instances = [
      createInstance("inst-a", { displayLabel: "Alpha" }),
      createInstance("inst-b", { displayLabel: "Beta" }),
    ];
    expect(filterUnitModelInstancesByLabel(instances, "beta")).toEqual([instances[1]]);
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
    const instances = [createInstance("inst-a", { displayLabel: "Alpha" })];
    expect(filterUnitModelInstancesByLabel(instances, "Missing")).toEqual([]);
  });
});

describe("resolveUnitModelInstanceLabel", () => {
  it("prefers displayLabel over root folder basename", () => {
    const inst = createInstance("x", { displayLabel: "Custom", rootFolder: "E:/unit/models/body" });
    expect(resolveUnitModelInstanceLabel(inst)).toBe("Custom");
  });
});
