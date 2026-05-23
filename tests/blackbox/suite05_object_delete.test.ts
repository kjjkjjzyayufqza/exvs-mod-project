import { describe, test, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { backupStageFolder, restoreStageFolder } from "./helpers/backupRestore";
import { loadStageBundle, rebuildStructureJson } from "./helpers/ipcHelpers";
import { parsePlacementCsv } from "./helpers/csvParser";

const STAGE_ROOT = "E:/XB/解包/com/test/16F73C97/0/0";

describe("Suite 05: Object Deletion + Re-indexing", () => {
  beforeAll(async () => {
    await backupStageFolder(STAGE_ROOT);
  });

  afterAll(async () => {
    await restoreStageFolder(STAGE_ROOT);
  });

  test("05.1 — Count objects before deletion", async () => {
    const bundle = await loadStageBundle(STAGE_ROOT);
    expect(bundle.subModels.length).toBeGreaterThanOrEqual(1);
  });

  test("05.2 — Delete object folder from disk", async () => {
    const objectFolder = path.join(STAGE_ROOT, "001stage001_object_box01");
    await fs.rm(objectFolder, { recursive: true, force: true });
    const exists = await fs.access(objectFolder).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  test("05.3 — Remove deleted object rows from placement.csv", async () => {
    const csvPath = path.join(STAGE_ROOT, "info", "placement.csv");
    const content = await fs.readFile(csvPath, "utf-8");
    const entries = parsePlacementCsv(content);
    const remaining = entries.filter((e) => {
      if (e.vdkType !== "OBJECT") return true;
      return e.objectNumber !== 0;
    });
    const csv = remaining.map((e) => e.rawFields.join(",")).join("\n");
    await fs.writeFile(csvPath, csv, "utf-8");

    const updated = await fs.readFile(csvPath, "utf-8");
    const updatedEntries = parsePlacementCsv(updated);
    const objectsRemaining = updatedEntries.filter((e) => e.vdkType === "OBJECT");
    expect(objectsRemaining.every((e) => e.objectNumber !== 0)).toBe(true);
  });

  test("05.4 — rebuild_stage_structure_json after deletion produces valid JSON", async () => {
    const structurePath = await rebuildStructureJson(STAGE_ROOT);
    expect(structurePath).toBeTruthy();
    const content = await fs.readFile(structurePath, "utf-8");
    const structure = JSON.parse(content);
    expect(structure.SubFileData).toBeDefined();
    expect(structure.Fhm2dTotalCount).toBe(structure.SubFileData.length);
  });

  test("05.5 — Structure JSON no longer references deleted object folder", async () => {
    const parentDir = path.resolve(STAGE_ROOT, "..");
    const structureFiles = await fs.readdir(parentDir);
    const structureFile = structureFiles.find((f) => f.endsWith("_structure.json"));
    expect(structureFile).toBeDefined();
    const content = await fs.readFile(path.join(parentDir, structureFile!), "utf-8");
    expect(content).not.toContain("object_box01");
  });

  test("05.6 — SKY entry remains in placement.csv after object deletion", async () => {
    const csvPath = path.join(STAGE_ROOT, "info", "placement.csv");
    const content = await fs.readFile(csvPath, "utf-8");
    const entries = parsePlacementCsv(content);
    const skyEntries = entries.filter((e) => e.vdkType === "SKY");
    expect(skyEntries.length).toBe(1);
  });
});
