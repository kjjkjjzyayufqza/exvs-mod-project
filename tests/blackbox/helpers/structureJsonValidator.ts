import fs from "fs/promises";
import path from "path";

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
    const content = await fs.readFile(structurePath, "utf-8");
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

  const structureDir = path.dirname(structurePath);
  for (const entry of structure.SubFileData) {
    const fullPath = path.resolve(structureDir, entry.fileUrl);
    try {
      await fs.access(fullPath);
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
  const entries = await fs.readdir(root, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const relative = relativeTo ? `${relativeTo}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push(...(await collectAllFiles(path.join(root, entry.name), relative)));
    } else {
      result.push(relative);
    }
  }
  return result;
}
