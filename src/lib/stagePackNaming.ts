export type StagePackFolderName = {
  folderName: string;
  assetHashHex: string;
  labelSuffix: string;
};

const STAGE_PACK_FOLDER_NAME_PATTERN = /^(?:0x)?([0-9a-fA-F]{8})(.*)$/i;

export function parseStagePackFolderName(rawName: string): StagePackFolderName | null {
  const folderName = rawName.trim();
  if (!folderName) {
    return null;
  }

  const match = STAGE_PACK_FOLDER_NAME_PATTERN.exec(folderName);
  if (!match) {
    return null;
  }

  return {
    folderName,
    assetHashHex: `0x${match[1].toUpperCase()}`,
    labelSuffix: match[2],
  };
}

export function buildStagePackStructureJsonCandidates(
  parentDir: string,
  folderName: string,
  assetHashHex: string,
): string[] {
  const normalizedParent = parentDir.replace(/\\/g, "/").replace(/\/+$/g, "");
  const hashBody = assetHashHex.slice(2);
  const candidates = [
    `${normalizedParent}/${folderName}_structure.json`,
    `${normalizedParent}/${assetHashHex}_structure.json`,
    `${normalizedParent}/${hashBody}_structure.json`,
  ];
  return [...new Set(candidates)];
}
