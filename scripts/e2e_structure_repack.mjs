import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, relative, extname, basename } from "path";

const STAGE_FHM2D_MAGIC_OB_SIGNED = -843925575;
const GAME_READY_STAGE_FILE_TYPES = new Set([
  ".bin", ".csv", ".hkt", ".jnttbl", ".numatb", ".numdlb", ".numshb",
  ".nuanmb", ".nudnbb", ".nufxlb", ".nuhlpb", ".nurpdb", ".nushdb",
  ".nus3bank", ".nusktb", ".nutexb", ".spbin",
]);

function collectFiles(root, relDir = "") {
  const dirPath = relDir ? join(root, relDir) : root;
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...collectFiles(root, relPath));
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      files.push({ relativePath: relPath.replace(/\\/g, "/"), fileType: ext });
    }
  }
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function buildStructureJson(packFolderName, files) {
  const entries = files.filter(f => GAME_READY_STAGE_FILE_TYPES.has(f.fileType));
  
  const tree = { folders: new Map(), files: [] };
  const subFileData = entries.map((file, index) => {
    insertFile(tree, file.relativePath, index);
    return {
      index,
      fileType: file.fileType,
      fileIndex: index,
      fileUrl: `${packFolderName}/${file.relativePath}`,
      fileBaseName: basename(file.relativePath).replace(/\.[^.]+$/, ""),
    };
  });

  const subFileStructure = [];
  for (const [, child] of [...tree.folders.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    appendStructure(child, subFileStructure);
  }
  for (const file of [...tree.files].sort((a, b) => a.name.localeCompare(b.name))) {
    subFileStructure.push(createItemEntry(file.fileIndex, file.name));
  }

  return {
    Magic: STAGE_FHM2D_MAGIC_OB_SIGNED,
    Fhm2dTotalCount: subFileData.length,
    UnkCount: 0,
    SubFileData: subFileData,
    SubFileStructure: subFileStructure,
  };
}

function insertFile(root, relPath, fileIndex) {
  const parts = relPath.split("/").filter(Boolean);
  const fileName = parts.pop();
  let cursor = root;
  for (const folder of parts) {
    let child = cursor.folders.get(folder);
    if (!child) {
      child = { folders: new Map(), files: [] };
      cursor.folders.set(folder, child);
    }
    cursor = child;
  }
  cursor.files.push({ name: fileName, fileIndex });
}

function createFolderEntry(childCount) {
  return { type: "Folder", unk1: "00000000", folderCount: childCount, unk2: "00000000", unk2_1: 0, unk3: 0, unk4: 0, unk5: 0, unk6: 0 };
}

function createItemEntry(fileIndex, name) {
  return { type: "Item", unk1: "00000000", fileIndex, unk2: "00000000", unk2_1: 0, unk3: 0, unk4: 0, originalFileIndex: fileIndex, Name: name };
}

function appendStructure(node, out) {
  const folders = [...node.folders.entries()].sort(([a], [b]) => a.localeCompare(b));
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  out.push(createFolderEntry(folders.length + files.length));
  for (const file of files) {
    out.push(createItemEntry(file.fileIndex, file.name));
  }
  for (const [, child] of folders) {
    appendStructure(child, out);
  }
  out.push({ type: "EndMark", endMarkCount: 1 });
}

// ============================================================
// Main
// ============================================================
const PACK_ROOT = "E:\\XB\\解包\\com\\test\\16F73C97";
const PACK_FOLDER_NAME = "16F73C97";
const STRUCTURE_PATH = "E:\\XB\\解包\\com\\test\\0x16F73C97_structure.json";

console.log("=== Step 1: Scanning pack folder ===");
const allFiles = collectFiles(PACK_ROOT);
console.log(`  Total files: ${allFiles.length}`);
const gameReady = allFiles.filter(f => GAME_READY_STAGE_FILE_TYPES.has(f.fileType));
console.log(`  Game-ready files: ${gameReady.length}`);
const excluded = allFiles.filter(f => !GAME_READY_STAGE_FILE_TYPES.has(f.fileType));
if (excluded.length > 0) {
  console.log(`  Excluded (${excluded.length}):`);
  for (const f of excluded.slice(0, 10)) {
    console.log(`    ${f.relativePath} (${f.fileType})`);
  }
  if (excluded.length > 10) console.log(`    ... and ${excluded.length - 10} more`);
}

console.log("\n=== Step 2: Building structure JSON ===");
const structureJson = buildStructureJson(PACK_FOLDER_NAME, allFiles);
console.log(`  Magic: ${structureJson.Magic}`);
console.log(`  Fhm2dTotalCount: ${structureJson.Fhm2dTotalCount}`);
console.log(`  SubFileData entries: ${structureJson.SubFileData.length}`);
console.log(`  SubFileStructure entries: ${structureJson.SubFileStructure.length}`);

// Write new structure JSON
const NEW_STRUCTURE_PATH = "E:\\XB\\解包\\com\\test\\0x16F73C97_structure_e2e.json";
const jsonContent = JSON.stringify(structureJson, null, 2);
writeFileSync(NEW_STRUCTURE_PATH, jsonContent, "utf-8");
console.log(`  Wrote: ${NEW_STRUCTURE_PATH} (${jsonContent.length} chars)`);

// Compare with existing
if (existsSync(STRUCTURE_PATH)) {
  console.log("\n=== Step 3: Comparing with existing structure JSON ===");
  const existing = JSON.parse(readFileSync(STRUCTURE_PATH, "utf-8"));
  
  console.log(`  Existing Fhm2dTotalCount: ${existing.Fhm2dTotalCount}`);
  console.log(`  New      Fhm2dTotalCount: ${structureJson.Fhm2dTotalCount}`);
  
  if (existing.Fhm2dTotalCount !== structureJson.Fhm2dTotalCount) {
    console.log(`  DIFF: file count changed (${existing.Fhm2dTotalCount} -> ${structureJson.Fhm2dTotalCount})`);
    
    const existingUrls = new Set(existing.SubFileData.map(e => e.fileUrl));
    const newUrls = new Set(structureJson.SubFileData.map(e => e.fileUrl));
    
    const added = [...newUrls].filter(u => !existingUrls.has(u));
    const removed = [...existingUrls].filter(u => !newUrls.has(u));
    
    if (added.length) {
      console.log(`  Added (${added.length}):`);
      for (const u of added) console.log(`    + ${u}`);
    }
    if (removed.length) {
      console.log(`  Removed (${removed.length}):`);
      for (const u of removed) console.log(`    - ${u}`);
    }
  } else {
    const same = JSON.stringify(existing) === JSON.stringify(structureJson);
    console.log(`  Content match: ${same ? "IDENTICAL" : "DIFFERENT (same count, different structure)"}`);
  }
}

// Show SubFileData sample
console.log("\n=== SubFileData sample (first 5 + last 5) ===");
for (const entry of structureJson.SubFileData.slice(0, 5)) {
  console.log(`  [${entry.index}] ${entry.fileUrl}`);
}
console.log("  ...");
for (const entry of structureJson.SubFileData.slice(-5)) {
  console.log(`  [${entry.index}] ${entry.fileUrl}`);
}

console.log("\n=== E2E structure JSON generation complete ===");
