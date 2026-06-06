import { parseStagePackFolderName } from "@/lib/stagePackNaming";

export function normalizePackFolderName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";

  const parsed = parseStagePackFolderName(trimmed);
  if (!parsed) {
    return trimmed;
  }

  if (!parsed.labelSuffix && /^0x/i.test(parsed.folderName)) {
    return parsed.assetHashHex;
  }

  return parsed.folderName;
}
