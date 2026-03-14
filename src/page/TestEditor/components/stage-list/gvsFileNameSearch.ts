import { join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";

import { int32ToHashHex } from "../character-id-table/assetRef";
import { int32ToHexDisplay } from "@/module/commonFunc";

export interface GvsIndexedNameRef {
  rawValue: number;
  hexDisplay: string;
  reversedName: string;
  indexFolder: string;
  fileName: string;
  filePath: string;
  exists: boolean;
}

export function getGvsIndexedReversedName(value: number): string {
  return int32ToHashHex(value).replace(/^0x/i, "").toLowerCase();
}

export function getGvsIndexedHexDisplay(value: number): string {
  return int32ToHexDisplay(value);
}

export async function resolveGvsIndexedNameRef(searchDir: string, value: number): Promise<GvsIndexedNameRef> {
  if (!searchDir.trim()) {
    throw new Error("Search Directory is required");
  }

  const dirExists = await exists(searchDir);
  if (!dirExists) {
    throw new Error("Search Directory does not exist");
  }

  const reversedName = getGvsIndexedReversedName(value);
  const indexFolder = reversedName.slice(0, 2);
  const fileName = `${reversedName}.bin`;
  const filePath = await join(searchDir, indexFolder, fileName);

  return {
    rawValue: value,
    hexDisplay: getGvsIndexedHexDisplay(value),
    reversedName,
    indexFolder,
    fileName,
    filePath,
    exists: await exists(filePath),
  };
}
