import { describe, test, expect, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { extractFhm2d, loadStageBundle, restoreSharedTextures } from "./helpers/ipcHelpers";
import { parsePlacementCsv, parseGraphicParamCsv } from "./helpers/csvParser";

const TEST_ROOT = "E:/XB/解包/com/test";

describe("Suite 01: FHM2D Extract Round-Trip", () => {
  const fhm2dPath = `${TEST_ROOT}/16F73C97.fhm2d`;
  const extractDir = `${TEST_ROOT}/__extract_test_01`;

  afterAll(async () => {
    try {
      await fs.rm(extractDir, { recursive: true, force: true });
    } catch { /* cleanup best-effort */ }
  });

  test("01.1 — Extract 16F73C97.fhm2d produces valid folder structure", async () => {
    const result = await extractFhm2d(fhm2dPath, extractDir);
    expect(result.totalFiles).toBeGreaterThan(0);
    expect(result.outputDir).toContain("16F73C97");
  });

  test("01.2 — Extracted folder has base, sky, info, and at least one object folder", async () => {
    const stageRoot = path.join(extractDir, "16F73C97", "0", "0");
    const entries = await fs.readdir(stageRoot, { withFileTypes: true });
    const folderNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    expect(folderNames).toContain("base");
    expect(folderNames).toContain("sky");
    expect(folderNames).toContain("info");
    expect(folderNames.some((n) => n.includes("object"))).toBe(true);
  });

  test("01.3 — load_stage_bundle succeeds on extracted folder", async () => {
    const stageRoot = path.join(extractDir, "16F73C97", "0", "0");
    const bundle = await loadStageBundle(stageRoot);
    expect(bundle.subModels.length).toBeGreaterThanOrEqual(1);
    expect(bundle.baseModel).not.toBeNull();
  });

  test("01.4 — restore_shared_textures consolidates textures to textures/ folder", async () => {
    const stageRoot = path.join(extractDir, "16F73C97", "0", "0");
    const result = await restoreSharedTextures(stageRoot);
    expect(result.texturesCollected).toBeGreaterThanOrEqual(0);
    const entries = await fs.readdir(stageRoot, { withFileTypes: true });
    const hasTexturesDir = entries.some((e) => e.isDirectory() && e.name === "textures");
    expect(hasTexturesDir).toBe(true);
  });

  test("01.5 — placement.csv has expected format with SKY and OBJECT entries", async () => {
    const stageRoot = path.join(extractDir, "16F73C97", "0", "0");
    const content = await fs.readFile(path.join(stageRoot, "info", "placement.csv"), "utf-8");
    const entries = parsePlacementCsv(content);
    const skyEntries = entries.filter((e) => e.vdkType === "SKY");
    const objectEntries = entries.filter((e) => e.vdkType === "OBJECT");
    expect(skyEntries.length).toBe(1);
    expect(objectEntries.length).toBeGreaterThanOrEqual(1);
  });

  test("01.6 — graphic_param.csv has expected parameters", async () => {
    const stageRoot = path.join(extractDir, "16F73C97", "0", "0");
    const content = await fs.readFile(path.join(stageRoot, "info", "graphic_param.csv"), "utf-8");
    const params = parseGraphicParamCsv(content);
    expect(params.length).toBeGreaterThan(10);
    const lightingRotX = params.find((p) => p.key === "directional_lighting_rot_x");
    expect(lightingRotX).toBeDefined();
    expect(parseFloat(lightingRotX!.value)).toBe(-45);
  });
});
