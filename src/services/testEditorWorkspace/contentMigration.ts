import { join } from "@tauri-apps/api/path";

import { promptAndMigrateFhm2dStructureIfNeeded } from "@/utils/fhm2dStructureMetadata";
import { applyFhm2dStructureMigrationToPack, resolveMigratedFhm2dPackPaths } from "@/utils/fhm2dFolderPathResolution";
import type {
  ResolvedWorkspaceContentLocation,
  ResolvedWorkspaceContentPack,
} from "./contentCatalog";

async function withMigratedFilePath(
  pack: ResolvedWorkspaceContentPack,
  relativeFilePath: string | null,
): Promise<ResolvedWorkspaceContentPack> {
  if (!relativeFilePath) {
    return { ...pack, filePath: null };
  }
  return {
    ...pack,
    filePath: await join(pack.folderPath, ...relativeFilePath.split("/")),
  };
}

export async function promptAndMigrateWorkspaceContentIfNeeded(
  content: ResolvedWorkspaceContentLocation,
  title?: string,
): Promise<ResolvedWorkspaceContentLocation> {
  if (!content.existing) return content;

  const remappedExisting = await resolveMigratedFhm2dPackPaths(content.existing);
  const baseContent =
    remappedExisting === content.existing
      ? content
      : {
          ...content,
          existing: remappedExisting,
        };

  const migration = await promptAndMigrateFhm2dStructureIfNeeded({
    structureJsonPath: baseContent.existing!.structureJsonPath,
    title: title ?? `Migrate ${baseContent.descriptor.label} FHM2D structure`,
  });
  if (!migration) return baseContent;

  const migratedExisting = await withMigratedFilePath(
    applyFhm2dStructureMigrationToPack(baseContent.existing!, migration),
    baseContent.descriptor.relativeFilePath,
  );

  return {
    ...baseContent,
    existing: migratedExisting,
  };
}
