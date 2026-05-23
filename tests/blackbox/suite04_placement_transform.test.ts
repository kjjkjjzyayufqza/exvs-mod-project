import { describe, test, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { backupStageFolder, restoreStageFolder } from "./helpers/backupRestore";
import { loadStageBundle } from "./helpers/ipcHelpers";
import { parsePlacementCsv } from "./helpers/csvParser";

const STAGE_ROOT = "E:/XB/解包/com/test/16F73C97/0/0";

describe("Suite 04: Placement Transform Save & Verify", () => {
  let originalPlacement: string;

  beforeAll(async () => {
    await backupStageFolder(STAGE_ROOT);
    originalPlacement = await fs.readFile(path.join(STAGE_ROOT, "info", "placement.csv"), "utf-8");
  });

  afterAll(async () => {
    await restoreStageFolder(STAGE_ROOT);
  });

  test("04.1 — Read original placement.csv and verify baseline positions", () => {
    const entries = parsePlacementCsv(originalPlacement);
    const objects = entries.filter((e) => e.vdkType === "OBJECT");
    expect(objects.length).toBeGreaterThanOrEqual(1);
    expect(objects[0].positionX).toBe(250.0);
    expect(objects[0].positionY).toBe(-2.0);
    expect(objects[0].positionZ).toBe(-250.0);
  });

  test("04.2 — Modify position XYZ of first object and write to placement.csv", async () => {
    const lines = originalPlacement.trim().split("\n");
    const objectLineIdx = lines.findIndex((l) => l.includes("VDK_TYPE,OBJECT"));
    const fields = lines[objectLineIdx].split(",");

    const posXIdx = fields.findIndex((f, i) => i % 2 === 0 && f === "VDK_POSITION_X");
    const posYIdx = fields.findIndex((f, i) => i % 2 === 0 && f === "VDK_POSITION_Y");
    const posZIdx = fields.findIndex((f, i) => i % 2 === 0 && f === "VDK_POSITION_Z");
    fields[posXIdx + 1] = "999.5";
    fields[posYIdx + 1] = "42.0";
    fields[posZIdx + 1] = "-777.25";

    lines[objectLineIdx] = fields.join(",");
    await fs.writeFile(path.join(STAGE_ROOT, "info", "placement.csv"), lines.join("\n"), "utf-8");

    const updated = await fs.readFile(path.join(STAGE_ROOT, "info", "placement.csv"), "utf-8");
    const updatedEntries = parsePlacementCsv(updated);
    const updatedObj = updatedEntries.find((e) => e.vdkType === "OBJECT")!;
    expect(updatedObj.positionX).toBe(999.5);
    expect(updatedObj.positionY).toBe(42.0);
    expect(updatedObj.positionZ).toBe(-777.25);
  });

  test("04.3 — Modify rotation XYZ of first object and verify", async () => {
    const content = await fs.readFile(path.join(STAGE_ROOT, "info", "placement.csv"), "utf-8");
    const lines = content.trim().split("\n");
    const objectLineIdx = lines.findIndex((l) => l.includes("VDK_TYPE,OBJECT"));
    const fields = lines[objectLineIdx].split(",");

    const rotXIdx = fields.findIndex((f, i) => i % 2 === 0 && f === "VDK_ROTATION_X");
    const rotYIdx = fields.findIndex((f, i) => i % 2 === 0 && f === "VDK_ROTATION_Y");
    const rotZIdx = fields.findIndex((f, i) => i % 2 === 0 && f === "VDK_ROTATION_Z");
    fields[rotXIdx + 1] = "45.0";
    fields[rotYIdx + 1] = "90.0";
    fields[rotZIdx + 1] = "-30.0";

    lines[objectLineIdx] = fields.join(",");
    await fs.writeFile(path.join(STAGE_ROOT, "info", "placement.csv"), lines.join("\n"), "utf-8");

    const updated = await fs.readFile(path.join(STAGE_ROOT, "info", "placement.csv"), "utf-8");
    const updatedEntries = parsePlacementCsv(updated);
    const updatedObj = updatedEntries.find((e) => e.vdkType === "OBJECT")!;
    expect(updatedObj.rotationX).toBe(45.0);
    expect(updatedObj.rotationY).toBe(90.0);
    expect(updatedObj.rotationZ).toBe(-30.0);
  });

  test("04.4 — load_stage_bundle after transform changes still parses correctly", async () => {
    const bundle = await loadStageBundle(STAGE_ROOT);
    expect(bundle.subModels.length).toBeGreaterThanOrEqual(1);
  });

  test("04.5 — SKY entry position preserved after OBJECT modification", async () => {
    const content = await fs.readFile(path.join(STAGE_ROOT, "info", "placement.csv"), "utf-8");
    const entries = parsePlacementCsv(content);
    const skyEntry = entries.find((e) => e.vdkType === "SKY")!;
    expect(skyEntry.positionX).toBe(0.0);
    expect(skyEntry.positionY).toBe(0.0);
    expect(skyEntry.positionZ).toBe(0.0);
  });

  test("04.6 — All remaining OBJECT entries still have valid positions", async () => {
    const content = await fs.readFile(path.join(STAGE_ROOT, "info", "placement.csv"), "utf-8");
    const entries = parsePlacementCsv(content);
    const objects = entries.filter((e) => e.vdkType === "OBJECT");
    for (const obj of objects) {
      expect(Number.isFinite(obj.positionX)).toBe(true);
      expect(Number.isFinite(obj.positionY)).toBe(true);
      expect(Number.isFinite(obj.positionZ)).toBe(true);
      expect(Number.isFinite(obj.rotationX)).toBe(true);
      expect(Number.isFinite(obj.rotationY)).toBe(true);
      expect(Number.isFinite(obj.rotationZ)).toBe(true);
    }
  });
});
