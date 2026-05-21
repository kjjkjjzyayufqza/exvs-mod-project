import { readDir, readFile, rename } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

export type DedupConflict = {
  filename: string;
  suffix: string;
};

export type DedupResult = {
  kept: string[];
  duplicatesRemoved: number;
  conflicts: DedupConflict[];
};

export async function compareNutexbContent(pathA: string, pathB: string): Promise<boolean> {
  const [a, b] = await Promise.all([readFile(pathA), readFile(pathB)]);
  if (a.byteLength !== b.byteLength) return false;
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  for (let i = 0; i < viewA.length; i++) {
    if (viewA[i] !== viewB[i]) return false;
  }
  return true;
}

export async function deduplicateTextureFolder(texturesDir: string): Promise<DedupResult> {
  let entries;
  try {
    entries = await readDir(texturesDir);
  } catch {
    return { kept: [], duplicatesRemoved: 0, conflicts: [] };
  }

  const nutexbFiles = entries
    .filter((e) => !e.isDirectory && e.name.endsWith(".nutexb"))
    .map((e) => e.name);

  if (nutexbFiles.length === 0) {
    return { kept: [], duplicatesRemoved: 0, conflicts: [] };
  }

  const kept: string[] = [];
  const conflicts: DedupConflict[] = [];
  let duplicatesRemoved = 0;

  const seen = new Map<string, string>();

  for (const filename of nutexbFiles) {
    const fullPath = await join(texturesDir, filename);

    if (!seen.has(filename)) {
      seen.set(filename, fullPath);
      kept.push(filename);
      continue;
    }

    const existingPath = seen.get(filename)!;
    const identical = await compareNutexbContent(existingPath, fullPath);

    if (identical) {
      duplicatesRemoved++;
    } else {
      const base = filename.replace(/\.nutexb$/, "");
      const suffix = `_${Date.now()}`;
      const newName = `${base}${suffix}.nutexb`;
      await rename(fullPath, await join(texturesDir, newName));
      kept.push(newName);
      conflicts.push({ filename, suffix });
    }
  }

  return { kept, duplicatesRemoved, conflicts };
}
