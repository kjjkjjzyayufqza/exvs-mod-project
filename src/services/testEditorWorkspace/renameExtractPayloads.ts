import { join } from "@tauri-apps/api/path";
import { exists, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { inferFhm2dStructurePathFromFolder } from "@/utils/fhm2dFolderPathResolution";

export type RenameExtractPayloadsResult = {
  renamed: string[];
  skipped: string[];
};

type JsonRecord = Record<string, unknown>;

function extensionOf(fileName: string): string {
  const slash = Math.max(fileName.lastIndexOf("/"), fileName.lastIndexOf("\\"));
  const base = slash >= 0 ? fileName.slice(slash + 1) : fileName;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot) : "";
}

function stemOf(fileName: string): string {
  const slash = Math.max(fileName.lastIndexOf("/"), fileName.lastIndexOf("\\"));
  const base = slash >= 0 ? fileName.slice(slash + 1) : fileName;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

function replaceFileUrlLeaf(fileUrl: string, fileName: string): string {
  const sep = fileUrl.includes("\\") ? "\\" : "/";
  const parts = fileUrl.split(/[/\\]/);
  if (parts.length === 0) return fileName;
  parts[parts.length - 1] = fileName;
  return parts.join(sep);
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readNumber(obj: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function readString(obj: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function writeField(obj: JsonRecord, preferredKey: string, aliases: string[], value: unknown): void {
  for (const key of aliases) {
    if (key in obj) {
      obj[key] = value;
      return;
    }
  }
  obj[preferredKey] = value;
}

async function firstExistingPath(candidates: string[]): Promise<string | null> {
  for (const path of candidates) {
    if (await exists(path)) return path;
  }
  return null;
}

function patchSubFileData(json: JsonRecord, names: string[]): void {
  const rows = json.SubFileData;
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const index = readNumber(record, ["index", "Index"]);
    if (index === null || index < 0 || index >= names.length) continue;
    const fileName = names[index];
    const currentUrl = readString(record, ["fileUrl", "file_url", "FileUrl"]) ?? "";
    writeField(record, "fileUrl", ["fileUrl", "file_url", "FileUrl"], replaceFileUrlLeaf(currentUrl || fileName, fileName));
    writeField(record, "fileType", ["fileType", "file_type", "FileType"], extensionOf(fileName));
    writeField(record, "fileBaseName", ["fileBaseName", "file_base_name", "FileBaseName"], stemOf(fileName));
  }
}

function patchSubFileStructure(json: JsonRecord, names: string[], fileIndexBySlot: Map<number, number>): void {
  const rows = json.SubFileStructure;
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    if (record.type !== "Item") continue;
    const fileIndex = readNumber(record, ["fileIndex", "file_index"]);
    if (fileIndex === null) continue;
    for (const [slot, mappedFileIndex] of fileIndexBySlot) {
      if (mappedFileIndex !== fileIndex) continue;
      const fileName = names[slot];
      if (!fileName) continue;
      writeField(record, "Name", ["Name", "displayName", "display_name"], stemOf(fileName));
    }
  }
}

function collectFileIndexBySlot(json: JsonRecord): Map<number, number> {
  const out = new Map<number, number>();
  const rows = json.SubFileData;
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const index = readNumber(record, ["index", "Index"]);
    const fileIndex = readNumber(record, ["fileIndex", "file_index", "FileIndex"]);
    if (index === null || fileIndex === null) continue;
    out.set(index, fileIndex);
  }
  return out;
}

export async function renameExtractPayloads(input: {
  folderPath: string;
  names: readonly string[];
  structureJsonPath?: string | null;
}): Promise<RenameExtractPayloadsResult> {
  const folderPath = input.folderPath.trim();
  if (!folderPath) {
    throw new Error("Pack folder path is required");
  }
  if (!(await exists(folderPath))) {
    throw new Error(`Pack folder not found: ${folderPath}`);
  }
  if (input.names.length === 0) {
    throw new Error("No target payload names provided");
  }

  const renamed: string[] = [];
  const skipped: string[] = [];
  const missing: string[] = [];

  for (let index = 0; index < input.names.length; index += 1) {
    const targetName = input.names[index];
    const targetPath = await join(folderPath, targetName);
    if (await exists(targetPath)) {
      skipped.push(targetName);
      continue;
    }

    const targetExt = extensionOf(targetName);
    const sourceCandidates = [
      await join(folderPath, `${index}${targetExt}`),
      await join(folderPath, `${index}.bin`),
      await join(folderPath, String(index)),
    ];
    const sourcePath = await firstExistingPath(sourceCandidates);
    if (!sourcePath) {
      missing.push(`${index} -> ${targetName}`);
      continue;
    }
    await rename(sourcePath, targetPath);
    renamed.push(targetName);
  }

  if (renamed.length === 0 && skipped.length === 0) {
    throw new Error(
      `No indexed extract files found under ${folderPath} (expected 0.bin). Missing: ${missing.join(", ")}`,
    );
  }
  if (renamed.length === 0 && missing.length > 0 && skipped.length < input.names.length) {
    throw new Error(`Could not rename indexed extract files: ${missing.join(", ")}`);
  }

  const structureJsonPath =
    input.structureJsonPath?.trim() || inferFhm2dStructurePathFromFolder(folderPath);
  if (await exists(structureJsonPath)) {
    const raw = await readTextFile(structureJsonPath);
    const parsed = JSON.parse(raw) as unknown;
    const json = asRecord(parsed);
    if (json) {
      patchSubFileData(json, [...input.names]);
      patchSubFileStructure(json, [...input.names], collectFileIndexBySlot(json));
      await writeTextFile(structureJsonPath, `${JSON.stringify(json, null, 2)}\n`);
    }
  }

  return { renamed, skipped };
}
