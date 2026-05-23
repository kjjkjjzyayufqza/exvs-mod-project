import { describe, test, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { backupStageFolder, restoreStageFolder } from "./helpers/backupRestore";
import {
  extractFhm2d,
  loadStageBundle,
  redistributeTextures,
  restoreSharedTextures,
  rebuildStructureJson,
  repackFhm2d,
} from "./helpers/ipcHelpers";
import { parsePlacementCsv, parseGraphicParamCsv } from "./helpers/csvParser";

const TEST_ROOT = "E:/XB/解包/com/test";
const STAGE_ROOT = path.join(TEST_ROOT, "16F73C97", "0", "0");
const OUTPUT_FHM2D = path.join(TEST_ROOT, "__roundtrip_output.fhm2d");
const REEXTRACT_DIR = path.join(TEST_ROOT, "__roundtrip_reextract");

describe("Suite 07: Full FHM2D Save → Re-Extract → Compare", () => {
  beforeAll(async () => {
    await backupStageFolder(STAGE_ROOT);
  });

  afterAll(async () => {
    await restoreStageFolder(STAGE_ROOT);
    try { await fs.rm(OUTPUT_FHM2D, { force: true }); } catch {}
    try { await fs.rm(REEXTRACT_DIR, { recursive: true, force: true }); } catch {}
  });

  test("07.1 — Modify placement.csv: change first OBJECT position to (123, 456, 789)", async () => {
    const csvPath = path.join(STAGE_ROOT, "info", "placement.csv");
    const content = await fs.readFile(csvPath, "utf-8");
    const lines = content.trim().split("\n");
    const objIdx = lines.findIndex((l) => l.includes("VDK_TYPE,OBJECT"));
    const fields = lines[objIdx].split(",");
    const pxIdx = fields.indexOf("VDK_POSITION_X");
    fields[pxIdx + 1] = "123.0";
    const pyIdx = fields.indexOf("VDK_POSITION_Y");
    fields[pyIdx + 1] = "456.0";
    const pzIdx = fields.indexOf("VDK_POSITION_Z");
    fields[pzIdx + 1] = "789.0";
    lines[objIdx] = fields.join(",");
    await fs.writeFile(csvPath, lines.join("\n"), "utf-8");
  });

  test("07.2 — Modify graphic_param.csv: change fog_alpha_boost to 2.5", async () => {
    const csvPath = path.join(STAGE_ROOT, "info", "graphic_param.csv");
    const content = await fs.readFile(csvPath, "utf-8");
    const params = parseGraphicParamCsv(content);
    const fog = params.find((p) => p.key === "fog_alpha_boost");
    if (fog) {
      fog.value = "2.5";
    }
    const csv = params.map((p) => `${p.key},${p.value}`).join("\n");
    await fs.writeFile(csvPath, csv, "utf-8");
  });

  test("07.3 — Redistribute textures for FHM2D packing", async () => {
    await restoreSharedTextures(STAGE_ROOT);
    const result = await redistributeTextures(STAGE_ROOT);
    expect(result.modelsProcessed).toBeGreaterThanOrEqual(1);
  });

  test("07.4 — Rebuild structure JSON from disk", async () => {
    const structurePath = await rebuildStructureJson(STAGE_ROOT);
    expect(structurePath).toContain("structure.json");
    const content = await fs.readFile(structurePath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.SubFileData.length).toBeGreaterThan(0);
    expect(parsed.Fhm2dTotalCount).toBe(parsed.SubFileData.length);
  });

  test("07.5 — repack_fhm2d produces a valid .fhm2d file", async () => {
    const structureJsonPath = await rebuildStructureJson(STAGE_ROOT);
    const result = await repackFhm2d(structureJsonPath, OUTPUT_FHM2D);
    expect(result.outputSize).toBeGreaterThan(0);
    expect(result.totalFiles).toBeGreaterThan(0);
    const info = await fs.stat(OUTPUT_FHM2D);
    expect(info.size).toBeGreaterThan(100_000);
  });

  test("07.6 — Restore shared textures after packing", async () => {
    const result = await restoreSharedTextures(STAGE_ROOT);
    expect(result.texturesCollected).toBeGreaterThanOrEqual(0);
  });

  test("07.7 — Re-extract the packed FHM2D", async () => {
    const result = await extractFhm2d(OUTPUT_FHM2D, REEXTRACT_DIR);
    expect(result.totalFiles).toBeGreaterThan(0);
  });

  test("07.8 — Re-extracted placement.csv has modified position (123, 456, 789)", async () => {
    const reextractRoot = await findStageRoot(REEXTRACT_DIR);
    const content = await fs.readFile(path.join(reextractRoot, "info", "placement.csv"), "utf-8");
    const entries = parsePlacementCsv(content);
    const obj = entries.find((e) => e.vdkType === "OBJECT")!;
    expect(obj.positionX).toBe(123.0);
    expect(obj.positionY).toBe(456.0);
    expect(obj.positionZ).toBe(789.0);
  });

  test("07.9 — Re-extracted graphic_param.csv has modified fog_alpha_boost=2.5", async () => {
    const reextractRoot = await findStageRoot(REEXTRACT_DIR);
    const content = await fs.readFile(path.join(reextractRoot, "info", "graphic_param.csv"), "utf-8");
    const params = parseGraphicParamCsv(content);
    const fog = params.find((p) => p.key === "fog_alpha_boost");
    if (fog) {
      expect(fog.value).toBe("2.5");
    }
  });

  test("07.10 — Re-extracted stage has same number of sub-models as original", async () => {
    const reextractRoot = await findStageRoot(REEXTRACT_DIR);
    const originalBundle = await loadStageBundle(STAGE_ROOT);
    const reextractedBundle = await loadStageBundle(reextractRoot);
    expect(reextractedBundle.subModels.length).toBe(originalBundle.subModels.length);
  });

  test("07.11 — Structure JSON in re-extracted stage is valid", async () => {
    const reextractRoot = await findStageRoot(REEXTRACT_DIR);
    const structurePath = await rebuildStructureJson(reextractRoot);
    const content = await fs.readFile(structurePath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.SubFileData.length).toBeGreaterThan(0);
    expect(parsed.Fhm2dTotalCount).toBe(parsed.SubFileData.length);
  });
});

async function findStageRoot(baseDir: string): Promise<string> {
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const hashDir = entries.find((e) => e.isDirectory())!;
  return path.join(baseDir, hashDir.name, "0", "0");
}
