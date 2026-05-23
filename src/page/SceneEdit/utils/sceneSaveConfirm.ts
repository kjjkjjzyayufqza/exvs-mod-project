import type { ModifiedFields, SceneDirtyStore } from "../store/sceneDirtyStore";
import type { SaveFolderResult } from "./sceneSaveFolderPipeline";

const MODIFIED_FIELD_LABELS: Record<keyof ModifiedFields, string> = {
  transform: "Transform",
  material: "Material",
  textures: "Textures",
  hkt: "HKT collision",
};

export type SaveModifiedObjectPreview = {
  folderName: string;
  fields: string[];
};

export type SaveChangePreview = {
  added: string[];
  modified: SaveModifiedObjectPreview[];
  deleted: string[];
  globalChanges: string[];
  hasChanges: boolean;
};

export function buildSaveChangePreview(store: SceneDirtyStore): SaveChangePreview {
  const added = store.getAddedObjects().slice().sort();
  const deleted = store.getDeletedObjects().slice().sort();
  const liveObjects = store.objects;

  const modified = store
    .getModifiedObjects()
    .map((folderName) => {
      const entry = liveObjects[folderName];
      if (!entry || entry.changeType !== "modified") return null;
      const fields = formatModifiedFields(entry.modifiedFields);
      if (fields.length === 0) return null;
      return { folderName, fields };
    })
    .filter((item): item is SaveModifiedObjectPreview => item !== null)
    .sort((a, b) => a.folderName.localeCompare(b.folderName));

  const globalChanges: string[] = [];
  if (store.global.graphicParams) {
    globalChanges.push("Graphic parameters (graphic_param.csv)");
  }
  if (store.global.placementOrder) {
    globalChanges.push("Object placement (placement.csv)");
  }

  const hasChanges =
    added.length > 0 ||
    modified.length > 0 ||
    deleted.length > 0 ||
    globalChanges.length > 0;

  return { added, modified, deleted, globalChanges, hasChanges };
}

function formatModifiedFields(fields: ModifiedFields): string[] {
  return (Object.keys(MODIFIED_FIELD_LABELS) as Array<keyof ModifiedFields>)
    .filter((key) => fields[key])
    .map((key) => MODIFIED_FIELD_LABELS[key]);
}

export function buildSavePipelineNotes(preview: SaveChangePreview): string[] {
  const notes = [
    "Restore shared textures into the stage textures/ folder",
    "Rebuild stage structure JSON from disk",
  ];
  if (preview.added.length > 0) {
    notes.push("Convert new imported DAE objects to SSBH model folders");
  }
  if (preview.deleted.length > 0) {
    notes.push("Permanently delete removed object folders from disk");
  }
  return notes;
}

export function buildSaveResultSummary(
  preview: SaveChangePreview,
  result: Pick<
    SaveFolderResult,
    "convertedCount" | "failedCount" | "failedNames" | "deletedCount" | "migratedTextures"
  >,
): string[] {
  const lines: string[] = [];

  if (preview.added.length > 0) {
    lines.push(
      `Added ${preview.added.length} object(s): ${preview.added.join(", ")}`,
    );
  }
  if (result.convertedCount > 0) {
    lines.push(`Converted ${result.convertedCount} imported DAE object(s) to SSBH`);
  }
  if (result.failedCount > 0) {
    lines.push(
      `Failed to convert ${result.failedCount} object(s): ${result.failedNames.join(", ")}`,
    );
  }

  for (const item of preview.modified) {
    lines.push(`Updated ${item.folderName}: ${item.fields.join(", ")}`);
  }

  if (preview.deleted.length > 0) {
    lines.push(
      `Deleted ${result.deletedCount} object folder(s): ${preview.deleted.join(", ")}`,
    );
  }

  for (const change of preview.globalChanges) {
    lines.push(`Wrote ${change}`);
  }

  if (result.migratedTextures > 0) {
    lines.push(`Collected ${result.migratedTextures} texture(s) into textures/`);
  }

  lines.push("Rebuilt stage structure JSON");

  if (lines.length === 1 && preview.hasChanges === false) {
    return ["No pending edits detected; refreshed stage files on disk"];
  }

  return lines;
}
