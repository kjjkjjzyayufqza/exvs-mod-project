import { join } from "@tauri-apps/api/path";

import { promptAndMigrateFhm2dStructureIfNeeded } from "@/utils/fhm2dStructureMetadata";
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

  const migration = await promptAndMigrateFhm2dStructureIfNeeded({
    structureJsonPath: content.existing.structureJsonPath,
    title: title ?? `Migrate ${content.descriptor.label} FHM2D structure`,
  });
  if (!migration) return content;

  const migratedExisting = await withMigratedFilePath(
    {
      ...content.existing,
      folderPath: migration.rootPath ?? content.existing.folderPath,
      structureJsonPath: migration.structureJsonPath,
      packKey: content.existing.prefix
        ? `${content.existing.prefix}/${migration.name}`
        : migration.name,
    },
    content.descriptor.relativeFilePath,
  );

  return {
    ...content,
    existing: migratedExisting,
  };
}
