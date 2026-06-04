import { describe, expect, it, vi } from "vitest";
import type { SsbhModelPreviewBundle } from "@/components/ssbh-model-preview/types";
import {
  runModelReplacementDirectToDisk,
  runModelReplacementPreview,
} from "./sceneModelReplacePreview";

function makePreviewBundle(): SsbhModelPreviewBundle {
  return {
    rootFolder: "E:/stage/0/0/base",
    modlPath: "E:/stage/0/0/base/0/base.numdlb",
    meshPath: "E:/stage/0/0/base/0/base.numshb",
    skelPath: null,
    matlPaths: [],
    textureRefs: [],
    resolvedNutexbPaths: [],
    mesh: { binary: true, geometryId: "geom-base-replace" },
    warnings: [],
    sourceKind: "memory",
    displayLabel: "base",
  };
}

describe("runModelReplacementDirectToDisk", () => {
  it("writes to disk and reloads the slot bundle without session IPC import", async () => {
    const callOrder: string[] = [];
    const diskBundle = { ...makePreviewBundle(), sourceKind: "disk" as const };

    const result = await runModelReplacementDirectToDisk({
      writeToDisk: async () => {
        callOrder.push("writeToDisk");
        return {
          filesWritten: ["base/0/base.numdlb"],
          modelDir: "E:/stage/0/0/base",
          warnings: [],
        };
      },
      loadBundleFromDisk: async () => {
        callOrder.push("loadFromDisk");
        return diskBundle;
      },
      hydratePreviewBundle: async () => {
        callOrder.push("hydrate");
      },
    });

    expect(callOrder).toEqual(["writeToDisk", "loadFromDisk", "hydrate"]);
    expect(result.wroteToDisk).toBe(true);
    expect(result.previewBundle).toBe(diskBundle);
    expect(result.importId).toBe("");
  });
});

describe("runModelReplacementPreview", () => {
  it("hydrates the preview bundle after it is built so the viewport can render IPC mesh data", async () => {
    const callOrder: string[] = [];
    const previewBundle = makePreviewBundle();

    const result = await runModelReplacementPreview({
      importAndConvert: async () => {
        callOrder.push("import");
        return { importId: "import-1", ssbhGenerated: true };
      },
      buildPreviewBundle: async () => {
        callOrder.push("buildPreview");
        return previewBundle;
      },
      hydratePreviewBundle: async () => {
        callOrder.push("hydrate");
      },
    });

    expect(callOrder).toEqual(["import", "buildPreview", "hydrate"]);
    expect(result.previewBundle).toBe(previewBundle);
    expect(result.importId).toBe("import-1");
    expect(result.wroteToDisk).toBe(false);
  });

  it("writes to disk only after the preview bundle is hydrated", async () => {
    const callOrder: string[] = [];

    await runModelReplacementPreview({
      importAndConvert: async () => {
        callOrder.push("import");
        return { importId: "import-2", ssbhGenerated: true };
      },
      buildPreviewBundle: async () => {
        callOrder.push("buildPreview");
        return makePreviewBundle();
      },
      hydratePreviewBundle: async () => {
        callOrder.push("hydrate");
      },
      writeToDisk: async () => {
        callOrder.push("writeToDisk");
        return {
          filesWritten: ["base/0/base.numdlb"],
          modelDir: "E:/stage/0/0/base",
          warnings: [],
        };
      },
    });

    expect(callOrder).toEqual(["import", "buildPreview", "hydrate", "writeToDisk"]);
  });

  it("fails when SSBH conversion did not produce artifacts", async () => {
    const hydrate = vi.fn();

    await expect(
      runModelReplacementPreview({
        importAndConvert: async () => ({
          importId: "import-3",
          ssbhGenerated: false,
        }),
        buildPreviewBundle: async () => makePreviewBundle(),
        hydratePreviewBundle: hydrate,
      }),
    ).rejects.toThrow("SSBH conversion did not produce in-memory artifacts");

    expect(hydrate).not.toHaveBeenCalled();
  });
});
