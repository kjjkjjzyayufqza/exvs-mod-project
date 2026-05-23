import { describe, test, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { backupStageFolder, restoreStageFolder } from "./helpers/backupRestore";
import {
  analyzeDae, convertDaeToSsbh, extractFhm2d, loadStageBundle,
  redistributeTextures, restoreSharedTextures, rebuildStructureJson, repackFhm2d,
} from "./helpers/ipcHelpers";
import { parsePlacementCsv } from "./helpers/csvParser";

const TEST_ROOT = "E:/XB/解包/com/test";
const STAGE_ROOT = path.join(TEST_ROOT, "16F73C97", "0", "0");
const DAE_DIR = "D:/output/exvs2/zabanya";
const OUTPUT_FHM2D = path.join(TEST_ROOT, "__stress_output.fhm2d");
const REEXTRACT_DIR = path.join(TEST_ROOT, "__stress_reextract");

describe("Suite 08: Multi-Object Stress Test", () => {
  beforeAll(async () => {
    await backupStageFolder(STAGE_ROOT);
    await restoreSharedTextures(STAGE_ROOT);
  });

  afterAll(async () => {
    await restoreStageFolder(STAGE_ROOT);
    try { await fs.rm(OUTPUT_FHM2D, { force: true }); } catch {}
    try { await fs.rm(REEXTRACT_DIR, { recursive: true, force: true }); } catch {}
  });

  test("08.1 — Import backpack_up.dae as new object 'zabanya_bp_up'", async () => {
    const daePath = path.join(DAE_DIR, "backpack_up.dae");
    const outputDir = path.join(STAGE_ROOT, "zabanya_bp_up", "0");
    await fs.mkdir(outputDir, { recursive: true });
    const analysis = await analyzeDae(daePath);
    expect(analysis.canConvert).toBe(true);

    await convertDaeToSsbh({
      daePath,
      outputDir,
      baseFilename: "zabanya_bp_up",
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

    const entries = await fs.readdir(outputDir);
    expect(entries.some((f) => f.endsWith(".numdlb"))).toBe(true);
  });

  test("08.2 — Import backpack_bottom.dae as new object 'zabanya_bp_bottom'", async () => {
    const daePath = path.join(DAE_DIR, "backpack_bottom.dae");
    const outputDir = path.join(STAGE_ROOT, "zabanya_bp_bottom", "0");
    await fs.mkdir(outputDir, { recursive: true });
    const analysis = await analyzeDae(daePath);
    expect(analysis.canConvert).toBe(true);

    await convertDaeToSsbh({
      daePath,
      outputDir,
      baseFilename: "zabanya_bp_bottom",
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

    const entries = await fs.readdir(outputDir);
    expect(entries.some((f) => f.endsWith(".numdlb"))).toBe(true);
  });

  test("08.3 — Add placement rows for both new objects with different transforms", async () => {
    const csvPath = path.join(STAGE_ROOT, "info", "placement.csv");
    const content = await fs.readFile(csvPath, "utf-8");
    const bundle = await loadStageBundle(STAGE_ROOT);

    const bpUp = bundle.subModels.find((sm) => sm.folderName === "zabanya_bp_up");
    const bpBottom = bundle.subModels.find((sm) => sm.folderName === "zabanya_bp_bottom");
    expect(bpUp).toBeDefined();
    expect(bpBottom).toBeDefined();

    const newRows = [
      `VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,100.0,VDK_POSITION_Y,50.0,VDK_POSITION_Z,200.0,VDK_ROTATION_X,0.0,VDK_ROTATION_Y,90.0,VDK_ROTATION_Z,0.0,VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,${bpUp!.objectIndex},VDK_PROGRAMID,0,VDK_HITPOINT,UNBREAKABLE,VDK_SHADOW_CAST,TRUE`,
      `VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,-300.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,400.0,VDK_ROTATION_X,45.0,VDK_ROTATION_Y,0.0,VDK_ROTATION_Z,180.0,VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,${bpBottom!.objectIndex},VDK_PROGRAMID,0,VDK_HITPOINT,UNBREAKABLE,VDK_SHADOW_CAST,TRUE`,
    ];

    const updatedCsv = content.trim() + "\n" + newRows.join("\n");
    await fs.writeFile(csvPath, updatedCsv, "utf-8");
  });

  test("08.4 — Verify all placement entries are present", async () => {
    const csvPath = path.join(STAGE_ROOT, "info", "placement.csv");
    const content = await fs.readFile(csvPath, "utf-8");
    const entries = parsePlacementCsv(content);
    const objects = entries.filter((e) => e.vdkType === "OBJECT");
    expect(objects.length).toBe(6);
  });

  test("08.5 — Redistribute, rebuild structure, pack to FHM2D", async () => {
    await redistributeTextures(STAGE_ROOT);
    const structurePath = await rebuildStructureJson(STAGE_ROOT);
    const result = await repackFhm2d(structurePath, OUTPUT_FHM2D);
    expect(result.outputSize).toBeGreaterThan(0);
    const info = await fs.stat(OUTPUT_FHM2D);
    expect(info.size).toBeGreaterThan(100_000);
  });

  test("08.6 — Re-extract the stress-test FHM2D", async () => {
    const result = await extractFhm2d(OUTPUT_FHM2D, REEXTRACT_DIR);
    expect(result.totalFiles).toBeGreaterThan(0);
  });

  test("08.7 — Re-extracted placement.csv has all 6 OBJECT entries", async () => {
    const reextractRoot = await findStageRoot(REEXTRACT_DIR);
    const content = await fs.readFile(path.join(reextractRoot, "info", "placement.csv"), "utf-8");
    const entries = parsePlacementCsv(content);
    const objects = entries.filter((e) => e.vdkType === "OBJECT");
    expect(objects.length).toBe(6);
  });

  test("08.8 — New objects have correct transforms in re-extracted placement", async () => {
    const reextractRoot = await findStageRoot(REEXTRACT_DIR);
    const content = await fs.readFile(path.join(reextractRoot, "info", "placement.csv"), "utf-8");
    const entries = parsePlacementCsv(content);
    const objects = entries.filter((e) => e.vdkType === "OBJECT");

    const bpUp = objects.find((o) => o.positionX === 100.0 && o.positionY === 50.0);
    expect(bpUp).toBeDefined();
    expect(bpUp!.rotationY).toBe(90.0);

    const bpBottom = objects.find((o) => o.positionX === -300.0 && o.positionZ === 400.0);
    expect(bpBottom).toBeDefined();
    expect(bpBottom!.rotationX).toBe(45.0);
    expect(bpBottom!.rotationZ).toBe(180.0);
  });

  test("08.9 — Re-extracted bundle has added model folders", async () => {
    const reextractRoot = await findStageRoot(REEXTRACT_DIR);
    const bundle = await loadStageBundle(reextractRoot);
    const folderNames = bundle.subModels.map((sm) => sm.folderName);
    expect(folderNames.some((n) => n.includes("zabanya_bp_up"))).toBe(true);
    expect(folderNames.some((n) => n.includes("zabanya_bp_bottom"))).toBe(true);
  });

  test("08.10 — Re-extracted SSBH files for imported objects are non-empty", async () => {
    const reextractRoot = await findStageRoot(REEXTRACT_DIR);
    const entries = await fs.readdir(reextractRoot, { withFileTypes: true });
    const bpUpFolder = entries.find((e) => e.isDirectory() && e.name.includes("zabanya_bp_up"));
    expect(bpUpFolder).toBeDefined();

    const ssbhDir = path.join(reextractRoot, bpUpFolder!.name, "0");
    const ssbhEntries = await fs.readdir(ssbhDir);
    const ssbhFiles = ssbhEntries.filter((f) => f.endsWith(".numshb") || f.endsWith(".numdlb"));
    expect(ssbhFiles.length).toBeGreaterThan(0);
    for (const f of ssbhFiles) {
      const info = await fs.stat(path.join(ssbhDir, f));
      expect(info.size).toBeGreaterThan(0);
    }
  });
});

async function findStageRoot(baseDir: string): Promise<string> {
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const hashDir = entries.find((e) => e.isDirectory())!;
  return path.join(baseDir, hashDir.name, "0", "0");
}
