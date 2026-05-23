import { describe, test, expect, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { analyzeDae, convertDaeToSsbh } from "./helpers/ipcHelpers";

const STAGE_ROOT = "E:/XB/解包/com/test/16F73C97/0/0";
const DAE_SOURCE = "D:/output/exvs2/zabanya/backpack_up.dae";
const IMPORT_OUTPUT_DIR = path.join(STAGE_ROOT, "__import_test_zabanya_bp");
const BASE_FILENAME = "zabanya_backpack_up";

describe("Suite 03: DAE Import → SSBH + HKT", () => {
  afterAll(async () => {
    try { await fs.rm(IMPORT_OUTPUT_DIR, { recursive: true, force: true }); } catch {}
    try { await fs.rm(path.join(STAGE_ROOT, "__import_test_zabanya_bp_bottom"), { recursive: true, force: true }); } catch {}
  });

  test("03.1 — ssbh_analyze_dae reports DAE as convertible", async () => {
    const analysis = await analyzeDae(DAE_SOURCE);
    expect(analysis.canConvert).toBe(true);
    expect(analysis.geometryNames.length).toBeGreaterThan(0);
    expect(analysis.blockingErrors.length).toBe(0);
  });

  test("03.2 — ssbh_convert_dae_to_ssbh produces all SSBH files", async () => {
    const analysis = await analyzeDae(DAE_SOURCE);
    const numdlbEntries = analysis.geometryNames.map((name, i) => ({
      meshObjectName: name,
      meshObjectSubindex: 0,
      materialLabel: `material_${i}`,
    }));

    const result = await convertDaeToSsbh({
      daePath: DAE_SOURCE,
      outputDir: IMPORT_OUTPUT_DIR,
      baseFilename: BASE_FILENAME,
      scaleFactor: 1.0,
      flipUv: false,
      upAxis: "y_up",
      includeGeometryNames: analysis.geometryNames,
      writeLog: true,
      writeNumdlb: true,
      writeNumshb: true,
      writeNusktb: true,
      writeNumatb: false,
      writeMayaProfile: false,
      numdlbEntries,
      mayaFile: null,
      nustFile: null,
    });
    expect(result).toBeDefined();
  });

  test("03.3 — Output directory contains .numdlb, .numshb, .nusktb files", async () => {
    const entries = await fs.readdir(IMPORT_OUTPUT_DIR);
    expect(entries.some((f) => f.endsWith(".numdlb"))).toBe(true);
    expect(entries.some((f) => f.endsWith(".numshb"))).toBe(true);
    expect(entries.some((f) => f.endsWith(".nusktb"))).toBe(true);
  });

  test("03.4 — Generated SSBH files are non-empty", async () => {
    const entries = await fs.readdir(IMPORT_OUTPUT_DIR);
    const ssbhFiles = entries.filter((e) =>
      e.endsWith(".numdlb") || e.endsWith(".numshb") || e.endsWith(".nusktb")
    );
    for (const file of ssbhFiles) {
      const info = await fs.stat(path.join(IMPORT_OUTPUT_DIR, file));
      expect(info.size, `${file} should be non-empty`).toBeGreaterThan(0);
    }
  });

  test("03.5 — Conversion log file is written", async () => {
    const entries = await fs.readdir(IMPORT_OUTPUT_DIR);
    const logFile = entries.find((e) => e.endsWith(".log"));
    expect(logFile).toBeDefined();
    const logContent = await fs.readFile(path.join(IMPORT_OUTPUT_DIR, logFile!), "utf-8");
    expect(logContent.length).toBeGreaterThan(0);
  });

  test("03.6 — Second DAE (backpack_bottom.dae) also converts successfully", async () => {
    const DAE_2 = "D:/output/exvs2/zabanya/backpack_bottom.dae";
    const OUT_2 = path.join(STAGE_ROOT, "__import_test_zabanya_bp_bottom");

    const analysis = await analyzeDae(DAE_2);
    expect(analysis.canConvert).toBe(true);

    const result = await convertDaeToSsbh({
      daePath: DAE_2,
      outputDir: OUT_2,
      baseFilename: "zabanya_backpack_bottom",
      scaleFactor: 1.0,
      flipUv: false,
      upAxis: "y_up",
      includeGeometryNames: analysis.geometryNames,
      writeLog: false,
      writeNumdlb: true,
      writeNumshb: true,
      writeNusktb: true,
      writeNumatb: false,
      writeMayaProfile: false,
      numdlbEntries: analysis.geometryNames.map((name, i) => ({
        meshObjectName: name,
        meshObjectSubindex: 0,
        materialLabel: `material_${i}`,
      })),
      mayaFile: null,
      nustFile: null,
    });
    expect(result).toBeDefined();

    const entries = await fs.readdir(OUT_2);
    expect(entries.some((f) => f.endsWith(".numdlb"))).toBe(true);
  });
});
