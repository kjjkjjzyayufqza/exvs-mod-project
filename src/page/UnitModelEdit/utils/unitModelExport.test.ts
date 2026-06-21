import { describe, expect, it } from "vitest";
import type { Object3D } from "three";

import type { SsbhModelPreviewInstance } from "@/components/ssbh-model-preview/types";
import {
  buildUnitModelExportDialogState,
  getUnitModelExportCapabilities,
  isUnitModelInstanceDaeExportable,
  nextUniqueExportName,
  resolveUnitModelInstanceLabel,
} from "./unitModelExport";

function createInstance(
  id: string,
  overrides: {
    sourceKind?: "disk" | "memory";
    rootFolder?: string;
    displayLabel?: string;
  } = {},
): SsbhModelPreviewInstance {
  const sourceKind = overrides.sourceKind ?? "disk";
  const rootFolder = overrides.rootFolder ?? `E:/unit/models/${id}`;
  return {
    id,
    modlPath: `${rootFolder}/body.numdlb`,
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

function fakeObject(): Object3D {
  return { isObject3D: true } as Object3D;
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

describe("isUnitModelInstanceDaeExportable", () => {
  it("accepts disk instances with a root folder", () => {
    expect(isUnitModelInstanceDaeExportable(createInstance("a"))).toBe(true);
  });

  it("rejects memory-only instances", () => {
    expect(
      isUnitModelInstanceDaeExportable(
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
    const viewport = new Map([
      ["inst-a", { object: fakeObject() }],
      ["inst-b", { object: fakeObject() }],
    ]);

    const state = buildUnitModelExportDialogState(instances, viewport);
    expect(state).not.toBeNull();
    expect(state!.targets).toHaveLength(2);
    expect(state!.targets.map((t) => t.name)).toEqual(["Alpha", "Beta"]);
    expect(state!.threeObjects).toHaveLength(2);
    expect(state!.skipped).toHaveLength(0);
  });

  it("deduplicates export filenames for colliding labels", () => {
    const instances = [
      createInstance("inst-a", { displayLabel: "body" }),
      createInstance("inst-b", { displayLabel: "body" }),
    ];
    const viewport = new Map([
      ["inst-a", { object: fakeObject() }],
      ["inst-b", { object: fakeObject() }],
    ]);

    const state = buildUnitModelExportDialogState(instances, viewport);
    expect(state!.targets.map((t) => t.name)).toEqual(["body", "body_1"]);
  });

  it("skips instances that are neither DAE nor FBX exportable", () => {
    const instances = [
      createInstance("disk", { displayLabel: "Disk" }),
      createInstance("memory", { sourceKind: "memory", displayLabel: "Memory" }),
    ];
    const viewport = new Map([["disk", { object: fakeObject() }]]);

    const state = buildUnitModelExportDialogState(instances, viewport);
    expect(state!.targets).toHaveLength(1);
    expect(state!.targets[0]!.nodeId).toBe("disk");
    expect(state!.skipped).toEqual([
      { instanceId: "memory", label: "Memory", reason: "no_disk_root" },
    ]);
  });

  it("includes FBX-only memory instances when a viewport object exists", () => {
    const instances = [createInstance("memory", { sourceKind: "memory", displayLabel: "Mem" })];
    const viewport = new Map([["memory", { object: fakeObject() }]]);

    const state = buildUnitModelExportDialogState(instances, viewport);
    expect(state!.targets).toHaveLength(1);
    expect(state!.targets[0]!.rootPath).toBeNull();
    expect(state!.threeObjects).toHaveLength(1);
    expect(state!.skipped).toHaveLength(0);
  });

  it("keeps DAE targets for hidden instances without viewport objects", () => {
    const instances = [createInstance("hidden-disk", { displayLabel: "Hidden" })];
    const state = buildUnitModelExportDialogState(instances, new Map());
    expect(state!.targets).toHaveLength(1);
    expect(state!.threeObjects).toHaveLength(0);
    expect(state!.skipped).toHaveLength(0);
  });

  it("returns null when nothing can be exported", () => {
    const instances = [createInstance("memory", { sourceKind: "memory" })];
    expect(buildUnitModelExportDialogState(instances, new Map())).toBeNull();
  });
});

describe("getUnitModelExportCapabilities", () => {
  it("keeps DAE capability even before viewport FBX objects are ready", () => {
    const instances = [createInstance("disk-a"), createInstance("disk-b")];
    expect(getUnitModelExportCapabilities(instances, new Set())).toEqual({
      daeCount: 2,
      fbxCount: 0,
      canExport: true,
    });
  });

  it("enables export for memory-only models when viewport FBX objects exist", () => {
    const instances = [createInstance("memory-a", { sourceKind: "memory" })];
    expect(getUnitModelExportCapabilities(instances, new Set(["memory-a"]))).toEqual({
      daeCount: 0,
      fbxCount: 1,
      canExport: true,
    });
  });

  it("disables export when neither DAE nor FBX is available", () => {
    const instances = [createInstance("memory-a", { sourceKind: "memory" })];
    expect(getUnitModelExportCapabilities(instances, new Set())).toEqual({
      daeCount: 0,
      fbxCount: 0,
      canExport: false,
    });
  });
});

describe("resolveUnitModelInstanceLabel", () => {
  it("prefers displayLabel over root folder basename", () => {
    const inst = createInstance("x", { displayLabel: "Custom", rootFolder: "E:/unit/models/body" });
    expect(resolveUnitModelInstanceLabel(inst)).toBe("Custom");
  });
});
