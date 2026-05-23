import { describe, test, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { backupStageFolder, restoreStageFolder } from "./helpers/backupRestore";
import { parsePlacementCsv, parseGraphicParamCsv } from "./helpers/csvParser";

const STAGE_ROOT = "E:/XB/解包/com/test/16F73C97/0/0";

describe("Suite 06: Save Folder CSV Output", () => {
  beforeAll(async () => {
    await backupStageFolder(STAGE_ROOT);
  });

  afterAll(async () => {
    await restoreStageFolder(STAGE_ROOT);
  });

  test("06.1 — placement.csv has valid key-value pair format", async () => {
    const csvPath = path.join(STAGE_ROOT, "info", "placement.csv");
    const content = await fs.readFile(csvPath, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const fields = line.split(",");
      expect(fields.length % 2).toBe(0);
      expect(fields[0]).toBe("VDK_TYPE");
      expect(["SKY", "OBJECT", "EFFECT"].includes(fields[1])).toBe(true);
    }
  });

  test("06.2 — graphic_param.csv preserves all parameters", async () => {
    const csvPath = path.join(STAGE_ROOT, "info", "graphic_param.csv");
    const content = await fs.readFile(csvPath, "utf-8");
    const params = parseGraphicParamCsv(content);
    expect(params.length).toBeGreaterThan(10);
    const keys = params.map((p) => p.key);
    expect(keys).toContain("directional_lighting_rot_x");
    expect(keys).toContain("directional_lighting_rot_y");
  });

  test("06.3 — Modified placement.csv round-trips through parser correctly", async () => {
    const csvPath = path.join(STAGE_ROOT, "info", "placement.csv");
    const content = await fs.readFile(csvPath, "utf-8");
    const entries = parsePlacementCsv(content);
    const reconstructed = entries.map((e) => e.rawFields.join(",")).join("\n");
    await fs.writeFile(csvPath, reconstructed, "utf-8");
    const reRead = await fs.readFile(csvPath, "utf-8");
    const reparsed = parsePlacementCsv(reRead);
    expect(reparsed.length).toBe(entries.length);
    for (let i = 0; i < entries.length; i++) {
      expect(reparsed[i].vdkType).toBe(entries[i].vdkType);
      expect(reparsed[i].positionX).toBe(entries[i].positionX);
      expect(reparsed[i].positionY).toBe(entries[i].positionY);
      expect(reparsed[i].positionZ).toBe(entries[i].positionZ);
    }
  });

  test("06.4 — CSV files use consistent line endings", async () => {
    const placementPath = path.join(STAGE_ROOT, "info", "placement.csv");
    const graphicPath = path.join(STAGE_ROOT, "info", "graphic_param.csv");
    const placement = await fs.readFile(placementPath, "utf-8");
    const graphic = await fs.readFile(graphicPath, "utf-8");
    const hasCRLF = placement.includes("\r\n");
    const hasLF = placement.includes("\n") && !hasCRLF;
    expect(hasCRLF || hasLF).toBe(true);
    if (hasCRLF) {
      expect(graphic.includes("\r\n")).toBe(true);
    }
  });
});
