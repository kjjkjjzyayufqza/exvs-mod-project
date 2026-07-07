import { invoke } from "@tauri-apps/api/core";
import type { ResolvedWorkspaceContentLocation } from "./contentCatalog";

export interface MoveLegacyWorkspaceContentResult {
  sourceFolderPath: string;
  sourceStructureJsonPath: string;
  configuredFolderPath: string;
  configuredStructureJsonPath: string;
}

export async function moveLegacyWorkspaceContentToConfigured(
  content: ResolvedWorkspaceContentLocation,
): Promise<MoveLegacyWorkspaceContentResult> {
  if (content.sourceLayout !== "legacy" || !content.existing) {
    throw new Error("Only legacy flat workspace content can be moved.");
  }

  const sourceFolderPath = content.existing.folderPath;
  const sourceStructureJsonPath = content.existing.structureJsonPath;
  const configuredFolderPath = content.configured.folderPath;
  const configuredStructureJsonPath = content.configured.structureJsonPath;

  if (
    sourceFolderPath === configuredFolderPath ||
    sourceStructureJsonPath === configuredStructureJsonPath
  ) {
    throw new Error("Legacy and configured workspace paths are identical.");
  }

  return await invoke<MoveLegacyWorkspaceContentResult>("move_legacy_workspace_content", {
    sourceFolderPath,
    sourceStructureJsonPath,
    configuredFolderPath,
    configuredStructureJsonPath,
  });
}
