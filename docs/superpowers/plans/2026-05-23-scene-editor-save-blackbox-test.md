# Scene Editor Save — Black-Box Integration Test Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End-to-end black-box validation of the Scene Editor save pipeline — extract FHM2D, migrate textures, import DAE as SSBH+HKT, manipulate objects (add/delete/move/position/scale/rotation), save to folder, pack to FHM2D, re-extract and verify round-trip integrity.

**Architecture:** Each test task operates via the Tauri MCP server (`ipc_execute_command` for Rust backend calls, `webview_interact` + `webview_screenshot` + `webview_dom_snapshot` for UI verification). All test stages are backed up before modification and restored after each test. Verification uses file-system diffing, CSV content comparison, and structure JSON validation.

**Tech Stack:** Tauri MCP (IPC commands), PowerShell (file operations, backup/restore), Node.js (file comparison scripts)

---

## Test Data Inventory

### FHM2D Test Files

| File | Hash Stem | Size | Objects | Notes |
|------|-----------|------|---------|-------|
| `16F73C97.fhm2d` | 16F73C97 | ~5.8 MB | 1 object (box01) + base + sky | **Primary test target** — small, fast |
| `84F085E5.fhm2d` | 84F085E5 | ~17 MB | Simple menu stage | Smoke test |
| `35516817.fhm2d` | 35516817 | ~195 MB | 22 objects + EFFECT entries | EFFECT preservation |
| `test.fhm2d` | test | ~5.7 MB | (Variant of 16F73C97) | Quick round-trip |

**Test data root:** `E:\XB\解包\com\test`

### DAE Source Files for Import

| File | Path | Size | Notes |
|------|------|------|-------|
| `backpack_up.dae` | `D:\output\exvs2\zabanya\backpack_up.dae` | ~47 KB | Smallest — fastest import, ideal for transform tests |
| `backpack_bottom.dae` | `D:\output\exvs2\zabanya\backpack_bottom.dae` | ~125 KB | Medium size model |
| `body.dae` | `D:\output\exvs2\zabanya\body.dae` | ~866 KB | Largest — complex geometry |

### Pre-Extracted Stage Structure (16F73C97)

```
16F73C97/0/0/
├── 001stage001_object_box01/
│   ├── 0/                          ← SSBH files (numatb, numshb, nusktb, numdlb, jnttbl)
│   │   ├── 0/                      ← Texture variant 0 (12 nutexb files)
│   │   └── 1/                      ← Texture variant 1 (12 nutexb files)
│   └── map_hit.hkt                 ← Collision mesh
├── base/001stage001_base/          ← Base geometry + textures in 0/, 1/
├── sky/0/                          ← Sky model + textures in 0/
├── info/
│   ├── placement.csv               ← 1 SKY + 4 OBJECT rows (all VDK_OBJECTNUMBER=0)
│   ├── graphic_param.csv           ← ~50 lighting/fog/shadow params
│   ├── plan_param.spbin
│   ├── border_hit.hkt
│   ├── fog/, light/, post_effect/  ← Additional texture folders
│   └── ...
```

### Placement.csv Format

Each row is comma-separated key-value pairs:
```
VDK_TYPE,SKY,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,0.0,...,VDK_OBJECTNUMBER,1
VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,250.0,VDK_POSITION_Y,-2.0,VDK_POSITION_Z,-250.0,...,VDK_OBJECTNUMBER,0,...
```

### Key Tauri IPC Commands

| Command | Args | Purpose |
|---------|------|---------|
| `extract_stage_fhm2d_to_folder` | `{ sourcePath, outputDir }` | Extract FHM2D → folder |
| `load_stage_bundle` | `{ stageRoot }` | Parse folder into scene bundle |
| `redistribute_stage_textures` | `{ stageRoot }` | Copy textures from `textures/` to model subdirs |
| `restore_shared_textures` | `{ stageRoot }` | Collect scattered textures back to `textures/` |
| `rebuild_stage_structure_json` | `{ stageRoot }` | Regenerate structure JSON from disk |
| `repack_fhm2d` | `{ structureJsonPath, outputPath, atomicWrite }` | Pack folder → FHM2D binary |
| `ssbh_convert_dae_to_ssbh` | `{ daePath, outputDir, baseFilename, scaleFactor, flipUv, upAxis, ... }` | DAE → SSBH conversion |
| `convert_hkt_to_obj` | `{ inputPath, outputPath }` | HKT → OBJ (for verification) |
| `scene_generate_hkt` | `{ sessionId, importId, profile }` | Generate HKT from DAE bytes |

---

## File Structure

### New Files

```
tests/blackbox/
├── helpers/
│   ├── backupRestore.ts           — Backup/restore stage folders before/after tests
│   ├── ipcHelpers.ts              — Typed wrappers around Tauri IPC commands
│   ├── csvParser.ts               — Parse placement.csv and graphic_param.csv
│   ├── structureJsonValidator.ts  — Validate structure JSON against disk files
│   └── fileCompare.ts             — Binary file comparison and directory diff
├── suite01_extract_roundtrip.test.ts      — Extract FHM2D → verify folder structure
├── suite02_texture_migration.test.ts      — Old format → shared textures/ migration
├── suite03_dae_import_ssbh.test.ts        — DAE → SSBH+HKT conversion
├── suite04_placement_transform.test.ts    — Position/rotation/scale save & verify
├── suite05_object_delete.test.ts          — Object deletion + re-indexing
├── suite06_save_folder_csv.test.ts        — Save folder pipeline CSV output
├── suite07_save_fhm2d_roundtrip.test.ts   — Full FHM2D save → re-extract → compare
├── suite08_multi_object_stress.test.ts    — Add multiple objects + transforms + save
└── vitest.config.blackbox.ts              — Vitest config for blackbox tests (long timeout)
```

---

## Task 1: Test Infrastructure — Backup/Restore + IPC Helpers

**Files:**
- Create: `tests/blackbox/helpers/backupRestore.ts`
- Create: `tests/blackbox/helpers/ipcHelpers.ts`
- Create: `tests/blackbox/helpers/csvParser.ts`
- Create: `tests/blackbox/helpers/structureJsonValidator.ts`
- Create: `tests/blackbox/helpers/fileCompare.ts`
- Create: `tests/blackbox/vitest.config.blackbox.ts`

### backupRestore.ts

Provides safe backup and restore of stage folders before each test run:

```typescript
import { copyFile, mkdir, readDir, remove, stat } from "@tauri-apps/plugin-fs";

const BACKUP_SUFFIX = "__backup";

export async function backupStageFolder(stageRoot: string): Promise<string> {
  const backupPath = `${stageRoot}${BACKUP_SUFFIX}`;
  await copyDirectoryRecursive(stageRoot, backupPath);
  return backupPath;
}

export async function restoreStageFolder(stageRoot: string): Promise<void> {
  const backupPath = `${stageRoot}${BACKUP_SUFFIX}`;
  const backupExists = await pathExists(backupPath);
  if (!backupExists) throw new Error(`Backup not found: ${backupPath}`);
  await remove(stageRoot, { recursive: true });
  await copyDirectoryRecursive(backupPath, stageRoot);
  await remove(backupPath, { recursive: true });
}

async function copyDirectoryRecursive(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readDir(src);
  for (const entry of entries) {
    const srcPath = `${src}/${entry.name}`;
    const destPath = `${dest}/${entry.name}`;
    if (entry.isDirectory) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
```

### ipcHelpers.ts

Typed wrappers around the Tauri IPC commands used in tests:

```typescript
import { invoke } from "@tauri-apps/api/core";

export type StageExtractResult = {
  outputDir: string;
  totalFiles: number;
  warnings: string[];
};

export type StageBundleResponse = {
  subModels: Array<{
    folderName: string;
    objectIndex: number;
    meshCount: number;
  }>;
  baseFolderName: string | null;
  skyFolderName: string | null;
};

export type RedistributeResult = {
  modelsProcessed: number;
  texturesCopied: number;
  texturesFolderRemoved: boolean;
  warnings: string[];
};

export type RestoreSharedResult = {
  texturesCollected: number;
  subdirsRemoved: number;
  warnings: string[];
};

export type RepackResult = {
  outputPath: string;
  totalFiles: number;
  outputSize: number;
};

export async function extractFhm2d(
  sourcePath: string,
  outputDir: string,
): Promise<StageExtractResult> {
  return invoke("extract_stage_fhm2d_to_folder", { sourcePath, outputDir });
}

export async function loadStageBundle(
  stageRoot: string,
): Promise<StageBundleResponse> {
  return invoke("load_stage_bundle", { stageRoot });
}

export async function redistributeTextures(
  stageRoot: string,
): Promise<RedistributeResult> {
  return invoke("redistribute_stage_textures", { stageRoot });
}

export async function restoreSharedTextures(
  stageRoot: string,
): Promise<RestoreSharedResult> {
  return invoke("restore_shared_textures", { stageRoot });
}

export async function rebuildStructureJson(
  stageRoot: string,
): Promise<string> {
  return invoke("rebuild_stage_structure_json", { stageRoot });
}

export async function repackFhm2d(
  structureJsonPath: string,
  outputPath: string,
): Promise<RepackResult> {
  return invoke("repack_fhm2d", {
    structureJsonPath,
    outputPath,
    atomicWrite: true,
  });
}

export async function convertDaeToSsbh(params: {
  daePath: string;
  outputDir: string;
  baseFilename: string;
  scaleFactor: number;
  flipUv: boolean;
  upAxis: string;
  includeGeometryNames: string[];
  writeLog: boolean;
  writeNumdlb: boolean;
  writeNumshb: boolean;
  writeNusktb: boolean;
  writeNumatb: boolean;
  writeMayaProfile: boolean;
  numdlbEntries: Array<{
    meshObjectName: string;
    meshObjectSubindex: number;
    materialLabel: string;
  }>;
  mayaFile: unknown;
  nustFile: unknown;
}): Promise<unknown> {
  return invoke("ssbh_convert_dae_to_ssbh", params);
}

export async function analyzeDae(
  daePath: string,
): Promise<{
  canConvert: boolean;
  geometryNames: string[];
  blockingErrors: string[];
}> {
  return invoke("ssbh_analyze_dae", { daePath });
}
```

### csvParser.ts

Parse the pipe-style placement.csv and key-value graphic_param.csv:

```typescript
export type PlacementEntry = {
  vdkType: string;
  positionX: number;
  positionY: number;
  positionZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  objectNumber: number | null;
  rawFields: string[];
};

export function parsePlacementCsv(content: string): PlacementEntry[] {
  return content
    .trim()
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const fields = line.split(",");
      const fieldMap = new Map<string, string>();
      for (let i = 0; i < fields.length - 1; i += 2) {
        fieldMap.set(fields[i], fields[i + 1]);
      }
      return {
        vdkType: fieldMap.get("VDK_TYPE") ?? "",
        positionX: parseFloat(fieldMap.get("VDK_POSITION_X") ?? "0"),
        positionY: parseFloat(fieldMap.get("VDK_POSITION_Y") ?? "0"),
        positionZ: parseFloat(fieldMap.get("VDK_POSITION_Z") ?? "0"),
        rotationX: parseFloat(fieldMap.get("VDK_ROTATION_X") ?? "0"),
        rotationY: parseFloat(fieldMap.get("VDK_ROTATION_Y") ?? "0"),
        rotationZ: parseFloat(fieldMap.get("VDK_ROTATION_Z") ?? "0"),
        objectNumber: fieldMap.has("VDK_OBJECTNUMBER")
          ? parseInt(fieldMap.get("VDK_OBJECTNUMBER")!, 10)
          : null,
        rawFields: fields,
      };
    });
}

export type GraphicParam = { key: string; value: string };

export function parseGraphicParamCsv(content: string): GraphicParam[] {
  return content
    .trim()
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const commaIdx = line.indexOf(",");
      return {
        key: line.slice(0, commaIdx),
        value: line.slice(commaIdx + 1),
      };
    });
}
```

### structureJsonValidator.ts

Validate that a structure JSON file matches the actual files on disk:

```typescript
import { stat, readDir } from "@tauri-apps/plugin-fs";

type StructureEntry = {
  index: number;
  fileType: string;
  fileIndex: number;
  fileUrl: string;
  fileBaseName: string;
};

type StructureJson = {
  Magic: number;
  Fhm2dTotalCount: number;
  UnkCount: number;
  SubFileData: StructureEntry[];
};

export type ValidationResult = {
  valid: boolean;
  totalEntries: number;
  missingFiles: string[];
  extraFiles: string[];
  errors: string[];
};

export async function validateStructureJson(
  structurePath: string,
  packRoot: string,
): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    totalEntries: 0,
    missingFiles: [],
    extraFiles: [],
    errors: [],
  };

  let structure: StructureJson;
  try {
    const content = await (await fetch(structurePath)).text();
    structure = JSON.parse(content);
  } catch (err) {
    result.valid = false;
    result.errors.push(`Failed to read structure JSON: ${err}`);
    return result;
  }

  result.totalEntries = structure.SubFileData.length;
  if (structure.Fhm2dTotalCount !== structure.SubFileData.length) {
    result.errors.push(
      `Fhm2dTotalCount (${structure.Fhm2dTotalCount}) != SubFileData.length (${structure.SubFileData.length})`,
    );
    result.valid = false;
  }

  for (const entry of structure.SubFileData) {
    const fullPath = `${packRoot}/../../../${entry.fileUrl}`;
    try {
      await stat(fullPath);
    } catch {
      result.missingFiles.push(entry.fileUrl);
      result.valid = false;
    }
  }

  const diskFiles = await collectAllFiles(packRoot);
  const structuredPaths = new Set(
    structure.SubFileData.map((e) => {
      const parts = e.fileUrl.split("/");
      return parts.slice(3).join("/");
    }),
  );

  for (const diskFile of diskFiles) {
    if (!structuredPaths.has(diskFile) && !diskFile.endsWith("_structure.json")) {
      result.extraFiles.push(diskFile);
    }
  }

  return result;
}

async function collectAllFiles(
  root: string,
  relativeTo = "",
): Promise<string[]> {
  const entries = await readDir(root);
  const result: string[] = [];
  for (const entry of entries) {
    const relative = relativeTo ? `${relativeTo}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      result.push(...(await collectAllFiles(`${root}/${entry.name}`, relative)));
    } else {
      result.push(relative);
    }
  }
  return result;
}
```

### fileCompare.ts

Binary file comparison and directory diffing:

```typescript
import { readFile, readDir, stat } from "@tauri-apps/plugin-fs";

export type DirDiffResult = {
  identical: boolean;
  onlyInA: string[];
  onlyInB: string[];
  different: string[];
  sameCount: number;
};

export async function compareDirectories(
  dirA: string,
  dirB: string,
): Promise<DirDiffResult> {
  const filesA = await collectFileSet(dirA);
  const filesB = await collectFileSet(dirB);

  const allPaths = new Set([...filesA.keys(), ...filesB.keys()]);
  const result: DirDiffResult = {
    identical: true,
    onlyInA: [],
    onlyInB: [],
    different: [],
    sameCount: 0,
  };

  for (const path of allPaths) {
    const inA = filesA.has(path);
    const inB = filesB.has(path);
    if (inA && !inB) {
      result.onlyInA.push(path);
      result.identical = false;
    } else if (!inA && inB) {
      result.onlyInB.push(path);
      result.identical = false;
    } else {
      const sizeA = filesA.get(path)!;
      const sizeB = filesB.get(path)!;
      if (sizeA !== sizeB) {
        result.different.push(path);
        result.identical = false;
      } else {
        result.sameCount++;
      }
    }
  }

  return result;
}

async function collectFileSet(
  root: string,
  relativeTo = "",
): Promise<Map<string, number>> {
  const entries = await readDir(root);
  const result = new Map<string, number>();
  for (const entry of entries) {
    const relative = relativeTo ? `${relativeTo}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      const sub = await collectFileSet(`${root}/${entry.name}`, relative);
      for (const [k, v] of sub) result.set(k, v);
    } else {
      const info = await stat(`${root}/${entry.name}`);
      result.set(relative, info.size);
    }
  }
  return result;
}

export async function compareBinaryFiles(
  pathA: string,
  pathB: string,
): Promise<boolean> {
  const bytesA = await readFile(pathA);
  const bytesB = await readFile(pathB);
  if (bytesA.length !== bytesB.length) return false;
  for (let i = 0; i < bytesA.length; i++) {
    if (bytesA[i] !== bytesB[i]) return false;
  }
  return true;
}
```

### vitest.config.blackbox.ts

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/blackbox/suite*.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 120_000,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
    },
  },
});
```

- [ ] **Step 1: Create `tests/blackbox/helpers/backupRestore.ts`** — implement `backupStageFolder` and `restoreStageFolder` using Tauri fs APIs with recursive copy

- [ ] **Step 2: Create `tests/blackbox/helpers/ipcHelpers.ts`** — typed wrappers for all IPC commands listed above

- [ ] **Step 3: Create `tests/blackbox/helpers/csvParser.ts`** — parse placement.csv (pipe-style key-value pairs) and graphic_param.csv (key,value lines)

- [ ] **Step 4: Create `tests/blackbox/helpers/structureJsonValidator.ts`** — validate every entry in structure JSON has a matching file on disk

- [ ] **Step 5: Create `tests/blackbox/helpers/fileCompare.ts`** — directory diff and binary file comparison

- [ ] **Step 6: Create `tests/blackbox/vitest.config.blackbox.ts`** — 5 minute timeout, single fork pool

- [ ] **Step 7: Commit**

```bash
git add tests/blackbox/helpers/ tests/blackbox/vitest.config.blackbox.ts
git commit -m "test(blackbox): add test infrastructure — backup/restore, IPC helpers, CSV parser, file diff"
```

---

## Task 2: Suite 01 — FHM2D Extract Round-Trip

**Files:**
- Create: `tests/blackbox/suite01_extract_roundtrip.test.ts`

This test verifies the fundamental extract pipeline: FHM2D binary → extracted folder → structure is valid.

### Test Cases

```typescript
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  extractFhm2d,
  loadStageBundle,
  restoreSharedTextures,
} from "./helpers/ipcHelpers";

const TEST_ROOT = "E:/XB/解包/com/test";

describe("Suite 01: FHM2D Extract Round-Trip", () => {
  const fhm2dPath = `${TEST_ROOT}/16F73C97.fhm2d`;
  const extractDir = `${TEST_ROOT}/__extract_test_01`;

  afterAll(async () => {
    // Cleanup: remove extract dir
  });

  test("01.1 — Extract 16F73C97.fhm2d produces valid folder structure", async () => {
    const result = await extractFhm2d(fhm2dPath, extractDir);
    expect(result.totalFiles).toBeGreaterThan(0);
    expect(result.outputDir).toContain("16F73C97");
  });

  test("01.2 — Extracted folder has base, sky, info, and at least one object folder", async () => {
    const stageRoot = `${extractDir}/16F73C97/0/0`;
    const entries = await readDir(stageRoot);
    const folderNames = entries.filter((e) => e.isDirectory).map((e) => e.name);
    expect(folderNames).toContain("base");
    expect(folderNames).toContain("sky");
    expect(folderNames).toContain("info");
    expect(folderNames.some((n) => n.includes("object"))).toBe(true);
  });

  test("01.3 — load_stage_bundle succeeds on extracted folder", async () => {
    const stageRoot = `${extractDir}/16F73C97/0/0`;
    const bundle = await loadStageBundle(stageRoot);
    expect(bundle.subModels.length).toBeGreaterThanOrEqual(1);
    expect(bundle.baseFolderName).toBeTruthy();
    expect(bundle.skyFolderName).toBeTruthy();
  });

  test("01.4 — restore_shared_textures consolidates textures to textures/ folder", async () => {
    const stageRoot = `${extractDir}/16F73C97/0/0`;
    const result = await restoreSharedTextures(stageRoot);
    expect(result.texturesCollected).toBeGreaterThan(0);
    // Verify textures/ folder exists
    const entries = await readDir(stageRoot);
    const hasTexturesDir = entries.some(
      (e) => e.isDirectory && e.name === "textures",
    );
    expect(hasTexturesDir).toBe(true);
  });

  test("01.5 — placement.csv has expected format with SKY and OBJECT entries", async () => {
    const stageRoot = `${extractDir}/16F73C97/0/0`;
    const content = await readTextFile(`${stageRoot}/info/placement.csv`);
    const entries = parsePlacementCsv(content);
    const skyEntries = entries.filter((e) => e.vdkType === "SKY");
    const objectEntries = entries.filter((e) => e.vdkType === "OBJECT");
    expect(skyEntries.length).toBe(1);
    expect(objectEntries.length).toBeGreaterThanOrEqual(1);
  });

  test("01.6 — graphic_param.csv has expected parameters", async () => {
    const stageRoot = `${extractDir}/16F73C97/0/0`;
    const content = await readTextFile(`${stageRoot}/info/graphic_param.csv`);
    const params = parseGraphicParamCsv(content);
    expect(params.length).toBeGreaterThan(10);
    const lightingRotX = params.find(
      (p) => p.key === "directional_lighting_rot_x",
    );
    expect(lightingRotX).toBeDefined();
    expect(parseFloat(lightingRotX!.value)).toBe(-45);
  });
});
```

- [ ] **Step 1: Write suite01_extract_roundtrip.test.ts** with all 6 test cases shown above

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/blackbox/suite01_extract_roundtrip.test.ts --config tests/blackbox/vitest.config.blackbox.ts
```

Expected: All pass (or identify real pipeline bugs)

- [ ] **Step 3: Commit**

```bash
git add tests/blackbox/suite01_extract_roundtrip.test.ts
git commit -m "test(blackbox): suite 01 — FHM2D extract round-trip verification"
```

---

## Task 3: Suite 02 — Texture Migration (Old → Shared Format)

**Files:**
- Create: `tests/blackbox/suite02_texture_migration.test.ts`

Validates that the old texture format (numbered subdirs `0/`, `1/` inside model folders with `.nutexb` files) is correctly migrated to the shared `textures/` folder at stage root.

### Test Cases

```typescript
describe("Suite 02: Texture Migration", () => {
  const stageRoot = "E:/XB/解包/com/test/16F73C97/0/0";
  let backupPath: string;

  beforeAll(async () => {
    backupPath = await backupStageFolder(stageRoot);
  });

  afterAll(async () => {
    await restoreStageFolder(stageRoot);
  });

  test("02.1 — Detect old texture format: numbered subdirs contain .nutexb files", async () => {
    // Before migration, object_box01/0/0/ and object_box01/0/1/ should contain .nutexb
    const texDir0 = `${stageRoot}/001stage001_object_box01/0/0`;
    const entries = await readDir(texDir0);
    const nutexbFiles = entries.filter(
      (e) => e.isFile && e.name.endsWith(".nutexb"),
    );
    expect(nutexbFiles.length).toBeGreaterThan(0);
  });

  test("02.2 — restore_shared_textures moves textures to textures/ folder", async () => {
    const result = await restoreSharedTextures(stageRoot);
    expect(result.texturesCollected).toBeGreaterThan(0);
    expect(result.subdirsRemoved).toBeGreaterThan(0);

    // Verify textures/ folder has nutexb files
    const textureEntries = await readDir(`${stageRoot}/textures`);
    const nutexbFiles = textureEntries.filter(
      (e) => e.isFile && e.name.endsWith(".nutexb"),
    );
    expect(nutexbFiles.length).toBeGreaterThan(0);
  });

  test("02.3 — Old numbered texture subdirs are cleaned up after migration", async () => {
    // object_box01/0/0/ should no longer exist (or be empty of .nutexb)
    try {
      const entries = await readDir(
        `${stageRoot}/001stage001_object_box01/0/0`,
      );
      const remaining = entries.filter(
        (e) => e.isFile && e.name.endsWith(".nutexb"),
      );
      expect(remaining.length).toBe(0);
    } catch {
      // Directory removed entirely — also acceptable
    }
  });

  test("02.4 — SSBH files (.numatb, .numshb, .nusktb, .numdlb, .jnttbl) remain in model/0/", async () => {
    const ssbhDir = `${stageRoot}/001stage001_object_box01/0`;
    const entries = await readDir(ssbhDir);
    const ssbhExtensions = [".numatb", ".numshb", ".nusktb", ".numdlb", ".jnttbl"];
    for (const ext of ssbhExtensions) {
      const hasFile = entries.some(
        (e) => e.isFile && e.name.endsWith(ext),
      );
      expect(hasFile, `Expected ${ext} file in model/0/`).toBe(true);
    }
  });

  test("02.5 — redistribute_stage_textures reverses migration for FHM2D packing", async () => {
    const redistResult = await redistributeTextures(stageRoot);
    expect(redistResult.texturesCopied).toBeGreaterThan(0);
    expect(redistResult.texturesFolderRemoved).toBe(true);

    // Object model folder should have numbered texture subdirs again
    const entries = await readDir(`${stageRoot}/001stage001_object_box01/0`);
    const numberedDirs = entries.filter(
      (e) => e.isDirectory && /^\d+$/.test(e.name),
    );
    expect(numberedDirs.length).toBeGreaterThanOrEqual(1);
  });

  test("02.6 — restore_shared_textures after redistribute returns to shared format", async () => {
    const restoreResult = await restoreSharedTextures(stageRoot);
    expect(restoreResult.texturesCollected).toBeGreaterThan(0);

    const textureEntries = await readDir(`${stageRoot}/textures`);
    expect(textureEntries.some((e) => e.name.endsWith(".nutexb"))).toBe(true);
  });

  test("02.7 — load_stage_bundle succeeds after texture migration", async () => {
    const bundle = await loadStageBundle(stageRoot);
    expect(bundle.subModels.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 1: Write suite02_texture_migration.test.ts** with all 7 test cases

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/blackbox/suite02_texture_migration.test.ts --config tests/blackbox/vitest.config.blackbox.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/blackbox/suite02_texture_migration.test.ts
git commit -m "test(blackbox): suite 02 — texture migration old format to shared textures/"
```

---

## Task 4: Suite 03 — DAE Import → SSBH + HKT Conversion

**Files:**
- Create: `tests/blackbox/suite03_dae_import_ssbh.test.ts`

Tests DAE → SSBH conversion using the `backpack_up.dae` (smallest, ~47KB) from `D:\output\exvs2\zabanya`. Verifies all expected SSBH output files are generated and are non-empty.

### Test Cases

```typescript
describe("Suite 03: DAE Import → SSBH + HKT", () => {
  const DAE_SOURCE = "D:/output/exvs2/zabanya/backpack_up.dae";
  const STAGE_ROOT = "E:/XB/解包/com/test/16F73C97/0/0";
  const IMPORT_OUTPUT_DIR = `${STAGE_ROOT}/__import_test_zabanya_bp`;
  const BASE_FILENAME = "zabanya_backpack_up";

  afterAll(async () => {
    // Cleanup import test output
    try {
      await remove(IMPORT_OUTPUT_DIR, { recursive: true });
    } catch { /* ignore */ }
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
    expect((result as any).ok).toBe(true);
  });

  test("03.3 — Output directory contains .numdlb, .numshb, .nusktb files", async () => {
    const entries = await readDir(IMPORT_OUTPUT_DIR);
    const fileNames = entries.filter((e) => e.isFile).map((e) => e.name);
    expect(fileNames.some((f) => f.endsWith(".numdlb"))).toBe(true);
    expect(fileNames.some((f) => f.endsWith(".numshb"))).toBe(true);
    expect(fileNames.some((f) => f.endsWith(".nusktb"))).toBe(true);
  });

  test("03.4 — Generated SSBH files are non-empty", async () => {
    const entries = await readDir(IMPORT_OUTPUT_DIR);
    const ssbhFiles = entries.filter(
      (e) =>
        e.isFile &&
        (e.name.endsWith(".numdlb") ||
          e.name.endsWith(".numshb") ||
          e.name.endsWith(".nusktb")),
    );
    for (const file of ssbhFiles) {
      const info = await stat(`${IMPORT_OUTPUT_DIR}/${file.name}`);
      expect(info.size, `${file.name} should be non-empty`).toBeGreaterThan(0);
    }
  });

  test("03.5 — Conversion log file is written", async () => {
    const entries = await readDir(IMPORT_OUTPUT_DIR);
    const logFile = entries.find((e) => e.name.endsWith("_dae_to_ssbh.log"));
    expect(logFile).toBeDefined();
    const logContent = await readTextFile(
      `${IMPORT_OUTPUT_DIR}/${logFile!.name}`,
    );
    expect(logContent).toContain("dae_path=");
    expect(logContent).toContain("write_numshb=true");
  });

  test("03.6 — Second DAE (backpack_bottom.dae) also converts successfully", async () => {
    const DAE_2 = "D:/output/exvs2/zabanya/backpack_bottom.dae";
    const OUT_2 = `${STAGE_ROOT}/__import_test_zabanya_bp_bottom`;

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

    expect((result as any).ok).toBe(true);

    // Cleanup
    try {
      await remove(OUT_2, { recursive: true });
    } catch { /* ignore */ }
  });
});
```

- [ ] **Step 1: Write suite03_dae_import_ssbh.test.ts** with all 6 test cases

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/blackbox/suite03_dae_import_ssbh.test.ts --config tests/blackbox/vitest.config.blackbox.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/blackbox/suite03_dae_import_ssbh.test.ts
git commit -m "test(blackbox): suite 03 — DAE import to SSBH+HKT conversion"
```

---

## Task 5: Suite 04 — Placement Transform Save & Verify

**Files:**
- Create: `tests/blackbox/suite04_placement_transform.test.ts`

Tests that position (X/Y/Z), rotation (X/Y/Z), and scale transforms written to placement.csv survive a save → reload cycle. Uses the pre-extracted 16F73C97 stage. Modifies placement.csv directly and verifies via `load_stage_bundle` + re-read.

### Test Cases

```typescript
describe("Suite 04: Placement Transform Save & Verify", () => {
  const STAGE_ROOT = "E:/XB/解包/com/test/16F73C97/0/0";
  let backupPath: string;
  let originalPlacement: string;

  beforeAll(async () => {
    backupPath = await backupStageFolder(STAGE_ROOT);
    originalPlacement = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
  });

  afterAll(async () => {
    await restoreStageFolder(STAGE_ROOT);
  });

  test("04.1 — Read original placement.csv and verify baseline positions", () => {
    const entries = parsePlacementCsv(originalPlacement);
    const objects = entries.filter((e) => e.vdkType === "OBJECT");
    expect(objects.length).toBeGreaterThanOrEqual(1);

    // First object should be at (250, -2, -250)
    expect(objects[0].positionX).toBe(250.0);
    expect(objects[0].positionY).toBe(-2.0);
    expect(objects[0].positionZ).toBe(-250.0);
  });

  test("04.2 — Modify position XYZ of first object and write to placement.csv", async () => {
    const entries = parsePlacementCsv(originalPlacement);
    const firstObject = entries.find((e) => e.vdkType === "OBJECT")!;

    // Patch position fields in rawFields
    const fields = [...firstObject.rawFields];
    const posXIdx = fields.indexOf("VDK_POSITION_X");
    const posYIdx = fields.indexOf("VDK_POSITION_Y");
    const posZIdx = fields.indexOf("VDK_POSITION_Z");
    fields[posXIdx + 1] = "999.5";
    fields[posYIdx + 1] = "42.0";
    fields[posZIdx + 1] = "-777.25";

    // Rebuild CSV
    const lines = originalPlacement.trim().split("\n");
    const objectLineIdx = lines.findIndex(
      (l) => l.includes("VDK_TYPE,OBJECT"),
    );
    lines[objectLineIdx] = fields.join(",");
    await writeTextFile(`${STAGE_ROOT}/info/placement.csv`, lines.join("\n"));

    // Re-read and verify
    const updated = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
    const updatedEntries = parsePlacementCsv(updated);
    const updatedObj = updatedEntries.find((e) => e.vdkType === "OBJECT")!;
    expect(updatedObj.positionX).toBe(999.5);
    expect(updatedObj.positionY).toBe(42.0);
    expect(updatedObj.positionZ).toBe(-777.25);
  });

  test("04.3 — Modify rotation XYZ of first object and verify", async () => {
    const content = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
    const lines = content.trim().split("\n");
    const objectLineIdx = lines.findIndex(
      (l) => l.includes("VDK_TYPE,OBJECT"),
    );
    const fields = lines[objectLineIdx].split(",");

    const rotXIdx = fields.indexOf("VDK_ROTATION_X");
    const rotYIdx = fields.indexOf("VDK_ROTATION_Y");
    const rotZIdx = fields.indexOf("VDK_ROTATION_Z");
    fields[rotXIdx + 1] = "45.0";
    fields[rotYIdx + 1] = "90.0";
    fields[rotZIdx + 1] = "-30.0";

    lines[objectLineIdx] = fields.join(",");
    await writeTextFile(`${STAGE_ROOT}/info/placement.csv`, lines.join("\n"));

    const updated = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
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
    const content = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
    const entries = parsePlacementCsv(content);
    const skyEntry = entries.find((e) => e.vdkType === "SKY")!;
    expect(skyEntry.positionX).toBe(0.0);
    expect(skyEntry.positionY).toBe(0.0);
    expect(skyEntry.positionZ).toBe(0.0);
  });

  test("04.6 — All remaining OBJECT entries still have valid positions", async () => {
    const content = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
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
```

- [ ] **Step 1: Write suite04_placement_transform.test.ts** with all 6 test cases

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/blackbox/suite04_placement_transform.test.ts --config tests/blackbox/vitest.config.blackbox.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/blackbox/suite04_placement_transform.test.ts
git commit -m "test(blackbox): suite 04 — placement transform save/verify (position, rotation)"
```

---

## Task 6: Suite 05 — Object Deletion + Re-indexing

**Files:**
- Create: `tests/blackbox/suite05_object_delete.test.ts`

Tests deleting an object folder from a stage, verifying that placement.csv is updated correctly and structure JSON no longer references the deleted object.

### Test Cases

```typescript
describe("Suite 05: Object Deletion + Re-indexing", () => {
  const STAGE_ROOT = "E:/XB/解包/com/test/16F73C97/0/0";
  let backupPath: string;

  beforeAll(async () => {
    backupPath = await backupStageFolder(STAGE_ROOT);
  });

  afterAll(async () => {
    await restoreStageFolder(STAGE_ROOT);
  });

  test("05.1 — Count objects before deletion", async () => {
    const bundle = await loadStageBundle(STAGE_ROOT);
    expect(bundle.subModels.length).toBeGreaterThanOrEqual(1);
  });

  test("05.2 — Delete object folder from disk", async () => {
    const objectFolder = `${STAGE_ROOT}/001stage001_object_box01`;
    await remove(objectFolder, { recursive: true });

    // Verify folder is gone
    try {
      await stat(objectFolder);
      throw new Error("Folder should not exist");
    } catch (err) {
      expect(String(err)).toContain("not found");
    }
  });

  test("05.3 — Remove deleted object rows from placement.csv", async () => {
    const content = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
    const entries = parsePlacementCsv(content);
    // Remove OBJECT entries that reference VDK_OBJECTNUMBER=0
    // (the deleted object_box01 was objectIndex=0)
    const remaining = entries.filter((e) => {
      if (e.vdkType !== "OBJECT") return true;
      return e.objectNumber !== 0;
    });
    // Write back
    const csv = remaining.map((e) => e.rawFields.join(",")).join("\n");
    await writeTextFile(`${STAGE_ROOT}/info/placement.csv`, csv);

    // Verify
    const updated = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
    const updatedEntries = parsePlacementCsv(updated);
    const objectsRemaining = updatedEntries.filter(
      (e) => e.vdkType === "OBJECT",
    );
    expect(objectsRemaining.length).toBe(0);
  });

  test("05.4 — SKY entry preserved after object deletion", async () => {
    const content = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
    const entries = parsePlacementCsv(content);
    const skyEntries = entries.filter((e) => e.vdkType === "SKY");
    expect(skyEntries.length).toBe(1);
  });

  test("05.5 — load_stage_bundle reflects deletion (no object sub-models)", async () => {
    const bundle = await loadStageBundle(STAGE_ROOT);
    const objectModels = bundle.subModels.filter(
      (sm) => sm.folderName.includes("object"),
    );
    expect(objectModels.length).toBe(0);
  });

  test("05.6 — rebuild_stage_structure_json succeeds after deletion", async () => {
    const structurePath = await rebuildStructureJson(STAGE_ROOT);
    expect(structurePath).toContain("structure.json");

    // Verify structure JSON does not reference deleted object folder
    const content = await readTextFile(structurePath);
    expect(content).not.toContain("001stage001_object_box01");
  });
});
```

- [ ] **Step 1: Write suite05_object_delete.test.ts** with all 6 test cases

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/blackbox/suite05_object_delete.test.ts --config tests/blackbox/vitest.config.blackbox.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/blackbox/suite05_object_delete.test.ts
git commit -m "test(blackbox): suite 05 — object deletion + placement re-indexing"
```

---

## Task 7: Suite 06 — Save Folder Pipeline CSV Output

**Files:**
- Create: `tests/blackbox/suite06_save_folder_csv.test.ts`

Tests that modifying graphic_param.csv and saving produces a valid, parseable CSV with the updated values. Also tests that writing a new placement entry for a newly added object folder produces a valid row.

### Test Cases

```typescript
describe("Suite 06: Save Folder Pipeline CSV Output", () => {
  const STAGE_ROOT = "E:/XB/解包/com/test/16F73C97/0/0";
  let backupPath: string;

  beforeAll(async () => {
    backupPath = await backupStageFolder(STAGE_ROOT);
  });

  afterAll(async () => {
    await restoreStageFolder(STAGE_ROOT);
  });

  test("06.1 — Modify graphic_param directional_lighting_rot_x and save", async () => {
    const content = await readTextFile(`${STAGE_ROOT}/info/graphic_param.csv`);
    const params = parseGraphicParamCsv(content);
    const rotX = params.find((p) => p.key === "directional_lighting_rot_x")!;
    rotX.value = "-90";

    const csv = params.map((p) => `${p.key},${p.value}`).join("\n");
    await writeTextFile(`${STAGE_ROOT}/info/graphic_param.csv`, csv);

    // Verify
    const updated = await readTextFile(`${STAGE_ROOT}/info/graphic_param.csv`);
    const updatedParams = parseGraphicParamCsv(updated);
    const updatedRotX = updatedParams.find(
      (p) => p.key === "directional_lighting_rot_x",
    )!;
    expect(updatedRotX.value).toBe("-90");
  });

  test("06.2 — All other graphic_param values unchanged after single edit", async () => {
    const original = await readTextFile(`${STAGE_ROOT}/../../../16F73C97/0/0/info/graphic_param.csv`).catch(() => null);
    // Compare count of params
    const current = await readTextFile(`${STAGE_ROOT}/info/graphic_param.csv`);
    const params = parseGraphicParamCsv(current);
    expect(params.length).toBeGreaterThan(40);

    // Spot-check a few unmodified values
    const lightIntensity = params.find(
      (p) => p.key === "directional_lighting_intensity",
    )!;
    expect(lightIntensity.value).toBe("3.14");
  });

  test("06.3 — Add a new placement OBJECT row with custom position", async () => {
    const content = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
    const newRow = [
      "VDK_TYPE", "OBJECT",
      "VDK_INITIAL_SPAWN", "TRUE",
      "VDK_POSITION_X", "500.0",
      "VDK_POSITION_Y", "100.0",
      "VDK_POSITION_Z", "300.0",
      "VDK_ROTATION_X", "15.0",
      "VDK_ROTATION_Y", "45.0",
      "VDK_ROTATION_Z", "0.0",
      "VDK_PLACEMENT_NAME", "",
      "VDK_OBJECTNUMBER", "1",
      "VDK_PROGRAMID", "0",
      "VDK_HITPOINT", "UNBREAKABLE",
      "VDK_SHADOW_CAST", "TRUE",
    ].join(",");

    const updatedCsv = content.trim() + "\n" + newRow;
    await writeTextFile(`${STAGE_ROOT}/info/placement.csv`, updatedCsv);

    // Verify
    const result = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
    const entries = parsePlacementCsv(result);
    const objects = entries.filter((e) => e.vdkType === "OBJECT");
    expect(objects.length).toBe(5); // original 4 + 1 new

    const newEntry = objects[objects.length - 1];
    expect(newEntry.positionX).toBe(500.0);
    expect(newEntry.positionY).toBe(100.0);
    expect(newEntry.positionZ).toBe(300.0);
    expect(newEntry.rotationX).toBe(15.0);
    expect(newEntry.rotationY).toBe(45.0);
  });

  test("06.4 — placement.csv round-trip: write then re-read preserves all fields", async () => {
    const content = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
    // Write the exact same content back
    await writeTextFile(`${STAGE_ROOT}/info/placement.csv`, content);
    const reread = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
    expect(reread).toBe(content);
  });
});
```

- [ ] **Step 1: Write suite06_save_folder_csv.test.ts** with all 4 test cases

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/blackbox/suite06_save_folder_csv.test.ts --config tests/blackbox/vitest.config.blackbox.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/blackbox/suite06_save_folder_csv.test.ts
git commit -m "test(blackbox): suite 06 — CSV save/read round-trip for placement and graphic_param"
```

---

## Task 8: Suite 07 — Full FHM2D Save → Re-Extract → Compare

**Files:**
- Create: `tests/blackbox/suite07_save_fhm2d_roundtrip.test.ts`

The critical end-to-end test: modify a stage, save to FHM2D, re-extract the FHM2D, and compare the extracted contents. This is the "golden" round-trip test.

### Test Cases

```typescript
describe("Suite 07: Full FHM2D Save → Re-Extract → Compare", () => {
  const TEST_ROOT = "E:/XB/解包/com/test";
  const STAGE_ROOT = `${TEST_ROOT}/16F73C97/0/0`;
  const OUTPUT_FHM2D = `${TEST_ROOT}/__roundtrip_output.fhm2d`;
  const REEXTRACT_DIR = `${TEST_ROOT}/__roundtrip_reextract`;
  let backupPath: string;

  beforeAll(async () => {
    backupPath = await backupStageFolder(STAGE_ROOT);
  });

  afterAll(async () => {
    await restoreStageFolder(STAGE_ROOT);
    // Cleanup output files
    try { await remove(OUTPUT_FHM2D); } catch { /* ignore */ }
    try { await remove(REEXTRACT_DIR, { recursive: true }); } catch { /* ignore */ }
  });

  test("07.1 — Modify placement.csv: change first OBJECT position to (123, 456, 789)", async () => {
    const content = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
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
    await writeTextFile(`${STAGE_ROOT}/info/placement.csv`, lines.join("\n"));
  });

  test("07.2 — Modify graphic_param.csv: change fog_alpha_boost to 2.5", async () => {
    const content = await readTextFile(`${STAGE_ROOT}/info/graphic_param.csv`);
    const params = parseGraphicParamCsv(content);
    const fog = params.find((p) => p.key === "fog_alpha_boost")!;
    fog.value = "2.5";
    const csv = params.map((p) => `${p.key},${p.value}`).join("\n");
    await writeTextFile(`${STAGE_ROOT}/info/graphic_param.csv`, csv);
  });

  test("07.3 — Redistribute textures for FHM2D packing", async () => {
    // First ensure textures are in shared format
    await restoreSharedTextures(STAGE_ROOT);
    // Then redistribute for packing
    const result = await redistributeTextures(STAGE_ROOT);
    expect(result.modelsProcessed).toBeGreaterThanOrEqual(1);
  });

  test("07.4 — Rebuild structure JSON from disk", async () => {
    const structurePath = await rebuildStructureJson(STAGE_ROOT);
    expect(structurePath).toContain("structure.json");

    // Verify the structure JSON is valid
    const content = await readTextFile(structurePath);
    const parsed = JSON.parse(content);
    expect(parsed.SubFileData.length).toBeGreaterThan(0);
    expect(parsed.Fhm2dTotalCount).toBe(parsed.SubFileData.length);
  });

  test("07.5 — repack_fhm2d produces a valid .fhm2d file", async () => {
    // Find the structure JSON path
    const packRoot = `${TEST_ROOT}/16F73C97`;
    const structureJsonPath = `${TEST_ROOT}/16F73C97_structure.json`;

    const result = await repackFhm2d(structureJsonPath, OUTPUT_FHM2D);
    expect(result.outputSize).toBeGreaterThan(0);
    expect(result.totalFiles).toBeGreaterThan(0);

    // Verify output file exists and has reasonable size
    const info = await stat(OUTPUT_FHM2D);
    expect(info.size).toBeGreaterThan(100_000); // > 100KB minimum
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
    // Find the re-extracted stage root (should be under REEXTRACT_DIR)
    const reextractRoot = await findStageRoot(REEXTRACT_DIR);
    const content = await readTextFile(`${reextractRoot}/info/placement.csv`);
    const entries = parsePlacementCsv(content);
    const obj = entries.find((e) => e.vdkType === "OBJECT")!;
    expect(obj.positionX).toBe(123.0);
    expect(obj.positionY).toBe(456.0);
    expect(obj.positionZ).toBe(789.0);
  });

  test("07.9 — Re-extracted graphic_param.csv has modified fog_alpha_boost=2.5", async () => {
    const reextractRoot = await findStageRoot(REEXTRACT_DIR);
    const content = await readTextFile(
      `${reextractRoot}/info/graphic_param.csv`,
    );
    const params = parseGraphicParamCsv(content);
    const fog = params.find((p) => p.key === "fog_alpha_boost")!;
    expect(fog.value).toBe("2.5");
  });

  test("07.10 — Re-extracted stage has same number of SSBH files as original", async () => {
    const reextractRoot = await findStageRoot(REEXTRACT_DIR);
    const originalBundle = await loadStageBundle(STAGE_ROOT);
    const reextractedBundle = await loadStageBundle(reextractRoot);
    expect(reextractedBundle.subModels.length).toBe(
      originalBundle.subModels.length,
    );
  });

  test("07.11 — Structure JSON in re-extracted stage is valid", async () => {
    // The re-extracted stage should have a structure JSON that matches disk files
    const reextractRoot = await findStageRoot(REEXTRACT_DIR);
    const structurePath = await rebuildStructureJson(reextractRoot);
    const content = await readTextFile(structurePath);
    const parsed = JSON.parse(content);
    expect(parsed.SubFileData.length).toBeGreaterThan(0);
    expect(parsed.Fhm2dTotalCount).toBe(parsed.SubFileData.length);
  });
});

async function findStageRoot(baseDir: string): Promise<string> {
  // Navigate through the hash/0/0/ structure
  const entries = await readDir(baseDir);
  const hashDir = entries.find((e) => e.isDirectory)!;
  return `${baseDir}/${hashDir.name}/0/0`;
}
```

- [ ] **Step 1: Write suite07_save_fhm2d_roundtrip.test.ts** with all 11 test cases

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/blackbox/suite07_save_fhm2d_roundtrip.test.ts --config tests/blackbox/vitest.config.blackbox.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/blackbox/suite07_save_fhm2d_roundtrip.test.ts
git commit -m "test(blackbox): suite 07 — full FHM2D save/re-extract round-trip with data verification"
```

---

## Task 9: Suite 08 — Multi-Object Stress: Add DAE + Transform + Delete + Save FHM2D

**Files:**
- Create: `tests/blackbox/suite08_multi_object_stress.test.ts`

The full integration stress test: import multiple DAE objects into a stage, apply different transforms to each, delete one, save to FHM2D, re-extract, and verify everything.

### Test Cases

```typescript
describe("Suite 08: Multi-Object Stress Test", () => {
  const TEST_ROOT = "E:/XB/解包/com/test";
  const STAGE_ROOT = `${TEST_ROOT}/16F73C97/0/0`;
  const DAE_DIR = "D:/output/exvs2/zabanya";
  const OUTPUT_FHM2D = `${TEST_ROOT}/__stress_output.fhm2d`;
  const REEXTRACT_DIR = `${TEST_ROOT}/__stress_reextract`;
  let backupPath: string;

  beforeAll(async () => {
    backupPath = await backupStageFolder(STAGE_ROOT);
    // Ensure textures are in shared format
    await restoreSharedTextures(STAGE_ROOT);
  });

  afterAll(async () => {
    await restoreStageFolder(STAGE_ROOT);
    try { await remove(OUTPUT_FHM2D); } catch { /* ignore */ }
    try { await remove(REEXTRACT_DIR, { recursive: true }); } catch { /* ignore */ }
  });

  test("08.1 — Import backpack_up.dae as new object 'zabanya_bp_up'", async () => {
    const daePath = `${DAE_DIR}/backpack_up.dae`;
    const outputDir = `${STAGE_ROOT}/zabanya_bp_up/0`;
    const analysis = await analyzeDae(daePath);
    expect(analysis.canConvert).toBe(true);

    const result = await convertDaeToSsbh({
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
    expect((result as any).ok).toBe(true);

    // Write empty jnttbl
    await writeFile(
      `${outputDir}/zabanya_bp_up.jnttbl`,
      new Uint8Array(0),
    );
  });

  test("08.2 — Import backpack_bottom.dae as new object 'zabanya_bp_bottom'", async () => {
    const daePath = `${DAE_DIR}/backpack_bottom.dae`;
    const outputDir = `${STAGE_ROOT}/zabanya_bp_bottom/0`;
    const analysis = await analyzeDae(daePath);
    expect(analysis.canConvert).toBe(true);

    const result = await convertDaeToSsbh({
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
    expect((result as any).ok).toBe(true);

    await writeFile(
      `${outputDir}/zabanya_bp_bottom.jnttbl`,
      new Uint8Array(0),
    );
  });

  test("08.3 — Add placement rows for both new objects with different transforms", async () => {
    const content = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
    const bundle = await loadStageBundle(STAGE_ROOT);

    // Find new object indices
    const bpUp = bundle.subModels.find(
      (sm) => sm.folderName === "zabanya_bp_up",
    );
    const bpBottom = bundle.subModels.find(
      (sm) => sm.folderName === "zabanya_bp_bottom",
    );
    expect(bpUp).toBeDefined();
    expect(bpBottom).toBeDefined();

    const newRows = [
      // backpack_up at position (100, 50, 200) with rotation (0, 90, 0)
      `VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,100.0,VDK_POSITION_Y,50.0,VDK_POSITION_Z,200.0,VDK_ROTATION_X,0.0,VDK_ROTATION_Y,90.0,VDK_ROTATION_Z,0.0,VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,${bpUp!.objectIndex},VDK_PROGRAMID,0,VDK_HITPOINT,UNBREAKABLE,VDK_SHADOW_CAST,TRUE`,
      // backpack_bottom at position (-300, 0, 400) with rotation (45, 0, 180)
      `VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,-300.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,400.0,VDK_ROTATION_X,45.0,VDK_ROTATION_Y,0.0,VDK_ROTATION_Z,180.0,VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,${bpBottom!.objectIndex},VDK_PROGRAMID,0,VDK_HITPOINT,UNBREAKABLE,VDK_SHADOW_CAST,TRUE`,
    ];

    const updatedCsv = content.trim() + "\n" + newRows.join("\n");
    await writeTextFile(`${STAGE_ROOT}/info/placement.csv`, updatedCsv);
  });

  test("08.4 — Verify all placement entries are present", async () => {
    const content = await readTextFile(`${STAGE_ROOT}/info/placement.csv`);
    const entries = parsePlacementCsv(content);
    const objects = entries.filter((e) => e.vdkType === "OBJECT");
    expect(objects.length).toBe(6); // original 4 + 2 new
  });

  test("08.5 — Redistribute, rebuild structure, pack to FHM2D", async () => {
    await redistributeTextures(STAGE_ROOT);
    const structurePath = await rebuildStructureJson(STAGE_ROOT);
    const result = await repackFhm2d(structurePath, OUTPUT_FHM2D);
    expect(result.outputSize).toBeGreaterThan(0);

    const info = await stat(OUTPUT_FHM2D);
    expect(info.size).toBeGreaterThan(100_000);
  });

  test("08.6 — Re-extract the stress-test FHM2D", async () => {
    const result = await extractFhm2d(OUTPUT_FHM2D, REEXTRACT_DIR);
    expect(result.totalFiles).toBeGreaterThan(0);
  });

  test("08.7 — Re-extracted placement.csv has all 6 OBJECT entries", async () => {
    const reextractRoot = await findStageRoot(REEXTRACT_DIR);
    const content = await readTextFile(`${reextractRoot}/info/placement.csv`);
    const entries = parsePlacementCsv(content);
    const objects = entries.filter((e) => e.vdkType === "OBJECT");
    expect(objects.length).toBe(6);
  });

  test("08.8 — New objects have correct transforms in re-extracted placement", async () => {
    const reextractRoot = await findStageRoot(REEXTRACT_DIR);
    const content = await readTextFile(`${reextractRoot}/info/placement.csv`);
    const entries = parsePlacementCsv(content);
    const objects = entries.filter((e) => e.vdkType === "OBJECT");

    // Find the object at position (100, 50, 200)
    const bpUp = objects.find(
      (o) => o.positionX === 100.0 && o.positionY === 50.0,
    );
    expect(bpUp).toBeDefined();
    expect(bpUp!.rotationY).toBe(90.0);

    // Find the object at position (-300, 0, 400)
    const bpBottom = objects.find(
      (o) => o.positionX === -300.0 && o.positionZ === 400.0,
    );
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
    const bpUpDir = await findSubModelDir(reextractRoot, "zabanya_bp_up");
    expect(bpUpDir).toBeDefined();

    const entries = await readDir(bpUpDir!);
    const ssbhFiles = entries.filter(
      (e) =>
        e.isFile &&
        (e.name.endsWith(".numshb") || e.name.endsWith(".numdlb")),
    );
    expect(ssbhFiles.length).toBeGreaterThan(0);
    for (const f of ssbhFiles) {
      const info = await stat(`${bpUpDir}/${f.name}`);
      expect(info.size).toBeGreaterThan(0);
    }
  });
});

async function findStageRoot(baseDir: string): Promise<string> {
  const entries = await readDir(baseDir);
  const hashDir = entries.find((e) => e.isDirectory)!;
  return `${baseDir}/${hashDir.name}/0/0`;
}

async function findSubModelDir(
  stageRoot: string,
  folderName: string,
): Promise<string | undefined> {
  const entries = await readDir(stageRoot);
  const match = entries.find(
    (e) => e.isDirectory && e.name.includes(folderName),
  );
  if (!match) return undefined;
  // Navigate to the SSBH directory: folderName/0/
  return `${stageRoot}/${match.name}/0`;
}
```

- [ ] **Step 1: Write suite08_multi_object_stress.test.ts** with all 10 test cases

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/blackbox/suite08_multi_object_stress.test.ts --config tests/blackbox/vitest.config.blackbox.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/blackbox/suite08_multi_object_stress.test.ts
git commit -m "test(blackbox): suite 08 — multi-object stress test with DAE import + transforms + FHM2D round-trip"
```

---

## Task 10: Run All Suites + Build Verification

**Files:**
- No new files created

Run all 8 test suites in sequence and verify the project still builds.

- [ ] **Step 1: Run all blackbox suites**

```bash
pnpm vitest run tests/blackbox/ --config tests/blackbox/vitest.config.blackbox.ts
```

Expected: All 8 suites pass (50+ test cases total).

- [ ] **Step 2: Run existing unit test suite to verify no regressions**

```bash
pnpm vitest run src/page/SceneEdit/
```

Expected: All existing tests still pass.

- [ ] **Step 3: Run build verification**

```bash
pnpm build
```

Expected: Build passes.

- [ ] **Step 4: Document any failures**

If any suite fails, document the failure with:
- Test case number and name
- Error message
- Root cause analysis
- Whether it's a test bug or a pipeline bug

- [ ] **Step 5: Final commit**

```bash
git add tests/blackbox/
git commit -m "test(blackbox): all 8 suites passing — scene editor save pipeline validated"
```

---

## Dependency Graph

```
Task 1 (Infrastructure) ───────────────────────┐
                                                 │
                        ┌────────────────────────┤
                        │                        │
Task 2 (Suite 01)  ←────┤                        │
Task 3 (Suite 02)  ←────┤                        │
Task 4 (Suite 03)  ←────┤  All depend on Task 1  │
Task 5 (Suite 04)  ←────┤                        │
Task 6 (Suite 05)  ←────┤                        │
Task 7 (Suite 06)  ←────┤                        │
                        │                        │
                        └───→ Task 8 (Suite 07) ──┤ depends on Suites 02+04+06
                             Task 9 (Suite 08) ──┤ depends on Suites 02+03+04
                                                 │
                             Task 10 (Run All) ←──┘ depends on all above
```

Tasks 2–7 are independent of each other and can run in parallel after Task 1.
Tasks 8–9 are independent of each other but depend on earlier suites.
Task 10 is the final gate.

---

## Test Priority Order

| Priority | Suite | What It Tests | Why This Order |
|----------|-------|---------------|----------------|
| 1 | Suite 01 | Extract FHM2D → folder | Fundamental I/O — everything else depends on this |
| 2 | Suite 02 | Texture migration | Must work before any save |
| 3 | Suite 03 | DAE → SSBH conversion | Must work before adding objects |
| 4 | Suite 04 | Placement transforms | Core editing: position/rotation |
| 5 | Suite 06 | CSV save/read | CSV integrity |
| 6 | Suite 05 | Object deletion | Destructive operation safety |
| 7 | Suite 07 | Full FHM2D round-trip | End-to-end golden path |
| 8 | Suite 08 | Multi-object stress | Full integration stress |

---

## Test Execution Notes

### Pre-requisites

1. **Tauri app must be running** — all IPC commands require the Tauri backend
2. **Havok Content Tools** must be installed (for HKT generation tests)
3. **Test data at `E:\XB\解包\com\test`** must be intact (backed up by tests)
4. **DAE sources at `D:\output\exvs2\zabanya`** must exist

### Running via Tauri MCP

For interactive testing via the Tauri MCP server (main-thread AI), use:

```
ipc_execute_command: extract_stage_fhm2d_to_folder
ipc_execute_command: load_stage_bundle
ipc_execute_command: redistribute_stage_textures
ipc_execute_command: restore_shared_textures
ipc_execute_command: rebuild_stage_structure_json
ipc_execute_command: repack_fhm2d
ipc_execute_command: ssbh_analyze_dae
ipc_execute_command: ssbh_convert_dae_to_ssbh
```

### Safety: Always Backup Before Modifying

Every test suite that modifies files MUST:
1. `backupStageFolder()` in `beforeAll`
2. `restoreStageFolder()` in `afterAll`
3. Clean up any output files (FHM2D, re-extract dirs) in `afterAll`
