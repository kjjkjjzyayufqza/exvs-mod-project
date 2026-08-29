import { join } from "@tauri-apps/api/path";
import { exists, readDir, readFile } from "@tauri-apps/plugin-fs";
import { Buffer } from "buffer";
import { isStrikerTableBuffer } from "@/models/strikerTable";

export const STRIKER_TABLE_PACK_HASH = "0xFEEB79F0";
export const STRIKER_TABLE_PACK_NAME = "strikertable";
export const STRIKER_TABLE_FILE_NAME = "strikertable.vgsht1";

async function fileLooksLikeStrikerTable(filePath: string): Promise<boolean> {
  try {
    const bytes = await readFile(filePath);
    return isStrikerTableBuffer(Buffer.from(bytes));
  } catch {
    return false;
  }
}

export async function findStrikerTableFile(folderPath: string): Promise<string | null> {
  const preferred = await join(folderPath, STRIKER_TABLE_FILE_NAME);
  if ((await exists(preferred)) && (await fileLooksLikeStrikerTable(preferred))) {
    return preferred;
  }

  let entries: Awaited<ReturnType<typeof readDir>>;
  try {
    entries = await readDir(folderPath);
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (entry.isDirectory || !entry.name) continue;
    const path = await join(folderPath, entry.name);
    if (await fileLooksLikeStrikerTable(path)) return path;
  }
  return null;
}
