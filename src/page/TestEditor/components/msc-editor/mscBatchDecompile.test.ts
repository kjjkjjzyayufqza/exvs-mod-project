import { describe, expect, it, vi } from "vitest";
import {
  buildMscSourceBatchPlan,
  clampMscBatchConcurrency,
  collectMscBatchSourceFiles,
  createInitialMscBatchRunStats,
  runLimitedConcurrency,
} from "./mscBatchDecompile";

describe("mscBatchDecompile", () => {
  it("initializes separate resolved, partial, skipped, and failed overlay counts", () => {
    expect(createInitialMscBatchRunStats(3, 9)).toMatchObject({
      resolvedOverlays: 0,
      partialOverlays: 0,
      skippedOverlays: 0,
      failedOverlays: 0,
    });
  });

  it("collects the 0/1/2 MSC pipeline scripts in slot order", () => {
    const files = collectMscBatchSourceFiles([
      { isFile: true, name: "2.dscex" },
      { isFile: true, name: "notes.txt" },
      { isDirectory: true, name: "nested" },
      { isFile: true, name: "0.bscex" },
      { isFile: true, name: "1.cscex" },
      { isFile: true, name: "10.dscex" },
      { isFile: true, name: "2.bscex" },
    ]);

    expect(files.map((file) => file.name)).toEqual(["0.bscex", "1.cscex", "2.dscex"]);
  });

  it("clamps user-selected concurrency to the configured worker range", () => {
    expect(clampMscBatchConcurrency(0)).toBe(1);
    expect(clampMscBatchConcurrency(2)).toBe(2);
    expect(clampMscBatchConcurrency(10)).toBe(10);
    expect(clampMscBatchConcurrency(50)).toBe(50);
    expect(clampMscBatchConcurrency(99)).toBe(50);
    expect(clampMscBatchConcurrency(Number.NaN)).toBe(10);
  });

  it("does not exceed the requested worker limit", async () => {
    let active = 0;
    let peak = 0;

    await runLimitedConcurrency([1, 2, 3, 4, 5], 2, () => false, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
    });

    expect(peak).toBeLessThanOrEqual(2);
  });

  it("builds a single-folder plan without scanning child folders", async () => {
    const readDir = vi.fn(async (path: string) => {
      if (path !== "E:/workspace/040msc/0x12345678") {
        throw new Error(`unexpected readDir: ${path}`);
      }
      return [
        { isFile: true, name: "0.bscex" },
        { isFile: true, name: "1.cscex" },
        { isFile: true, name: "2.dscex" },
        { isDirectory: true, name: "nested" },
      ];
    });

    const plan = await buildMscSourceBatchPlan({
      sourcePath: "E:/workspace/040msc/0x12345678/",
      sourceScope: "single-folder",
      readDir,
      joinPath: async (...parts) => parts.join("/"),
      getOutputPath: (path) => `${path}.c`,
      getLogPath: (path) => `${path}.log`,
    });

    expect(readDir).toHaveBeenCalledTimes(1);
    expect(plan).toMatchObject({
      rootPath: "E:/workspace/040msc/0x12345678",
      sourceScope: "single-folder",
      totalScripts: 3,
    });
    expect(plan.folders).toHaveLength(1);
    expect(plan.folders[0].name).toBe("0x12345678");
    expect(plan.folders[0].scripts.map((script) => script.name)).toEqual([
      "0.bscex",
      "1.cscex",
      "2.dscex",
    ]);
  });
});
