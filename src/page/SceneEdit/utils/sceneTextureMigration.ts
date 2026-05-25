import { readDir, exists, copyFile, remove, mkdir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { compareNutexbContent } from "./sceneTextureDedup";
import { resolveInfoFolderPath } from "./sceneInfoFolder";

const FIXED_RESERVED_FOLDERS = new Set(["base", "textures"]);

async function buildReservedFolderSet(stageRoot: string): Promise<Set<string>> {
  const infoPath = await resolveInfoFolderPath(stageRoot);
  const infoName = infoPath.replace(/\\/g, "/").split("/").pop() ?? "";
  return new Set([...FIXED_RESERVED_FOLDERS, infoName]);
}

export type MigrationConflict = {
  filename: string;
  sources: string[];
  suffixUsed: string;
};

export type MigrationResult = {
  migratedCount: number;
  deduplicatedCount: number;
  conflicts: MigrationConflict[];
};

export async function detectOldTextureFormat(stageRoot: string): Promise<boolean> {
  const reserved = await buildReservedFolderSet(stageRoot);

  const rootEntries = await readDir(stageRoot);
  const modelFolders = rootEntries.filter(
    (e) => e.isDirectory && !reserved.has(e.name),
  );

  for (const folder of modelFolders) {
    const modelPath = await join(stageRoot, folder.name);
    const modelEntries = await readDir(modelPath);
    for (const sub of modelEntries) {
      if (sub.isDirectory && /^\d+$/.test(sub.name)) {
        const subPath = await join(modelPath, sub.name);
        const subEntries = await readDir(subPath);
        const hasNutexbInNumbered = subEntries.some(
          (f) => !f.isDirectory && f.name.endsWith(".nutexb"),
        );
        if (hasNutexbInNumbered) return true;

        for (const deeper of subEntries) {
          if (deeper.isDirectory && /^\d+$/.test(deeper.name)) {
            const deeperPath = await join(subPath, deeper.name);
            const deeperEntries = await readDir(deeperPath);
            if (deeperEntries.some((f) => !f.isDirectory && f.name.endsWith(".nutexb"))) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

async function collectNutexbFromNumberedDirs(
  parentPath: string,
): Promise<{ filename: string; sourcePath: string }[]> {
  const results: { filename: string; sourcePath: string }[] = [];
  let entries;
  try {
    entries = await readDir(parentPath);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isDirectory || !/^\d+$/.test(entry.name)) continue;
    const numberedPath = await join(parentPath, entry.name);
    const numberedEntries = await readDir(numberedPath);

    for (const f of numberedEntries) {
      if (!f.isDirectory && f.name.endsWith(".nutexb")) {
        results.push({ filename: f.name, sourcePath: await join(numberedPath, f.name) });
      }
      if (f.isDirectory && /^\d+$/.test(f.name)) {
        const deepPath = await join(numberedPath, f.name);
        const deepEntries = await readDir(deepPath);
        for (const df of deepEntries) {
          if (!df.isDirectory && df.name.endsWith(".nutexb")) {
            results.push({ filename: df.name, sourcePath: await join(deepPath, df.name) });
          }
        }
      }
    }
  }
  return results;
}

export async function migrateTexturesToSharedFolder(stageRoot: string): Promise<MigrationResult> {
  const texturesDir = await join(stageRoot, "textures");
  const texturesDirExists = await exists(texturesDir);
  if (!texturesDirExists) {
    await mkdir(texturesDir, { recursive: true });
  }

  const reserved = await buildReservedFolderSet(stageRoot);

  const rootEntries = await readDir(stageRoot);
  const modelFolders = rootEntries.filter(
    (e) => e.isDirectory && !reserved.has(e.name),
  );

  let migratedCount = 0;
  let deduplicatedCount = 0;
  const conflicts: MigrationConflict[] = [];
  const existingTextures = new Map<string, string>();

  const existingEntries = texturesDirExists ? await readDir(texturesDir) : [];
  for (const e of existingEntries) {
    if (!e.isDirectory && e.name.endsWith(".nutexb")) {
      existingTextures.set(e.name, await join(texturesDir, e.name));
    }
  }

  const numberedDirsToClean: string[] = [];

  for (const folder of modelFolders) {
    const modelPath = await join(stageRoot, folder.name);
    const textures = await collectNutexbFromNumberedDirs(modelPath);

    for (const tex of textures) {
      const destPath = await join(texturesDir, tex.filename);

      if (existingTextures.has(tex.filename)) {
        const identical = await compareNutexbContent(
          existingTextures.get(tex.filename)!,
          tex.sourcePath,
        );
        if (identical) {
          deduplicatedCount++;
          continue;
        }
        const base = tex.filename.replace(/\.nutexb$/, "");
        const suffix = `_${folder.name}`;
        const newName = `${base}${suffix}.nutexb`;
        const newPath = await join(texturesDir, newName);
        await copyFile(tex.sourcePath, newPath);
        existingTextures.set(newName, newPath);
        conflicts.push({ filename: tex.filename, sources: [folder.name], suffixUsed: suffix });
        migratedCount++;
      } else {
        await copyFile(tex.sourcePath, destPath);
        existingTextures.set(tex.filename, destPath);
        migratedCount++;
      }
    }

    const modelEntries = await readDir(modelPath);
    for (const sub of modelEntries) {
      if (sub.isDirectory && /^\d+$/.test(sub.name)) {
        const subPath = await join(modelPath, sub.name);
        const subEntries = await readDir(subPath);
        for (const deeper of subEntries) {
          if (deeper.isDirectory && /^\d+$/.test(deeper.name)) {
            const deeperPath = await join(subPath, deeper.name);
            const deeperEntries = await readDir(deeperPath);
            const hasOnlyNutexb = deeperEntries.every(
              (f) => !f.isDirectory && f.name.endsWith(".nutexb"),
            );
            if (hasOnlyNutexb && deeperEntries.length > 0) {
              numberedDirsToClean.push(deeperPath);
            }
          }
        }
        const remainingAfterDeep = subEntries.filter(
          (e) => !(e.isDirectory && /^\d+$/.test(e.name)),
        );
        const allNutexb = remainingAfterDeep.every(
          (f) => !f.isDirectory && f.name.endsWith(".nutexb"),
        );
        if (allNutexb && remainingAfterDeep.length > 0) {
          numberedDirsToClean.push(subPath);
        }
      }
    }
  }

  for (const dir of numberedDirsToClean) {
    try {
      await remove(dir, { recursive: true });
    } catch {
      // best-effort cleanup
    }
  }

  return { migratedCount, deduplicatedCount, conflicts };
}
