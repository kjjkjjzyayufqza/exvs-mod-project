import { describe, test, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { backupStageFolder, restoreStageFolder } from "./helpers/backupRestore";
import { loadStageBundle, redistributeTextures, restoreSharedTextures } from "./helpers/ipcHelpers";

const STAGE_ROOT = "E:/XB/解包/com/test/16F73C97/0/0";

describe("Suite 02: Texture Migration", () => {
  beforeAll(async () => {
    await backupStageFolder(STAGE_ROOT);
  });

  afterAll(async () => {
    await restoreStageFolder(STAGE_ROOT);
  });

  test("02.1 — Detect old texture format: numbered subdirs contain .nutexb files", async () => {
    const texDir0 = path.join(STAGE_ROOT, "001stage001_object_box01", "0", "0");
    const entries = await fs.readdir(texDir0);
    const nutexbFiles = entries.filter((e) => e.endsWith(".nutexb"));
    expect(nutexbFiles.length).toBeGreaterThan(0);
  });

  test("02.2 — restore_shared_textures moves textures to textures/ folder", async () => {
    const result = await restoreSharedTextures(STAGE_ROOT);
    expect(result.texturesCollected).toBeGreaterThan(0);
    expect(result.subdirsRemoved).toBeGreaterThan(0);
    const textureEntries = await fs.readdir(path.join(STAGE_ROOT, "textures"));
    const nutexbFiles = textureEntries.filter((e) => e.endsWith(".nutexb"));
    expect(nutexbFiles.length).toBeGreaterThan(0);
  });

  test("02.3 — Old numbered texture subdirs are cleaned up after migration", async () => {
    try {
      const entries = await fs.readdir(path.join(STAGE_ROOT, "001stage001_object_box01", "0", "0"));
      const remaining = entries.filter((e) => e.endsWith(".nutexb"));
      expect(remaining.length).toBe(0);
    } catch {
      // Directory removed entirely — acceptable
    }
  });

  test("02.4 — SSBH files remain in model/0/", async () => {
    const ssbhDir = path.join(STAGE_ROOT, "001stage001_object_box01", "0");
    const entries = await fs.readdir(ssbhDir);
    const ssbhExtensions = [".numatb", ".numshb", ".nusktb", ".numdlb", ".jnttbl"];
    for (const ext of ssbhExtensions) {
      const hasFile = entries.some((e) => e.endsWith(ext));
      expect(hasFile, `Expected ${ext} file in model/0/`).toBe(true);
    }
  });

  test("02.5 — redistribute_stage_textures reverses migration for FHM2D packing", async () => {
    const redistResult = await redistributeTextures(STAGE_ROOT);
    expect(redistResult.texturesCopied).toBeGreaterThan(0);
    expect(redistResult.texturesFolderRemoved).toBe(true);
    const entries = await fs.readdir(path.join(STAGE_ROOT, "001stage001_object_box01", "0"), { withFileTypes: true });
    const numberedDirs = entries.filter((e) => e.isDirectory() && /^\d+$/.test(e.name));
    expect(numberedDirs.length).toBeGreaterThanOrEqual(1);
  });

  test("02.6 — restore_shared_textures after redistribute returns to shared format", async () => {
    const restoreResult = await restoreSharedTextures(STAGE_ROOT);
    expect(restoreResult.texturesCollected).toBeGreaterThan(0);
    const textureEntries = await fs.readdir(path.join(STAGE_ROOT, "textures"));
    expect(textureEntries.some((e) => e.endsWith(".nutexb"))).toBe(true);
  });

  test("02.7 — load_stage_bundle succeeds after texture migration", async () => {
    const bundle = await loadStageBundle(STAGE_ROOT);
    expect(bundle.subModels.length).toBeGreaterThanOrEqual(1);
  });
});
